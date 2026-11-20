package dev.orbit.app.ui.screens

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
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
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.orbit.app.data.Agent
import dev.orbit.app.data.AvatarSpec
import dev.orbit.app.data.Message
import dev.orbit.app.data.Room
import dev.orbit.app.ui.RoomUiState
import dev.orbit.app.ui.components.AgentAvatar
import dev.orbit.app.ui.components.AvatarStack
import dev.orbit.app.ui.components.MarkdownText
import dev.orbit.app.ui.components.OrbitField
import dev.orbit.app.ui.components.highlight
import dev.orbit.app.ui.components.tint
import kotlin.math.PI
import kotlin.math.sin

private val FormerAgentAvatar = AvatarSpec(color = 9, eyes = 6, mouth = 3)

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
    var draft by rememberSaveable { mutableStateOf("") }
    val byId = remember(everyone) { everyone.associateBy { it.id } }

    Scaffold(
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
                Text(
                    "Reconnecting to your hub…",
                    Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surfaceContainer).padding(vertical = 6.dp),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                )
            }
            if (state.loaded && state.messages.isEmpty()) {
                EmptyRoom(room, agents, Modifier.weight(1f))
            } else {
                // Newest at the bottom, and the list stays pinned there while replies stream in.
                LazyColumn(
                    Modifier.weight(1f).fillMaxWidth(),
                    reverseLayout = true,
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
                    verticalArrangement = Arrangement.spacedBy(18.dp),
                ) {
                    items(state.messages.asReversed(), key = { it.id }) { message ->
                        if (message.fromUser) UserMessage(message) else AgentMessage(message, byId[message.author.agentId])
                    }
                }
            }
        }
    }
}

@Composable
private fun RoomBar(room: Room, agents: List<Agent>, state: RoomUiState, onBack: () -> Unit, onEdit: () -> Unit, onClear: () -> Unit) {
    var menu by remember { mutableStateOf(false) }
    val speaker = agents.firstOrNull { it.id == state.run.agentId }
    Row(
        Modifier.fillMaxWidth().statusBarsPadding().heightIn(min = 64.dp).padding(horizontal = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back") }
        Column(Modifier.weight(1f).padding(horizontal = 4.dp)) {
            Text(room.name, style = MaterialTheme.typography.titleLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                when {
                    speaker != null -> "${speaker.name} is replying…"
                    state.run.active -> "Working…"
                    room.mode == Room.MODE_LEAD ->
                        "Led by ${agents.firstOrNull { it.id == room.leadId }?.name ?: "the first agent"} · ${agents.size} agents"
                    else -> "Round table · ${agents.size} ${if (agents.size == 1) "agent" else "agents"}"
                },
                style = MaterialTheme.typography.labelMedium,
                color = if (state.run.active) MaterialTheme.colorScheme.tertiary else MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        AvatarStack(agents.map { it.avatar }, size = 30.dp, max = 3)
        Box {
            IconButton(onClick = { menu = true }) { Icon(Icons.Default.MoreVert, contentDescription = "Room options") }
            DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                DropdownMenuItem(text = { Text("Edit room") }, onClick = { menu = false; onEdit() })
                DropdownMenuItem(text = { Text("Clear chat") }, onClick = { menu = false; onClear() })
            }
        }
    }
}

@Composable
private fun EmptyRoom(room: Room, agents: List<Agent>, modifier: Modifier) {
    Column(
        modifier.fillMaxWidth().padding(32.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        AvatarStack(agents.map { it.avatar }, size = 64.dp, max = 5)
        Spacer(Modifier.height(20.dp))
        Text("The crew is ready", style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(6.dp))
        Text(
            if (room.mode == Room.MODE_LEAD) {
                "Give them a task. The lead answers first and brings in the others."
            } else {
                "Give them a task and everyone weighs in. Use @name to ask one agent."
            },
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun UserMessage(message: Message) {
    Box(Modifier.fillMaxWidth().padding(start = 48.dp), contentAlignment = Alignment.CenterEnd) {
        Surface(
            shape = RoundedCornerShape(topStart = 22.dp, topEnd = 22.dp, bottomStart = 22.dp, bottomEnd = 6.dp),
            color = MaterialTheme.colorScheme.primary,
            contentColor = MaterialTheme.colorScheme.onPrimary,
        ) {
            Text(message.text, Modifier.padding(horizontal = 16.dp, vertical = 10.dp), style = MaterialTheme.typography.bodyLarge)
        }
    }
}

/** An agent's name color that stays readable on the current background. */
@Composable
private fun AvatarSpec.nameColor(): Color =
    if (MaterialTheme.colorScheme.background.luminance() < 0.5f) highlight() else lerp(tint(), Color.Black, 0.38f)

@Composable
private fun AgentMessage(message: Message, agent: Agent?) {
    val avatar = agent?.avatar ?: FormerAgentAvatar
    val streaming = message.status == Message.STATUS_STREAMING
    Row(Modifier.fillMaxWidth()) {
        AgentAvatar(avatar, size = 38.dp, thinking = streaming)
        Column(Modifier.weight(1f).padding(start = 10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    agent?.name ?: message.author.name,
                    style = MaterialTheme.typography.titleSmall,
                    color = avatar.nameColor(),
                )
                val model = message.author.model
                if (!model.isNullOrBlank()) {
                    Text(
                        model,
                        Modifier.padding(start = 8.dp),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            Spacer(Modifier.height(3.dp))
            if (message.text.isNotEmpty()) MarkdownText(message.text)
            when {
                streaming && message.text.isEmpty() -> TypingDots(avatar.nameColor())
                message.status == Message.STATUS_ERROR -> Surface(
                    Modifier.padding(top = 2.dp),
                    shape = MaterialTheme.shapes.small,
                    color = MaterialTheme.colorScheme.errorContainer,
                    contentColor = MaterialTheme.colorScheme.onErrorContainer,
                ) {
                    Text(
                        message.error ?: "This agent couldn't reply.",
                        Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
                message.status == Message.STATUS_STOPPED -> Text(
                    "Stopped",
                    Modifier.padding(top = 4.dp),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
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
            Box(Modifier.size(8.dp).alpha(0.45f + 0.55f * ((wave + 1) / 2)).clip(CircleShape).background(color))
        }
    }
}

@Composable
private fun Composer(
    draft: String,
    onDraft: (String) -> Unit,
    agents: List<Agent>,
    running: Boolean,
    onSend: () -> Unit,
    onStop: () -> Unit,
) {
    Column(
        Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.background)
            .windowInsetsPadding(WindowInsets.ime.union(WindowInsets.navigationBars))
            .padding(top = 6.dp, bottom = 10.dp),
    ) {
        if (agents.size > 1) {
            LazyRow(
                contentPadding = PaddingValues(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(agents, key = { it.id }) { agent ->
                    Surface(
                        onClick = {
                            val mention = "@${agent.name.replace(" ", "")} "
                            onDraft(if (draft.isEmpty() || draft.endsWith(" ")) draft + mention else "$draft $mention")
                        },
                        shape = CircleShape,
                        color = MaterialTheme.colorScheme.surfaceContainer,
                    ) {
                        Row(Modifier.padding(start = 5.dp, end = 12.dp, top = 5.dp, bottom = 5.dp), verticalAlignment = Alignment.CenterVertically) {
                            AgentAvatar(agent.avatar, size = 24.dp)
                            Text("@${agent.name}", Modifier.padding(start = 6.dp), style = MaterialTheme.typography.labelMedium)
                        }
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
        }
        Row(Modifier.padding(horizontal = 12.dp), verticalAlignment = Alignment.Bottom) {
            OrbitField(
                value = draft,
                onValueChange = onDraft,
                placeholder = "Message the crew",
                modifier = Modifier.weight(1f).widthIn(min = 0.dp),
                singleLine = false,
                maxLines = 6,
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
            )
            Spacer(Modifier.size(8.dp))
            val canSend = draft.isNotBlank()
            val showStop = running && !canSend
            Surface(
                onClick = { if (showStop) onStop() else onSend() },
                enabled = canSend || showStop,
                modifier = Modifier.padding(bottom = 4.dp).size(48.dp),
                shape = CircleShape,
                color = if (canSend || showStop) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceContainerHigh,
                contentColor = if (canSend || showStop) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
            ) {
                Box(contentAlignment = Alignment.Center) {
                    if (showStop) {
                        Box(
                            Modifier
                                .size(16.dp)
                                .clip(RoundedCornerShape(4.dp))
                                .background(MaterialTheme.colorScheme.onPrimary),
                        )
                    } else {
                        Icon(Icons.AutoMirrored.Filled.Send, contentDescription = "Send", Modifier.size(20.dp))
                    }
                }
            }
        }
    }
}
