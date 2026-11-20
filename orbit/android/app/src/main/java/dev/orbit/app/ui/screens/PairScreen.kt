package dev.orbit.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import dev.orbit.app.data.AvatarSpec
import dev.orbit.app.ui.PairState
import dev.orbit.app.ui.components.AvatarRow
import dev.orbit.app.ui.components.FieldLabel
import dev.orbit.app.ui.components.LogoMark
import dev.orbit.app.ui.components.OrbitField
import dev.orbit.app.ui.components.Pill
import dev.orbit.app.ui.components.PrimaryButton
import dev.orbit.app.ui.components.tap
import dev.orbit.app.ui.theme.Orbit
import dev.orbit.app.ui.theme.OrbitDimens
import dev.orbit.app.ui.theme.OrbitType

/** The sample crew shown where there are no real agents yet. */
val SampleCrew = listOf(
    AvatarSpec(shape = 0, color = 7, eyes = 1),
    AvatarSpec(shape = 1, color = 5, eyes = 5),
    AvatarSpec(shape = 4, color = 2, eyes = 2),
    AvatarSpec(shape = 2, color = 4, eyes = 0),
    AvatarSpec(shape = 3, color = 0, eyes = 3),
)

private const val CODE_LENGTH = 6

@Composable
fun PairScreen(state: PairState, onFind: () -> Unit, onConnect: (address: String, code: String) -> Unit) {
    val c = Orbit.colors
    var address by rememberSaveable { mutableStateOf("") }
    var code by rememberSaveable { mutableStateOf("") }

    // A single hub on the network is almost certainly the one they want.
    LaunchedEffect(state.found) {
        val only = state.found?.singleOrNull()
        if (address.isBlank() && only != null) address = only.address
    }

    Scaffold(containerColor = c.bg) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .imePadding()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = OrbitDimens.gutter),
        ) {
            Spacer(Modifier.height(20.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                LogoMark(size = 24.dp)
                Text("Orbit", Modifier.padding(start = 8.dp), style = OrbitType.titleM, color = c.text)
            }

            Spacer(Modifier.height(48.dp))
            AvatarRow(SampleCrew, size = 52.dp)
            Spacer(Modifier.height(OrbitDimens.section))
            Text("Pair with your hub", style = OrbitType.display, color = c.text)
            Spacer(Modifier.height(10.dp))
            Text(
                "Your agents run on your always-on PC. Start the hub there, then enter the address and code it shows.",
                style = OrbitType.body,
                color = c.textSecondary,
            )

            Spacer(Modifier.height(36.dp))
            FieldLabel("Hub address")
            OrbitField(
                value = address,
                onValueChange = { address = it },
                placeholder = "192.168.1.20:8787",
                textStyle = OrbitType.monoL,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                trailing = {
                    Box(Modifier.size(width = 64.dp, height = 44.dp).tap(CircleShape, onFind), contentAlignment = Alignment.Center) {
                        if (state.finding) {
                            CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp, color = c.textSecondary)
                        } else {
                            Text("Find", style = OrbitType.label, color = c.text)
                        }
                    }
                },
            )
            val found = state.found
            if (found != null && found.isEmpty()) {
                Text(
                    "No hub answered on this Wi‑Fi. Type the address your PC shows.",
                    Modifier.padding(top = 10.dp),
                    style = OrbitType.bodyS,
                    color = c.textSecondary,
                )
            } else if (found != null && (found.size > 1 || found.first().address != address)) {
                Row(Modifier.padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    for (hub in found.take(3)) Pill(hub.name, onClick = { address = hub.address })
                }
            }

            Spacer(Modifier.height(24.dp))
            FieldLabel("Pairing code")
            CodeField(code, failed = state.error != null) { entered ->
                val completed = entered.length == CODE_LENGTH && code.length < CODE_LENGTH
                code = entered
                // The sixth digit is the commit: no need to reach for the button.
                if (completed && address.isNotBlank() && !state.busy) onConnect(address, entered)
            }
            if (state.error != null) {
                Text(state.error, Modifier.padding(top = 12.dp), style = OrbitType.bodyS, color = c.danger)
            }

            Spacer(Modifier.height(OrbitDimens.section))
            PrimaryButton(
                text = "Connect",
                onClick = { onConnect(address, code) },
                enabled = address.isNotBlank() && code.length == CODE_LENGTH,
                loading = state.busy,
            )
            Spacer(Modifier.height(24.dp))
        }
    }
}

/** Six boxes, grouped three and three the way the hub prints the code. */
@Composable
private fun CodeField(code: String, failed: Boolean, onChange: (String) -> Unit) {
    val c = Orbit.colors
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()
    val shape = RoundedCornerShape(OrbitDimens.radiusS)
    BasicTextField(
        value = code,
        onValueChange = { input -> onChange(input.filter(Char::isDigit).take(CODE_LENGTH)) },
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
        interactionSource = interaction,
        decorationBox = {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                repeat(CODE_LENGTH) { index ->
                    if (index > 0) Spacer(Modifier.width(if (index == CODE_LENGTH / 2) 20.dp else 8.dp))
                    val active = focused && index == code.length.coerceAtMost(CODE_LENGTH - 1)
                    Box(
                        Modifier
                            .weight(1f)
                            .height(56.dp)
                            .clip(shape)
                            .background(c.surfaceRaised)
                            .border(
                                1.dp,
                                when {
                                    failed -> c.danger
                                    active -> c.text
                                    else -> c.hairline
                                },
                                shape,
                            ),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(code.getOrNull(index)?.toString().orEmpty(), style = OrbitType.monoDigit, color = c.text)
                    }
                }
            }
        },
    )
}
