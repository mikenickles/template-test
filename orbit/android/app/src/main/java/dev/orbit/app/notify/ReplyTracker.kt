package dev.orbit.app.notify

import dev.orbit.app.data.HubEvent
import dev.orbit.app.data.Message
import dev.orbit.app.data.Reply
import dev.orbit.app.data.RoomRun

/** A room whose agents have finished, worth a notification. [count] is how many replies landed. */
data class Finished(val roomId: String, val title: String, val text: String, val count: Int, val lines: List<NotifyLine> = emptyList())

/**
 * Follows the hub-wide stream while the app is away: which rooms are working, and what landed in each.
 * When a room goes quiet, its replies become one notification.
 */
class ReplyTracker {
    private val working = linkedMapOf<String, RoomRun>()
    private val replies = mutableMapOf<String, MutableList<Reply>>()

    val idle: Boolean get() = working.isEmpty()

    /** What the ongoing "working" notification says. */
    fun status(): String = when (working.size) {
        0 -> "Your crew is wrapping up"
        1 -> working.values.first().let { run ->
            if (run.agent.isNullOrBlank()) "Your crew is working in ${run.room}" else "${run.agent} is replying in ${run.room}"
        }
        else -> "Your crew is working in ${working.size} rooms"
    }

    /** Applies one event. Returns the rooms that just finished. */
    fun onEvent(event: HubEvent): List<Finished> = when (event) {
        is HubEvent.Running -> {
            // After a reconnect, rooms that stopped while the link was down have finished too.
            val now = event.runs.rooms.filter { it.active }.associateBy { it.roomId }
            val ended = working.values.filter { it.roomId !in now }
            working.clear()
            working.putAll(now)
            ended.mapNotNull(::finish)
        }
        is HubEvent.Run -> if (event.run.active) {
            working[event.run.roomId] = event.run
            emptyList()
        } else {
            val run = working.remove(event.run.roomId) ?: event.run
            listOfNotNull(finish(run))
        }
        is HubEvent.Replied -> {
            replies.getOrPut(event.reply.roomId) { mutableListOf() } += event.reply
            emptyList()
        }
    }

    private fun finish(run: RoomRun): Finished? {
        val landed = replies.remove(run.roomId).orEmpty()
        // Nothing to say about a run you stopped yourself.
        if (landed.isNotEmpty() && landed.all { it.status == Message.STATUS_STOPPED }) return null
        val said = landed.filter { it.status != Message.STATUS_STOPPED }
        val title = said.lastOrNull()?.room?.ifBlank { null } ?: run.room.ifBlank { "Treehouse" }
        val last = said.lastOrNull() ?: return Finished(run.roomId, title, "Your crew has replied.", 0)
        val text = when (last.status) {
            Message.STATUS_ERROR -> "${last.author} couldn't reply: ${last.error ?: "something went wrong on the hub."}"
            else -> "${last.author}: ${last.text}"
        }
        // Each reply as a line of the conversation, with its author's face.
        val lines = said.map { reply ->
            NotifyLine(
                reply.author.ifBlank { "Your crew" },
                if (reply.status == Message.STATUS_ERROR) "Couldn't reply: ${reply.error ?: "something went wrong on the hub."}" else reply.text,
                reply.character,
            )
        }
        return Finished(run.roomId, title, text, said.size, lines)
    }
}
