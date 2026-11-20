package dev.orbit.app.ui.screens

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
import dev.orbit.app.ui.components.Hairline
import dev.orbit.app.ui.components.OrbitCard
import dev.orbit.app.ui.components.Overline
import dev.orbit.app.ui.components.ScreenBar
import dev.orbit.app.ui.components.StatusDot
import dev.orbit.app.ui.theme.Orbit
import dev.orbit.app.ui.theme.OrbitDimens
import dev.orbit.app.ui.theme.OrbitType

@Composable
fun SettingsScreen(state: AppState, hubAddress: String, onUnpair: () -> Unit, onBack: () -> Unit) {
    val c = Orbit.colors
    Scaffold(containerColor = c.bg, topBar = { ScreenBar("Settings", onBack) }) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(start = OrbitDimens.gutter, end = OrbitDimens.gutter, top = 12.dp, bottom = 48.dp),
        ) {
            val online = state.loaded && !state.offline
            Overline("Hub", Modifier.padding(bottom = OrbitDimens.labelGap))
            OrbitCard(Modifier.fillMaxWidth()) {
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

            Spacer(Modifier.height(OrbitDimens.section))
            Overline("Model providers", Modifier.padding(bottom = OrbitDimens.labelGap))
            OrbitCard(Modifier.fillMaxWidth()) {
                Column {
                    state.providers.forEachIndexed { index, provider ->
                        if (index > 0) Hairline()
                        Row(Modifier.fillMaxWidth().padding(OrbitDimens.rowPad), verticalAlignment = Alignment.CenterVertically) {
                            Text(provider.label, Modifier.weight(1f), style = OrbitType.titleS, color = c.text)
                            when {
                                provider.id == "demo" -> Status("Built in", null)
                                provider.configured -> Status("Ready", c.live)
                                else -> Status("Needs a key", null)
                            }
                        }
                    }
                }
            }
            Text(
                "API keys never leave your PC. Add them to config.json in the hub's data folder, then restart the hub.",
                Modifier.padding(top = OrbitDimens.labelGap),
                style = OrbitType.bodyS,
                color = c.textTertiary,
            )

            Spacer(Modifier.height(40.dp))
            DangerRow("Unpair this phone", onUnpair)
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
