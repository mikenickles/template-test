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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.orbit.app.data.Agent
import dev.orbit.app.data.AvatarSpec
import dev.orbit.app.data.OrbitJson
import dev.orbit.app.data.Provider
import dev.orbit.app.ui.components.AgentAvatar
import dev.orbit.app.ui.components.AvatarPalette
import dev.orbit.app.ui.components.BarAction
import dev.orbit.app.ui.components.EYES_COUNT
import dev.orbit.app.ui.components.IconPill
import dev.orbit.app.ui.components.OrbitField
import dev.orbit.app.ui.components.Overline
import dev.orbit.app.ui.components.Pill
import dev.orbit.app.ui.components.PrimaryButton
import dev.orbit.app.ui.components.SHAPE_COUNT
import dev.orbit.app.ui.components.ScreenBar
import dev.orbit.app.ui.components.randomAvatar
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
            ScreenBar(if (initial == null) "New agent" else "Edit agent", onBack) { BarAction("Save", ::save, enabled = canSave) }
        },
    ) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).imePadding().verticalScroll(rememberScrollState()).padding(bottom = 40.dp),
        ) {
            IdentityCard(avatar, name, role, model, onShuffle = { avatar = randomAvatar() })

            Section("Color")
            LazyRow(contentPadding = PaddingValues(horizontal = OrbitDimens.gutter), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                items(AvatarPalette.size) { index ->
                    val selected = avatar.color.mod(AvatarPalette.size) == index
                    // The selected swatch sits inside a ring, with a gap between the two.
                    Box(
                        Modifier
                            .size(40.dp)
                            .border(2.dp, if (selected) c.text else Color.Transparent, CircleShape)
                            .clip(CircleShape)
                            .clickable { avatar = avatar.copy(color = index) },
                        contentAlignment = Alignment.Center,
                    ) {
                        Box(Modifier.size(28.dp).clip(CircleShape).background(AvatarPalette[index]))
                    }
                }
            }
            PartPicker("Shape", SHAPE_COUNT, avatar.shape.mod(SHAPE_COUNT), { avatar.copy(shape = it) }) { avatar = it }
            PartPicker("Eyes", EYES_COUNT, avatar.eyes.mod(EYES_COUNT), { avatar.copy(eyes = it) }) { avatar = it }

            Section("Name")
            Gutter {
                OrbitField(name, { name = it.take(40) }, "Nova", keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words))
            }
            Section("Role")
            Gutter { OrbitField(role, { role = it.take(80) }, "the planner") }

            Section("Runs on")
            Gutter {
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
                        "${provider.label} has no API key on your hub yet. Add one to config.json on the PC and restart the hub.",
                        Modifier.padding(top = 10.dp),
                        style = OrbitType.bodyS,
                        color = c.danger,
                    )
                }
            }

            Section("Model")
            Gutter { OrbitField(model, { model = it.take(120) }, "Model id", textStyle = OrbitType.mono.copy(fontSize = 14.sp, lineHeight = 22.sp)) }
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
                Spacer(Modifier.height(28.dp))
                PrimaryButton(if (initial == null) "Add to crew" else "Save changes", ::save, enabled = canSave)
                if (onDelete != null) {
                    TextButton(onClick = onDelete, Modifier.fillMaxWidth().padding(top = 6.dp)) {
                        Text("Delete agent", style = OrbitType.label, color = c.danger)
                    }
                }
            }
        }
    }
}

@Composable
private fun Section(title: String) {
    Overline(title, Modifier.padding(start = OrbitDimens.gutter, top = 26.dp, bottom = 10.dp))
}

@Composable
private fun Gutter(content: @Composable () -> Unit) {
    Column(Modifier.padding(horizontal = OrbitDimens.gutter)) { content() }
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
            .background(Brush.verticalGradient(listOf(avatar.tint().copy(alpha = if (c.isDark) 0.2f else 0.26f), Color.Transparent)))
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
            val detail = listOf(role.trim(), model.trim()).filter { it.isNotEmpty() }.joinToString("  ·  ")
            if (detail.isNotEmpty()) {
                Text(
                    detail,
                    Modifier.padding(top = 4.dp, start = 24.dp, end = 24.dp),
                    style = OrbitType.mono,
                    color = c.textSecondary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        IconPill(Icons.Default.Refresh, "Shuffle avatar", onShuffle, Modifier.align(Alignment.TopEnd).padding(12.dp))
    }
}

/** A row of previews, one per option for a single part of the avatar. */
@Composable
private fun PartPicker(label: String, count: Int, selected: Int, variant: (Int) -> AvatarSpec, onPick: (AvatarSpec) -> Unit) {
    val c = Orbit.colors
    val shape = RoundedCornerShape(OrbitDimens.radiusM)
    Section(label)
    LazyRow(contentPadding = PaddingValues(horizontal = OrbitDimens.gutter), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        items(count) { index ->
            val isSelected = index == selected
            Box(
                Modifier
                    .size(58.dp)
                    .clip(shape)
                    .background(if (isSelected) c.surfaceRaised else c.surface)
                    .border(if (isSelected) 1.5.dp else 1.dp, if (isSelected) c.text else c.hairline, shape)
                    .clickable { onPick(variant(index)) },
                contentAlignment = Alignment.Center,
            ) {
                AgentAvatar(variant(index), size = 34.dp)
            }
        }
    }
}
