package dev.orbit.app.data

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

val OrbitJson = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
    encodeDefaults = true
}

/** How an agent's avatar is drawn: indices into the shapes, palette and eye styles in Avatar.kt. */
@Serializable
data class AvatarSpec(
    val shape: Int = 0,
    val color: Int = 0,
    val eyes: Int = 0,
)

@Serializable
data class Agent(
    val id: String = "",
    val name: String = "",
    val role: String = "",
    val instructions: String = "",
    val provider: String = "",
    val model: String = "",
    val avatar: AvatarSpec = AvatarSpec(),
)

@Serializable
data class Preview(val author: String = "", val text: String = "")

@Serializable
data class Room(
    val id: String = "",
    val name: String = "",
    val agentIds: List<String> = emptyList(),
    val mode: String = MODE_ROUNDTABLE,
    val leadId: String? = null,
    val updatedAt: Long = 0,
    val active: Boolean = false,
    val preview: Preview? = null,
) {
    companion object {
        const val MODE_ROUNDTABLE = "roundtable"
        const val MODE_LEAD = "lead"
    }
}

@Serializable
data class Author(
    val type: String = "user",
    val agentId: String? = null,
    val name: String = "",
    val model: String? = null,
)

@Serializable
data class Message(
    val id: String,
    val seq: Long = 0,
    val author: Author = Author(),
    val text: String = "",
    val status: String = STATUS_DONE,
    val error: String? = null,
    val createdAt: Long = 0,
) {
    val fromUser get() = author.type == "user"

    companion object {
        const val STATUS_STREAMING = "streaming"
        const val STATUS_DONE = "done"
        const val STATUS_ERROR = "error"
        const val STATUS_STOPPED = "stopped"
    }
}

@Serializable
data class Provider(
    val id: String,
    val label: String = id,
    val configured: Boolean = false,
    val models: List<String> = emptyList(),
)

@Serializable
data class HubInfo(val name: String = "", val version: String = "")

@Serializable
data class HubState(
    val hub: HubInfo = HubInfo(),
    val agents: List<Agent> = emptyList(),
    val rooms: List<Room> = emptyList(),
    val providers: List<Provider> = emptyList(),
)

/** Whether agents are replying in a room right now, and who has the floor. */
@Serializable
data class RunState(val active: Boolean = false, val agentId: String? = null)

@Serializable
data class RoomMessages(val messages: List<Message> = emptyList(), val run: RunState = RunState())

/** A streamed chunk of a reply. `at` is the text length the chunk appends to. */
@Serializable
data class Delta(val id: String, val at: Int, val text: String)

@Serializable
data class PairResult(val token: String, val hub: HubInfo = HubInfo())

sealed interface RoomEvent {
    data object Connected : RoomEvent
    data class Upsert(val message: Message) : RoomEvent
    data class Chunk(val delta: Delta) : RoomEvent
    data class Run(val state: RunState) : RoomEvent
    data object Cleared : RoomEvent
}
