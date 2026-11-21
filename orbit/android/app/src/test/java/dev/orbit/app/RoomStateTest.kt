package dev.orbit.app

import dev.orbit.app.data.Activity
import dev.orbit.app.data.ActivityUpdate
import dev.orbit.app.data.Agent
import dev.orbit.app.data.Author
import dev.orbit.app.data.OrbitJson
import dev.orbit.app.data.TextReset
import dev.orbit.app.data.Notice
import dev.orbit.app.notify.noticeText
import dev.orbit.app.ui.screens.describeDays
import dev.orbit.app.ui.components.Block
import dev.orbit.app.ui.components.parseMarkdown
import dev.orbit.app.ui.screens.nextRunLabel
import dev.orbit.app.data.SharedContent
import dev.orbit.app.data.SharedFile
import dev.orbit.app.data.sharedText
import dev.orbit.app.ui.screens.describeShared
import dev.orbit.app.data.canAttach
import dev.orbit.app.ui.components.fileSize
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
import dev.orbit.app.ui.screens.formatCost
import dev.orbit.app.ui.screens.formatTokens
import dev.orbit.app.ui.screens.messageActions
import dev.orbit.app.data.Message
import dev.orbit.app.data.RoomEvent
import dev.orbit.app.data.RunState
import dev.orbit.app.ui.RoomUiState
import dev.orbit.app.ui.reduce
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
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

    @Test
    fun `money and token counts read the way people say them`() {
        assertEquals("$0.00", formatCost(0.0))
        assertEquals("<$0.01", formatCost(0.004))
        assertEquals("$3.42", formatCost(3.4199))
        assertEquals("$1,240", formatCost(1240.4))
        assertEquals("842", formatTokens(842))
        assertEquals("1.3K", formatTokens(1_284))
        assertEquals("2K", formatTokens(2_000))
        assertEquals("182K", formatTokens(182_400))
        assertEquals("1.2M", formatTokens(1_240_000))
        assertEquals("12M", formatTokens(12_400_000))
    }

    @Test
    fun `attachments decode, and file sizes read plainly`() {
        val message = OrbitJson.decodeFromString<Message>(
            """{"id":"m1","text":"","attachments":[{"id":"f1","name":"menu.jpg","type":"image/jpeg","size":412000}]}""",
        )
        assertTrue(message.attachments.single().isImage)
        assertEquals("840 B", fileSize(840))
        assertEquals("402 KB", fileSize(412_000))
        assertEquals("2.4 MB", fileSize(2_480_000))
        assertTrue(canAttach("image/heic") && canAttach("application/pdf") && canAttach("text/markdown"))
        assertTrue(!canAttach("application/zip") && !canAttach(null))
    }

    @Test
    fun `shared text keeps a page's title with its link, and shares are described plainly`() {
        assertEquals("Best ramen in Tokyo\nhttps://example.com/ramen", sharedText("https://example.com/ramen", "Best ramen in Tokyo"))
        assertEquals("Look at this https://example.com", sharedText("Look at this https://example.com", "Example"))
        assertEquals("Just the subject", sharedText(null, "Just the subject"))
        assertEquals("Same", sharedText("Same", "Same"))
        assertEquals("", sharedText(null, null))
        val photo = SharedFile(android.net.Uri.EMPTY, "a.jpg", "image/jpeg")
        val pdf = SharedFile(android.net.Uri.EMPTY, "b.pdf", "application/pdf")
        assertEquals("a photo", describeShared(SharedContent("", listOf(photo))))
        assertEquals("2 photos and a PDF", describeShared(SharedContent("", listOf(photo, photo, pdf))))
        assertEquals("", describeShared(SharedContent("hi")))
    }

    @Test
    fun `memory steps read plainly, and notes survive the trip from the hub`() {
        assertEquals(ActivityLabel("Remembered", "Allergic to peanuts"), activityLabel(Activity(Activity.KIND_REMEMBER, "Allergic to peanuts")))
        assertEquals(ActivityLabel("Forgetting", "budget"), activityLabel(Activity(Activity.KIND_FORGET, "budget", done = false), live = true))
        assertEquals("Saved 2 notes and forgot a note", activitySummary(List(2) { Activity("remember") } + Activity("forget")))
        val agent = OrbitJson.decodeFromString<Agent>("""{"name":"Nova","memory":[{"id":"n1","text":"Lives in Leeds","source":"agent","createdAt":1}]}""")
        assertEquals("Lives in Leeds", agent.memory.single().text)
    }

    @Test
    fun `schedules read plainly`() {
        assertEquals("Every day", describeDays((0..6).toList()))
        assertEquals("Weekdays", describeDays(listOf(5, 4, 3, 2, 1)))
        assertEquals("Mon, Wed, Sun", describeDays(listOf(0, 3, 1)))
        val zone = java.time.ZoneId.of("Europe/London")
        val now = java.time.ZonedDateTime.of(2026, 11, 20, 9, 0, 0, 0, zone).toInstant().toEpochMilli()
        fun at(day: Int, hour: Int, minute: Int) = java.time.ZonedDateTime.of(2026, 11, day, hour, minute, 0, 0, zone).toInstant().toEpochMilli()
        assertEquals("Today at 18:30", nextRunLabel(at(20, 18, 30), now, zone))
        assertEquals("Tomorrow at 08:00", nextRunLabel(at(21, 8, 0), now, zone))
        assertTrue(nextRunLabel(at(23, 8, 0), now, zone)!!.endsWith(" at 08:00"))
        assertNull(nextRunLabel(null, now, zone))
        assertEquals("Nova: Three things moved.", noticeText(Notice(author = "Nova", text = "Three things moved.")))
        assertEquals("Sage couldn't reply: offline", noticeText(Notice(author = "Sage", text = "couldn't reply: offline")))
    }

    @Test
    fun `markdown blocks cover tables, code with its language, quotes, rules and nested lists`() {
        val blocks = parseMarkdown(SampleData.RICH)
        assertEquals(Block.Heading("Three ramen spots near the hotel", 2), blocks[0])
        val table = blocks[1] as Block.Table
        assertEquals(listOf("Place", "Walk", "Price", "Vegetarian"), table.header)
        assertEquals(listOf(-1, 1, 1, 0), table.align)
        assertEquals(listOf("T's Tantan", "4 min", "¥1,250", "Yes"), table.rows[2])
        assertTrue(blocks[2] is Block.Quote)
        assertEquals(listOf(0, 1, 0), blocks.filterIsInstance<Block.Item>().map { it.level })
        assertTrue(Block.Rule in blocks)
        assertEquals("python", (blocks.last() as Block.Code).language)
        // A table still arriving: the header shows as text until its dashes come in.
        assertTrue(parseMarkdown("| a | b |")[0] is Block.Paragraph)
        assertEquals(1, (parseMarkdown("| a | b |\n|---|---|\n| 1 |")[0] as Block.Table).rows.size)
        assertEquals(listOf(Block.Paragraph("a\n---b")), parseMarkdown("a\n---b"))
    }

    @Test
    fun `a finished agent reply can be replied to, but not your own message or one still arriving`() {
        val labels = { m: Message -> messageActions(m, false, {}, {}, {}, onReply = {}).map { it.label } }
        assertEquals(listOf("Reply", "Copy text", "Delete"), labels(reply("Hello", Message.STATUS_DONE)))
        assertEquals(listOf("Copy text"), labels(reply("Hel", Message.STATUS_STREAMING)))
        assertFalse("Reply" in labels(Message("u1", 1, Author("user", name = "You"), "Hi")))
    }
}
