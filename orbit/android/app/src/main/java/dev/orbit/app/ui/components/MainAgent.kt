package dev.orbit.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.orbit.app.data.Agent
import dev.orbit.app.data.Room
import dev.orbit.app.ui.theme.Orbit
import dev.orbit.app.ui.theme.OrbitDimens
import dev.orbit.app.ui.theme.OrbitType
import dev.orbit.app.ui.theme.rememberHaptics

/**
 * On an agent's page: whether it's the user's main agent, who keeps up with every room and has the main chat, and
 * the way to make it main or stop. [current] is the main agent now, if it's someone else.
 */
@Composable
fun MainAgentPanel(agent: Agent, isMain: Boolean, current: Agent?, busy: Boolean, onMake: () -> Unit, onStop: () -> Unit) {
    val c = Orbit.colors
    Column(
        Modifier
            .fillMaxWidth()
            .quietCard(RoundedCornerShape(OrbitDimens.radiusL))
            .padding(OrbitDimens.rowPad),
    ) {
        Text(
            if (isMain) "${agent.name} is your main agent" else "Make ${agent.name} your main agent",
            style = OrbitType.titleS,
            color = c.text,
        )
        Text(
            when {
                isMain -> "${agent.name} keeps up with every room, even ones they're not in, and has a chat with you at the top of Home. Check-ins and the morning brief arrive there."
                current != null -> "${current.name} is your main agent now. ${agent.name} would take over the main chat and keep up with every room."
                else -> "A main agent keeps up with every room, even ones they're not in, and gets a chat with you at the top of Home. Ask them about anything going on anywhere."
            },
            Modifier.padding(top = 4.dp),
            style = OrbitType.bodyS,
            color = c.textSecondary,
        )
        Spacer(Modifier.height(14.dp))
        if (isMain) {
            Pill("Stop being main agent", onStop)
        } else {
            PrimaryButton("Make main agent", onMake, loading = busy)
        }
    }
}

/**
 * Before an agent becomes main: the rooms it's in, each ticked to step out of, since it sees them anyway. Rooms
 * where it's the only agent aren't listed; it stays in those.
 */
@Composable
fun MainAgentSheet(agent: Agent, rooms: List<Room>, agentOf: (String) -> Agent?, onDismiss: () -> Unit, onConfirm: (leave: List<String>) -> Unit) {
    OrbitSheet(onDismiss) { MainAgentChoice(agent, rooms, agentOf, onConfirm) }
}

/** What [MainAgentSheet] holds. */
@Composable
fun MainAgentChoice(agent: Agent, rooms: List<Room>, agentOf: (String) -> Agent?, onConfirm: (leave: List<String>) -> Unit) {
    val c = Orbit.colors
    val haptics = rememberHaptics()
    val removable = remember(rooms, agent.id) { rooms.filter { !it.main && agent.id in it.agentIds && it.agentIds.size > 1 } }
    var leave by remember(removable) { mutableStateOf(removable.map { it.id }.toSet()) }
    run {
        Column(Modifier.padding(horizontal = OrbitDimens.gutter)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                AgentPortrait(agent.avatar, size = 48.dp)
                Column(Modifier.padding(start = 14.dp).weight(1f)) {
                    Text("Make ${agent.name} your main agent", style = OrbitType.titleM, color = c.text)
                    Text("They'll keep up with every room from the main chat.", style = OrbitType.bodyS, color = c.textSecondary)
                }
            }
            if (removable.isNotEmpty()) {
                Text(
                    "${agent.name} sees every room now, so they don't need to sit in them. Take them out of:",
                    Modifier.padding(top = 18.dp, bottom = 8.dp),
                    style = OrbitType.bodyM,
                    color = c.textSecondary,
                )
                Column(
                    Modifier
                        .fillMaxWidth()
                        .heightIn(max = 340.dp)
                        .clip(RoundedCornerShape(OrbitDimens.radiusL))
                        .background(c.surfaceRaised)
                        .verticalScroll(rememberScrollState()),
                ) {
                    removable.forEachIndexed { i, room ->
                        if (i > 0) Hairline(Modifier.padding(start = OrbitDimens.rowPad + 50.dp))
                        val others = room.agentIds.filter { it != agent.id }.mapNotNull(agentOf)
                        val on = room.id in leave
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .toggleable(on, role = Role.Switch) {
                                    haptics.tick()
                                    leave = if (it) leave + room.id else leave - room.id
                                }
                                .padding(horizontal = OrbitDimens.rowPad, vertical = 12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            GroupPortrait(others.map { it.avatar }, size = 36.dp, ring = c.surfaceRaised)
                            Column(Modifier.weight(1f).padding(start = 14.dp)) {
                                Text(room.name, style = OrbitType.titleS, color = c.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                val stay = "${others.joinToString { it.name }} ${if (others.size == 1) "stays" else "stay"}"
                                Text(
                                    if (room.mode == Room.MODE_LEAD && room.leadId == agent.id) "${agent.name} leads it · $stay" else stay,
                                    style = OrbitType.caption,
                                    color = c.textTertiary,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                            OrbitSwitch(on, Modifier.padding(start = 12.dp))
                        }
                    }
                }
                Text(
                    "Leave on the rooms where ${agent.name} does real work. They stay in rooms where they're the only agent.",
                    Modifier.padding(top = 8.dp, start = 4.dp, end = 4.dp),
                    style = OrbitType.caption,
                    color = c.textTertiary,
                )
            }
            Row(Modifier.padding(top = 20.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                PrimaryButton(
                    if (leave.isEmpty()) "Make main agent" else "Make main agent, leave ${leave.size} ${if (leave.size == 1) "room" else "rooms"}",
                    { onConfirm(removable.filter { it.id in leave }.map { it.id }) },
                )
            }
        }
    }
}
