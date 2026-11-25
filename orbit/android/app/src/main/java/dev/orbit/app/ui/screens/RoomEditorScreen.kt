package dev.orbit.app.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.orbit.app.data.Agent
import dev.orbit.app.data.Room
import dev.orbit.app.ui.components.AgentAvatar
import dev.orbit.app.ui.components.BarAction
import dev.orbit.app.ui.components.DangerRow
import dev.orbit.app.ui.components.FieldLabel
import dev.orbit.app.ui.components.Hairline
import dev.orbit.app.ui.components.OrbitField
import dev.orbit.app.ui.components.PrimaryButton
import dev.orbit.app.ui.components.OrbitCard
import dev.orbit.app.ui.components.OrbitIcon
import dev.orbit.app.ui.components.Pill
import dev.orbit.app.ui.components.ScreenBar
import dev.orbit.app.ui.components.lift
import dev.orbit.app.ui.components.surfaceBorder
import dev.orbit.app.ui.components.tap
import dev.orbit.app.ui.theme.Orbit
import dev.orbit.app.ui.theme.OrbitDimens
import dev.orbit.app.ui.theme.OrbitMotion
import dev.orbit.app.ui.theme.OrbitType
import dev.orbit.app.ui.theme.rememberHaptics
import kotlin.math.cos
import kotlin.math.sin

@Composable
fun RoomEditorScreen(
    initial: Room?,
    agents: List<Agent>,
    onSave: (Room) -> Unit,
    onDelete: (() -> Unit)?,
    onBack: () -> Unit,
    /**
     * Sets a new room up from the user's description ("Describe it"), then opens it. Calls back with an error
     * to show, or null once it's done.
     */
    onPlan: ((text: String, onDone: (error: String?) -> Unit) -> Unit)? = null,
) {
    val c = Orbit.colors
    val haptics = rememberHaptics()
    var name by rememberSaveable { mutableStateOf(initial?.name.orEmpty()) }
    var selected by rememberSaveable { mutableStateOf(initial?.agentIds ?: emptyList()) }
    var description by rememberSaveable { mutableStateOf(initial?.description.orEmpty()) }
    // New rooms start as best fit: calmer and cheaper than everyone answering every message.
    var mode by rememberSaveable { mutableStateOf(initial?.mode ?: Room.MODE_AUTO) }
    var leadId by rememberSaveable { mutableStateOf(initial?.leadId) }

    val lead = leadId?.takeIf { it in selected } ?: selected.firstOrNull()
    val leading = mode == Room.MODE_LEAD
    val canSave = name.isNotBlank() && selected.isNotEmpty()
    fun save() = onSave(
        (initial ?: Room()).copy(
            name = name.trim(), agentIds = selected, mode = mode, leadId = if (leading) lead else null, description = description.trim(),
        ),
    )
    fun choose(next: String) {
        if (next != mode) haptics.tick()
        mode = next
    }

    val scroll = rememberScrollState()
    Scaffold(
        containerColor = c.bg,
        topBar = {
            ScreenBar(if (initial == null) "New room" else "Edit room", onBack, scrolled = scroll.value > 0) {
                BarAction(if (initial == null) "Create" else "Save", ::save, enabled = canSave)
            }
        },
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .imePadding()
                .verticalScroll(scroll)
                .padding(start = OrbitDimens.gutter, end = OrbitDimens.gutter, top = 12.dp, bottom = 48.dp),
        ) {
            if (initial == null && onPlan != null && agents.isNotEmpty()) {
                DescribeRoom(onPlan)
                Text(
                    "Or set it up yourself",
                    Modifier.padding(top = OrbitDimens.section, bottom = 10.dp),
                    style = OrbitType.label,
                    color = c.textTertiary,
                )
            }
            FieldLabel("Name")
            OrbitField(
                name, { name = it.take(60) }, "Launch plan",
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
            )

            Spacer(Modifier.height(OrbitDimens.section))
            FieldLabel("Description")
            OrbitField(
                description, { description = it.take(2000) },
                "What this room is for, and rules for everyone in it. For example: We're planning a trip to Japan in April. Keep replies short.",
                singleLine = false, minLines = 3,
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
            )
            Text(
                "Every agent in this room reads it before answering.",
                Modifier.padding(top = 8.dp),
                style = OrbitType.caption,
                color = c.textTertiary,
            )

            // The main chat is always the user and their main agent: no mode, crew or deleting here.
            val isMain = initial?.main == true
            if (!isMain) {
            Spacer(Modifier.height(OrbitDimens.section))
            FieldLabel("Who answers")
            // The cards take the height of the tallest one.
            Row(Modifier.height(IntrinsicSize.Max), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ModeCard(
                    Room.MODE_AUTO, title = "Best fit", body = "Only who fits each message replies.",
                    selected = mode == Room.MODE_AUTO, modifier = Modifier.weight(1f).fillMaxHeight(),
                ) { choose(Room.MODE_AUTO) }
                ModeCard(
                    Room.MODE_LEAD, title = "Lead", body = "One answers, delegates, sums up.",
                    selected = leading, modifier = Modifier.weight(1f).fillMaxHeight(),
                ) { choose(Room.MODE_LEAD) }
                ModeCard(
                    Room.MODE_ROUNDTABLE, title = "Round table", body = "Everyone replies in turn.",
                    selected = mode == Room.MODE_ROUNDTABLE, modifier = Modifier.weight(1f).fillMaxHeight(),
                ) { choose(Room.MODE_ROUNDTABLE) }
            }

            Spacer(Modifier.height(OrbitDimens.section))
            FieldLabel("Crew")
            // One grouped list, rows parted by hairlines.
            val shape = RoundedCornerShape(OrbitDimens.radiusL)
            Column(Modifier.lift(shape).clip(shape).background(c.surface).border(surfaceBorder(), shape)) {
                agents.forEachIndexed { index, agent ->
                    if (index > 0) Hairline(Modifier.padding(start = OrbitDimens.rowPad + 42.dp + 14.dp))
                    val isIn = agent.id in selected
                    AgentRow(agent, selected = isIn) {
                        haptics.toggle(!isIn)
                        selected = if (isIn) selected - agent.id else selected + agent.id
                    }
                }
            }

            // Picking the lead only matters in a lead room with more than one agent.
            AnimatedVisibility(leading && selected.size > 1, enter = expandVertically() + fadeIn(), exit = shrinkVertically() + fadeOut()) {
                Column {
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
            }

            }

            if (onDelete != null && !isMain) {
                Spacer(Modifier.height(40.dp))
                DangerRow("Delete room", onDelete)
            }
        }
    }
}

@Composable
private fun ModeCard(kind: String, title: String, body: String, selected: Boolean, modifier: Modifier, onClick: () -> Unit) {
    val c = Orbit.colors
    val shape = RoundedCornerShape(OrbitDimens.radiusL)
    val edge by animateColorAsState(if (selected) c.text else c.hairline, OrbitMotion.snappy(), label = "edge")
    val width by animateDpAsState(if (selected) 1.5.dp else 1.dp, OrbitMotion.snappy(), label = "width")
    val ink by animateColorAsState(if (selected) c.text else c.textTertiary, OrbitMotion.snappy(), label = "ink")
    val spread by animateFloatAsState(if (selected) 1f else 0.82f, OrbitMotion.bouncy(), label = "spread")
    Column(
        modifier
            .lift(shape, if (selected) 1f else 0.4f)
            .tap(shape, 0.97f, onClick)
            .background(c.surface)
            .border(width, edge, shape)
            .padding(start = 14.dp, end = 12.dp, top = 14.dp, bottom = 14.dp),
    ) {
        ModeGlyph(kind, ink, spread)
        Spacer(Modifier.height(14.dp))
        Text(title, style = OrbitType.titleS, color = c.text)
        Text(body, Modifier.padding(top = 4.dp), style = OrbitType.bodyS, color = c.textSecondary)
    }
}

/**
 * A tiny diagram of the mode: one of three stepping forward, one node feeding two, or peers around a
 * table. Selecting it opens it out.
 */
@Composable
private fun ModeGlyph(kind: String, color: Color, spread: Float) {
    Canvas(Modifier.size(width = 36.dp, height = 28.dp)) {
        val w = size.width
        val h = size.height
        val dot = h * 0.17f
        val line = Stroke(width = 1.75.dp.toPx(), cap = StrokeCap.Round)
        val faint = color.copy(alpha = 0.4f)
        if (kind == Room.MODE_AUTO) {
            // Three in a row; the one that fits rises and grows.
            val y = h - dot * 1.4f
            drawCircle(faint, dot, Offset(w * 0.18f, y))
            drawCircle(faint, dot, Offset(w * 0.82f, y))
            drawCircle(color, dot * (1f + 0.35f * spread), Offset(w * 0.5f, y - (h * 0.42f) * spread))
        } else if (kind == Room.MODE_LEAD) {
            val top = Offset(w * 0.5f, dot * 1.25f)
            val left = Offset(w * (0.5f - 0.32f * spread), h - dot)
            val right = Offset(w * (0.5f + 0.32f * spread), h - dot)
            drawLine(faint, top, left, line.width, StrokeCap.Round)
            drawLine(faint, top, right, line.width, StrokeCap.Round)
            drawCircle(color, dot * 1.25f, top)
            drawCircle(color, dot, left)
            drawCircle(color, dot, right)
        } else {
            val center = Offset(w * 0.5f, h * 0.5f)
            val radius = (h * 0.5f - dot) * spread
            drawCircle(faint, radius, center, style = line)
            for (angle in listOf(-90.0, 30.0, 150.0)) {
                val rad = Math.toRadians(angle + (1 - spread) * 120)
                drawCircle(color, dot, Offset(center.x + radius * cos(rad).toFloat(), center.y + radius * sin(rad).toFloat()))
            }
        }
    }
}

@Composable
private fun AgentRow(agent: Agent, selected: Boolean, onToggle: () -> Unit) {
    val c = Orbit.colors
    Row(
        Modifier.fillMaxWidth().tap(RectangleShape, 0.985f, onToggle).padding(horizontal = OrbitDimens.rowPad, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        AgentAvatar(agent.avatar, size = 42.dp)
        Column(Modifier.weight(1f).padding(horizontal = 14.dp)) {
            Text(agent.name, style = OrbitType.titleS, color = c.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
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
        CheckCircle(selected)
    }
}

/** A round checkbox whose tick springs in. */
@Composable
private fun CheckCircle(checked: Boolean) {
    val c = Orbit.colors
    val fill by animateColorAsState(if (checked) c.primary else Color.Transparent, OrbitMotion.snappy(), label = "fill")
    val edge by animateColorAsState(if (checked) Color.Transparent else c.line, OrbitMotion.snappy(), label = "edge")
    Box(
        Modifier.size(24.dp).clip(CircleShape).background(fill).border(1.5.dp, edge, CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        AnimatedVisibility(checked, enter = scaleIn(OrbitMotion.bouncy(), initialScale = 0.3f) + fadeIn(), exit = scaleOut(targetScale = 0.3f) + fadeOut()) {
            OrbitIcon(OrbitIcon.Check, size = 14.dp, tint = c.onPrimary, description = "In this room")
        }
    }
}

/** "Describe it": the user says what the room is for, in their own words, and the hub sets it up. */
@Composable
private fun DescribeRoom(onPlan: (text: String, onDone: (error: String?) -> Unit) -> Unit) {
    val c = Orbit.colors
    var text by rememberSaveable { mutableStateOf("") }
    var planning by rememberSaveable { mutableStateOf(false) }
    var error by rememberSaveable { mutableStateOf<String?>(null) }
    OrbitCard(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(OrbitDimens.rowPad)) {
            Text("Describe it", style = OrbitType.titleS, color = c.text)
            Text(
                "Say what the room is for and who should be in it, and Treehouse sets it up. Tap the mic on your keyboard to say it out loud.",
                Modifier.padding(top = 4.dp, bottom = 12.dp),
                style = OrbitType.bodyM,
                color = c.textSecondary,
            )
            OrbitField(
                text, { text = it.take(2000); error = null },
                "A room with Nova and Atlas for planning my trip to Japan. Keep it practical.",
                singleLine = false, minLines = 3,
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
            )
            error?.let { Text(it, Modifier.padding(top = 8.dp), style = OrbitType.caption, color = c.danger) }
            PrimaryButton(
                if (planning) "Setting it up" else "Set it up",
                {
                    planning = true
                    error = null
                    onPlan(text.trim()) { problem ->
                        planning = false
                        error = problem
                    }
                },
                Modifier.fillMaxWidth().padding(top = 12.dp),
                enabled = text.isNotBlank() && !planning,
                loading = planning,
            )
        }
    }
}
