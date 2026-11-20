package dev.orbit.app.ui.screens

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.Icon
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.orbit.app.data.Agent
import dev.orbit.app.data.Room
import dev.orbit.app.ui.components.AgentAvatar
import dev.orbit.app.ui.components.BarAction
import dev.orbit.app.ui.components.OrbitField
import dev.orbit.app.ui.components.Overline
import dev.orbit.app.ui.components.PrimaryButton
import dev.orbit.app.ui.components.ScreenBar
import dev.orbit.app.ui.theme.Orbit
import dev.orbit.app.ui.theme.OrbitDimens
import dev.orbit.app.ui.theme.OrbitType

@Composable
fun RoomEditorScreen(
    initial: Room?,
    agents: List<Agent>,
    onSave: (Room) -> Unit,
    onDelete: (() -> Unit)?,
    onBack: () -> Unit,
) {
    val c = Orbit.colors
    var name by rememberSaveable { mutableStateOf(initial?.name.orEmpty()) }
    var selected by rememberSaveable { mutableStateOf(initial?.agentIds ?: emptyList()) }
    var mode by rememberSaveable { mutableStateOf(initial?.mode ?: Room.MODE_ROUNDTABLE) }
    var leadId by rememberSaveable { mutableStateOf(initial?.leadId) }

    val lead = leadId?.takeIf { it in selected } ?: selected.firstOrNull()
    val canSave = name.isNotBlank() && selected.isNotEmpty()
    fun save() = onSave(
        (initial ?: Room()).copy(
            name = name.trim(),
            agentIds = selected,
            mode = mode,
            leadId = if (mode == Room.MODE_LEAD) lead else null,
        ),
    )

    Scaffold(
        containerColor = c.bg,
        topBar = {
            ScreenBar(if (initial == null) "New room" else "Edit room", onBack) { BarAction("Save", ::save, enabled = canSave) }
        },
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .imePadding()
                .verticalScroll(rememberScrollState())
                .padding(start = OrbitDimens.gutter, end = OrbitDimens.gutter, top = 12.dp, bottom = 40.dp),
        ) {
            Overline("Name")
            Spacer(Modifier.height(10.dp))
            OrbitField(
                name, { name = it.take(60) }, "Launch plan",
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
            )

            Spacer(Modifier.height(28.dp))
            Overline("How they work")
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                ModeCard(
                    lead = false, title = "Round table", body = "Everyone replies in turn and can pull each other in.",
                    selected = mode == Room.MODE_ROUNDTABLE, modifier = Modifier.weight(1f),
                ) { mode = Room.MODE_ROUNDTABLE }
                ModeCard(
                    lead = true, title = "Lead", body = "One agent answers first, delegates, then sums up.",
                    selected = mode == Room.MODE_LEAD, modifier = Modifier.weight(1f),
                ) { mode = Room.MODE_LEAD }
            }

            Spacer(Modifier.height(28.dp))
            Overline("Crew", count = selected.size)
            Spacer(Modifier.height(10.dp))
            // One grouped list, rows separated by hairlines.
            val shape = RoundedCornerShape(OrbitDimens.radiusL)
            Column(Modifier.clip(shape).background(c.surface).border(1.dp, c.hairline, shape)) {
                agents.forEachIndexed { index, agent ->
                    if (index > 0) Box(Modifier.padding(start = 70.dp).fillMaxWidth().height(1.dp).background(c.hairline))
                    val isIn = agent.id in selected
                    AgentRow(
                        agent = agent,
                        selected = isIn,
                        leadBadge = if (mode == Room.MODE_LEAD && isIn) agent.id == lead else null,
                        onToggle = { selected = if (isIn) selected - agent.id else selected + agent.id },
                        onMakeLead = { leadId = agent.id },
                    )
                }
            }
            if (mode == Room.MODE_LEAD) {
                Text(
                    "Tap Lead on an agent to put them in charge.",
                    Modifier.padding(top = 10.dp, start = 4.dp),
                    style = OrbitType.bodyS,
                    color = c.textTertiary,
                )
            }

            Spacer(Modifier.height(28.dp))
            PrimaryButton(if (initial == null) "Open room" else "Save changes", ::save, enabled = canSave)
            if (onDelete != null) {
                TextButton(onClick = onDelete, Modifier.fillMaxWidth().padding(top = 6.dp)) {
                    Text("Delete room", style = OrbitType.label, color = c.danger)
                }
            }
        }
    }
}

@Composable
private fun ModeCard(lead: Boolean, title: String, body: String, selected: Boolean, modifier: Modifier, onClick: () -> Unit) {
    val c = Orbit.colors
    val shape = RoundedCornerShape(OrbitDimens.radiusL)
    Column(
        modifier
            .clip(shape)
            .background(if (selected) c.surfaceRaised else c.surface)
            .border(if (selected) 1.5.dp else 1.dp, if (selected) c.text else c.hairline, shape)
            .clickable(onClick = onClick)
            .padding(16.dp),
    ) {
        ModeGlyph(lead, if (selected) c.text else c.textTertiary)
        Spacer(Modifier.height(14.dp))
        Text(title, style = OrbitType.titleS.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold), color = c.text)
        Text(body, Modifier.padding(top = 4.dp), style = OrbitType.bodyS, color = c.textSecondary)
    }
}

/** A tiny diagram of the mode: peers around a table, or one node feeding two. */
@Composable
private fun ModeGlyph(lead: Boolean, color: Color) {
    Canvas(Modifier.size(width = 36.dp, height = 28.dp)) {
        val w = size.width
        val h = size.height
        val dot = h * 0.17f
        val line = Stroke(width = h * 0.06f, cap = StrokeCap.Round)
        val faint = color.copy(alpha = 0.4f)
        if (lead) {
            val top = Offset(w * 0.5f, dot)
            val left = Offset(w * 0.18f, h - dot)
            val right = Offset(w * 0.82f, h - dot)
            drawLine(faint, top, left, line.width, StrokeCap.Round)
            drawLine(faint, top, right, line.width, StrokeCap.Round)
            drawCircle(color, dot * 1.25f, top)
            drawCircle(color, dot, left)
            drawCircle(color, dot, right)
        } else {
            val center = Offset(w * 0.5f, h * 0.5f)
            val radius = h * 0.5f - dot
            drawCircle(faint, radius, center, style = line)
            for (angle in listOf(-90.0, 30.0, 150.0)) {
                val rad = Math.toRadians(angle)
                drawCircle(color, dot, Offset(center.x + radius * Math.cos(rad).toFloat(), center.y + radius * Math.sin(rad).toFloat()))
            }
        }
    }
}

/** [leadBadge]: null hides the badge, true marks this agent as lead, false offers to make it lead. */
@Composable
private fun AgentRow(agent: Agent, selected: Boolean, leadBadge: Boolean?, onToggle: () -> Unit, onMakeLead: () -> Unit) {
    val c = Orbit.colors
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onToggle).padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        AgentAvatar(agent.avatar, size = 42.dp)
        Column(Modifier.weight(1f).padding(horizontal = 14.dp)) {
            Text(agent.name, style = OrbitType.titleS.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold), color = c.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                listOf(agent.role, agent.model).filter { it.isNotBlank() }.joinToString("  ·  "),
                Modifier.padding(top = 2.dp),
                style = OrbitType.mono,
                color = c.textTertiary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        if (leadBadge != null) {
            Surface(
                onClick = onMakeLead,
                shape = CircleShape,
                color = if (leadBadge) c.text else Color.Transparent,
                contentColor = if (leadBadge) c.bg else c.textSecondary,
                border = if (leadBadge) null else androidx.compose.foundation.BorderStroke(1.dp, c.line),
            ) {
                Text("Lead", Modifier.padding(horizontal = 12.dp, vertical = 6.dp), style = OrbitType.label)
            }
            Spacer(Modifier.size(12.dp))
        }
        Box(
            Modifier
                .size(24.dp)
                .clip(CircleShape)
                .background(if (selected) c.primary else Color.Transparent)
                .border(1.5.dp, if (selected) Color.Transparent else c.line, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            if (selected) Icon(Icons.Default.Check, contentDescription = "Selected", Modifier.size(15.dp), tint = c.onPrimary)
        }
    }
}
