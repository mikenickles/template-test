package dev.orbit.app

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.cash.paparazzi.DeviceConfig
import app.cash.paparazzi.Paparazzi
import dev.orbit.app.data.Agent
import dev.orbit.app.data.AvatarSpec
import dev.orbit.app.data.FoundHub
import dev.orbit.app.data.RunState
import dev.orbit.app.ui.AppState
import dev.orbit.app.ui.PairState
import dev.orbit.app.ui.RoomUiState
import dev.orbit.app.ui.components.ActionSheetContent
import dev.orbit.app.ui.components.AgentAvatar
import dev.orbit.app.ui.components.CrewTile
import dev.orbit.app.ui.components.EYES_COUNT
import dev.orbit.app.ui.components.LocalHubImages
import dev.orbit.app.ui.components.OrbitIcon
import dev.orbit.app.ui.components.SHAPE_COUNT
import dev.orbit.app.ui.components.SheetAction
import dev.orbit.app.ui.screens.AgentEditorScreen
import dev.orbit.app.ui.screens.HomeScreen
import dev.orbit.app.ui.screens.PairScreen
import dev.orbit.app.ui.screens.ProviderKeyScreen
import dev.orbit.app.ui.screens.RoomEditorScreen
import dev.orbit.app.ui.screens.RoomScreen
import dev.orbit.app.ui.screens.SampleCrew
import dev.orbit.app.ui.screens.SettingsScreen
import dev.orbit.app.ui.screens.ShareScreen
import dev.orbit.app.ui.screens.UsageScreen
import dev.orbit.app.ui.theme.Orbit
import dev.orbit.app.ui.theme.OrbitDimens
import dev.orbit.app.ui.theme.OrbitTheme
import org.junit.Rule
import org.junit.Test

/**
 * Renders every screen with sample data so the design can be reviewed without a device:
 * `./gradlew :app:recordPaparazziDebug` writes PNGs to app/src/test/snapshots.
 */
class ScreenshotTest {

    @get:Rule
    val paparazzi = Paparazzi(deviceConfig = DeviceConfig.PIXEL_6)

    private val now = SampleData.NOW
    private val nova = SampleData.nova
    private val pixel = SampleData.pixel
    private val sage = SampleData.sage
    private val mochi = SampleData.mochi
    private val agents = SampleData.agents
    private val launch = SampleData.launch
    private val trip = SampleData.trip
    private val empty = SampleData.empty
    private val providers = SampleData.providers
    private val app = SampleData.app
    private val chat = SampleData.chat

    private fun agentMessage(id: String, agent: Agent, text: String, status: String = "done", error: String? = null) =
        SampleData.agentMessage(id, agent, text, status, error)

    private fun shot(name: String, dark: Boolean = true, content: @Composable () -> Unit) {
        paparazzi.snapshot(name) { OrbitTheme(dark = dark, entrances = false, reducedMotion = false) { content() } }
    }

    @Composable
    private fun Home(state: AppState = app) = HomeScreen(state, {}, {}, {}, {}, {}, {}, now = now)

    /** Every shape against every eye style across the palette, then the small sizes and room tiles. */
    @Composable
    private fun AvatarSheet() {
        Column(
            Modifier.fillMaxSize().background(Orbit.colors.bg).padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            for (eyes in 0 until EYES_COUNT) {
                Row(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.CenterVertically) {
                    for (shape in 0 until SHAPE_COUNT) AgentAvatar(AvatarSpec(shape, eyes * 5 + shape, eyes), size = 56.dp)
                }
            }
            for (size in listOf(34, 28, 24)) {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                    for (eyes in 0 until EYES_COUNT) AgentAvatar(AvatarSpec(eyes % SHAPE_COUNT, eyes + 2, eyes), size = size.dp)
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.CenterVertically) {
                CrewTile(SampleCrew.take(1))
                CrewTile(SampleCrew.take(2))
                CrewTile(SampleCrew.take(3))
                CrewTile(SampleCrew.drop(2))
                AgentAvatar(SampleCrew[2], Modifier.padding(start = 8.dp), size = 34.dp, thinking = true)
            }
        }
    }

    @Test fun avatars() = shot("avatars") { AvatarSheet() }
    @Test fun avatarsLight() = shot("avatars-light", dark = false) { AvatarSheet() }
    @Test fun pair() = shot("pair") { PairScreen(PairState(found = listOf(FoundHub("Mike's PC", "192.168.1.20:8787"))), {}, { _, _ -> }) }
    @Test fun pairLight() = shot("pair-light", dark = false) { PairScreen(PairState(error = "That code didn't match. Check the one shown on your PC."), {}, { _, _ -> }) }
    @Test fun home() = shot("home") { Home() }
    @Test fun homeLight() = shot("home-light", dark = false) { Home() }
    @Test fun pairScanning() = shot("pair-scanned") {
        PairScreen(PairState(busy = true, scanned = dev.orbit.app.data.PairingLink("192.168.86.49:8787", "309407", "BOOK")), {}, { _, _ -> })
    }
    @Test fun providerKey() = shot("provider-key") { ProviderKeyScreen(SampleData.providers[2], { _, _ -> }, {}, {}) }
    @Test fun providerKeyLight() = shot("provider-key-light", dark = false) { ProviderKeyScreen(SampleData.anthropic, { _, _ -> }, {}, {}) }
    @Test fun homeDemoMode() = shot("home-demo") {
        Home(SampleData.app.copy(providers = SampleData.providers.map { if (it.takesKey) it.copy(configured = false, keySource = null, keyHint = null) else it }))
    }
    @Test fun homeLoadingLight() = shot("home-loading-light", dark = false) { Home(SampleData.app.copy(loaded = false, agents = emptyList(), rooms = emptyList())) }
    @Test fun homeLoading() = shot("home-loading") { Home(SampleData.app.copy(loaded = false, agents = emptyList(), rooms = emptyList())) }
    @Test fun homeEmpty() = shot("home-empty") { Home(app.copy(rooms = emptyList(), offline = true)) }
    @Test fun room() = shot("room") { RoomScreen(launch, listOf(nova, pixel, sage), chat, {}, {}, {}, {}, {}) }
    @Test fun roomLight() = shot("room-light", dark = false) {
        RoomScreen(
            launch, listOf(nova, pixel, sage),
            chat.copy(
                run = RunState(),
                connected = false,
                messages = chat.messages.take(3) +
                    agentMessage("m4", sage, "", "error", "Ollama (local) could not be reached at localhost:11434."),
            ),
            {}, {}, {}, {}, {},
        )
    }
    @Test fun roomEmpty() = shot("room-empty") { RoomScreen(empty, listOf(nova, mochi), RoomUiState(loaded = true, connected = true), {}, {}, {}, {}, {}) }
    @Test fun agentEditor() = shot("agent-editor") { AgentEditorScreen(nova, providers, { emptyList() }, {}, {}, {}) }
    @Test fun agentEditorLight() = shot("agent-editor-light", dark = false) { AgentEditorScreen(mochi, providers, { emptyList() }, {}, {}, {}) }
    @Test fun roomEditor() = shot("room-editor") { RoomEditorScreen(launch, agents, {}, {}, {}) }
    @Test fun settings() = shot("settings") { SettingsScreen(app, "http://192.168.1.20:8787", {}, {}) }
    @Test fun messageActions() = shot("message-actions") {
        Box(Modifier.fillMaxSize()) {
            RoomScreen(launch, listOf(nova, pixel, sage), chat.copy(run = RunState(), messages = chat.messages.take(3)), {}, {}, {}, {}, {})
            Box(Modifier.fillMaxSize().background(Orbit.colors.bg.copy(alpha = 0.6f)))
            Surface(
                Modifier.align(Alignment.BottomCenter),
                shape = RoundedCornerShape(topStart = OrbitDimens.radiusXL, topEnd = OrbitDimens.radiusXL),
                color = Orbit.colors.surface,
            ) {
                ActionSheetContent(
                    "Pixel's reply",
                    SampleData.PIXEL_DRAFT,
                    listOf(
                        SheetAction("Copy text", OrbitIcon.Copy) {},
                        SheetAction("Ask again", OrbitIcon.Retry) {},
                        SheetAction("Delete", OrbitIcon.Trash, danger = true) {},
                    ),
                ) {}
            }
        }
    }
    @Test fun attachments() = shot("room-attachments") {
        CompositionLocalProvider(LocalHubImages provides SampleData.images) {
            RoomScreen(trip.copy(agentIds = listOf("a1")), listOf(nova), SampleData.shared, {}, {}, {}, {}, {})
        }
    }
    @Test fun attachmentsLight() = shot("room-attachments-light", dark = false) {
        CompositionLocalProvider(LocalHubImages provides SampleData.images) {
            RoomScreen(trip.copy(agentIds = listOf("a1")), listOf(nova), SampleData.shared.copy(drafts = emptyList()), {}, {}, {}, {}, {})
        }
    }
    @Test fun share() = shot("share") {
        val files = listOf(
            dev.orbit.app.data.SharedFile(android.net.Uri.EMPTY, "IMG_2050.jpg", "image/jpeg"),
            dev.orbit.app.data.SharedFile(android.net.Uri.EMPTY, "IMG_2051.jpg", "image/jpeg"),
        )
        ShareScreen(
            dev.orbit.app.data.SharedContent("Ichiran Shibuya - opening hours and menu\nhttps://ichiran.example/shibuya", files),
            SampleData.app.rooms, agents, {}, {}, {},
        )
    }
    @Test fun shareLight() = shot("share-light", dark = false) {
        ShareScreen(dev.orbit.app.data.SharedContent("Is this a good deal? https://shop.example/headphones", skipped = 1), SampleData.app.rooms, agents, {}, {}, {})
    }
    @Test fun usage() = shot("usage") { UsageScreen(SampleData.usage, agents, 30, {}, {}) }
    @Test fun usageLight() = shot("usage-light", dark = false) { UsageScreen(SampleData.usage, agents, 30, {}, {}) }
    @Test fun roomResearch() = shot("room-research") { RoomScreen(trip.copy(agentIds = listOf("a1")), listOf(nova), SampleData.research, {}, {}, {}, {}, {}) }
    @Test fun roomResearchLight() = shot("room-research-light", dark = false) {
        RoomScreen(trip.copy(agentIds = listOf("a1")), listOf(nova), SampleData.research, {}, {}, {}, {}, {})
    }
}

/** Screens taller than a phone, rendered whole so the lower sections can be reviewed too. */
class TallScreenshotTest {
    @get:Rule
    val paparazzi = Paparazzi(deviceConfig = DeviceConfig.PIXEL_6.copy(screenHeight = 5400), useDeviceResolution = true)

    private fun shot(name: String, dark: Boolean = true, content: @Composable () -> Unit) {
        paparazzi.snapshot(name) { OrbitTheme(dark = dark, entrances = false, reducedMotion = false) { content() } }
    }

    private val providers = SampleData.providers

    @Test fun agentEditor() = shot("agent-editor-full") {
        AgentEditorScreen(SampleData.nova, providers, { emptyList() }, {}, {}, {}, folders = SampleData.folders)
    }
    @Test fun agentEditorOtherProviderLight() = shot("agent-editor-full-light", dark = false) {
        AgentEditorScreen(SampleData.mochi.copy(abilities = listOf("web")), providers, { emptyList() }, {}, {}, {})
    }
    @Test fun settings() = shot("settings-full") { SettingsScreen(SampleData.app, "http://100.101.102.103:8787", {}, {}, usage = SampleData.usage) }
    @Test fun settingsNoFoldersLight() = shot("settings-full-light", dark = false) {
        SettingsScreen(SampleData.app.copy(folders = emptyList(), hub = SampleData.app.hub.copy(remote = emptyList())), "http://192.168.1.20:8787", {}, {})
    }
}
