package dev.orbit.app

import dev.orbit.app.data.Activity
import dev.orbit.app.data.ActivityUpdate
import dev.orbit.app.data.Agent
import dev.orbit.app.data.Author
import dev.orbit.app.data.OrbitJson
import dev.orbit.app.data.TextReset
import dev.orbit.app.ui.components.ActivityLabel
import dev.orbit.app.ui.components.activityLabel
import dev.orbit.app.ui.components.activitySummary
import kotlinx.serialization.encodeToString
import dev.orbit.app.data.Delta
import dev.orbit.app.data.PairingLink
import dev.orbit.app.data.describeNetworkFailure
import dev.orbit.app.data.normalizeHubAddress
import dev.orbit.app.data.parsePairingLink
import java.net.ConnectException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import dev.orbit.app.ui.screens.canRetry
import dev.orbit.app.ui.screens.closeOpenMarkup
import dev.orbit.app.ui.screens.messageActions
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

    @Test
    fun `activity and text resets apply to the reply they name`() {
        val step = Activity(Activity.KIND_SEARCH, "ramen", done = false)
        val searching = base.reduce(RoomEvent.Progress(ActivityUpdate("m2", listOf(step))))!!
        assertEquals(listOf(step), searching.messages.last().activity)
        assertEquals("Hel", searching.messages.last().text)
        assertEquals("", searching.reduce(RoomEvent.Reset(TextReset("m2", "")))!!.messages.last().text)
        // A reply this phone hasn't seen yet means the room must reload.
        assertNull(base.reduce(RoomEvent.Progress(ActivityUpdate("m9", emptyList()))))
    }

    @Test
    fun `abilities, activity and sources survive the trip to and from the hub`() {
        val agent = OrbitJson.decodeFromString<Agent>(OrbitJson.encodeToString(Agent(name = "Nova", abilities = listOf(Agent.ABILITY_WEB))))
        assertEquals(listOf("web"), agent.abilities)
        assertEquals(emptyList<String>(), OrbitJson.decodeFromString<Agent>("""{"name":"Old"}""").abilities)
        val message = OrbitJson.decodeFromString<Message>(
            """{"id":"m1","text":"Hi","activity":[{"kind":"page","detail":"https://a.example/x","done":true,"failed":false}],""" +
                """"sources":[{"title":"A","url":"https://a.example/x"}],"later":"ignored"}""",
        )
        assertEquals("page", message.activity.single().kind)
        assertEquals("https://a.example/x", message.sources.single().url)
    }

    @Test
    fun `steps read as plain sentences`() {
        assertEquals(ActivityLabel("Searched", "ramen tokyo"), activityLabel(Activity(Activity.KIND_SEARCH, "ramen tokyo")))
        assertEquals(ActivityLabel("Searching", "ramen tokyo"), activityLabel(Activity(Activity.KIND_SEARCH, "ramen tokyo", done = false), live = true))
        assertEquals(ActivityLabel("Read", "tabelog.example"), activityLabel(Activity(Activity.KIND_PAGE, "https://www.tabelog.example/tokyo?q=1")))
        assertEquals(ActivityLabel("Couldn't open", "tabelog.example"), activityLabel(Activity(Activity.KIND_PAGE, "https://tabelog.example", failed = true)))
        assertEquals(ActivityLabel("Read", "japan.md"), activityLabel(Activity(Activity.KIND_FILE, "Notes/trips/japan.md")))
        assertEquals(ActivityLabel("Looked in", "your shared folders"), activityLabel(Activity(Activity.KIND_FOLDER, "")))
        assertEquals(ActivityLabel("Ran code", ""), activityLabel(Activity(Activity.KIND_CODE)))
        assertEquals("Searched the web 2 times, read a page and ran code", activitySummary(
            listOf(Activity("search"), Activity("page"), Activity("search"), Activity("code")),
        ))
        assertEquals("Read 3 files", activitySummary(List(3) { Activity("file") }))
    }

    @Test
    fun `a removed message disappears, and retry is offered only where it makes sense`() {
        assertEquals(listOf("m1"), base.reduce(RoomEvent.Removed("m2"))!!.messages.map { it.id })
        val nova = Agent(id = "a1", name = "Nova")
        val done = base.copy(messages = listOf(Message("m1", 1, Author("user"), "hi"), reply("Hello", Message.STATUS_DONE)))
        val last = done.messages.last()
        assertTrue(canRetry(last, done, listOf(nova)))
        assertTrue("not while the crew is busy", !canRetry(last, done.copy(run = RunState(active = true)), listOf(nova)))
        assertTrue("not once the agent has left the room", !canRetry(last, done, emptyList()))
        assertTrue("your own messages aren't retried", !canRetry(done.messages.first(), done, listOf(nova)))
        val failedEarlier = done.copy(messages = listOf(reply("", Message.STATUS_ERROR), Message("m3", 3, Author("user"), "and?")))
        assertTrue("a failed reply can be retried anywhere", canRetry(failedEarlier.messages.first(), failedEarlier, listOf(nova)))

        val labels = { m: Message, retry: Boolean -> messageActions(m, retry, {}, {}, {}).map { it.label } }
        assertEquals(listOf("Copy text", "Ask again", "Delete"), labels(last, true))
        assertEquals(listOf("Delete"), labels(reply("", Message.STATUS_ERROR), false))
        assertEquals("a reply still streaming can only be copied", listOf("Copy text"), labels(reply("Hel"), false))
    }
}
