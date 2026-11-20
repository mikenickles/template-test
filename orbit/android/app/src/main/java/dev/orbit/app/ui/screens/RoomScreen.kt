package dev.orbit.app.ui.screens

import android.content.ClipData
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.VisibilityThreshold
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.layout.heightIn
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.ClipEntry
import androidx.compose.ui.platform.LocalClipboard
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.onLongClick
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import dev.orbit.app.data.Agent
import dev.orbit.app.data.Attachment
import dev.orbit.app.data.Message
import dev.orbit.app.data.Room
import dev.orbit.app.ui.DraftAttachment
import dev.orbit.app.ui.RoomUiState
import dev.orbit.app.ui.SharedKeys
import dev.orbit.app.ui.components.ActionSheet
import dev.orbit.app.ui.components.ActivityTrail
import dev.orbit.app.ui.components.AgentAvatar
import dev.orbit.app.ui.components.AttachedItems
import dev.orbit.app.ui.components.AvatarRow
import dev.orbit.app.ui.components.DraftStrip
import dev.orbit.app.ui.components.FormerAgentAvatar
import dev.orbit.app.ui.components.IconTap
import dev.orbit.app.ui.components.MarkdownText
import dev.orbit.app.ui.components.OrbitIcon
import dev.orbit.app.ui.components.PhotoViewer
import dev.orbit.app.ui.components.Pill
import dev.orbit.app.ui.components.SheetAction
import dev.orbit.app.ui.components.ShimmerText
import dev.orbit.app.ui.components.SourceChips
import dev.orbit.app.ui.components.StatusDot
import dev.orbit.app.ui.components.inkColor
import dev.orbit.app.ui.components.lift
import dev.orbit.app.ui.components.surfaceBorder
import dev.orbit.app.ui.components.textColor
import dev.orbit.app.ui.shared
import dev.orbit.app.ui.theme.LocalEntrances
import dev.orbit.app.ui.theme.LocalReducedMotion
import dev.orbit.app.ui.theme.Orbit
import dev.orbit.app.ui.theme.OrbitDimens
import dev.orbit.app.ui.theme.OrbitMotion
import dev.orbit.app.ui.theme.OrbitType
import dev.orbit.app.ui.theme.entrance
import dev.orbit.app.ui.theme.pressScale
import dev.orbit.app.ui.theme.rememberEntrances
import dev.orbit.app.ui.theme.rememberHaptics
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlinx.coroutines.launch

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
    onDeleteMessage: (Message) -> Unit = {},
    onRetry: (Message) -> Unit = {},
    onPickPhotos: () -> Unit = {},
    onPickFiles: () -> Unit = {},
    onRemoveDraft: (DraftAttachment) -> Unit = {},
    /** Text to start the composer with, like something shared from another app. */
    initialDraft: String = "",
) {
    val c = Orbit.colors
    var draft by rememberSaveable { mutableStateOf(initialDraft) }
    // The message whose actions are open, after a long press.
    var acting by remember { mutableStateOf<Message?>(null) }
    var attaching by remember { mutableStateOf(false) }
    var viewing by remember { mutableStateOf<Attachment?>(null) }
    val haptics = rememberHaptics()
    val clipboard = LocalClipboard.current
    val byId = remember(everyone) { everyone.associateBy { it.id } }
    // "@nova" is drawn in Nova's color wherever it appears.
    val dark = c.isDark
    val mentionColors = remember(agents, dark) { agents.associate { it.name.replace(" ", "").lowercase() to it.avatar.inkColor(dark) } }
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

    val showLatest by remember { derivedStateOf { list.firstVisibleItemIndex > 0 || list.firstVisibleItemScrollOffset > 600 } }
    val scrolledUnderBar by remember { derivedStateOf { list.canScrollForward } }

    Box(Modifier.fillMaxSize().background(c.bg)) {
        Scaffold(
            containerColor = Color.Transparent,
            topBar = { RoomBar(room, agents, state, scrolledUnderBar, onBack, onEdit, onClear) },
            bottomBar = {
                Composer(
                    draft = draft,
                    onDraft = { draft = it },
                    agents = agents,
                    running = state.run.active,
                    drafts = state.drafts,
                    sending = state.sending,
                    onAttach = { attaching = true },
                    onRemoveDraft = onRemoveDraft,
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
                            StatusDot(c.textTertiary, size = 6.dp)
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
                                            // While a reply grows, the rows above move with it in lockstep; placement
                                            // only animates between runs, when messages are added or cleared.
                                            placementSpec = if (state.run.active) {
                                                null
                                            } else {
                                                spring(dampingRatio = 0.9f, stiffness = 380f, visibilityThreshold = IntOffset.VisibilityThreshold)
                                            },
                                        )
                                        .arrival(play, message.fromUser)
                                        .pointerInput(message.id) {
                                            detectTapGestures(
                                                onLongPress = {
                                                    haptics.tick()
                                                    acting = message
                                                },
                                            )
                                        }
                                        .semantics {
                                            onLongClick("Message options") {
                                                acting = message
                                                true
                                            }
                                        },
                                ) {
                                    if (message.fromUser) {
                                        UserMessage(message, mentionColors) { viewing = it }
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
                    enter = fadeIn(tween(OrbitMotion.SHORT)) + slideInVertically(OrbitMotion.snappy()) { it / 2 },
                    exit = fadeOut(tween(OrbitMotion.SHORT)) + slideOutVertically(tween(OrbitMotion.SHORT)) { it / 2 },
                ) {
                    LatestButton { scope.launch { list.animateScrollToItem(0) } }
                }
            }
        }
        if (attaching) {
            ActionSheet(
                onDismiss = { attaching = false },
                title = null,
                preview = null,
                actions = listOf(
                    SheetAction("Photos", OrbitIcon.Photo, onClick = onPickPhotos),
                    SheetAction("Files", OrbitIcon.File, onClick = onPickFiles),
                ),
            )
        }
        viewing?.let { PhotoViewer(it) { viewing = null } }
        acting?.let { message ->
            val author = if (message.fromUser) "Your message" else "${byId[message.author.agentId]?.name ?: message.author.name}'s reply"
            ActionSheet(
                onDismiss = { acting = null },
                title = author,
                preview = message.text.ifBlank { message.error },
                actions = messageActions(
                    message,
                    canRetry = canRetry(message, state, agents),
                    onCopy = {
                        scope.launch { clipboard.setClipEntry(ClipEntry(ClipData.newPlainText("Orbit message", message.text))) }
                    },
                    onRetry = { onRetry(message) },
                    onDelete = { onDeleteMessage(message) },
                ),
            )
        }
    }
}

/**
 * Whether a reply can be asked again: not while the crew is busy, only if its agent is still in the
 * room, and only for the newest message or one that failed or was stopped.
 */
internal fun canRetry(message: Message, state: RoomUiState, agents: List<Agent>): Boolean =
    !message.fromUser &&
        !state.run.active &&
        agents.any { it.id == message.author.agentId } &&
        (message.status == Message.STATUS_ERROR || message.status == Message.STATUS_STOPPED || state.messages.lastOrNull()?.id == message.id)

/** What a long press on a message offers. */
internal fun messageActions(
    message: Message,
    canRetry: Boolean,
    onCopy: () -> Unit,
    onRetry: () -> Unit,
    onDelete: () -> Unit,
): List<SheetAction> = buildList {
    if (message.text.isNotBlank()) add(SheetAction("Copy text", OrbitIcon.Copy, onClick = onCopy))
    if (canRetry) add(SheetAction("Ask again", OrbitIcon.Retry, onClick = onRetry))
    if (message.status != Message.STATUS_STREAMING) add(SheetAction("Delete", OrbitIcon.Trash, danger = true, onClick = onDelete))
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
    if (LocalReducedMotion.current) return text.length
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
                    style = OrbitType.titleM,
                    color = c.text,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                // The status line crossfades as the floor passes between agents.
                AnimatedContent(
                    targetState = when {
                        speaker != null -> RoomStatus("${speaker.name} is replying", speaker.avatar.inkColor(c.isDark))
                        state.run.active -> RoomStatus("Working", c.textTertiary)
                        room.mode == Room.MODE_LEAD -> RoomStatus("Led by ${agents.firstOrNull { it.id == room.leadId }?.name ?: "the first agent"}", null)
                        else -> RoomStatus("Round table", null)
                    },
                    transitionSpec = {
                        (fadeIn(tween(220, delayMillis = 60)) + slideInVertically { it / 2 }) togetherWith
                            (fadeOut(tween(120)) + slideOutVertically { -it / 2 })
                    },
                    label = "status",
                ) { status ->
                    // Text and dot travel with their own state, so the outgoing line keeps its look.
                    Row(Modifier.padding(top = 1.dp), verticalAlignment = Alignment.CenterVertically) {
                        status.dot?.let { StatusDot(it, Modifier.padding(end = 6.dp), size = 6.dp) }
                        Text(status.text, style = OrbitType.bodyS, color = c.textSecondary, maxLines = 1, overflow = TextOverflow.Ellipsis)
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
        // The crew, still and waiting. (The orbit is kept for pairing and the empty home.)
        AvatarRow(agents.map { it.avatar }, Modifier.entrance(entrances, "crew", 0), size = 52.dp, alive = true)
        Spacer(Modifier.height(24.dp))
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
private fun UserMessage(message: Message, mentionColors: Map<String, Color>, onOpenPhoto: (Attachment) -> Unit) {
    val c = Orbit.colors
    Column(Modifier.fillMaxWidth().padding(start = 56.dp), horizontalAlignment = Alignment.End) {
        AttachedItems(message.attachments, onOpenPhoto, Modifier.padding(bottom = if (message.text.isNotBlank()) 6.dp else 0.dp))
        if (message.text.isNotBlank()) {
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
        // New lines glide in rather than jump, and screen readers hear replies as they land.
        Column(
            Modifier
                .weight(1f)
                .padding(start = 14.dp)
                .animateContentSize(spring(stiffness = 800f))
                .semantics { liveRegion = LiveRegionMode.Polite },
        ) {
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
            // What the agent did on the way: searches, pages, code, files. A step in progress shimmers.
            ActivityTrail(message.activity, streaming, Modifier.padding(bottom = if (shown > 0 || streaming) 6.dp else 0.dp))
            if (shown > 0) {
                val visible = message.text.take(shown)
                MarkdownText(if (catchingUp) closeOpenMarkup(visible) else visible, mentions = mentionColors, fadeTail = tail.roundToInt())
            }
            when {
                streaming && shown == 0 && message.activity.all { it.done } ->
                    ShimmerText("Thinking", OrbitType.body, c.textTertiary, Modifier.padding(top = 1.dp))
                !catchingUp && message.sources.isNotEmpty() -> SourceChips(message.sources, Modifier.padding(top = 10.dp))
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
    // A list item that has only its marker so far ("- ", "2. ") waits until its words arrive.
    var out = text.trimEnd('*').replace(Regex("""(^|\n)[ \t]*(?:[-*•]|\d{1,3}[.)])[ \t]*$"""), "$1")
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

/**
 * One line at rest: the draft and the send button. While you're typing, the crew appears as
 * chips above the line, so you can mention someone with a tap.
 */
@Composable
private fun Composer(
    draft: String,
    onDraft: (String) -> Unit,
    agents: List<Agent>,
    running: Boolean,
    drafts: List<DraftAttachment>,
    sending: Boolean,
    onAttach: () -> Unit,
    onRemoveDraft: (DraftAttachment) -> Unit,
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
            MentionChips(focused && agents.size > 1, agents) { agent ->
                val mention = "@${agent.name.replace(" ", "")} "
                onDraft(if (draft.isEmpty() || draft.endsWith(" ")) draft + mention else "$draft $mention")
            }
            DraftStrip(drafts, sending, onRemoveDraft)
            Row(Modifier.heightIn(min = 56.dp).padding(start = 4.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                IconTap(OrbitIcon.Plus, "Attach a photo or file", onAttach, tint = c.textSecondary)
                BasicTextField(
                    value = draft,
                    onValueChange = onDraft,
                    modifier = Modifier.weight(1f).padding(vertical = 14.dp),
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
                SendButton(
                    canSend = (draft.isNotBlank() || drafts.isNotEmpty()) && !sending,
                    running = running,
                    onSend = {
                        haptics.tick()
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

/** The crew as chips, sliding open above the draft while you type. */
@Composable
private fun MentionChips(visible: Boolean, agents: List<Agent>, onMention: (Agent) -> Unit) {
    AnimatedVisibility(
        visible,
        enter = expandVertically(OrbitMotion.snappy()) + fadeIn(tween(OrbitMotion.SHORT, delayMillis = 60)),
        exit = shrinkVertically(OrbitMotion.snappy()) + fadeOut(tween(OrbitMotion.SHORT)),
    ) {
        Row(
            Modifier.horizontalScroll(rememberScrollState()).padding(start = 10.dp, end = 10.dp, top = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            for (agent in agents) {
                Pill(agent.name, onClick = { onMention(agent) }, leading = { AgentAvatar(agent.avatar, size = 24.dp) })
            }
        }
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
    val idle = mode == SendMode.Idle
    val fill by animateColorAsState(if (idle) c.surfaceRaised else c.primary, tween(OrbitMotion.MEDIUM), label = "fill")
    val ink by animateColorAsState(if (idle) c.textTertiary else c.onPrimary, tween(OrbitMotion.MEDIUM), label = "ink")
    // A 40dp button in a 48dp touch target. The morph uses a settled spring: runs often end on their own.
    Box(Modifier.size(48.dp), contentAlignment = Alignment.Center) {
        Surface(
            onClick = { if (mode == SendMode.Stop) onStop() else onSend() },
            enabled = !idle,
            modifier = Modifier.size(40.dp).pressScale(interaction, 0.86f),
            shape = CircleShape,
            color = fill,
            contentColor = ink,
            border = BorderStroke(1.dp, if (idle) c.hairline else Color.Transparent),
            interactionSource = interaction,
        ) {
            AnimatedContent(
                mode == SendMode.Stop,
                transitionSpec = {
                    (scaleIn(OrbitMotion.snappy(), initialScale = 0.5f) + fadeIn(tween(120))) togetherWith
                        (scaleOut(tween(120), targetScale = 0.5f) + fadeOut(tween(100)))
                },
                contentAlignment = Alignment.Center,
                label = "send",
            ) { stop ->
                Box(Modifier.size(40.dp), contentAlignment = Alignment.Center) {
                    if (stop) {
                        Box(Modifier.size(12.dp).clip(RoundedCornerShape(3.dp)).background(ink))
                    } else {
                        OrbitIcon(OrbitIcon.Up, size = 19.dp, tint = ink, description = "Send")
                    }
                }
            }
        }
    }
}

/** The room's status line: what it says, and the colored dot (if any) that goes with it. */
private data class RoomStatus(val text: String, val dot: Color?)
