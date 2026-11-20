package dev.orbit.app.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import java.io.IOException
import java.util.concurrent.TimeUnit

class HubException(message: String, val status: Int = 0) : Exception(message)

/** Talks to the Orbit hub running on the paired PC. */
class HubClient(val baseUrl: String, private val token: String? = null) {

    @Serializable
    private data class ErrorBody(val error: String = "")

    @Serializable
    private data class PairBody(val code: String, val deviceName: String)

    @Serializable
    private data class TextBody(val text: String)

    @Serializable
    private data class ModelsBody(val models: List<String> = emptyList())

    suspend fun info(): HubInfo = call("GET", "/api/hub")

    suspend fun pair(code: String, deviceName: String): PairResult =
        call("POST", "/api/pair", OrbitJson.encodeToString(PairBody(code, deviceName)))

    suspend fun state(): HubState = call("GET", "/api/state")

    suspend fun unpair() {
        call<Unit>("DELETE", "/api/device")
    }

    suspend fun models(providerId: String): List<String> =
        call<ModelsBody>("GET", "/api/providers/$providerId/models").models

    suspend fun saveAgent(agent: Agent): Agent {
        val body = OrbitJson.encodeToString(agent)
        return if (agent.id.isEmpty()) call("POST", "/api/agents", body) else call("PUT", "/api/agents/${agent.id}", body)
    }

    suspend fun deleteAgent(id: String) {
        call<Unit>("DELETE", "/api/agents/$id")
    }

    suspend fun saveRoom(room: Room): Room {
        val body = OrbitJson.encodeToString(room)
        return if (room.id.isEmpty()) call("POST", "/api/rooms", body) else call("PUT", "/api/rooms/${room.id}", body)
    }

    suspend fun deleteRoom(id: String) {
        call<Unit>("DELETE", "/api/rooms/$id")
    }

    suspend fun messages(roomId: String): RoomMessages = call("GET", "/api/rooms/$roomId/messages")

    suspend fun send(roomId: String, text: String): Message =
        call("POST", "/api/rooms/$roomId/messages", OrbitJson.encodeToString(TextBody(text)))

    suspend fun stop(roomId: String) {
        call<Unit>("POST", "/api/rooms/$roomId/stop", "{}")
    }

    suspend fun clear(roomId: String) {
        call<Unit>("DELETE", "/api/rooms/$roomId/messages")
    }

    /** Live updates for a room. Completes or fails when the connection drops; the caller reconnects. */
    fun events(roomId: String): Flow<RoomEvent> = callbackFlow {
        val call = streaming.newCall(request("/api/rooms/$roomId/events").build())
        launch(Dispatchers.IO) {
            try {
                call.execute().use { response ->
                    if (!response.isSuccessful) throw failure(response)
                    send(RoomEvent.Connected)
                    val source = response.body.source()
                    var event = ""
                    val data = StringBuilder()
                    while (true) {
                        val line = source.readUtf8Line() ?: break
                        when {
                            line.isEmpty() -> {
                                parseEvent(event, data.toString())?.let { send(it) }
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
        awaitClose { call.cancel() }
    }

    private fun parseEvent(event: String, data: String): RoomEvent? = runCatching {
        when (event) {
            "message" -> RoomEvent.Upsert(OrbitJson.decodeFromString<Message>(data))
            "delta" -> RoomEvent.Chunk(OrbitJson.decodeFromString<Delta>(data))
            "run" -> RoomEvent.Run(OrbitJson.decodeFromString<RunState>(data))
            "cleared" -> RoomEvent.Cleared
            else -> null
        }
    }.getOrNull()

    private fun request(path: String): Request.Builder {
        val builder = Request.Builder().url(baseUrl + path)
        if (token != null) builder.header("Authorization", "Bearer $token")
        return builder
    }

    private fun failure(response: Response): HubException {
        val raw = runCatching { response.body.string() }.getOrDefault("")
        val message = runCatching { OrbitJson.decodeFromString<ErrorBody>(raw).error }.getOrDefault("")
        return HubException(message.ifEmpty { "The hub answered with an error (${response.code})." }, response.code)
    }

    private suspend inline fun <reified T> call(method: String, path: String, json: String? = null): T =
        withContext(Dispatchers.IO) {
            val body = json?.toRequestBody(JSON_TYPE)
            val request = try {
                request(path).method(method, body).build()
            } catch (e: IllegalArgumentException) {
                throw HubException("That doesn't look like a valid hub address.")
            }
            try {
                http.newCall(request).execute().use { response ->
                    if (!response.isSuccessful) throw failure(response)
                    val raw = response.body.string()
                    if (T::class == Unit::class) Unit as T else OrbitJson.decodeFromString<T>(raw)
                }
            } catch (e: IOException) {
                throw HubException("Can't reach the hub. Check that your PC is on and you're on the same network.")
            } catch (e: kotlinx.serialization.SerializationException) {
                throw HubException("That address answered, but it isn't an Orbit hub.")
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
