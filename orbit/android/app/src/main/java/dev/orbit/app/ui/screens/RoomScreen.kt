package dev.orbit.app.ui.screens

import dev.orbit.app.ui.components.OrbitSheet
import dev.orbit.app.ui.components.Hairline
import androidx.compose.ui.semantics.heading
import androidx.compose.foundation.layout.width
import androidx.compose.ui.platform.LocalInspectionMode
import androidx.compose.ui.graphics.asComposeRenderEffect
import androidx.compose.ui.graphics.GraphicsLayerScope
import androidx.annotation.RequiresApi
import android.graphics.RuntimeShader
import android.graphics.RenderEffect
import android.os.Build
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.rememberInfiniteTransition
import dev.orbit.app.data.AvatarSpec
import dev.orbit.app.ui.components.wash
import dev.orbit.app.ui.components.CrewWash
import dev.orbit.app.ui.components.AvatarDisc
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
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import dev.orbit.app.data.Agent
import dev.orbit.app.data.Attachment
import dev.orbit.app.data.Message
import dev.orbit.app.data.Card
import dev.orbit.app.ui.components.ToolCard
import dev.orbit.app.data.ProactiveMark
import dev.orbit.app.data.Room
import dev.orbit.app.ui.DraftAttachment
import dev.orbit.app.ui.RoomUiState
import dev.orbit.app.ui.SharedKeys
import dev.orbit.app.ui.components.ActionSheet
import dev.orbit.app.ui.components.ActivityTrail
import dev.orbit.app.ui.components.AgentAvatar
import dev.orbit.app.ui.components.AttachedItems
import dev.orbit.app.ui.components.AvatarRow
import dev.orbit.app.ui.components.TreehouseScene
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
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.CompositingStrategy
import dev.orbit.app.data.CrewMade
import dev.orbit.app.ui.components.CrewTile
import dev.orbit.app.ui.components.tap
import dev.orbit.app.ui.components.tint
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.FocusRequester

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
    onSchedules: () -> Unit = {},
    /** Deletes this room, after the user has confirmed. */
    onDeleteRoom: () -> Unit = {},
    /** Opens another room, like the one the intro just created. */
    onOpenRoom: (roomId: String) -> Unit = {},
    /** Asks for fresh hub state, e.g. when the intro has created agents this screen doesn't know yet. */
    onStale: () -> Unit = {},
    /** Opens an agent, like one an agent just hired. */
    onOpenAgent: (agentId: String) -> Unit = {},
    /** Sends a reply to one message; its agent answers. */
    onSendReply: (text: String, replyTo: String) -> Unit = { text, _ -> onSend(text) },
    /** A message to open with a reply already started to. */
    startReplyTo: Message? = null,
    /** Listens for speech and hands back the words, for the mic button. */
    onVoice: ((text: String) -> Unit) -> Unit = {},
    /** The time "Today" is measured from; screenshot tests fix it. */
    now: Long = System.currentTimeMillis(),
    /** How many of the room's schedules are on, for the menu. */
    scheduleCount: Int = 0,
    onSearchRoom: () -> Unit = {},
    /** Puts one of the crew in this room. */
    onAddMember: (agentId: String) -> Unit = {},
    /** About how many tokens the next reply sends, for the header chip; null until known. */
    contextTokens: Int? = null,
    /** Opens the room's Tokens page. */
    onTokens: () -> Unit = {},
    /** Follow-ups and watches still set, so their cards can say when they're gone; null when unknown. */
    liveRefs: Set<String>? = null,
    /** Cancels the follow-up or stops the watch a card stands for. */
    onCancelCard: (Card) -> Unit = {},
    /** Allows or denies a big action an agent wants to take in the Treehouse browser. */
    onDecide: (Card, Boolean) -> Unit = { _, _ -> },
) {
    val c = Orbit.colors
    var draft by rememberSaveable { mutableStateOf(initialDraft) }
    // The message whose actions are open, after a long press.
    var acting by remember { mutableStateOf<Message?>(null) }
    // The message the next send answers, chosen with Reply.
    var replyingTo by remember { mutableStateOf(startReplyTo) }
    var attaching by remember { mutableStateOf(false) }
    var confirmingDelete by remember { mutableStateOf(false) }
    var showingMenu by remember { mutableStateOf(false) }
    var showingMembers by remember { mutableStateOf(false) }
    var viewing by remember { mutableStateOf<Attachment?>(null) }
    val haptics = rememberHaptics()
    val clipboard = LocalClipboard.current
    val byId = remember(everyone) { everyone.associateBy { it.id } }
    val unknown = state.messages.flatMap { m -> m.crew?.agentIds.orEmpty() + m.created.map { it.agentId } }.any { it !in byId }
    LaunchedEffect(unknown) { if (unknown) onStale() }
    // "@nova" is drawn in Nova's color wherever it appears.
    val dark = c.isDark
    val mentionColors = remember(agents, dark) { agents.associate { it.name.replace(" ", "").lowercase() to it.avatar.inkColor(dark) } }
    val replyColors: Map<String?, Color> = remember(everyone, dark) { everyone.associate { it.id to it.avatar.inkColor(dark) } }
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
    // Replies that landed while you were scrolled back, counted on the Latest button.
    val replies = state.messages.count { !it.fromUser }
    var seenReplies by remember { mutableIntStateOf(0) }
    LaunchedEffect(showLatest, replies) { if (!showLatest) seenReplies = replies }
    // Each message's predecessor, to group runs from one agent and to mark where a new day starts.
    val previous = remember(state.messages) { state.messages.zipWithNext().associate { (before, after) -> after.id to before } }

    Box(Modifier.fillMaxSize().background(c.bg)) {
        // The room glows softly in its members' colors.
        CrewWash(agents.take(4).map { it.avatar.tint() }, Modifier.fillMaxSize(), strength = 0.8f)
        Scaffold(
            containerColor = Color.Transparent,
            topBar = { RoomBar(room, agents, state, onBack, onMenu = { showingMenu = true }, onMembers = { showingMembers = true }, contextTokens = contextTokens, onTokens = onTokens) },
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
                    replyingTo = replyingTo?.let { target -> (byId[target.author.agentId]?.name ?: target.author.name) to target.text },
                    replyColor = replyingTo?.let { byId[it.author.agentId]?.avatar?.inkColor(dark) },
                    onCancelReply = { replyingTo = null },
                    onSend = {
                        val target = replyingTo
                        if (target != null) onSendReply(draft.trim(), target.id) else onSend(draft.trim())
                        draft = ""
                        replyingTo = null
                    },
                    onStop = onStop,
                    onVoice = { onVoice { words -> draft = if (draft.isBlank()) words else "${draft.trimEnd()} $words" } },
                    suggestions = if (state.loaded && state.messages.isNotEmpty() && !state.run.active) suggestionsFor(agents, state.messages) else emptyList(),
                    onSuggestion = { suggestion ->
                        haptics.tick()
                        if (suggestion.send) onSend(suggestion.text) else draft = suggestion.text
                    },
                )
            },
        ) { padding ->
            // The conversation runs the full height of the screen, behind the bar and the composer, and
            // fades away softly at both ends rather than stopping at an edge.
            val top = padding.calculateTopPadding()
            val bottom = padding.calculateBottomPadding()
            Box(Modifier.fillMaxSize()) {
                if (state.loaded && state.messages.isEmpty()) {
                    EmptyRoom(room, Modifier.fillMaxSize().padding(padding))
                } else {
                    // Newest at the bottom, and the list stays pinned there while replies stream in.
                    LazyColumn(
                        Modifier.fillMaxSize().fadeEdges(top, bottom).edgeBlur(top, bottom),
                        state = list,
                        reverseLayout = true,
                        contentPadding = PaddingValues(
                            start = OrbitDimens.gutter,
                            end = OrbitDimens.gutter,
                            top = top + 36.dp,
                            bottom = bottom + 28.dp,
                        ),
                    ) {
                        items(state.messages.asReversed(), key = { it.id }) { message ->
                            val play = remember(message.id) { entrancesOn && message.id !in history && arrived.add(message.id) }
                            val before = previous[message.id]
                            val newDay = message.createdAt > 0 && (before == null || !sameDay(before.createdAt, message.createdAt))
                            val runsOn = !newDay && continuesRun(before, message)
                          Column(
                              Modifier
                                  .padding(top = if (before == null) 0.dp else if (runsOn) 8.dp else OrbitDimens.section)
                                  .animateItem(
                                        fadeInSpec = null,
                                        // While a reply grows, the rows above move with it in lockstep; placement
                                        // only animates between runs, when messages are added or cleared.
                                        placementSpec = if (state.run.active) {
                                            null
                                        } else {
                                            spring(dampingRatio = 0.9f, stiffness = 380f, visibilityThreshold = IntOffset.VisibilityThreshold)
                                        },
                                    ),
                          ) {
                            if (newDay) DayDivider(message.createdAt, now, Modifier.padding(bottom = 18.dp))
                            Box(
                                Modifier
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
                                    UserMessage(message, mentionColors, onOpenPhoto = { viewing = it }, replyColors = replyColors)
                                } else {
                                    Column {
                                        AgentMessage(
                                            message,
                                            byId[message.author.agentId],
                                            mentionColors,
                                            showModel = message.id in introductions,
                                            continued = runsOn,
                                            now = now,
                                            liveRefs = liveRefs,
                                            onCancelCard = onCancelCard,
                                            onDecide = onDecide,
                                        )
                                        message.created.mapNotNull { byId[it.agentId] }.forEach { hired ->
                                            NewMember(hired, Modifier.padding(start = 48.dp, top = 14.dp)) { onOpenAgent(hired.id) }
                                        }
                                        message.crew?.let { made ->
                                            CrewReady(made, made.agentIds.mapNotNull(byId::get), Modifier.padding(start = 48.dp, top = 14.dp)) {
                                                onOpenRoom(made.roomId)
                                            }
                                        }
                                    }
                                }
                            }
                          }
                        }
                    }
                }
                // Losing the hub shows as a small pill under the bar, over the conversation.
                AnimatedVisibility(
                    state.loaded && !state.connected,
                    Modifier.align(Alignment.TopCenter).padding(top = top + 4.dp),
                    enter = fadeIn() + slideInVertically(),
                    exit = fadeOut() + slideOutVertically(),
                ) {
                    Row(
                        Modifier.clip(CircleShape).background(c.surfaceRaised).border(1.dp, c.hairline, CircleShape).padding(horizontal = 14.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        StatusDot(c.textTertiary, size = 6.dp)
                        Text("Reconnecting to your hub", Modifier.padding(start = 8.dp), style = OrbitType.label, color = c.textSecondary)
                    }
                }
                AnimatedVisibility(
                    showLatest,
                    Modifier.align(Alignment.BottomCenter).padding(bottom = bottom + 12.dp),
                    enter = fadeIn(tween(OrbitMotion.SHORT)) + slideInVertically(OrbitMotion.snappy()) { it / 2 },
                    exit = fadeOut(tween(OrbitMotion.SHORT)) + slideOutVertically(tween(OrbitMotion.SHORT)) { it / 2 },
                ) {
                    LatestButton((replies - seenReplies).coerceAtLeast(0)) { scope.launch { list.animateScrollToItem(0) } }
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
        if (showingMenu) {
            ActionSheet(
                onDismiss = { showingMenu = false },
                title = room.name,
                preview = listOf(
                    if (agents.size == 1) "1 agent" else "${agents.size} agents",
                    when (scheduleCount) { 0 -> null; 1 -> "1 schedule"; else -> "$scheduleCount schedules" },
                    state.messages.size.takeIf { it > 0 }?.let { if (it == 1) "1 message" else "$it messages" },
                ).filterNotNull().joinToString(" · "),
                leading = { CrewTile(agents.map { it.avatar }, size = 44.dp, color = agents.firstOrNull()?.avatar?.wash() ?: c.surfaceRaised) },
                actions = listOf(
                    SheetAction("Edit room", OrbitIcon.Edit, hint = "Name, mode, description", onClick = onEdit),
                    SheetAction("Members", OrbitIcon.Person, hint = if (agents.size == 1) "1 agent" else "${agents.size} agents") { showingMembers = true },
                    SheetAction("Schedules", OrbitIcon.Clock, hint = if (scheduleCount == 0) "" else "$scheduleCount on", onClick = onSchedules),
                    SheetAction("Search this room", OrbitIcon.Search, onClick = onSearchRoom),
                    SheetAction("Tokens", OrbitIcon.Chart, hint = contextTokens?.let { "${formatTokens(it.toLong())} per reply" } ?: "", onClick = onTokens),
                    SheetAction("Clear chat", OrbitIcon.Retry, onClick = onClear),
                    SheetAction("Delete room", OrbitIcon.Trash, danger = true) { confirmingDelete = true },
                ),
            )
        }
        if (showingMembers) {
            OrbitSheet(onDismiss = { showingMembers = false }) {
                MembersSheet(
                    room, agents, everyone, state, now,
                    onMessage = { agent ->
                        val handle = "@${agent.name.replace(" ", "")} "
                        draft = if (draft.isBlank()) handle else "${draft.trimEnd()} $handle"
                        showingMembers = false
                    },
                    onAdd = onAddMember,
                )
            }
        }
        if (confirmingDelete) {
            ActionSheet(
                onDismiss = { confirmingDelete = false },
                title = "Delete ${room.name}?",
                preview = "Its chat and schedules go too. The agents stay in your crew.",
                actions = listOf(SheetAction("Delete room", OrbitIcon.Trash, danger = true, onClick = onDeleteRoom)),
            )
        }
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
                        scope.launch { clipboard.setClipEntry(ClipEntry(ClipData.newPlainText("Treehouse message", message.text))) }
                    },
                    onRetry = { onRetry(message) },
                    onDelete = { onDeleteMessage(message) },
                    onReply = { replyingTo = message },
                ),
            )
        }
    }
}

/**
 * Fades the content out toward both ends. At the top it eases down through the bar ([top] tall) to a
 * faint trace at the very edge of the screen, so you can still sense the conversation going up behind
 * it. At the bottom it's gone by the top of the composer ([bottom] tall). Fully there a little way clear of each.
 */
/** How much of the conversation still shows at the very top of the screen. */
private const val TRACE = 0.04f

private fun Modifier.fadeEdges(top: Dp, bottom: Dp): Modifier = graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen }
    .drawWithContent {
        drawContent()
        val h = size.height
        if (h <= 0f) return@drawWithContent
        val barEnd = (top.toPx() / h).coerceIn(0f, 1f)
        val solidTop = ((top + 56.dp).toPx() / h).coerceIn(barEnd, 1f)
        val clearBottom = (1f - bottom.toPx() / h).coerceIn(solidTop, 1f)
        val solidBottom = (1f - (bottom + 32.dp).toPx() / h).coerceIn(solidTop, clearBottom)
        drawRect(
            Brush.verticalGradient(
                0f to Color.Black.copy(alpha = TRACE),
                barEnd * 0.6f to Color.Black.copy(alpha = TRACE * 2.5f),
                barEnd to Color.Black.copy(alpha = 0.3f),
                solidTop to Color.Black,
                solidBottom to Color.Black,
                clearBottom to Color.Transparent,
                1f to Color.Transparent,
            ),
            blendMode = BlendMode.DstIn,
        )
    }

/**
 * As the conversation fades toward the bar and the composer, it also goes softly out of focus: no blur
 * where the text is fully there, growing to a few dp at the very edges. Android 13 and newer; earlier
 * phones keep the fade alone.
 */
private fun Modifier.edgeBlur(top: Dp, bottom: Dp): Modifier = composed {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || LocalInspectionMode.current) return@composed this
    // A phone that can't build the effect (the shader is compiled as it's made) keeps the plain fade.
    val blur = remember { runCatching { EdgeBlur() }.getOrNull() } ?: return@composed this
    graphicsLayer { renderEffect = runCatching { blur.effect(this, top, bottom) }.getOrNull() }
}

@RequiresApi(Build.VERSION_CODES.TIRAMISU)
private class EdgeBlur {
    private val across = RuntimeShader(EDGE_BLUR)
    private val down = RuntimeShader(EDGE_BLUR)

    fun effect(scope: GraphicsLayerScope, top: Dp, bottom: Dp): androidx.compose.ui.graphics.RenderEffect = with(scope) {
        // The same bands as the fade: clear below the bar's solid line and above the composer's.
        val topEnd = (top + 56.dp).toPx()
        val bottomStart = size.height - (bottom + 32.dp).toPx()
        for ((shader, x, y) in listOf(Triple(across, 1f, 0f), Triple(down, 0f, 1f))) {
            shader.setFloatUniform("topEnd", topEnd)
            shader.setFloatUniform("bottomStart", bottomStart)
            shader.setFloatUniform("height", size.height)
            shader.setFloatUniform("radius", MAX_EDGE_BLUR.toPx())
            shader.setFloatUniform("direction", x, y)
        }
        RenderEffect.createChainEffect(
            RenderEffect.createRuntimeShaderEffect(down, "content"),
            RenderEffect.createRuntimeShaderEffect(across, "content"),
        ).asComposeRenderEffect()
    }
}

/** How soft the conversation gets at the very edges of the screen. */
private val MAX_EDGE_BLUR = 7.dp

/** One pass of a blur whose radius grows toward the top and bottom bands; run across, then down. */
private const val EDGE_BLUR = """
uniform shader content;
uniform float topEnd;
uniform float bottomStart;
uniform float height;
uniform float radius;
uniform float2 direction;

half4 main(float2 p) {
    float t = 0.0;
    if (p.y < topEnd) {
        t = 1.0 - p.y / max(topEnd, 1.0);
    } else if (p.y > bottomStart) {
        t = (p.y - bottomStart) / max(height - bottomStart, 1.0);
    }
    float r = radius * t * sqrt(t);
    if (r < 0.5) return content.eval(p);
    half4 sum = half4(0.0);
    float total = 0.0;
    for (int i = -6; i <= 6; i++) {
        float x = float(i) / 6.0;
        float w = exp(-2.5 * x * x);
        sum += content.eval(p + direction * (x * r)) * w;
        total += w;
    }
    return sum / total;
}
"""

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
    onReply: (() -> Unit)? = null,
): List<SheetAction> = buildList {
    // A finished reply can be answered directly: its agent replies, whoever the room would pick.
    if (onReply != null && !message.fromUser && message.status == Message.STATUS_DONE) add(SheetAction("Reply", OrbitIcon.Reply, onClick = onReply))
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
    onBack: () -> Unit,
    onMenu: () -> Unit,
    onMembers: () -> Unit,
    contextTokens: Int? = null,
    onTokens: () -> Unit = {},
) {
    val c = Orbit.colors
    val speaker = agents.firstOrNull { it.id == state.run.agentId }
    Column(Modifier.fillMaxWidth().statusBarsPadding()) {
        // A frosted pill floating over the conversation, which fades and blurs as it passes under.
        val pill = RoundedCornerShape(22.dp)
        Row(
            Modifier
                .padding(start = 10.dp, end = 10.dp, top = 4.dp, bottom = 4.dp)
                .fillMaxWidth()
                .clip(pill)
                .background(c.glass)
                .border(1.dp, c.hairline, pill)
                .height(60.dp)
                .padding(horizontal = 2.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
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
                        agents.size == 1 -> RoomStatus("Just you and ${agents[0].name}", null)
                        room.mode == Room.MODE_AUTO -> RoomStatus("Best fit · ${agents.joinToString(", ") { it.name }}", null)
                        room.mode == Room.MODE_LEAD -> RoomStatus("Led by ${agents.firstOrNull { it.id == room.leadId }?.name ?: agents.firstOrNull()?.name ?: "the first agent"}", null)
                        else -> RoomStatus("Round table · ${agents.joinToString(", ") { it.name }}", null)
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
            Row(
                Modifier.tap(CircleShape, 0.94f, onMembers).semantics { contentDescription = "Who's in this room" }.padding(4.dp),
                horizontalArrangement = Arrangement.spacedBy((-10).dp),
            ) {
                agents.take(3).forEach { agent ->
                    AvatarDisc(
                        agent.avatar,
                        Modifier.border(2.dp, c.bg, CircleShape),
                        size = 32.dp,
                        avatarModifier = Modifier.shared(SharedKeys.roomMember(room.id, agent.id)),
                    )
                }
            }
            if (agents.size > 3) {
                Text("+${agents.size - 3}", Modifier.padding(start = 6.dp), style = OrbitType.mono, color = c.textSecondary)
            }
            // About how many tokens the next reply sends; opens the Tokens page.
            contextTokens?.let { tokens ->
                Text(
                    formatTokens(tokens.toLong()),
                    Modifier
                        .padding(start = 8.dp)
                        .tap(CircleShape, 0.94f, onTokens)
                        .semantics { contentDescription = "About ${formatTokens(tokens.toLong())} tokens per reply" }
                        .background(c.surfaceHigh, CircleShape)
                        .padding(horizontal = 8.dp, vertical = 3.dp),
                    style = OrbitType.mono,
                    color = c.textSecondary,
                )
            }
            IconTap(OrbitIcon.More, "Room options", onMenu, tint = c.textSecondary)
        }
    }
}

@Composable
private fun EmptyRoom(room: Room, modifier: Modifier) {
    val c = Orbit.colors
    val entrances = rememberEntrances()
    Column(
        modifier.fillMaxWidth().padding(horizontal = 32.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        // The room's crew, at home in the treehouse and waiting for a task.
        TreehouseScene(Modifier.fillMaxWidth().height(220.dp).entrance(entrances, "crew", 0))
        Spacer(Modifier.height(20.dp))
        Text("The crew is ready", Modifier.entrance(entrances, "title", 1), style = OrbitType.titleL, color = c.text)
        Text(
            if (room.mode == Room.MODE_AUTO) {
                "Ask anything. Whoever it suits best answers. Mention an agent to ask them directly."
            } else if (room.mode == Room.MODE_LEAD) {
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
private fun UserMessage(
    message: Message,
    mentionColors: Map<String, Color>,
    onOpenPhoto: (Attachment) -> Unit,
    replyColors: Map<String?, Color> = emptyMap(),
) {
    val c = Orbit.colors
    Column(Modifier.fillMaxWidth().padding(start = 56.dp), horizontalAlignment = Alignment.End) {
        // Posted by the hub on a schedule, not typed just now.
        message.scheduled?.let { scheduled ->
            Row(Modifier.padding(bottom = 6.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                OrbitIcon(OrbitIcon.Clock, size = 13.dp, tint = c.textTertiary)
                Text("Scheduled · ${scheduled.label}", Modifier.padding(start = 5.dp), style = OrbitType.caption, color = c.textTertiary)
            }
        }
        // What this message answers, quoted small above it.
        message.replyTo?.let { quoted ->
            Row(Modifier.padding(bottom = 6.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                OrbitIcon(OrbitIcon.Reply, size = 13.dp, tint = c.textTertiary)
                Text(
                    buildAnnotatedString {
                        withStyle(SpanStyle(color = replyColors[quoted.agentId] ?: c.textSecondary, fontWeight = FontWeight.SemiBold)) { append(quoted.name) }
                        append("  ${quoted.text}")
                    },
                    Modifier.padding(start = 5.dp),
                    style = OrbitType.caption,
                    color = c.textTertiary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
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

/** Someone an agent just hired, washed in their own color, and the way to look them over. */
@Composable
private fun NewMember(agent: Agent, modifier: Modifier, onOpen: () -> Unit) {
    val c = Orbit.colors
    val shape = RoundedCornerShape(OrbitDimens.radiusL)
    val wash = agent.avatar.tint().copy(alpha = if (c.isDark) 0.24f else 0.28f)
    Row(
        modifier
            .fillMaxWidth()
            .clip(shape)
            .background(c.surface)
            .background(Brush.horizontalGradient(listOf(wash, Color.Transparent)))
            .border(surfaceBorder(), shape)
            .tap(shape, 0.97f, onOpen)
            .padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        AgentAvatar(agent.avatar, size = 52.dp, alive = true)
        Column(Modifier.weight(1f).padding(start = 14.dp, end = 10.dp)) {
            Text("Meet ${agent.name}", style = OrbitType.titleS, color = c.text)
            Text(
                listOf(agent.role, agent.model).filter { it.isNotBlank() }.joinToString(" · "),
                Modifier.padding(top = 2.dp),
                style = OrbitType.bodyS,
                color = c.textSecondary,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Pill("View", onOpen)
    }
}

/** The intro's payoff: the crew it just built, and the way into their room. */
@Composable
private fun CrewReady(made: CrewMade, crew: List<Agent>, modifier: Modifier, onOpen: () -> Unit) {
    val c = Orbit.colors
    val shape = RoundedCornerShape(OrbitDimens.radiusL)
    val tints = crew.drop(1).ifEmpty { crew }.map { it.avatar.tint().copy(alpha = if (c.isDark) 0.24f else 0.28f) }
    Row(
        modifier
            .fillMaxWidth()
            .clip(shape)
            .background(c.surface)
            .background(Brush.horizontalGradient(if (tints.size > 1) tints else listOf(tints.firstOrNull() ?: Color.Transparent, Color.Transparent)))
            .border(surfaceBorder(), shape)
            .tap(shape, 0.97f, onOpen)
            .padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CrewTile(crew.map { it.avatar }, size = 56.dp, color = c.surface.copy(alpha = 0.7f))
        Column(Modifier.weight(1f).padding(start = 14.dp, end = 10.dp)) {
            Text(made.label.ifBlank { "Your crew is ready" }, style = OrbitType.titleS, color = c.text)
            Text(
                "${made.name} · ${crew.joinToString(", ") { it.name }}",
                Modifier.padding(top = 2.dp),
                style = OrbitType.bodyS,
                color = c.textSecondary,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Pill("Open", onOpen, selected = true)
    }
}

@Composable
private fun AgentMessage(
    message: Message,
    agent: Agent?,
    mentionColors: Map<String, Color>,
    showModel: Boolean,
    continued: Boolean = false,
    now: Long = System.currentTimeMillis(),
    liveRefs: Set<String>? = null,
    onCancelCard: (Card) -> Unit = {},
    onDecide: (Card, Boolean) -> Unit = { _, _ -> },
) {
    val c = Orbit.colors
    val avatar = agent?.avatar ?: FormerAgentAvatar
    val streaming = message.status == Message.STATUS_STREAMING
    val shown = rememberReveal(message.text)
    // The faded tail shrinks away once the reply has fully landed, rather than snapping solid.
    val catchingUp = streaming || shown < message.text.length
    val tail by animateFloatAsState(if (catchingUp) FADE_TAIL.toFloat() else 0f, tween(500), label = "tail")
    Row(Modifier.fillMaxWidth()) {
        // A run from one agent shows its face and name once, at the top.
        if (continued) Spacer(Modifier.width(34.dp)) else AvatarDisc(avatar, Modifier.padding(top = 1.dp), size = 34.dp, thinking = streaming && shown > 0)
        // New lines glide in rather than jump, and screen readers hear replies as they land.
        Column(
            Modifier
                .weight(1f)
                .padding(start = 14.dp)
                .animateContentSize(spring(stiffness = 800f))
                .semantics { liveRegion = LiveRegionMode.Polite },
        ) {
            if (!continued) Row(Modifier.heightIn(min = 22.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(agent?.name ?: message.author.name, style = OrbitType.titleS, color = avatar.textColor())
                // Written on its own, unasked: say why, quietly.
                message.proactive?.let { mark ->
                    OrbitIcon(OrbitIcon.Bell, Modifier.padding(start = 8.dp), size = 13.dp, tint = c.textTertiary)
                    Text(
                        when (mark.kind) {
                            ProactiveMark.KIND_FOLLOW_UP -> "Following up"
                            ProactiveMark.KIND_WATCH -> "Watching"
                            ProactiveMark.KIND_BRIEF -> "Morning brief"
                            else -> "Checking in"
                        },
                        Modifier.padding(start = 4.dp),
                        style = OrbitType.caption,
                        color = c.textTertiary,
                    )
                }
                val model = message.author.model
                if (showModel && !model.isNullOrBlank() && message.proactive == null) {
                    // The model as a small tag, by its everyday name.
                    Text(
                        modelTag(model),
                        Modifier
                            .padding(start = 8.dp)
                            .border(1.dp, c.hairline, RoundedCornerShape(6.dp))
                            .padding(horizontal = 6.dp, vertical = 1.dp),
                        style = OrbitType.mono,
                        color = c.textTertiary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                if (message.createdAt > 0 && !streaming) {
                    Text(clockTime(message.createdAt), Modifier.padding(start = 8.dp), style = OrbitType.caption, color = c.textTertiary, maxLines = 1)
                }
            }
            if (!continued) Spacer(Modifier.height(4.dp))
            // What the agent did on the way: searches, pages, code, files. A step in progress shimmers.
            ActivityTrail(message.activity, streaming, Modifier.padding(bottom = if (shown > 0 || streaming) 6.dp else 0.dp))
            if (message.cards.isEmpty()) {
                if (shown > 0) {
                    val visible = message.text.take(shown)
                    MarkdownText(if (catchingUp) closeOpenMarkup(visible) else visible, mentions = mentionColors, fadeTail = tail.roundToInt())
                }
            } else {
                // Cards sit where the agent's tools ran: text before, the card, then what it wrote after.
                val text = message.text
                val piece: @Composable (Int, Int) -> Unit = { from, to ->
                    val upTo = minOf(to, shown)
                    val part = if (upTo > from) text.substring(from, upTo).trim() else ""
                    if (part.isNotEmpty()) {
                        val revealing = catchingUp && shown < to
                        MarkdownText(if (revealing) closeOpenMarkup(part) else part, mentions = mentionColors, fadeTail = if (revealing) tail.roundToInt() else 0)
                    }
                }
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    var start = 0
                    for (card in message.cards.sortedBy { it.at }) {
                        val end = card.at.coerceIn(start, text.length)
                        piece(start, end)
                        if (shown >= end) {
                            ToolCard(
                                card,
                                avatar,
                                agent?.name ?: message.author.name,
                                now,
                                // Just set, the app may not have heard of it yet: it's live until a refresh says otherwise.
                                live = card.ref.isBlank() || liveRefs == null || card.ref in liveRefs || streaming || now - message.createdAt < 120_000,
                                onCancel = onCancelCard,
                                onDecide = onDecide,
                            )
                        }
                        start = end
                    }
                    piece(start, text.length)
                }
            }
            when {
                streaming && shown == 0 && message.activity.all { it.done } -> ThinkingDots(avatar, Modifier.padding(top = 2.dp))
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
private fun LatestButton(newReplies: Int, onClick: () -> Unit) {
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
            Text(if (newReplies > 0) "$newReplies new" else "Latest", Modifier.padding(start = 6.dp), style = OrbitType.label)
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
    /** Who and what the next message answers: (name, their words). */
    replyingTo: Pair<String, String>? = null,
    replyColor: Color? = null,
    onCancelReply: () -> Unit = {},
    onVoice: () -> Unit = {},
    suggestions: List<Suggestion> = emptyList(),
    onSuggestion: (Suggestion) -> Unit = {},
) {
    val c = Orbit.colors
    val haptics = rememberHaptics()
    val shape = RoundedCornerShape(OrbitDimens.radiusXL)
    val focus = remember { FocusRequester() }
    // Choosing Reply puts the cursor straight in the box.
    LaunchedEffect(replyingTo) { if (replyingTo != null) runCatching { focus.requestFocus() } }
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()
    val edge by animateColorAsState(if (focused) c.text.copy(alpha = 0.3f) else c.hairline, tween(OrbitMotion.SHORT), label = "edge")
    Box(
        Modifier
            .fillMaxWidth()
            .windowInsetsPadding(WindowInsets.ime.union(WindowInsets.navigationBars))
            .padding(start = 12.dp, end = 12.dp, top = 4.dp, bottom = 12.dp),
    ) {
      Column {
        // Quick things to say, while the box is empty and nobody is replying.
        AnimatedVisibility(
            suggestions.isNotEmpty() && draft.isEmpty() && !focused && replyingTo == null,
            enter = expandVertically(OrbitMotion.snappy()) + fadeIn(),
            exit = shrinkVertically(OrbitMotion.snappy()) + fadeOut(),
        ) {
            Row(
                Modifier.horizontalScroll(rememberScrollState()).padding(start = 2.dp, end = 2.dp, bottom = 10.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                for (suggestion in suggestions) Pill(suggestion.label, onClick = { onSuggestion(suggestion) })
            }
        }
        Column(Modifier.fillMaxWidth().lift(shape).clip(shape).background(c.surface).border(1.dp, edge, shape)) {
            MentionChips(focused && agents.size > 1, agents) { agent ->
                val mention = "@${agent.name.replace(" ", "")} "
                onDraft(if (draft.isEmpty() || draft.endsWith(" ")) draft + mention else "$draft $mention")
            }
            AnimatedVisibility(replyingTo != null, enter = expandVertically() + fadeIn(), exit = shrinkVertically() + fadeOut()) {
                val (name, words) = replyingTo ?: ("" to "")
                Row(Modifier.fillMaxWidth().padding(start = 16.dp, end = 4.dp, top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    OrbitIcon(OrbitIcon.Reply, size = 16.dp, tint = replyColor ?: c.textSecondary)
                    Column(Modifier.weight(1f).padding(start = 10.dp)) {
                        Text("Replying to $name", style = OrbitType.label, color = replyColor ?: c.text)
                        Text(words, style = OrbitType.bodyS, color = c.textSecondary, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    IconTap(OrbitIcon.Close, "Cancel reply", onCancelReply, tint = c.textTertiary)
                }
            }
            DraftStrip(drafts, sending, onRemoveDraft)
            Row(Modifier.heightIn(min = 56.dp).padding(start = 4.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                IconTap(OrbitIcon.Plus, "Attach a photo or file", onAttach, tint = c.textSecondary)
                BasicTextField(
                    value = draft,
                    onValueChange = onDraft,
                    modifier = Modifier.weight(1f).padding(vertical = 14.dp).focusRequester(focus),
                    textStyle = OrbitType.body.copy(color = c.text),
                    cursorBrush = SolidColor(c.text),
                    maxLines = 6,
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
                    interactionSource = interaction,
                    decorationBox = { inner ->
                        if (draft.isEmpty()) Text(if (agents.size == 1) "Message ${agents[0].name}" else "Message the crew", style = OrbitType.body, color = c.textTertiary)
                        inner()
                    },
                )
                IconTap(OrbitIcon.Mic, "Talk", onVoice, tint = c.textSecondary)
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
}

/** Something to say with one tap: sent straight away, or put in the box (an @mention, to finish). */
internal data class Suggestion(val label: String, val text: String, val send: Boolean)

/** A summary and a next step, and the room member who hasn't spoken lately, to bring them in. */
internal fun suggestionsFor(agents: List<Agent>, messages: List<Message>): List<Suggestion> = buildList {
    add(Suggestion("Summarize so far", "Summarize where we are so far.", send = true))
    add(Suggestion("What's next?", "What should we do next?", send = true))
    if (agents.size > 1) {
        val recent = messages.takeLast(6).mapNotNull { it.author.agentId }.toSet()
        agents.firstOrNull { it.id !in recent }?.let { quiet ->
            val handle = "@${quiet.name.replace(" ", "")}"
            add(Suggestion(handle, "$handle ", send = false))
        }
    }
}

private val ClaudeModel = Regex("^claude-([a-z]+)-(\\d+)(?:-(\\d+))?(?:-\\d{8})?$")

/** A model by its everyday name: "claude-opus-5-5" reads as "Opus 5.5", "gpt-6.1-terra" as "GPT-6.1 terra". */
internal fun modelTag(model: String): String {
    val id = model.substringAfterLast('/').removeSuffix(":latest")
    ClaudeModel.find(id)?.let { m ->
        val (family, major, minor) = m.destructured
        return "${family.replaceFirstChar { it.uppercase() }} $major${if (minor.isNotEmpty()) ".$minor" else ""}"
    }
    if (id.startsWith("gpt-")) return "GPT-" + id.removePrefix("gpt-").replaceFirst('-', ' ')
    return id
}

/** Three dots in the agent's color while it thinks. They breathe, unless system animations are off. */
@Composable
private fun ThinkingDots(avatar: AvatarSpec, modifier: Modifier = Modifier) {
    val reduced = LocalReducedMotion.current
    val ink = avatar.textColor()
    val phase = if (reduced) {
        0f
    } else {
        val transition = rememberInfiniteTransition(label = "dots")
        val value by transition.animateFloat(0f, 3f, infiniteRepeatable(tween(1200, easing = LinearEasing)), label = "phase")
        value
    }
    Row(
        modifier
            .semantics { contentDescription = "Thinking" }
            .clip(RoundedCornerShape(16.dp))
            .background(avatar.wash())
            .padding(horizontal = 14.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        repeat(3) { i ->
            // Each dot is brightest as the wave passes it; at rest they step down from full to faint.
            val alpha = if (reduced) 1f - i * 0.3f else (1f - (((phase - i) % 3f + 3f) % 3f) / 3f).coerceIn(0.3f, 1f)
            Box(Modifier.size(7.dp).clip(CircleShape).background(ink.copy(alpha = alpha)))
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


/** Whether [message] carries on a run from the same agent: close in time, nothing else in between. */
internal fun continuesRun(before: Message?, message: Message): Boolean =
    before != null && !before.fromUser && !message.fromUser &&
        before.author.agentId != null && before.author.agentId == message.author.agentId &&
        message.proactive == null && before.crew == null && before.created.isEmpty() &&
        message.createdAt - before.createdAt in 0..RUN_GAP_MS

private const val RUN_GAP_MS = 10 * 60_000L

private fun dayOf(at: Long): java.util.Calendar = java.util.Calendar.getInstance().apply { timeInMillis = at }

internal fun sameDay(a: Long, b: Long): Boolean {
    val x = dayOf(a)
    val y = dayOf(b)
    return x.get(java.util.Calendar.YEAR) == y.get(java.util.Calendar.YEAR) && x.get(java.util.Calendar.DAY_OF_YEAR) == y.get(java.util.Calendar.DAY_OF_YEAR)
}

/** "Today", "Yesterday", "Tue, Nov 18", or with the year once it's not this year. */
internal fun dayLabel(at: Long, now: Long = System.currentTimeMillis()): String = when {
    sameDay(at, now) -> "Today"
    sameDay(at, now - 86_400_000L) -> "Yesterday"
    dayOf(at).get(java.util.Calendar.YEAR) == dayOf(now).get(java.util.Calendar.YEAR) ->
        java.text.SimpleDateFormat("EEE, MMM d", java.util.Locale.getDefault()).format(java.util.Date(at))
    else -> java.text.SimpleDateFormat("MMM d, yyyy", java.util.Locale.getDefault()).format(java.util.Date(at))
}

/** "9:12 am", or "21:12" where the phone uses a 24-hour clock. */
private fun clockTime(at: Long): String =
    java.text.DateFormat.getTimeInstance(java.text.DateFormat.SHORT).format(java.util.Date(at)).replace("AM", "am").replace("PM", "pm")

/** Where a new day starts in the conversation: its name between two hairlines. */
@Composable
private fun DayDivider(at: Long, now: Long, modifier: Modifier = Modifier) {
    val c = Orbit.colors
    Row(modifier.fillMaxWidth().semantics { heading() }, verticalAlignment = Alignment.CenterVertically) {
        Hairline(Modifier.weight(1f))
        Text(dayLabel(at, now), Modifier.padding(horizontal = 12.dp), style = OrbitType.label, color = c.textTertiary)
        Hairline(Modifier.weight(1f))
    }
}

/**
 * Who's in a room: each member with its model and what it's doing (the one replying is ringed), a way to
 * message one directly, and the rest of the crew to add.
 */
@Composable
internal fun MembersSheet(
    room: Room,
    agents: List<Agent>,
    everyone: List<Agent>,
    state: RoomUiState,
    now: Long,
    onMessage: (Agent) -> Unit,
    onAdd: (agentId: String) -> Unit,
) {
    val c = Orbit.colors
    Row(Modifier.fillMaxWidth().padding(start = OrbitDimens.gutter, end = OrbitDimens.gutter, top = 4.dp, bottom = 6.dp), verticalAlignment = Alignment.Bottom) {
        Text("In this room", Modifier.weight(1f), style = OrbitType.titleM, color = c.text)
        Text(
            when (room.mode) {
                Room.MODE_AUTO -> "Best fit"
                Room.MODE_LEAD -> "Led by ${agents.firstOrNull { it.id == room.leadId }?.name ?: agents.firstOrNull()?.name.orEmpty()}"
                else -> "Round table"
            },
            style = OrbitType.bodyS,
            color = c.textTertiary,
        )
    }
    for (agent in agents) {
        val replying = state.run.active && state.run.agentId == agent.id
        val lastSpoke = state.messages.lastOrNull { it.author.agentId == agent.id && it.createdAt > 0 }?.createdAt
        MemberRow(
            agent,
            ring = replying,
            status = when {
                replying -> "Replying now…"
                lastSpoke != null -> listOf(agent.role, "last spoke ${relativeTime(lastSpoke, now).let { if (it == "now") "just now" else if (it.last().isDigit() || it.endsWith("m") || it.endsWith("h")) "$it ago" else it }}").filter { it.isNotBlank() }.joinToString(" · ")
                else -> agent.role
            },
            statusColor = if (replying) agent.avatar.textColor() else c.textTertiary,
        ) { Pill("Message", onClick = { onMessage(agent) }) }
    }
    val others = everyone.filter { it.id !in room.agentIds }
    if (others.isNotEmpty()) {
        Hairline(Modifier.padding(horizontal = OrbitDimens.gutter, vertical = 8.dp))
        Text(
            "ADD FROM YOUR CREW",
            Modifier.padding(start = OrbitDimens.gutter, top = 8.dp, bottom = 4.dp),
            style = OrbitType.overline,
            color = c.textTertiary,
        )
        for (agent in others) {
            MemberRow(agent, ring = false, status = agent.role, statusColor = c.textTertiary) { Pill("Add", onClick = { onAdd(agent.id) }, selected = true) }
        }
    }
}

@Composable
private fun MemberRow(agent: Agent, ring: Boolean, status: String, statusColor: Color, action: @Composable () -> Unit) {
    val c = Orbit.colors
    Row(Modifier.fillMaxWidth().padding(horizontal = OrbitDimens.gutter, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        AvatarDisc(agent.avatar, size = 48.dp, ring = ring)
        Column(Modifier.weight(1f).padding(start = 14.dp, end = 10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(agent.name, style = OrbitType.titleS, color = c.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (agent.model.isNotBlank()) {
                    Text(
                        modelTag(agent.model),
                        Modifier.padding(start = 8.dp).border(1.dp, c.hairline, RoundedCornerShape(6.dp)).padding(horizontal = 5.dp),
                        style = OrbitType.mono,
                        color = c.textTertiary,
                        maxLines = 1,
                    )
                }
            }
            if (status.isNotBlank()) Text(status, Modifier.padding(top = 2.dp), style = OrbitType.bodyS, color = statusColor, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        action()
    }
}
