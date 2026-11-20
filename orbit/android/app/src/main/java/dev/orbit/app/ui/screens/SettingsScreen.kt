package dev.orbit.app.ui.screens

import dev.orbit.app.ui.components.tap
import dev.orbit.app.ui.components.OrbitIcon
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import dev.orbit.app.ui.AppState
import dev.orbit.app.ui.components.DangerRow
import dev.orbit.app.ui.components.Hairline
import dev.orbit.app.ui.components.OrbitCard
import dev.orbit.app.ui.components.ScreenBar
import dev.orbit.app.ui.components.SectionTitle
import dev.orbit.app.ui.components.StatusDot
import dev.orbit.app.ui.theme.Orbit
import dev.orbit.app.ui.theme.OrbitDimens
import dev.orbit.app.ui.theme.OrbitType
import dev.orbit.app.ui.theme.entrance
import dev.orbit.app.ui.theme.rememberEntrances

@Composable
fun SettingsScreen(
    state: AppState,
    hubAddress: String,
    onUnpair: () -> Unit,
    onBack: () -> Unit,
    onOpenProvider: (providerId: String) -> Unit = {},
) {
    val c = Orbit.colors
    val scroll = rememberScrollState()
    val entrances = rememberEntrances()
    Scaffold(containerColor = c.bg, topBar = { ScreenBar("Settings", onBack, scrolled = scroll.value > 0) }) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(scroll)
                .padding(start = OrbitDimens.gutter, end = OrbitDimens.gutter, top = 12.dp, bottom = 48.dp),
        ) {
            val online = state.loaded && !state.offline
            OrbitCard(Modifier.fillMaxWidth().entrance(entrances, "hub", 0)) {
                Column {
                    Row(Modifier.padding(OrbitDimens.rowPad), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(state.hub.name.ifEmpty { "Your hub" }, style = OrbitType.titleM, color = c.text)
                            Text(hubAddress.removePrefix("http://"), Modifier.padding(top = 3.dp), style = OrbitType.mono, color = c.textSecondary)
                        }
                        Status(if (online) "Online" else "Unreachable", if (online) c.live else c.danger)
                    }
                    if (state.hub.version.isNotEmpty()) {
                        Hairline()
                        Row(Modifier.fillMaxWidth().padding(OrbitDimens.rowPad), verticalAlignment = Alignment.CenterVertically) {
                            Text("Version", Modifier.weight(1f), style = OrbitType.bodyM, color = c.textSecondary)
                            Text(state.hub.version, style = OrbitType.mono, color = c.text)
                        }
                    }
                }
            }

            Column(Modifier.entrance(entrances, "providers", 1)) {
                SectionTitle("Model providers", Modifier.padding(top = OrbitDimens.section, bottom = 8.dp))
                OrbitCard(Modifier.fillMaxWidth()) {
                    Column {
                        state.providers.forEachIndexed { index, provider ->
                            if (index > 0) Hairline()
                            // Providers that take a key open a screen to add or change it.
                            Row(
                                Modifier
                                    .fillMaxWidth()
                                    .then(if (provider.takesKey) Modifier.tap(RectangleShape, 0.985f) { onOpenProvider(provider.id) } else Modifier)
                                    .padding(start = OrbitDimens.rowPad, end = if (provider.takesKey) 8.dp else OrbitDimens.rowPad)
                                    .heightIn(min = 56.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Column(Modifier.weight(1f)) {
                                    Text(provider.label, style = OrbitType.titleS, color = c.text)
                                    provider.keyHint?.let { Text("Key $it", style = OrbitType.mono, color = c.textTertiary) }
                                }
                                when {
                                    provider.id == "demo" -> Status("Built in", null)
                                    provider.configured -> Status("Ready", c.live)
                                    provider.takesKey -> Status("Add key", null)
                                    else -> Status("Not running", null)
                                }
                                if (provider.takesKey) {
                                    OrbitIcon(OrbitIcon.Chevron, Modifier.padding(start = 4.dp), size = 18.dp, tint = c.textTertiary)
                                }
                            }
                        }
                    }
                }
                Text(
                    "Tap a provider to add its key. Keys are checked with the provider, then stored only on your PC.",
                    Modifier.padding(top = OrbitDimens.labelGap),
                    style = OrbitType.bodyS,
                    color = c.textTertiary,
                )

                Spacer(Modifier.height(40.dp))
                DangerRow("Unpair this phone", onUnpair)
            }
        }
    }
}

/** A state with its dot. Without a color it is a quiet note, not a status. */
@Composable
private fun Status(label: String, color: Color?) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        if (color != null) StatusDot(color, Modifier.padding(end = 8.dp), size = 7.dp)
        Text(label, style = OrbitType.label, color = color ?: Orbit.colors.textTertiary)
    }
}
