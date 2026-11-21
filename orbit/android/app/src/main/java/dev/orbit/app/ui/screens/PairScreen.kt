package dev.orbit.app.ui.screens

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.togetherWith
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
import dev.orbit.app.ui.components.FieldLabel
import dev.orbit.app.ui.components.Hairline
import dev.orbit.app.ui.components.LogoMark
import dev.orbit.app.ui.components.OrbitField
import dev.orbit.app.ui.components.OrbitSpinner
import dev.orbit.app.ui.components.Pill
import dev.orbit.app.ui.components.PrimaryButton
import dev.orbit.app.ui.components.SecondaryButton
import dev.orbit.app.ui.components.TreehouseScene
import dev.orbit.app.ui.components.tap
import dev.orbit.app.ui.theme.Orbit
import dev.orbit.app.ui.theme.OrbitDimens
import dev.orbit.app.ui.theme.OrbitMotion
import dev.orbit.app.ui.theme.OrbitType
import dev.orbit.app.ui.theme.Shake
import dev.orbit.app.ui.theme.entrance
import dev.orbit.app.ui.theme.rememberEntrances
import dev.orbit.app.ui.theme.rememberHaptics
import dev.orbit.app.ui.theme.shake

/** The sample crew shown where there are no real agents yet. */
val SampleCrew = listOf(
    AvatarSpec(character = 9),
    AvatarSpec(character = 7),
    AvatarSpec(character = 2),
    AvatarSpec(character = 14),
    AvatarSpec(character = 6),
)

private const val CODE_LENGTH = 6

@Composable
fun PairScreen(
    state: PairState,
    onFind: () -> Unit,
    onConnect: (address: String, code: String) -> Unit,
    onScan: () -> Unit = {},
) {
    val c = Orbit.colors
    val haptics = rememberHaptics()
    val entrances = rememberEntrances()
    var address by rememberSaveable { mutableStateOf("") }
    var code by rememberSaveable { mutableStateOf("") }
    val shake = remember { Shake() }

    // A single hub on the network is almost certainly the one they want.
    LaunchedEffect(state.found) {
        val only = state.found?.singleOrNull()
        if (address.isBlank() && only != null) {
            address = only.address
            haptics.tick()
        }
    }
    // A scanned code fills the fields, so it's clear what's being tried.
    LaunchedEffect(state.scanned) {
        state.scanned?.let {
            address = it.host
            code = it.code
        }
    }
    // A wrong code shakes the boxes, then clears them for another try.
    LaunchedEffect(state.error) {
        if (state.error != null) {
            haptics.reject()
            shake.play()
            code = ""
        }
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
                Text("Treehouse", Modifier.padding(start = 8.dp), style = OrbitType.titleM, color = c.text)
            }

            // The crew at home in the treehouse, waiting for you.
            TreehouseScene(Modifier.fillMaxWidth().padding(top = 12.dp, bottom = 20.dp).height(280.dp).entrance(entrances, "hero", 0))

            Text("Pair with your hub", Modifier.entrance(entrances, "title", 1), style = OrbitType.display, color = c.text)
            Spacer(Modifier.height(10.dp))
            Text(
                "Double-click Start Orbit on your PC. It shows a QR code: scan it here, and you're in.",
                Modifier.entrance(entrances, "body", 2),
                style = OrbitType.body,
                color = c.textSecondary,
            )

            Column(Modifier.entrance(entrances, "scan", 3)) {
                Spacer(Modifier.height(28.dp))
                PrimaryButton("Scan QR code", onScan, loading = state.busy)
                AnimatedVisibility(state.error != null, enter = expandVertically() + fadeIn(), exit = shrinkVertically() + fadeOut()) {
                    Text(state.error.orEmpty(), Modifier.padding(top = 12.dp), style = OrbitType.bodyS, color = c.danger)
                }
            }

            Column(Modifier.entrance(entrances, "form", 4)) {
                // Typing it in is the fallback, a step down from scanning.
                Row(Modifier.padding(top = OrbitDimens.section, bottom = 20.dp), verticalAlignment = Alignment.CenterVertically) {
                    Hairline(Modifier.weight(1f))
                    Text("or enter it yourself", Modifier.padding(horizontal = 12.dp), style = OrbitType.caption, color = c.textTertiary)
                    Hairline(Modifier.weight(1f))
                }
                FieldLabel("Hub address")
                OrbitField(
                    value = address,
                    onValueChange = { address = it },
                    placeholder = "192.168.1.20:8787",
                    textStyle = OrbitType.monoL,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                    trailing = {
                        Box(Modifier.size(width = 64.dp, height = 44.dp).tap(CircleShape, 0.92f, onFind), contentAlignment = Alignment.Center) {
                            AnimatedContent(state.finding, transitionSpec = { fadeIn() togetherWith fadeOut() }, label = "find") { finding ->
                                if (finding) OrbitSpinner(c.textSecondary, size = 18.dp) else Text("Find", style = OrbitType.label, color = c.text)
                            }
                        }
                    },
                )
                val found = state.found
                AnimatedVisibility(found != null && found.isEmpty(), enter = expandVertically() + fadeIn(), exit = shrinkVertically() + fadeOut()) {
                    Text(
                        "No hub answered on this Wi‑Fi. Type the address your PC shows.",
                        Modifier.padding(top = 10.dp),
                        style = OrbitType.bodyS,
                        color = c.textSecondary,
                    )
                }
                AnimatedVisibility(
                    found != null && (found.size > 1 || found.firstOrNull()?.address != address) && found.isNotEmpty(),
                    enter = expandVertically() + fadeIn(),
                    exit = shrinkVertically() + fadeOut(),
                ) {
                    Row(Modifier.padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        for (hub in found.orEmpty().take(3)) Pill(hub.name, onClick = { address = hub.address })
                    }
                }

                Spacer(Modifier.height(24.dp))
                FieldLabel("Pairing code")
                // The boxes stay red after a wrong code only until you start typing the next one.
                CodeField(code, failed = state.error != null && code.isEmpty(), modifier = Modifier.shake(shake)) { entered ->
                    val completed = entered.length == CODE_LENGTH && code.length < CODE_LENGTH
                    code = entered
                    // The sixth digit is the commit: no need to reach for the button.
                    if (completed && address.isNotBlank() && !state.busy) onConnect(address, entered)
                }

                Spacer(Modifier.height(24.dp))
                SecondaryButton(
                    text = "Connect",
                    onClick = { onConnect(address, code) },
                    enabled = address.isNotBlank() && code.length == CODE_LENGTH && !state.busy,
                )
                Spacer(Modifier.height(24.dp))
            }
        }
    }
}

/** Six boxes, grouped three and three the way the hub prints the code. Digits pop in as they're typed. */
@Composable
private fun CodeField(code: String, failed: Boolean, modifier: Modifier = Modifier, onChange: (String) -> Unit) {
    val c = Orbit.colors
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()
    val shape = RoundedCornerShape(OrbitDimens.radiusS)
    BasicTextField(
        value = code,
        onValueChange = { input -> onChange(input.filter(Char::isDigit).take(CODE_LENGTH)) },
        modifier = modifier,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
        interactionSource = interaction,
        decorationBox = {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                repeat(CODE_LENGTH) { index ->
                    if (index > 0) Spacer(Modifier.width(if (index == CODE_LENGTH / 2) 20.dp else 8.dp))
                    val active = focused && index == code.length.coerceAtMost(CODE_LENGTH - 1)
                    val edge by animateColorAsState(
                        when {
                            failed -> c.danger
                            active -> c.text
                            else -> c.hairline
                        },
                        OrbitMotion.snappy(),
                        label = "edge",
                    )
                    Box(
                        Modifier
                            .weight(1f)
                            .height(56.dp)
                            .clip(shape)
                            .background(c.surfaceRaised)
                            .border(if (active) 1.5.dp else 1.dp, edge, shape),
                        contentAlignment = Alignment.Center,
                    ) {
                        AnimatedContent(
                            code.getOrNull(index),
                            transitionSpec = { scaleIn(OrbitMotion.bouncy(), initialScale = 0.4f) + fadeIn() togetherWith fadeOut() },
                            label = "digit",
                        ) { digit ->
                            Text(digit?.toString().orEmpty(), style = OrbitType.monoDigit, color = c.text)
                        }
                    }
                }
            }
        },
    )
}
