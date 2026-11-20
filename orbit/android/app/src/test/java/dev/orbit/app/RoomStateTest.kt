package dev.orbit.app

import dev.orbit.app.data.Author
import dev.orbit.app.data.Delta
import dev.orbit.app.data.PairingLink
import dev.orbit.app.data.describeNetworkFailure
import dev.orbit.app.data.normalizeHubAddress
import dev.orbit.app.data.parsePairingLink
import java.net.ConnectException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import dev.orbit.app.ui.screens.closeOpenMarkup
import dev.orbit.app.data.Message
import dev.orbit.app.data.RoomEvent
import dev.orbit.app.data.RunState
import dev.orbit.app.ui.RoomUiState
import dev.orbit.app.ui.reduce
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
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
        assertEquals("http://192.168.1.20:8787", normalizeHubAddress(" 192.168.1.20 "))
        assertEquals("http://my-pc:9000", normalizeHubAddress("my-pc:9000/"))
        assertEquals("https://hub.example.com", normalizeHubAddress("https://hub.example.com"))
        assertEquals("", normalizeHubAddress("  "))
    }

    @Test
    fun `pairing links from the hub's QR code are read, and anything else is ignored`() {
        assertEquals(
            PairingLink("192.168.86.49:8787", "309407", "BOOK-75OVAKFGO1"),
            parsePairingLink("orbit://pair?host=192.168.86.49%3A8787&code=309407&name=BOOK-75OVAKFGO1"),
        )
        assertEquals(PairingLink("my-pc:8787", "000123", null), parsePairingLink(" orbit://pair?code=000123&host=my-pc:8787 "))
        assertNull("not an Orbit link", parsePairingLink("https://example.com/?host=1.2.3.4&code=123456"))
        assertNull("code too short", parsePairingLink("orbit://pair?host=1.2.3.4:8787&code=12345"))
        assertNull("host with a path", parsePairingLink("orbit://pair?host=evil.com/steal@x&code=123456"))
        assertNull("host with a scheme", parsePairingLink("orbit://pair?host=http://1.2.3.4&code=123456"))
        assertNull(parsePairingLink("not a link at all"))
    }

    @Test
    fun `connection failures say what to check`() {
        assertTrue(describeNetworkFailure(SocketTimeoutException()).contains("Firewall"))
        assertTrue(describeNetworkFailure(ConnectException()).contains("hub is running"))
        assertTrue(describeNetworkFailure(UnknownHostException()).contains("can't be found"))
    }

    @Test
    fun `streaming text never shows half-typed markup`() {
        assertEquals("- **Email**", closeOpenMarkup("- **Email"))
        assertEquals("", closeOpenMarkup("- **"))
        assertEquals("a single `email`", closeOpenMarkup("a single `email"))
        assertEquals("a single ", closeOpenMarkup("a single `"))
        assertEquals("**done** and ", closeOpenMarkup("**done** and *"))
        assertEquals("```\ncode", closeOpenMarkup("```\ncode"))
        assertEquals("plain text", closeOpenMarkup("plain text"))
        assertEquals("Two risks:\n\n", closeOpenMarkup("Two risks:\n\n- "))
        assertEquals("Steps:\n", closeOpenMarkup("Steps:\n2. "))
    }
}
