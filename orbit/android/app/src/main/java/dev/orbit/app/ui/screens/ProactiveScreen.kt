package dev.orbit.app.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.orbit.app.data.Agent
import dev.orbit.app.data.FollowUp
import dev.orbit.app.data.ProactiveSettings
import dev.orbit.app.data.Watch
import dev.orbit.app.ui.AppState
import dev.orbit.app.ui.components.AgentAvatar
import dev.orbit.app.ui.components.FieldLabel
import dev.orbit.app.ui.components.Hairline
import dev.orbit.app.ui.components.OrbitCard
import dev.orbit.app.ui.components.OrbitIcon
import dev.orbit.app.ui.components.OrbitSwitch
import dev.orbit.app.ui.components.Pill
import dev.orbit.app.ui.components.ScreenBar
import dev.orbit.app.ui.components.SectionTitle
import dev.orbit.app.ui.components.tap
import dev.orbit.app.ui.theme.Orbit
import dev.orbit.app.ui.theme.OrbitDimens
import dev.orbit.app.ui.theme.OrbitType
import dev.orbit.app.ui.theme.rememberHaptics
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/** "21:00 to 08:00 · up to 6 a day", for the row in Settings. */
fun describeProactive(settings: ProactiveSettings, agents: List<Agent>): String {
    val reaching = agents.count { it.proactive != Agent.PROACTIVE_OFF }
    val who = when (reaching) {
        0 -> "No agent reaches out yet"
        1 -> "1 agent reaches out"
        else -> "$reaching agents reach out"
    }
    return if (settings.brief.enabled) "$who · brief at ${settings.brief.time}" else who
}

private fun hourOf(time: String) = time.take(2).toIntOrNull() ?: 0
private fun timeAt(hour: Int) = "%02d:00".format(hour)

/** "Fri 9:00 AM" for a follow-up, in this phone's time zone. */
internal fun followUpTime(at: Long, zone: ZoneId = ZoneId.systemDefault()): String =
    DateTimeFormatter.ofPattern("EEE h:mm a", Locale.getDefault()).format(Instant.ofEpochMilli(at).atZone(zone))

/**
 * Agents that speak first: who reaches out, quiet hours, a daily limit, the morning brief, and the
 * follow-ups and watches agents have set, which can be cancelled here.
 */
@Composable
fun ProactiveScreen(
    state: AppState,
    onSave: (ProactiveSettings) -> Unit,
    onEditAgent: (Agent) -> Unit,
    onCancelFollowUp: (FollowUp) -> Unit,
    onStopWatch: (Watch) -> Unit,
    onBack: () -> Unit,
) {
    val c = Orbit.colors
    val haptics = rememberHaptics()
    val scroll = rememberScrollState()
    val settings = state.proactive
    fun save(next: ProactiveSettings) {
        if (next != settings) haptics.tick()
        onSave(next)
    }
    Scaffold(containerColor = c.bg, topBar = { ScreenBar("Proactive", onBack, scrolled = scroll.value > 0) }) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).verticalScroll(scroll).padding(top = 4.dp, bottom = 48.dp)) {
            Column(Modifier.padding(horizontal = OrbitDimens.gutter)) {
                Text(
                    "Agents set to reach out write to you on their own when something is worth it: a deadline coming up, a plan " +
                        "for today, a follow-up they promised. It shows on Home and as a notification.",
                    style = OrbitType.bodyM,
                    color = c.textSecondary,
                )

                SectionTitle("Who reaches out", Modifier.padding(top = OrbitDimens.section, bottom = 8.dp))
                OrbitCard(Modifier.fillMaxWidth()) {
                    Column {
                        if (state.agents.isEmpty()) {
                            Text("No agents yet.", Modifier.padding(OrbitDimens.rowPad), style = OrbitType.bodyM, color = c.textSecondary)
                        }
                        state.agents.forEachIndexed { index, agent ->
                            if (index > 0) Hairline()
                            Row(
                                Modifier.fillMaxWidth().tap(RectangleShape, 0.985f) { onEditAgent(agent) }
                                    .padding(start = OrbitDimens.rowPad, end = 8.dp).heightIn(min = 60.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                AgentAvatar(agent.avatar, size = 34.dp)
                                Text(agent.name, Modifier.weight(1f).padding(start = 12.dp), style = OrbitType.titleS, color = c.text)
                                Text(
                                    when (agent.proactive) {
                                        Agent.PROACTIVE_GENTLE -> "Gentle"
                                        Agent.PROACTIVE_ACTIVE -> "Active"
                                        else -> "Off"
                                    },
                                    style = OrbitType.label,
                                    color = if (agent.proactive == Agent.PROACTIVE_OFF) c.textTertiary else c.text,
                                )
                                OrbitIcon(OrbitIcon.Chevron, Modifier.padding(start = 4.dp), size = 18.dp, tint = c.textTertiary)
                            }
                        }
                    }
                }
                Text(
                    "Gentle is about once a day, Active a few times a day. Most of the time there's nothing worth saying, and they stay quiet.",
                    Modifier.padding(top = OrbitDimens.labelGap),
                    style = OrbitType.bodyS,
                    color = c.textTertiary,
                )

                SectionTitle("Morning brief", Modifier.padding(top = OrbitDimens.section, bottom = 8.dp))
                OrbitCard(Modifier.fillMaxWidth(), onClick = { save(settings.copy(brief = settings.brief.copy(enabled = !settings.brief.enabled))) }) {
                    Row(Modifier.fillMaxWidth().padding(start = OrbitDimens.rowPad, end = OrbitDimens.rowPad, top = 14.dp, bottom = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f).padding(end = 12.dp)) {
                            Text("A short note each morning", style = OrbitType.titleS, color = c.text)
                            Text(
                                "Your day, what the crew is working on, and anything that needs you. With Google, your calendar and email too.",
                                Modifier.padding(top = 2.dp),
                                style = OrbitType.bodyS,
                                color = c.textSecondary,
                            )
                        }
                        OrbitSwitch(settings.brief.enabled)
                    }
                }
            }
            AnimatedVisibility(settings.brief.enabled, enter = expandVertically() + fadeIn(), exit = shrinkVertically() + fadeOut()) {
                Column {
                    FieldLabel("At", Modifier.padding(start = OrbitDimens.gutter, top = 16.dp))
                    HourRow((5..11).toList(), hourOf(settings.brief.time)) { save(settings.copy(brief = settings.brief.copy(time = timeAt(it)))) }
                    FieldLabel("From", Modifier.padding(start = OrbitDimens.gutter, top = 16.dp))
                    val writer = state.agent(settings.brief.agentId) ?: state.introRoom?.agentIds?.firstOrNull()?.let(state::agent) ?: state.agents.firstOrNull()
                    LazyRow(
                        Modifier.padding(top = 8.dp),
                        contentPadding = PaddingValues(horizontal = OrbitDimens.gutter),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        items(state.agents, key = { it.id }) { agent ->
                            Pill(agent.name, { save(settings.copy(brief = settings.brief.copy(agentId = agent.id))) }, selected = agent.id == writer?.id)
                        }
                    }
                }
            }

            SectionTitle("Quiet hours", Modifier.padding(start = OrbitDimens.gutter, end = OrbitDimens.gutter, top = OrbitDimens.section, bottom = 0.dp))
            val noQuiet = settings.quietStart == settings.quietEnd
            Row(Modifier.padding(horizontal = OrbitDimens.gutter), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    if (noQuiet) "None" else "${settings.quietStart} to ${settings.quietEnd}",
                    Modifier.weight(1f),
                    style = OrbitType.display,
                    color = c.text,
                )
                // Both ends the same hour means no quiet hours.
                Pill(if (noQuiet) "Set hours" else "None", { save(if (noQuiet) settings.copy(quietStart = "21:00", quietEnd = "08:00") else settings.copy(quietStart = "00:00", quietEnd = "00:00")) })
            }
            FieldLabel("From", Modifier.padding(start = OrbitDimens.gutter, top = 12.dp))
            HourRow((0..23).toList(), hourOf(settings.quietStart)) { save(settings.copy(quietStart = timeAt(it))) }
            FieldLabel("Until", Modifier.padding(start = OrbitDimens.gutter, top = 16.dp))
            HourRow((0..23).toList(), hourOf(settings.quietEnd)) { save(settings.copy(quietEnd = timeAt(it))) }
            Text(
                "No check-ins, regular updates or watch checks then; they pick up after. A one-time follow-up still arrives.",
                Modifier.padding(start = OrbitDimens.gutter, end = OrbitDimens.gutter, top = OrbitDimens.labelGap),
                style = OrbitType.bodyS,
                color = c.textTertiary,
            )

            SectionTitle("Check-ins at most", Modifier.padding(start = OrbitDimens.gutter, end = OrbitDimens.gutter, top = OrbitDimens.section, bottom = 8.dp))
            Row(Modifier.padding(horizontal = OrbitDimens.gutter), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                for (n in listOf(2, 6, 10, 20)) Pill("$n a day", { save(settings.copy(dailyLimit = n)) }, selected = settings.dailyLimit == n)
            }
            Text(
                "Only for messages nobody asked for. Updates, follow-ups and watches you ask for always come through.",
                Modifier.padding(start = OrbitDimens.gutter, end = OrbitDimens.gutter, top = OrbitDimens.labelGap),
                style = OrbitType.bodyS,
                color = c.textTertiary,
            )

            if (state.followUps.isNotEmpty() || state.watches.isNotEmpty()) {
                Column(Modifier.padding(horizontal = OrbitDimens.gutter)) {
                    SectionTitle("Coming up", Modifier.padding(top = OrbitDimens.section, bottom = 8.dp))
                    OrbitCard(Modifier.fillMaxWidth()) {
                        Column {
                            val rows = state.followUps.sortedBy { it.at }.map { it as Any } + state.watches
                            rows.forEachIndexed { index, row ->
                                if (index > 0) Hairline()
                                when (row) {
                                    is FollowUp -> PlanRow(
                                        OrbitIcon.Clock,
                                        row.note,
                                        "${state.agent(row.agentId)?.name ?: "An agent"} · " +
                                            (row.every?.let { "every $it, next ${followUpTime(row.at)}" } ?: followUpTime(row.at)),
                                        "Cancel",
                                    ) { onCancelFollowUp(row) }
                                    is Watch -> PlanRow(
                                        OrbitIcon.Bell,
                                        row.what + if (row.condition.isNotBlank()) ", when ${row.condition}" else "",
                                        "${state.agent(row.agentId)?.name ?: "An agent"} checks every ${row.every}" +
                                            if (row.lastFinding.isNotBlank()) ". Last: ${row.lastFinding}" else "",
                                        "Stop",
                                    ) { onStopWatch(row) }
                                }
                            }
                        }
                    }
                    Text(
                        "Agents set these when you ask them to check back or keep an eye on something.",
                        Modifier.padding(top = OrbitDimens.labelGap),
                        style = OrbitType.bodyS,
                        color = c.textTertiary,
                    )
                }
            }
        }
    }
}

@Composable
private fun PlanRow(icon: OrbitIcon, title: String, detail: String, action: String, onAction: () -> Unit) {
    val c = Orbit.colors
    Row(Modifier.fillMaxWidth().heightIn(min = 60.dp).padding(start = OrbitDimens.rowPad, end = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        OrbitIcon(icon, size = 20.dp, tint = c.text)
        Column(Modifier.weight(1f).padding(start = 14.dp, end = 8.dp, top = 10.dp, bottom = 10.dp)) {
            Text(title, style = OrbitType.titleS, color = c.text, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text(detail, Modifier.padding(top = 2.dp), style = OrbitType.bodyS, color = c.textSecondary, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
        Text(action, Modifier.tap(CircleShape, 0.94f, onAction).padding(horizontal = 10.dp, vertical = 12.dp), style = OrbitType.label, color = c.textSecondary)
    }
}

/** Hours to pick one from, scrolled so the chosen one is in view. */
@Composable
private fun HourRow(hours: List<Int>, selected: Int, onPick: (Int) -> Unit) {
    val list = rememberLazyListState(initialFirstVisibleItemIndex = (hours.indexOf(selected) - 2).coerceAtLeast(0))
    LazyRow(
        Modifier.padding(top = 8.dp),
        state = list,
        contentPadding = PaddingValues(horizontal = OrbitDimens.gutter),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        items(hours, key = { it }) { hour -> Pill("%02d:00".format(hour), { onPick(hour) }, selected = hour == selected, textStyle = OrbitType.mono) }
    }
}
