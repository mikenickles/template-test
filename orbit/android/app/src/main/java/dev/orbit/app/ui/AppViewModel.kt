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
import dev.orbit.app.data.Provider
import dev.orbit.app.data.Room
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
) {
    fun agent(id: String?) = agents.firstOrNull { it.id == id }
    fun room(id: String?) = rooms.firstOrNull { it.id == id }
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
            _pair.update { it.copy(error = "That isn't an Orbit pairing code. Scan the QR code your hub shows.") }
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
                _notices.tryEmit("Orbit can send text, photos, PDFs and text files.")
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
