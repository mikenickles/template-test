package dev.orbit.app.widget

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.edit
import androidx.core.net.toUri
import androidx.glance.ColorFilter
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalSize
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.appwidget.updateAll
import androidx.glance.background
import androidx.glance.color.ColorProvider
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import dev.orbit.app.MainActivity
import dev.orbit.app.OrbitApp
import dev.orbit.app.R
import dev.orbit.app.data.AvatarSpec
import dev.orbit.app.data.HubState
import dev.orbit.app.data.OrbitJson
import dev.orbit.app.ui.components.AvatarPalette
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString

/** One room as the widget shows it. */
@Serializable
data class WidgetRoom(
    val id: String,
    val name: String,
    val line: String,
    val updatedAt: Long,
    val active: Boolean = false,
    /** The face shown beside the room: whoever spoke last, or the first of the crew. */
    val avatar: AvatarSpec = AvatarSpec(),
)

/** What the widget shows, saved by the app so the widget can draw without asking the hub. */
@Serializable
data class WidgetSnapshot(val paired: Boolean = false, val rooms: List<WidgetRoom> = emptyList())

/** The newest rooms, each with its last line ("Nova: …", or who is replying right now). */
fun widgetSnapshot(state: HubState, limit: Int = 3): WidgetSnapshot {
    val agents = state.agents.associateBy { it.id }
    val rooms = state.rooms.sortedByDescending { it.updatedAt }.take(limit).map { room ->
        val speaker = agents[room.speaking]
        val author = room.preview?.author?.let { name -> state.agents.firstOrNull { it.name == name } }
        val line = when {
            room.active && speaker != null -> "${speaker.name} is replying…"
            room.active -> "Your crew is working…"
            room.preview != null -> "${room.preview.author}: ${room.preview.text}"
            else -> "No messages yet"
        }
        val face = (speaker ?: author ?: room.agentIds.firstNotNullOfOrNull(agents::get))?.avatar ?: AvatarSpec()
        WidgetRoom(room.id, room.name, line, room.updatedAt, room.active, face)
    }
    return WidgetSnapshot(paired = true, rooms = rooms)
}

/** Saves and loads the snapshot, and redraws every Orbit widget. */
object WidgetStore {
    private const val PREFS = "orbit-widget"

    fun load(context: Context): WidgetSnapshot = runCatching {
        OrbitJson.decodeFromString<WidgetSnapshot>(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("snapshot", null)!!)
    }.getOrDefault(WidgetSnapshot())

    suspend fun save(context: Context, snapshot: WidgetSnapshot) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val json = OrbitJson.encodeToString(snapshot)
        if (prefs.getString("snapshot", null) == json) return
        prefs.edit { putString("snapshot", json) }
        runCatching { OrbitWidget().updateAll(context) }
    }

    /** Fetches the latest from the hub and redraws. Quietly does nothing when the hub can't be reached. */
    suspend fun refresh(context: Context) {
        val client = (context.applicationContext as OrbitApp).repository.client
        if (client == null) {
            save(context, WidgetSnapshot())
            return
        }
        runCatching { client.state() }.getOrNull()?.let { save(context, widgetSnapshot(it)) }
    }
}

/** "now", "5m", "3h", "2d": how long ago, as short as a widget needs. */
internal fun ago(then: Long, now: Long): String {
    val minutes = ((now - then) / 60_000).coerceAtLeast(0)
    return when {
        minutes < 1 -> "now"
        minutes < 60 -> "${minutes}m"
        minutes < 24 * 60 -> "${minutes / 60}h"
        else -> "${minutes / (24 * 60)}d"
    }
}

// The app's neutral palette, as the widget sees it: it follows the system's light or dark mode.
private val Surface = ColorProvider(day = Color(0xFFFFFFFF), night = Color(0xFF111318))
private val Ink = ColorProvider(day = Color(0xFF0A0B10), night = Color(0xFFF4F5F8))
private val Secondary = ColorProvider(day = Color(0xFF4E5262), night = Color(0xFFA3A7B6))
private val Tertiary = ColorProvider(day = Color(0xFF676B7C), night = Color(0xFF8B8FA0))
private val Raised = ColorProvider(day = Color(0xFFE0E2E9), night = Color(0xFF23262F))

/** An avatar's face for the widget: its color as a circle, with two eyes. */
private fun face(spec: AvatarSpec, size: Int = 96): Bitmap {
    val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    paint.color = AvatarPalette[spec.color.mod(AvatarPalette.size)].fill.toArgb()
    canvas.drawCircle(size / 2f, size / 2f, size / 2f, paint)
    paint.color = 0xFF08090D.toInt()
    val eyeW = size * 0.11f
    val eyeH = size * 0.24f
    for (x in listOf(0.36f, 0.64f)) {
        canvas.drawRoundRect(RectF(size * x - eyeW / 2, size * 0.4f, size * x + eyeW / 2, size * 0.4f + eyeH), eyeW / 2, eyeW / 2, paint)
    }
    return bitmap
}

class OrbitWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Responsive(setOf(DpSize(110.dp, 60.dp), DpSize(250.dp, 110.dp), DpSize(250.dp, 210.dp)))

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val snapshot = WidgetStore.load(context)
        provideContent { WidgetContent(context, snapshot, System.currentTimeMillis()) }
    }
}

@Composable
internal fun WidgetContent(context: Context, snapshot: WidgetSnapshot, now: Long) {
    val size = LocalSize.current
    // Each room needs about 48dp, and the header about 30.
    val fits = when {
        size.height < 110.dp -> 1
        size.height < 200.dp -> 2
        else -> 3
    }
    val open = { room: String? ->
        actionStartActivity(Intent(context, MainActivity::class.java).apply { if (room != null) data = "orbit://room/$room".toUri() })
    }
    Column(
        GlanceModifier.fillMaxSize().background(Surface).cornerRadius(22.dp).padding(horizontal = 14.dp, vertical = 12.dp),
    ) {
        if (fits > 1) {
            Row(GlanceModifier.fillMaxWidth().clickable(open(null)), verticalAlignment = Alignment.CenterVertically) {
                Image(ImageProvider(R.drawable.ic_stat_orbit), "Orbit", GlanceModifier.size(16.dp), colorFilter = ColorFilter.tint(Ink))
                Text("Orbit", GlanceModifier.padding(start = 6.dp), style = TextStyle(color = Ink, fontSize = 14.sp, fontWeight = FontWeight.Medium))
            }
            Spacer(GlanceModifier.height(8.dp))
        }
        when {
            !snapshot.paired -> Message("Open Orbit to pair with your PC", open(null))
            snapshot.rooms.isEmpty() -> Message("No rooms yet. Open Orbit to start one.", open(null))
            else -> for ((index, room) in snapshot.rooms.take(fits).withIndex()) {
                if (index > 0) Spacer(GlanceModifier.height(6.dp))
                RoomLine(room, now, open(room.id))
            }
        }
    }
}

@Composable
private fun Message(text: String, onClick: androidx.glance.action.Action) {
    Box(GlanceModifier.fillMaxSize().clickable(onClick), contentAlignment = Alignment.CenterStart) {
        Text(text, style = TextStyle(color = Secondary, fontSize = 13.sp))
    }
}

@Composable
private fun RoomLine(room: WidgetRoom, now: Long, onClick: androidx.glance.action.Action) {
    Row(
        GlanceModifier.fillMaxWidth().cornerRadius(14.dp).clickable(onClick).padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(GlanceModifier.size(34.dp).background(Raised).cornerRadius(17.dp), contentAlignment = Alignment.Center) {
            Image(ImageProvider(face(room.avatar)), null, GlanceModifier.size(26.dp))
        }
        Column(GlanceModifier.defaultWeight().padding(start = 10.dp)) {
            Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(room.name, GlanceModifier.defaultWeight(), style = TextStyle(color = Ink, fontSize = 14.sp, fontWeight = FontWeight.Medium), maxLines = 1)
                Text(if (room.active) "" else ago(room.updatedAt, now), style = TextStyle(color = Tertiary, fontSize = 12.sp))
            }
            Text(room.line, style = TextStyle(color = Secondary, fontSize = 13.sp), maxLines = 1)
        }
        Spacer(GlanceModifier.width(2.dp))
    }
}

class OrbitWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = OrbitWidget()
}
