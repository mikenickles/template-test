package dev.orbit.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.orbit.app.data.Agent
import dev.orbit.app.data.Room
import dev.orbit.app.data.SharedContent
import dev.orbit.app.ui.components.CrewTile
import dev.orbit.app.ui.components.Hairline
import dev.orbit.app.ui.components.OrbitCard
import dev.orbit.app.ui.components.OrbitIcon
import dev.orbit.app.ui.components.PrimaryButton
import dev.orbit.app.ui.components.ScreenBar
import dev.orbit.app.ui.components.SectionTitle
import dev.orbit.app.ui.components.tap
import dev.orbit.app.ui.theme.Orbit
import dev.orbit.app.ui.theme.OrbitDimens
import dev.orbit.app.ui.theme.OrbitType

/** What a share holds, in a few words: "2 photos and a PDF". */
internal fun describeShared(content: SharedContent): String {
    val photos = content.files.count { it.type.startsWith("image/") }
    val pdfs = content.files.count { it.type == "application/pdf" }
    val others = content.files.size - photos - pdfs
    fun count(n: Int, one: String, many: String) = if (n == 1) one else "$n $many"
    val parts = buildList {
        if (photos > 0) add(count(photos, "a photo", "photos"))
        if (pdfs > 0) add(count(pdfs, "a PDF", "PDFs"))
        if (others > 0) add(count(others, "a file", "files"))
    }
    return if (parts.size <= 1) parts.firstOrNull().orEmpty() else parts.dropLast(1).joinToString(", ") + " and " + parts.last()
}

/**
 * Where something shared from another app goes: a glimpse of it, then the rooms to send it to.
 * Choosing one opens the room with the text and files ready to send, so you can add a question first.
 */
@Composable
fun ShareScreen(content: SharedContent, rooms: List<Room>, agents: List<Agent>, onPick: (Room) -> Unit, onNewRoom: () -> Unit, onBack: () -> Unit) {
    val c = Orbit.colors
    val scroll = rememberScrollState()
    val scrolled by remember { derivedStateOf { scroll.value > 0 } }
    val byId = remember(agents) { agents.associateBy { it.id } }
    Scaffold(containerColor = c.bg, topBar = { ScreenBar("Send to", onBack, scrolled = scrolled) }) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(scroll)
                .padding(top = 12.dp, bottom = 48.dp),
        ) {
            OrbitCard(Modifier.padding(horizontal = OrbitDimens.gutter).fillMaxWidth()) {
                Column(Modifier.padding(OrbitDimens.rowPad), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    if (content.files.isNotEmpty()) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            OrbitIcon(if (content.files.all { it.type.startsWith("image/") }) OrbitIcon.Photo else OrbitIcon.File, size = 18.dp, tint = c.textSecondary)
                            Text(describeShared(content).replaceFirstChar { it.uppercase() }, Modifier.padding(start = 8.dp), style = OrbitType.label, color = c.text)
                        }
                    }
                    if (content.text.isNotBlank()) {
                        Text(content.text, style = OrbitType.bodyM, color = c.textSecondary, maxLines = 4, overflow = TextOverflow.Ellipsis)
                    }
                    if (content.skipped > 0) {
                        Text(
                            if (content.skipped == 1) "One item was left out: Treehouse can send photos, PDFs and text files, up to six at a time."
                            else "${content.skipped} items were left out: Treehouse can send photos, PDFs and text files, up to six at a time.",
                            style = OrbitType.bodyS,
                            color = c.textTertiary,
                        )
                    }
                }
            }

            if (rooms.isEmpty()) {
                Text(
                    "You don't have a room yet. Make one, then share again.",
                    Modifier.padding(start = OrbitDimens.gutter, end = OrbitDimens.gutter, top = OrbitDimens.section),
                    style = OrbitType.bodyM,
                    color = c.textSecondary,
                )
                Spacer(Modifier.height(OrbitDimens.section))
                PrimaryButton("New room", onNewRoom, Modifier.padding(horizontal = OrbitDimens.gutter))
                return@Column
            }

            SectionTitle(
                "Rooms",
                Modifier.padding(start = OrbitDimens.gutter, end = OrbitDimens.gutter, top = OrbitDimens.section, bottom = 8.dp),
            )
            rooms.forEachIndexed { index, room ->
                if (index > 0) Hairline(Modifier.padding(start = OrbitDimens.gutter + 56.dp + 14.dp))
                val crew = room.agentIds.mapNotNull(byId::get)
                Row(
                    Modifier.fillMaxWidth().tap(RectangleShape, 0.985f) { onPick(room) }.padding(horizontal = OrbitDimens.gutter, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    CrewTile(crew.map { it.avatar })
                    Column(Modifier.weight(1f).padding(start = 14.dp)) {
                        Text(room.name, style = OrbitType.titleM, color = c.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(
                            crew.joinToString(", ") { it.name },
                            Modifier.padding(top = 2.dp),
                            style = OrbitType.bodyS,
                            color = c.textTertiary,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    OrbitIcon(OrbitIcon.Chevron, size = 18.dp, tint = c.textTertiary)
                }
            }
        }
    }
}
