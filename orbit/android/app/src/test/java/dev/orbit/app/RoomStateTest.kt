package dev.orbit.app

import dev.orbit.app.data.Author
import dev.orbit.app.data.Delta
import dev.orbit.app.data.HubClient
import dev.orbit.app.data.Message
import dev.orbit.app.data.RoomEvent
import dev.orbit.app.data.RunState
import dev.orbit.app.ui.RoomUiState
import dev.orbit.app.ui.reduce
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Test

class RoomStateTest {
    private fun reply(text: String, status: String = Message.STATUS_STREAMING) =
        Message("m2", 2, Author("agent", "a1", "Nova"), text, status)

    private val base = RoomUiState(
        loaded = true,
        messages = listOf(Message("m1", 1, Author("user"), "hi"), reply("Hel")),
    )

    @Test
    fun `chunks append in order`() {
        val next = base.reduce(RoomEvent.Chunk(Delta("m2", 3, "lo")))!!
        assertEquals("Hello", next.messages.last().text)
    }

    @Test
    fun `a chunk already covered by the loaded snapshot is ignored`() {
        assertSame(base, base.reduce(RoomEvent.Chunk(Delta("m2", 0, "Hel"))))
    }

    @Test
    fun `a gap or an unknown message asks for a reload`() {
        assertNull(base.reduce(RoomEvent.Chunk(Delta("m2", 9, "!"))))
        assertNull(base.reduce(RoomEvent.Chunk(Delta("m9", 0, "x"))))
    }

    @Test
    fun `a stale streaming snapshot does not erase text`() {
        assertSame(base, base.reduce(RoomEvent.Upsert(reply(""))))
    }

    @Test
    fun `the final message replaces the streamed one and new ones sort by seq`() {
        val done = base.reduce(RoomEvent.Upsert(reply("Hello there", Message.STATUS_DONE)))!!
        assertEquals("Hello there", done.messages.last().text)

        val late = Message("m0", 0, Author("user"), "earlier")
        assertEquals(listOf("m0", "m1", "m2"), done.reduce(RoomEvent.Upsert(late))!!.messages.map { it.id })
    }

    @Test
    fun `run and clear events`() {
        assertEquals(RunState(true, "a1"), base.reduce(RoomEvent.Run(RunState(true, "a1")))!!.run)
        assertEquals(emptyList<Message>(), base.reduce(RoomEvent.Cleared)!!.messages)
    }

    @Test
    fun `hub addresses are normalized`() {
        assertEquals("http://192.168.1.20:8787", HubClient.normalizeAddress(" 192.168.1.20 "))
        assertEquals("http://my-pc:9000", HubClient.normalizeAddress("my-pc:9000/"))
        assertEquals("https://hub.example.com", HubClient.normalizeAddress("https://hub.example.com"))
        assertEquals("", HubClient.normalizeAddress("  "))
    }
}
