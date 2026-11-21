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
import android.net.Uri
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import dev.orbit.app.data.canAttach
import dev.orbit.app.data.decodeImage
import dev.orbit.app.data.describe
import dev.orbit.app.data.SharedFile
import dev.orbit.app.data.prepare
import java.util.UUID
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
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
    /** Photos and files waiting in the composer. */
    val drafts: List<DraftAttachment> = emptyList(),
    /** True while drafts are uploading with a message. */
    val sending: Boolean = false,
)

/** A photo or file picked for the next message. [preview] is a small picture of a photo. */
data class DraftAttachment(val key: String, val uri: Uri, val name: String, val type: String, val preview: ImageBitmap? = null) {
    val isImage: Boolean get() = type.startsWith("image/")
}

/** At most this many photos and files go with one message. */
const val MAX_DRAFTS = 6

/** Applies one live event from the hub to the room's state. Returns null when the state must be reloaded. */
fun RoomUiState.reduce(event: RoomEvent): RoomUiState? = when (event) {
    RoomEvent.Connected -> this
    RoomEvent.Cleared -> copy(messages = emptyList())
    is RoomEvent.Removed -> copy(messages = messages.filterNot { it.id == event.id })
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
    is RoomEvent.Progress -> {
        val index = messages.indexOfFirst { it.id == event.update.id }
        if (index < 0) null else copy(messages = messages.toMutableList().also { it[index] = it[index].copy(activity = event.update.activity) })
    }
    is RoomEvent.Reset -> {
        val index = messages.indexOfFirst { it.id == event.reset.id }
        if (index < 0) null else copy(messages = messages.toMutableList().also { it[index] = it[index].copy(text = event.reset.text) })
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
                        if (event is RoomEvent.Run) repo.noteRun(roomId, event.state.active)
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
        repo.noteRun(roomId, snapshot.run.active)
        _state.update { it.copy(loaded = true, connected = true, messages = snapshot.messages, run = snapshot.run) }
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

    /** Sends a message with the drafts attached. They stay in the composer until it has gone. */
    /** Sends the draft, with any attachments; [replyTo] makes it a reply to that message. */
    fun send(text: String, replyTo: String? = null) {
        val drafts = _state.value.drafts
        if (_state.value.sending) return
        _state.update { it.copy(sending = drafts.isNotEmpty()) }
        viewModelScope.launch {
            val client = repo.client ?: return@launch
            val resolver = getApplication<Application>().contentResolver
            try {
                repo.noteSent()
                val ids = drafts.map { draft ->
                    val file = withContext(Dispatchers.IO) { prepare(resolver, draft.uri, draft.name to draft.type) }
                    client.upload(file.bytes, file.name, file.type).id
                }
                client.send(roomId, text, ids, replyTo)
                _state.update { s -> s.copy(drafts = s.drafts.filterNot { it in drafts }) }
            } catch (e: HubException) {
                _notices.tryEmit(e.message ?: "That didn't send.")
            } finally {
                _state.update { it.copy(sending = false) }
            }
        }
    }

    /** Adds picked photos and files to the next message. */
    fun attach(uris: List<Uri>) {
        if (uris.isEmpty()) return
        viewModelScope.launch {
            val resolver = getApplication<Application>().contentResolver
            val space = MAX_DRAFTS - _state.value.drafts.size
            val picked = withContext(Dispatchers.IO) {
                uris.take(space.coerceAtLeast(0)).map { uri ->
                    val (name, type) = describe(resolver, uri)
                    if (!canAttach(type)) return@map null
                    val preview = if (type!!.startsWith("image/")) decodeImage(resolver, uri, 240)?.asImageBitmap() else null
                    DraftAttachment(UUID.randomUUID().toString(), uri, name, type, preview)
                }
            }
            when {
                uris.size > space -> _notices.tryEmit("A message can carry up to $MAX_DRAFTS photos and files.")
                picked.any { it == null } -> _notices.tryEmit("Orbit can attach photos, PDFs and text files.")
            }
            _state.update { it.copy(drafts = it.drafts + picked.filterNotNull()) }
        }
    }

    /** Adds files shared into Orbit from another app, already copied into the app's own storage. */
    fun attachShared(files: List<SharedFile>) {
        if (files.isEmpty()) return
        viewModelScope.launch {
            val resolver = getApplication<Application>().contentResolver
            val drafts = withContext(Dispatchers.IO) {
                files.take(MAX_DRAFTS).map { file ->
                    val preview = if (file.type.startsWith("image/")) decodeImage(resolver, file.uri, 240)?.asImageBitmap() else null
                    DraftAttachment(UUID.randomUUID().toString(), file.uri, file.name, file.type, preview)
                }
            }
            _state.update { it.copy(drafts = (it.drafts + drafts).take(MAX_DRAFTS)) }
        }
    }

    fun detach(draft: DraftAttachment) {
        _state.update { it.copy(drafts = it.drafts.filterNot { d -> d.key == draft.key }) }
    }

    fun stop() = act { it.stop(roomId) }

    fun delete(message: Message) {
        // Gone at once; the hub's "removed" event confirms it, and a failure reloads the room.
        _state.update { it.copy(messages = it.messages.filterNot { m -> m.id == message.id }) }
        act { client ->
            try {
                client.deleteMessage(roomId, message.id)
            } catch (e: HubException) {
                load(client)
                throw e
            }
        }
    }

    fun retry(message: Message) = act { it.retry(roomId, message.id) }

    fun clear() = act { it.clear(roomId) }

    class Factory(private val roomId: String) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>, extras: CreationExtras): T =
            RoomViewModel(extras[ViewModelProvider.AndroidViewModelFactory.APPLICATION_KEY]!!, roomId) as T
    }
}
