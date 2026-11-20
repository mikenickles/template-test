package dev.orbit.app.ui.screens

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.orbit.app.data.Agent
import dev.orbit.app.data.AvatarSpec
import dev.orbit.app.data.Message
import dev.orbit.app.data.Room
import dev.orbit.app.ui.RoomUiState
import dev.orbit.app.ui.components.AgentAvatar
import dev.orbit.app.ui.components.AvatarStack
import dev.orbit.app.ui.components.CrewTile
import dev.orbit.app.ui.components.MarkdownText
import dev.orbit.app.ui.components.StatusDot
import dev.orbit.app.ui.components.textColor
import dev.orbit.app.ui.theme.Orbit
import dev.orbit.app.ui.theme.OrbitDimens
import dev.orbit.app.ui.theme.OrbitType
import kotlin.math.PI
import kotlin.math.sin

/** Stand-in for an agent that has since been deleted. */
private val FormerAgentAvatar = AvatarSpec(color = 9, eyes = 7)

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

    Scaffold(
        containerColor = c.bg,
        topBar = { RoomBar(room, agents, state, onBack, onEdit, onClear) },
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
        Column(Modifier.fillMaxSize().padding(padding)) {
            if (state.loaded && !state.connected) {
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
                    reverseLayout = true,
                    contentPadding = PaddingValues(horizontal = OrbitDimens.gutter, vertical = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(26.dp),
                ) {
                    items(state.messages.asReversed(), key = { it.id }) { message ->
                        Box(Modifier.animateItem()) {
                            if (message.fromUser) {
                                UserMessage(message, mentionColors)
                            } else {
                                AgentMessage(message, byId[message.author.agentId], mentionColors)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun RoomBar(room: Room, agents: List<Agent>, state: RoomUiState, onBack: () -> Unit, onEdit: () -> Unit, onClear: () -> Unit) {
    val c = Orbit.colors
    var menu by remember { mutableStateOf(false) }
    val speaker = agents.firstOrNull { it.id == state.run.agentId }
    Column(Modifier.fillMaxWidth().statusBarsPadding()) {
        Row(Modifier.height(64.dp).padding(start = 6.dp, end = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", Modifier.size(22.dp), tint = c.text)
            }
            CrewTile(agents.map { it.avatar }, size = 40.dp)
            Column(Modifier.weight(1f).padding(start = 12.dp)) {
                Text(room.name, style = OrbitType.titleM, color = c.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Row(Modifier.padding(top = 1.dp), verticalAlignment = Alignment.CenterVertically) {
                    if (state.run.active) StatusDot(c.live, Modifier.padding(end = 6.dp), pulsing = true, size = 6.dp)
                    Text(
                        when {
                            speaker != null -> "${speaker.name} is replying"
                            state.run.active -> "Working"
                            room.mode == Room.MODE_LEAD ->
                                "Led by ${agents.firstOrNull { it.id == room.leadId }?.name ?: "the first agent"} · ${agents.size} agents"
                            else -> "Round table · ${agents.size} ${if (agents.size == 1) "agent" else "agents"}"
                        },
                        style = OrbitType.bodyS,
                        color = if (state.run.active) c.live else c.textSecondary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            Box {
                IconButton(onClick = { menu = true }) {
                    Icon(Icons.Default.MoreVert, contentDescription = "Room options", Modifier.size(22.dp), tint = c.textSecondary)
                }
                DropdownMenu(expanded = menu, onDismissRequest = { menu = false }, shape = RoundedCornerShape(OrbitDimens.radiusM)) {
                    DropdownMenuItem(text = { Text("Edit room", style = OrbitType.bodyM) }, onClick = { menu = false; onEdit() })
                    DropdownMenuItem(text = { Text("Clear chat", style = OrbitType.bodyM) }, onClick = { menu = false; onClear() })
                }
            }
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(c.hairline))
    }
}

@Composable
private fun EmptyRoom(room: Room, agents: List<Agent>, modifier: Modifier) {
    val c = Orbit.colors
    Column(
        modifier.fillMaxWidth().padding(horizontal = 40.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        AvatarStack(agents.map { it.avatar }, size = 56.dp, max = 5, overlap = -0.16f)
        Spacer(Modifier.height(24.dp))
        Text("The crew is ready", style = OrbitType.titleL, color = c.text)
        Text(
            if (room.mode == Room.MODE_LEAD) {
                "Give them a task. The lead answers first and brings in the others."
            } else {
                "Give them a task and everyone weighs in. Mention an agent to ask just them."
            },
            Modifier.padding(top = 8.dp),
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
                .padding(horizontal = 16.dp, vertical = 10.dp),
        ) {
            MarkdownText(message.text, mentions = mentionColors)
        }
    }
}

@Composable
private fun AgentMessage(message: Message, agent: Agent?, mentionColors: Map<String, Color>) {
    val c = Orbit.colors
    val avatar = agent?.avatar ?: FormerAgentAvatar
    val streaming = message.status == Message.STATUS_STREAMING
    Row(Modifier.fillMaxWidth()) {
        AgentAvatar(avatar, Modifier.padding(top = 1.dp), size = 34.dp, thinking = streaming)
        Column(Modifier.weight(1f).padding(start = 12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    agent?.name ?: message.author.name,
                    style = OrbitType.titleS.copy(fontWeight = FontWeight.SemiBold),
                    color = avatar.textColor(),
                )
                val model = message.author.model
                if (!model.isNullOrBlank()) {
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
            if (message.text.isNotEmpty()) MarkdownText(message.text, mentions = mentionColors)
            when {
                streaming && message.text.isEmpty() -> TypingDots(avatar.textColor())
                message.status == Message.STATUS_ERROR -> Row(
                    Modifier
                        .padding(top = 2.dp)
                        .clip(RoundedCornerShape(OrbitDimens.radiusS))
                        .background(c.dangerSurface)
                        .padding(horizontal = 12.dp, vertical = 10.dp),
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
                    style = OrbitType.mono,
                    color = c.textTertiary,
                )
            }
        }
    }
}

@Composable
private fun TypingDots(color: Color) {
    val transition = rememberInfiniteTransition(label = "typing")
    val phase by transition.animateFloat(
        0f, 1f, infiniteRepeatable(tween(1200, easing = LinearEasing), RepeatMode.Restart), label = "phase",
    )
    Row(Modifier.padding(top = 8.dp, bottom = 4.dp), horizontalArrangement = Arrangement.spacedBy(5.dp)) {
        repeat(3) { index ->
            val wave = sin((phase - index * 0.18f) * 2 * PI).toFloat()
            Box(Modifier.size(7.dp).alpha(0.35f + 0.65f * ((wave + 1) / 2)).clip(CircleShape).background(color))
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
    val shape = RoundedCornerShape(OrbitDimens.radiusXL)
    Box(
        Modifier
            .fillMaxWidth()
            .background(c.bg)
            .windowInsetsPadding(WindowInsets.ime.union(WindowInsets.navigationBars))
            .padding(start = 12.dp, end = 12.dp, top = 4.dp, bottom = 12.dp),
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .clip(shape)
                .background(c.surface)
                .border(1.dp, c.hairline, shape)
                .padding(start = 18.dp, end = 10.dp, top = 16.dp, bottom = 10.dp),
        ) {
            BasicTextField(
                value = draft,
                onValueChange = onDraft,
                modifier = Modifier.fillMaxWidth().padding(end = 8.dp),
                textStyle = OrbitType.body.copy(color = c.text),
                cursorBrush = SolidColor(c.text),
                maxLines = 6,
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
                decorationBox = { inner ->
                    if (draft.isEmpty()) Text("Message the crew", style = OrbitType.body, color = c.textTertiary)
                    inner()
                },
            )
            Spacer(Modifier.height(14.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                // Tap a face to mention that agent.
                if (agents.size > 1) {
                    Text("@", Modifier.padding(end = 8.dp), style = OrbitType.mono.copy(fontSize = 14.sp), color = c.textTertiary)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        for (agent in agents.take(6)) {
                            AgentAvatar(
                                agent.avatar,
                                Modifier.clickable(remember { MutableInteractionSource() }, indication = null) {
                                    val mention = "@${agent.name.replace(" ", "")} "
                                    onDraft(if (draft.isEmpty() || draft.endsWith(" ")) draft + mention else "$draft $mention")
                                },
                                size = 26.dp,
                            )
                        }
                    }
                }
                Spacer(Modifier.weight(1f))
                val canSend = draft.isNotBlank()
                val showStop = running && !canSend
                val enabled = canSend || showStop
                Surface(
                    onClick = { if (showStop) onStop() else onSend() },
                    enabled = enabled,
                    modifier = Modifier.size(38.dp),
                    shape = CircleShape,
                    color = if (enabled) c.primary else c.surfaceHigh,
                    contentColor = if (enabled) c.onPrimary else c.textTertiary,
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        if (showStop) {
                            Box(Modifier.size(12.dp).clip(RoundedCornerShape(3.dp)).background(c.onPrimary))
                        } else {
                            // An up arrow: the back arrow, turned.
                            Icon(
                                Icons.AutoMirrored.Filled.ArrowBack,
                                contentDescription = "Send",
                                Modifier.size(20.dp).rotate(90f),
                            )
                        }
                    }
                }
            }
        }
    }
}
