package dev.orbit.app.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.orbit.app.data.Agent
import dev.orbit.app.data.Room
import dev.orbit.app.ui.components.AgentAvatar
import dev.orbit.app.ui.components.OrbitField
import dev.orbit.app.ui.components.PrimaryButton
import dev.orbit.app.ui.components.ScreenBar
import dev.orbit.app.ui.components.SectionLabel

@Composable
fun RoomEditorScreen(
    initial: Room?,
    agents: List<Agent>,
    onSave: (Room) -> Unit,
    onDelete: (() -> Unit)?,
    onBack: () -> Unit,
) {
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
        topBar = {
            ScreenBar(if (initial == null) "New room" else "Edit room", onBack) {
                TextButton(onClick = ::save, enabled = canSave) { Text("Save", style = MaterialTheme.typography.titleMedium) }
            }
        },
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .imePadding()
                .verticalScroll(rememberScrollState())
                .padding(start = 20.dp, end = 20.dp, top = 8.dp, bottom = 32.dp),
        ) {
            SectionLabel("Room name")
            OrbitField(
                name, { name = it.take(60) }, "Launch plan",
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
            )

            Spacer(Modifier.height(24.dp))
            SectionLabel("How they work together")
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                ModeCard(
                    "Round table", "Everyone replies in turn and can pull each other in.",
                    mode == Room.MODE_ROUNDTABLE, Modifier.weight(1f),
                ) { mode = Room.MODE_ROUNDTABLE }
                ModeCard(
                    "Lead", "One agent answers first, delegates, then sums up.",
                    mode == Room.MODE_LEAD, Modifier.weight(1f),
                ) { mode = Room.MODE_LEAD }
            }

            Spacer(Modifier.height(24.dp))
            SectionLabel(if (mode == Room.MODE_LEAD) "Who's in · tap the badge to choose the lead" else "Who's in")
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                for (agent in agents) {
                    val isIn = agent.id in selected
                    AgentRow(
                        agent = agent,
                        selected = isIn,
                        leadBadge = when {
                            mode != Room.MODE_LEAD || !isIn -> null
                            else -> agent.id == lead
                        },
                        onToggle = { selected = if (isIn) selected - agent.id else selected + agent.id },
                        onMakeLead = { leadId = agent.id },
                    )
                }
            }

            Spacer(Modifier.height(28.dp))
            PrimaryButton(if (initial == null) "Open room" else "Save changes", ::save, enabled = canSave)
            if (onDelete != null) {
                TextButton(onClick = onDelete, Modifier.fillMaxWidth().padding(top = 8.dp)) {
                    Text("Delete room", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.titleSmall)
                }
            }
        }
    }
}

@Composable
private fun ModeCard(title: String, body: String, selected: Boolean, modifier: Modifier, onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        modifier = modifier,
        shape = MaterialTheme.shapes.large,
        color = if (selected) MaterialTheme.colorScheme.surfaceContainerHigh else MaterialTheme.colorScheme.surfaceContainerLow,
        border = BorderStroke(
            if (selected) 2.dp else 1.dp,
            if (selected) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.outlineVariant,
        ),
    ) {
        Column(Modifier.padding(14.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.height(4.dp))
            Text(body, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

/** [leadBadge]: null hides the badge, true marks this agent as lead, false offers to make it lead. */
@Composable
private fun AgentRow(agent: Agent, selected: Boolean, leadBadge: Boolean?, onToggle: () -> Unit, onMakeLead: () -> Unit) {
    Surface(
        onClick = onToggle,
        shape = MaterialTheme.shapes.large,
        color = if (selected) MaterialTheme.colorScheme.surfaceContainerHigh else MaterialTheme.colorScheme.surfaceContainerLow,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            AgentAvatar(agent.avatar, size = 44.dp)
            Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                Text(agent.name, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(
                    listOf(agent.role, agent.model).filter { it.isNotBlank() }.joinToString(" · "),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            if (leadBadge != null) {
                Surface(
                    onClick = onMakeLead,
                    shape = CircleShape,
                    color = if (leadBadge) MaterialTheme.colorScheme.secondary else Color.Transparent,
                    contentColor = if (leadBadge) MaterialTheme.colorScheme.onSecondary else MaterialTheme.colorScheme.onSurfaceVariant,
                    border = if (leadBadge) null else BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
                ) {
                    Text("Lead", Modifier.padding(horizontal = 12.dp, vertical = 6.dp), style = MaterialTheme.typography.labelMedium)
                }
                Spacer(Modifier.size(10.dp))
            }
            Box(
                Modifier
                    .size(26.dp)
                    .clip(CircleShape)
                    .background(if (selected) MaterialTheme.colorScheme.primary else Color.Transparent)
                    .border(1.5.dp, if (selected) Color.Transparent else MaterialTheme.colorScheme.outline, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                if (selected) {
                    Icon(Icons.Default.Check, contentDescription = "Selected", Modifier.size(16.dp), tint = MaterialTheme.colorScheme.onPrimary)
                }
            }
        }
    }
}
