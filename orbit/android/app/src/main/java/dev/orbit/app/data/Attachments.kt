package dev.orbit.app.data

import android.content.ContentResolver
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.graphics.Matrix
// Only used below Android 9, where the platform's own reader is reliable.
import android.media.ExifInterface
import android.net.Uri
import android.os.Build
import android.provider.OpenableColumns
import androidx.core.graphics.scale
import java.io.ByteArrayOutputStream
import kotlin.math.max
import kotlin.math.roundToInt

/** Claude reads images up to this long edge; anything larger only costs more to send. */
const val MAX_IMAGE_EDGE = 2576

/** The hub's limit for one attached file. */
const val MAX_ATTACHMENT_BYTES = 20L * 1024 * 1024

/** A photo or file picked on the phone, ready to upload. */
class PreparedFile(val bytes: ByteArray, val name: String, val type: String)

private val TEXT_EXTENSIONS = mapOf(
    "txt" to "text/plain", "md" to "text/markdown", "markdown" to "text/markdown", "csv" to "text/csv",
    "json" to "application/json", "log" to "text/plain", "html" to "text/html", "xml" to "application/xml",
)

/** A picked item's name and media type, as the app that shared it describes them. */
fun describe(resolver: ContentResolver, uri: Uri): Pair<String, String?> {
    val name = runCatching {
        resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
            if (c.moveToFirst()) c.getString(0) else null
        }
    }.getOrNull() ?: uri.lastPathSegment?.substringAfterLast('/') ?: "file"
    val type = resolver.getType(uri)?.takeUnless { it == "application/octet-stream" }
        ?: TEXT_EXTENSIONS[name.substringAfterLast('.', "").lowercase()]
    return name to type
}

/** What models can read: photos, PDFs and text. */
fun canAttach(type: String?): Boolean =
    type != null && (type.startsWith("image/") || type == "application/pdf" || type.startsWith("text/") || type in TEXT_EXTENSIONS.values)

/**
 * Reads a picked item for upload. Photos come out upright, no larger than [MAX_IMAGE_EDGE], as JPEG
 * (which also drops their location data); PDFs and text files are sent as they are.
 */
fun prepare(resolver: ContentResolver, uri: Uri, known: Pair<String, String>? = null): PreparedFile {
    val (name, type) = known ?: describe(resolver, uri)
    if (!canAttach(type)) throw HubException("Treehouse can attach photos, PDFs and text files.")
    if (type!!.startsWith("image/")) {
        val bitmap = decodeImage(resolver, uri, MAX_IMAGE_EDGE) ?: throw HubException("That photo couldn't be opened.")
        val out = ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.JPEG, 88, out)
        return PreparedFile(out.toByteArray(), name.substringBeforeLast('.') + ".jpg", "image/jpeg")
    }
    val bytes = resolver.openInputStream(uri)?.use { input ->
        val buffer = ByteArrayOutputStream()
        val chunk = ByteArray(64 * 1024)
        while (true) {
            val n = input.read(chunk)
            if (n < 0) break
            buffer.write(chunk, 0, n)
            if (buffer.size() > MAX_ATTACHMENT_BYTES) throw HubException("$name is too large. Attach files up to 20 MB.")
        }
        buffer.toByteArray()
    } ?: throw HubException("$name couldn't be opened.")
    return PreparedFile(bytes, name, type)
}

/** Decodes a photo upright with its long edge at most [maxEdge] pixels. */
fun decodeImage(resolver: ContentResolver, uri: Uri, maxEdge: Int): Bitmap? = runCatching {
    if (Build.VERSION.SDK_INT >= 28) {
        ImageDecoder.decodeBitmap(ImageDecoder.createSource(resolver, uri)) { decoder, info, _ ->
            val scale = maxEdge.toFloat() / max(info.size.width, info.size.height)
            if (scale < 1f) decoder.setTargetSize((info.size.width * scale).roundToInt(), (info.size.height * scale).roundToInt())
            decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
        }
    } else {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
        val options = BitmapFactory.Options().apply { inSampleSize = sampleSize(bounds.outWidth, bounds.outHeight, maxEdge) }
        val raw = resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, options) } ?: return null
        val degrees = resolver.openInputStream(uri)?.use {
            when (ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
                ExifInterface.ORIENTATION_ROTATE_90 -> 90
                ExifInterface.ORIENTATION_ROTATE_180 -> 180
                ExifInterface.ORIENTATION_ROTATE_270 -> 270
                else -> 0
            }
        } ?: 0
        fit(rotate(raw, degrees), maxEdge)
    }
}.getOrNull()

/** Decodes downloaded image bytes with the long edge at most [maxEdge]. */
fun decodeImage(bytes: ByteArray, maxEdge: Int): Bitmap? {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
    val options = BitmapFactory.Options().apply { inSampleSize = sampleSize(bounds.outWidth, bounds.outHeight, maxEdge) }
    return BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)?.let { fit(it, maxEdge) }
}

private fun sampleSize(width: Int, height: Int, maxEdge: Int): Int {
    var sample = 1
    while (max(width, height) / (sample * 2) >= maxEdge) sample *= 2
    return sample
}

private fun fit(bitmap: Bitmap, maxEdge: Int): Bitmap {
    val scale = maxEdge.toFloat() / max(bitmap.width, bitmap.height)
    if (scale >= 1f) return bitmap
    return bitmap.scale((bitmap.width * scale).roundToInt(), (bitmap.height * scale).roundToInt())
}

private fun rotate(bitmap: Bitmap, degrees: Int): Bitmap =
    if (degrees == 0) bitmap else Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, Matrix().apply { postRotate(degrees.toFloat()) }, true)
