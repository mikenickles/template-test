package dev.orbit.app.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.NetworkInterface
import java.net.SocketTimeoutException

data class FoundHub(val name: String, val address: String)

@Serializable
private data class DiscoveryReply(val app: String = "", val name: String = "", val port: Int = HubClient.DEFAULT_PORT)

private const val DISCOVERY_PORT = 8788
private const val PROBE = "ORBIT_DISCOVER"

/** Broadcasts on the local network and collects the hubs that answer. */
suspend fun discoverHubs(timeoutMs: Long = 1500): List<FoundHub> = withContext(Dispatchers.IO) {
    val found = LinkedHashMap<String, FoundHub>()
    runCatching {
        DatagramSocket().use { socket ->
            socket.broadcast = true
            socket.soTimeout = 300
            val probe = PROBE.toByteArray()
            val targets = buildSet {
                add(InetAddress.getByName("255.255.255.255"))
                for (nic in NetworkInterface.getNetworkInterfaces()) {
                    if (!nic.isUp || nic.isLoopback) continue
                    nic.interfaceAddresses.mapNotNullTo(this) { it.broadcast }
                }
            }
            for (target in targets) {
                runCatching { socket.send(DatagramPacket(probe, probe.size, target, DISCOVERY_PORT)) }
            }
            val deadline = System.currentTimeMillis() + timeoutMs
            val buffer = ByteArray(1024)
            while (System.currentTimeMillis() < deadline) {
                val packet = DatagramPacket(buffer, buffer.size)
                try {
                    socket.receive(packet)
                } catch (e: SocketTimeoutException) {
                    continue
                }
                val reply = runCatching {
                    OrbitJson.decodeFromString<DiscoveryReply>(String(packet.data, 0, packet.length))
                }.getOrNull() ?: continue
                if (reply.app != "orbit-hub") continue
                val address = "${packet.address.hostAddress}:${reply.port}"
                found[address] = FoundHub(reply.name.ifEmpty { "Orbit hub" }, address)
            }
        }
    }
    found.values.toList()
}
