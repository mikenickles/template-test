package dev.orbit.app.data

import android.util.LruCache
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import dev.orbit.app.ui.components.HubImages
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** Photos from the hub, decoded at the size they're shown and kept in memory for a while. */
class HubImageCache(private val repository: HubRepository) : HubImages {
    private val memory = object : LruCache<String, ImageBitmap>(48 * 1024 * 1024) {
        override fun sizeOf(key: String, value: ImageBitmap) = value.width * value.height * 4
    }

    override fun cached(id: String, maxEdge: Int): ImageBitmap? = memory.get("$id@$maxEdge")

    override suspend fun load(id: String, maxEdge: Int): ImageBitmap? = withContext(Dispatchers.IO) {
        cached(id, maxEdge) ?: runCatching {
            val bytes = repository.client?.file(id) ?: return@runCatching null
            decodeImage(bytes, maxEdge)?.asImageBitmap()?.also { memory.put("$id@$maxEdge", it) }
        }.getOrNull()
    }
}
