package dev.orbit.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
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
import dev.orbit.app.ui.components.PcUpdateCard
import dev.orbit.app.ui.components.PrimaryButton
import dev.orbit.app.ui.components.ScreenBar
import dev.orbit.app.ui.components.StatusDot
import dev.orbit.app.ui.components.UpdateCard
import dev.orbit.app.ui.components.tap
import dev.orbit.app.ui.theme.Orbit
import dev.orbit.app.ui.theme.OrbitDimens
import dev.orbit.app.ui.theme.OrbitType
import dev.orbit.app.ui.theme.entrance
import dev.orbit.app.ui.theme.rememberEntrances

/**
 * Settings: a short index that fits on one screen. The hub and its version sit on top, then everything else is one
 * row each, with where it stands, opening its own page.
 */
@Composable
fun SettingsScreen(
    state: AppState,
    hubAddress: String,
    onUnpair: () -> Unit,
    onBack: () -> Unit,
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
    onOpenModels: () -> Unit = {},
    onOpenGoogle: () -> Unit = {},
    onOpenBrowser: () -> Unit = {},
    onOpenFolders: () -> Unit = {},
    onOpenAway: () -> Unit = {},
) {
    val c = Orbit.colors
    val scroll = rememberScrollState()
    val entrances = rememberEntrances()
    Scaffold(containerColor = c.bg, topBar = { ScreenBar("Settings", onBack, scrolled = scroll.value > 0) }) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(scroll)
                .padding(start = OrbitDimens.gutter, end = OrbitDimens.gutter, top = 12.dp, bottom = 48.dp),
        ) {
            HubCard(state, hubAddress, installedVersion, pcUpdating, onCheckUpdates, Modifier.entrance(entrances, "hub", 0))

            // An update grows the top of the page; otherwise it's one line in the hub card.
            val appUpdate = state.appUpdate(installedVersion)
            val pcUpdate = state.pcUpdate ?: pcUpdating
            if (pcUpdate != null || appUpdate != null) {
                Column(Modifier.padding(top = 10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    // The PC first: the phone's update is offered once the PC is on the new version.
                    if (pcUpdate != null) PcUpdateCard(pcUpdate, pcUpdating != null, onUpdatePc)
                    if (appUpdate != null) UpdateCard(appUpdate, updateStatus, onUpdate)
                }
            }

            Column(Modifier.entrance(entrances, "rows", 1)) {
                Group("You") {
                    SettingsRow(
                        OrbitIcon.Person,
                        "About you",
                        when (val n = state.profile.notes.size) {
                            0 -> "Your crew is still getting to know you"
                            1 -> "1 thing your crew knows"
                            else -> "$n things your crew knows"
                        },
                        onOpenAbout,
                    )
                    RowDivider()
                    SettingsRow(OrbitIcon.Bell, "Reaching out", describeProactive(state.proactive, state.agents), onOpenProactive)
                }
                Group("Connections") {
                    val ready = state.providers.filter { it.configured && it.id != "demo" }.map { it.label.substringBefore(" (") }
                    SettingsRow(
                        OrbitIcon.Spark,
                        "AI models",
                        if (ready.isEmpty()) "Add a key to get real answers" else "${joinNames(ready)} ready",
                        onOpenModels,
                        attention = ready.isEmpty(),
                    )
                    RowDivider()
                    SettingsRow(
                        OrbitIcon.Mail,
                        "Google",
                        if (state.google.connected) state.google.email.ifBlank { "Connected" } else "Not connected",
                        onOpenGoogle,
                    )
                    RowDivider()
                    SettingsRow(
                        OrbitIcon.Globe,
                        "Browser",
                        when {
                            !state.browser.available -> "Needs Chrome or Edge on the PC"
                            state.browser.running -> "${state.browser.name ?: "The browser"} is open on the PC"
                            else -> "${state.browser.name ?: "Chrome"} on the PC"
                        },
                        onOpenBrowser,
                    )
                    RowDivider()
                    SettingsRow(
                        OrbitIcon.Folder,
                        "Shared folders",
                        when (val n = state.folders.size) {
                            0 -> "None shared yet"
                            1 -> "1 folder"
                            else -> "$n folders"
                        },
                        onOpenFolders,
                    )
                }
                Group("Hub") {
                    SettingsRow(
                        OrbitIcon.Chart,
                        "Usage",
                        usage?.total?.let { total ->
                            if (total.cost > 0) "${formatCost(total.cost)} in the last ${usage.days} days"
                            else if (total.tokens > 0) "${formatTokens(total.tokens)} tokens in the last ${usage.days} days"
                            else "Nothing in the last ${usage.days} days"
                        } ?: "Spend and tokens, per agent and room",
                        onOpenUsage,
                    )
                    RowDivider()
                    SettingsRow(
                        OrbitIcon.Globe,
                        "Away from home",
                        if (state.hub.remote.isNotEmpty()) "On, through Tailscale" else "Set up Tailscale",
                        onOpenAway,
                    )
                }

                Text(
                    "You can also ask your crew to change things for you, like quiet hours, the morning brief or a room's members.",
                    Modifier.padding(top = OrbitDimens.section, start = 4.dp, end = 4.dp),
                    style = OrbitType.bodyS,
                    color = c.textTertiary,
                )
                Spacer(Modifier.height(OrbitDimens.section))
                DangerRow("Unpair this phone", onUnpair)
            }
        }
    }
}

/** The hub: where it is, whether it's reachable, and which version it runs. Checking for updates lives here too. */
@Composable
private fun HubCard(
    state: AppState,
    hubAddress: String,
    installedVersion: String,
    pcUpdating: String?,
    onCheckUpdates: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val c = Orbit.colors
    val online = state.loaded && !state.offline
    val throughTailscale = state.hub.remote.any { hubAddress.endsWith("//$it") }
    val feed = state.updates.feed
    OrbitCard(modifier.fillMaxWidth()) {
        Column {
            Row(Modifier.padding(OrbitDimens.rowPad), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(state.hub.name.ifEmpty { "Your hub" }, style = OrbitType.titleM, color = c.text)
                    Text(
                        when {
                            !online -> "Can't reach your PC right now"
                            throughTailscale -> "Connected through Tailscale"
                            else -> "Connected on your home network"
                        },
                        Modifier.padding(top = 2.dp),
                        style = OrbitType.bodyS,
                        color = c.textSecondary,
                    )
                }
                Status(if (online) "Online" else "Unreachable", if (online) c.live else c.danger)
            }
            if (state.hub.version.isNotEmpty() || installedVersion.isNotEmpty()) {
                Hairline()
                Row(
                    Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(start = OrbitDimens.rowPad, end = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f).padding(vertical = 10.dp)) {
                        val pc = state.hub.version
                        Text(
                            if (pc.isNotBlank() && installedVersion.isNotBlank() && pc != installedVersion) {
                                "PC $pc · this phone $installedVersion"
                            } else {
                                "Treehouse ${pc.ifBlank { installedVersion }}"
                            },
                            style = OrbitType.bodyM,
                            color = c.text,
                        )
                        val waiting = state.appUpdate(installedVersion) != null || state.pcUpdate != null || pcUpdating != null
                        Text(
                            when {
                                feed.checking -> "Looking in your Google Drive…"
                                feed.error != null -> feed.error
                                waiting -> "An update is ready"
                                feed.checkedAt != null -> "Up to date · checked ${checkedAgo(feed.checkedAt)}"
                                else -> "Up to date"
                            },
                            Modifier.padding(top = 2.dp),
                            style = OrbitType.bodyS,
                            color = if (feed.error != null) c.danger else c.textTertiary,
                        )
                    }
                    if (feed.enabled) {
                        Text(
                            "Check now",
                            Modifier.tap(CircleShape, 0.92f, onCheckUpdates).padding(horizontal = 10.dp, vertical = 12.dp),
                            style = OrbitType.label,
                            color = c.textSecondary,
                        )
                    }
                }
            }
        }
    }
}

/** "just now", "5m ago", "3h ago", "on Tue". */
private fun checkedAgo(at: Long): String {
    val ago = relativeTime(at, System.currentTimeMillis())
    return when {
        ago == "now" -> "just now"
        ago.last().isDigit() || ago.endsWith("m") || ago.endsWith("h") -> "$ago ago"
        else -> "on $ago"
    }
}

/** "Anthropic", "Anthropic and OpenAI", "Anthropic, OpenAI and Gemini". */
private fun joinNames(names: List<String>): String = when (names.size) {
    1 -> names[0]
    else -> names.dropLast(1).joinToString(", ") + " and " + names.last()
}

/** A small heading over one card of rows. */
@Composable
private fun Group(title: String, content: @Composable ColumnScope.() -> Unit) {
    Text(
        title.uppercase(),
        Modifier.padding(start = 4.dp, top = OrbitDimens.section, bottom = 10.dp),
        style = OrbitType.overline,
        color = Orbit.colors.textTertiary,
    )
    OrbitCard(Modifier.fillMaxWidth()) { Column(content = content) }
}

private val RowIcon = 20.dp
private val RowIconGap = 14.dp

/** Rows are parted by a hairline inset to the text, past the icon. */
@Composable
private fun RowDivider() = Hairline(Modifier.padding(start = OrbitDimens.rowPad + RowIcon + RowIconGap))

/** One setting: its icon, its name, where it stands, and the way into its page. */
@Composable
private fun SettingsRow(icon: OrbitIcon, title: String, summary: String, onClick: () -> Unit, attention: Boolean = false) {
    val c = Orbit.colors
    Row(
        Modifier
            .fillMaxWidth()
            .tap(RectangleShape, 0.985f, onClick)
            .heightIn(min = 60.dp)
            .padding(start = OrbitDimens.rowPad, end = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        OrbitIcon(icon, size = RowIcon, tint = c.text)
        Column(Modifier.weight(1f).padding(start = RowIconGap, end = 8.dp, top = 11.dp, bottom = 11.dp)) {
            Text(title, style = OrbitType.titleS, color = c.text)
            Text(
                summary,
                Modifier.padding(top = 2.dp),
                style = OrbitType.bodyS,
                color = if (attention) c.text else c.textSecondary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        OrbitIcon(OrbitIcon.Chevron, size = 18.dp, tint = c.textTertiary)
    }
}

// ---------- The pages behind the rows ----------

/** A settings page: a bar with a back arrow, then its content, scrolling. */
@Composable
private fun SettingsPage(title: String, onBack: () -> Unit, content: @Composable ColumnScope.() -> Unit) {
    val scroll = rememberScrollState()
    Scaffold(containerColor = Orbit.colors.bg, topBar = { ScreenBar(title, onBack, scrolled = scroll.value > 0) }) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(scroll)
                .padding(start = OrbitDimens.gutter, end = OrbitDimens.gutter, top = 12.dp, bottom = 48.dp),
            content = content,
        )
    }
}

@Composable
private fun Note(text: String) = Text(
    text,
    Modifier.padding(top = OrbitDimens.labelGap, start = 4.dp, end = 4.dp),
    style = OrbitType.bodyS,
    color = Orbit.colors.textTertiary,
)

/** The AI providers: add or change a key, or get models for one that runs on the PC. */
@Composable
fun ModelsScreen(state: AppState, onOpenProvider: (providerId: String) -> Unit, onBack: () -> Unit) {
    val c = Orbit.colors
    // Demo is built in and needs nothing; it only shows while an agent still uses it.
    val providers = state.providers.filter { it.id != "demo" || state.agents.any { a -> a.provider == "demo" } }
    SettingsPage("AI models", onBack) {
        OrbitCard(Modifier.fillMaxWidth()) {
            Column {
                providers.forEachIndexed { index, provider ->
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
                        if (opens) OrbitIcon(OrbitIcon.Chevron, Modifier.padding(start = 4.dp), size = 18.dp, tint = c.textTertiary)
                    }
                }
            }
        }
        Note(
            "Tap a provider to add its key, or a local one to download models. Keys are checked with the provider, then " +
                "stored only on your PC. Choose each agent's model on its own page.",
        )
    }
}

/** The user's Google account, which agents with the Google ability use. It's connected on the PC. */
@Composable
fun GoogleScreen(state: AppState, hubAddress: String, onDisconnect: () -> Unit, onBack: () -> Unit) {
    val c = Orbit.colors
    SettingsPage("Google", onBack) {
        OrbitCard(Modifier.fillMaxWidth()) {
            Row(
                Modifier.fillMaxWidth().padding(start = OrbitDimens.rowPad, end = 6.dp).heightIn(min = 60.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                OrbitIcon(OrbitIcon.Mail, size = RowIcon, tint = c.text)
                Column(Modifier.weight(1f).padding(start = RowIconGap, end = 8.dp, top = 12.dp, bottom = 12.dp)) {
                    Text(if (state.google.connected) state.google.email.ifBlank { "Connected" } else "Not connected", style = OrbitType.titleS, color = c.text)
                    Text("Gmail, Calendar and Drive", Modifier.padding(top = 2.dp), style = OrbitType.bodyS, color = c.textSecondary)
                }
                if (state.google.connected) {
                    Text(
                        "Disconnect",
                        Modifier.tap(CircleShape, 0.94f, onDisconnect).padding(horizontal = 10.dp, vertical = 12.dp),
                        style = OrbitType.label,
                        color = c.textSecondary,
                    )
                }
            }
        }
        Note(
            if (state.google.connected) {
                "Agents you give the Google ability can search and read your email and save drafts (never send), check your " +
                    "calendar and add events, and read your Drive. Turn it on in an agent's Abilities."
            } else {
                "Connect it on your PC: open localhost:${hubPort(hubAddress)} in a browser there, then Settings, then Google. " +
                    "It stays on your PC; nothing about your account is stored on this phone."
            },
        )
    }
}

/** The Treehouse browser: a Chrome or Edge window on the PC that the user signs into, which agents use. */
@Composable
fun BrowserScreen(state: AppState, hubAddress: String, onBack: () -> Unit) {
    val c = Orbit.colors
    val browser = state.browser
    SettingsPage("Browser", onBack) {
        OrbitCard(Modifier.fillMaxWidth()) {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = OrbitDimens.rowPad).heightIn(min = 60.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                OrbitIcon(OrbitIcon.Globe, size = RowIcon, tint = c.text)
                Column(Modifier.weight(1f).padding(start = RowIconGap, top = 12.dp, bottom = 12.dp)) {
                    Text(
                        when {
                            !browser.available -> "No Chrome or Edge on the PC"
                            browser.running -> "${browser.name ?: "The browser"} is open"
                            else -> browser.name ?: "Ready"
                        },
                        style = OrbitType.titleS,
                        color = c.text,
                    )
                    Text("The Treehouse browser, on your PC", Modifier.padding(top = 2.dp), style = OrbitType.bodyS, color = c.textSecondary)
                }
            }
        }
        Note(
            if (!browser.available) {
                "Install Google Chrome or Microsoft Edge on your PC, then come back. Treehouse opens its own window of it."
            } else {
                "Sign in on your PC: open localhost:${hubPort(hubAddress)} in a browser there, then Settings, then Browser, and Open the browser. " +
                    "Sign into your sites in that window; it remembers them. Agents use those sign-ins, never your passwords, and only public " +
                    "websites, never your PC or home network. Before they buy, pay, send, post, book or delete anything, they ask you in the chat."
            },
        )
    }
}

/** Folders on the PC that agents can read. They're shared from the PC itself. */
@Composable
fun FoldersScreen(state: AppState, hubAddress: String, onRemove: (folderId: String) -> Unit, onBack: () -> Unit) {
    val c = Orbit.colors
    SettingsPage("Shared folders", onBack) {
        OrbitCard(Modifier.fillMaxWidth()) {
            Column {
                if (state.folders.isEmpty()) {
                    Row(Modifier.padding(OrbitDimens.rowPad), verticalAlignment = Alignment.CenterVertically) {
                        OrbitIcon(OrbitIcon.Folder, size = RowIcon, tint = c.textTertiary)
                        Text("No folders shared yet", Modifier.padding(start = RowIconGap), style = OrbitType.bodyM, color = c.textSecondary)
                    }
                }
                state.folders.forEachIndexed { index, folder ->
                    if (index > 0) RowDivider()
                    Row(
                        Modifier.fillMaxWidth().heightIn(min = 60.dp).padding(start = OrbitDimens.rowPad, end = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        OrbitIcon(OrbitIcon.Folder, size = RowIcon, tint = c.text)
                        Column(Modifier.weight(1f).padding(start = RowIconGap, end = 8.dp, top = 10.dp, bottom = 10.dp)) {
                            Text(folder.name, style = OrbitType.titleS, color = c.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(folder.path, style = OrbitType.mono, color = c.textTertiary, maxLines = 1, overflow = TextOverflow.MiddleEllipsis)
                        }
                        Text(
                            "Stop sharing",
                            Modifier.tap(CircleShape, 0.94f) { onRemove(folder.id) }.padding(horizontal = 10.dp, vertical = 12.dp),
                            style = OrbitType.label,
                            color = c.textSecondary,
                        )
                    }
                }
            }
        }
        Note(
            "Agents you give Read your files can read these, never change them. To share a folder, open " +
                "localhost:${hubPort(hubAddress)} in a browser on your PC.",
        )
    }
}

/** Reaching the hub away from home, through Tailscale. */
@Composable
fun AwayScreen(state: AppState, hubAddress: String, onBack: () -> Unit) {
    val c = Orbit.colors
    val uri = LocalUriHandler.current
    val remote = state.hub.remote
    val throughTailscale = remote.any { hubAddress.endsWith("//$it") }
    SettingsPage("Away from home", onBack) {
        OrbitCard(Modifier.fillMaxWidth()) {
            Column {
                Row(Modifier.fillMaxWidth().padding(OrbitDimens.rowPad), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("At home", style = OrbitType.titleS, color = c.text)
                        state.hub.addresses.firstOrNull()?.let { Text(it, Modifier.padding(top = 2.dp), style = OrbitType.mono, color = c.textTertiary) }
                    }
                    if (!throughTailscale && state.loaded && !state.offline) Status("In use", c.live)
                }
                Hairline()
                Row(Modifier.fillMaxWidth().padding(OrbitDimens.rowPad), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("Anywhere, through Tailscale", style = OrbitType.titleS, color = c.text)
                        Text(
                            remote.firstOrNull() ?: "Not set up",
                            Modifier.padding(top = 2.dp),
                            style = if (remote.isEmpty()) OrbitType.bodyS else OrbitType.mono,
                            color = c.textTertiary,
                        )
                    }
                    when {
                        throughTailscale -> Status("In use", c.live)
                        remote.isNotEmpty() -> Status("Ready", c.live)
                    }
                }
            }
        }
        if (remote.isEmpty()) {
            Note(
                "Tailscale is a free private network. Install it on your PC and on this phone and sign in to both with the " +
                    "same account. Treehouse notices within a minute, and this phone then reaches your PC from anywhere.",
            )
            PrimaryButton("Get Tailscale", { runCatching { uri.openUri(TAILSCALE_URL) } }, Modifier.fillMaxWidth().padding(top = 20.dp))
        } else {
            Note("This phone switches by itself: your home network when it's there, Tailscale everywhere else.")
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
