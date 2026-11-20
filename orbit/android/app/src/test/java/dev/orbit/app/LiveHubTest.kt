package dev.orbit.app

import dev.orbit.app.data.ActiveRuns
import dev.orbit.app.data.Agent
import dev.orbit.app.data.HubEvent
import dev.orbit.app.data.HubClient
import dev.orbit.app.data.HubException
import dev.orbit.app.data.Message
import dev.orbit.app.data.Room
import dev.orbit.app.data.RoomEvent
import dev.orbit.app.ui.RoomUiState
import dev.orbit.app.ui.reduce
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test

/**
 * Exercises the real client against a running hub. Skipped unless both are set:
 *   ORBIT_HUB_URL=http://localhost:8787 ORBIT_HUB_CODE=123456 ./gradlew :app:testDebugUnitTest
 */
class LiveHubTest {
    @Test
    fun `pair, build a room, and stream a reply`() = runBlocking {
        val url = System.getenv("ORBIT_HUB_URL").orEmpty()
        val code = System.getenv("ORBIT_HUB_CODE").orEmpty()
        assumeTrue("no live hub configured", url.isNotEmpty() && code.isNotEmpty())

        assertEquals(403, runCatching { HubClient(url).pair("x", "test") }.exceptionOrNull().let { (it as HubException).status })
        val client = HubClient(url, HubClient(url).pair(code, "JVM test").token)

        val state = client.state()
        assertTrue(state.providers.any { it.id == "demo" && it.configured })
        assertEquals(listOf("demo"), client.models("demo"))

        // A made-up key is checked with the provider and refused, so it's never saved.
        val anthropic = state.providers.first { it.id == "anthropic" }
        assertTrue(anthropic.takesKey && anthropic.keyUrl != null)
        val refused = runCatching { client.setKey("anthropic", "sk-ant-not-a-real-key") }.exceptionOrNull() as HubException
        assertTrue(refused.status == 400 || refused.status == 502)
        assertEquals(false, client.state().providers.first { it.id == "anthropic" }.keySource == "app")

        val agent = client.saveAgent(Agent(name = "Echo", role = "the tester", provider = "demo", model = "demo", abilities = listOf("web", "files")))
        val renamed = client.saveAgent(agent.copy(name = "Echo Two"))
        assertEquals(agent.id, renamed.id)
        assertEquals(listOf("web", "files"), renamed.abilities)
        // Notes are added and removed on their own; saving the agent leaves them alone.
        val noted = client.addMemory(agent.id, "Prefers short answers")
        assertEquals(listOf("Prefers short answers"), noted.memory.map { it.text })
        assertEquals(1, client.saveAgent(noted.copy(memory = emptyList())).memory.size)
        assertEquals(emptyList<Any>(), client.removeMemory(agent.id, noted.memory.single().id).memory)
        // Folders are shared on the PC; the phone sees them and can stop sharing one.
        assertEquals(client.state().folders, client.removeFolder("not-a-folder"))
        val room = client.saveRoom(Room(name = "Live test", agentIds = listOf(agent.id)))
        // The hub-wide stream opens with what is running now: nothing yet.
        assertEquals(HubEvent.Running(ActiveRuns()), withTimeout(5_000) { client.watch().first() })

        // Mirror what RoomViewModel does: subscribe, load, then fold events into state.
        var ui = RoomUiState()
        val finished = withTimeout(20_000) {
            client.events(room.id).onEach { event ->
                if (event == RoomEvent.Connected) {
                    ui = RoomUiState(loaded = true, messages = client.messages(room.id).messages)
                    client.send(room.id, "hello from the test")
                } else {
                    ui = ui.reduce(event) ?: RoomUiState(loaded = true, messages = client.messages(room.id).messages)
                }
            }.first { ui.messages.lastOrNull()?.let { !it.fromUser && it.status == Message.STATUS_DONE } == true }
        }
        assertTrue(finished is RoomEvent.Upsert)
        val reply = ui.messages.last()
        assertEquals("Echo Two", reply.author.name)
        assertTrue(reply.text.contains("demo mode"))
        assertEquals(client.messages(room.id).messages.last().text, reply.text)

        // A photo goes up, rides along with a message, and comes back byte for byte.
        val png = java.util.Base64.getDecoder().decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
        val photo = client.upload(png, "tiny photo.png", "image/png")
        assertEquals("tiny photo.png", photo.name)
        assertTrue(png.contentEquals(client.file(photo.id)))
        val withPhoto = client.send(room.id, "", listOf(photo.id))
        assertEquals(listOf(photo), withPhoto.attachments)
        withTimeout(20_000) { while (client.messages(room.id).run.active || client.messages(room.id).messages.last().fromUser) delay(200) }
        client.deleteMessage(room.id, client.messages(room.id).messages.last().id)
        client.deleteMessage(room.id, withPhoto.id)

        // Ask again: the old reply goes and a new one takes its place. Then delete that one.
        client.retry(room.id, reply.id)
        var latest = client.messages(room.id)
        withTimeout(20_000) {
            while (latest.run.active || latest.messages.last().let { it.id == reply.id || it.status != Message.STATUS_DONE }) {
                delay(200)
                latest = client.messages(room.id)
            }
        }
        assertTrue(latest.messages.none { it.id == reply.id })
        client.deleteMessage(room.id, latest.messages.last().id)
        assertEquals(listOf("hello from the test"), client.messages(room.id).messages.map { it.text })

        client.deleteRoom(room.id)
        client.deleteAgent(agent.id)
        client.unpair()
        assertEquals(401, (runCatching { client.state() }.exceptionOrNull() as HubException).status)
    }
}
