package dev.orbit.app.ui.screens

import androidx.compose.foundation.BorderStroke
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
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
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
import androidx.compose.ui.unit.dp
import dev.orbit.app.data.Agent
import dev.orbit.app.data.AvatarSpec
import dev.orbit.app.data.OrbitJson
import dev.orbit.app.data.Provider
import dev.orbit.app.ui.components.AgentAvatar
import dev.orbit.app.ui.components.AvatarPalette
import dev.orbit.app.ui.components.EXTRA_COUNT
import dev.orbit.app.ui.components.EYES_COUNT
import dev.orbit.app.ui.components.MOUTH_COUNT
import dev.orbit.app.ui.components.OrbitField
import dev.orbit.app.ui.components.PrimaryButton
import dev.orbit.app.ui.components.SHAPE_COUNT
import dev.orbit.app.ui.components.ScreenBar
import dev.orbit.app.ui.components.SectionLabel
import dev.orbit.app.ui.components.randomAvatar
import dev.orbit.app.ui.components.tint
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
        topBar = {
            ScreenBar(if (initial == null) "New agent" else "Edit agent", onBack) {
                TextButton(onClick = ::save, enabled = canSave) { Text("Save", style = MaterialTheme.typography.titleMedium) }
            }
        },
    ) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).imePadding().verticalScroll(rememberScrollState()).padding(bottom = 32.dp),
        ) {
            AvatarHero(avatar, onShuffle = { avatar = randomAvatar() })

            Column(Modifier.padding(horizontal = 20.dp)) {
                SectionLabel("Color")
            }
            LazyRow(contentPadding = PaddingValues(horizontal = 20.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                items(AvatarPalette.size) { index ->
                    val selected = avatar.color == index
                    Box(
                        Modifier
                            .size(36.dp)
                            .clip(CircleShape)
                            .background(Brush.verticalGradient(AvatarPalette[index].toList()))
                            .border(if (selected) 3.dp else 0.dp, if (selected) MaterialTheme.colorScheme.onSurface else Color.Transparent, CircleShape)
                            .clickable { avatar = avatar.copy(color = index) },
                    )
                }
            }
            PartPicker("Shape", SHAPE_COUNT, avatar.shape, { avatar.copy(shape = it) }) { avatar = it }
            PartPicker("Eyes", EYES_COUNT, avatar.eyes, { avatar.copy(eyes = it) }) { avatar = it }
            PartPicker("Mouth", MOUTH_COUNT, avatar.mouth, { avatar.copy(mouth = it) }) { avatar = it }
            PartPicker("Extras", EXTRA_COUNT, avatar.extra, { avatar.copy(extra = it) }) { avatar = it }

            Column(Modifier.padding(horizontal = 20.dp)) {
                Spacer(Modifier.height(24.dp))
                SectionLabel("Name")
                OrbitField(
                    name, { name = it.take(40) }, "Nova",
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words),
                )
                Spacer(Modifier.height(16.dp))
                SectionLabel("Role")
                OrbitField(role, { role = it.take(80) }, "the planner")

                Spacer(Modifier.height(16.dp))
                SectionLabel("Runs on")
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    for (option in providers) {
                        Chip(
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
                        Modifier.padding(top = 8.dp),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }

                Spacer(Modifier.height(16.dp))
                SectionLabel("Model")
                OrbitField(model, { model = it.take(120) }, "Model id")
            }
            val suggestions = remember(models, model) {
                models.filter { it != model && it.contains(model.trim(), ignoreCase = true) }.ifEmpty { models.filter { it != model } }.take(24)
            }
            if (suggestions.isNotEmpty()) {
                LazyRow(
                    Modifier.padding(top = 10.dp),
                    contentPadding = PaddingValues(horizontal = 20.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(suggestions) { id -> Chip(label = id, selected = false, onClick = { model = id }) }
                }
            }

            Column(Modifier.padding(horizontal = 20.dp)) {
                Spacer(Modifier.height(16.dp))
                SectionLabel("Instructions")
                OrbitField(
                    instructions, { instructions = it }, "How should this agent think, behave, and help the crew?",
                    singleLine = false, minLines = 5,
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
                )
                Spacer(Modifier.height(24.dp))
                PrimaryButton(if (initial == null) "Add to crew" else "Save changes", ::save, enabled = canSave)
                if (onDelete != null) {
                    TextButton(onClick = onDelete, Modifier.fillMaxWidth().padding(top = 8.dp)) {
                        Text("Delete agent", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.titleSmall)
                    }
                }
            }
        }
    }
}

@Composable
private fun AvatarHero(avatar: AvatarSpec, onShuffle: () -> Unit) {
    Column(Modifier.fillMaxWidth().padding(top = 8.dp, bottom = 20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Box(
            Modifier
                .size(176.dp)
                .clip(CircleShape)
                .background(Brush.radialGradient(listOf(avatar.tint().copy(alpha = 0.28f), Color.Transparent))),
            contentAlignment = Alignment.Center,
        ) {
            AgentAvatar(avatar, size = 128.dp)
        }
        Surface(onClick = onShuffle, shape = CircleShape, color = MaterialTheme.colorScheme.surfaceContainerHigh) {
            Row(Modifier.padding(horizontal = 16.dp, vertical = 9.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Refresh, contentDescription = null, Modifier.size(18.dp))
                Text("Shuffle", Modifier.padding(start = 8.dp), style = MaterialTheme.typography.labelLarge)
            }
        }
    }
}

/** A row of previews, one per option for a single part of the avatar. */
@Composable
private fun PartPicker(label: String, count: Int, selected: Int, variant: (Int) -> AvatarSpec, onPick: (AvatarSpec) -> Unit) {
    SectionLabel(label, Modifier.padding(start = 20.dp, top = 18.dp))
    LazyRow(contentPadding = PaddingValues(horizontal = 20.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        items(count) { index ->
            val isSelected = index == selected
            Surface(
                onClick = { onPick(variant(index)) },
                shape = MaterialTheme.shapes.medium,
                color = if (isSelected) MaterialTheme.colorScheme.surfaceContainerHighest else MaterialTheme.colorScheme.surfaceContainerLow,
                border = BorderStroke(
                    if (isSelected) 2.dp else 1.dp,
                    if (isSelected) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.outlineVariant,
                ),
            ) {
                AgentAvatar(variant(index), Modifier.padding(8.dp), size = 44.dp)
            }
        }
    }
}

@Composable
fun Chip(label: String, selected: Boolean, onClick: () -> Unit, dimmed: Boolean = false) {
    Surface(
        onClick = onClick,
        shape = CircleShape,
        color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceContainer,
        contentColor = when {
            selected -> MaterialTheme.colorScheme.onPrimary
            dimmed -> MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f)
            else -> MaterialTheme.colorScheme.onSurface
        },
    ) {
        Text(label, Modifier.padding(horizontal = 14.dp, vertical = 9.dp), style = MaterialTheme.typography.labelLarge)
    }
}
