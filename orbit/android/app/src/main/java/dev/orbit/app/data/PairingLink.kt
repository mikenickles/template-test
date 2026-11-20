package dev.orbit.app.data

import java.net.URI
import java.net.URLDecoder

/** What a pairing QR code (or orbit:// link) holds: the hub's address and its current code. */
data class PairingLink(val host: String, val code: String, val hubName: String?)

/**
 * Reads an `orbit://pair?host=…&code=…` link, as shown by the hub. Returns null for anything else,
 * so a stray QR code can't send the app somewhere unexpected.
 */
fun parsePairingLink(text: String): PairingLink? {
    val uri = runCatching { URI(text.trim()) }.getOrNull() ?: return null
    if (uri.scheme != "orbit" || uri.host != "pair") return null
    val params = uri.rawQuery.orEmpty().split('&').mapNotNull { part ->
        val (key, value) = part.split('=', limit = 2).takeIf { it.size == 2 } ?: return@mapNotNull null
        key to URLDecoder.decode(value, "UTF-8")
    }.toMap()
    val host = params["host"]?.trim().orEmpty()
    val code = params["code"]?.filter(Char::isDigit).orEmpty()
    // A host is an address with an optional port: no paths, users or schemes smuggled in.
    if (!Regex("""[A-Za-z0-9.\-]+(:\d{1,5})?""").matches(host) || code.length != 6) return null
    return PairingLink(host, code, params["name"]?.takeIf { it.isNotBlank() })
}
