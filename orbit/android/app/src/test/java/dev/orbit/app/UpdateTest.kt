package dev.orbit.app

import com.sun.net.httpserver.HttpServer
import dev.orbit.app.data.HubClient
import dev.orbit.app.data.HubException
import dev.orbit.app.data.isNewerVersion
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import java.io.File
import java.net.InetSocketAddress

class UpdateTest {
    @Test
    fun `versions compare by number, not by text`() {
        assertTrue(isNewerVersion("0.11.0", "0.10.0"))
        assertTrue(isNewerVersion("0.10.0", "0.9.0"))
        assertTrue(isNewerVersion("1.0.0", "0.99.99"))
        assertFalse(isNewerVersion("0.10.0", "0.10.0"))
        assertFalse(isNewerVersion("0.9.0", "0.10.0"))
        assertFalse(isNewerVersion("", "0.10.0"))
        assertFalse(isNewerVersion("0.11.0-beta", "0.10.0"))
    }

    private val apk = ByteArray(300_000) { (it % 251).toByte() }
    private var signedIn: String? = null
    private val hub = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0).apply {
        createContext("/api/updates/app") { exchange ->
            signedIn = exchange.requestHeaders.getFirst("Authorization")
            if (signedIn != "Bearer token") {
                val body = """{"error":"This phone is not paired with the hub."}""".toByteArray()
                exchange.sendResponseHeaders(401, body.size.toLong())
                exchange.responseBody.use { it.write(body) }
            } else {
                exchange.sendResponseHeaders(200, apk.size.toLong())
                exchange.responseBody.use { it.write(apk) }
            }
        }
        start()
    }
    private val live = "http://127.0.0.1:${hub.address.port}"

    @After
    fun stop() = hub.stop(0)

    @Test
    fun `the app downloads from the hub with the phone's sign-in, reporting progress`() = runBlocking {
        val file = File.createTempFile("orbit-update", ".apk")
        val progress = mutableListOf<Int>()
        HubClient(live, "token").downloadApp(file) { progress += it }
        assertTrue(file.readBytes().contentEquals(apk))
        assertEquals("Bearer token", signedIn)
        assertEquals(100, progress.last())
        assertTrue(progress.zipWithNext().all { (a, b) -> a < b })
        file.delete()
        Unit
    }

    @Test
    fun `an unpaired phone gets the hub's reason rather than a file`() = runBlocking {
        val file = File.createTempFile("orbit-update", ".apk")
        try {
            HubClient(live, "wrong").downloadApp(file) {}
            fail("should have been refused")
        } catch (e: HubException) {
            assertEquals(401, e.status)
            assertTrue(e.message!!.contains("not paired"))
        }
        file.delete()
        Unit
    }
}
