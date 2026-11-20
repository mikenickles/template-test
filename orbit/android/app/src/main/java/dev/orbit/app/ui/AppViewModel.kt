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
import dev.orbit.app.data.discoverHubs
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
) {
    fun agent(id: String?) = agents.firstOrNull { it.id == id }
    fun room(id: String?) = rooms.firstOrNull { it.id == id }
}

data class PairState(
    val busy: Boolean = false,
    val error: String? = null,
    val finding: Boolean = false,
    val found: List<FoundHub>? = null,
)

class AppViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = (app as OrbitApp).repository
    val session = repo.session

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

    fun unpair() {
        viewModelScope.launch { repo.unpair() }
    }

    fun saveAgent(agent: Agent, onSaved: () -> Unit) {
        viewModelScope.launch {
            if (hub { it.saveAgent(agent) } != null) {
                reload()
                onSaved()
            }
        }
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
