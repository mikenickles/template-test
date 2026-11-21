package dev.orbit.app.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import dev.orbit.app.OrbitApp
import dev.orbit.app.data.Agent
import dev.orbit.app.data.FoundHub
import dev.orbit.app.data.HubClient
import dev.orbit.app.data.HubException
import dev.orbit.app.data.HubInfo
import dev.orbit.app.data.HubUpdates
import dev.orbit.app.data.Profile
import dev.orbit.app.data.ProactiveSettings
import dev.orbit.app.data.FollowUp
import dev.orbit.app.data.Watch
import dev.orbit.app.data.Nudge
import dev.orbit.app.data.GoogleStatus
import dev.orbit.app.data.BrowserStatus
import dev.orbit.app.data.isNewerVersion
import dev.orbit.app.update.ApkInstaller
import dev.orbit.app.data.Provider
import dev.orbit.app.data.Room
import dev.orbit.app.data.RoomContext
import dev.orbit.app.data.SearchResults
import dev.orbit.app.data.Schedule
import dev.orbit.app.notify.NoticeWorker
import dev.orbit.app.widget.WidgetSnapshot
import dev.orbit.app.widget.WidgetStore
import dev.orbit.app.widget.widgetSnapshot
import dev.orbit.app.data.SharedFolder
import android.net.Uri
import dev.orbit.app.data.SharedContent
import dev.orbit.app.data.UsageSummary
import dev.orbit.app.data.copyShared
import dev.orbit.app.data.sharedText
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import dev.orbit.app.data.discoverHubs
import dev.orbit.app.data.PairingLink
import dev.orbit.app.data.parsePairingLink
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

data class AppState(
    val loaded: Boolean = false,
    val refreshing: Boolean = false,
    /** The last attempt to reach the hub failed. */
    val offline: Boolean = false,
    val hub: HubInfo = HubInfo(),
    val agents: List<Agent> = emptyList(),
    val rooms: List<Room> = emptyList(),
    val providers: List<Provider> = emptyList(),
    val folders: List<SharedFolder> = emptyList(),
    val schedules: List<Schedule> = emptyList(),
    val profile: Profile = Profile(),
    val updates: HubUpdates = HubUpdates(),
    val proactive: ProactiveSettings = ProactiveSettings(),
    val followUps: List<FollowUp> = emptyList(),
    val watches: List<Watch> = emptyList(),
    /** What agents brought up on their own, newest last: Home's "From your crew". */
    val nudges: List<Nudge> = emptyList(),
    val google: GoogleStatus = GoogleStatus(),
    val browser: BrowserStatus = BrowserStatus(),
) {
    fun agent(id: String?) = agents.firstOrNull { it.id == id }

    /** The app version waiting on the PC, if it is newer than [installed]. Offered once the PC itself is current. */
    fun appUpdate(installed: String): String? =
        updates.app.available?.takeIf { updates.hub.available == null && isNewerVersion(it, installed) }

    /** A newer version waiting for the PC, installable from here. */
    val pcUpdate: String? get() = updates.hub.available

    /** Whether the hub has a Claude key, which the getting-to-know-you chat needs. */
    val canIntro: Boolean get() = providers.any { it.runsCode && it.configured }

    /** The getting-to-know-you chat, if it has been started. */
    val introRoom: Room? get() = rooms.firstOrNull { it.intro }
    fun room(id: String?) = rooms.firstOrNull { it.id == id }
}

/** Where an app update stands, shown on the update card. */
sealed interface UpdateStatus {
    data object Idle : UpdateStatus
    data class Downloading(val percent: Int) : UpdateStatus

    /** Android's "allow installing from Treehouse" screen is open; tapping Update again continues. */
    data object NeedsPermission : UpdateStatus
    data class Failed(val message: String) : UpdateStatus
}

data class PairState(
    val busy: Boolean = false,
    val error: String? = null,
    val finding: Boolean = false,
    val found: List<FoundHub>? = null,
    /** The address and code from a scanned QR code, shown in the fields while pairing. */
    val scanned: PairingLink? = null,
)

class AppViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = (app as OrbitApp).repository
    val session = repo.session

    /** The address the hub is being reached at: at home, or through Tailscale. */
    val via = repo.via

    private val _state = MutableStateFlow(AppState())
    val state: StateFlow<AppState> = _state.asStateFlow()

    private val _pair = MutableStateFlow(PairState())
    val pairState: StateFlow<PairState> = _pair.asStateFlow()

    /** Whether Home shows rooms as cards (a bento grid) rather than a list. Kept on this phone. */
    private val ui = app.getSharedPreferences("orbit-ui", android.content.Context.MODE_PRIVATE)
    private val _roomsAsCards = MutableStateFlow(ui.getBoolean(ROOMS_AS_CARDS, false))
    val roomsAsCards: StateFlow<Boolean> = _roomsAsCards.asStateFlow()

    fun showRoomsAsCards(cards: Boolean) {
        _roomsAsCards.value = cards
        ui.edit().putBoolean(ROOMS_AS_CARDS, cards).apply()
    }

    private val _notices = MutableSharedFlow<String>(extraBufferCapacity = 4)
    val notices = _notices.asSharedFlow()

    init {
        viewModelScope.launch {
            repo.session.collect { session ->
                _state.value = AppState()
                // Scheduled results reach the phone through a periodic check, while paired.
                if (session != null) NoticeWorker.schedule(getApplication()) else NoticeWorker.cancel(getApplication())
                if (session == null) WidgetStore.save(getApplication(), WidgetSnapshot())
                if (session != null) reload()
            }
        }
    }

    /** Runs [block] against the hub, turning failures into a notice. Returns null on failure. */
    private suspend fun <T> hub(quiet: Boolean = false, block: suspend (HubClient) -> T): T? {
        val client = repo.client ?: return null
        return try {
            block(client)
        } catch (e: HubException) {
            if (e.status == 401) repo.unpair(notifyHub = false)
            if (!quiet || e.status == 401) _notices.tryEmit(e.message ?: "Something went wrong.")
            null
        }
    }

    fun refresh() {
        viewModelScope.launch { reload() }
    }

    /** Reloads from the hub, then runs [onDone], e.g. to open a room the hub just created. */
    fun refreshThen(onDone: () -> Unit) {
        viewModelScope.launch {
            reload()
            onDone()
        }
    }

    private suspend fun reload() {
        _state.update { it.copy(refreshing = true) }
        val fresh = hub(quiet = true) { it.state() }
        fresh?.rooms?.forEach { repo.noteRun(it.id, it.active) }
        fresh?.hub?.let { repo.updateAddresses(it.addresses, it.remote) }
        fresh?.let { WidgetStore.save(getApplication(), widgetSnapshot(it)) }
        _state.update {
            if (fresh == null) {
                it.copy(refreshing = false, offline = true)
            } else {
                AppState(
                    loaded = true,
                    hub = fresh.hub,
                    agents = fresh.agents,
                    rooms = fresh.rooms.sortedByDescending { room -> room.updatedAt },
                    providers = fresh.providers,
                    folders = fresh.folders,
                    schedules = fresh.schedules,
                    profile = fresh.profile,
                    updates = fresh.updates,
                    proactive = fresh.proactive,
                    followUps = fresh.followups,
                    watches = fresh.watches,
                    nudges = fresh.nudges,
                    google = fresh.google,
                    browser = fresh.browser,
                )
            }
        }
    }

    fun findHubs() {
        viewModelScope.launch {
            _pair.update { it.copy(finding = true, error = null) }
            val found = discoverHubs()
            _pair.update { it.copy(finding = false, found = found) }
        }
    }

    fun pair(address: String, code: String) {
        viewModelScope.launch {
            _pair.update { it.copy(busy = true, error = null) }
            try {
                repo.pair(address, code)
                _pair.value = PairState()
            } catch (e: HubException) {
                _pair.update { it.copy(busy = false, error = e.message) }
            }
        }
    }

    /** Pairs from a scanned QR code or an orbit:// link opened from elsewhere. */
    fun pairWithLink(text: String) {
        val link = parsePairingLink(text)
        if (link == null) {
            _pair.update { it.copy(error = "That isn't a Treehouse pairing code. Scan the QR code your hub shows.") }
            return
        }
        val current = session.value
        if (current != null) {
            _notices.tryEmit("Already paired with ${current.hubName.ifEmpty { "a hub" }}. Unpair in Settings to switch hubs.")
            return
        }
        _pair.update { it.copy(scanned = link) }
        pair(link.host, link.code)
    }

    private val _usage = MutableStateFlow<UsageSummary?>(null)

    /** Spend and tokens for the period last asked for; null until loaded. */
    val usage: StateFlow<UsageSummary?> = _usage.asStateFlow()

    /** What a room's next reply sends; null if the hub couldn't be asked. */
    suspend fun roomContext(roomId: String): RoomContext? = hub(quiet = true) { it.roomContext(roomId) }

    fun setRoomContext(roomId: String, size: String, photos: Boolean, onDone: (RoomContext?) -> Unit) {
        viewModelScope.launch { onDone(hub { it.setRoomContext(roomId, size, photos) }) }
    }

    /** Summarizes a room now. [onDone] gets the new report, or the reason it couldn't. */
    fun compactRoom(roomId: String, onDone: (context: RoomContext?, error: String?) -> Unit) {
        viewModelScope.launch {
            val client = repo.client ?: return@launch onDone(null, "This phone isn't paired with a hub.")
            try {
                onDone(client.compactRoom(roomId), null)
            } catch (e: HubException) {
                onDone(null, e.message ?: "The room couldn't be summarized.")
            }
        }
    }

    /** Searches every room; null if the hub couldn't be asked. */
    suspend fun search(query: String, roomId: String? = null): SearchResults? = hub(quiet = true) { it.search(query, roomId) }

    fun loadUsage(days: Int = 30) {
        viewModelScope.launch { hub(quiet = true) { it.usage(days) }?.let { _usage.value = it } }
    }

    private val _share = MutableStateFlow<SharedContent?>(null)

    /** Something shared from another app, waiting for a room to go to. */
    val share: StateFlow<SharedContent?> = _share.asStateFlow()
    private var shareRoom: String? = null

    /** Takes in a share: text, and files copied into Orbit's storage so they stay readable. */
    fun receiveShare(text: String?, subject: String?, uris: List<Uri>) {
        viewModelScope.launch {
            val (files, skipped) = withContext(Dispatchers.IO) { copyShared(getApplication(), uris, MAX_DRAFTS) }
            val content = SharedContent(sharedText(text, subject), files, skipped)
            if (content.text.isBlank() && content.files.isEmpty()) {
                _notices.tryEmit("Treehouse can send text, photos, PDFs and text files.")
                return@launch
            }
            shareRoom = null
            _share.value = content
        }
    }

    /** The share is going to [roomId]. */
    fun routeShare(roomId: String) {
        shareRoom = roomId
    }

    /** The share, if it's meant for [roomId]. Handed over once. */
    fun claimShare(roomId: String): SharedContent? {
        if (shareRoom != roomId) return null
        val content = _share.value
        _share.value = null
        shareRoom = null
        return content
    }

    fun dropShare() {
        _share.value = null
        shareRoom = null
    }

    /** A room to open as soon as the app is showing, from a tapped notification. */
    private val _pendingRoom = MutableStateFlow<String?>(null)
    val pendingRoom: StateFlow<String?> = _pendingRoom.asStateFlow()

    fun openRoom(id: String) {
        _pendingRoom.value = id
    }

    fun roomOpened() {
        _pendingRoom.value = null
    }

    fun unpair() {
        viewModelScope.launch { repo.unpair() }
    }

    /**
     * Sends a key to the hub, which checks it with the provider before saving it.
     * Calls back with null once it's saved, or with what went wrong.
     */
    fun setKey(providerId: String, apiKey: String, onDone: (error: String?) -> Unit) {
        viewModelScope.launch {
            val client = repo.client ?: return@launch onDone("This phone isn't paired with a hub.")
            try {
                updateProvider(client.setKey(providerId, apiKey))
                onDone(null)
            } catch (e: HubException) {
                if (e.status == 401) repo.unpair(notifyHub = false)
                onDone(e.message ?: "The key couldn't be saved.")
            }
        }
    }

    /** The Orbit version installed on this phone. */
    val installedVersion: String = ApkInstaller.installedVersion(getApplication())

    private val _updateStatus = MutableStateFlow<UpdateStatus>(UpdateStatus.Idle)
    val updateStatus: StateFlow<UpdateStatus> = _updateStatus.asStateFlow()

    /** The version the PC is installing right now, while it restarts; null otherwise. */
    private val _pcUpdating = MutableStateFlow<String?>(null)
    val pcUpdating: StateFlow<String?> = _pcUpdating.asStateFlow()

    /** Installs the waiting update on the PC from here, then waits for the hub to come back on it. */
    fun updatePc() {
        val version = _state.value.updates.hub.available ?: return
        if (_pcUpdating.value != null) return
        viewModelScope.launch {
            _pcUpdating.value = version
            if (hub { it.updatePc() } == null) {
                _pcUpdating.value = null
                return@launch
            }
            // The hub restarts on the new files; give it up to two minutes.
            repeat(60) {
                delay(2000)
                val back = runCatching { repo.client?.state() }.getOrNull()
                if (back?.hub?.version == version) {
                    reload()
                    _pcUpdating.value = null
                    _notices.tryEmit("Your PC is on Treehouse $version.")
                    return@launch
                }
            }
            _pcUpdating.value = null
            _notices.tryEmit("Your PC hasn't come back yet. If Treehouse's window on the PC closed, start it again.")
        }
    }

    /** Asks the hub to look in Drive for a newer version now. */
    fun checkForUpdates() {
        viewModelScope.launch {
            hub { it.checkForUpdates() }?.let { found -> _state.update { it.copy(updates = found) } }
        }
    }

    /** Downloads the app update from the PC and opens Android's installer. */
    fun installUpdate() {
        if (_updateStatus.value is UpdateStatus.Downloading) return
        val app = getApplication<android.app.Application>()
        if (!ApkInstaller.canInstall(app)) {
            _updateStatus.value = UpdateStatus.NeedsPermission
            ApkInstaller.openPermissionSettings(app)
            return
        }
        viewModelScope.launch {
            val client = repo.client ?: return@launch
            val file = ApkInstaller.file(app)
            _updateStatus.value = UpdateStatus.Downloading(0)
            try {
                client.downloadApp(file) { _updateStatus.value = UpdateStatus.Downloading(it) }
                val problem = ApkInstaller.problem(app, file)
                if (problem != null) {
                    file.delete()
                    _updateStatus.value = UpdateStatus.Failed(problem)
                } else {
                    _updateStatus.value = UpdateStatus.Idle
                    ApkInstaller.install(app, file)
                }
            } catch (e: HubException) {
                file.delete()
                if (e.status == 401) repo.unpair(notifyHub = false)
                _updateStatus.value = UpdateStatus.Failed(e.message ?: "The update couldn't be downloaded.")
            }
        }
    }

    /** Opens the getting-to-know-you chat, starting it if needed. [onReady] gets its room id, or null. */
    fun startIntro(onReady: (roomId: String?, error: String?) -> Unit) {
        viewModelScope.launch {
            val client = repo.client ?: return@launch onReady(null, "This phone isn't paired with a hub.")
            try {
                val room = client.startIntro()
                _state.update { s -> s.copy(rooms = listOf(room) + s.rooms.filterNot { it.id == room.id }) }
                onReady(room.id, null)
            } catch (e: HubException) {
                if (e.status == 401) repo.unpair(notifyHub = false)
                onReady(null, e.message ?: "The chat couldn't start.")
            }
        }
    }

    fun addProfileNote(text: String, onDone: (Boolean) -> Unit) {
        viewModelScope.launch {
            val profile = hub { it.addProfileNote(text) }
            profile?.let { p -> _state.update { it.copy(profile = p) } }
            onDone(profile != null)
        }
    }

    fun removeProfileNote(id: String) {
        viewModelScope.launch { hub { it.removeProfileNote(id) }?.let { p -> _state.update { it.copy(profile = p) } } }
    }

    fun setProfileName(name: String) {
        viewModelScope.launch { hub { it.setProfileName(name) }?.let { p -> _state.update { it.copy(profile = p) } } }
    }

    /** Asks the PC's local runtime to download [model]. [onDone] gets an error to show, or null. */
    fun pullModel(providerId: String, model: String, onDone: (error: String?) -> Unit) {
        viewModelScope.launch {
            val client = repo.client ?: return@launch onDone("This phone isn't paired with a hub.")
            try {
                updateProvider(client.pullModel(providerId, model))
                onDone(null)
            } catch (e: HubException) {
                if (e.status == 401) repo.unpair(notifyHub = false)
                onDone(e.message ?: "The download couldn't start.")
            }
        }
    }

    fun clearDownload(providerId: String) {
        viewModelScope.launch { hub { it.clearDownload(providerId) }?.let(::updateProvider) }
    }

    fun removeKey(providerId: String, onDone: () -> Unit) {
        viewModelScope.launch {
            hub { it.removeKey(providerId) }?.let {
                updateProvider(it)
                onDone()
            }
        }
    }

    /** Stops sharing a folder with agents. */
    fun removeFolder(id: String) {
        viewModelScope.launch {
            hub { it.removeFolder(id) }?.let { folders -> _state.update { it.copy(folders = folders) } }
        }
    }

    private fun updateProvider(provider: Provider) {
        _state.update { s -> s.copy(providers = s.providers.map { if (it.id == provider.id) provider else it }) }
    }

    fun saveAgent(agent: Agent, onSaved: () -> Unit) {
        viewModelScope.launch {
            if (hub { it.saveAgent(agent) } != null) {
                reload()
                onSaved()
            }
        }
    }

    /** Adds a note to an agent's memory; [onDone] hears whether it worked. */
    fun addMemory(agentId: String, text: String, onDone: (added: Boolean) -> Unit = {}) {
        viewModelScope.launch {
            val agent = hub { it.addMemory(agentId, text) }
            agent?.let(::updateAgent)
            onDone(agent != null)
        }
    }

    fun removeMemory(agentId: String, noteId: String) {
        viewModelScope.launch { hub { it.removeMemory(agentId, noteId) }?.let(::updateAgent) }
    }

    private fun updateAgent(agent: Agent) {
        _state.update { s -> s.copy(agents = s.agents.map { if (it.id == agent.id) agent else it }) }
    }

    fun saveSchedule(schedule: Schedule, onSaved: () -> Unit) {
        viewModelScope.launch {
            hub { it.saveSchedule(schedule) }?.let { saved ->
                _state.update { s -> s.copy(schedules = s.schedules.filterNot { it.id == saved.id } + saved) }
                onSaved()
            }
        }
    }

    fun deleteSchedule(id: String, onDeleted: () -> Unit = {}) {
        viewModelScope.launch {
            if (hub { it.deleteSchedule(id) } != null) {
                _state.update { s -> s.copy(schedules = s.schedules.filterNot { it.id == id }) }
                onDeleted()
            }
        }
    }

    /** Saves quiet hours, the daily limit or the morning brief. Shows the change at once. */
    fun saveProactive(settings: ProactiveSettings) {
        val before = _state.value.proactive
        _state.update { it.copy(proactive = settings) }
        viewModelScope.launch {
            val saved = hub { it.saveProactive(settings) }
            _state.update { it.copy(proactive = saved ?: before) }
        }
    }

    /** The user's answer to a big browser action; [onDone] hears whether the hub took it. */
    fun decide(approvalId: String, allow: Boolean, onDone: (Boolean) -> Unit = {}) {
        viewModelScope.launch { onDone(hub { it.decide(approvalId, allow) } != null) }
    }

    fun renamePc(name: String) {
        viewModelScope.launch {
            hub { it.renamePc(name) }?.let { shown -> _state.update { s -> s.copy(hub = s.hub.copy(name = shown)) } }
        }
    }

    fun deleteFollowUp(id: String) {
        _state.update { s -> s.copy(followUps = s.followUps.filterNot { it.id == id }) }
        viewModelScope.launch { hub { it.deleteFollowUp(id) } }
    }

    fun deleteWatch(id: String) {
        _state.update { s -> s.copy(watches = s.watches.filterNot { it.id == id }) }
        viewModelScope.launch { hub { it.deleteWatch(id) } }
    }

    /** Opening a room is seeing what its agents brought up; the hub forgets those cards too. */
    fun nudgesSeen(roomId: String) {
        _state.update { s -> s.copy(nudges = s.nudges.filterNot { it.roomId == roomId }) }
    }

    /** Takes a card off Home. Opening its room does too, on the hub. */
    fun dismissNudge(id: String) {
        _state.update { s -> s.copy(nudges = s.nudges.filterNot { it.id == id }) }
        viewModelScope.launch { hub(quiet = true) { it.dismissNudge(id) } }
    }

    fun disconnectGoogle() {
        viewModelScope.launch { hub { it.disconnectGoogle() }?.let { g -> _state.update { it.copy(google = g) } } }
    }

    fun runSchedule(id: String, onStarted: () -> Unit) {
        viewModelScope.launch { if (hub { it.runSchedule(id) } != null) onStarted() }
    }

    fun deleteAgent(id: String, onDeleted: () -> Unit) {
        viewModelScope.launch {
            if (hub { it.deleteAgent(id) } != null) {
                reload()
                onDeleted()
            }
        }
    }

    fun saveRoom(room: Room, onSaved: (Room) -> Unit) {
        viewModelScope.launch {
            hub { it.saveRoom(room) }?.let { saved ->
                reload()
                onSaved(saved)
            }
        }
    }

    /** Sets up a room from a description. [onDone] gets the room, or an error to show. */
    fun planRoom(text: String, onDone: (room: Room?, error: String?) -> Unit) {
        viewModelScope.launch {
            val client = repo.client ?: return@launch onDone(null, "This phone isn't paired with a hub.")
            try {
                val room = client.planRoom(text)
                reload()
                onDone(room, null)
            } catch (e: HubException) {
                if (e.status == 401) repo.unpair(notifyHub = false)
                onDone(null, e.message ?: "The room couldn't be set up.")
            }
        }
    }

    fun deleteRoom(id: String, onDeleted: () -> Unit) {
        viewModelScope.launch {
            if (hub { it.deleteRoom(id) } != null) {
                reload()
                onDeleted()
            }
        }
    }

    /** Model ids the hub can see for a provider; empty if it can't be reached. */
    suspend fun models(providerId: String): List<String> = hub(quiet = true) { it.models(providerId) }.orEmpty()
}

private const val ROOMS_AS_CARDS = "rooms-as-cards"
