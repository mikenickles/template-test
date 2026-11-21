package dev.orbit.app.ui.screens

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.orbit.app.data.UsageSummary
import dev.orbit.app.ui.AppState
import dev.orbit.app.ui.UpdateStatus
import dev.orbit.app.ui.components.DangerRow
import dev.orbit.app.ui.components.Hairline
import dev.orbit.app.ui.components.OrbitCard
import dev.orbit.app.ui.components.OrbitIcon
import dev.orbit.app.ui.components.ScreenBar
import dev.orbit.app.ui.components.SectionTitle
import dev.orbit.app.ui.components.PcUpdateCard
import dev.orbit.app.ui.components.UpdateCard
import dev.orbit.app.ui.components.StatusDot
import dev.orbit.app.ui.components.tap
import dev.orbit.app.ui.theme.Orbit
import dev.orbit.app.ui.theme.OrbitDimens
import dev.orbit.app.ui.theme.OrbitType
import dev.orbit.app.ui.theme.entrance
import dev.orbit.app.ui.theme.rememberEntrances
import androidx.compose.foundation.layout.Arrangement

@Composable
fun SettingsScreen(
    state: AppState,
    hubAddress: String,
    onUnpair: () -> Unit,
    onBack: () -> Unit,
    onOpenProvider: (providerId: String) -> Unit = {},
    onRemoveFolder: (folderId: String) -> Unit = {},
    usage: UsageSummary? = null,
    onOpenUsage: () -> Unit = {},
    onOpenAbout: () -> Unit = {},
    installedVersion: String = "",
    updateStatus: UpdateStatus = UpdateStatus.Idle,
    onUpdate: () -> Unit = {},
    pcUpdating: String? = null,
    onUpdatePc: () -> Unit = {},
    onCheckUpdates: () -> Unit = {},
    onOpenProactive: () -> Unit = {},
    onDisconnectGoogle: () -> Unit = {},
) {
    val c = Orbit.colors
    val uri = LocalUriHandler.current
    val scroll = rememberScrollState()
    val entrances = rememberEntrances()
    val remote = state.hub.remote
    val throughTailscale = remote.any { hubAddress.endsWith("//$it") }
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
                            if (online) {
                                Text(
                                    if (throughTailscale) "Connected through Tailscale" else "Connected on your home network",
                                    Modifier.padding(top = 2.dp),
                                    style = OrbitType.bodyS,
                                    color = c.textTertiary,
                                )
                            }
                        }
                        Status(if (online) "Online" else "Unreachable", if (online) c.live else c.danger)
                    }
                    // Away from home: Tailscale on the PC and the phone lets Orbit reach the hub from anywhere.
                    Hairline()
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .then(if (remote.isEmpty()) Modifier.tap(RectangleShape, 0.985f) { runCatching { uri.openUri(TAILSCALE_URL) } } else Modifier)
                            .padding(start = OrbitDimens.rowPad, end = if (remote.isEmpty()) 8.dp else OrbitDimens.rowPad)
                            .heightIn(min = 56.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(Modifier.weight(1f).padding(vertical = 10.dp)) {
                            Text("Away from home", style = OrbitType.bodyM, color = c.textSecondary)
                            remote.firstOrNull()?.let { Text(it, style = OrbitType.mono, color = c.textTertiary) }
                        }
                        if (remote.isEmpty()) {
                            Status("Set up", null)
                            OrbitIcon(OrbitIcon.Chevron, Modifier.padding(start = 4.dp), size = 18.dp, tint = c.textTertiary)
                        } else {
                            Status("Tailscale", c.live)
                        }
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

            if (state.loaded && remote.isEmpty()) {
                Text(
                    "To use Treehouse away from home, install Tailscale on your PC and this phone and sign in to both with the " +
                        "same account. The hub picks it up within a minute.",
                    Modifier.padding(top = OrbitDimens.labelGap),
                    style = OrbitType.bodyS,
                    color = c.textTertiary,
                )
            }

            Column(Modifier.entrance(entrances, "providers", 1)) {
                SectionTitle("Updates", Modifier.padding(top = OrbitDimens.section, bottom = 8.dp))
                val updates = state.updates
                val appUpdate = state.appUpdate(installedVersion)
                val pcUpdate = state.pcUpdate ?: pcUpdating
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    // The PC first: the phone's update is offered once the PC is on the new version.
                    if (pcUpdate != null) PcUpdateCard(pcUpdate, pcUpdating != null, onUpdatePc)
                    if (appUpdate != null) UpdateCard(appUpdate, updateStatus, onUpdate)
                    if (pcUpdate == null && appUpdate == null) {
                        OrbitCard(Modifier.fillMaxWidth()) {
                            Column(Modifier.padding(start = OrbitDimens.rowPad, end = OrbitDimens.rowPad, top = 14.dp, bottom = 14.dp)) {
                                Text("Up to date", style = OrbitType.titleS, color = c.text)
                                Text(
                                    "Version $installedVersion on this phone${if (state.hub.version.isNotBlank()) ", ${state.hub.version} on your PC" else ""}.",
                                    Modifier.padding(top = 2.dp),
                                    style = OrbitType.bodyS,
                                    color = c.textSecondary,
                                )
                            }
                        }
                    }
                }
                if (updates.feed.enabled) {
                    Row(Modifier.padding(top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            when {
                                updates.feed.checking -> "Looking in your Google Drive…"
                                updates.feed.error != null -> updates.feed.error
                                updates.feed.checkedAt != null -> {
                                    val ago = relativeTime(updates.feed.checkedAt, System.currentTimeMillis())
                                    val last = when {
                                        ago == "now" -> "just now"
                                        ago.last().isDigit() || ago.endsWith("m") || ago.endsWith("h") -> "$ago ago"
                                        else -> "on $ago"
                                    }
                                    "Your PC checks your Google Drive every few hours. Last checked $last."
                                }
                                else -> "Your PC checks your Google Drive for new versions every few hours."
                            },
                            Modifier.weight(1f).padding(vertical = 8.dp),
                            style = OrbitType.bodyS,
                            color = if (updates.feed.error != null) c.danger else c.textTertiary,
                        )
                        Text(
                            "Check now",
                            Modifier.tap(CircleShape, 0.92f, onCheckUpdates).padding(horizontal = 12.dp, vertical = 10.dp),
                            style = OrbitType.label,
                            color = c.text,
                        )
                    }
                }

                SectionTitle("About you", Modifier.padding(top = OrbitDimens.section, bottom = 8.dp))
                OrbitCard(Modifier.fillMaxWidth(), onClick = onOpenAbout) {
                    Row(
                        Modifier.fillMaxWidth().padding(start = OrbitDimens.rowPad, end = 8.dp).heightIn(min = 56.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(Modifier.weight(1f).padding(vertical = 12.dp)) {
                            Text(state.profile.name.ifBlank { "What your crew knows" }, style = OrbitType.titleS, color = c.text)
                            Text(
                                when (val n = state.profile.notes.size) {
                                    0 -> "Nothing yet. Your crew is still getting to know you."
                                    1 -> "1 thing every agent knows about you"
                                    else -> "$n things every agent knows about you"
                                },
                                Modifier.padding(top = 2.dp),
                                style = OrbitType.bodyS,
                                color = c.textSecondary,
                            )
                        }
                        OrbitIcon(OrbitIcon.Chevron, Modifier.padding(start = 4.dp), size = 18.dp, tint = c.textTertiary)
                    }
                }

                SectionTitle("Proactive", Modifier.padding(top = OrbitDimens.section, bottom = 8.dp))
                OrbitCard(Modifier.fillMaxWidth(), onClick = onOpenProactive) {
                    Row(
                        Modifier.fillMaxWidth().padding(start = OrbitDimens.rowPad, end = 8.dp).heightIn(min = 56.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        OrbitIcon(OrbitIcon.Bell, size = 20.dp, tint = c.text)
                        Column(Modifier.weight(1f).padding(start = 14.dp, top = 12.dp, bottom = 12.dp)) {
                            Text("Your crew, on its own", style = OrbitType.titleS, color = c.text)
                            Text(describeProactive(state.proactive, state.agents), Modifier.padding(top = 2.dp), style = OrbitType.bodyS, color = c.textSecondary)
                        }
                        OrbitIcon(OrbitIcon.Chevron, Modifier.padding(start = 4.dp), size = 18.dp, tint = c.textTertiary)
                    }
                }

                SectionTitle("Google", Modifier.padding(top = OrbitDimens.section, bottom = 8.dp))
                OrbitCard(Modifier.fillMaxWidth()) {
                    Row(
                        Modifier.fillMaxWidth().padding(start = OrbitDimens.rowPad, end = 6.dp).heightIn(min = 60.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        OrbitIcon(OrbitIcon.Mail, size = 20.dp, tint = c.text)
                        Column(Modifier.weight(1f).padding(start = 14.dp, end = 8.dp, top = 12.dp, bottom = 12.dp)) {
                            Text(if (state.google.connected) state.google.email.ifBlank { "Connected" } else "Not connected", style = OrbitType.titleS, color = c.text)
                            Text(
                                if (state.google.connected) "Gmail, Calendar and Drive" else "Gmail, Calendar and Drive for your agents",
                                Modifier.padding(top = 2.dp),
                                style = OrbitType.bodyS,
                                color = c.textSecondary,
                            )
                        }
                        if (state.google.connected) {
                            Text(
                                "Disconnect",
                                Modifier.tap(CircleShape, 0.94f, onDisconnectGoogle).padding(horizontal = 10.dp, vertical = 12.dp),
                                style = OrbitType.label,
                                color = c.textSecondary,
                            )
                        }
                    }
                }
                Text(
                    if (state.google.connected) {
                        "Agents with Use your Google account turned on can search and read your email and save drafts (never send), " +
                            "check your calendar and add events, and read your Drive."
                    } else {
                        "Connect it from your PC: open localhost:${hubPort(hubAddress)} in a browser there, then Settings, then Google. " +
                            "It stays on your PC; nothing about your account is stored on this phone."
                    },
                    Modifier.padding(top = OrbitDimens.labelGap),
                    style = OrbitType.bodyS,
                    color = c.textTertiary,
                )

                SectionTitle("Model providers", Modifier.padding(top = OrbitDimens.section, bottom = 8.dp))
                OrbitCard(Modifier.fillMaxWidth()) {
                    Column {
                        state.providers.forEachIndexed { index, provider ->
                            if (index > 0) Hairline()
                            // Providers that take a key open a screen to add or change it; local ones, to get models.
                            val opens = provider.takesKey || provider.local
                            Row(
                                Modifier
                                    .fillMaxWidth()
                                    .then(if (opens) Modifier.tap(RectangleShape, 0.985f) { onOpenProvider(provider.id) } else Modifier)
                                    .padding(start = OrbitDimens.rowPad, end = if (opens) 8.dp else OrbitDimens.rowPad)
                                    .heightIn(min = 56.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Column(Modifier.weight(1f)) {
                                    Text(provider.label, style = OrbitType.titleS, color = c.text)
                                    provider.keyHint?.let { Text("Key $it", style = OrbitType.mono, color = c.textTertiary) }
                                }
                                val download = provider.download
                                when {
                                    provider.id == "demo" -> Status("Built in", null)
                                    download != null && download.error == null -> Status("Downloading ${download.percent}%", null)
                                    provider.configured -> Status("Ready", c.live)
                                    provider.takesKey -> Status("Add key", null)
                                    provider.running == true -> Status("Get a model", null)
                                    else -> Status("Not running", null)
                                }
                                if (opens) {
                                    OrbitIcon(OrbitIcon.Chevron, Modifier.padding(start = 4.dp), size = 18.dp, tint = c.textTertiary)
                                }
                            }
                        }
                    }
                }
                Text(
                    "Tap a provider to add its key, or a local one to download models. Keys are checked with the provider, then stored only on your PC.",
                    Modifier.padding(top = OrbitDimens.labelGap),
                    style = OrbitType.bodyS,
                    color = c.textTertiary,
                )

                SectionTitle("Usage", Modifier.padding(top = OrbitDimens.section, bottom = 8.dp))
                OrbitCard(Modifier.fillMaxWidth(), onClick = onOpenUsage) {
                    Row(
                        Modifier.fillMaxWidth().padding(start = OrbitDimens.rowPad, end = 8.dp).heightIn(min = 56.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text("Last ${usage?.days ?: 30} days", Modifier.weight(1f), style = OrbitType.bodyM, color = c.textSecondary)
                        usage?.total?.let { total ->
                            Text(
                                if (total.cost > 0) formatCost(total.cost) else "${formatTokens(total.tokens)} tokens",
                                style = OrbitType.titleS,
                                color = c.text,
                            )
                        }
                        OrbitIcon(OrbitIcon.Chevron, Modifier.padding(start = 4.dp), size = 18.dp, tint = c.textTertiary)
                    }
                }

                SectionTitle("Shared folders", Modifier.padding(top = OrbitDimens.section, bottom = 8.dp))
                OrbitCard(Modifier.fillMaxWidth()) {
                    Column {
                        if (state.folders.isEmpty()) {
                            Row(Modifier.padding(OrbitDimens.rowPad), verticalAlignment = Alignment.CenterVertically) {
                                OrbitIcon(OrbitIcon.Folder, size = 20.dp, tint = c.textTertiary)
                                Text("No folders shared yet", Modifier.padding(start = 14.dp), style = OrbitType.bodyM, color = c.textSecondary)
                            }
                        }
                        state.folders.forEachIndexed { index, folder ->
                            if (index > 0) Hairline()
                            Row(
                                Modifier.fillMaxWidth().heightIn(min = 60.dp).padding(start = OrbitDimens.rowPad, end = 6.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                OrbitIcon(OrbitIcon.Folder, size = 20.dp, tint = c.text)
                                Column(Modifier.weight(1f).padding(start = 14.dp, end = 8.dp, top = 10.dp, bottom = 10.dp)) {
                                    Text(folder.name, style = OrbitType.titleS, color = c.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    Text(folder.path, style = OrbitType.mono, color = c.textTertiary, maxLines = 1, overflow = TextOverflow.MiddleEllipsis)
                                }
                                Text(
                                    "Stop sharing",
                                    Modifier.tap(CircleShape, 0.94f) { onRemoveFolder(folder.id) }.padding(horizontal = 10.dp, vertical = 12.dp),
                                    style = OrbitType.label,
                                    color = c.textSecondary,
                                )
                            }
                        }
                    }
                }
                Text(
                    "Agents with Read your files turned on can read these, never change them. To share a folder, open " +
                        "localhost:${hubPort(hubAddress)} in a browser on your PC.",
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

private const val TAILSCALE_URL = "https://tailscale.com/download"

/** The port in a hub address like "http://192.168.1.20:8787", which the PC's own page shares. */
private fun hubPort(address: String): String = address.substringAfterLast(':', "").takeIf { p -> p.all { it.isDigit() } && p.isNotEmpty() } ?: "8787"

/** A state with its dot. Without a color it is a quiet note, not a status. */
@Composable
private fun Status(label: String, color: Color?) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        if (color != null) StatusDot(color, Modifier.padding(end = 8.dp), size = 7.dp)
        Text(label, style = OrbitType.label, color = color ?: Orbit.colors.textTertiary)
    }
}
