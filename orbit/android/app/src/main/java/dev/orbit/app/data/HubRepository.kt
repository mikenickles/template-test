package dev.orbit.app.data

import android.content.Context
import android.os.Build
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

    val client: HubClient?
        get() = _session.value?.let { HubClient(it.baseUrl, it.token) }

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
        }
        _session.value = Session(baseUrl, result.token, result.hub.name)
    }

    /** Forget the hub locally. Pass [notifyHub] = false when the hub already rejected the token. */
    suspend fun unpair(notifyHub: Boolean = true) {
        if (notifyHub) runCatching { client?.unpair() }
        prefs.edit { clear() }
        _session.value = null
    }
}
