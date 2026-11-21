package dev.orbit.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import dev.orbit.app.data.RoomContext
import dev.orbit.app.ui.components.Hairline
import dev.orbit.app.ui.components.OrbitCard
import dev.orbit.app.ui.components.OrbitSpinner
import dev.orbit.app.ui.components.OrbitSwitch
import dev.orbit.app.ui.components.Pill
import dev.orbit.app.ui.components.ScreenBar
import dev.orbit.app.ui.components.Segmented
import dev.orbit.app.ui.theme.Orbit
import dev.orbit.app.ui.theme.OrbitDimens
import dev.orbit.app.ui.theme.OrbitType

/**
 * A room's tokens: about how many its next reply sends, what that's made of, what the room used in the
 * last 30 days, and ways to send less (a smaller context, older photos left out, summarizing now).
 */
@Composable
fun RoomTokensScreen(
    roomName: String,
    context: RoomContext?,
    onSize: (String) -> Unit,
    onPhotos: (Boolean) -> Unit,
    onCompact: () -> Unit,
    compacting: Boolean,
    error: String?,
    onBack: () -> Unit,
) {
    val c = Orbit.colors
    val scroll = rememberScrollState()
    Box(Modifier.fillMaxSize().background(c.bg)) {
    Scaffold(containerColor = Color.Transparent, topBar = { ScreenBar("Tokens", onBack, scrolled = scroll.value > 0) }) { padding ->
        if (context == null) {
            Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) { OrbitSpinner(c.textTertiary) }
            return@Scaffold
        }
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(scroll)
                .padding(start = OrbitDimens.gutter, end = OrbitDimens.gutter, top = 12.dp, bottom = 48.dp),
        ) {
            val t = context.tokens
            OrbitCard(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(OrbitDimens.rowPad)) {
                    Text("EACH REPLY IN ${roomName.uppercase()} SENDS ABOUT", style = OrbitType.overline, color = c.textTertiary)
                    Row(Modifier.padding(top = 6.dp), verticalAlignment = Alignment.Bottom) {
                        Text(formatTokens(t.total.toLong()), style = OrbitType.display, color = c.text)
                        Text(" tokens", Modifier.padding(bottom = 5.dp), style = OrbitType.bodyM, color = c.textSecondary)
                    }
                    // What it's made of, as one bar: darkest for what's always sent, lightest for photos.
                    val parts = listOf(
                        Part(c.text, t.instructions, "Instructions and what the crew knows", null),
                        Part(c.textSecondary, t.summary, "Summary of older messages", context.messages.summarized.takeIf { it > 0 }?.let { "$it messages" }),
                        Part(c.textTertiary, t.recent, "Recent messages, word for word", "${context.messages.recent} messages"),
                        Part(c.line, t.photos, "Photos", null),
                    )
                    Row(Modifier.padding(top = 14.dp).fillMaxWidth().height(10.dp).clip(CircleShape).background(c.surfaceHigh)) {
                        val total = t.total.coerceAtLeast(1)
                        for (part in parts) if (part.tokens > 0) Box(Modifier.weight(part.tokens.toFloat() / total).fillMaxHeight().background(part.color))
                    }
                    Column(Modifier.padding(top = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        for (part in parts) if (part.tokens > 0 || part.label.startsWith("Recent")) Legend(part)
                    }
                    if (context.messages.leftOut > 0) {
                        Text(
                            "${context.messages.leftOut} older messages aren't summarized yet and aren't sent. Summarize now to fold them in.",
                            Modifier.padding(top = 12.dp),
                            style = OrbitType.bodyS,
                            color = c.textTertiary,
                        )
                    }
                }
            }

            Group("Last ${context.days} days in this room")
            val u = context.usage
            val sent = u.input + u.cacheRead + u.cacheWrite
            OrbitCard(Modifier.fillMaxWidth()) {
                Column {
                    Stat("Tokens sent", formatTokens(sent))
                    Hairline(Modifier.padding(start = OrbitDimens.rowPad))
                    Stat("Tokens written by the crew", formatTokens(u.output))
                    Hairline(Modifier.padding(start = OrbitDimens.rowPad))
                    Stat("Read from cache", if (sent > 0) "${(u.cacheRead * 100 / sent)}%" else "None yet", detail = "Cached tokens cost about a tenth")
                    Hairline(Modifier.padding(start = OrbitDimens.rowPad))
                    Stat("Estimated cost", if (u.cost > 0 || u.priced) formatCost(u.cost) else "Not priced", detail = "${u.requests} requests")
                }
            }

            Group("Make replies lighter")
            Segmented(
                listOf(RoomContext.SIZE_SMALL to "Small", RoomContext.SIZE_MEDIUM to "Medium", RoomContext.SIZE_LARGE to "Large"),
                context.size,
                onSize,
            )
            Text(
                when (context.size) {
                    RoomContext.SIZE_SMALL -> "About 5,000 tokens of recent messages, word for word. Cheapest; older messages are summarized, so agents still know what happened."
                    RoomContext.SIZE_LARGE -> "About 40,000 tokens of recent messages, word for word. For long documents and detailed work; costs the most."
                    else -> "About 15,000 tokens of recent messages, word for word, and a summary of the rest. A good balance."
                },
                Modifier.padding(top = 10.dp, start = 4.dp, end = 4.dp),
                style = OrbitType.bodyS,
                color = c.textTertiary,
            )
            Spacer(Modifier.height(16.dp))
            OrbitCard(Modifier.fillMaxWidth()) {
                Column {
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .toggleable(context.photos, role = Role.Switch, onValueChange = onPhotos)
                            .heightIn(min = 64.dp)
                            .padding(horizontal = OrbitDimens.rowPad),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(Modifier.weight(1f).padding(vertical = 12.dp)) {
                            Text("Send photos again", style = OrbitType.titleS, color = c.text)
                            Text(
                                "Off: only the newest message's photos are sent; earlier ones are mentioned by name. About 1,500 tokens saved per photo.",
                                Modifier.padding(top = 2.dp, end = 12.dp),
                                style = OrbitType.bodyS,
                                color = c.textSecondary,
                            )
                        }
                        OrbitSwitch(context.photos)
                    }
                    Hairline(Modifier.padding(start = OrbitDimens.rowPad))
                    Row(Modifier.fillMaxWidth().heightIn(min = 64.dp).padding(start = OrbitDimens.rowPad, end = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f).padding(vertical = 12.dp)) {
                            Text("Summarize now", style = OrbitType.titleS, color = c.text)
                            Text(
                                "Folds all but the last 6 messages into the summary, written by a quick, inexpensive model.",
                                Modifier.padding(top = 2.dp, end = 12.dp),
                                style = OrbitType.bodyS,
                                color = c.textSecondary,
                            )
                            error?.let { Text(it, Modifier.padding(top = 6.dp), style = OrbitType.bodyS, color = c.danger) }
                        }
                        if (compacting) OrbitSpinner(c.textSecondary, size = 20.dp) else Pill("Summarize", onCompact)
                    }
                }
            }
            Text(
                "These only change what agents are sent. You still see the whole chat here.",
                Modifier.padding(top = 14.dp, start = 4.dp, end = 4.dp),
                style = OrbitType.bodyS,
                color = c.textTertiary,
            )
        }
    }
    }
}

private data class Part(val color: Color, val tokens: Int, val label: String, val detail: String?)

@Composable
private fun Legend(part: Part) {
    val c = Orbit.colors
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(8.dp).clip(CircleShape).background(part.color))
        Text(part.label, Modifier.weight(1f).padding(start = 10.dp), style = OrbitType.bodyS, color = c.textSecondary)
        part.detail?.let { Text(it, Modifier.padding(end = 10.dp), style = OrbitType.caption, color = c.textTertiary) }
        Text(formatTokens(part.tokens.toLong()), style = OrbitType.label, color = c.text)
    }
}

@Composable
private fun Group(title: String) = Text(
    title.uppercase(),
    Modifier.padding(start = 4.dp, top = OrbitDimens.section, bottom = 10.dp),
    style = OrbitType.overline,
    color = Orbit.colors.textTertiary,
)

@Composable
private fun Stat(label: String, value: String, detail: String? = null) {
    val c = Orbit.colors
    Row(Modifier.fillMaxWidth().heightIn(min = 52.dp).padding(horizontal = OrbitDimens.rowPad), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f).padding(vertical = 10.dp)) {
            Text(label, style = OrbitType.bodyM, color = c.text)
            detail?.let { Text(it, style = OrbitType.caption, color = c.textTertiary) }
        }
        Text(value, style = OrbitType.titleS, color = c.text)
    }
}
