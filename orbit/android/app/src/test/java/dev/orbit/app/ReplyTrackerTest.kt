package dev.orbit.app

import dev.orbit.app.data.ActiveRuns
import dev.orbit.app.data.HubEvent
import dev.orbit.app.data.Message
import dev.orbit.app.data.OrbitJson
import dev.orbit.app.data.Reply
import dev.orbit.app.data.RoomRun
import dev.orbit.app.notify.Finished
import dev.orbit.app.notify.ReplyTracker
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ReplyTrackerTest {
    private fun run(room: String, active: Boolean, agent: String? = null) = HubEvent.Run(RoomRun("id-$room", room, active, agent = agent))
    private fun reply(room: String, author: String, text: String, status: String = Message.STATUS_DONE, error: String? = null) =
        HubEvent.Replied(Reply("id-$room", room, author = author, text = text, status = status, error = error))

    @Test
    fun `a room going quiet becomes one notification with its last reply`() {
        val tracker = ReplyTracker()
        assertEquals(emptyList<Finished>(), tracker.onEvent(HubEvent.Running(ActiveRuns(listOf(RoomRun("id-Trip", "Trip", true, agent = "Nova"))))))
        assertEquals("Nova is replying in Trip", tracker.status())
        tracker.onEvent(reply("Trip", "Nova", "Fuunji is your best bet."))
        tracker.onEvent(run("Trip", true, "Sage"))
        tracker.onEvent(reply("Trip", "Sage", "Agreed, go early."))
        tracker.onEvent(run("Launch", true))
        assertEquals("Your crew is working in 2 rooms", tracker.status())

        assertEquals(listOf(Finished("id-Trip", "Trip", "Sage: Agreed, go early.", 2)), tracker.onEvent(run("Trip", false)))
        assertTrue(!tracker.idle)
        tracker.onEvent(reply("Launch", "Pixel", "", Message.STATUS_ERROR, "Ollama could not be reached."))
        assertEquals("Pixel couldn't reply: Ollama could not be reached.", tracker.onEvent(run("Launch", false)).single().text)
        assertTrue(tracker.idle)
    }

    @Test
    fun `nothing running means nothing to wait for, and a stopped run stays quiet`() {
        val tracker = ReplyTracker()
        tracker.onEvent(HubEvent.Running(ActiveRuns()))
        assertTrue(tracker.idle)
        tracker.onEvent(run("Trip", true))
        tracker.onEvent(reply("Trip", "Nova", "Half a tho", Message.STATUS_STOPPED))
        assertEquals(emptyList<Finished>(), tracker.onEvent(run("Trip", false)))
    }

    @Test
    fun `rooms that finished while the link was down are still announced`() {
        val tracker = ReplyTracker()
        tracker.onEvent(run("Trip", true, "Nova"))
        tracker.onEvent(reply("Trip", "Nova", "Done."))
        val finished = tracker.onEvent(HubEvent.Running(ActiveRuns()))
        assertEquals(listOf(Finished("id-Trip", "Trip", "Nova: Done.", 1)), finished)
        assertTrue(tracker.idle)
    }

    @Test
    fun `hub-wide events decode`() {
        val run = OrbitJson.decodeFromString<RoomRun>("""{"roomId":"r1","room":"Trip","active":true,"agentId":"a1","agent":"Nova"}""")
        assertEquals("Nova", run.agent)
        val reply = OrbitJson.decodeFromString<Reply>("""{"roomId":"r1","room":"Trip","id":"m1","author":"Sage","text":"","status":"error","error":"x"}""")
        assertEquals(Message.STATUS_ERROR, reply.status)
    }
}
