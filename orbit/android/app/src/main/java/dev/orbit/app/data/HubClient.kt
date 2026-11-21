package dev.orbit.app.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import okhttp3.Call
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import java.io.IOException
import java.net.URLEncoder
import java.io.File
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

class HubException(message: String, val status: Int = 0) : Exception(message)

/**
 * The ways to reach one hub, best first, and the one that answered last. Away from home the home
 * address goes quiet, so calls move on to the next one (a Tailscale address) and stay with it while it
 * keeps answering. [onSwitch] hears when that changes, so the choice survives a restart.
 */
class HubRoute(
    primary: String,
    alternates: List<String> = emptyList(),
    current: String? = null,
    private val onSwitch: (String) -> Unit = {},
) {
    val urls: List<String> = (listOf(primary) + alternates).filter { it.isNotEmpty() }.distinct()

    @Volatile
    var current: String = current?.takeIf { it in urls } ?: primary
        private set

    /** The address that worked last, then the others in order. */
    fun order(): List<String> = listOf(current) + urls.filter { it != current }

    fun worked(url: String) {
        if (url == current) return
        current = url
        onSwitch(url)
    }
}

/** Talks to the Orbit hub running on the paired PC. */
class HubClient(private val route: HubRoute, private val token: String? = null) {
    constructor(baseUrl: String, token: String? = null) : this(HubRoute(baseUrl), token)

    /** The address in use: the one that answered last. */
    val baseUrl: String get() = route.current

    @Serializable
    private data class ErrorBody(val error: String = "")

    @Serializable
    private data class PullBody(val model: String)

    @Serializable
    private data class TextOnly(val text: String)

    @Serializable
    private data class NameBody(val name: String)

    @Serializable
    private data class PairBody(val code: String, val deviceName: String)

    @Serializable
    private data class TextBody(val text: String, val attachments: List<String> = emptyList(), val replyTo: String? = null)

    @Serializable
    private data class ModelsBody(val models: List<String> = emptyList())

    @Serializable
    private data class KeyBody(val apiKey: String)

    @Serializable
    private data class FoldersBody(val folders: List<SharedFolder> = emptyList())

    suspend fun info(): HubInfo = call("GET", "/api/hub")

    suspend fun pair(code: String, deviceName: String): PairResult =
        call("POST", "/api/pair", OrbitJson.encodeToString(PairBody(code, deviceName)))

    suspend fun state(): HubState = call("GET", "/api/state")

    suspend fun unpair() {
        call<Unit>("DELETE", "/api/device")
    }

    suspend fun models(providerId: String): List<String> =
        call<ModelsBody>("GET", "/api/providers/$providerId/models").models

    /** Checks a key with the provider (on the PC) and saves it if it works. */
    suspend fun setKey(providerId: String, apiKey: String): Provider =
        call("PUT", "/api/providers/$providerId/key", OrbitJson.encodeToString(KeyBody(apiKey)))

    suspend fun removeKey(providerId: String): Provider = call("DELETE", "/api/providers/$providerId/key")

    /** Installs the hub update waiting on the PC; the hub restarts right after answering. */
    suspend fun updatePc() {
        call<Unit>("POST", "/api/updates/apply", "{}")
    }

    /** Has the hub look in the Drive feed for a newer version now. */
    suspend fun checkForUpdates(): HubUpdates = call("POST", "/api/updates/check", "{}")

    /** Starts (or reopens) the getting-to-know-you chat. Returns its room. */
    suspend fun startIntro(): Room = call("POST", "/api/intro", "{}")

    suspend fun addProfileNote(text: String): Profile = call("POST", "/api/profile/notes", OrbitJson.encodeToString(TextOnly(text)))

    suspend fun removeProfileNote(id: String): Profile = call("DELETE", "/api/profile/notes/$id")

    suspend fun setProfileName(name: String): Profile = call("PUT", "/api/profile", OrbitJson.encodeToString(NameBody(name)))

    /** Starts downloading [model] into a local runtime on the PC (Ollama). Progress shows on the provider. */
    suspend fun pullModel(providerId: String, model: String): Provider =
        call("POST", "/api/providers/$providerId/pull", OrbitJson.encodeToString(PullBody(model)))

    /** Clears a failed download from the provider. */
    suspend fun clearDownload(providerId: String): Provider = call("DELETE", "/api/providers/$providerId/pull")

    /** Stops sharing a folder with agents. Sharing one happens on the PC. Returns the folders still shared. */
    suspend fun removeFolder(id: String): List<SharedFolder> = call<FoldersBody>("DELETE", "/api/folders/$id").folders

    /** Tokens and estimated spend over the last [days] days, overall and per agent and room. */
    suspend fun usage(days: Int = 30): UsageSummary = call("GET", "/api/usage?days=$days")

    /** Rooms and messages with every word of [query], newest first. */
    suspend fun search(query: String, roomId: String? = null): SearchResults =
        call("GET", "/api/search?q=${java.net.URLEncoder.encode(query, "UTF-8")}${roomId?.let { "&room=" + java.net.URLEncoder.encode(it, "UTF-8") }.orEmpty()}")

    suspend fun saveAgent(agent: Agent): Agent {
        val body = OrbitJson.encodeToString(agent)
        return if (agent.id.isEmpty()) call("POST", "/api/agents", body) else call("PUT", "/api/agents/${agent.id}", body)
    }

    /** Adds a note to an agent's memory. Returns the agent with it. */
    suspend fun addMemory(agentId: String, text: String): Agent =
        call("POST", "/api/agents/$agentId/memory", OrbitJson.encodeToString(TextBody(text)))

    suspend fun removeMemory(agentId: String, noteId: String): Agent = call("DELETE", "/api/agents/$agentId/memory/$noteId")

    suspend fun saveSchedule(schedule: Schedule): Schedule {
        val body = OrbitJson.encodeToString(schedule)
        return if (schedule.id.isEmpty()) call("POST", "/api/schedules", body) else call("PUT", "/api/schedules/${schedule.id}", body)
    }

    suspend fun deleteSchedule(id: String) {
        call<Unit>("DELETE", "/api/schedules/$id")
    }

    /** Posts a schedule's message now, to try it out. */
    suspend fun runSchedule(id: String) {
        call<Unit>("POST", "/api/schedules/$id/run", "{}")
    }

    /** When proactive agents may speak, how often, and the morning brief. Returns what the hub saved. */
    suspend fun saveProactive(settings: ProactiveSettings): ProactiveSettings =
        call("PUT", "/api/proactive", OrbitJson.encodeToString(settings))

    /** Cancels a follow-up an agent booked. */
    suspend fun deleteFollowUp(id: String) {
        call<Unit>("DELETE", "/api/followups/$id")
    }

    /** Stops something an agent is watching. */
    suspend fun deleteWatch(id: String) {
        call<Unit>("DELETE", "/api/watches/$id")
    }

    /** Takes a "From your crew" card off Home. */
    suspend fun dismissNudge(id: String) {
        call<Unit>("DELETE", "/api/nudges/$id")
    }

    /** Signs the hub out of the user's Google account. Connecting happens on the PC. */
    suspend fun disconnectGoogle(): GoogleStatus = call("DELETE", "/api/google")

    /** Results of scheduled runs since [since] (milliseconds), and the hub's clock now. */
    suspend fun notices(since: Long): Notices = call("GET", "/api/notices?since=$since")

    suspend fun deleteAgent(id: String) {
        call<Unit>("DELETE", "/api/agents/$id")
    }

    suspend fun saveRoom(room: Room): Room {
        val body = OrbitJson.encodeToString(room)
        return if (room.id.isEmpty()) call("POST", "/api/rooms", body) else call("PUT", "/api/rooms/${room.id}", body)
    }

    /** "Describe it": the hub sets up a room from the user's own words, and returns it. */
    suspend fun planRoom(text: String): Room = call("POST", "/api/rooms/plan", OrbitJson.encodeToString(TextOnly(text)))

    suspend fun deleteRoom(id: String) {
        call<Unit>("DELETE", "/api/rooms/$id")
    }

    suspend fun messages(roomId: String): RoomMessages = call("GET", "/api/rooms/$roomId/messages")

    /** Sends a message; with [replyTo], as a reply to that message, which its agent answers. */
    suspend fun send(roomId: String, text: String, attachments: List<String> = emptyList(), replyTo: String? = null): Message =
        call("POST", "/api/rooms/$roomId/messages", OrbitJson.encodeToString(TextBody(text, attachments, replyTo)))

    /** Uploads a photo or file for a message. Send its id with the message to attach it. */
    suspend fun upload(bytes: ByteArray, name: String, type: String): Attachment {
        val raw = exchange("POST", "/api/files", bytes.toRequestBody(type.toMediaType()), mapOf("X-File-Name" to URLEncoder.encode(name, "UTF-8").replace("+", "%20")))
        return OrbitJson.decodeFromString(raw.decodeToString())
    }

    /**
     * Downloads the phone app the PC is holding into [into], reporting percent done. Uses the same
     * addresses and sign-in as everything else, so it works away from home too.
     */
    suspend fun downloadApp(into: File, onProgress: (Int) -> Unit) = withContext(Dispatchers.IO) {
        open("/api/updates/app", AtomicReference()).use { response ->
            if (!response.isSuccessful) throw failure(response)
            val total = response.body.contentLength()
            into.parentFile?.mkdirs()
            response.body.byteStream().use { input ->
                into.outputStream().use { output ->
                    val buffer = ByteArray(64 * 1024)
                    var done = 0L
                    var last = -1
                    while (true) {
                        val read = input.read(buffer)
                        if (read < 0) break
                        output.write(buffer, 0, read)
                        done += read
                        if (total > 0 && (done * 100 / total).toInt() != last) {
                            last = (done * 100 / total).toInt()
                            onProgress(last)
                        }
                    }
                    if (total > 0 && done != total) throw HubException("The download stopped early. Try again.")
                }
            }
        }
    }

    /** An attached file's bytes. */
    suspend fun file(id: String): ByteArray = exchange("GET", "/api/files/$id")

    suspend fun stop(roomId: String) {
        call<Unit>("POST", "/api/rooms/$roomId/stop", "{}")
    }

    suspend fun deleteMessage(roomId: String, messageId: String) {
        call<Unit>("DELETE", "/api/rooms/$roomId/messages/$messageId")
    }

    /** Has the agent behind a reply answer again, in place of that reply. */
    suspend fun retry(roomId: String, messageId: String) {
        call<Unit>("POST", "/api/rooms/$roomId/messages/$messageId/retry", "{}")
    }

    suspend fun clear(roomId: String) {
        call<Unit>("DELETE", "/api/rooms/$roomId/messages")
    }

    /** Live updates for a room. Completes or fails when the connection drops; the caller reconnects. */
    fun events(roomId: String): Flow<RoomEvent> = serverEvents("/api/rooms/$roomId/events", RoomEvent.Connected) { event, data ->
        when (event) {
            "message" -> RoomEvent.Upsert(OrbitJson.decodeFromString<Message>(data))
            "delta" -> RoomEvent.Chunk(OrbitJson.decodeFromString<Delta>(data))
            "activity" -> RoomEvent.Progress(OrbitJson.decodeFromString<ActivityUpdate>(data))
            "reset" -> RoomEvent.Reset(OrbitJson.decodeFromString<TextReset>(data))
            "run" -> RoomEvent.Run(OrbitJson.decodeFromString<RunState>(data))
            "removed" -> RoomEvent.Removed(OrbitJson.decodeFromString<Removed>(data).id)
            "cleared" -> RoomEvent.Cleared
            else -> null
        }
    }

    /** Every room at once: what is running now, then each change and finished reply. */
    fun watch(): Flow<HubEvent> = serverEvents("/api/events", null) { event, data ->
        when (event) {
            "runs" -> HubEvent.Running(OrbitJson.decodeFromString<ActiveRuns>(data))
            "run" -> HubEvent.Run(OrbitJson.decodeFromString<RoomRun>(data))
            "reply" -> HubEvent.Replied(OrbitJson.decodeFromString<Reply>(data))
            else -> null
        }
    }

    /**
     * A server-sent event stream, parsed with [parse] (null skips an event). Sends [connected] first,
     * if given, once the hub has answered.
     */
    private fun <T : Any> serverEvents(path: String, connected: T?, parse: (event: String, data: String) -> T?): Flow<T> = callbackFlow {
        val live = AtomicReference<Call?>(null)
        launch(Dispatchers.IO) {
            try {
                open(path, live).use { response ->
                    if (!response.isSuccessful) throw failure(response)
                    connected?.let { send(it) }
                    val source = response.body.source()
                    var event = ""
                    val data = StringBuilder()
                    while (true) {
                        val line = source.readUtf8Line() ?: break
                        when {
                            line.isEmpty() -> {
                                runCatching { parse(event, data.toString()) }.getOrNull()?.let { send(it) }
                                event = ""
                                data.clear()
                            }
                            line.startsWith("event:") -> event = line.substring(6).trim()
                            line.startsWith("data:") -> data.append(line.substring(5).trim())
                        }
                    }
                }
                close()
            } catch (e: Exception) {
                close(e)
            }
        }
        awaitClose { live.get()?.cancel() }
    }

    /** Opens a stream at the first address that answers. [live] holds the call, so it can be cancelled. */
    private fun open(path: String, live: AtomicReference<Call?>): Response {
        val urls = route.order()
        var failure: IOException? = null
        for (url in urls) {
            val call = streaming.newCall(request(url, path).build())
            live.set(call)
            try {
                return call.execute().also { route.worked(url) }
            } catch (e: IOException) {
                if (call.isCanceled()) throw e
                failure = e
            }
        }
        throw HubException(describeNetworkFailure(failure!!, away = urls.size > 1))
    }

    private fun request(url: String, path: String): Request.Builder {
        val builder = Request.Builder().url(url + path)
        if (token != null) builder.header("Authorization", "Bearer $token")
        return builder
    }

    private fun failure(response: Response): HubException {
        val raw = runCatching { response.body.string() }.getOrDefault("")
        val message = runCatching { OrbitJson.decodeFromString<ErrorBody>(raw).error }.getOrDefault("")
        return HubException(message.ifEmpty { "The hub answered with an error (${response.code})." }, response.code)
    }

    /**
     * One request, tried at each of the hub's addresses until one answers. A request that may have
     * reached the hub is never sent twice: only reads, or failures to connect at all, move on.
     * Returns the response body.
     */
    private suspend fun exchange(method: String, path: String, body: RequestBody? = null, headers: Map<String, String> = emptyMap()): ByteArray =
        withContext(Dispatchers.IO) {
            val urls = route.order()
            var failure: IOException? = null
            for ((index, url) in urls.withIndex()) {
                val request = try {
                    request(url, path).method(method, body).apply { headers.forEach { (k, v) -> header(k, v) } }.build()
                } catch (e: IllegalArgumentException) {
                    throw HubException("That doesn't look like a valid hub address.")
                }
                try {
                    return@withContext http.newCall(request).execute().use { response ->
                        route.worked(url)
                        if (!response.isSuccessful) throw failure(response)
                        response.body.bytes()
                    }
                } catch (e: IOException) {
                    failure = e
                    if (index == urls.lastIndex || !(method == "GET" || neverArrived(e))) break
                }
            }
            throw HubException(describeNetworkFailure(failure!!, away = urls.size > 1))
        }

    private suspend inline fun <reified T> call(method: String, path: String, json: String? = null): T {
        val raw = exchange(method, path, json?.toRequestBody(JSON_TYPE))
        if (T::class == Unit::class) return Unit as T
        return try {
            OrbitJson.decodeFromString<T>(raw.decodeToString())
        } catch (e: kotlinx.serialization.SerializationException) {
            throw HubException("That address answered, but it isn't a Treehouse hub.")
        }
    }

    companion object {
        const val DEFAULT_PORT = 8787
        private val JSON_TYPE = "application/json".toMediaType()

        private val http = OkHttpClient.Builder()
            .connectTimeout(6, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .build()

        // The hub sends a keep-alive every 20s, so a longer silence means the link is dead.
        private val streaming = http.newBuilder().readTimeout(45, TimeUnit.SECONDS).build()
    }
}

/** Turns what a person types ("192.168.1.20", "my-pc:8787") into a hub base URL. */
fun normalizeHubAddress(input: String): String {
    var address = input.trim().trimEnd('/')
    if (address.isEmpty()) return ""
    if (!address.startsWith("http://") && !address.startsWith("https://")) address = "http://$address"
    val hostPart = address.substringAfter("://")
    if (!hostPart.contains(':') && address.startsWith("http://")) address += ":${HubClient.DEFAULT_PORT}"
    return address
}

/**
 * Says why the hub couldn't be reached, in terms of what to do about it. Silence (a timeout) usually
 * means Windows Firewall or a different Wi-Fi; a refusal means nothing is running at that address.
 */
fun describeNetworkFailure(e: IOException, away: Boolean = false): String = when {
    // With a Tailscale address to try as well, both ways in were quiet.
    away -> "Your PC didn't answer at home or through Tailscale. Check it's on with the hub running, and that Tailscale " +
        "is connected on this phone."
    else -> describeHomeFailure(e)
}

/** Whether a request failed before reaching the hub at all, so sending it elsewhere can't repeat it. */
internal fun neverArrived(e: IOException): Boolean = when (e) {
    is java.net.ConnectException, is java.net.NoRouteToHostException, is java.net.UnknownHostException -> true
    is java.net.SocketTimeoutException -> e.message.orEmpty().contains("connect", ignoreCase = true)
    else -> false
}

private fun describeHomeFailure(e: IOException): String = when (e) {
    is java.net.SocketTimeoutException, is java.net.NoRouteToHostException ->
        "Your PC didn't answer. Check your phone is on the same Wi-Fi as the PC, and that Windows Firewall allows Treehouse " +
            "(Start Orbit sets this up the first time)."
    is java.net.ConnectException ->
        "Nothing answered at that address. Check the hub is running on your PC and the address matches the one it shows."
    is java.net.UnknownHostException ->
        "That address can't be found. Type it exactly as the hub shows it, like 192.168.1.20:8787."
    else -> "Can't reach the hub. Check that your PC is on and you're on the same network."
}

