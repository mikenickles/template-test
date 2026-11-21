package dev.orbit.app.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.Saver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.orbit.app.data.Agent
import dev.orbit.app.data.AvatarSpec
import dev.orbit.app.data.GoogleStatus
import dev.orbit.app.data.MemoryNote
import dev.orbit.app.data.OrbitJson
import dev.orbit.app.data.Provider
import dev.orbit.app.data.SharedFolder
import dev.orbit.app.ui.SharedKeys
import dev.orbit.app.ui.components.AgentAvatar
import dev.orbit.app.ui.components.BarAction
import dev.orbit.app.ui.components.Characters
import dev.orbit.app.ui.components.DangerRow
import dev.orbit.app.ui.components.FieldLabel
import dev.orbit.app.ui.components.Hairline
import dev.orbit.app.ui.components.IconPill
import dev.orbit.app.ui.components.IconTap
import dev.orbit.app.ui.components.OrbitCard
import dev.orbit.app.ui.components.OrbitField
import dev.orbit.app.ui.components.OrbitIcon
import dev.orbit.app.ui.components.OrbitSwitch
import dev.orbit.app.ui.components.Pill
import dev.orbit.app.ui.components.ScreenBar
import dev.orbit.app.ui.components.SectionTitle
import dev.orbit.app.ui.components.character
import dev.orbit.app.ui.components.lift
import dev.orbit.app.ui.components.randomAvatar
import dev.orbit.app.ui.components.surfaceBorder
import dev.orbit.app.ui.components.tap
import dev.orbit.app.ui.components.tint
import dev.orbit.app.ui.shared
import dev.orbit.app.ui.theme.Orbit
import dev.orbit.app.ui.theme.OrbitDimens
import dev.orbit.app.ui.theme.OrbitMotion
import dev.orbit.app.ui.theme.OrbitType
import dev.orbit.app.ui.theme.rememberHaptics
import kotlinx.coroutines.launch
import kotlinx.serialization.encodeToString

private val AvatarSaver = Saver<AvatarSpec, String>(
    save = { OrbitJson.encodeToString(it) },
    restore = { OrbitJson.decodeFromString<AvatarSpec>(it) },
)

/** The provider a brand-new agent starts on: a real one if the hub has a key, otherwise the demo. */
private fun defaultProvider(providers: List<Provider>): Provider? =
    providers.firstOrNull { it.configured && it.models.isNotEmpty() && it.id != "demo" }
        ?: providers.firstOrNull { it.id == "demo" }
        ?: providers.firstOrNull()

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun AgentEditorScreen(
    initial: Agent?,
    providers: List<Provider>,
    loadModels: suspend (providerId: String) -> List<String>,
    onSave: (Agent) -> Unit,
    onDelete: (() -> Unit)?,
    onBack: () -> Unit,
    onAddKey: (providerId: String) -> Unit = {},
    folders: List<SharedFolder> = emptyList(),
    onAddMemory: (text: String, onDone: (Boolean) -> Unit) -> Unit = { _, _ -> },
    onRemoveMemory: (MemoryNote) -> Unit = {},
    /** Whether the user's Google account is connected on the PC, and as whom. */
    google: GoogleStatus = GoogleStatus(),
) {
    val c = Orbit.colors
    val haptics = rememberHaptics()
    val start = remember(initial?.id) {
        initial ?: defaultProvider(providers).let { provider ->
            Agent(
                provider = provider?.id.orEmpty(), model = provider?.models?.firstOrNull().orEmpty(), avatar = randomAvatar(),
                // New agents remember what you ask them to.
                abilities = listOf(Agent.ABILITY_MEMORY),
            )
        }
    }
    var avatar by rememberSaveable(stateSaver = AvatarSaver) { mutableStateOf(start.avatar) }
    var name by rememberSaveable { mutableStateOf(start.name) }
    var role by rememberSaveable { mutableStateOf(start.role) }
    var instructions by rememberSaveable { mutableStateOf(start.instructions) }
    var providerId by rememberSaveable { mutableStateOf(start.provider) }
    var model by rememberSaveable { mutableStateOf(start.model) }
    var web by rememberSaveable { mutableStateOf(Agent.ABILITY_WEB in start.abilities) }
    var code by rememberSaveable { mutableStateOf(Agent.ABILITY_CODE in start.abilities) }
    var files by rememberSaveable { mutableStateOf(Agent.ABILITY_FILES in start.abilities) }
    var remembers by rememberSaveable { mutableStateOf(Agent.ABILITY_MEMORY in start.abilities) }
    var hires by rememberSaveable { mutableStateOf(Agent.ABILITY_CREW in start.abilities) }
    var usesGoogle by rememberSaveable { mutableStateOf(Agent.ABILITY_GOOGLE in start.abilities) }
    var proactive by rememberSaveable { mutableStateOf(start.proactive) }

    val provider = providers.firstOrNull { it.id == providerId }
    var models by remember { mutableStateOf(emptyList<String>()) }
    LaunchedEffect(providerId, providers) {
        models = provider?.models.orEmpty()
        if (providerId.isNotEmpty()) loadModels(providerId).takeIf { it.isNotEmpty() }?.let { models = it }
    }

    val canSave = name.isNotBlank() && providerId.isNotEmpty() && model.isNotBlank()
    fun save() = onSave(
        start.copy(
            name = name.trim(), role = role.trim(), instructions = instructions.trim(),
            provider = providerId, model = model.trim(), avatar = avatar,
            abilities = listOfNotNull(
                Agent.ABILITY_WEB.takeIf { web },
                Agent.ABILITY_CODE.takeIf { code },
                Agent.ABILITY_FILES.takeIf { files },
                Agent.ABILITY_MEMORY.takeIf { remembers },
                Agent.ABILITY_CREW.takeIf { hires },
                Agent.ABILITY_GOOGLE.takeIf { usesGoogle },
            ),
            proactive = proactive,
        ),
    )
    fun pick(next: AvatarSpec) {
        if (next != avatar) haptics.tick()
        avatar = next
    }

    val scroll = rememberScrollState()
    Scaffold(
        containerColor = c.bg,
        topBar = {
            ScreenBar(if (initial == null) "New agent" else "Edit agent", onBack, scrolled = scroll.value > 0) {
                BarAction(if (initial == null) "Create" else "Save", ::save, enabled = canSave)
            }
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).imePadding().verticalScroll(scroll).padding(bottom = 48.dp)) {
            IdentityCard(avatar, initial?.id, name, role, model, onShuffle = { avatar = randomAvatar() })

            Section("Look")
            Gutter {
                val chosen = avatar.character()
                FieldLabel("Character · ${chosen.name}")
                CharacterGrid(chosen.number) { pick(AvatarSpec(character = it)) }
            }

            Section("Identity")
            Gutter {
                FieldLabel("Name")
                OrbitField(name, { name = it.take(40) }, "Nova", keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words))
                Spacer(Modifier.height(20.dp))
                FieldLabel("Role")
                OrbitField(role, { role = it.take(80) }, "the planner")
            }

            Section("Model")
            Gutter {
                FieldLabel("Provider")
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    for (option in providers) {
                        Pill(
                            label = option.label,
                            selected = option.id == providerId,
                            dimmed = !option.configured,
                            onClick = {
                                if (option.id != providerId) {
                                    providerId = option.id
                                    model = option.models.firstOrNull().orEmpty()
                                }
                            },
                        )
                    }
                }
                AnimatedVisibility(provider != null && !provider.configured, enter = expandVertically() + fadeIn(), exit = shrinkVertically() + fadeOut()) {
                    Row(Modifier.padding(top = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            "${provider?.label} needs an API key before this agent can reply.",
                            Modifier.weight(1f).padding(end = 12.dp),
                            style = OrbitType.bodyS,
                            color = c.textSecondary,
                        )
                        if (provider?.takesKey == true) Pill("Add key", onClick = { onAddKey(provider.id) })
                    }
                }
                Spacer(Modifier.height(20.dp))
                FieldLabel("Model id")
                OrbitField(model, { model = it.take(120) }, "Model id", textStyle = OrbitType.monoL)
            }
            val suggestions = remember(models, model) {
                models.filter { it != model && it.contains(model.trim(), ignoreCase = true) }.ifEmpty { models.filter { it != model } }.take(24)
            }
            AnimatedVisibility(suggestions.isNotEmpty(), enter = expandVertically() + fadeIn(), exit = shrinkVertically() + fadeOut()) {
                LazyRow(
                    Modifier.padding(top = 10.dp),
                    contentPadding = PaddingValues(horizontal = OrbitDimens.gutter),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(suggestions, key = { it }) { id -> Pill(id, onClick = { model = id }, Modifier.animateItem(), textStyle = OrbitType.mono) }
                }
            }

            Section("Abilities")
            Gutter {
                // Abilities stay saved on any provider, and come back on when the agent is on Claude again.
                val supported = provider?.abilities == true
                AnimatedVisibility(provider != null && !supported, enter = expandVertically() + fadeIn(), exit = shrinkVertically() + fadeOut()) {
                    Text(
                        "Abilities work with Anthropic models for now. Switch this agent's provider to use them.",
                        Modifier.padding(bottom = 12.dp),
                        style = OrbitType.bodyS,
                        color = c.textSecondary,
                    )
                }
                OrbitCard(Modifier.fillMaxWidth()) {
                    Column {
                        AbilityRow(OrbitIcon.Globe, "Search the web", "Look things up and read pages, with sources.", web, supported) { web = it }
                        Hairline()
                        AbilityRow(OrbitIcon.Code, "Run code", "Calculate and work through data in a private sandbox.", code, supported) { code = it }
                        Hairline()
                        AbilityRow(
                            OrbitIcon.Folder,
                            "Read your files",
                            if (folders.isEmpty()) {
                                "Read only. Share folders from the Treehouse page on your PC first."
                            } else {
                                "Read only, from ${folders.joinToString(", ") { it.name }}."
                            },
                            files,
                            supported,
                        ) { files = it }
                        Hairline()
                        AbilityRow(
                            OrbitIcon.Memory,
                            "Remember things",
                            "Keeps notes when you ask it to remember something, for every room.",
                            remembers,
                            supported,
                        ) { remembers = it }
                        Hairline()
                        AbilityRow(
                            OrbitIcon.Hire,
                            "Build your crew",
                            "Hires new agents when you ask: writes their instructions, asks which model to use, picks a free look.",
                            hires,
                            supported,
                        ) { hires = it }
                        Hairline()
                        AbilityRow(
                            OrbitIcon.Mail,
                            "Use your Google account",
                            if (google.connected) {
                                "Gmail, Calendar and Drive for ${google.email.ifBlank { "your account" }}. Reads mail and saves drafts, never sends."
                            } else {
                                "Gmail, Calendar and Drive. Connect Google in Treehouse on your PC first, under Settings."
                            },
                            usesGoogle,
                            supported,
                        ) { usesGoogle = it }
                    }
                }
            }

            Section("Reaches out")
            Gutter {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    for ((level, label) in listOf(Agent.PROACTIVE_OFF to "Off", Agent.PROACTIVE_GENTLE to "Gentle", Agent.PROACTIVE_ACTIVE to "Active")) {
                        Pill(label, onClick = {
                            if (proactive != level) haptics.tick()
                            proactive = level
                        }, selected = proactive == level)
                    }
                }
                Text(
                    when (proactive) {
                        Agent.PROACTIVE_GENTLE ->
                            "About once a day, ${name.ifBlank { "this agent" }} looks over your chats and writes to you only when something is worth it: a deadline coming up, a plan for today."
                        Agent.PROACTIVE_ACTIVE ->
                            "A few times a day, ${name.ifBlank { "this agent" }} looks over your chats, and your calendar and email if it can, and writes when something needs you."
                        else -> "${name.ifBlank { "This agent" }} only replies when you write."
                    } + if (proactive != Agent.PROACTIVE_OFF && provider?.abilities == true) {
                        " It can also follow up later and keep an eye on things for you."
                    } else {
                        ""
                    },
                    Modifier.padding(top = 12.dp),
                    style = OrbitType.bodyS,
                    color = c.textSecondary,
                )
            }

            // Notes belong to a saved agent, so a new one starts without them.
            if (initial != null) {
                Section("Memory")
                Gutter { MemoryNotes(initial.name, initial.memory, onAddMemory, onRemoveMemory) }
            }

            Section("Instructions")
            Gutter {
                OrbitField(
                    instructions, { instructions = it }, "How should this agent think, behave, and help the crew?",
                    singleLine = false, minLines = 5,
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
                )
                if (onDelete != null) {
                    // Kept well away from Save, at the very end of the form.
                    Spacer(Modifier.height(40.dp))
                    DangerRow("Delete agent", onDelete)
                }
            }
        }
    }
}

/**
 * What an agent remembers, and a field to add more. Notes go into every room the agent is in; any
 * agent can have notes added here, and Claude agents with "Remember things" add their own.
 */
@Composable
private fun MemoryNotes(
    name: String,
    notes: List<MemoryNote>,
    onAdd: (text: String, onDone: (Boolean) -> Unit) -> Unit,
    onRemove: (MemoryNote) -> Unit,
) {
    val c = Orbit.colors
    val haptics = rememberHaptics()
    var draft by rememberSaveable { mutableStateOf("") }
    var adding by remember { mutableStateOf(false) }
    fun add() {
        if (draft.isBlank() || adding) return
        adding = true
        onAdd(draft.trim()) { added ->
            adding = false
            if (added) {
                haptics.tick()
                draft = ""
            }
        }
    }
    if (notes.isNotEmpty()) {
        OrbitCard(Modifier.fillMaxWidth()) {
            Column {
                notes.forEachIndexed { index, note ->
                    if (index > 0) Hairline()
                    Row(Modifier.fillMaxWidth().padding(start = OrbitDimens.rowPad, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f).padding(vertical = 12.dp)) {
                            Text(note.text, style = OrbitType.bodyM, color = c.text)
                            Text(
                                if (note.source == "agent") "Saved by $name" else "Added by you",
                                Modifier.padding(top = 2.dp),
                                style = OrbitType.caption,
                                color = c.textTertiary,
                            )
                        }
                        IconTap(OrbitIcon.Close, "Forget \"${note.text}\"", { onRemove(note) }, tint = c.textTertiary)
                    }
                }
            }
        }
        Spacer(Modifier.height(12.dp))
    } else {
        Text(
            "Nothing yet. Add what $name should keep in mind everywhere, like how you like answers or what you're working on.",
            Modifier.padding(bottom = 12.dp),
            style = OrbitType.bodyS,
            color = c.textSecondary,
        )
    }
    OrbitField(
        draft,
        { draft = it.take(300) },
        "Add something to remember",
        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
        trailing = {
            Text(
                "Add",
                Modifier.tap(CircleShape, 0.92f, ::add).padding(horizontal = 14.dp, vertical = 12.dp),
                style = OrbitType.label,
                color = if (draft.isBlank()) c.textTertiary else c.text,
            )
        },
    )
}

/** One ability with its switch. The whole row toggles it. */
@Composable
private fun AbilityRow(icon: OrbitIcon, title: String, detail: String, checked: Boolean, enabled: Boolean, onChange: (Boolean) -> Unit) {
    val c = Orbit.colors
    val haptics = rememberHaptics()
    Row(
        Modifier
            .fillMaxWidth()
            .toggleable(checked, enabled = enabled, role = Role.Switch) {
                haptics.tick()
                onChange(it)
            }
            .heightIn(min = 68.dp)
            .padding(start = OrbitDimens.rowPad, end = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        OrbitIcon(icon, size = 20.dp, tint = if (enabled) c.text else c.textTertiary)
        Column(Modifier.weight(1f).padding(start = 14.dp, end = 12.dp, top = 12.dp, bottom = 12.dp)) {
            Text(title, style = OrbitType.titleS, color = if (enabled) c.text else c.textTertiary)
            Text(detail, Modifier.padding(top = 2.dp), style = OrbitType.bodyS, color = c.textSecondary)
        }
        OrbitSwitch(checked, enabled = enabled)
    }
}

@Composable
private fun Section(title: String) {
    SectionTitle(title, Modifier.padding(start = OrbitDimens.gutter, end = OrbitDimens.gutter, top = OrbitDimens.section + 4.dp, bottom = 8.dp))
}

@Composable
private fun Gutter(content: @Composable () -> Unit) {
    Column(Modifier.padding(horizontal = OrbitDimens.gutter)) { content() }
}

/**
 * The agent as others will see it, updating live as it's edited: a new character pops in and the
 * wash takes its color. Shuffle rolls the dice and the character hops.
 */
@Composable
private fun IdentityCard(avatar: AvatarSpec, agentId: String?, name: String, role: String, model: String, onShuffle: () -> Unit) {
    val c = Orbit.colors
    val haptics = rememberHaptics()
    val scope = rememberCoroutineScope()
    val shape = RoundedCornerShape(OrbitDimens.radiusXL)
    val wash by animateColorAsState(avatar.tint().copy(alpha = if (c.isDark) 0.22f else 0.26f), OrbitMotion.gentle(), label = "wash")
    val dice = remember { Animatable(0f) }
    val hop = remember { Animatable(1f) }
    Box(
        Modifier
            .padding(start = OrbitDimens.gutter, end = OrbitDimens.gutter, top = 4.dp)
            .fillMaxWidth()
            .lift(shape)
            .clip(shape)
            .background(c.surface)
            .background(Brush.verticalGradient(listOf(wash, Color.Transparent)))
            .border(surfaceBorder(), shape),
    ) {
        Column(Modifier.fillMaxWidth().padding(top = 32.dp, bottom = 24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            AgentAvatar(
                avatar,
                Modifier
                    .then(if (agentId != null) Modifier.shared(SharedKeys.agentAvatar(agentId)) else Modifier)
                    .graphicsLayer {
                        scaleX = hop.value
                        scaleY = 2f - hop.value
                    },
                size = 104.dp,
                alive = true,
            )
            Text(
                name.ifBlank { "New agent" },
                Modifier.padding(top = 18.dp, start = 24.dp, end = 24.dp),
                style = OrbitType.titleL,
                color = if (name.isBlank()) c.textTertiary else c.text,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (role.isNotBlank()) {
                Text(
                    role.trim(),
                    Modifier.padding(top = 2.dp, start = 24.dp, end = 24.dp),
                    style = OrbitType.bodyM,
                    color = c.textSecondary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            if (model.isNotBlank()) {
                Text(
                    model.trim(),
                    Modifier.padding(top = 10.dp, start = 24.dp, end = 24.dp),
                    style = OrbitType.mono,
                    color = c.textTertiary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        IconPill(
            OrbitIcon.Dice,
            "Shuffle avatar",
            onClick = {
                haptics.tick()
                onShuffle()
                scope.launch { dice.animateTo(dice.value + 360f, OrbitMotion.bouncy()) }
                scope.launch {
                    // A squash and stretch: it settles wide and low, then springs back.
                    hop.animateTo(1.12f, tween(80, easing = OrbitMotion.Decelerate))
                    hop.animateTo(1f, OrbitMotion.bouncy())
                }
            },
            modifier = Modifier.align(Alignment.TopEnd).padding(12.dp),
            iconModifier = Modifier.graphicsLayer { rotationZ = dice.value },
        )
    }
}

/** Every character, five to a row, all visible at once. The chosen one is washed in its color. */
@Composable
private fun CharacterGrid(selected: Int, onPick: (Int) -> Unit) {
    val c = Orbit.colors
    val shape = RoundedCornerShape(OrbitDimens.radiusM)
    Column(Modifier.selectableGroup(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        for (row in Characters.chunked(5)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                for (character in row) {
                    val isSelected = character.number == selected
                    val edge by animateColorAsState(if (isSelected) c.text else c.hairline, OrbitMotion.snappy(), label = "edge")
                    val fill by animateColorAsState(
                        if (isSelected) character.fill.copy(alpha = if (c.isDark) 0.24f else 0.3f) else c.surface,
                        OrbitMotion.snappy(),
                        label = "fill",
                    )
                    Box(
                        Modifier
                            .weight(1f)
                            .aspectRatio(1f)
                            .semantics {
                                contentDescription = character.name
                                this.selected = isSelected
                                role = Role.RadioButton
                            }
                            .tap(shape, 0.9f) { onPick(character.number) }
                            .background(fill)
                            .border(if (isSelected) 1.5.dp else 1.dp, edge, shape),
                        contentAlignment = Alignment.Center,
                    ) {
                        AgentAvatar(AvatarSpec(character.number), Modifier.fillMaxSize(0.84f))
                    }
                }
            }
        }
    }
}
