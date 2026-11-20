package dev.orbit.app.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.orbit.app.ui.AppState
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
                .padding(start = OrbitDimens.gutter, end = OrbitDimens.gutter, top = 12.dp, bottom = 40.dp),
        ) {
            val online = state.loaded && !state.offline
            Overline("Hub")
            Spacer(Modifier.height(10.dp))
            OrbitCard(Modifier.fillMaxWidth()) {
                Column {
                    Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(state.hub.name.ifEmpty { "Your hub" }, style = OrbitType.titleM, color = c.text)
                            Text(
                                hubAddress.removePrefix("http://"),
                                Modifier.padding(top = 3.dp),
                                style = OrbitType.mono,
                                color = c.textSecondary,
                            )
                        }
                        StatusDot(if (online) c.live else c.danger, size = 7.dp)
                        Text(
                            if (online) "Online" else "Unreachable",
                            Modifier.padding(start = 8.dp),
                            style = OrbitType.label,
                            color = if (online) c.live else c.danger,
                        )
                    }
                    if (state.hub.version.isNotEmpty()) {
                        Divider()
                        Detail("Version", state.hub.version)
                    }
                    Divider()
                    Detail("Agents", state.agents.size.toString())
                    Divider()
                    Detail("Rooms", state.rooms.size.toString())
                }
            }

            Spacer(Modifier.height(28.dp))
            Overline("Model providers")
            Spacer(Modifier.height(10.dp))
            OrbitCard(Modifier.fillMaxWidth()) {
                Column {
                    state.providers.forEachIndexed { index, provider ->
                        if (index > 0) Divider()
                        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 15.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text(provider.label, Modifier.weight(1f), style = OrbitType.titleS, color = c.text)
                            Text(
                                if (provider.configured) "Ready" else "No key",
                                style = OrbitType.label,
                                color = if (provider.configured) c.text else c.textTertiary,
                            )
                        }
                    }
                }
            }
            Text(
                "API keys never leave your PC. Add them to config.json in the hub's data folder, then restart the hub.",
                Modifier.padding(top = 12.dp, start = 4.dp, end = 4.dp),
                style = OrbitType.bodyS,
                color = c.textTertiary,
            )

            Spacer(Modifier.height(32.dp))
            Surface(
                onClick = onUnpair,
                modifier = Modifier.fillMaxWidth().height(52.dp),
                shape = CircleShape,
                color = c.bg,
                contentColor = c.danger,
                border = BorderStroke(1.dp, c.line),
            ) {
                Box(contentAlignment = Alignment.Center) { Text("Unpair this phone", style = OrbitType.titleS) }
            }
        }
    }
}

@Composable
private fun Divider() {
    Box(Modifier.fillMaxWidth().height(1.dp).background(Orbit.colors.hairline))
}

@Composable
private fun Detail(label: String, value: String) {
    val c = Orbit.colors
    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(label, Modifier.weight(1f), style = OrbitType.bodyM, color = c.textSecondary)
        Text(value, style = OrbitType.mono.copy(fontSize = 13.sp), color = c.text)
    }
}
