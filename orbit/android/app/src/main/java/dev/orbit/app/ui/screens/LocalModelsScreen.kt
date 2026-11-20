package dev.orbit.app.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
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
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import dev.orbit.app.data.ModelSuggestion
import dev.orbit.app.data.Provider
import dev.orbit.app.ui.components.FieldLabel
import dev.orbit.app.ui.components.Hairline
import dev.orbit.app.ui.components.OrbitCard
import dev.orbit.app.ui.components.OrbitField
import dev.orbit.app.ui.components.Pill
import dev.orbit.app.ui.components.ScreenBar
import dev.orbit.app.ui.components.SectionTitle
import dev.orbit.app.ui.components.StatusDot
import dev.orbit.app.ui.components.tap
import dev.orbit.app.ui.theme.Orbit
import dev.orbit.app.ui.theme.OrbitDimens
import dev.orbit.app.ui.theme.OrbitType
import kotlinx.coroutines.delay

/** Ollama lists "llama3.2" as "llama3.2:latest"; both name the same model. */
private fun sameModel(a: String, b: String) = (if (':' in a) a else "$a:latest") == (if (':' in b) b else "$b:latest")

/**
 * A model runtime on the PC itself (Ollama): whether it is running, which models it has, and a few
 * small ones to download with a tap. Refreshes itself while open, quickly while a download runs.
 */
@Composable
fun LocalModelsScreen(
    provider: Provider,
    onDownload: (model: String, onResult: (error: String?) -> Unit) -> Unit,
    onDismissError: () -> Unit,
    onRefresh: () -> Unit,
    onBack: () -> Unit,
) {
    val c = Orbit.colors
    val scroll = rememberScrollState()
    val running = provider.running == true
    val download = provider.download
    val downloading = download != null && download.error == null
    var custom by rememberSaveable { mutableStateOf("") }
    var starting by remember { mutableStateOf(false) }
    var startError by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(downloading, running) {
        while (true) {
            delay(if (downloading) 1000 else 4000)
            onRefresh()
        }
    }

    fun get(model: String) {
        if (!running || starting || downloading || model.isBlank()) return
        starting = true
        startError = null
        onDownload(model.trim()) { error ->
            starting = false
            startError = error
            if (error == null) custom = ""
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
                                !running -> "Not running on your PC"
                                provider.models.isEmpty() -> "Running, with no models yet"
                                else -> "Ready"
                            },
                            style = OrbitType.titleS,
                            color = c.text,
                        )
                        Text(
                            when {
                                !running -> "${provider.label.substringBefore(" (")} runs AI models on your PC, free and private. " +
                                    "On the PC, install it from ${provider.installUrl?.removePrefix("https://") ?: "its website"} and open it. " +
                                    "This page notices within a few seconds."
                                provider.models.isEmpty() -> "Download a model below. It stays on your PC."
                                provider.models.size == 1 -> "1 model on your PC. Pick it in an agent's Model section."
                                else -> "${provider.models.size} models on your PC. Pick one in an agent's Model section."
                            },
                            Modifier.padding(top = 2.dp),
                            style = OrbitType.bodyS,
                            color = c.textSecondary,
                        )
                    }
                }
            }

            if (provider.models.isNotEmpty()) {
                SectionTitle("On your PC", Modifier.padding(top = OrbitDimens.section, bottom = 8.dp))
                OrbitCard(Modifier.fillMaxWidth()) {
                    Column {
                        provider.models.forEachIndexed { index, model ->
                            if (index > 0) Hairline()
                            Text(model, Modifier.padding(horizontal = OrbitDimens.rowPad, vertical = 16.dp), style = OrbitType.mono, color = c.text)
                        }
                    }
                }
            }

            if (provider.suggestions.isNotEmpty()) {
                SectionTitle("Download a small model", Modifier.padding(top = OrbitDimens.section, bottom = 8.dp))
                OrbitCard(Modifier.fillMaxWidth()) {
                    Column {
                        provider.suggestions.forEachIndexed { index, suggestion ->
                            if (index > 0) Hairline()
                            SuggestionRow(
                                suggestion,
                                installed = provider.models.any { sameModel(it, suggestion.model) },
                                percent = download?.takeIf { downloading && sameModel(it.model, suggestion.model) }?.percent,
                                enabled = running && !downloading && !starting,
                                onGet = { get(suggestion.model) },
                            )
                        }
                    }
                }

                // A download of a model that isn't in the list above shows here.
                if (downloading && provider.suggestions.none { sameModel(it.model, download!!.model) }) {
                    Progress(download!!.model, download.percent, Modifier.padding(top = 14.dp))
                }

                Spacer(Modifier.height(20.dp))
                FieldLabel("Or any model from ollama.com/library")
                OrbitField(
                    value = custom,
                    onValueChange = {
                        custom = it.take(120)
                        startError = null
                    },
                    placeholder = "e.g. qwen3:4b",
                    textStyle = OrbitType.monoL,
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.None, autoCorrectEnabled = false),
                    trailing = {
                        Text(
                            "Download",
                            Modifier
                                .tap(CircleShape, 0.92f) { get(custom) }
                                .padding(horizontal = 14.dp, vertical = 12.dp),
                            style = OrbitType.label,
                            color = if (running && custom.isNotBlank() && !downloading) c.text else c.textTertiary,
                        )
                    },
                )
            }

            val error = startError ?: download?.error
            AnimatedVisibility(error != null, enter = expandVertically() + fadeIn(), exit = shrinkVertically() + fadeOut()) {
                Row(Modifier.padding(top = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(error.orEmpty(), Modifier.weight(1f), style = OrbitType.bodyS, color = c.danger)
                    if (startError == null) {
                        Text(
                            "Dismiss",
                            Modifier.tap(CircleShape, 0.92f, onDismissError).padding(horizontal = 12.dp, vertical = 8.dp),
                            style = OrbitType.label,
                            color = c.textSecondary,
                        )
                    }
                }
            }

            Text(
                "Local models run on your PC's own processor: free and private, but slower than online ones and not as " +
                    "clever. They can't search the web, run code or read your folders. A model needs about twice its " +
                    "download size in free memory.",
                Modifier.padding(top = 20.dp),
                style = OrbitType.bodyS,
                color = c.textTertiary,
            )
        }
    }
}

@Composable
private fun SuggestionRow(suggestion: ModelSuggestion, installed: Boolean, percent: Int?, enabled: Boolean, onGet: () -> Unit) {
    val c = Orbit.colors
    Column(Modifier.fillMaxWidth().heightIn(min = 64.dp).padding(start = OrbitDimens.rowPad, end = 12.dp, top = 12.dp, bottom = 12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f).padding(end = 10.dp)) {
                Text(suggestion.label, style = OrbitType.titleS, color = c.text)
                Text("${suggestion.size} · ${suggestion.note}", Modifier.padding(top = 2.dp), style = OrbitType.bodyS, color = c.textSecondary)
            }
            when {
                installed -> Text("On your PC", style = OrbitType.label, color = c.live)
                percent != null -> Text("$percent%", style = OrbitType.label, color = c.text)
                else -> Pill("Get", onGet, dimmed = !enabled)
            }
        }
        if (percent != null) Progress(null, percent, Modifier.padding(top = 10.dp, end = 4.dp))
    }
}

@Composable
private fun Progress(model: String?, percent: Int, modifier: Modifier = Modifier) {
    val c = Orbit.colors
    Column(modifier.fillMaxWidth()) {
        if (model != null) Text("Downloading $model · $percent%", Modifier.padding(bottom = 8.dp), style = OrbitType.bodyS, color = c.textSecondary)
        Box(Modifier.fillMaxWidth().height(6.dp).clip(CircleShape).background(c.surfaceHigh)) {
            Box(Modifier.fillMaxWidth((percent / 100f).coerceIn(0.02f, 1f)).fillMaxHeight().clip(CircleShape).background(c.primary))
        }
    }
}
