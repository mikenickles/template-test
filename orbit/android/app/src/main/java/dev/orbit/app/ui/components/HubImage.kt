package dev.orbit.app.ui.components

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.layout.ContentScale
import dev.orbit.app.data.Attachment
import dev.orbit.app.ui.theme.Orbit

/** Where pictures stored on the hub come from: the app fetches them; tests hand in their own. */
interface HubImages {
    /** An image already in memory, or null. */
    fun cached(id: String, maxEdge: Int): ImageBitmap?

    /** Fetches and decodes an image, or null if it can't be had. */
    suspend fun load(id: String, maxEdge: Int): ImageBitmap?
}

val LocalHubImages = staticCompositionLocalOf<HubImages?> { null }

/** A photo attached to a message. A quiet block holds its place until it arrives. */
@Composable
fun HubImage(
    attachment: Attachment,
    modifier: Modifier = Modifier,
    maxEdge: Int = 1080,
    contentScale: ContentScale = ContentScale.Crop,
    aspect: ClosedFloatingPointRange<Float>? = null,
) {
    val images = LocalHubImages.current
    val bitmap by produceState(images?.cached(attachment.id, maxEdge), attachment.id, maxEdge) {
        if (value == null) value = images?.load(attachment.id, maxEdge)
    }
    val image = bitmap
    // With [aspect], the picture keeps its own shape within those bounds once it has arrived.
    val shaped = if (aspect != null && image != null) {
        modifier.aspectRatio((image.width.toFloat() / image.height).coerceIn(aspect.start, aspect.endInclusive))
    } else {
        modifier
    }
    if (image != null) {
        Image(image, attachment.name, shaped, contentScale = contentScale)
    } else {
        Box(modifier.background(Orbit.colors.surfaceHigh))
    }
}

/** A file size as people say it: "840 KB", "2.4 MB". */
fun fileSize(bytes: Long): String = when {
    bytes < 1024 -> "$bytes B"
    bytes < 1024 * 1024 -> "${(bytes + 512) / 1024} KB"
    else -> String.format(java.util.Locale.US, "%.1f MB", bytes / (1024.0 * 1024.0))
}
