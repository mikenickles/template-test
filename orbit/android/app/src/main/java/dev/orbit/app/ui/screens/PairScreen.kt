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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.orbit.app.data.AvatarSpec
import dev.orbit.app.ui.PairState
import dev.orbit.app.ui.components.AvatarStack
import dev.orbit.app.ui.components.LogoMark
import dev.orbit.app.ui.components.OrbitField
import dev.orbit.app.ui.components.Overline
import dev.orbit.app.ui.components.Pill
import dev.orbit.app.ui.components.PrimaryButton
import dev.orbit.app.ui.theme.Orbit
import dev.orbit.app.ui.theme.OrbitDimens
import dev.orbit.app.ui.theme.OrbitType

/** The sample crew shown where there are no real agents yet. */
val SampleCrew = listOf(
    AvatarSpec(shape = 0, color = 7, eyes = 1),
    AvatarSpec(shape = 1, color = 5, eyes = 5),
    AvatarSpec(shape = 4, color = 2, eyes = 2),
    AvatarSpec(shape = 2, color = 4, eyes = 7),
    AvatarSpec(shape = 3, color = 0, eyes = 3),
)

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
                .padding(horizontal = 24.dp),
        ) {
            Spacer(Modifier.height(20.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                LogoMark(size = 24.dp)
                Text("Orbit", Modifier.padding(start = 8.dp), style = OrbitType.titleM, color = c.text)
            }

            Spacer(Modifier.height(44.dp))
            AvatarStack(SampleCrew, size = 52.dp, max = 5, overlap = -0.16f)
            Spacer(Modifier.height(28.dp))
            Text("Pair with your hub", style = OrbitType.display, color = c.text)
            Spacer(Modifier.height(10.dp))
            Text(
                "Your agents live on your always-on PC and keep working when your phone is asleep.",
                style = OrbitType.body,
                color = c.textSecondary,
            )

            Spacer(Modifier.height(36.dp))
            Overline("Hub address")
            Spacer(Modifier.height(10.dp))
            OrbitField(
                value = address,
                onValueChange = { address = it },
                placeholder = "192.168.1.20:8787",
                textStyle = OrbitType.mono.copy(fontSize = 15.sp, lineHeight = 22.sp),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                trailing = {
                    if (state.finding) {
                        CircularProgressIndicator(Modifier.padding(end = 14.dp).size(16.dp), strokeWidth = 2.dp, color = c.textSecondary)
                    } else {
                        TextButton(onClick = onFind) { Text("Find", style = OrbitType.label, color = c.text) }
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
            Overline("Pairing code")
            Spacer(Modifier.height(10.dp))
            CodeField(code) { code = it }
            if (state.error != null) {
                Text(state.error, Modifier.padding(top = 12.dp), style = OrbitType.bodyM, color = c.danger)
            }

            Spacer(Modifier.height(28.dp))
            PrimaryButton(
                text = "Connect",
                onClick = { onConnect(address, code) },
                enabled = address.isNotBlank() && code.length == CODE_LENGTH,
                loading = state.busy,
            )
            Spacer(Modifier.height(16.dp))
            Text(
                "Start the hub on your PC. It shows this address and a six-digit code.",
                style = OrbitType.bodyS,
                color = c.textTertiary,
            )
            Spacer(Modifier.height(24.dp))
        }
    }
}

private const val CODE_LENGTH = 6

/** Six boxes, grouped three and three the way the hub prints the code. */
@Composable
private fun CodeField(code: String, onChange: (String) -> Unit) {
    val c = Orbit.colors
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()
    val shape = RoundedCornerShape(OrbitDimens.radiusM)
    BasicTextField(
        value = code,
        onValueChange = { input -> onChange(input.filter(Char::isDigit).take(CODE_LENGTH)) },
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
        interactionSource = interaction,
        decorationBox = {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                repeat(CODE_LENGTH) { index ->
                    if (index > 0) Spacer(Modifier.width(if (index == CODE_LENGTH / 2) 18.dp else 8.dp))
                    val active = focused && index == code.length.coerceAtMost(CODE_LENGTH - 1)
                    Box(
                        Modifier
                            .weight(1f)
                            .height(60.dp)
                            .clip(shape)
                            .background(c.surfaceRaised)
                            .border(1.dp, if (active) c.text else c.hairline, shape),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            code.getOrNull(index)?.toString().orEmpty(),
                            style = OrbitType.mono.copy(fontSize = 24.sp, lineHeight = 30.sp, fontWeight = FontWeight.Medium),
                            color = c.text,
                        )
                    }
                }
            }
        },
    )
}
