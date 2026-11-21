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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.orbit.app.data.Agent
import dev.orbit.app.data.Nudge
import dev.orbit.app.data.ProactiveMark
import dev.orbit.app.data.Room
import dev.orbit.app.ui.AppState
import dev.orbit.app.ui.UpdateStatus
import dev.orbit.app.ui.SharedKeys
import dev.orbit.app.ui.components.AgentAvatar
import dev.orbit.app.ui.components.CrewTile
import dev.orbit.app.ui.components.Hairline
import dev.orbit.app.ui.components.LogoMark
import dev.orbit.app.ui.components.OrbitCard
import dev.orbit.app.ui.components.OrbitIcon
import dev.orbit.app.ui.components.OrbitSpinner
import dev.orbit.app.ui.components.TreehouseScene
import dev.orbit.app.ui.components.Pill
import dev.orbit.app.ui.components.PrimaryButton
import dev.orbit.app.ui.components.SectionTitle
import dev.orbit.app.ui.components.ShimmerText
import dev.orbit.app.ui.components.SkeletonBlock
import dev.orbit.app.ui.components.StatusDot
import dev.orbit.app.ui.components.PcUpdateCard
import dev.orbit.app.ui.components.UpdateCard
import dev.orbit.app.ui.components.lift
import dev.orbit.app.ui.components.surfaceBorder
import dev.orbit.app.ui.components.tap
import dev.orbit.app.ui.components.IconTap
import dev.orbit.app.ui.components.textColor
import dev.orbit.app.ui.components.tint
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
private val CrewItem = 80.dp
private val CrewAvatar = 64.dp

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
    onAddKey: () -> Unit = {},
    onStartIntro: () -> Unit = {},
    /** The app version the PC is holding, if newer than this one, and how installing it is going. */
    appUpdate: String? = null,
    updateStatus: UpdateStatus = UpdateStatus.Idle,
    onUpdate: () -> Unit = {},
    /** The version the PC is installing right now, if any. */
    pcUpdating: String? = null,
    onUpdatePc: () -> Unit = {},
    /** Opens what an agent brought up on its own, in its room. */
    onOpenNudge: (Nudge) -> Unit = {},
    onDismissNudge: (Nudge) -> Unit = {},
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
                item(key = "greeting") { Greeting(state, now, Modifier.entrance(entrances, "greeting", 0)) }
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

                val pcUpdate = state.pcUpdate ?: pcUpdating
                if (pcUpdate != null) {
                    item(key = "pc-update") {
                        PcUpdateCard(
                            pcUpdate, pcUpdating != null, onUpdatePc,
                            Modifier.padding(start = OrbitDimens.gutter, end = OrbitDimens.gutter, top = 22.dp).entrance(entrances, "pc-update", 0),
                        )
                    }
                } else if (appUpdate != null) {
                    item(key = "update") {
                        UpdateCard(
                            appUpdate, updateStatus, onUpdate,
                            Modifier.padding(start = OrbitDimens.gutter, end = OrbitDimens.gutter, top = 22.dp).entrance(entrances, "update", 0),
                        )
                    }
                }
                // What agents brought up on their own, newest first, until it's opened or dismissed.
                if (state.nudges.isNotEmpty()) {
                    item(key = "nudges-title") {
                        SectionTitle(
                            "From your crew",
                            Modifier.padding(start = OrbitDimens.gutter, end = OrbitDimens.gutter, top = OrbitDimens.section, bottom = 6.dp)
                                .animateItem().entrance(entrances, "nudges-title", 0),
                            count = state.nudges.size,
                        )
                    }
                    items(state.nudges.asReversed().take(5), key = { "nudge-${it.id}" }) { nudge ->
                        NudgeCard(
                            nudge, state.agent(nudge.agentId), state.room(nudge.roomId), now,
                            onOpen = { onOpenNudge(nudge) },
                            onDismiss = { onDismissNudge(nudge) },
                            modifier = Modifier.padding(start = OrbitDimens.gutter, end = OrbitDimens.gutter, top = 10.dp).animateItem(),
                        )
                    }
                }
                // Until the crew knows the user, the guide offers to get to know them.
                val showIntro = state.profile.notes.isEmpty() && state.providers.isNotEmpty()
                if (showIntro) {
                    item(key = "intro") { IntroCard(state, onStartIntro, onAddKey, Modifier.entrance(entrances, "intro", 0)) }
                }
                // Until a provider has a key, agents can only give demo replies; say so once, gently.
                val needsKey = state.providers.none { it.takesKey && it.configured }
                if (needsKey && state.providers.isNotEmpty() && !showIntro) {
                    item(key = "add-key") { AddKeyNotice(onAddKey, Modifier.entrance(entrances, "add-key", 0)) }
                }

                if (state.agents.isNotEmpty() || !showIntro) item(key = "crew-title") {
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
                if (state.agents.isNotEmpty()) item(key = "crew") {
                    // Items are wider than the avatars; the row's inset keeps the first avatar on the gutter.
                    LazyRow(
                        Modifier.entrance(entrances, "crew", 1),
                        contentPadding = PaddingValues(horizontal = OrbitDimens.gutter - (CrewItem - CrewAvatar) / 2),
                    ) {
                        items(state.agents, key = { it.id }) { agent -> CrewMember(agent) { onEditAgent(agent) } }
                    }
                }

                if (state.rooms.isNotEmpty() || !showIntro) item(key = "rooms-title") {
                    SectionTitle(
                        "Rooms",
                        Modifier.padding(horizontal = OrbitDimens.gutter).padding(top = OrbitDimens.section, bottom = 2.dp)
                            .entrance(entrances, "rooms-title", 2),
                        count = state.rooms.size,
                    )
                }
                if (state.rooms.isEmpty() && !showIntro) {
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
        Text("Treehouse", Modifier.padding(start = 9.dp).weight(1f), style = OrbitType.titleL, color = c.text)

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

/** "Good evening, Mike", and what the crew is up to. */
@Composable
private fun Greeting(state: AppState, now: Long, modifier: Modifier) {
    val c = Orbit.colors
    val hour = java.util.Calendar.getInstance().apply { timeInMillis = now }.get(java.util.Calendar.HOUR_OF_DAY)
    val part = when (hour) {
        in 5..11 -> "Good morning"
        in 12..17 -> "Good afternoon"
        else -> "Good evening"
    }
    val busy = state.rooms.firstOrNull { it.active }
    val speaker = state.agent(busy?.speaking)
    Column(modifier.fillMaxWidth().padding(start = OrbitDimens.gutter, end = OrbitDimens.gutter, top = 26.dp)) {
        Text(
            if (state.profile.name.isNotBlank()) "$part, ${state.profile.name}" else part,
            style = OrbitType.display,
            color = c.text,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        Row(Modifier.padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            if (busy != null) {
                StatusDot(speaker?.avatar?.textColor() ?: c.live, Modifier.padding(end = 8.dp), size = 7.dp)
                ShimmerText(
                    if (speaker != null) "${speaker.name} is replying in ${busy.name}" else "Your crew is working in ${busy.name}",
                    OrbitType.bodyM,
                    c.textSecondary,
                )
            } else {
                Text(
                    when {
                        !state.loaded -> "Checking in with your hub"
                        state.agents.isEmpty() -> "Let's set up your crew"
                        state.agents.size == 1 -> "${state.agents[0].name} is here when you need them"
                        else -> "Your crew of ${state.agents.size} is ready"
                    },
                    style = OrbitType.bodyM,
                    color = c.textSecondary,
                )
            }
        }
    }
}

/**
 * The guide's invitation to get to know each other, washed in the guide's color. Without a Claude
 * key it asks for one first.
 */
/**
 * Something an agent wrote on its own: who, why (a check-in, a follow-up, a watch, the morning brief),
 * and the first lines. Tapping opens the room; the cross takes it off Home.
 */
@Composable
private fun NudgeCard(nudge: Nudge, agent: Agent?, room: Room?, now: Long, onOpen: () -> Unit, onDismiss: () -> Unit, modifier: Modifier) {
    val c = Orbit.colors
    val look = agent?.avatar ?: dev.orbit.app.data.AvatarSpec(0)
    val wash = look.tint().copy(alpha = if (c.isDark) 0.2f else 0.24f)
    val shape = RoundedCornerShape(OrbitDimens.radiusL)
    val why = when (nudge.kind) {
        ProactiveMark.KIND_FOLLOW_UP -> "Follow-up"
        ProactiveMark.KIND_WATCH -> "Watch"
        ProactiveMark.KIND_BRIEF -> "Morning brief"
        else -> "Check-in"
    }
    Box(
        modifier
            .fillMaxWidth()
            .clip(shape)
            .background(c.surface)
            .background(Brush.linearGradient(listOf(wash, Color.Transparent), start = Offset.Zero, end = Offset(700f, 420f)))
            .border(surfaceBorder(), shape)
            .tap(shape, 0.98f, onOpen),
    ) {
        Row(Modifier.padding(start = 16.dp, end = 4.dp, top = 14.dp, bottom = 16.dp)) {
            AgentAvatar(look, size = 40.dp)
            Column(Modifier.weight(1f).padding(start = 12.dp, top = 1.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(agent?.name ?: "Your crew", style = OrbitType.titleS, color = look.textColor())
                    Text(
                        // The brief has a room of its own, so its name would only repeat what it is.
                        " · $why${room?.takeIf { nudge.kind != ProactiveMark.KIND_BRIEF }?.let { " · ${it.name}" }.orEmpty()}",
                        Modifier.weight(1f, fill = false),
                        style = OrbitType.bodyS,
                        color = c.textSecondary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(relativeTime(nudge.at, now), Modifier.padding(start = 8.dp), style = OrbitType.caption, color = c.textTertiary)
                }
                Text(nudge.text, Modifier.padding(top = 4.dp), style = OrbitType.bodyM, color = c.text, maxLines = 3, overflow = TextOverflow.Ellipsis)
            }
            IconTap(OrbitIcon.Close, "Dismiss", onDismiss, tint = c.textTertiary)
        }
    }
}

@Composable
private fun IntroCard(state: AppState, onStart: () -> Unit, onAddKey: () -> Unit, modifier: Modifier) {
    val c = Orbit.colors
    val room = state.introRoom
    val guide = state.agent(room?.agentIds?.firstOrNull())
        ?: state.agents.firstOrNull { agent -> state.providers.any { it.id == agent.provider && it.abilities && it.configured } }
    val look = guide?.avatar ?: dev.orbit.app.data.AvatarSpec(9)
    val name = guide?.name ?: "Nova"
    val shape = RoundedCornerShape(OrbitDimens.radiusXL)
    val wash = look.tint().copy(alpha = if (c.isDark) 0.26f else 0.3f)
    Box(
        modifier
            .padding(start = OrbitDimens.gutter, end = OrbitDimens.gutter, top = 22.dp)
            .fillMaxWidth()
            .lift(shape)
            .clip(shape)
            .background(c.surface)
            .background(Brush.linearGradient(listOf(wash, Color.Transparent), start = Offset.Zero, end = Offset(900f, 700f)))
            .border(surfaceBorder(), shape),
    ) {
        Column(Modifier.padding(start = 20.dp, end = 20.dp, top = 20.dp, bottom = 20.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                AgentAvatar(look, size = 76.dp, alive = true)
                Column(Modifier.padding(start = 14.dp).weight(1f)) {
                    Text(
                        when {
                            !state.canIntro -> "Meet your guide"
                            room != null -> "Pick up where you left off"
                            else -> "Hi! I'm $name"
                        },
                        style = OrbitType.titleL,
                        color = c.text,
                    )
                    Text(
                        if (state.canIntro) "Let's get to know each other" else "Your crew starts here",
                        Modifier.padding(top = 2.dp),
                        style = OrbitType.bodyM,
                        color = look.textColor(),
                    )
                }
            }
            Text(
                if (state.canIntro) {
                    "A quick chat about you, what you're into and what you'd like help with. Everything I learn, your " +
                        "whole crew will know, and then I'll build a crew just for you."
                } else {
                    "Add an Anthropic key and your guide will get to know you, then build a crew around what you need."
                },
                Modifier.padding(top = 16.dp),
                style = OrbitType.bodyM,
                color = c.textSecondary,
            )
            Spacer(Modifier.height(18.dp))
            if (state.canIntro) {
                PrimaryButton(if (room != null) "Continue the chat" else "Say hello", onStart)
            } else {
                PrimaryButton("Add a key", onAddKey)
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
private fun AddKeyNotice(onAddKey: () -> Unit, modifier: Modifier) {
    val c = Orbit.colors
    OrbitCard(modifier.fillMaxWidth().padding(start = OrbitDimens.gutter, end = OrbitDimens.gutter, top = 20.dp)) {
        Row(Modifier.padding(start = OrbitDimens.rowPad, end = 12.dp, top = 14.dp, bottom = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Your crew is in demo mode", style = OrbitType.titleS, color = c.text)
                Text(
                    "Add an AI provider's key and they'll give real answers.",
                    Modifier.padding(top = 2.dp),
                    style = OrbitType.bodyS,
                    color = c.textSecondary,
                )
            }
            Pill("Add key", onAddKey, Modifier.padding(start = 12.dp), selected = true)
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
        Box(contentAlignment = Alignment.BottomCenter) {
            // Each character stands on a soft pool of its own color.
            val floor = agent.avatar.tint()
            Box(
                Modifier
                    .size(width = CrewAvatar, height = 18.dp)
                    .graphicsLayer { scaleY = 0.55f }
                    .background(Brush.radialGradient(listOf(floor.copy(alpha = if (c.isDark) 0.55f else 0.5f), floor.copy(alpha = 0f))), CircleShape),
            )
            AgentAvatar(agent.avatar, Modifier.padding(bottom = 5.dp).shared(SharedKeys.agentAvatar(agent.id)), size = CrewAvatar, alive = true)
        }
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
            // The tile takes a hint of its first member's color.
            color = agents.firstOrNull()?.avatar?.tint()?.copy(alpha = if (c.isDark) 0.2f else 0.24f)?.compositeOver(c.surfaceRaised) ?: c.surfaceRaised,
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
            // The crew at home: rooms are where they get to work.
            TreehouseScene(Modifier.fillMaxWidth().padding(top = 24.dp, bottom = 20.dp).height(200.dp))
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
