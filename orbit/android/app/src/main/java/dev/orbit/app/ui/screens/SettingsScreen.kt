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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import dev.orbit.app.ui.AppState
import dev.orbit.app.ui.components.ScreenBar
import dev.orbit.app.ui.components.SectionLabel

@Composable
fun SettingsScreen(state: AppState, hubAddress: String, onUnpair: () -> Unit, onBack: () -> Unit) {
    Scaffold(topBar = { ScreenBar("Settings", onBack) }) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(start = 20.dp, end = 20.dp, top = 8.dp, bottom = 32.dp),
        ) {
            SectionLabel("Hub")
            Card {
                Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                    val online = state.loaded && !state.offline
                    Box(
                        Modifier
                            .size(10.dp)
                            .clip(CircleShape)
                            .background(if (online) MaterialTheme.colorScheme.tertiary else MaterialTheme.colorScheme.error),
                    )
                    Column(Modifier.padding(start = 14.dp)) {
                        Text(state.hub.name.ifEmpty { "Your hub" }, style = MaterialTheme.typography.titleMedium)
                        Text(
                            listOfNotNull(
                                hubAddress.removePrefix("http://"),
                                state.hub.version.takeIf { it.isNotEmpty() }?.let { "v$it" },
                                if (online) "online" else "unreachable",
                            ).joinToString(" · "),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }

            Spacer(Modifier.height(24.dp))
            SectionLabel("Model providers")
            Card {
                Column {
                    state.providers.forEachIndexed { index, provider ->
                        if (index > 0) HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text(provider.label, Modifier.weight(1f), style = MaterialTheme.typography.titleSmall)
                            Text(
                                if (provider.configured) "Ready" else "No key",
                                style = MaterialTheme.typography.labelMedium,
                                color = if (provider.configured) MaterialTheme.colorScheme.tertiary else MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }
            Text(
                "API keys stay on your PC. Add them to config.json in the hub's data folder and restart the hub.",
                Modifier.padding(top = 10.dp),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            Spacer(Modifier.height(32.dp))
            OutlinedButton(
                onClick = onUnpair,
                modifier = Modifier.fillMaxWidth().height(52.dp),
                shape = CircleShape,
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
            ) {
                Text("Unpair this phone", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.titleSmall)
            }
        }
    }
}

@Composable
private fun Card(content: @Composable () -> Unit) {
    Surface(
        Modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.large,
        color = MaterialTheme.colorScheme.surfaceContainerLow,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        content = content,
    )
}
