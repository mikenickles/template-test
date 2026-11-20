package dev.orbit.app.data

import android.content.Context
import android.net.Uri
import java.io.File
import java.util.UUID

/** A file another app shared into Orbit, copied into Orbit's own storage so it outlives the share. */
data class SharedFile(val uri: Uri, val name: String, val type: String)

/** What arrived through Android's share menu: some text, some files, and how many couldn't come along. */
data class SharedContent(val text: String, val files: List<SharedFile> = emptyList(), val skipped: Int = 0)

/**
 * The words to start a message with. A browser shares a page as its address, with the title as the
 * subject; both are worth keeping.
 */
fun sharedText(text: String?, subject: String?): String {
    val body = text?.trim().orEmpty()
    val title = subject?.trim().orEmpty()
    return when {
        title.isEmpty() -> body
        body.isEmpty() -> title
        body.contains(title) || title.contains(body) -> body
        Regex("""^https?://\S+$""").matches(body) -> "$title\n$body"
        else -> body
    }
}

/**
 * Copies shared items Orbit can attach into its cache, since another app's permission to read them
 * ends with the share. Older copies are cleared first.
 */
fun copyShared(context: Context, uris: List<Uri>, limit: Int): Pair<List<SharedFile>, Int> {
    val root = File(context.cacheDir, "shared")
    root.listFiles()?.filter { System.currentTimeMillis() - it.lastModified() > 86_400_000 }?.forEach { it.deleteRecursively() }
    var skipped = 0
    val copied = uris.mapNotNull { uri ->
        val (name, type) = describe(context.contentResolver, uri)
        if (!canAttach(type)) {
            skipped++
            return@mapNotNull null
        }
        runCatching {
            val file = File(File(root, UUID.randomUUID().toString()).apply { mkdirs() }, name.replace('/', '_'))
            context.contentResolver.openInputStream(uri)!!.use { input -> file.outputStream().use { input.copyTo(it) } }
            SharedFile(Uri.fromFile(file), name, type!!)
        }.getOrElse {
            skipped++
            null
        }
    }
    return copied.take(limit) to skipped + (copied.size - limit).coerceAtLeast(0)
}
