package dev.orbit.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
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
import androidx.compose.runtime.saveable.Saver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.layout
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.orbit.app.data.Agent
import dev.orbit.app.data.AvatarSpec
import dev.orbit.app.data.OrbitJson
import dev.orbit.app.data.Provider
import dev.orbit.app.ui.components.AgentAvatar
import dev.orbit.app.ui.components.AvatarPalette
import dev.orbit.app.ui.components.BarAction
import dev.orbit.app.ui.components.EYES_COUNT
import dev.orbit.app.ui.components.FieldLabel
import dev.orbit.app.ui.components.IconPill
import dev.orbit.app.ui.components.OrbitField
import dev.orbit.app.ui.components.OrbitIcon
import dev.orbit.app.ui.components.Overline
import dev.orbit.app.ui.components.Pill
import dev.orbit.app.ui.components.SHAPE_COUNT
import dev.orbit.app.ui.components.ScreenBar
import dev.orbit.app.ui.components.randomAvatar
import dev.orbit.app.ui.components.tap
import dev.orbit.app.ui.components.tint
import dev.orbit.app.ui.theme.Orbit
import dev.orbit.app.ui.theme.OrbitDimens
import dev.orbit.app.ui.theme.OrbitType
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
) {
    val c = Orbit.colors
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
        ),
    )

    Scaffold(
        containerColor = c.bg,
        topBar = {
            ScreenBar(if (initial == null) "New agent" else "Edit agent", onBack) {
                BarAction(if (initial == null) "Create" else "Save", ::save, enabled = canSave)
            }
        },
    ) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).imePadding().verticalScroll(rememberScrollState()).padding(bottom = 48.dp),
        ) {
            IdentityCard(avatar, name, role, model, onShuffle = { avatar = randomAvatar() })

            Section("Look")
            Gutter {
                FieldLabel("Color")
                // All ten fit the width, so none hides off-screen. The row runs 5dp past the gutter on
                // each side (the selection ring's margin) so the first dot itself sits on the gutter.
                Row(
                    Modifier.layout { measurable, constraints ->
                        val width = constraints.maxWidth + 10.dp.roundToPx()
                        val row = measurable.measure(constraints.copy(minWidth = width, maxWidth = width))
                        layout(constraints.maxWidth, row.height) { row.place(-5.dp.roundToPx(), 0) }
                    },
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    AvatarPalette.forEachIndexed { index, color ->
                        val selected = avatar.color.mod(AvatarPalette.size) == index
                        Box(
                            Modifier
                                .size(34.dp)
                                .border(2.dp, if (selected) c.text else Color.Transparent, CircleShape)
                                .tap(CircleShape) { avatar = avatar.copy(color = index) },
                            contentAlignment = Alignment.Center,
                        ) {
                            Box(Modifier.size(24.dp).clip(CircleShape).background(color.fill))
                        }
                    }
                }

                Spacer(Modifier.height(20.dp))
                FieldLabel("Shape")
                PartRow(0 until SHAPE_COUNT, avatar.shape.mod(SHAPE_COUNT), { avatar.copy(shape = it) }) { avatar = it }

                Spacer(Modifier.height(20.dp))
                FieldLabel("Eyes")
                // Two rows of four, so every option is visible at once.
                val eyes = avatar.eyes.mod(EYES_COUNT)
                PartRow(0 until EYES_COUNT / 2, eyes, { avatar.copy(eyes = it) }) { avatar = it }
                Spacer(Modifier.height(8.dp))
                PartRow(EYES_COUNT / 2 until EYES_COUNT, eyes, { avatar.copy(eyes = it) }) { avatar = it }
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
                if (provider != null && !provider.configured) {
                    Text(
                        "${provider.label} needs an API key. Add one to config.json on your PC, then restart the hub.",
                        Modifier.padding(top = 10.dp),
                        style = OrbitType.bodyS,
                        color = c.danger,
                    )
                }
                Spacer(Modifier.height(20.dp))
                FieldLabel("Model id")
                OrbitField(model, { model = it.take(120) }, "Model id", textStyle = OrbitType.monoL)
            }
            val suggestions = remember(models, model) {
                models.filter { it != model && it.contains(model.trim(), ignoreCase = true) }.ifEmpty { models.filter { it != model } }.take(24)
            }
            if (suggestions.isNotEmpty()) {
                LazyRow(
                    Modifier.padding(top = 10.dp),
                    contentPadding = PaddingValues(horizontal = OrbitDimens.gutter),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(suggestions) { id -> Pill(id, onClick = { model = id }, textStyle = OrbitType.mono) }
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

@Composable
private fun Section(title: String) {
    Overline(title, Modifier.padding(start = OrbitDimens.gutter, top = OrbitDimens.section + 4.dp, bottom = 16.dp))
}

@Composable
private fun Gutter(content: @Composable () -> Unit) {
    Column(Modifier.padding(horizontal = OrbitDimens.gutter)) { content() }
}

/** A destructive action as a full-width outlined row. */
@Composable
fun DangerRow(label: String, onClick: () -> Unit) {
    val c = Orbit.colors
    val shape = RoundedCornerShape(OrbitDimens.radiusM)
    Box(
        Modifier.fillMaxWidth().height(52.dp).clip(shape).border(1.dp, c.hairline, shape).background(c.surface).clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, style = OrbitType.titleS, color = c.danger)
    }
}

/** The agent as others will see it, updating live as it's edited. */
@Composable
private fun IdentityCard(avatar: AvatarSpec, name: String, role: String, model: String, onShuffle: () -> Unit) {
    val c = Orbit.colors
    val shape = RoundedCornerShape(OrbitDimens.radiusXL)
    Box(
        Modifier
            .padding(start = OrbitDimens.gutter, end = OrbitDimens.gutter, top = 4.dp)
            .fillMaxWidth()
            .clip(shape)
            .background(c.surface)
            .background(Brush.verticalGradient(listOf(avatar.tint().copy(alpha = if (c.isDark) 0.2f else 0.24f), Color.Transparent)))
            .border(1.dp, c.hairline, shape),
    ) {
        Column(Modifier.fillMaxWidth().padding(top = 32.dp, bottom = 24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            AgentAvatar(avatar, size = 104.dp)
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
        IconPill(OrbitIcon.Dice, "Shuffle avatar", onShuffle, Modifier.align(Alignment.TopEnd).padding(12.dp))
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
            Box(
                Modifier
                    .weight(1f)
                    .height(60.dp)
                    .clip(shape)
                    .background(c.surface)
                    .border(if (isSelected) 1.5.dp else 1.dp, if (isSelected) c.text else c.hairline, shape)
                    .clickable { onPick(variant(index)) },
                contentAlignment = Alignment.Center,
            ) {
                AgentAvatar(variant(index), size = 36.dp)
            }
        }
    }
}
