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
import dev.orbit.app.data.Room
import dev.orbit.app.data.AvatarSpec
import dev.orbit.app.data.FoundHub
import dev.orbit.app.data.RunState
import dev.orbit.app.data.ProactiveMark
import dev.orbit.app.ui.AppState
import dev.orbit.app.ui.PairState
import dev.orbit.app.ui.RoomUiState
import dev.orbit.app.ui.components.ActionSheetContent
import dev.orbit.app.ui.components.AgentAvatar
import dev.orbit.app.ui.components.CrewTile
import dev.orbit.app.ui.components.Characters
import dev.orbit.app.ui.components.LocalHubImages
import dev.orbit.app.ui.components.OrbitIcon
import dev.orbit.app.ui.components.FormerAgentAvatar
import dev.orbit.app.ui.components.SheetAction
import dev.orbit.app.ui.screens.AgentEditorScreen
import dev.orbit.app.ui.UpdateStatus
import dev.orbit.app.ui.screens.AboutYouScreen
import dev.orbit.app.ui.screens.HomeScreen
import dev.orbit.app.ui.screens.LocalModelsScreen
import dev.orbit.app.ui.screens.PairScreen
import dev.orbit.app.ui.screens.ProviderKeyScreen
import dev.orbit.app.ui.screens.RoomEditorScreen
import dev.orbit.app.ui.screens.RoomScreen
import dev.orbit.app.ui.screens.SampleCrew
import dev.orbit.app.ui.screens.AwayScreen
import dev.orbit.app.ui.screens.FoldersScreen
import dev.orbit.app.ui.screens.GoogleScreen
import dev.orbit.app.ui.screens.ModelsScreen
import dev.orbit.app.ui.screens.SearchScreen
import dev.orbit.app.data.SearchResults
import dev.orbit.app.data.SearchRoom
import dev.orbit.app.data.SearchHit
import dev.orbit.app.data.Message
import dev.orbit.app.data.Author
import dev.orbit.app.ui.screens.SettingsScreen
import dev.orbit.app.ui.screens.ProactiveScreen
import dev.orbit.app.ui.screens.ShareScreen
import dev.orbit.app.ui.screens.ScheduleEditorScreen
import dev.orbit.app.ui.screens.SchedulesScreen
import dev.orbit.app.ui.screens.UsageScreen
import dev.orbit.app.ui.screens.BrowserScreen
import dev.orbit.app.data.BrowserStatus
import dev.orbit.app.data.Activity
import dev.orbit.app.data.Card
import dev.orbit.app.data.CardEmail
import dev.orbit.app.data.CardEvent
import dev.orbit.app.data.CardFile
import dev.orbit.app.ui.components.LocalZone
import dev.orbit.app.ui.components.ToolCard
import dev.orbit.app.ui.components.tint
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import java.time.ZoneOffset
import dev.orbit.app.ui.screens.RoomTokensScreen
import dev.orbit.app.data.RoomContext
import dev.orbit.app.data.ContextTokens
import dev.orbit.app.data.ContextMessages
import dev.orbit.app.data.ContextUsage
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
    private val longChat = chat.copy(
        run = RunState(),
        messages = (SampleData.rich.messages + chat.messages.take(3)).mapIndexed { i, m -> m.copy(id = "long$i", seq = i.toLong()) },
    )

    private fun agentMessage(id: String, agent: Agent, text: String, status: String = "done", error: String? = null) =
        SampleData.agentMessage(id, agent, text, status, error)

    private fun shot(name: String, dark: Boolean = true, content: @Composable () -> Unit) {
        paparazzi.snapshot(name) { OrbitTheme(dark = dark, entrances = false, reducedMotion = false) { content() } }
    }

    @Composable
    private fun Home(state: AppState = app) = HomeScreen(state, {}, {}, {}, {}, {}, {}, now = now)

    /** Every character, then the small sizes, room tiles and a deleted agent. */
    @Composable
    private fun AvatarSheet() {
        Column(
            Modifier.fillMaxSize().background(Orbit.colors.bg).padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            for (row in Characters.chunked(5)) {
                Row(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.CenterVertically) {
                    for (character in row) AgentAvatar(AvatarSpec(character.number), size = 56.dp)
                }
            }
            for (size in listOf(34, 28, 20)) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    for (number in 1..9) AgentAvatar(AvatarSpec(number * 2 + size % 3), size = size.dp)
                    AgentAvatar(FormerAgentAvatar, size = size.dp)
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
    @Test fun pair() = shot("pair") { PairScreen(PairState(found = listOf(FoundHub("Home PC", "192.168.1.20:8787"))), {}, { _, _ -> }) }
    @Test fun pairLight() = shot("pair-light", dark = false) { PairScreen(PairState(error = "That code didn't match. Check the one shown on your PC."), {}, { _, _ -> }) }
    @Test fun home() = shot("home") { Home() }
    @Test fun homeLight() = shot("home-light", dark = false) { Home() }
    /** What the crew brought up on its own, on Home. */
    @Test fun homeNudges() = shot("home-nudges") { Home(SampleData.proactive) }
    @Test fun homeNudgesLight() = shot("home-nudges-light", dark = false) { Home(SampleData.proactive) }
    @Test fun proactive() = shot("proactive") { ProactiveScreen(SampleData.proactive, {}, {}, {}, {}, {}) }
    @Test fun proactiveLight() = shot("proactive-light", dark = false) { ProactiveScreen(SampleData.proactive, {}, {}, {}, {}, {}) }
    @Test fun proactiveMessage() = shot("room-proactive") {
        RoomScreen(
            launch, listOf(nova, pixel, sage),
            chat.copy(
                run = RunState(),
                messages = chat.messages.take(3) + agentMessage(
                    "m9", nova, "The beta goes out Friday and the signup page still has placeholder copy. Want me to ask **Pixel** for a first draft today?",
                ).copy(proactive = ProactiveMark("p1", ProactiveMark.KIND_CHECK_IN, "Check-in")),
            ),
            {}, {}, {}, {}, {},
        )
    }
    @Test fun homeUpdate() = shot("home-update") {
        HomeScreen(SampleData.updatable, {}, {}, {}, {}, {}, {}, now = now, appUpdate = "0.11.0")
    }
    @Test fun homeUpdateDownloadingLight() = shot("home-update-downloading-light", dark = false) {
        HomeScreen(SampleData.phoneUpdatable, {}, {}, {}, {}, {}, {}, now = now, appUpdate = "0.11.0", updateStatus = UpdateStatus.Downloading(42))
    }
    @Test fun homePcUpdating() = shot("home-pc-updating") {
        HomeScreen(SampleData.updatable, {}, {}, {}, {}, {}, {}, now = now, pcUpdating = "0.11.0")
    }
    @Test fun settingsUpdate() = shot("settings-update") {
        SettingsScreen(SampleData.updatable, "http://192.168.1.20:8787", {}, {}, installedVersion = "0.10.0")
    }
    @Test fun settingsPhoneUpdate() = shot("settings-phone-update", dark = false) {
        SettingsScreen(SampleData.phoneUpdatable, "http://192.168.1.20:8787", {}, {}, installedVersion = "0.10.0", updateStatus = UpdateStatus.Failed("The download stopped early. Try again."))
    }
    @Test fun homeIntro() = shot("home-intro") { Home(SampleData.newcomer) }
    @Test fun homeIntroLight() = shot("home-intro-light", dark = false) { Home(SampleData.newcomer) }
    @Test fun homeIntroNoKey() = shot("home-intro-no-key") {
        Home(SampleData.newcomer.copy(providers = SampleData.providers.map { if (it.takesKey) it.copy(configured = false, keySource = null, keyHint = null) else it }))
    }
    @Test fun introChat() = shot("intro-chat") {
        RoomScreen(SampleData.introRoom, listOf(nova), SampleData.intro, {}, {}, {}, {}, {}, everyone = agents)
    }
    @Test fun introChatLight() = shot("intro-chat-light", dark = false) {
        RoomScreen(SampleData.introRoom, listOf(nova), SampleData.intro, {}, {}, {}, {}, {}, everyone = agents)
    }
    @Test fun replies() = shot("room-replies") {
        RoomScreen(launch, listOf(nova, pixel, sage), SampleData.replying, {}, {}, {}, {}, {}, startReplyTo = SampleData.replying.messages.last())
    }
    @Test fun repliesLight() = shot("room-replies-light", dark = false) {
        RoomScreen(launch, listOf(nova, pixel, sage), SampleData.replying, {}, {}, {}, {}, {})
    }
    @Test fun hiring() = shot("room-hiring") {
        RoomScreen(SampleData.introRoom.copy(name = "Life"), listOf(nova, SampleData.rio), SampleData.hiring, {}, {}, {}, {}, {}, everyone = agents + SampleData.rio)
    }
    @Test fun aboutYou() = shot("about-you") {
        AboutYouScreen(SampleData.profile, agents, canIntro = true, {}, { _, _ -> }, {}, {}, {})
    }
    @Test fun pairScanning() = shot("pair-scanned") {
        PairScreen(PairState(busy = true, scanned = dev.orbit.app.data.PairingLink("192.168.86.49:8787", "309407", "BOOK")), {}, { _, _ -> })
    }
    @Test fun providerKey() = shot("provider-key") { ProviderKeyScreen(SampleData.providers[2], { _, _ -> }, {}, {}) }
    @Test fun providerKeyLight() = shot("provider-key-light", dark = false) { ProviderKeyScreen(SampleData.anthropic, { _, _ -> }, {}, {}) }
    @Test fun localModels() = shot("local-models") { LocalModelsScreen(SampleData.ollama, { _, _ -> }, {}, {}, {}) }
    @Test fun localModelsDownloadingLight() = shot("local-models-downloading-light", dark = false) {
        LocalModelsScreen(SampleData.ollamaDownloading, { _, _ -> }, {}, {}, {})
    }
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
    /** A conversation longer than the screen: it runs behind the bar and the composer, fading out at both ends. */
    @Test fun roomLong() = shot("room-long") { RoomScreen(launch, listOf(nova, pixel, sage), longChat, {}, {}, {}, {}, {}) }
    @Test fun roomLongLight() = shot("room-long-light", dark = false) { RoomScreen(launch, listOf(nova, pixel, sage), longChat, {}, {}, {}, {}, {}) }
    @Test fun roomEmpty() = shot("room-empty") { RoomScreen(empty, listOf(nova, mochi), RoomUiState(loaded = true, connected = true), {}, {}, {}, {}, {}) }
    @Test fun agentEditor() = shot("agent-editor") { AgentEditorScreen(nova, providers, { emptyList() }, {}, {}, {}) }
    @Test fun agentEditorLight() = shot("agent-editor-light", dark = false) { AgentEditorScreen(mochi, providers, { emptyList() }, {}, {}, {}) }
    @Test fun roomEditor() = shot("room-editor") { RoomEditorScreen(launch, agents, {}, {}, {}) }
    @Test fun roomEditorBestFit() = shot("room-editor-best-fit", dark = false) {
        RoomEditorScreen(
            launch.copy(mode = Room.MODE_AUTO, leadId = null, description = "We launch the beta on May 1. Keep answers short, decision first."),
            agents, {}, {}, {},
        )
    }
    @Test fun roomEditorNew() = shot("room-editor-new") { RoomEditorScreen(null, agents, {}, null, {}, onPlan = { _, _ -> }) }
    @Test fun roomActions() = shot("room-actions") {
        Box(Modifier.fillMaxSize()) {
            Home()
            Box(Modifier.fillMaxSize().background(Orbit.colors.bg.copy(alpha = 0.6f)))
            Surface(
                Modifier.align(Alignment.BottomCenter),
                shape = RoundedCornerShape(topStart = OrbitDimens.radiusXL, topEnd = OrbitDimens.radiusXL),
                color = Orbit.colors.surface,
            ) {
                ActionSheetContent(
                    launch.name,
                    launch.description.ifBlank { null },
                    listOf(
                        SheetAction("Edit room", OrbitIcon.Edit) {},
                        SheetAction("Delete room", OrbitIcon.Trash, danger = true) {},
                    ),
                ) {}
            }
        }
    }
    @Test fun settings() = shot("settings") { SettingsScreen(app, "http://192.168.1.20:8787", {}, {}) }
    @Test fun settingsModels() = shot("settings-models") { ModelsScreen(app, {}, {}) }
    @Test fun roomGrouped() = shot("room-grouped") {
        val hour = 3_600_000L
        fun agent(id: String, who: dev.orbit.app.data.Agent, text: String, at: Long, model: String? = null) =
            Message(id = id, author = Author(type = "agent", agentId = who.id, name = who.name, model = model), text = text, createdAt = at)
        val messages = listOf(
            agent("g1", nova, "Beta invites go out Friday. I'll draft the email tonight.", now - 15 * hour, "claude-opus-5-5"),
            agent("g2", nova, "Draft's ready for you in the Docs folder.", now - 15 * hour + 4 * 60_000),
            Message(id = "g3", author = Author(type = "user", name = "You"), text = "Pixel, can you tighten the landing copy?", createdAt = now - 2 * hour),
            agent("g4", pixel, "Cut it to three lines. New headline: *Your team, minus the busywork.*", now - 2 * hour + 60_000, "gpt-large"),
            agent("g5", pixel, "Also dropped the second signup field.", now - 2 * hour + 2 * 60_000),
            agent("g6", sage, "One worry: \"busywork\" may read as dismissive to the people who do it.", now - 5 * 60_000, "llama-local"),
        )
        RoomScreen(launch, listOf(nova, pixel, sage), RoomUiState(loaded = true, connected = true, messages = messages), {}, {}, {}, {}, {}, now = now)
    }
    @Test fun roomMenu() = shot("room-menu") {
        Box(Modifier.fillMaxSize()) {
            RoomScreen(launch, listOf(nova, pixel, sage), chat.copy(run = RunState(), messages = chat.messages.take(3)), {}, {}, {}, {}, {})
            Box(Modifier.fillMaxSize().background(Orbit.colors.bg.copy(alpha = 0.6f)))
            Surface(
                Modifier.align(Alignment.BottomCenter),
                shape = RoundedCornerShape(topStart = OrbitDimens.radiusXL, topEnd = OrbitDimens.radiusXL),
                color = Orbit.colors.surface,
            ) {
                ActionSheetContent(
                    launch.name,
                    "3 agents · 2 schedules · 48 messages",
                    listOf(
                        SheetAction("Edit room", OrbitIcon.Edit, hint = "Name, mode, description") {},
                        SheetAction("Members", OrbitIcon.Person, hint = "3 agents") {},
                        SheetAction("Schedules", OrbitIcon.Clock, hint = "2 on") {},
                        SheetAction("Search this room", OrbitIcon.Search) {},
                        SheetAction("Clear chat", OrbitIcon.Retry) {},
                        SheetAction("Delete room", OrbitIcon.Trash, danger = true) {},
                    ),
                    leading = { dev.orbit.app.ui.components.CrewTile(listOf(nova.avatar, pixel.avatar, sage.avatar), size = 44.dp) },
                ) {}
            }
        }
    }
    @Test fun roomMembers() = shot("room-members", dark = false) {
        Box(Modifier.fillMaxSize()) {
            RoomScreen(launch, listOf(nova, pixel, sage), chat.copy(messages = chat.messages.take(3)), {}, {}, {}, {}, {})
            Box(Modifier.fillMaxSize().background(Orbit.colors.bg.copy(alpha = 0.6f)))
            Surface(
                Modifier.align(Alignment.BottomCenter),
                shape = RoundedCornerShape(topStart = OrbitDimens.radiusXL, topEnd = OrbitDimens.radiusXL),
                color = Orbit.colors.surface,
            ) {
                Column(Modifier.padding(top = 20.dp, bottom = 24.dp)) {
                    dev.orbit.app.ui.screens.MembersSheet(launch.copy(agentIds = listOf(nova.id, pixel.id, sage.id)), listOf(nova, pixel, sage), agents, chat, now, {}, {})
                }
            }
        }
    }
    @Test fun search() = shot("search") {
        SearchScreen(
            "ramen",
            {},
            SearchResults(
                "ramen",
                rooms = listOf(SearchRoom(trip.id, "Ramen crawl", listOf(nova.id, sage.id))),
                messages = listOf(
                    SearchHit(trip.id, trip.name, "m2", nova.id, "Nova", "Fuunji is your best bet: a 6 minute walk from the hotel, and the tsukemen gets the most praise among ramen fans.", now - 3 * 3_600_000),
                    SearchHit(trip.id, trip.name, "m1", null, "You", "Find a ramen place near the hotel and check it against my trip notes.", now - 3 * 3_600_000 - 60_000),
                    SearchHit(launch.id, launch.name, "m9", pixel.id, "Pixel", "…we could do a ramen lunch for the launch team on Friday.", now - 26 * 3_600_000),
                ),
            ),
            false,
            agents,
            {},
            {},
            now = now,
            autoFocus = false,
        )
    }
    @Test fun settingsFolders() = shot("settings-folders") { FoldersScreen(app, "http://192.168.1.20:8787", {}, {}) }
    @Test fun settingsAway() = shot("settings-away") { AwayScreen(app, "http://100.101.102.103:8787", {}) }
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
    @Test fun schedules() = shot("schedules") { SchedulesScreen(launch, SampleData.schedules, {}, {}, {}, {}, now = now) }
    @Test fun schedulesEmptyLight() = shot("schedules-empty-light", dark = false) { SchedulesScreen(trip, emptyList(), {}, {}, {}, {}, now = now) }
    @Test fun scheduledMessage() = shot("room-scheduled") { RoomScreen(launch, listOf(nova, pixel, sage), SampleData.briefing, {}, {}, {}, {}, {}) }
    @Test fun formatting() = shot("room-formatting") { RoomScreen(trip.copy(agentIds = listOf("a1")), listOf(nova), SampleData.rich, {}, {}, {}, {}, {}) }
    @Test fun formattingLight() = shot("room-formatting-light", dark = false) { RoomScreen(trip.copy(agentIds = listOf("a1")), listOf(nova), SampleData.rich, {}, {}, {}, {}, {}) }
    @Test fun roomTokens() = shot("room-tokens") { RoomTokensScreen("Launch", tokens, {}, {}, {}, false, null, {}, tints = listOf(nova, pixel, sage).map { it.avatar.tint() }) }
    @Test fun roomTokensSmallLight() = shot("room-tokens-small-light", dark = false) {
        RoomTokensScreen("Launch", tokens.copy(size = RoomContext.SIZE_SMALL, photos = false), {}, {}, {}, false, "Summarizing needs an agent in this room on a model with a key.", {})
    }
    @Test fun roomTokenChip() = shot("room-token-chip") { RoomScreen(launch, listOf(nova, pixel, sage), chat.copy(run = RunState()), {}, {}, {}, {}, {}, contextTokens = 12_400) }
    @Test fun roomCalendarCard() = shot("room-card-calendar", dark = false) {
        CompositionLocalProvider(LocalZone provides ZoneOffset.UTC) {
            RoomScreen(cardRoom, listOf(nova), cardChat(calendarReply), {}, {}, {}, {}, {}, now = now)
        }
    }
    @Test fun roomEmailCards() = shot("room-card-email") {
        CompositionLocalProvider(LocalZone provides ZoneOffset.UTC) {
            RoomScreen(cardRoom.copy(name = "Inbox helper"), listOf(nova), cardChat(emailReply), {}, {}, {}, {}, {}, now = now)
        }
    }
    @Test fun toolCards() = shot("tool-cards", dark = false) {
        CompositionLocalProvider(LocalZone provides ZoneOffset.UTC) {
            Column(
                Modifier.fillMaxSize().background(Orbit.colors.bg).verticalScroll(rememberScrollState()).padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                ToolCard(Card(type = Card.EVENT_ADDED, event = CardEvent("Dentist", "2027-01-19T09:30:00Z", "2027-01-19T10:15:00Z", location = "Main St")), nova.avatar, "Nova", now)
                ToolCard(Card(type = Card.FILES, files = listOf(CardFile("Holiday budget", "Google Sheet", now - 86_400_000L), CardFile("Trip plan", "Google Doc", now - 5 * 86_400_000L))), pixel.avatar, "Pixel", now)
                ToolCard(Card(type = Card.FOLLOWUP, ref = "f1", time = now + 86_400_000L + 3_600_000L, note = "Ask how the first chapter is going, and offer to read it."), mochi.avatar, "Mochi", now)
                ToolCard(Card(type = Card.WATCH, ref = "w1", what = "Flights to Lisbon in March", condition = "a fare under $500"), sage.avatar, "Sage", now, live = false)
            }
        }
    }
    @Test fun approvalCards() = shot("approval-cards") {
        CompositionLocalProvider(LocalZone provides ZoneOffset.UTC) {
            Column(Modifier.fillMaxSize().background(Orbit.colors.bg).padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                ToolCard(Card(type = Card.APPROVAL, ref = "a1", action = "Click “Place order”", site = "cornershop.com", status = Card.PENDING), nova.avatar, "Nova", now)
                ToolCard(Card(type = Card.APPROVAL, ref = "a2", action = "Send “Running 10 minutes late”", site = "messages.google.com", status = Card.ALLOWED), pixel.avatar, "Pixel", now)
                ToolCard(Card(type = Card.APPROVAL, ref = "a3", action = "Click “Delete account”", site = "example.com", status = Card.DENIED), sage.avatar, "Sage", now)
            }
        }
    }
    @Test fun browserSettings() = shot("settings-browser-light", dark = false) {
        BrowserScreen(SampleData.app.copy(browser = BrowserStatus(available = true, name = "Google Chrome", running = true, signedIn = true)), "http://192.168.1.20:8787", {})
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
    val paparazzi = Paparazzi(deviceConfig = DeviceConfig.PIXEL_6.copy(screenHeight = 6600), useDeviceResolution = true)

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
    @Test fun scheduleEditor() = shot("schedule-editor-full") { ScheduleEditorScreen(SampleData.launch, SampleData.schedules[0], {}, {}, {}, {}) }
    @Test fun scheduleEditorLight() = shot("schedule-editor-full-light", dark = false) { ScheduleEditorScreen(SampleData.trip, null, {}, null, null, {}) }
    @Test fun proactiveFull() = shot("proactive-full") { ProactiveScreen(SampleData.proactive, {}, {}, {}, {}, {}) }
    @Test fun settingsGoogle() = shot("settings-google-full") { GoogleScreen(SampleData.proactive, "http://192.168.1.20:8787", {}, {}) }
    @Test fun agentEditorProactive() = shot("agent-editor-proactive-full") {
        AgentEditorScreen(SampleData.proactive.agents[0], SampleData.providers, { emptyList() }, {}, null, {}, google = SampleData.proactive.google)
    }
    @Test fun settings() = shot("settings-full") { SettingsScreen(SampleData.app, "http://100.101.102.103:8787", {}, {}, usage = SampleData.usage) }
    @Test fun settingsNoFoldersLight() = shot("settings-full-light", dark = false) {
        SettingsScreen(SampleData.app.copy(folders = emptyList(), hub = SampleData.app.hub.copy(remote = emptyList())), "http://192.168.1.20:8787", {}, {})
    }
    @Test fun awayNotSetUp() = shot("settings-away-light", dark = false) {
        AwayScreen(SampleData.app.copy(hub = SampleData.app.hub.copy(remote = emptyList())), "http://192.168.1.20:8787", {})
    }

}

private val tokens = RoomContext(
    tokens = ContextTokens(instructions = 2_150, summary = 640, recent = 8_900, photos = 1_500, total = 13_190),
    messages = ContextMessages(recent = 24, summarized = 61, leftOut = 0, total = 85),
    usage = ContextUsage(input = 182_000, output = 41_300, cacheRead = 512_000, cacheWrite = 64_000, requests = 57, cost = 1.84, priced = true),
)

private val cardRoom = SampleData.launch.copy(id = "r7", name = "Morning brief", agentIds = listOf("a1"), active = false, speaking = null)

private fun cardChat(reply: List<dev.orbit.app.data.Message>) = SampleData.chat.copy(run = dev.orbit.app.data.RunState(), messages = reply)

private const val CALENDAR_BEFORE = "Two things today, with four hours free in between."

private val calendarReply = listOf(
    SampleData.userMessage("m1", "What's on my agenda today?").copy(createdAt = SampleData.NOW - 60_000),
    SampleData.agentMessage("m2", SampleData.nova, "$CALENDAR_BEFORE\n\nWant a reminder to leave for the party at 3:40?").copy(
        createdAt = SampleData.NOW - 50_000,
        activity = listOf(Activity("calendar", "", done = true)),
        cards = listOf(
            Card(
                id = "c1", type = Card.EVENTS, at = CALENDAR_BEFORE.length,
                from = SampleData.NOW, to = SampleData.NOW + 86_400_000L,
                events = listOf(
                    CardEvent("Farmers market", "2027-01-15T11:00:00Z", "2027-01-15T12:00:00Z", location = "Main Street"),
                    CardEvent("Birthday party", "2027-01-15T16:00:00Z", "2027-01-15T18:00:00Z", location = "Maple Park"),
                ),
            ),
        ),
    ),
)

private const val EMAIL_BEFORE = "Three need a reply from you."
private const val EMAIL_MIDDLE = "\n\nI drafted a reply to Dana. It's saved in Gmail, not sent."

private val emailReply = listOf(
    SampleData.userMessage("m1", "Anything I need to answer?").copy(createdAt = SampleData.NOW - 60_000),
    SampleData.agentMessage("m2", SampleData.nova, EMAIL_BEFORE + EMAIL_MIDDLE).copy(
        createdAt = SampleData.NOW - 50_000,
        activity = listOf(Activity("mail_search", "is:unread", done = true), Activity("mail_draft", "dana@example.com", done = true)),
        cards = listOf(
            Card(
                id = "c1", type = Card.EMAILS, at = EMAIL_BEFORE.length,
                emails = listOf(
                    CardEmail("Dana Park", "Saturday plans", "Are we still on for 4?", SampleData.NOW - 80 * 60_000L, unread = true),
                    CardEmail("Lee R.", "Lease renewal", "Can you confirm by Friday?", SampleData.NOW - 86_400_000L),
                    CardEmail("Mia Ortiz", "Photos from the trip", "Which ones should I print?", SampleData.NOW - 3 * 86_400_000L),
                ),
            ),
            Card(id = "c2", type = Card.DRAFT, at = (EMAIL_BEFORE + EMAIL_MIDDLE).length, recipient = "Dana Park", subject = "Re: Saturday plans", body = "Hi Dana, yes, still on! I'll be at Maple Park by 4. Want me to bring anything?"),
        ),
    ),
)
