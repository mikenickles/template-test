package dev.orbit.app

import dev.orbit.app.data.Agent
import dev.orbit.app.data.Author
import dev.orbit.app.data.AvatarSpec
import dev.orbit.app.data.HubInfo
import dev.orbit.app.data.Message
import dev.orbit.app.data.Preview
import dev.orbit.app.data.Provider
import dev.orbit.app.data.Room
import dev.orbit.app.data.RunState
import dev.orbit.app.ui.AppState
import dev.orbit.app.ui.RoomUiState

/** One small, consistent world of agents, rooms and messages for screenshot and motion tests. */
object SampleData {
    const val NOW = 1_800_000_000_000L

    val nova = Agent("a1", "Nova", "the planner", "Plan things.", "anthropic", "claude-opus-5-5", AvatarSpec(0, 7, 1))
    val pixel = Agent("a2", "Pixel", "the builder", "Build things.", "openai", "gpt-large", AvatarSpec(1, 5, 5))
    val sage = Agent("a3", "Sage", "the skeptic", "Poke holes.", "ollama", "llama-local", AvatarSpec(4, 2, 2))
    val mochi = Agent("a4", "Mochi", "the writer", "", "xai", "grok-fast", AvatarSpec(3, 9, 3))
    val agents = listOf(nova, pixel, sage, mochi)

    val launch = Room(
        "r1", "Launch plan", listOf("a1", "a2", "a3"), Room.MODE_LEAD, "a1", NOW - 120_000, active = true, speaking = "a3",
        preview = Preview("Pixel", "Here's a first cut of the landing page copy, three variants."),
    )
    val trip = Room(
        "r2", "Weekend trip", listOf("a3", "a4"), Room.MODE_ROUNDTABLE, null, NOW - 3 * 3_600_000,
        preview = Preview("Sage", "Two nights is tight for the coast. I'd pick the lake and skip the long drive."),
    )
    val empty = Room("r3", "Reading group", listOf("a1", "a4"), updatedAt = NOW - 3 * 86_400_000)

    val anthropic = Provider(
        "anthropic", "Anthropic", true, listOf("claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"),
        takesKey = true, keyUrl = "https://console.anthropic.com/settings/keys", keySource = "app", keyHint = "…a1b2",
    )
    val providers = listOf(
        anthropic,
        Provider("openai", "OpenAI", true, takesKey = true, keyUrl = "https://platform.openai.com/api-keys", keySource = "environment"),
        Provider("xai", "xAI", false, takesKey = true, keyUrl = "https://console.x.ai"),
        Provider("gemini", "Gemini", false, takesKey = true, keyUrl = "https://aistudio.google.com/apikey"),
        Provider("ollama", "Ollama (local)", true),
        Provider("demo", "Demo", true, listOf("demo")),
    )

    val app = AppState(
        loaded = true, hub = HubInfo("Mike's PC", "0.1.0"), agents = agents, rooms = listOf(launch, trip, empty), providers = providers,
    )

    fun userMessage(id: String, text: String) = Message(id, id.drop(1).toLong(), Author("user", name = "You"), text)

    fun agentMessage(id: String, agent: Agent, text: String, status: String = "done", error: String? = null) =
        Message(id, id.drop(1).toLong(), Author("agent", agent.id, agent.name, agent.model), text, status, error)

    const val NOVA_PLAN = "Here's how I'd split it:\n\n- **Landing page** and signup flow\n- A short **onboarding email**\n" +
        "- A risk check before we invite anyone\n\n@Pixel can you draft the landing copy? @Sage, look for what could go wrong."
    const val PIXEL_DRAFT = "On it. Headline options:\n\n1. *Your team, minus the busywork*\n2. *Ship the thing, skip the meetings*\n\n" +
        "Signup can be a single `email` field for the beta."
    const val SAGE_RISKS = "Two risks worth a look before invites go out:\n\n- **Email deliverability.** A new domain lands in spam; " +
        "warm it up this week.\n- **Signup abuse.** One field invites bots. Add a rate limit.\n\nNeither blocks the date. @Nova, want me to own both?"

    val chat = RoomUiState(
        loaded = true,
        connected = true,
        run = RunState(true, "a3"),
        messages = listOf(
            userMessage("m1", "We launch the beta in two weeks. What do we need?"),
            agentMessage("m2", nova, NOVA_PLAN),
            agentMessage("m3", pixel, PIXEL_DRAFT),
            agentMessage("m4", sage, "", status = "streaming"),
        ),
    )
}
