package dev.orbit.app

import androidx.compose.runtime.Composable
import app.cash.paparazzi.DeviceConfig
import app.cash.paparazzi.Paparazzi
import dev.orbit.app.data.Agent
import dev.orbit.app.data.Author
import dev.orbit.app.data.AvatarSpec
import dev.orbit.app.data.FoundHub
import dev.orbit.app.data.HubInfo
import dev.orbit.app.data.Message
import dev.orbit.app.data.Preview
import dev.orbit.app.data.Provider
import dev.orbit.app.data.Room
import dev.orbit.app.data.RunState
import dev.orbit.app.ui.AppState
import dev.orbit.app.ui.PairState
import dev.orbit.app.ui.RoomUiState
import dev.orbit.app.ui.screens.AgentEditorScreen
import dev.orbit.app.ui.screens.HomeScreen
import dev.orbit.app.ui.screens.PairScreen
import dev.orbit.app.ui.screens.RoomEditorScreen
import dev.orbit.app.ui.screens.RoomScreen
import dev.orbit.app.ui.screens.SettingsScreen
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

    private val now = 1_800_000_000_000L

    private val nova = Agent("a1", "Nova", "the planner", "Plan things.", "anthropic", "claude-opus-5-5", AvatarSpec(0, 7, 0, 1, 1))
    private val pixel = Agent("a2", "Pixel", "the builder", "Build things.", "openai", "gpt-large", AvatarSpec(1, 5, 4, 4, 0))
    private val sage = Agent("a3", "Sage", "the skeptic", "Poke holes.", "ollama", "llama-local", AvatarSpec(2, 4, 2, 3, 5))
    private val mochi = Agent("a4", "Mochi", "the writer", "", "xai", "grok-fast", AvatarSpec(4, 8, 3, 5, 3))
    private val agents = listOf(nova, pixel, sage, mochi)

    private val launch = Room(
        "r1", "Launch plan", listOf("a1", "a2", "a3"), Room.MODE_LEAD, "a1", now - 120_000, active = true,
        preview = Preview("Pixel", "Here's a first cut of the landing page copy, three variants."),
    )
    private val trip = Room(
        "r2", "Weekend trip", listOf("a3", "a4"), Room.MODE_ROUNDTABLE, null, now - 3 * 3_600_000,
        preview = Preview("Sage", "Two nights is tight for the coast. I'd pick the lake and skip the long drive."),
    )
    private val empty = Room("r3", "Reading group", listOf("a1", "a4"), updatedAt = now - 3 * 86_400_000)

    private val providers = listOf(
        Provider("anthropic", "Anthropic", true, listOf("claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5")),
        Provider("openai", "OpenAI", true),
        Provider("xai", "xAI", false),
        Provider("gemini", "Gemini", false),
        Provider("ollama", "Ollama (local)", true),
        Provider("demo", "Demo (no key)", true, listOf("demo")),
    )
    private val app = AppState(
        loaded = true, hub = HubInfo("Mike's PC", "0.1.0"), agents = agents, rooms = listOf(launch, trip, empty), providers = providers,
    )

    private fun agentMessage(id: String, agent: Agent, text: String, status: String = "done", error: String? = null) =
        Message(id, id.drop(1).toLong(), Author("agent", agent.id, agent.name, agent.model), text, status, error)

    private val chat = RoomUiState(
        loaded = true,
        connected = true,
        run = RunState(true, "a3"),
        messages = listOf(
            Message("m1", 1, Author("user", name = "You"), "We launch the beta in two weeks. What do we need?"),
            agentMessage(
                "m2", nova,
                "Here's how I'd split it:\n\n- **Landing page** and signup flow\n- A short **onboarding email**\n- A risk check before we invite anyone\n\n@Pixel can you draft the landing copy? @Sage, look for what could go wrong.",
            ),
            agentMessage(
                "m3", pixel,
                "On it. Headline options:\n\n1. *Your team, minus the busywork*\n2. *Ship the thing, skip the meetings*\n\nSignup can be a single `email` field for the beta.",
            ),
            agentMessage("m4", sage, "", status = "streaming"),
        ),
    )

    private fun shot(name: String, dark: Boolean = true, content: @Composable () -> Unit) {
        paparazzi.snapshot(name) { OrbitTheme(dark = dark) { content() } }
    }

    @Composable
    private fun Home(state: AppState = app) = HomeScreen(state, {}, {}, {}, {}, {}, {}, now = now)

    @Test fun pair() = shot("pair") { PairScreen(PairState(found = listOf(FoundHub("Mike's PC", "192.168.1.20:8787"))), {}) { _, _ -> } }
    @Test fun pairLight() = shot("pair-light", dark = false) { PairScreen(PairState(error = "That pairing code is not right. Check the code shown on your PC."), {}) { _, _ -> } }
    @Test fun home() = shot("home") { Home() }
    @Test fun homeLight() = shot("home-light", dark = false) { Home() }
    @Test fun homeEmpty() = shot("home-empty") { Home(app.copy(rooms = emptyList(), offline = true)) }
    @Test fun room() = shot("room") { RoomScreen(launch, listOf(nova, pixel, sage), chat, {}, {}, {}, {}, {}) }
    @Test fun roomLight() = shot("room-light", dark = false) {
        RoomScreen(
            trip, listOf(sage, mochi),
            chat.copy(
                run = RunState(),
                connected = false,
                messages = chat.messages.take(3) + agentMessage("m4", sage, "", "error", "xAI has no API key on the hub yet. Add one to config.json on your PC."),
            ),
            {}, {}, {}, {}, {}, everyone = agents,
        )
    }
    @Test fun roomEmpty() = shot("room-empty") { RoomScreen(empty, listOf(nova, mochi), RoomUiState(loaded = true, connected = true), {}, {}, {}, {}, {}) }
    @Test fun agentEditor() = shot("agent-editor") { AgentEditorScreen(nova, providers, { emptyList() }, {}, {}, {}) }
    @Test fun agentEditorLight() = shot("agent-editor-light", dark = false) { AgentEditorScreen(mochi, providers, { emptyList() }, {}, {}, {}) }
    @Test fun roomEditor() = shot("room-editor") { RoomEditorScreen(launch, agents, {}, {}, {}) }
    @Test fun settings() = shot("settings") { SettingsScreen(app, "http://192.168.1.20:8787", {}, {}) }
}
