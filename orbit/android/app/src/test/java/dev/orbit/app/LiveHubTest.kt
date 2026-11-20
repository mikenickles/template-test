package dev.orbit.app

import dev.orbit.app.data.Agent
import dev.orbit.app.data.HubClient
import dev.orbit.app.data.HubException
import dev.orbit.app.data.Message
import dev.orbit.app.data.Room
import dev.orbit.app.data.RoomEvent
import dev.orbit.app.ui.RoomUiState
import dev.orbit.app.ui.reduce
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

        val agent = client.saveAgent(Agent(name = "Echo", role = "the tester", provider = "demo", model = "demo"))
        val renamed = client.saveAgent(agent.copy(name = "Echo Two"))
        assertEquals(agent.id, renamed.id)
        val room = client.saveRoom(Room(name = "Live test", agentIds = listOf(agent.id)))

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

        client.deleteRoom(room.id)
        client.deleteAgent(agent.id)
        client.unpair()
        assertEquals(401, (runCatching { client.state() }.exceptionOrNull() as HubException).status)
    }
}
