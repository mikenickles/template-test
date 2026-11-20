package dev.orbit.app

import android.widget.FrameLayout
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.glance.appwidget.ExperimentalGlanceRemoteViewsApi
import androidx.glance.appwidget.GlanceRemoteViews
import app.cash.paparazzi.DeviceConfig
import app.cash.paparazzi.Paparazzi
import dev.orbit.app.data.HubState
import dev.orbit.app.widget.WidgetContent
import dev.orbit.app.widget.WidgetSnapshot
import dev.orbit.app.widget.ago
import dev.orbit.app.widget.widgetSnapshot
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

/** The home-screen widget, drawn through the same RemoteViews a launcher gets. */
class WidgetTest {
    @get:Rule
    val paparazzi = Paparazzi(deviceConfig = DeviceConfig.PIXEL_6.copy(screenHeight = 900))

    private val state = HubState(agents = SampleData.agents, rooms = SampleData.app.rooms)

    @OptIn(ExperimentalGlanceRemoteViewsApi::class)
    private fun shot(name: String, snapshot: WidgetSnapshot, size: DpSize, night: Boolean) {
        paparazzi.unsafeUpdateConfig(deviceConfig = DeviceConfig.PIXEL_6.copy(screenHeight = 900, nightMode = if (night) com.android.resources.NightMode.NIGHT else com.android.resources.NightMode.NOTNIGHT))
        val context = paparazzi.context
        val views = runBlocking { GlanceRemoteViews().compose(context, size) { WidgetContent(context, snapshot, SampleData.NOW) } }.remoteViews
        val frame = FrameLayout(context)
        val widget = views.apply(context, frame)
        frame.addView(widget, FrameLayout.LayoutParams((size.width.value * context.resources.displayMetrics.density).toInt(), (size.height.value * context.resources.displayMetrics.density).toInt()))
        paparazzi.snapshot(frame, name)
    }

    @Test fun medium() = shot("widget-medium", widgetSnapshot(state), DpSize(320.dp, 170.dp), night = true)
    @Test fun mediumLight() = shot("widget-large-light", widgetSnapshot(state), DpSize(320.dp, 220.dp), night = false)
    @Test fun small() = shot("widget-small", widgetSnapshot(state), DpSize(250.dp, 76.dp), night = true)
    @Test fun unpaired() = shot("widget-unpaired-light", WidgetSnapshot(), DpSize(320.dp, 120.dp), night = false)

    @Test
    fun `the widget shows the newest rooms with who spoke or is speaking`() {
        val snapshot = widgetSnapshot(state)
        assertEquals(listOf("Launch plan", "Weekend trip", "Reading group"), snapshot.rooms.map { it.name })
        assertEquals("Sage is replying…", snapshot.rooms[0].line)
        assertEquals(SampleData.sage.avatar, snapshot.rooms[0].avatar)
        assertEquals("Sage: Two nights is tight for the coast. I'd pick the lake and skip the long drive.", snapshot.rooms[1].line)
        assertEquals("No messages yet", snapshot.rooms[2].line)
        assertEquals(listOf("now", "5m", "3h", "2d"), listOf(0L, 5L, 180L, 2_880L).map { ago(SampleData.NOW - it * 60_000, SampleData.NOW) })
    }
}
