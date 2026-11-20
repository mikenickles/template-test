package dev.orbit.app

import dev.orbit.app.data.Activity
import dev.orbit.app.data.Agent
import dev.orbit.app.data.Author
import dev.orbit.app.data.AvatarSpec
import dev.orbit.app.data.HubInfo
import dev.orbit.app.data.Message
import dev.orbit.app.data.Preview
import dev.orbit.app.data.Provider
import dev.orbit.app.data.Room
import dev.orbit.app.data.RunState
import dev.orbit.app.data.SharedFolder
import dev.orbit.app.data.Source
import dev.orbit.app.data.UsageSummary
import dev.orbit.app.data.UsageTotals
import dev.orbit.app.ui.AppState
import dev.orbit.app.ui.RoomUiState

/** One small, consistent world of agents, rooms and messages for screenshot and motion tests. */
object SampleData {
    const val NOW = 1_800_000_000_000L

    val nova = Agent("a1", "Nova", "the planner", "Plan things.", "anthropic", "claude-opus-5-5", AvatarSpec(0, 7, 1), listOf("web", "files"))
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
        takesKey = true, keyUrl = "https://console.anthropic.com/settings/keys", keySource = "app", keyHint = "…a1b2", abilities = true,
    )
    val providers = listOf(
        anthropic,
        Provider("openai", "OpenAI", true, takesKey = true, keyUrl = "https://platform.openai.com/api-keys", keySource = "environment"),
        Provider("xai", "xAI", false, takesKey = true, keyUrl = "https://console.x.ai"),
        Provider("gemini", "Gemini", false, takesKey = true, keyUrl = "https://aistudio.google.com/apikey"),
        Provider("ollama", "Ollama (local)", true),
        Provider("demo", "Demo", true, listOf("demo")),
    )

    val folders = listOf(
        SharedFolder("f1", "Notes", "C:\\Users\\mike\\Documents\\Notes"),
        SharedFolder("f2", "Trip planning", "D:\\Shared\\Family\\Trip planning"),
    )

    val app = AppState(
        loaded = true, hub = HubInfo("Mike's PC", "0.1.0", listOf("192.168.1.20:8787"), listOf("100.101.102.103:8787")), agents = agents, rooms = listOf(launch, trip, empty), providers = providers,
        folders = folders,
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

    const val NOVA_RAMEN = "**Fuunji** is your best bet: a 6 minute walk from the hotel, and the tsukemen gets the most praise. " +
        "Go before 11 to skip the line.\n\nYour notes say Tuesday night is free, and that you wanted somewhere with a counter, so it fits."

    /** A reply that searched, read pages and a shared file, then cited its sources. */
    val research = RoomUiState(
        loaded = true,
        connected = true,
        messages = listOf(
            userMessage("m1", "Find a ramen place near the hotel and check it against my trip notes."),
            agentMessage("m2", nova, NOVA_RAMEN).copy(
                activity = listOf(
                    Activity(Activity.KIND_SEARCH, "best ramen near Shinjuku Washington Hotel"),
                    Activity(Activity.KIND_PAGE, "https://www.tabelog.example/tokyo/fuunji"),
                    Activity(Activity.KIND_FILE, "Trip planning/japan/itinerary.md"),
                ),
                sources = listOf(
                    Source("Fuunji - Tabelog", "https://www.tabelog.example/tokyo/fuunji"),
                    Source("Shinjuku ramen guide", "https://timeout.example/tokyo/ramen"),
                ),
            ),
            userMessage("m3", "And somewhere for dessert after?"),
            agentMessage("m4", nova, "", status = "streaming").copy(
                activity = listOf(
                    Activity(Activity.KIND_SEARCH, "dessert near Shinjuku open late"),
                    Activity(Activity.KIND_PAGE, "https://www.timeout.example/tokyo/dessert", done = false),
                ),
            ),
        ),
        run = RunState(true, "a1"),
    )

    /** A month of use: two Claude agents with prices, and one local model without. */
    val usage = UsageSummary(
        days = 30,
        since = "2026-10-22",
        total = UsageTotals(input = 1_420_000, output = 186_000, cacheRead = 2_900_000, searches = 14, requests = 212, cost = 9.86, priced = false),
        agents = listOf(
            UsageTotals(agentId = "a1", name = "Nova", input = 980_000, output = 121_000, cacheRead = 2_100_000, searches = 14, cost = 7.18),
            UsageTotals(agentId = "a2", name = "Pixel", input = 300_000, output = 52_000, cacheRead = 800_000, cost = 2.68),
            UsageTotals(agentId = "a3", name = "Sage", input = 140_000, output = 13_000, priced = false, estimated = true),
        ),
        rooms = listOf(
            UsageTotals(roomId = "r1", name = "Launch plan", input = 1_100_000, output = 140_000, cacheRead = 2_400_000, cost = 7.92, priced = false),
            UsageTotals(roomId = "r2", name = "Weekend trip", input = 320_000, output = 46_000, cacheRead = 500_000, cost = 1.94),
        ),
    )

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
