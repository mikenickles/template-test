package dev.orbit.app.ui.screens

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.VisibilityThreshold
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.union
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.ripple
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import dev.orbit.app.data.Agent
import dev.orbit.app.data.Message
import dev.orbit.app.data.Room
import dev.orbit.app.ui.RoomUiState
import dev.orbit.app.ui.SharedKeys
import dev.orbit.app.ui.components.AgentAvatar
import dev.orbit.app.ui.components.AvatarRow
import dev.orbit.app.ui.components.FormerAgentAvatar
import dev.orbit.app.ui.components.IconTap
import dev.orbit.app.ui.components.MarkdownText
import dev.orbit.app.ui.components.OrbitIcon
import dev.orbit.app.ui.components.OrbitSystem
import dev.orbit.app.ui.components.ShimmerText
import dev.orbit.app.ui.components.StatusDot
import dev.orbit.app.ui.components.lift
import dev.orbit.app.ui.components.surfaceBorder
import dev.orbit.app.ui.components.textColor
import dev.orbit.app.ui.components.tint
import dev.orbit.app.ui.shared
import dev.orbit.app.ui.theme.LocalEntrances
import dev.orbit.app.ui.theme.Orbit
import dev.orbit.app.ui.theme.OrbitDimens
import dev.orbit.app.ui.theme.OrbitMotion
import dev.orbit.app.ui.theme.OrbitType
import dev.orbit.app.ui.theme.entrance
import dev.orbit.app.ui.theme.pressScale
import dev.orbit.app.ui.theme.rememberEntrances
import dev.orbit.app.ui.theme.rememberHaptics
import kotlinx.coroutines.launch
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/** How many trailing characters of a reply fade in as it streams. */
private const val FADE_TAIL = 16

@Composable
fun RoomScreen(
    room: Room,
    agents: List<Agent>,
    state: RoomUiState,
    onSend: (String) -> Unit,
    onStop: () -> Unit,
    onBack: () -> Unit,
    onEdit: () -> Unit,
    onClear: () -> Unit,
    /** Every agent on the hub, so messages from agents no longer in the room keep their face. */
    everyone: List<Agent> = agents,
) {
    val c = Orbit.colors
    var draft by rememberSaveable { mutableStateOf("") }
    val byId = remember(everyone) { everyone.associateBy { it.id } }
    // "@nova" is drawn in Nova's color wherever it appears.
    val mentionColors = agents.associate { it.name.replace(" ", "").lowercase() to it.avatar.textColor() }
    // An agent's model is named on its first reply only; after that the face is enough.
    val introductions = remember(state.messages) {
        state.messages.filterNot { it.fromUser }.distinctBy { it.author.agentId ?: it.author.name }.map { it.id }.toSet()
    }
    val list = rememberLazyListState()
    val scope = rememberCoroutineScope()

    // Messages already there when the room opened appear as they are; anything newer animates in.
    val history = remember(state.loaded) { state.messages.map { it.id }.toSet() }
    val arrived = remember { mutableSetOf<String>() }
    val entrancesOn = LocalEntrances.current

    // Sending a message brings the conversation back to the newest line.
    val lastFromUser = state.messages.lastOrNull { it.fromUser }?.id
    LaunchedEffect(lastFromUser) { if (lastFromUser != null && lastFromUser !in history) list.animateScrollToItem(0) }

    // A soft light in the speaker's color washes down from the top while they reply.
    val speaker = agents.firstOrNull { it.id == state.run.agentId }
    var lastTint by remember { mutableStateOf(c.text) }
    speaker?.let { lastTint = it.avatar.tint() }
    val glowTint by animateColorAsState(lastTint, OrbitMotion.gentle(), label = "glowTint")
    val glow by animateFloatAsState(if (speaker != null) 1f else 0f, tween(900), label = "glow")
    val glowStrength = if (c.isDark) 0.17f else 0.13f

    val showLatest by remember { derivedStateOf { list.firstVisibleItemIndex > 0 || list.firstVisibleItemScrollOffset > 600 } }
    val scrolledUnderBar by remember { derivedStateOf { list.canScrollForward } }

    Box(
        Modifier
            .fillMaxSize()
            .background(c.bg)
            .drawBehind {
                if (glow > 0f) {
                    val center = Offset(size.width / 2, -size.width * 0.3f)
                    val radius = size.width * 1.05f
                    drawCircle(
                        Brush.radialGradient(listOf(glowTint.copy(alpha = glowStrength * glow), Color.Transparent), center, radius),
                        radius,
                        center,
                    )
                }
            },
    ) {
        Scaffold(
            containerColor = Color.Transparent,
            topBar = { RoomBar(room, agents, state, scrolledUnderBar, onBack, onEdit, onClear) },
            bottomBar = {
                Composer(
                    draft = draft,
                    onDraft = { draft = it },
                    agents = agents,
                    running = state.run.active,
                    onSend = {
                        onSend(draft.trim())
                        draft = ""
                    },
                    onStop = onStop,
                )
            },
        ) { padding ->
            Box(Modifier.fillMaxSize().padding(padding)) {
                Column(Modifier.fillMaxSize()) {
                    AnimatedVisibility(state.loaded && !state.connected, enter = fadeIn() + slideInVertically(), exit = fadeOut() + slideOutVertically()) {
                        Row(
                            Modifier.fillMaxWidth().background(c.surface).padding(vertical = 8.dp),
                            horizontalArrangement = Arrangement.Center,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            StatusDot(c.textTertiary, size = 6.dp, pulsing = true)
                            Text("Reconnecting to your hub", Modifier.padding(start = 8.dp), style = OrbitType.label, color = c.textSecondary)
                        }
                    }
                    if (state.loaded && state.messages.isEmpty()) {
                        EmptyRoom(room, agents, Modifier.weight(1f))
                    } else {
                        // Newest at the bottom, and the list stays pinned there while replies stream in.
                        LazyColumn(
                            Modifier.weight(1f).fillMaxWidth(),
                            state = list,
                            reverseLayout = true,
                            contentPadding = PaddingValues(horizontal = OrbitDimens.gutter, vertical = 20.dp),
                            verticalArrangement = Arrangement.spacedBy(OrbitDimens.section),
                        ) {
                            items(state.messages.asReversed(), key = { it.id }) { message ->
                                val play = remember(message.id) { entrancesOn && message.id !in history && arrived.add(message.id) }
                                Box(
                                    Modifier
                                        .animateItem(
                                            fadeInSpec = null,
                                            placementSpec = spring(dampingRatio = 0.9f, stiffness = 380f, visibilityThreshold = IntOffset.VisibilityThreshold),
                                        )
                                        .arrival(play, message.fromUser),
                                ) {
                                    if (message.fromUser) {
                                        UserMessage(message, mentionColors)
                                    } else {
                                        AgentMessage(message, byId[message.author.agentId], mentionColors, showModel = message.id in introductions)
                                    }
                                }
                            }
                        }
                    }
                }
                AnimatedVisibility(
                    showLatest,
                    Modifier.align(Alignment.BottomCenter).padding(bottom = 12.dp),
                    enter = fadeIn(tween(OrbitMotion.SHORT)) + scaleIn(OrbitMotion.bouncy(), initialScale = 0.7f) + slideInVertically { it },
                    exit = fadeOut(tween(OrbitMotion.SHORT)) + scaleOut(targetScale = 0.8f),
                ) {
                    LatestButton { scope.launch { list.animateScrollToItem(0) } }
                }
            }
        }
    }
}

/** Plays a message's arrival: agents' replies rise into place; your own message springs up from the composer. */
private fun Modifier.arrival(play: Boolean, fromUser: Boolean): Modifier = composed {
    if (!play) return@composed Modifier
    val progress = remember { Animatable(0f) }
    LaunchedEffect(Unit) {
        progress.animateTo(1f, if (fromUser) spring(dampingRatio = 0.72f, stiffness = 420f) else tween(460, easing = OrbitMotion.Decelerate))
    }
    graphicsLayer {
        val p = progress.value
        alpha = p.coerceIn(0f, 1f)
        translationY = (1f - p) * (if (fromUser) 32.dp else 14.dp).toPx()
        if (fromUser) {
            val scale = 0.92f + 0.08f * p
            scaleX = scale
            scaleY = scale
            transformOrigin = TransformOrigin(1f, 1f)
        }
    }
}

/**
 * How much of a streaming reply to show. Network chunks arrive in bursts; this releases them at
 * an even pace, speeding up when it falls behind so it never lags far. Text that's already there
 * when first shown appears at once.
 */
@Composable
private fun rememberReveal(text: String): Int {
    var shown by remember { mutableIntStateOf(text.length) }
    val target = rememberUpdatedState(text.length)
    LaunchedEffect(Unit) {
        snapshotFlow { target.value }.collect { goal ->
            if (goal < shown) shown = goal
            var last = 0L
            var carry = 0f
            while (shown < target.value) {
                withFrameNanos { now ->
                    if (last != 0L) {
                        val backlog = target.value - shown
                        carry += max(60f, backlog * 6f) * (now - last) / 1e9f
                        val step = carry.toInt()
                        if (step > 0) {
                            carry -= step
                            shown = min(target.value, shown + step)
                        }
                    }
                    last = now
                }
            }
        }
    }
    return shown.coerceAtMost(text.length)
}

@Composable
private fun RoomBar(
    room: Room,
    agents: List<Agent>,
    state: RoomUiState,
    scrolled: Boolean,
    onBack: () -> Unit,
    onEdit: () -> Unit,
    onClear: () -> Unit,
) {
    val c = Orbit.colors
    var menu by remember { mutableStateOf(false) }
    val speaker = agents.firstOrNull { it.id == state.run.agentId }
    val divider by animateColorAsState(if (scrolled) c.hairline else Color.Transparent, tween(OrbitMotion.MEDIUM), label = "divider")
    Column(Modifier.fillMaxWidth().statusBarsPadding()) {
        Row(Modifier.height(64.dp).padding(start = 6.dp, end = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            IconTap(OrbitIcon.Back, "Back", onBack)
            Column(Modifier.weight(1f).padding(start = 2.dp, end = 12.dp)) {
                Text(
                    room.name,
                    Modifier.shared(SharedKeys.roomTitle(room.id)),
                    style = OrbitType.titleM,
                    color = c.text,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                // The status line crossfades as the floor passes between agents.
                AnimatedContent(
                    targetState = when {
                        speaker != null -> "${speaker.name} is replying"
                        state.run.active -> "Working"
                        room.mode == Room.MODE_LEAD -> "Led by ${agents.firstOrNull { it.id == room.leadId }?.name ?: "the first agent"}"
                        else -> "Round table"
                    },
                    transitionSpec = {
                        (fadeIn(tween(220, delayMillis = 60)) + slideInVertically { it / 2 }) togetherWith
                            (fadeOut(tween(120)) + slideOutVertically { -it / 2 })
                    },
                    label = "status",
                ) { status ->
                    Row(Modifier.padding(top = 1.dp), verticalAlignment = Alignment.CenterVertically) {
                        if (state.run.active) StatusDot(c.live, Modifier.padding(end = 6.dp), pulsing = true, size = 6.dp)
                        Text(
                            status,
                            style = OrbitType.bodyS,
                            color = if (state.run.active) c.live else c.textSecondary,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
            }
            // Who's here, large enough to recognise. They fly in from the room's tile on the home screen.
            AvatarRow(
                agents.map { it.avatar },
                size = 28.dp,
                max = 3,
                gap = 5.dp,
                itemModifier = { index -> Modifier.shared(SharedKeys.roomMember(room.id, agents[index].id)) },
            )
            if (agents.size > 3) {
                Text("+${agents.size - 3}", Modifier.padding(start = 6.dp), style = OrbitType.mono, color = c.textSecondary)
            }
            Box {
                IconTap(OrbitIcon.More, "Room options", { menu = true }, tint = c.textSecondary)
                DropdownMenu(expanded = menu, onDismissRequest = { menu = false }, shape = RoundedCornerShape(OrbitDimens.radiusM)) {
                    DropdownMenuItem(text = { Text("Edit room", style = OrbitType.bodyM) }, onClick = { menu = false; onEdit() })
                    DropdownMenuItem(text = { Text("Clear chat", style = OrbitType.bodyM) }, onClick = { menu = false; onClear() })
                }
            }
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(divider))
    }
}

@Composable
private fun EmptyRoom(room: Room, agents: List<Agent>, modifier: Modifier) {
    val c = Orbit.colors
    val entrances = rememberEntrances()
    Column(
        modifier.fillMaxWidth().padding(horizontal = 32.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        OrbitSystem(agents.map { it.avatar }, Modifier.fillMaxWidth().height(200.dp).entrance(entrances, "orbit", 0), avatarSize = 44.dp)
        Spacer(Modifier.height(8.dp))
        Text("The crew is ready", Modifier.entrance(entrances, "title", 1), style = OrbitType.titleL, color = c.text)
        Text(
            if (room.mode == Room.MODE_LEAD) {
                "Give them a task. The lead answers first and brings in the others."
            } else {
                "Give them a task and everyone weighs in. Mention an agent to ask just them."
            },
            Modifier.padding(top = 8.dp).entrance(entrances, "body", 2),
            style = OrbitType.body,
            color = c.textSecondary,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun UserMessage(message: Message, mentionColors: Map<String, Color>) {
    val c = Orbit.colors
    Box(Modifier.fillMaxWidth().padding(start = 56.dp), contentAlignment = Alignment.CenterEnd) {
        Box(
            Modifier
                .clip(RoundedCornerShape(topStart = 22.dp, topEnd = 22.dp, bottomStart = 22.dp, bottomEnd = 8.dp))
                .background(c.surfaceHigh)
                .padding(horizontal = OrbitDimens.rowPad, vertical = 10.dp),
        ) {
            MarkdownText(message.text, mentions = mentionColors)
        }
    }
}

@Composable
private fun AgentMessage(message: Message, agent: Agent?, mentionColors: Map<String, Color>, showModel: Boolean) {
    val c = Orbit.colors
    val avatar = agent?.avatar ?: FormerAgentAvatar
    val streaming = message.status == Message.STATUS_STREAMING
    val shown = rememberReveal(message.text)
    // The faded tail shrinks away once the reply has fully landed, rather than snapping solid.
    val catchingUp = streaming || shown < message.text.length
    val tail by animateFloatAsState(if (catchingUp) FADE_TAIL.toFloat() else 0f, tween(500), label = "tail")
    Row(Modifier.fillMaxWidth()) {
        AgentAvatar(avatar, Modifier.padding(top = 1.dp), size = 34.dp, thinking = streaming)
        Column(Modifier.weight(1f).padding(start = 14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(agent?.name ?: message.author.name, style = OrbitType.titleS, color = avatar.textColor())
                val model = message.author.model
                if (showModel && !model.isNullOrBlank()) {
                    Text(
                        model,
                        Modifier.padding(start = 8.dp),
                        style = OrbitType.mono,
                        color = c.textTertiary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            Spacer(Modifier.height(4.dp))
            if (shown > 0) {
                val visible = message.text.take(shown)
                MarkdownText(if (catchingUp) closeOpenMarkup(visible) else visible, mentions = mentionColors, fadeTail = tail.roundToInt())
            }
            when {
                streaming && message.text.isEmpty() -> ShimmerText("Thinking", OrbitType.body, c.textTertiary, Modifier.padding(top = 1.dp))
                message.status == Message.STATUS_ERROR -> Row(
                    Modifier
                        .padding(top = 2.dp)
                        .clip(RoundedCornerShape(OrbitDimens.radiusM))
                        .background(c.dangerSurface)
                        .padding(horizontal = 14.dp, vertical = 10.dp),
                ) {
                    StatusDot(c.danger, Modifier.padding(top = 7.dp), size = 6.dp)
                    Text(
                        message.error ?: "This agent couldn't reply.",
                        Modifier.padding(start = 10.dp),
                        style = OrbitType.bodyM,
                        color = c.text,
                    )
                }
                message.status == Message.STATUS_STOPPED -> Text(
                    "Stopped",
                    Modifier.padding(top = 6.dp),
                    style = OrbitType.caption,
                    color = c.textTertiary,
                )
            }
        }
    }
}

/**
 * While a reply is still arriving, hides a half-typed marker at the very end and closes any bold or
 * code span it has opened, so raw `**` and backticks never flash on screen.
 */
internal fun closeOpenMarkup(text: String): String {
    if (Regex("```").findAll(text).count() % 2 == 1) return text // inside a code block; the parser copes
    var out = text.trimEnd('*')
    if (out.count { it == '`' } % 2 == 1) out = if (out.endsWith('`')) out.dropLast(1) else "$out`"
    if (Regex("""\*\*""").findAll(out).count() % 2 == 1) out += "**"
    return out
}

/** Floats above the composer when you've scrolled back through the conversation. */
@Composable
private fun LatestButton(onClick: () -> Unit) {
    val c = Orbit.colors
    val interaction = remember { MutableInteractionSource() }
    Surface(
        onClick = onClick,
        modifier = Modifier.lift(CircleShape, 1.4f).pressScale(interaction, 0.92f),
        shape = CircleShape,
        color = c.surfaceRaised,
        contentColor = c.text,
        border = surfaceBorder(),
        shadowElevation = if (c.isDark) 8.dp else 0.dp,
        interactionSource = interaction,
    ) {
        Row(Modifier.height(38.dp).padding(start = 12.dp, end = 15.dp), verticalAlignment = Alignment.CenterVertically) {
            OrbitIcon(OrbitIcon.Down, size = 16.dp)
            Text("Latest", Modifier.padding(start = 6.dp), style = OrbitType.label)
        }
    }
}

/** One container holds the draft, the crew to mention, and the send button. */
@Composable
private fun Composer(
    draft: String,
    onDraft: (String) -> Unit,
    agents: List<Agent>,
    running: Boolean,
    onSend: () -> Unit,
    onStop: () -> Unit,
) {
    val c = Orbit.colors
    val haptics = rememberHaptics()
    val shape = RoundedCornerShape(OrbitDimens.radiusXL)
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()
    val edge by animateColorAsState(if (focused) c.text.copy(alpha = 0.3f) else c.hairline, tween(OrbitMotion.SHORT), label = "edge")
    Box(
        Modifier
            .fillMaxWidth()
            .windowInsetsPadding(WindowInsets.ime.union(WindowInsets.navigationBars))
            .padding(start = 12.dp, end = 12.dp, top = 4.dp, bottom = 12.dp),
    ) {
        Column(Modifier.fillMaxWidth().lift(shape).clip(shape).background(c.surface).border(1.dp, edge, shape)) {
            BasicTextField(
                value = draft,
                onValueChange = onDraft,
                modifier = Modifier.fillMaxWidth().padding(start = 18.dp, end = 18.dp, top = 16.dp),
                textStyle = OrbitType.body.copy(color = c.text),
                cursorBrush = SolidColor(c.text),
                maxLines = 6,
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
                interactionSource = interaction,
                decorationBox = { inner ->
                    if (draft.isEmpty()) Text("Message the crew", style = OrbitType.body, color = c.textTertiary)
                    inner()
                },
            )
            Row(Modifier.padding(start = 10.dp, end = 8.dp, top = 6.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                // Tap a face to mention that agent.
                if (agents.size > 1) {
                    for (agent in agents.take(5)) {
                        MentionFace(agent) {
                            haptics.tick()
                            val mention = "@${agent.name.replace(" ", "")} "
                            onDraft(if (draft.isEmpty() || draft.endsWith(" ")) draft + mention else "$draft $mention")
                        }
                    }
                    AnimatedVisibility(draft.isEmpty(), enter = fadeIn(), exit = fadeOut()) {
                        Text("Tap to mention", Modifier.padding(start = 6.dp), style = OrbitType.caption, color = c.textTertiary, maxLines = 1)
                    }
                }
                Spacer(Modifier.weight(1f))
                SendButton(
                    canSend = draft.isNotBlank(),
                    running = running,
                    onSend = {
                        haptics.confirm()
                        onSend()
                    },
                    onStop = {
                        haptics.tick()
                        onStop()
                    },
                )
            }
        }
    }
}

/** An agent's face in the composer. Tapping it gives a little hop. */
@Composable
private fun MentionFace(agent: Agent, onClick: () -> Unit) {
    val scope = rememberCoroutineScope()
    val hop = remember { Animatable(1f) }
    val interaction = remember { MutableInteractionSource() }
    Box(
        Modifier
            .size(44.dp)
            .pressScale(interaction, 0.85f)
            .clickable(interaction, ripple(bounded = false, radius = 22.dp)) {
                scope.launch {
                    hop.snapTo(1.18f)
                    hop.animateTo(1f, OrbitMotion.bouncy())
                }
                onClick()
            },
        contentAlignment = Alignment.Center,
    ) {
        AgentAvatar(
            agent.avatar,
            Modifier.graphicsLayer {
                scaleX = hop.value
                scaleY = hop.value
            },
            size = 30.dp,
        )
    }
}

private enum class SendMode { Idle, Send, Stop }

/** Send while there's a draft; stop while agents are replying. The icon morphs between the two. */
@Composable
private fun SendButton(canSend: Boolean, running: Boolean, onSend: () -> Unit, onStop: () -> Unit) {
    val c = Orbit.colors
    val mode = when {
        canSend -> SendMode.Send
        running -> SendMode.Stop
        else -> SendMode.Idle
    }
    val interaction = remember { MutableInteractionSource() }
    val fill by animateColorAsState(if (mode == SendMode.Idle) c.primary.copy(alpha = 0.3f) else c.primary, tween(OrbitMotion.MEDIUM), label = "fill")
    Surface(
        onClick = { if (mode == SendMode.Stop) onStop() else onSend() },
        enabled = mode != SendMode.Idle,
        modifier = Modifier.size(44.dp).pressScale(interaction, 0.86f),
        shape = CircleShape,
        color = fill,
        contentColor = c.onPrimary,
        interactionSource = interaction,
    ) {
        AnimatedContent(
            mode == SendMode.Stop,
            transitionSpec = {
                (scaleIn(OrbitMotion.bouncy(), initialScale = 0.4f) + fadeIn(tween(120))) togetherWith
                    (scaleOut(tween(120), targetScale = 0.4f) + fadeOut(tween(100)))
            },
            contentAlignment = Alignment.Center,
            label = "send",
        ) { stop ->
            Box(Modifier.size(44.dp), contentAlignment = Alignment.Center) {
                if (stop) {
                    Box(Modifier.size(13.dp).clip(RoundedCornerShape(3.dp)).background(c.onPrimary))
                } else {
                    OrbitIcon(OrbitIcon.Up, size = 20.dp, tint = c.onPrimary, description = "Send")
                }
            }
        }
    }
}
