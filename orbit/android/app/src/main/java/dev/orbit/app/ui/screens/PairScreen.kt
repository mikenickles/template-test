package dev.orbit.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import dev.orbit.app.data.AvatarSpec
import dev.orbit.app.ui.PairState
import dev.orbit.app.ui.components.AgentAvatar
import dev.orbit.app.ui.components.OrbitField
import dev.orbit.app.ui.components.PrimaryButton
import dev.orbit.app.ui.components.SectionLabel

@Composable
fun PairScreen(state: PairState, onFind: () -> Unit, onConnect: (address: String, code: String) -> Unit) {
    var address by rememberSaveable { mutableStateOf("") }
    var code by rememberSaveable { mutableStateOf("") }

    // A single hub on the network is almost certainly the one they want.
    LaunchedEffect(state.found) {
        val only = state.found?.singleOrNull()
        if (address.isBlank() && only != null) address = only.address
    }

    Scaffold { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .imePadding()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp, vertical = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.height(28.dp))
            HeroCluster()
            Spacer(Modifier.height(24.dp))
            Text("Orbit", style = MaterialTheme.typography.displaySmall)
            Spacer(Modifier.height(8.dp))
            Text(
                "Your crew of AI agents, working together\non your always-on PC.",
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(36.dp))

            Column(Modifier.fillMaxWidth()) {
                SectionLabel("Hub address")
                OrbitField(
                    value = address,
                    onValueChange = { address = it },
                    placeholder = "192.168.1.20:8787",
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                    trailing = {
                        if (state.finding) {
                            CircularProgressIndicator(Modifier.padding(end = 16.dp).size(18.dp), strokeWidth = 2.dp)
                        } else {
                            TextButton(onClick = onFind, Modifier.padding(end = 6.dp)) {
                                Text("Find", color = MaterialTheme.colorScheme.secondary)
                            }
                        }
                    },
                )
                val found = state.found
                if (found != null && found.isEmpty()) {
                    Text(
                        "No hub answered on this Wi‑Fi. Type the address your PC shows.",
                        Modifier.padding(top = 8.dp),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                } else if (found != null && (found.size > 1 || found.first().address != address)) {
                    Row(Modifier.padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        for (hub in found.take(3)) {
                            Surface(
                                onClick = { address = hub.address },
                                shape = CircleShape,
                                color = MaterialTheme.colorScheme.surfaceContainerHigh,
                            ) {
                                Text(hub.name, Modifier.padding(horizontal = 14.dp, vertical = 8.dp), style = MaterialTheme.typography.labelMedium)
                            }
                        }
                    }
                }

                Spacer(Modifier.height(20.dp))
                SectionLabel("Pairing code")
                OrbitField(
                    value = code,
                    onValueChange = { input -> code = input.filter(Char::isDigit).take(6) },
                    placeholder = "000000",
                    textStyle = MaterialTheme.typography.headlineSmall.copy(letterSpacing = 0.3.em),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                )
                if (state.error != null) {
                    Text(
                        state.error,
                        Modifier.padding(top = 10.dp),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
                Spacer(Modifier.height(24.dp))
                PrimaryButton(
                    text = "Connect",
                    onClick = { onConnect(address, code) },
                    enabled = address.isNotBlank() && code.length == 6,
                    loading = state.busy,
                )
            }
            Spacer(Modifier.height(20.dp))
            Text(
                "Start the Orbit hub on your PC. It shows the address and a pairing code.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
        }
    }
}

/** A little huddle of dot characters. */
@Composable
fun HeroCluster(modifier: Modifier = Modifier) {
    Box(modifier.size(width = 232.dp, height = 124.dp)) {
        AgentAvatar(AvatarSpec(shape = 1, color = 5, eyes = 4, mouth = 4), Modifier.offset(x = 0.dp, y = 44.dp), 64.dp)
        AgentAvatar(AvatarSpec(shape = 2, color = 4, eyes = 2, mouth = 3, extra = 5), Modifier.offset(x = 168.dp, y = 40.dp), 64.dp)
        AgentAvatar(AvatarSpec(shape = 3, color = 1, eyes = 6, mouth = 1, extra = 4), Modifier.offset(x = 40.dp, y = 4.dp), 52.dp)
        AgentAvatar(AvatarSpec(shape = 4, color = 8, eyes = 3, mouth = 5, extra = 2), Modifier.offset(x = 144.dp, y = 0.dp), 52.dp)
        AgentAvatar(AvatarSpec(shape = 0, color = 7, eyes = 0, mouth = 1, extra = 1), Modifier.offset(x = 68.dp, y = 22.dp), 96.dp)
    }
}
