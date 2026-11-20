package dev.orbit.app.ui.screens

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
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
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
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
import dev.orbit.app.ui.components.FieldLabel
import dev.orbit.app.ui.components.Hairline
import dev.orbit.app.ui.components.OrbitField
import dev.orbit.app.ui.components.OrbitIcon
import dev.orbit.app.ui.components.Pill
import dev.orbit.app.ui.components.ScreenBar
import dev.orbit.app.ui.theme.Orbit
import dev.orbit.app.ui.theme.OrbitDimens
import dev.orbit.app.ui.theme.OrbitType
import kotlin.math.cos
import kotlin.math.sin

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
    val leading = mode == Room.MODE_LEAD
    val canSave = name.isNotBlank() && selected.isNotEmpty()
    fun save() = onSave(
        (initial ?: Room()).copy(name = name.trim(), agentIds = selected, mode = mode, leadId = if (leading) lead else null),
    )

    Scaffold(
        containerColor = c.bg,
        topBar = {
            ScreenBar(if (initial == null) "New room" else "Edit room", onBack) {
                BarAction(if (initial == null) "Create" else "Save", ::save, enabled = canSave)
            }
        },
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .imePadding()
                .verticalScroll(rememberScrollState())
                .padding(start = OrbitDimens.gutter, end = OrbitDimens.gutter, top = 12.dp, bottom = 48.dp),
        ) {
            FieldLabel("Name")
            OrbitField(
                name, { name = it.take(60) }, "Launch plan",
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
            )

            Spacer(Modifier.height(OrbitDimens.section))
            FieldLabel("How they work")
            // Both cards take the height of the taller one.
            Row(Modifier.height(IntrinsicSize.Max), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                ModeCard(
                    lead = false, title = "Round table", body = "Everyone replies in turn.",
                    selected = !leading, modifier = Modifier.weight(1f).fillMaxHeight(),
                ) { mode = Room.MODE_ROUNDTABLE }
                ModeCard(
                    lead = true, title = "Lead", body = "One agent answers first, delegates, then sums up.",
                    selected = leading, modifier = Modifier.weight(1f).fillMaxHeight(),
                ) { mode = Room.MODE_LEAD }
            }

            Spacer(Modifier.height(OrbitDimens.section))
            FieldLabel(if (selected.isEmpty()) "Crew" else "Crew · ${selected.size}")
            // One grouped list, rows parted by hairlines.
            val shape = RoundedCornerShape(OrbitDimens.radiusL)
            Column(Modifier.clip(shape).background(c.surface).border(1.dp, c.hairline, shape)) {
                agents.forEachIndexed { index, agent ->
                    if (index > 0) Hairline(Modifier.padding(start = OrbitDimens.rowPad + 42.dp + 14.dp))
                    val isIn = agent.id in selected
                    AgentRow(agent, selected = isIn, isLead = leading && agent.id == lead) {
                        selected = if (isIn) selected - agent.id else selected + agent.id
                    }
                }
            }

            if (leading && selected.size > 1) {
                Spacer(Modifier.height(OrbitDimens.section))
                FieldLabel("Lead")
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    for (agent in agents.filter { it.id in selected }) {
                        Pill(
                            agent.name,
                            onClick = { leadId = agent.id },
                            selected = agent.id == lead,
                            leading = { AgentAvatar(agent.avatar, size = 26.dp) },
                        )
                    }
                }
            }

            if (onDelete != null) {
                Spacer(Modifier.height(40.dp))
                DangerRow("Delete room", onDelete)
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
            .background(c.surface)
            .border(if (selected) 1.5.dp else 1.dp, if (selected) c.text else c.hairline, shape)
            .clickable(onClick = onClick)
            .padding(OrbitDimens.rowPad),
    ) {
        ModeGlyph(lead, if (selected) c.text else c.textTertiary)
        Spacer(Modifier.height(14.dp))
        Text(title, style = OrbitType.titleS, color = c.text)
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
        val line = Stroke(width = 1.75.dp.toPx(), cap = StrokeCap.Round)
        val faint = color.copy(alpha = 0.4f)
        if (lead) {
            val top = Offset(w * 0.5f, dot * 1.25f)
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
                drawCircle(color, dot, Offset(center.x + radius * cos(rad).toFloat(), center.y + radius * sin(rad).toFloat()))
            }
        }
    }
}

@Composable
private fun AgentRow(agent: Agent, selected: Boolean, isLead: Boolean, onToggle: () -> Unit) {
    val c = Orbit.colors
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onToggle).padding(horizontal = OrbitDimens.rowPad, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        AgentAvatar(agent.avatar, size = 42.dp)
        Column(Modifier.weight(1f).padding(horizontal = 14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(agent.name, Modifier.weight(1f, fill = false), style = OrbitType.titleS, color = c.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (isLead) {
                    Text(
                        "Lead",
                        Modifier.padding(start = 8.dp).clip(CircleShape).background(c.surfaceHigh).padding(horizontal = 8.dp, vertical = 2.dp),
                        style = OrbitType.caption,
                        color = c.text,
                    )
                }
            }
            if (agent.role.isNotBlank()) {
                Text(
                    agent.role,
                    Modifier.padding(top = 2.dp),
                    style = OrbitType.bodyS,
                    color = c.textSecondary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        Box(
            Modifier
                .size(24.dp)
                .clip(CircleShape)
                .background(if (selected) c.primary else Color.Transparent)
                .border(1.5.dp, if (selected) Color.Transparent else c.line, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            if (selected) OrbitIcon(OrbitIcon.Check, size = 14.dp, tint = c.onPrimary, description = "In this room")
        }
    }
}
