package dev.orbit.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import dev.orbit.app.data.Agent
import dev.orbit.app.data.MemoryNote
import dev.orbit.app.data.Profile
import dev.orbit.app.ui.components.AgentAvatar
import dev.orbit.app.ui.components.FieldLabel
import dev.orbit.app.ui.components.Hairline
import dev.orbit.app.ui.components.IconTap
import dev.orbit.app.ui.components.OrbitCard
import dev.orbit.app.ui.components.OrbitField
import dev.orbit.app.ui.components.OrbitIcon
import dev.orbit.app.ui.components.ScreenBar
import dev.orbit.app.ui.components.SecondaryButton
import dev.orbit.app.ui.components.SectionTitle
import dev.orbit.app.ui.components.tap
import dev.orbit.app.ui.theme.Orbit
import dev.orbit.app.ui.theme.OrbitDimens
import dev.orbit.app.ui.theme.OrbitType
import dev.orbit.app.ui.theme.rememberHaptics

/**
 * What the whole crew knows about the user: what to call them, and notes they or their agents added.
 * Every agent sees all of it, in every room.
 */
@Composable
fun AboutYouScreen(
    profile: Profile,
    agents: List<Agent>,
    canIntro: Boolean,
    onSetName: (String) -> Unit,
    onAdd: (text: String, onDone: (Boolean) -> Unit) -> Unit,
    onRemove: (MemoryNote) -> Unit,
    onIntro: () -> Unit,
    onBack: () -> Unit,
) {
    val c = Orbit.colors
    val haptics = rememberHaptics()
    val scroll = rememberScrollState()
    var name by rememberSaveable(profile.name) { mutableStateOf(profile.name) }
    var draft by rememberSaveable { mutableStateOf("") }
    var adding by remember { mutableStateOf(false) }
    val byName = remember(agents) { agents.associateBy { it.name } }

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

    Scaffold(containerColor = c.bg, topBar = { ScreenBar("About you", onBack, scrolled = scroll.value > 0) }) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .imePadding()
                .verticalScroll(scroll)
                .padding(start = OrbitDimens.gutter, end = OrbitDimens.gutter, top = 12.dp, bottom = 48.dp),
        ) {
            Text(
                "Everything here, every agent in your crew knows, in every room. Agents add to it as they learn about you.",
                style = OrbitType.bodyM,
                color = c.textSecondary,
            )

            Spacer(Modifier.height(OrbitDimens.section))
            FieldLabel("What should your crew call you?")
            OrbitField(
                name,
                { name = it.take(40) },
                "Your name",
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words),
                trailing = {
                    if (name.trim() != profile.name) {
                        Text(
                            "Save",
                            Modifier.tap(CircleShape, 0.92f) { onSetName(name.trim()) }.padding(horizontal = 14.dp, vertical = 12.dp),
                            style = OrbitType.label,
                            color = c.text,
                        )
                    }
                },
            )

            SectionTitle("What your crew knows", Modifier.padding(top = OrbitDimens.section, bottom = 8.dp), count = profile.notes.size)
            if (profile.notes.isEmpty()) {
                Text(
                    "Nothing yet. Chat with your guide, or add things yourself: what you do, what you're into, how you like answers.",
                    Modifier.padding(bottom = 12.dp),
                    style = OrbitType.bodyS,
                    color = c.textSecondary,
                )
            } else {
                OrbitCard(Modifier.fillMaxWidth()) {
                    Column {
                        profile.notes.forEachIndexed { index, note ->
                            if (index > 0) Hairline()
                            Row(Modifier.fillMaxWidth().padding(start = OrbitDimens.rowPad, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                                Column(Modifier.weight(1f).padding(vertical = 12.dp)) {
                                    Text(note.text, style = OrbitType.bodyM, color = c.text)
                                    Row(Modifier.padding(top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                                        // Who taught the crew this: the agent's face, or "you".
                                        byName[note.source]?.let { AgentAvatar(it.avatar, Modifier.padding(end = 6.dp), size = 16.dp) }
                                        Text(
                                            if (note.source == "you") "Added by you" else "Learned by ${note.source}",
                                            style = OrbitType.caption,
                                            color = c.textTertiary,
                                        )
                                    }
                                }
                                IconTap(OrbitIcon.Close, "Forget \"${note.text}\"", { onRemove(note) }, tint = c.textTertiary)
                            }
                        }
                    }
                }
                Spacer(Modifier.height(12.dp))
            }
            OrbitField(
                draft,
                { draft = it.take(300) },
                "Add something about you",
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

            if (canIntro) {
                Spacer(Modifier.height(OrbitDimens.section))
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    SecondaryButton("Chat with your guide", onIntro)
                    Text(
                        "Your guide asks a few questions and saves what it learns here.",
                        Modifier.fillMaxWidth(),
                        style = OrbitType.caption,
                        color = c.textTertiary,
                    )
                }
            }
        }
    }
}
