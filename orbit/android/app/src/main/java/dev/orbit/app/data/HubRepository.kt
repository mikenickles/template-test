package dev.orbit.app.data

import android.content.Context
import android.os.Build
import android.os.SystemClock
import java.util.concurrent.ConcurrentHashMap
import androidx.core.content.edit
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** The hub this phone is paired with. */
data class Session(val baseUrl: String, val token: String, val hubName: String)

/** Owns the pairing and hands out a client for the paired hub. */
class HubRepository(context: Context) {
    private val prefs = context.getSharedPreferences("orbit", Context.MODE_PRIVATE)

    private val _session = MutableStateFlow(load())
    val session: StateFlow<Session?> = _session.asStateFlow()

    // The hub's other addresses (another home address, Tailscale), learned from the hub, and the route
    // through them that every client shares, so all calls move to an address together.
    private var alternates: List<String> = prefs.getString("alternates", null)?.split('\n')?.filter { it.isNotBlank() }.orEmpty()
    private var route: HubRoute? = null
    private val _via = MutableStateFlow<String?>(null)

    /** The address the app is reaching the hub at right now. */
    val via: StateFlow<String?> = _via.asStateFlow()

    val client: HubClient?
        get() {
            val session = _session.value ?: return null
            val current = route ?: routeFor(session).also { route = it }
            return HubClient(current, session.token)
        }

    private fun routeFor(session: Session, current: String? = prefs.getString("current", null)): HubRoute =
        HubRoute(session.baseUrl, alternates, current) { url ->
            prefs.edit { putString("current", url) }
            _via.value = url
        }.also { _via.value = it.current }

    /** Learns where else the hub can be reached, so the app finds it away from home too. */
    fun updateAddresses(home: List<String>, remote: List<String>) {
        val session = _session.value ?: return
        val learned = (home + remote).map(::normalizeHubAddress).filter { it.isNotEmpty() && it != session.baseUrl }.distinct()
        if (learned == alternates) return
        alternates = learned
        prefs.edit { putString("alternates", learned.joinToString("\n")) }
        route = routeFor(session, route?.current)
    }

    // Rooms seen working, and when a message was last sent, so leaving the app knows whether a
    // reply is still on its way and worth waiting for in the background.
    private val working = ConcurrentHashMap.newKeySet<String>()
    @Volatile private var lastSent = 0L

    fun noteRun(roomId: String, active: Boolean) {
        if (active) working.add(roomId) else working.remove(roomId)
    }

    fun noteSent() {
        lastSent = SystemClock.elapsedRealtime()
    }

    /** Whether agents may still be replying somewhere. */
    fun mayBeWorking(): Boolean =
        _session.value != null && (working.isNotEmpty() || SystemClock.elapsedRealtime() - lastSent < 60_000)

    private fun load(): Session? {
        val url = prefs.getString("baseUrl", null) ?: return null
        val token = prefs.getString("token", null) ?: return null
        return Session(url, token, prefs.getString("hubName", "").orEmpty())
    }

    suspend fun pair(address: String, code: String) {
        val baseUrl = normalizeHubAddress(address)
        if (baseUrl.isEmpty()) throw HubException("Enter your hub's address first.")
        val device = "${Build.MANUFACTURER.replaceFirstChar { it.uppercase() }} ${Build.MODEL}".trim()
        val result = HubClient(baseUrl).pair(code, device)
        prefs.edit {
            putString("baseUrl", baseUrl)
            putString("token", result.token)
            putString("hubName", result.hub.name)
            remove("alternates")
            remove("current")
        }
        alternates = emptyList()
        route = null
        _session.value = Session(baseUrl, result.token, result.hub.name)
    }

    /** Forget the hub locally. Pass [notifyHub] = false when the hub already rejected the token. */
    suspend fun unpair(notifyHub: Boolean = true) {
        if (notifyHub) runCatching { client?.unpair() }
        prefs.edit { clear() }
        alternates = emptyList()
        route = null
        _via.value = null
        _session.value = null
    }
}
