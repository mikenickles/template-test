package dev.orbit.app.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.orbit.app.data.Agent
import dev.orbit.app.data.Room
import dev.orbit.app.ui.AppState
import dev.orbit.app.ui.components.AgentAvatar
import dev.orbit.app.ui.components.CrewTile
import dev.orbit.app.ui.components.Hairline
import dev.orbit.app.ui.components.LogoMark
import dev.orbit.app.ui.components.OrbitCard
import dev.orbit.app.ui.components.OrbitIcon
import dev.orbit.app.ui.components.Overline
import dev.orbit.app.ui.components.Pill
import dev.orbit.app.ui.components.PrimaryButton
import dev.orbit.app.ui.components.StatusDot
import dev.orbit.app.ui.components.tap
import dev.orbit.app.ui.theme.Orbit
import dev.orbit.app.ui.theme.OrbitDimens
import dev.orbit.app.ui.theme.OrbitType
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private val RoomTile = 56.dp
private val CrewItem = 76.dp
private val CrewAvatar = 60.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    state: AppState,
    onOpenRoom: (Room) -> Unit,
    onNewRoom: () -> Unit,
    onNewAgent: () -> Unit,
    onEditAgent: (Agent) -> Unit,
    onSettings: () -> Unit,
    onRefresh: () -> Unit,
    now: Long = System.currentTimeMillis(),
) {
    val c = Orbit.colors
    Scaffold(
        containerColor = c.bg,
        floatingActionButton = {
            if (state.agents.isNotEmpty() && state.rooms.isNotEmpty()) NewRoomButton(onNewRoom)
        },
    ) { padding ->
        PullToRefreshBox(
            isRefreshing = state.refreshing && state.loaded,
            onRefresh = onRefresh,
            modifier = Modifier.fillMaxSize().padding(padding),
        ) {
            LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 104.dp)) {
                item { Header(state, onSettings) }
                if (state.offline) item { OfflineNotice(onRefresh) }

                item {
                    SectionHeader("Crew", state.agents.size) {
                        Row(
                            Modifier.height(40.dp).tap(CircleShape, onNewAgent).padding(horizontal = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            OrbitIcon(OrbitIcon.Plus, size = 16.dp, tint = c.textSecondary)
                            Text("New agent", Modifier.padding(start = 6.dp), style = OrbitType.label, color = c.textSecondary)
                        }
                    }
                }
                item {
                    // Items are wider than the avatars; the row's inset keeps the first avatar on the gutter.
                    LazyRow(contentPadding = PaddingValues(horizontal = OrbitDimens.gutter - (CrewItem - CrewAvatar) / 2)) {
                        items(state.agents, key = { it.id }) { agent -> CrewMember(agent) { onEditAgent(agent) } }
                    }
                }

                item { SectionHeader("Rooms", state.rooms.size) }
                if (state.rooms.isEmpty() && state.loaded) {
                    item { EmptyRooms(state.agents, onNewRoom = onNewRoom, onNewAgent = onNewAgent) }
                }
                itemsIndexed(state.rooms, key = { _, room -> room.id }) { index, room ->
                    // The tile is the row's only container; rows are parted by a hairline inset to the text.
                    if (index > 0) Hairline(Modifier.padding(start = OrbitDimens.gutter + RoomTile + 14.dp, end = OrbitDimens.gutter))
                    RoomRow(room, room.agentIds.mapNotNull(state::agent), now) { onOpenRoom(room) }
                }
            }
        }
    }
}

@Composable
private fun Header(state: AppState, onSettings: () -> Unit) {
    val c = Orbit.colors
    Row(
        Modifier.fillMaxWidth().padding(start = OrbitDimens.gutter, end = OrbitDimens.gutter, top = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        LogoMark(size = 28.dp)
        Text("Orbit", Modifier.padding(start = 9.dp).weight(1f), style = OrbitType.titleL, color = c.text)

        // The hub is the app's one piece of infrastructure, so its status is also the way into settings.
        val online = state.loaded && !state.offline
        Surface(
            onClick = onSettings,
            shape = CircleShape,
            color = c.surface,
            contentColor = c.text,
            border = BorderStroke(1.dp, c.hairline),
        ) {
            Row(Modifier.height(40.dp).padding(start = 14.dp, end = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                StatusDot(
                    when {
                        online -> c.live
                        state.offline -> c.danger
                        else -> c.textTertiary
                    },
                    size = 7.dp,
                )
                Text(
                    when {
                        online -> state.hub.name.ifEmpty { "Hub" }
                        state.offline -> "Offline"
                        else -> "Connecting"
                    },
                    Modifier.padding(start = 8.dp),
                    style = OrbitType.label,
                    maxLines = 1,
                )
                OrbitIcon(OrbitIcon.Chevron, Modifier.padding(start = 2.dp), size = 18.dp, tint = c.textTertiary, description = "Settings")
            }
        }
    }
}

/** An overline with an optional action on the right, spaced from the section above. */
@Composable
private fun SectionHeader(title: String, count: Int, action: @Composable () -> Unit = {}) {
    Row(
        Modifier
            .fillMaxWidth()
            .padding(start = OrbitDimens.gutter, end = OrbitDimens.gutter - 10.dp, top = OrbitDimens.section - 8.dp, bottom = 4.dp)
            .height(40.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Overline(title, Modifier.weight(1f), count = count)
        action()
    }
}

@Composable
private fun OfflineNotice(onRetry: () -> Unit) {
    val c = Orbit.colors
    OrbitCard(
        Modifier.fillMaxWidth().padding(start = OrbitDimens.gutter, end = OrbitDimens.gutter, top = 20.dp),
        color = c.dangerSurface,
        edge = c.danger.copy(alpha = 0.25f),
    ) {
        Row(
            Modifier.padding(start = OrbitDimens.rowPad, end = 12.dp, top = 12.dp, bottom = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text("Can't reach your hub", style = OrbitType.titleS, color = c.text)
                Text(
                    "Check that the PC is on and on this network.",
                    Modifier.padding(top = 2.dp),
                    style = OrbitType.bodyS,
                    color = c.textSecondary,
                )
            }
            Pill("Retry", onRetry, Modifier.padding(start = 12.dp))
        }
    }
}

@Composable
private fun CrewMember(agent: Agent, onClick: () -> Unit) {
    val c = Orbit.colors
    Column(
        Modifier.width(CrewItem).tap(RoundedCornerShape(OrbitDimens.radiusM), onClick).padding(vertical = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        AgentAvatar(agent.avatar, size = CrewAvatar)
        Text(
            agent.name,
            Modifier.padding(top = 10.dp, start = 4.dp, end = 4.dp),
            style = OrbitType.label,
            color = c.text,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        if (agent.role.isNotBlank()) {
            Text(
                agent.role,
                Modifier.padding(top = 2.dp, start = 4.dp, end = 4.dp),
                style = OrbitType.caption,
                color = c.textTertiary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun RoomRow(room: Room, agents: List<Agent>, now: Long, onClick: () -> Unit) {
    val c = Orbit.colors
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = OrbitDimens.gutter, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CrewTile(agents.map { it.avatar }, size = RoomTile)
        Column(Modifier.weight(1f).padding(start = 14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(room.name, Modifier.weight(1f), style = OrbitType.titleM, color = c.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (room.active) {
                    StatusDot(c.live, Modifier.padding(start = 10.dp), pulsing = true, size = 7.dp)
                    Text("Working", Modifier.padding(start = 6.dp), style = OrbitType.label, color = c.live)
                } else {
                    Text(relativeTime(room.updatedAt, now), Modifier.padding(start = 10.dp), style = OrbitType.mono, color = c.textTertiary)
                }
            }
            val preview = room.preview
            Text(
                if (preview == null) "No messages yet" else "${preview.author}: ${preview.text}",
                Modifier.padding(top = 3.dp),
                style = OrbitType.bodyM,
                color = if (preview == null) c.textTertiary else c.textSecondary,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun NewRoomButton(onClick: () -> Unit) {
    val c = Orbit.colors
    Surface(onClick = onClick, shape = CircleShape, color = c.primary, contentColor = c.onPrimary, shadowElevation = 6.dp) {
        Row(Modifier.height(52.dp).padding(start = 18.dp, end = 22.dp), verticalAlignment = Alignment.CenterVertically) {
            OrbitIcon(OrbitIcon.Plus, size = 18.dp, tint = c.onPrimary)
            Text("New room", Modifier.padding(start = 8.dp), style = OrbitType.titleS)
        }
    }
}

@Composable
private fun EmptyRooms(agents: List<Agent>, onNewRoom: () -> Unit, onNewAgent: () -> Unit) {
    val c = Orbit.colors
    OrbitCard(Modifier.fillMaxWidth().padding(horizontal = OrbitDimens.gutter)) {
        Column(
            Modifier.padding(horizontal = 24.dp, vertical = OrbitDimens.section),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            // A room tile, waiting for its crew.
            CrewTile(agents.map { it.avatar }.ifEmpty { SampleCrew }, size = 76.dp, color = c.surfaceHigh)
            Spacer(Modifier.height(20.dp))
            Text(if (agents.isEmpty()) "Build your crew" else "Start your first room", style = OrbitType.titleM, color = c.text)
            Text(
                if (agents.isEmpty()) {
                    "Create an agent, give it a model and a job, then put it to work."
                } else {
                    "Put agents in a room, give them a task, and they'll work it out together."
                },
                Modifier.padding(top = 6.dp),
                style = OrbitType.bodyM,
                color = c.textSecondary,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(24.dp))
            if (agents.isEmpty()) PrimaryButton("New agent", onNewAgent) else PrimaryButton("New room", onNewRoom)
        }
    }
}

/** "now", "5m", "3h", "Tue", "Mar 4". */
fun relativeTime(then: Long, now: Long): String {
    if (then <= 0) return ""
    val minutes = (now - then) / 60_000
    return when {
        minutes < 1 -> "now"
        minutes < 60 -> "${minutes}m"
        minutes < 24 * 60 -> "${minutes / 60}h"
        minutes < 7 * 24 * 60 -> SimpleDateFormat("EEE", Locale.getDefault()).format(Date(then))
        else -> SimpleDateFormat("MMM d", Locale.getDefault()).format(Date(then))
    }
}
