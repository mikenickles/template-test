package dev.orbit.app.data

/** Whether [a] is a newer "major.minor.patch" version than [b]. Anything that isn't a version counts as not newer. */
fun isNewerVersion(a: String, b: String): Boolean {
    val x = a.split('.').map { it.toIntOrNull() ?: return false }
    val y = b.split('.').map { it.toIntOrNull() ?: return false }
    for (i in 0 until maxOf(x.size, y.size)) {
        val l = x.getOrElse(i) { 0 }
        val r = y.getOrElse(i) { 0 }
        if (l != r) return l > r
    }
    return false
}
