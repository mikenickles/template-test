package dev.orbit.app.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.orbit.app.data.Agent
import dev.orbit.app.data.Room
import dev.orbit.app.ui.AppState
import dev.orbit.app.ui.components.AgentAvatar
import dev.orbit.app.ui.components.AvatarStack
import dev.orbit.app.ui.components.PrimaryButton
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

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
    Scaffold(
        floatingActionButton = {
            if (state.agents.isNotEmpty() && state.rooms.isNotEmpty()) {
                ExtendedFloatingActionButton(
                    onClick = onNewRoom,
                    shape = CircleShape,
                    containerColor = MaterialTheme.colorScheme.primary,
                    contentColor = MaterialTheme.colorScheme.onPrimary,
                    icon = { Icon(Icons.Default.Add, contentDescription = null) },
                    text = { Text("New room", style = MaterialTheme.typography.titleSmall) },
                )
            }
        },
    ) { padding ->
        PullToRefreshBox(
            isRefreshing = state.refreshing && state.loaded,
            onRefresh = onRefresh,
            modifier = Modifier.fillMaxSize().padding(padding),
        ) {
            LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 96.dp)) {
                item { Header(state, onSettings) }
                if (state.offline) item { OfflineBanner(onRefresh) }

                item { SectionHeader("Crew", count = state.agents.size) }
                item {
                    LazyRow(
                        contentPadding = PaddingValues(horizontal = 20.dp),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        items(state.agents, key = { it.id }) { agent -> AgentCard(agent) { onEditAgent(agent) } }
                        item { NewAgentCard(onNewAgent) }
                    }
                }

                item { SectionHeader("Rooms", count = state.rooms.size, Modifier.padding(top = 12.dp)) }
                if (state.rooms.isEmpty() && state.loaded) {
                    item { EmptyRooms(hasAgents = state.agents.isNotEmpty(), onNewRoom = onNewRoom, onNewAgent = onNewAgent) }
                }
                items(state.rooms, key = { it.id }) { room ->
                    RoomCard(room, room.agentIds.mapNotNull(state::agent), now) { onOpenRoom(room) }
                }
            }
        }
    }
}

@Composable
private fun Header(state: AppState, onSettings: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().padding(start = 20.dp, end = 8.dp, top = 12.dp, bottom = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text("Orbit", style = MaterialTheme.typography.displaySmall)
            Row(verticalAlignment = Alignment.CenterVertically) {
                val online = state.loaded && !state.offline
                Box(
                    Modifier
                        .size(8.dp)
                        .clip(CircleShape)
                        .background(if (online) MaterialTheme.colorScheme.tertiary else MaterialTheme.colorScheme.outline),
                )
                Text(
                    when {
                        online -> "Connected to ${state.hub.name.ifEmpty { "your hub" }}"
                        state.offline -> "Hub unreachable"
                        else -> "Connecting…"
                    },
                    Modifier.padding(start = 8.dp),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        IconButton(onClick = onSettings) {
            Icon(Icons.Default.Settings, contentDescription = "Settings", tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun SectionHeader(title: String, count: Int, modifier: Modifier = Modifier) {
    Row(
        modifier.padding(start = 20.dp, end = 20.dp, top = 20.dp, bottom = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(title, style = MaterialTheme.typography.titleLarge)
        if (count > 0) {
            Text(
                count.toString(),
                Modifier.padding(start = 8.dp),
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun OfflineBanner(onRetry: () -> Unit) {
    Surface(
        onClick = onRetry,
        modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 8.dp),
        shape = MaterialTheme.shapes.medium,
        color = MaterialTheme.colorScheme.errorContainer,
        contentColor = MaterialTheme.colorScheme.onErrorContainer,
    ) {
        Text(
            "Can't reach your hub. Check that the PC is on and you're on the same network, then tap to retry.",
            Modifier.padding(16.dp),
            style = MaterialTheme.typography.bodyMedium,
        )
    }
}

@Composable
private fun AgentCard(agent: Agent, onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        modifier = Modifier.width(116.dp),
        shape = MaterialTheme.shapes.large,
        color = MaterialTheme.colorScheme.surfaceContainerLow,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        Column(Modifier.padding(horizontal = 10.dp, vertical = 16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            AgentAvatar(agent.avatar, size = 60.dp)
            Spacer(Modifier.height(10.dp))
            Text(agent.name, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                agent.model,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun NewAgentCard(onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        modifier = Modifier.width(116.dp),
        shape = MaterialTheme.shapes.large,
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
    ) {
        Column(Modifier.padding(horizontal = 10.dp, vertical = 16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Box(
                Modifier.size(60.dp).padding(6.dp).clip(CircleShape).background(MaterialTheme.colorScheme.surfaceContainerHigh),
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Default.Add, contentDescription = null)
            }
            Spacer(Modifier.height(10.dp))
            Text("New agent", style = MaterialTheme.typography.titleSmall)
            Text("Add to crew", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun RoomCard(room: Room, agents: List<Agent>, now: Long, onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 5.dp),
        shape = MaterialTheme.shapes.large,
        color = MaterialTheme.colorScheme.surfaceContainerLow,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                AvatarStack(agents.map { it.avatar }, size = 34.dp)
                Spacer(Modifier.weight(1f))
                if (room.active) {
                    Surface(shape = CircleShape, color = MaterialTheme.colorScheme.tertiary.copy(alpha = 0.16f)) {
                        Text(
                            "Working",
                            Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.tertiary,
                        )
                    }
                } else {
                    Text(
                        relativeTime(room.updatedAt, now),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            Spacer(Modifier.height(12.dp))
            Text(room.name, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Spacer(Modifier.height(2.dp))
            val preview = room.preview
            Text(
                if (preview == null) "No messages yet" else "${preview.author}: ${preview.text}",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun EmptyRooms(hasAgents: Boolean, onNewRoom: () -> Unit, onNewAgent: () -> Unit) {
    Column(
        Modifier.fillMaxWidth().padding(horizontal = 32.dp, vertical = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        HeroCluster()
        Spacer(Modifier.height(16.dp))
        Text(
            if (hasAgents) "Put your agents in a room and give them something to work on." else "Create your first agent to get started.",
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(20.dp))
        if (hasAgents) PrimaryButton("New room", onNewRoom) else PrimaryButton("New agent", onNewAgent)
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
