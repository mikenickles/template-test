package dev.orbit.app.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
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
import androidx.compose.ui.layout.layout
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.orbit.app.data.Agent
import dev.orbit.app.data.AvatarSpec
import dev.orbit.app.data.OrbitJson
import dev.orbit.app.data.Provider
import dev.orbit.app.data.SharedFolder
import dev.orbit.app.ui.SharedKeys
import dev.orbit.app.ui.components.AgentAvatar
import dev.orbit.app.ui.components.AvatarPalette
import dev.orbit.app.ui.components.BarAction
import dev.orbit.app.ui.components.DangerRow
import dev.orbit.app.ui.components.EYES_COUNT
import dev.orbit.app.ui.components.FieldLabel
import dev.orbit.app.ui.components.Hairline
import dev.orbit.app.ui.components.IconPill
import dev.orbit.app.ui.components.OrbitCard
import dev.orbit.app.ui.components.OrbitField
import dev.orbit.app.ui.components.OrbitIcon
import dev.orbit.app.ui.components.OrbitSwitch
import dev.orbit.app.ui.components.Pill
import dev.orbit.app.ui.components.SHAPE_COUNT
import dev.orbit.app.ui.components.ScreenBar
import dev.orbit.app.ui.components.SectionTitle
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
) {
    val c = Orbit.colors
    val haptics = rememberHaptics()
    val start = remember(initial?.id) {
        initial ?: defaultProvider(providers).let { provider ->
            Agent(provider = provider?.id.orEmpty(), model = provider?.models?.firstOrNull().orEmpty(), avatar = randomAvatar())
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
            ),
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
                FieldLabel("Color")
                // All ten fit the width, so none hides off-screen. The row runs 5dp past the gutter on
                // each side (the selection ring's margin) so the first dot itself sits on the gutter.
                Row(
                    Modifier.layout { measurable, constraints ->
                        val width = constraints.maxWidth + 11.dp.roundToPx()
                        val row = measurable.measure(constraints.copy(minWidth = width, maxWidth = width))
                        layout(constraints.maxWidth, row.height) { row.place(-(5.5f).dp.roundToPx(), 0) }
                    },
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    AvatarPalette.forEachIndexed { index, color ->
                        Swatch(color.fill, selected = avatar.color.mod(AvatarPalette.size) == index) { pick(avatar.copy(color = index)) }
                    }
                }

                Spacer(Modifier.height(20.dp))
                FieldLabel("Shape")
                PartRow(0 until SHAPE_COUNT, avatar.shape.mod(SHAPE_COUNT), { avatar.copy(shape = it) }, ::pick)

                Spacer(Modifier.height(20.dp))
                FieldLabel("Eyes")
                // Two rows of four, so every option is visible at once.
                val eyes = avatar.eyes.mod(EYES_COUNT)
                PartRow(0 until EYES_COUNT / 2, eyes, { avatar.copy(eyes = it) }, ::pick)
                Spacer(Modifier.height(8.dp))
                PartRow(EYES_COUNT / 2 until EYES_COUNT, eyes, { avatar.copy(eyes = it) }, ::pick)
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
                                "Read only. Share folders from the Orbit page on your PC first."
                            } else {
                                "Read only, from ${folders.joinToString(", ") { it.name }}."
                            },
                            files,
                            supported,
                        ) { files = it }
                    }
                }
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
 * The agent as others will see it, updating live as it's edited: shapes morph, colors blend,
 * eyes swap behind a blink. Shuffle rolls the dice and the avatar hops.
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

/** A color choice. The selected one gains a ring that springs out around it. */
@Composable
private fun Swatch(color: Color, selected: Boolean, onClick: () -> Unit) {
    val c = Orbit.colors
    val ring by animateFloatAsState(if (selected) 1f else 0f, OrbitMotion.bouncy(), label = "ring")
    val dot by animateDpAsState(if (selected) 24.dp else 27.dp, OrbitMotion.snappy(), label = "dot")
    Box(Modifier.size(38.dp).tap(CircleShape, 0.85f, onClick), contentAlignment = Alignment.Center) {
        Box(
            Modifier
                .size(38.dp)
                .graphicsLayer {
                    scaleX = 0.7f + 0.3f * ring
                    scaleY = 0.7f + 0.3f * ring
                    alpha = ring.coerceIn(0f, 1f)
                }
                .border(2.dp, c.text, CircleShape),
        )
        Box(Modifier.size(dot).clip(CircleShape).background(color))
    }
}

/** Equal-width previews of one part of the avatar, one per option in [options]. */
@Composable
private fun PartRow(options: IntRange, selected: Int, variant: (Int) -> AvatarSpec, onPick: (AvatarSpec) -> Unit) {
    val c = Orbit.colors
    val shape = RoundedCornerShape(OrbitDimens.radiusM)
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        for (index in options) {
            val isSelected = index == selected
            val edge by animateColorAsState(if (isSelected) c.text else c.hairline, OrbitMotion.snappy(), label = "edge")
            val fill by animateColorAsState(if (isSelected) c.surfaceRaised else c.surface, OrbitMotion.snappy(), label = "fill")
            Box(
                Modifier
                    .weight(1f)
                    .height(60.dp)
                    .tap(shape, 0.92f) { onPick(variant(index)) }
                    .background(fill)
                    .border(if (isSelected) 1.5.dp else 1.dp, edge, shape),
                contentAlignment = Alignment.Center,
            ) {
                AgentAvatar(variant(index), size = 36.dp)
            }
        }
    }
}
