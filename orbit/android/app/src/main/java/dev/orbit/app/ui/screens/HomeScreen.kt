package dev.orbit.app.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandHorizontally
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkHorizontally
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
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
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.pulltorefresh.PullToRefreshState
import androidx.compose.material3.pulltorefresh.rememberPullToRefreshState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.orbit.app.data.Agent
import dev.orbit.app.data.Room
import dev.orbit.app.ui.AppState
import dev.orbit.app.ui.SharedKeys
import dev.orbit.app.ui.components.AgentAvatar
import dev.orbit.app.ui.components.CrewTile
import dev.orbit.app.ui.components.Hairline
import dev.orbit.app.ui.components.LogoMark
import dev.orbit.app.ui.components.OrbitCard
import dev.orbit.app.ui.components.OrbitIcon
import dev.orbit.app.ui.components.OrbitSpinner
import dev.orbit.app.ui.components.OrbitSystem
import dev.orbit.app.ui.components.Pill
import dev.orbit.app.ui.components.PrimaryButton
import dev.orbit.app.ui.components.SectionTitle
import dev.orbit.app.ui.components.ShimmerText
import dev.orbit.app.ui.components.SkeletonBlock
import dev.orbit.app.ui.components.StatusDot
import dev.orbit.app.ui.components.lift
import dev.orbit.app.ui.components.surfaceBorder
import dev.orbit.app.ui.components.tap
import dev.orbit.app.ui.components.textColor
import dev.orbit.app.ui.shared
import dev.orbit.app.ui.theme.Orbit
import dev.orbit.app.ui.theme.OrbitDimens
import dev.orbit.app.ui.theme.OrbitMotion
import dev.orbit.app.ui.theme.OrbitType
import dev.orbit.app.ui.theme.entrance
import dev.orbit.app.ui.theme.pressScale
import dev.orbit.app.ui.theme.rememberEntrances
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
    val list = rememberLazyListState()
    // Content staggers in once, when real data replaces the placeholders.
    val entrances = rememberEntrances(state.loaded)
    // The new-room button tucks its label away once the list scrolls.
    val atTop by remember { derivedStateOf { list.firstVisibleItemIndex == 0 && list.firstVisibleItemScrollOffset < 24 } }

    // Only a pull shows the refresh indicator; background refreshes stay invisible.
    var pulled by remember { mutableStateOf(false) }
    LaunchedEffect(state.refreshing) { if (!state.refreshing) pulled = false }
    val pull = rememberPullToRefreshState()

    Scaffold(
        containerColor = c.bg,
        floatingActionButton = {
            if (state.agents.isNotEmpty() && state.rooms.isNotEmpty()) NewRoomButton(expanded = atTop, onClick = onNewRoom)
        },
    ) { padding ->
        PullToRefreshBox(
            isRefreshing = pulled && state.refreshing,
            onRefresh = {
                pulled = true
                onRefresh()
            },
            modifier = Modifier.fillMaxSize().padding(padding),
            state = pull,
            indicator = { RefreshIndicator(pull, pulled && state.refreshing) },
        ) {
            LazyColumn(Modifier.fillMaxSize(), state = list, contentPadding = PaddingValues(bottom = 112.dp)) {
                item(key = "header") { Header(state, onSettings) }
                item(key = "offline") {
                    AnimatedVisibility(state.offline, enter = expandVertically() + fadeIn(), exit = shrinkVertically() + fadeOut()) {
                        OfflineNotice(onRefresh)
                    }
                }

                if (!state.loaded && !state.offline) {
                    // The placeholders fade out as the real content fades in.
                    item(key = "skeleton") { HomeSkeleton(Modifier.animateItem(fadeInSpec = null, placementSpec = null, fadeOutSpec = tween(150))) }
                    return@LazyColumn
                }

                item(key = "crew-title") {
                    SectionTitle(
                        "Crew",
                        Modifier.padding(start = OrbitDimens.gutter, end = OrbitDimens.gutter - 10.dp, top = OrbitDimens.section, bottom = 6.dp)
                            .entrance(entrances, "crew-title", 0),
                        count = state.agents.size,
                    ) {
                        Row(
                            Modifier.height(40.dp).tap(CircleShape, 0.94f, onNewAgent).padding(horizontal = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            OrbitIcon(OrbitIcon.Plus, size = 16.dp, tint = c.textSecondary)
                            Text("New agent", Modifier.padding(start = 6.dp), style = OrbitType.label, color = c.textSecondary)
                        }
                    }
                }
                item(key = "crew") {
                    // Items are wider than the avatars; the row's inset keeps the first avatar on the gutter.
                    LazyRow(
                        Modifier.entrance(entrances, "crew", 1),
                        contentPadding = PaddingValues(horizontal = OrbitDimens.gutter - (CrewItem - CrewAvatar) / 2),
                    ) {
                        items(state.agents, key = { it.id }) { agent -> CrewMember(agent) { onEditAgent(agent) } }
                    }
                }

                item(key = "rooms-title") {
                    SectionTitle(
                        "Rooms",
                        Modifier.padding(horizontal = OrbitDimens.gutter).padding(top = OrbitDimens.section, bottom = 2.dp)
                            .entrance(entrances, "rooms-title", 2),
                        count = state.rooms.size,
                    )
                }
                if (state.rooms.isEmpty()) {
                    item(key = "rooms-empty") {
                        EmptyRooms(state.agents, Modifier.entrance(entrances, "rooms-empty", 3), onNewRoom = onNewRoom, onNewAgent = onNewAgent)
                    }
                }
                itemsIndexed(state.rooms, key = { _, room -> room.id }) { index, room ->
                    Column(Modifier.animateItem().entrance(entrances, "room:${room.id}", 3 + index)) {
                        // The tile is the row's only container; rows are parted by a hairline inset to the text.
                        if (index > 0) Hairline(Modifier.padding(start = OrbitDimens.gutter + RoomTile + 14.dp, end = OrbitDimens.gutter))
                        RoomRow(room, room.agentIds.mapNotNull(state::agent), now) { onOpenRoom(room) }
                    }
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
        val interaction = remember { MutableInteractionSource() }
        Surface(
            onClick = onSettings,
            modifier = Modifier.lift(CircleShape, 0.6f).pressScale(interaction),
            shape = CircleShape,
            color = c.surface,
            contentColor = c.text,
            border = surfaceBorder(),
            interactionSource = interaction,
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

@Composable
private fun OfflineNotice(onRetry: () -> Unit) {
    val c = Orbit.colors
    OrbitCard(
        Modifier.fillMaxWidth().padding(start = OrbitDimens.gutter, end = OrbitDimens.gutter, top = 20.dp),
        color = c.dangerSurface,
        border = BorderStroke(1.dp, c.danger.copy(alpha = 0.25f)),
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
        Modifier.width(CrewItem).tap(RoundedCornerShape(OrbitDimens.radiusM), 0.94f, onClick).padding(vertical = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        AgentAvatar(agent.avatar, Modifier.shared(SharedKeys.agentAvatar(agent.id)), size = CrewAvatar, alive = true)
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
    val speaker = agents.firstOrNull { it.id == room.speaking }
    Row(
        Modifier.fillMaxWidth().tap(RectangleShape, 0.985f, onClick).padding(horizontal = OrbitDimens.gutter, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CrewTile(
            agents.map { it.avatar },
            size = RoomTile,
            itemModifier = { index -> Modifier.shared(SharedKeys.roomMember(room.id, agents[index].id)) },
        )
        Column(Modifier.weight(1f).padding(start = 14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(room.name, Modifier.weight(1f), style = OrbitType.titleM, color = c.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                // One quiet signal that a room is working: the speaker's dot and a shimmering line below.
                if (room.active) {
                    StatusDot(speaker?.avatar?.textColor() ?: c.textSecondary, Modifier.padding(start = 10.dp), size = 7.dp)
                } else {
                    Text(relativeTime(room.updatedAt, now), Modifier.padding(start = 10.dp), style = OrbitType.caption, color = c.textTertiary)
                }
            }
            val preview = room.preview
            when {
                room.active -> ShimmerText(
                    if (speaker != null) "${speaker.name} is replying" else "Working",
                    OrbitType.bodyM,
                    c.textTertiary,
                    Modifier.padding(top = 3.dp),
                )
                else -> Text(
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
}

/** "New room", which tucks into a round button once the list scrolls. */
@Composable
private fun NewRoomButton(expanded: Boolean, onClick: () -> Unit) {
    val c = Orbit.colors
    val interaction = remember { MutableInteractionSource() }
    Surface(
        onClick = onClick,
        modifier = Modifier.pressScale(interaction, 0.94f),
        shape = CircleShape,
        color = c.primary,
        contentColor = c.onPrimary,
        shadowElevation = 6.dp,
        interactionSource = interaction,
    ) {
        Row(Modifier.height(54.dp).padding(horizontal = 17.dp), verticalAlignment = Alignment.CenterVertically) {
            OrbitIcon(OrbitIcon.Plus, size = 20.dp, tint = c.onPrimary, description = "New room")
            AnimatedVisibility(
                expanded,
                enter = expandHorizontally(OrbitMotion.snappy()) + fadeIn(),
                exit = shrinkHorizontally(OrbitMotion.snappy()) + fadeOut(),
            ) {
                Text("New room", Modifier.padding(start = 8.dp, end = 4.dp), style = OrbitType.titleS, maxLines = 1)
            }
        }
    }
}

/** Pull-to-refresh, Orbit-style: the satellite winds around as you pull, then circles while it works. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun BoxScope.RefreshIndicator(state: PullToRefreshState, refreshing: Boolean) {
    val c = Orbit.colors
    Box(
        Modifier
            .align(Alignment.TopCenter)
            .graphicsLayer {
                val pull = state.distanceFraction
                translationY = pull.coerceAtMost(1.3f) * 64.dp.toPx() - 44.dp.toPx()
                alpha = pull.coerceIn(0f, 1f)
                val scale = 0.7f + 0.3f * pull.coerceIn(0f, 1f)
                scaleX = scale
                scaleY = scale
            }
            .size(40.dp)
            .lift(CircleShape)
            .clip(CircleShape)
            .background(c.surfaceRaised)
            .border(surfaceBorder(), CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        if (refreshing) {
            OrbitSpinner(c.text, size = 22.dp)
        } else {
            Canvas(Modifier.size(22.dp)) {
                val s = size.minDimension
                drawCircle(c.text, s * 0.15f)
                rotate(state.distanceFraction * 300f) { drawCircle(c.text, s * 0.1f, Offset(center.x, center.y - s * 0.36f)) }
            }
        }
    }
}

/** Placeholders laid out exactly like the crew row and room list, so nothing jumps when data lands. */
@Composable
private fun HomeSkeleton(modifier: Modifier = Modifier) {
    val text = RoundedCornerShape(4.dp)
    Column(modifier) {
        Box(
            Modifier.padding(start = OrbitDimens.gutter, top = OrbitDimens.section, bottom = 6.dp).height(40.dp),
            contentAlignment = Alignment.CenterStart,
        ) { SkeletonBlock(64.dp, 16.dp, text) }
        Row(Modifier.padding(start = OrbitDimens.gutter - (CrewItem - CrewAvatar) / 2)) {
            repeat(4) {
                Column(Modifier.width(CrewItem).padding(vertical = 8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    SkeletonBlock(CrewAvatar, CrewAvatar, CircleShape)
                    SkeletonBlock(40.dp, 12.dp, text, Modifier.padding(top = 12.dp))
                    SkeletonBlock(52.dp, 10.dp, text, Modifier.padding(top = 6.dp))
                }
            }
        }
        Box(
            Modifier.padding(start = OrbitDimens.gutter, top = OrbitDimens.section, bottom = 2.dp).height(40.dp),
            contentAlignment = Alignment.CenterStart,
        ) { SkeletonBlock(72.dp, 16.dp, text) }
        repeat(3) {
            Row(Modifier.padding(horizontal = OrbitDimens.gutter, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                SkeletonBlock(RoomTile, RoomTile, RoundedCornerShape(RoomTile * 0.3f))
                Column(Modifier.padding(start = 14.dp)) {
                    SkeletonBlock(140.dp, 15.dp, text)
                    SkeletonBlock(220.dp, 12.dp, text, Modifier.padding(top = 10.dp))
                }
            }
        }
    }
}

@Composable
private fun EmptyRooms(agents: List<Agent>, modifier: Modifier, onNewRoom: () -> Unit, onNewAgent: () -> Unit) {
    val c = Orbit.colors
    OrbitCard(modifier.fillMaxWidth().padding(horizontal = OrbitDimens.gutter).padding(top = 8.dp)) {
        Column(Modifier.padding(horizontal = 24.dp).padding(bottom = OrbitDimens.section), horizontalAlignment = Alignment.CenterHorizontally) {
            // The crew, circling the hub: rooms are where they get to work.
            OrbitSystem(agents.map { it.avatar }.ifEmpty { SampleCrew }, Modifier.fillMaxWidth().height(170.dp), avatarSize = 38.dp)
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
