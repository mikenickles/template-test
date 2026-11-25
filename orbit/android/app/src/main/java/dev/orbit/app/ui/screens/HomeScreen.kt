package dev.orbit.app.ui.screens

import androidx.compose.animation.togetherWith
import androidx.compose.animation.AnimatedContent
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.Role
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import dev.orbit.app.ui.components.quietCard
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandHorizontally
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkHorizontally
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.pager.HorizontalPager
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
import dev.orbit.app.ui.components.AgentPortrait
import dev.orbit.app.ui.components.MoreBadge
import dev.orbit.app.ui.components.Hairline
import dev.orbit.app.ui.components.CrewButton
import dev.orbit.app.ui.components.CrewHuddle
import dev.orbit.app.ui.components.CrewHuddleOverlay
import dev.orbit.app.ui.components.behindCrewHuddle
import dev.orbit.app.ui.components.rememberCrewHuddle
import dev.orbit.app.ui.components.OrbitCard
import dev.orbit.app.ui.components.ActionSheet
import dev.orbit.app.ui.components.OrbitIcon
import dev.orbit.app.ui.components.SheetAction
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
import dev.orbit.app.ui.theme.rememberHaptics
import dev.orbit.app.ui.theme.OrbitDimens
import dev.orbit.app.ui.theme.OrbitMotion
import dev.orbit.app.ui.theme.OrbitType
import dev.orbit.app.ui.theme.entrance
import dev.orbit.app.ui.theme.pressScale
import dev.orbit.app.ui.theme.rememberEntrances
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private val RoomFace = 48.dp

/** How round cards are. */
private val CardRadius = 28.dp

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
    onEditRoom: (Room) -> Unit = {},
    onDeleteRoom: (Room) -> Unit = {},
    onSearch: () -> Unit = {},
    /** Rooms as cards in a grid rather than a list, and switching between the two. */
    roomsAsCards: Boolean = false,
    onRoomsAsCards: (Boolean) -> Unit = {},
    /** The crew button and the lineup it opens. */
    huddle: CrewHuddle = rememberCrewHuddle(),
) {
    val c = Orbit.colors
    val haptics = rememberHaptics()
    // A room held down for its actions, and one waiting for the user to confirm its deletion.
    var acting by remember { mutableStateOf<Room?>(null) }
    var deleting by remember { mutableStateOf<Room?>(null) }
    val list = rememberLazyListState()
    // Content staggers in once, when real data replaces the placeholders.
    val entrances = rememberEntrances(state.loaded)

    // Only a pull shows the refresh indicator; background refreshes stay invisible.
    var pulled by remember { mutableStateOf(false) }
    LaunchedEffect(state.refreshing) { if (!state.refreshing) pulled = false }
    val pull = rememberPullToRefreshState()

    Scaffold(containerColor = c.bg) { padding ->
     Box(Modifier.fillMaxSize()) {
      Box(Modifier.fillMaxSize().padding(padding).behindCrewHuddle(huddle, state.agents.size)) {
        PullToRefreshBox(
            isRefreshing = pulled && state.refreshing,
            onRefresh = {
                pulled = true
                onRefresh()
            },
            modifier = Modifier.fillMaxSize(),
            state = pull,
            indicator = { RefreshIndicator(pull, pulled && state.refreshing) },
        ) {
            LazyColumn(Modifier.fillMaxSize(), state = list, contentPadding = PaddingValues(bottom = 112.dp)) {
                item(key = "header") { Header(state, huddle, onSettings) }
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
                    item(key = "nudges") {
                        NudgePager(
                            state.nudges.asReversed().take(5), state, now, onOpenNudge, onDismissNudge,
                            Modifier.padding(top = 20.dp).animateItem().entrance(entrances, "nudges", 0),
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

                // The main chat: the user and their main agent, who keeps up with every room. Pinned above the rooms.
                val mainRoom = state.mainRoom
                val mainAgent = state.agent(state.main?.agentId)
                if (mainRoom != null && mainAgent != null) item(key = "main-chat") {
                    MainChatCard(
                        mainRoom, mainAgent, now,
                        Modifier.padding(horizontal = GlassInset).padding(top = OrbitDimens.section).animateItem().entrance(entrances, "main-chat", 2),
                    ) { onOpenRoom(mainRoom) }
                }
                val rooms = state.otherRooms
                if (rooms.isNotEmpty() || !showIntro) item(key = "rooms-title") {
                    SectionTitle(
                        "Rooms",
                        Modifier.padding(horizontal = OrbitDimens.gutter).padding(top = OrbitDimens.section, bottom = 2.dp)
                            .entrance(entrances, "rooms-title", 2),
                        count = rooms.size,
                    ) {
                        if (rooms.size > 1) ViewSwitch(roomsAsCards, onRoomsAsCards)
                    }
                }
                if (rooms.isEmpty() && !showIntro) {
                    item(key = "rooms-empty") {
                        EmptyRooms(state.agents, Modifier.entrance(entrances, "rooms-empty", 3), onNewRoom = onNewRoom, onNewAgent = onNewAgent)
                    }
                }
                // Each room is its own frosted card in its crew's colors: in a list, or as a grid of cards.
                if (rooms.isNotEmpty()) item(key = "rooms") {
                    val hold = { room: Room ->
                        haptics.tick()
                        acting = room
                    }
                    AnimatedContent(
                        roomsAsCards && rooms.size > 1,
                        Modifier.fillMaxWidth().padding(horizontal = GlassInset).padding(top = 14.dp).animateItem().entrance(entrances, "rooms", 3),
                        transitionSpec = { fadeIn(tween(220, delayMillis = 90)) togetherWith fadeOut(tween(90)) },
                        label = "rooms",
                    ) { cards ->
                        if (cards) {
                            RoomGrid(rooms, state::agent, now, onLongClick = hold, onOpen = onOpenRoom)
                        } else {
                            // One card, rooms parted by hairlines.
                            Column(Modifier.fillMaxWidth().quietCard(RoundedCornerShape(24.dp)).clip(RoundedCornerShape(24.dp))) {
                                rooms.forEachIndexed { i, room ->
                                    if (i > 0) Hairline(Modifier.padding(start = 16.dp + RoomFace + 14.dp))
                                    RoomRow(room, room.agentIds.mapNotNull(state::agent), now, onLongClick = { hold(room) }) { onOpenRoom(room) }
                                }
                            }
                        }
                    }
                }
            }
        }
        if (state.agents.isNotEmpty() && state.rooms.isNotEmpty()) {
            BottomBar(onSearch, onNewRoom, Modifier.align(Alignment.BottomCenter))
        }
      }
      CrewHuddleOverlay(state.agents, huddle, onOpen = onEditAgent, onNewAgent = onNewAgent)
     }
    }
    acting?.let { room ->
        ActionSheet(
            onDismiss = { acting = null },
            title = room.name,
            preview = room.description.ifBlank { null },
            actions = listOf(
                SheetAction("Edit room", OrbitIcon.Edit) { onEditRoom(room) },
                SheetAction("Delete room", OrbitIcon.Trash, danger = true) { deleting = room },
            ),
        )
    }
    deleting?.let { room ->
        ActionSheet(
            onDismiss = { deleting = null },
            title = "Delete ${room.name}?",
            preview = "Its chat and schedules go too. The agents stay in your crew.",
            actions = listOf(SheetAction("Delete room", OrbitIcon.Trash, danger = true) { onDeleteRoom(room) }),
        )
    }
}

@Composable
private fun Header(state: AppState, huddle: CrewHuddle, onSettings: () -> Unit) {
    val c = Orbit.colors
    // The app's name, the crew in the middle, and on the right the PC it's talking to.
    Box(
        Modifier.fillMaxWidth().padding(start = OrbitDimens.gutter, end = OrbitDimens.gutter, top = 14.dp).height(48.dp),
    ) {
        Text(
            "Treehouse",
            Modifier.align(Alignment.CenterStart),
            style = OrbitType.titleM.copy(fontSize = OrbitType.titleL.fontSize * 0.9f),
            color = c.text,
        )
        if (state.agents.isNotEmpty()) CrewButton(state.agents, huddle, Modifier.align(Alignment.Center))

        // The hub is the app's one piece of infrastructure, so its status is also the way into settings.
        val online = state.loaded && !state.offline
        val interaction = remember { MutableInteractionSource() }
        Surface(
            onClick = onSettings,
            modifier = Modifier.align(Alignment.CenterEnd).lift(CircleShape, 0.6f).pressScale(interaction),
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

/** "Good evening," and the name below it, then what the crew is up to, on a wash of the speaker's color. */
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
    Column(modifier.fillMaxWidth().padding(start = OrbitDimens.gutter, end = OrbitDimens.gutter, top = 24.dp)) {
        if (state.profile.name.isNotBlank()) {
            Text("$part,", style = OrbitType.display, color = c.textTertiary, maxLines = 1)
            Text(state.profile.name, style = OrbitType.display, color = c.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
        } else {
            Text(part, style = OrbitType.display, color = c.text, maxLines = 1)
        }
        if (busy != null) {
            Row(
                Modifier
                    .padding(top = 12.dp)
                    .clip(CircleShape)
                    .background(c.surfaceRaised)
                    .padding(start = 4.dp, end = 12.dp, top = 4.dp, bottom = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (speaker != null) AgentPortrait(speaker.avatar, size = 22.dp) else StatusDot(c.live, Modifier.padding(start = 6.dp), size = 7.dp)
                ShimmerText(
                    if (speaker != null) "${speaker.name} is replying in ${busy.name}" else "Your crew is working in ${busy.name}",
                    OrbitType.bodyS,
                    c.textSecondary,
                    Modifier.padding(start = 8.dp),
                )
            }
        } else {
            Text(
                when {
                    !state.loaded -> "Checking in with your hub"
                    state.agents.isEmpty() -> "Let's set up your crew"
                    state.agents.size == 1 -> "${state.agents[0].name} is here when you need them"
                    else -> "Your crew of ${state.agents.size} is ready"
                },
                Modifier.padding(top = 8.dp),
                style = OrbitType.bodyM,
                color = c.textSecondary,
            )
        }
    }
}

/**
 * What agents wrote on their own, newest first, as one card to swipe through: who, why (a check-in, a
 * follow-up, a watch, the morning brief) and the first lines. Open takes you to the room; Dismiss takes it off Home.
 */
@Composable
private fun NudgePager(
    nudges: List<Nudge>,
    state: AppState,
    now: Long,
    onOpen: (Nudge) -> Unit,
    onDismiss: (Nudge) -> Unit,
    modifier: Modifier,
) {
    val pager = rememberPagerState(pageCount = { nudges.size })
    Column(modifier) {
        HorizontalPager(
            pager,
            contentPadding = PaddingValues(horizontal = OrbitDimens.gutter),
            pageSpacing = 10.dp,
            verticalAlignment = Alignment.Top,
            key = { nudges[it].id },
        ) { page ->
            val nudge = nudges[page]
            NudgeCard(
                nudge, state.agent(nudge.agentId), state.room(nudge.roomId), now,
                page = page, count = nudges.size,
                onOpen = { onOpen(nudge) },
                onDismiss = { onDismiss(nudge) },
            )
        }
    }
}

@Composable
private fun NudgeCard(
    nudge: Nudge,
    agent: Agent?,
    room: Room?,
    now: Long,
    page: Int,
    count: Int,
    onOpen: () -> Unit,
    onDismiss: () -> Unit,
) {
    val c = Orbit.colors
    val look = agent?.avatar ?: dev.orbit.app.data.AvatarSpec(0)
    val why = when (nudge.kind) {
        ProactiveMark.KIND_FOLLOW_UP -> "Follow-up"
        ProactiveMark.KIND_WATCH -> "Watch"
        ProactiveMark.KIND_BRIEF -> "Morning brief"
        else -> "Check-in"
    }
    OrbitCard(Modifier.fillMaxWidth(), onClick = onOpen) {
        Column(Modifier.padding(start = 16.dp, end = 12.dp, top = 14.dp, bottom = 12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                AgentPortrait(look, size = 38.dp)
                Row(Modifier.weight(1f).padding(start = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(agent?.name ?: "Your crew", style = OrbitType.titleS, color = look.textColor())
                    Text(
                        // The brief has a room of its own, so its name would only repeat what it is.
                        " · $why${room?.takeIf { nudge.kind != ProactiveMark.KIND_BRIEF }?.let { " · ${it.name}" }.orEmpty()}",
                        Modifier.weight(1f, fill = false),
                        style = OrbitType.bodyS,
                        color = c.textTertiary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                Text(relativeTime(nudge.at, now), Modifier.padding(start = 8.dp, end = 4.dp), style = OrbitType.caption, color = c.textTertiary)
            }
            Text(
                nudge.text,
                Modifier.padding(top = 10.dp, end = 4.dp),
                style = OrbitType.bodyM,
                color = c.text,
                minLines = 3,
                maxLines = 3,
                overflow = TextOverflow.Ellipsis,
            )
            Row(Modifier.padding(top = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                // Where this card sits among the others: the current one is a longer bar.
                Row(Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(5.dp), verticalAlignment = Alignment.CenterVertically) {
                    if (count > 1) repeat(count) { i ->
                        Box(
                            Modifier
                                .size(width = if (i == page) 16.dp else 6.dp, height = 6.dp)
                                .clip(CircleShape)
                                .background(if (i == page) c.text else c.surfaceHigh),
                        )
                    }
                }
                Text(
                    "Dismiss",
                    Modifier.tap(CircleShape, 0.94f, onDismiss).padding(horizontal = 12.dp, vertical = 10.dp),
                    style = OrbitType.label,
                    color = c.textSecondary,
                )
                Pill("Open", onOpen, selected = true)
            }
        }
    }
}

@Composable
private fun IntroCard(state: AppState, onStart: () -> Unit, onAddKey: () -> Unit, modifier: Modifier) {
    val c = Orbit.colors
    val room = state.introRoom
    val guide = state.agent(room?.agentIds?.firstOrNull())
        ?: state.agents.firstOrNull { agent -> state.providers.any { it.id == agent.provider && it.runsCode && it.configured } }
    val look = guide?.avatar ?: dev.orbit.app.data.AvatarSpec(9)
    val name = guide?.name ?: "Nova"
    val shape = RoundedCornerShape(OrbitDimens.radiusXL)
    Box(
        modifier
            .padding(start = OrbitDimens.gutter, end = OrbitDimens.gutter, top = 22.dp)
            .fillMaxWidth()
            .lift(shape)
            .clip(shape)
            .background(c.surface)
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

/** List or cards, beside Rooms. */
@Composable
private fun ViewSwitch(cards: Boolean, onChange: (Boolean) -> Unit) {
    val c = Orbit.colors
    Row(Modifier.clip(CircleShape).background(c.surfaceHigh.copy(alpha = 0.7f)).padding(3.dp)) {
        for ((icon, value, label) in listOf(Triple(OrbitIcon.List, false, "Show rooms as a list"), Triple(OrbitIcon.Grid, true, "Show rooms as cards"))) {
            val on = cards == value
            Box(
                Modifier
                    .size(width = 38.dp, height = 32.dp)
                    .clip(CircleShape)
                    .background(if (on) c.surface else Color.Transparent)
                    .selectable(on, role = Role.RadioButton) { onChange(value) }
                    .semantics { contentDescription = label },
                contentAlignment = Alignment.Center,
            ) {
                OrbitIcon(icon, size = 16.dp, tint = if (on) c.text else c.textTertiary)
            }
        }
    }
}

/** The face a room shows: whoever is replying, else whoever spoke last, else its lead or first agent. */
private fun faceOf(room: Room, agents: List<Agent>): Agent? =
    agents.firstOrNull { room.active && it.id == room.speaking }
        ?: agents.firstOrNull { it.name == room.preview?.author }
        ?: agents.firstOrNull { it.id == room.leadId }
        ?: agents.firstOrNull()

/** A room's face, with "+2" on its corner for the others in the room. [ring] is the color behind it. */
@Composable
private fun RoomPortrait(room: Room, agents: List<Agent>, size: Dp, ring: Color, modifier: Modifier = Modifier) {
    val face = faceOf(room, agents)
    Box(modifier.size(size)) {
        if (face != null) {
            AgentPortrait(
                face.avatar,
                Modifier.shared(SharedKeys.roomMember(room.id, face.id)),
                size = size,
                thinking = room.active && room.speaking == face.id,
            )
        }
        if (agents.size > 1) MoreBadge(agents.size - 1, ring, Modifier.align(Alignment.BottomEnd).offset(x = 6.dp, y = 4.dp))
    }
}

/** What a room has to say for itself: who's replying, else its last message. */
@Composable
private fun RoomLine(room: Room, agents: List<Agent>, modifier: Modifier = Modifier, lines: Int = 1) {
    val c = Orbit.colors
    val speaker = agents.firstOrNull { it.id == room.speaking }
    val preview = room.preview
    if (room.active) {
        ShimmerText(if (speaker != null) "${speaker.name} is replying…" else "Working…", OrbitType.bodyS, speaker?.avatar?.textColor() ?: c.textTertiary, modifier)
    } else {
        Text(
            if (preview == null) "No messages yet" else "${preview.author}: ${preview.text}",
            modifier,
            style = OrbitType.bodyS,
            color = if (preview == null) c.textTertiary else c.textSecondary,
            maxLines = lines,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

/** A room in the list: its face, name, when it last spoke and its last line. */
@Composable
private fun RoomRow(room: Room, agents: List<Agent>, now: Long, onLongClick: () -> Unit = {}, onClick: () -> Unit) {
    val c = Orbit.colors
    val speaker = agents.firstOrNull { it.id == room.speaking }
    Row(
        Modifier
            .fillMaxWidth()
            .tap(RectangleShape, 0.99f, onLongClick = onLongClick, onClick = onClick)
            .heightIn(min = 74.dp)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        RoomPortrait(room, agents, RoomFace, c.surface)
        Column(Modifier.weight(1f).padding(start = 14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(room.name, Modifier.weight(1f), style = OrbitType.titleS, color = c.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (room.active) {
                    StatusDot(speaker?.avatar?.textColor() ?: c.textSecondary, Modifier.padding(start = 10.dp), size = 7.dp)
                } else {
                    Text(relativeTime(room.updatedAt, now), Modifier.padding(start = 10.dp), style = OrbitType.caption, color = c.textTertiary)
                }
            }
            RoomLine(room, agents, Modifier.padding(top = 2.dp))
        }
    }
}

/** Rooms as cards: the first (busiest, or most recent) a wide card, the rest in pairs. One face each. */
@Composable
private fun RoomGrid(rooms: List<Room>, agentOf: (String) -> Agent?, now: Long, onLongClick: (Room) -> Unit, onOpen: (Room) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        val first = rooms.first()
        WideRoomCard(first, first.agentIds.mapNotNull(agentOf), now, { onLongClick(first) }) { onOpen(first) }
        rooms.drop(1).chunked(2).forEach { pair ->
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                pair.forEach { room ->
                    RoomCard(room, room.agentIds.mapNotNull(agentOf), now, Modifier.weight(1f), { onLongClick(room) }) { onOpen(room) }
                }
                if (pair.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

/** The main chat, pinned on Home: the main agent's face, a word on what it does, and the latest line. */
@Composable
private fun MainChatCard(room: Room, agent: Agent, now: Long, modifier: Modifier, onClick: () -> Unit) {
    val c = Orbit.colors
    val shape = RoundedCornerShape(CardRadius)
    Column(
        modifier
            .fillMaxWidth()
            .quietCard(shape)
            .tap(shape, 0.985f, onClick)
            .padding(16.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            AgentPortrait(
                agent.avatar,
                Modifier.shared(SharedKeys.roomMember(room.id, agent.id)),
                size = 52.dp,
                thinking = room.active && room.speaking == agent.id,
            )
            Column(Modifier.weight(1f).padding(start = 14.dp)) {
                Text(agent.name, style = OrbitType.titleM, color = c.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text("Your main chat · keeps up with every room", style = OrbitType.bodyS, color = c.textTertiary, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            if (!room.active) {
                Text(relativeTime(room.updatedAt, now), Modifier.align(Alignment.Top).padding(start = 8.dp), style = OrbitType.caption, color = c.textTertiary)
            }
        }
        RoomLine(room, listOf(agent), Modifier.padding(top = 12.dp), lines = 2)
    }
}

@Composable
private fun WideRoomCard(room: Room, agents: List<Agent>, now: Long, onLongClick: () -> Unit, onClick: () -> Unit) {
    val c = Orbit.colors
    val shape = RoundedCornerShape(CardRadius)
    val lead = agents.firstOrNull { it.id == room.leadId } ?: agents.firstOrNull()
    Column(
        Modifier
            .fillMaxWidth()
            .quietCard(shape)
            .tap(shape, 0.985f, onLongClick = onLongClick, onClick = onClick)
            .padding(16.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            RoomPortrait(room, agents, 44.dp, c.surface)
            Column(Modifier.weight(1f).padding(start = 12.dp)) {
                Text(room.name, style = OrbitType.titleM, color = c.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(
                    when {
                        agents.size <= 1 -> "Just you and ${lead?.name ?: "your agent"}"
                        room.mode == Room.MODE_LEAD && lead != null -> "Led by ${lead.name} · ${agents.size} agents"
                        else -> agents.joinToString { it.name }
                    },
                    style = OrbitType.bodyS,
                    color = c.textTertiary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            if (!room.active) {
                Text(relativeTime(room.updatedAt, now), Modifier.align(Alignment.Top).padding(start = 8.dp), style = OrbitType.caption, color = c.textTertiary)
            }
        }
        RoomLine(room, agents, Modifier.padding(top = 12.dp), lines = 2)
    }
}

@Composable
private fun RoomCard(room: Room, agents: List<Agent>, now: Long, modifier: Modifier, onLongClick: () -> Unit, onClick: () -> Unit) {
    val c = Orbit.colors
    val shape = RoundedCornerShape(CardRadius)
    Column(
        modifier
            .height(158.dp)
            .quietCard(shape)
            .tap(shape, 0.97f, onLongClick = onLongClick, onClick = onClick)
            .padding(14.dp),
    ) {
        Row(verticalAlignment = Alignment.Top) {
            val face = faceOf(room, agents)
            if (face != null) {
                AgentPortrait(
                    face.avatar,
                    Modifier.shared(SharedKeys.roomMember(room.id, face.id)),
                    size = 40.dp,
                    thinking = room.active && room.speaking == face.id,
                )
            }
            Spacer(Modifier.weight(1f))
            if (!room.active) Text(relativeTime(room.updatedAt, now), style = OrbitType.caption, color = c.textTertiary)
        }
        Row(Modifier.padding(top = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(room.name, Modifier.weight(1f, fill = false), style = OrbitType.titleS, color = c.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (agents.size > 1) Text("+${agents.size - 1}", Modifier.padding(start = 6.dp), style = OrbitType.caption, color = c.textTertiary)
        }
        RoomLine(room, agents, Modifier.padding(top = 2.dp), lines = 3)
    }
}

/** Search across every room, and a round button for a new room, floating over the bottom of Home. */
@Composable
private fun BottomBar(onSearch: () -> Unit, onNewRoom: () -> Unit, modifier: Modifier) {
    val c = Orbit.colors
    Row(
        modifier.fillMaxWidth().padding(start = OrbitDimens.gutter, end = OrbitDimens.gutter, bottom = 18.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        val search = remember { MutableInteractionSource() }
        Surface(
            onClick = onSearch,
            modifier = Modifier.weight(1f).pressScale(search, 0.98f),
            shape = CircleShape,
            color = c.surfaceRaised,
            contentColor = c.textTertiary,
            border = surfaceBorder(),
            shadowElevation = 6.dp,
            interactionSource = search,
        ) {
            Row(Modifier.height(52.dp).padding(horizontal = 18.dp), verticalAlignment = Alignment.CenterVertically) {
                OrbitIcon(OrbitIcon.Search, size = 18.dp, tint = c.textTertiary)
                Text("Search rooms and messages", Modifier.padding(start = 10.dp), style = OrbitType.bodyM, color = c.textTertiary, maxLines = 1)
            }
        }
        val add = remember { MutableInteractionSource() }
        Surface(
            onClick = onNewRoom,
            modifier = Modifier.pressScale(add, 0.94f),
            shape = CircleShape,
            color = c.primary,
            contentColor = c.onPrimary,
            shadowElevation = 6.dp,
            interactionSource = add,
        ) {
            Box(Modifier.size(52.dp), contentAlignment = Alignment.Center) {
                OrbitIcon(OrbitIcon.Plus, size = 20.dp, tint = c.onPrimary, description = "New room")
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

/** Placeholders laid out exactly like the room list, so nothing jumps when data lands. */
@Composable
private fun HomeSkeleton(modifier: Modifier = Modifier) {
    val text = RoundedCornerShape(4.dp)
    Column(modifier) {
        Box(
            Modifier.padding(start = OrbitDimens.gutter, top = OrbitDimens.section, bottom = 2.dp).height(40.dp),
            contentAlignment = Alignment.CenterStart,
        ) { SkeletonBlock(72.dp, 16.dp, text) }
        repeat(3) {
            Row(Modifier.padding(horizontal = OrbitDimens.gutter, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                SkeletonBlock(RoomFace, RoomFace, CircleShape)
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

/** Frosted cards sit a little wider than the gutter, so the text inside them lines up with the text outside. */
private val GlassInset = OrbitDimens.gutter - 6.dp
