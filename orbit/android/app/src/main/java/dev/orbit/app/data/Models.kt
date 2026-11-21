package dev.orbit.app.data

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

val OrbitJson = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
    encodeDefaults = true
}

/** Which character an agent looks like: 1 to 25, the order of `Characters` in Avatar.kt. */
@Serializable
data class AvatarSpec(val character: Int = 1)

@Serializable
data class Agent(
    val id: String = "",
    val name: String = "",
    val role: String = "",
    val instructions: String = "",
    val provider: String = "",
    val model: String = "",
    val avatar: AvatarSpec = AvatarSpec(),
    /** What the agent can do beyond replying: [ABILITY_WEB], [ABILITY_CODE], [ABILITY_FILES], [ABILITY_MEMORY]. */
    val abilities: List<String> = emptyList(),
    /** Notes the agent carries into every room. Changed through their own calls, not by saving the agent. */
    val memory: List<MemoryNote> = emptyList(),
) {
    companion object {
        const val ABILITY_WEB = "web"
        const val ABILITY_CODE = "code"
        const val ABILITY_FILES = "files"
        const val ABILITY_MEMORY = "memory"
    }
}

/** One thing an agent remembers. [source] is "you" if added in the app, "agent" if it saved it itself. */
@Serializable
data class MemoryNote(val id: String = "", val text: String = "", val source: String = "you", val createdAt: Long = 0)

/** A version the hub is holding for an update, and what it is running now. */
@Serializable
data class UpdateInfo(val current: String = "", val available: String? = null, val size: Long = 0)

/** What is waiting in the hub's updates folder: a new hub for the PC, and a new app for phones. */
@Serializable
data class HubUpdates(val folder: String = "", val hub: UpdateInfo = UpdateInfo(), val app: UpdateInfo = UpdateInfo())

/** What the whole crew knows about the user: what to call them, and notes from them or their agents. */
@Serializable
data class Profile(val name: String = "", val notes: List<MemoryNote> = emptyList())

/** The room the intro created, and who is in it. */
@Serializable
data class CrewMade(val roomId: String = "", val name: String = "", val agentIds: List<String> = emptyList())

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
    /** The agent replying right now, if any. */
    val speaking: String? = null,
    val preview: Preview? = null,
    /** The getting-to-know-you chat, where one agent learns about the user and builds their crew. */
    val intro: Boolean = false,
    /** What the room is for, and rules every agent in it follows. */
    val description: String = "",
) {
    companion object {
        /** Best fit: only the agents suited to each message answer it. */
        const val MODE_AUTO = "auto"
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

/**
 * One thing an agent did while replying. [kind] is one of the KIND_ constants; [detail] is the search,
 * page address, or file path it used.
 */
@Serializable
data class Activity(
    val kind: String = "",
    val detail: String = "",
    val done: Boolean = true,
    val failed: Boolean = false,
) {
    companion object {
        const val KIND_SEARCH = "search"
        const val KIND_PAGE = "page"
        const val KIND_CODE = "code"
        const val KIND_FOLDER = "folder"
        const val KIND_FILE = "file"
        const val KIND_FIND = "find"
        const val KIND_REMEMBER = "remember"
        const val KIND_FORGET = "forget"
    }
}

/** A photo or file attached to a message. [type] is its media type, like "image/jpeg". */
@Serializable
data class Attachment(val id: String = "", val name: String = "", val type: String = "", val size: Long = 0) {
    val isImage: Boolean get() = type.startsWith("image/")
}

/** Which schedule posted a message, and how it reads: "Every day at 08:00". */
@Serializable
data class ScheduledBy(val id: String = "", val label: String = "")

/**
 * A message the hub posts into a room at a set time on chosen days, by the PC's clock. [days] run from
 * 0 (Sunday) to 6 (Saturday); [time] is "HH:MM".
 */
@Serializable
data class Schedule(
    val id: String = "",
    val roomId: String = "",
    val text: String = "",
    val time: String = "08:00",
    val days: List<Int> = listOf(1, 2, 3, 4, 5),
    val enabled: Boolean = true,
    val lastRunAt: Long? = null,
    val nextRunAt: Long? = null,
)

/** A scheduled run's result, kept on the hub for a phone that was asleep. */
@Serializable
data class Notice(
    val id: String = "",
    val at: Long = 0,
    val roomId: String = "",
    val room: String = "",
    val author: String = "",
    val text: String = "",
    val replies: Int = 0,
)

@Serializable
data class Notices(val notices: List<Notice> = emptyList(), val now: Long = 0)

/** A web page a reply cites. */
@Serializable
data class Source(val title: String = "", val url: String = "")

@Serializable
data class Message(
    val id: String,
    val seq: Long = 0,
    val author: Author = Author(),
    val text: String = "",
    val status: String = STATUS_DONE,
    val error: String? = null,
    val createdAt: Long = 0,
    val activity: List<Activity> = emptyList(),
    val sources: List<Source> = emptyList(),
    val attachments: List<Attachment> = emptyList(),
    /** Set when the hub posted this message on a schedule. */
    val scheduled: ScheduledBy? = null,
    /** Set on the intro reply that created the user's crew: the room it made. */
    val crew: CrewMade? = null,
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
    /** Whether this provider needs an API key (local and demo providers don't). */
    val takesKey: Boolean = false,
    /** Where to get a key. */
    val keyUrl: String? = null,
    /** "app" if the key was added from a phone, "environment" if it comes from the PC's settings. */
    val keySource: String? = null,
    /** The end of the saved key, e.g. "…1a2b", so you can tell keys apart. */
    val keyHint: String? = null,
    /** Whether agents on this provider can use abilities (web, code, files). */
    val abilities: Boolean = false,
    /** A runtime on the PC itself (Ollama), with no key. Its [models] are the ones downloaded there. */
    val local: Boolean = false,
    /** For a local runtime: whether it answered the hub just now. */
    val running: Boolean? = null,
    /** Where to install the local runtime from, on the PC. */
    val installUrl: String? = null,
    /** Small models worth downloading, for a runtime that can fetch its own. */
    val suggestions: List<ModelSuggestion> = emptyList(),
    /** A model download in progress, or one that failed. */
    val download: ModelDownload? = null,
)

@Serializable
data class ModelSuggestion(val model: String, val label: String = model, val size: String = "", val note: String = "")

@Serializable
data class ModelDownload(val model: String, val status: String = "", val percent: Int = 0, val error: String? = null)

/** A folder on the PC that agents with [Agent.ABILITY_FILES] may read. Shared from the PC, never from the phone. */
@Serializable
data class SharedFolder(val id: String = "", val name: String = "", val path: String = "")

@Serializable
data class HubInfo(
    val name: String = "",
    val version: String = "",
    /** Where the hub answers on its home network. */
    val addresses: List<String> = emptyList(),
    /** Where it answers from anywhere, through a private VPN like Tailscale. Empty until one is set up. */
    val remote: List<String> = emptyList(),
)

@Serializable
data class HubState(
    val hub: HubInfo = HubInfo(),
    val agents: List<Agent> = emptyList(),
    val rooms: List<Room> = emptyList(),
    val providers: List<Provider> = emptyList(),
    val folders: List<SharedFolder> = emptyList(),
    val schedules: List<Schedule> = emptyList(),
    val profile: Profile = Profile(),
    val updates: HubUpdates = HubUpdates(),
)

/** Whether agents are replying in a room right now, and who has the floor. */
@Serializable
data class RunState(val active: Boolean = false, val agentId: String? = null)

@Serializable
data class RoomMessages(val messages: List<Message> = emptyList(), val run: RunState = RunState())

/** A streamed chunk of a reply. `at` is the text length the chunk appends to. */
@Serializable
data class Delta(val id: String, val at: Int, val text: String)

/** A reply's tool use so far, sent while it streams. */
@Serializable
data class ActivityUpdate(val id: String, val activity: List<Activity> = emptyList())

@Serializable
data class Removed(val id: String)

/** A reply's text replaced while it streams, when the hub had to run a step again. */
@Serializable
data class TextReset(val id: String, val text: String = "")

@Serializable
data class PairResult(val token: String, val hub: HubInfo = HubInfo())

sealed interface RoomEvent {
    data object Connected : RoomEvent
    data class Upsert(val message: Message) : RoomEvent
    data class Chunk(val delta: Delta) : RoomEvent
    data class Progress(val update: ActivityUpdate) : RoomEvent
    data class Reset(val reset: TextReset) : RoomEvent
    data class Removed(val id: String) : RoomEvent
    data class Run(val state: RunState) : RoomEvent
    data object Cleared : RoomEvent
}

/** A room whose agents are replying, as the hub-wide stream reports it. */
@Serializable
data class RoomRun(
    val roomId: String,
    val room: String = "",
    val active: Boolean = false,
    val agentId: String? = null,
    /** The name of the agent replying now. */
    val agent: String? = null,
)

@Serializable
data class ActiveRuns(val rooms: List<RoomRun> = emptyList())

/** A reply that has finished (or failed), in short. */
@Serializable
data class Reply(
    val roomId: String,
    val room: String = "",
    val id: String = "",
    val author: String = "",
    val text: String = "",
    val status: String = Message.STATUS_DONE,
    val error: String? = null,
)

/** What the hub-wide stream says: who is working where, and each reply as it lands. */
sealed interface HubEvent {
    data class Running(val runs: ActiveRuns) : HubEvent
    data class Run(val run: RoomRun) : HubEvent
    data class Replied(val reply: Reply) : HubEvent
}

/** Tokens and estimated cost for one agent, one room, or everything. */
@Serializable
data class UsageTotals(
    val agentId: String? = null,
    val roomId: String? = null,
    val name: String = "",
    val input: Long = 0,
    val output: Long = 0,
    val cacheRead: Long = 0,
    val cacheWrite: Long = 0,
    val searches: Int = 0,
    val requests: Int = 0,
    /** Dollars, estimated from published token prices. Covers only what has a known price. */
    val cost: Double = 0.0,
    /** False when some of it ran on a model without a known price, so [cost] leaves that part out. */
    val priced: Boolean = true,
    /** True when some token counts were estimated because the provider didn't report them. */
    val estimated: Boolean = false,
) {
    val tokens: Long get() = input + output + cacheRead + cacheWrite
}

@Serializable
data class UsageSummary(
    val days: Int = 30,
    val since: String = "",
    val total: UsageTotals = UsageTotals(),
    val agents: List<UsageTotals> = emptyList(),
    val rooms: List<UsageTotals> = emptyList(),
)
