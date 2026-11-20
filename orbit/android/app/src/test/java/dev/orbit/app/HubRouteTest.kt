package dev.orbit.app

import com.sun.net.httpserver.HttpServer
import dev.orbit.app.data.HubClient
import dev.orbit.app.data.HubException
import dev.orbit.app.data.HubRoute
import dev.orbit.app.data.neverArrived
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.net.ConnectException
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.SocketTimeoutException

/** Away from home the home address goes quiet; the client should carry on through the hub's other address. */
class HubRouteTest {
    private val hits = mutableListOf<String>()
    private val hub = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0).apply {
        createContext("/") { exchange ->
            hits += "${exchange.requestMethod} ${exchange.requestURI.path}"
            val body = when (exchange.requestURI.path) {
                "/api/hub" -> """{"app":"orbit-hub","name":"Mike's PC","version":"0.1.0"}"""
                "/api/rooms/r1/messages" -> """{"id":"m1","text":"hello"}"""
                else -> "{}"
            }.toByteArray()
            exchange.sendResponseHeaders(200, body.size.toLong())
            exchange.responseBody.use { it.write(body) }
        }
        start()
    }
    private val live = "http://127.0.0.1:${hub.address.port}"

    /** An address where nothing listens: the connection is refused, as at a home address when away. */
    private val dead = ServerSocket(0).use { "http://127.0.0.1:${it.localPort}" }

    @After
    fun stop() = hub.stop(0)

    @Test
    fun `a quiet home address falls through to the other one, which then comes first`() = runBlocking {
        val switched = mutableListOf<String>()
        val route = HubRoute(dead, listOf(live)) { switched += it }
        val client = HubClient(route, "token")
        assertEquals("Mike's PC", client.info().name)
        assertEquals(live, route.current)
        assertEquals(listOf(live), switched)
        assertEquals(listOf(live, dead), route.order())

        // A message is sent once, through the address that works.
        client.send("r1", "hello")
        assertEquals(listOf("GET /api/hub", "POST /api/rooms/r1/messages"), hits)
    }

    @Test
    fun `a request that never left is safe to send elsewhere, one that might have arrived is not`() {
        assertTrue(neverArrived(ConnectException("Connection refused")))
        assertTrue(neverArrived(SocketTimeoutException("failed to connect to /192.168.86.49 (port 8787) after 6000ms")))
        assertFalse(neverArrived(SocketTimeoutException("timeout")))
    }

    @Test
    fun `when every way in is quiet, the message says to check Tailscale too`() = runBlocking {
        val error = runCatching { HubClient(HubRoute(dead, listOf(dead.replace("127.0.0.1", "localhost")))).info() }.exceptionOrNull()
        assertTrue(error is HubException)
        assertTrue(error!!.message!!.contains("Tailscale"))
        val home = runCatching { HubClient(dead).info() }.exceptionOrNull()
        assertTrue(home!!.message!!.contains("Nothing answered"))
    }
}
