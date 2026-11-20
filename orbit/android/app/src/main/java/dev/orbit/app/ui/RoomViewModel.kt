package dev.orbit.app.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.CreationExtras
import dev.orbit.app.OrbitApp
import dev.orbit.app.data.HubClient
import dev.orbit.app.data.HubException
import dev.orbit.app.data.Message
import dev.orbit.app.data.RoomEvent
import dev.orbit.app.data.RunState
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

data class RoomUiState(
    val loaded: Boolean = false,
    val connected: Boolean = false,
    val messages: List<Message> = emptyList(),
    val run: RunState = RunState(),
)

/** Applies one live event from the hub to the room's state. Returns null when the state must be reloaded. */
fun RoomUiState.reduce(event: RoomEvent): RoomUiState? = when (event) {
    RoomEvent.Connected -> this
    RoomEvent.Cleared -> copy(messages = emptyList())
    is RoomEvent.Run -> copy(run = event.state)
    is RoomEvent.Upsert -> {
        val incoming = event.message
        val index = messages.indexOfFirst { it.id == incoming.id }
        when {
            index < 0 -> copy(messages = (messages + incoming).sortedBy { it.seq })
            // An older "still streaming" snapshot must not undo text we already have.
            incoming.status == Message.STATUS_STREAMING && incoming.text.length < messages[index].text.length -> this
            else -> copy(messages = messages.toMutableList().also { it[index] = incoming })
        }
    }
    is RoomEvent.Chunk -> {
        val delta = event.delta
        val index = messages.indexOfFirst { it.id == delta.id }
        val current = messages.getOrNull(index)
        when {
            current == null || delta.at > current.text.length -> null // missed something
            delta.at < current.text.length -> this // already have it
            else -> copy(messages = messages.toMutableList().also { it[index] = current.copy(text = current.text + delta.text) })
        }
    }
}

class RoomViewModel(app: Application, private val roomId: String) : AndroidViewModel(app) {
    private val repo = (app as OrbitApp).repository

    private val _state = MutableStateFlow(RoomUiState())
    val state: StateFlow<RoomUiState> = _state.asStateFlow()

    private val _notices = MutableSharedFlow<String>(extraBufferCapacity = 4)
    val notices = _notices.asSharedFlow()

    init {
        viewModelScope.launch {
            // Stay subscribed for as long as the room is open, reconnecting when the link drops.
            while (isActive) {
                val client = repo.client ?: break
                try {
                    client.events(roomId).collect { event ->
                        if (event == RoomEvent.Connected) {
                            load(client)
                        } else {
                            val next = _state.value.reduce(event)
                            if (next == null) load(client) else _state.value = next
                        }
                    }
                } catch (e: CancellationException) {
                    throw e
                } catch (e: HubException) {
                    if (e.status == 401) repo.unpair(notifyHub = false)
                    if (e.status == 404) break
                } catch (e: Exception) {
                    // connection dropped; retry below
                }
                _state.update { it.copy(connected = false) }
                delay(2000)
            }
        }
    }

    private suspend fun load(client: HubClient) {
        val snapshot = client.messages(roomId)
        _state.value = RoomUiState(loaded = true, connected = true, messages = snapshot.messages, run = snapshot.run)
    }

    private fun act(block: suspend (HubClient) -> Unit) {
        viewModelScope.launch {
            val client = repo.client ?: return@launch
            try {
                block(client)
            } catch (e: HubException) {
                _notices.tryEmit(e.message ?: "Something went wrong.")
            }
        }
    }

    fun send(text: String) = act { it.send(roomId, text) }

    fun stop() = act { it.stop(roomId) }

    fun clear() = act { it.clear(roomId) }

    class Factory(private val roomId: String) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>, extras: CreationExtras): T =
            RoomViewModel(extras[ViewModelProvider.AndroidViewModelFactory.APPLICATION_KEY]!!, roomId) as T
    }
}
