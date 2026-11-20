package dev.orbit.app.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
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
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import dev.orbit.app.data.Provider
import dev.orbit.app.ui.components.DangerRow
import dev.orbit.app.ui.components.FieldLabel
import dev.orbit.app.ui.components.OrbitCard
import dev.orbit.app.ui.components.OrbitField
import dev.orbit.app.ui.components.PrimaryButton
import dev.orbit.app.ui.components.ScreenBar
import dev.orbit.app.ui.components.StatusDot
import dev.orbit.app.ui.components.tap
import dev.orbit.app.ui.theme.Orbit
import dev.orbit.app.ui.theme.OrbitDimens
import dev.orbit.app.ui.theme.OrbitType
import dev.orbit.app.ui.theme.Shake
import dev.orbit.app.ui.theme.rememberHaptics
import dev.orbit.app.ui.theme.shake
import kotlinx.coroutines.launch

/**
 * Add or replace a provider's API key from the phone. The hub checks the key with the provider
 * before saving it, so a typo never replaces a key that works. Keys are stored only on the PC.
 */
@Composable
fun ProviderKeyScreen(
    provider: Provider,
    onSave: (apiKey: String, onResult: (error: String?) -> Unit) -> Unit,
    onRemove: () -> Unit,
    onBack: () -> Unit,
) {
    val c = Orbit.colors
    val haptics = rememberHaptics()
    val uri = LocalUriHandler.current
    val scope = rememberCoroutineScope()
    val shake = remember { Shake() }
    var key by rememberSaveable { mutableStateOf("") }
    var visible by rememberSaveable { mutableStateOf(false) }
    var checking by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scroll = rememberScrollState()

    fun save() {
        if (key.isBlank() || checking) return
        checking = true
        error = null
        onSave(key.trim()) { problem ->
            checking = false
            error = problem
            if (problem != null) {
                haptics.reject()
                scope.launch { shake.play() }
            }
        }
    }

    Scaffold(containerColor = c.bg, topBar = { ScreenBar(provider.label, onBack, scrolled = scroll.value > 0) }) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .imePadding()
                .verticalScroll(scroll)
                .padding(start = OrbitDimens.gutter, end = OrbitDimens.gutter, top = 12.dp, bottom = 48.dp),
        ) {
            OrbitCard(Modifier.fillMaxWidth()) {
                Row(Modifier.padding(OrbitDimens.rowPad), verticalAlignment = Alignment.CenterVertically) {
                    StatusDot(if (provider.configured) c.live else c.textTertiary, size = 7.dp)
                    Column(Modifier.padding(start = 12.dp)) {
                        Text(
                            when {
                                !provider.configured -> "No key yet"
                                provider.keySource == "app" -> "Ready"
                                else -> "Ready, using a key set on your PC"
                            },
                            style = OrbitType.titleS,
                            color = c.text,
                        )
                        Text(
                            when {
                                !provider.configured -> "Agents on ${provider.label} can't reply until you add one."
                                provider.keyHint != null -> "Key ending ${provider.keyHint.removePrefix("…")}, added from your phone."
                                else -> "Adding a key here will replace it."
                            },
                            Modifier.padding(top = 2.dp),
                            style = OrbitType.bodyS,
                            color = c.textSecondary,
                        )
                    }
                }
            }

            Spacer(Modifier.height(OrbitDimens.section))
            FieldLabel(if (provider.configured) "Replace the key" else "API key")
            OrbitField(
                value = key,
                onValueChange = {
                    key = it
                    error = null
                },
                placeholder = "Paste your ${provider.label} key",
                modifier = Modifier.shake(shake),
                textStyle = OrbitType.monoL,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, autoCorrectEnabled = false),
                visualTransformation = if (visible) VisualTransformation.None else PasswordVisualTransformation(),
                trailing = {
                    Text(
                        if (visible) "Hide" else "Show",
                        Modifier.tap(CircleShape, 0.92f) { visible = !visible }.padding(horizontal = 14.dp, vertical = 12.dp),
                        style = OrbitType.label,
                        color = c.textSecondary,
                    )
                },
            )
            AnimatedVisibility(error != null, enter = expandVertically() + fadeIn(), exit = shrinkVertically() + fadeOut()) {
                Text(error.orEmpty(), Modifier.padding(top = 10.dp), style = OrbitType.bodyS, color = c.danger)
            }
            Text(
                "Orbit checks the key with ${provider.label} first, then stores it only on your PC.",
                Modifier.padding(top = 10.dp),
                style = OrbitType.bodyS,
                color = c.textTertiary,
            )

            provider.keyUrl?.let { url ->
                Text(
                    "Get a key from ${url.removePrefix("https://").substringBefore('/')}",
                    Modifier.padding(top = 14.dp).tap(CircleShape, 0.96f) { runCatching { uri.openUri(url) } }.padding(vertical = 6.dp),
                    style = OrbitType.label,
                    color = c.text,
                )
            }

            Spacer(Modifier.height(OrbitDimens.section))
            PrimaryButton(if (checking) "Checking" else "Save key", ::save, enabled = key.isNotBlank(), loading = checking)

            if (provider.keySource == "app") {
                Spacer(Modifier.height(40.dp))
                DangerRow("Remove key", onRemove)
            }
        }
    }
}
