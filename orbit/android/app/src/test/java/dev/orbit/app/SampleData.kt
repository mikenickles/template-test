package dev.orbit.app

import android.net.Uri
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Canvas
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.LinearGradientShader
import androidx.compose.ui.graphics.Paint
import dev.orbit.app.data.Activity
import dev.orbit.app.data.Attachment
import dev.orbit.app.ui.DraftAttachment
import dev.orbit.app.ui.components.HubImages
import dev.orbit.app.data.Agent
import dev.orbit.app.data.Author
import dev.orbit.app.data.AvatarSpec
import dev.orbit.app.data.HubInfo
import dev.orbit.app.data.CrewMade
import dev.orbit.app.data.MemoryNote
import dev.orbit.app.data.ModelDownload
import dev.orbit.app.data.ModelSuggestion
import dev.orbit.app.data.Schedule
import dev.orbit.app.data.ScheduledBy
import dev.orbit.app.data.Message
import dev.orbit.app.data.Preview
import dev.orbit.app.data.Profile
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

    val nova = Agent(
        "a1", "Nova", "the planner", "Plan things.", "anthropic", "claude-opus-5-5", AvatarSpec(9), listOf("web", "files", "memory"),
        memory = listOf(
            MemoryNote("n1", "Prefers short answers with the decision first.", "you"),
            MemoryNote("n2", "Vegetarian; doesn't eat fish either.", "agent"),
            MemoryNote("n3", "Planning a week in Kyoto in April, budget around \$3,000.", "agent"),
        ),
    )
    val pixel = Agent("a2", "Pixel", "the builder", "Build things.", "openai", "gpt-large", AvatarSpec(7))
    val sage = Agent("a3", "Sage", "the skeptic", "Poke holes.", "ollama", "llama-local", AvatarSpec(2))
    val mochi = Agent("a4", "Mochi", "the writer", "", "xai", "grok-fast", AvatarSpec(14))
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

    val smallModels = listOf(
        ModelSuggestion("llama3.2", "Llama 3.2 (3B)", "2.0 GB", "A good first pick. Runs on most PCs with 8 GB of memory."),
        ModelSuggestion("gemma3:4b", "Gemma 3 (4B)", "3.3 GB", "A little smarter and slower. Best with 16 GB of memory."),
        ModelSuggestion("gemma3:1b", "Gemma 3 (1B)", "0.8 GB", "Tiny and quick, for older PCs. Keep its jobs simple."),
    )
    val ollama = Provider(
        "ollama", "Ollama (local)", false, local = true, running = false,
        installUrl = "https://ollama.com/download", suggestions = smallModels,
    )
    val ollamaDownloading = ollama.copy(
        running = true, configured = true, models = listOf("gemma3:1b"),
        download = ModelDownload("llama3.2", "Downloading", 42),
    )

    val anthropic = Provider(
        "anthropic", "Anthropic", true, listOf("claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"),
        takesKey = true, keyUrl = "https://console.anthropic.com/settings/keys", keySource = "app", keyHint = "…a1b2", abilities = true,
    )
    val providers = listOf(
        anthropic,
        Provider("openai", "OpenAI", true, takesKey = true, keyUrl = "https://platform.openai.com/api-keys", keySource = "environment"),
        Provider("xai", "xAI", false, takesKey = true, keyUrl = "https://console.x.ai"),
        Provider("gemini", "Gemini", false, takesKey = true, keyUrl = "https://aistudio.google.com/apikey"),
        ollama,
        Provider("demo", "Demo", true, listOf("demo")),
    )

    val folders = listOf(
        SharedFolder("f1", "Notes", "C:\\Users\\you\\Documents\\Notes"),
        SharedFolder("f2", "Trip planning", "D:\\Shared\\Family\\Trip planning"),
    )

    val profile = Profile(
        "Alex",
        listOf(
            MemoryNote("p1", "Works as a product designer at a small startup.", "Nova"),
            MemoryNote("p2", "Likes short answers with the decision first.", "you"),
            MemoryNote("p3", "Training for a half marathon in the spring.", "Nova"),
        ),
    )

    val app = AppState(
        loaded = true, hub = HubInfo("Home PC", "0.1.0", listOf("192.168.1.20:8787"), listOf("100.101.102.103:8787")), agents = agents, rooms = listOf(launch, trip, empty), providers = providers,
        folders = folders, profile = profile,
    )

    /** A hub where the user hasn't met their guide yet. */
    val newcomer = app.copy(profile = Profile(), rooms = emptyList(), agents = emptyList())

    val introRoom = Room("r9", "Getting to know you", listOf("a1"), intro = true, updatedAt = NOW - 60_000)

    /** The guide getting to know the user, ending with the crew it built. */
    val intro = RoomUiState(
        loaded = true,
        connected = true,
        messages = listOf(
            agentMessage("m1", nova, "Hi! I'm **Nova**, your guide in Orbit. Let's get to know each other so your whole crew can help you well. What should I call you?"),
            userMessage("m2", "Alex! I'm a product designer, and I'm training for a half marathon."),
            agentMessage("m3", nova, "Love that, Alex. Here's a crew I'd suggest:\n\n- **Pixel**, the builder, for prototypes and side projects\n- **Mochi**, the coach, for your training plan\n\nWant me to set them up?").copy(
                activity = listOf(
                    Activity(Activity.KIND_REMEMBER, "Works as a product designer at a small startup."),
                    Activity(Activity.KIND_REMEMBER, "Training for a half marathon in the spring."),
                ),
            ),
            userMessage("m4", "Yes please!"),
            agentMessage("m5", nova, "Done! Your crew is ready, and they already know what you told me. Come back here anytime.").copy(
                crew = CrewMade("r1", "Launch plan", listOf("a1", "a2", "a4")),
            ),
        ),
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

    /** A stand-in photo: a soft diagonal gradient with a sun, drawn rather than loaded. */
    fun photo(width: Int, height: Int, from: Color, to: Color): ImageBitmap {
        val image = ImageBitmap(width, height)
        val canvas = Canvas(image)
        canvas.drawRect(0f, 0f, width.toFloat(), height.toFloat(), Paint().apply {
            shader = LinearGradientShader(Offset.Zero, Offset(width.toFloat(), height.toFloat()), listOf(from, to))
        })
        canvas.drawCircle(Offset(width * 0.72f, height * 0.3f), width * 0.12f, Paint().apply { color = Color.White.copy(alpha = 0.55f) })
        return image
    }

    val menu = Attachment("f1", "menu.jpg", "image/jpeg", 412_000)
    val holiday = listOf(
        Attachment("f2", "IMG_2041.jpg", "image/jpeg", 380_000),
        Attachment("f3", "IMG_2042.jpg", "image/jpeg", 401_000),
        Attachment("f4", "IMG_2043.jpg", "image/jpeg", 356_000),
    )
    val itinerary = Attachment("f5", "Kyoto itinerary.pdf", "application/pdf", 2_480_000)

    /** Photos for the attachments above, ready at once so screenshots show them. */
    val images = object : HubImages {
        private val byId by lazy {
            mapOf(
            "f1" to photo(600, 800, Color(0xFFE9B872), Color(0xFF9C4A2F)),
            "f2" to photo(400, 400, Color(0xFF8EC5E8), Color(0xFF2F5D8C)),
            "f3" to photo(400, 400, Color(0xFFB8E0A8), Color(0xFF3F7A4A)),
            "f4" to photo(400, 400, Color(0xFFF2C6D8), Color(0xFF8C3F6A)),
            )
        }

        override fun cached(id: String, maxEdge: Int) = byId[id]

        override suspend fun load(id: String, maxEdge: Int) = byId[id]
    }

    /** A room where photos and a PDF were shared, with more waiting in the composer. Drawn on first use. */
    val shared by lazy { RoomUiState(
        loaded = true,
        connected = true,
        messages = listOf(
            userMessage("m1", "What should I order? I don't eat pork.").copy(attachments = listOf(menu)),
            agentMessage("m2", nova, "Go for the **yuzu shio ramen** (chicken broth) and the gyoza are pork, so skip those. The **tamago kake gohan** is a safe side."),
            userMessage("m3", "").copy(attachments = holiday + itinerary),
        ),
        drafts = listOf(
            DraftAttachment("d1", Uri.parse("content://media/1"), "IMG_2050.jpg", "image/jpeg", photo(160, 160, Color(0xFFD9C7F2), Color(0xFF5B3F8C))),
            DraftAttachment("d2", Uri.parse("content://docs/2"), "Hotel booking.pdf", "application/pdf"),
        ),
    ) }

    /** Two schedules in the launch room, one paused. Next runs are counted from [NOW]. */
    val schedules = listOf(
        Schedule(
            "s1", "r1", "Give me a two-line status: what moved yesterday, and what's blocking.", "08:15", (1..5).toList(), true,
            nextRunAt = java.time.Instant.ofEpochMilli(NOW).atZone(java.time.ZoneId.systemDefault()).toLocalDate().plusDays(1)
                .atTime(8, 15).atZone(java.time.ZoneId.systemDefault()).toInstant().toEpochMilli(),
        ),
        Schedule("s2", "r1", "Draft the Friday update for the team from this week's messages.", "16:30", listOf(5), false),
    )

    /** A morning briefing the hub posted on its own, and the reply. */
    val briefing = RoomUiState(
        loaded = true,
        connected = true,
        messages = listOf(
            userMessage("m1", "Give me a two-line status: what moved yesterday, and what's blocking.")
                .copy(scheduled = ScheduledBy("s1", "Weekdays at 08:15")),
            agentMessage("m2", nova, "**Moved:** landing copy is final and signup is live on staging.\n**Blocking:** the email domain still needs warming up before invites go out."),
        ),
    )

    /** A reply that uses every kind of formatting agents write. */
    const val RICH = "## Three ramen spots near the hotel\n\n" +
        "| Place | Walk | Price | Vegetarian |\n|:--|--:|--:|:-:|\n" +
        "| Fuunji | 6 min | ¥1,100 | No |\n| Ichiran | 9 min | ¥980 | No |\n| T's Tantan | 4 min | ¥1,250 | Yes |\n\n" +
        "> T's Tantan is the only fully vegan one, inside Tokyo Station.\n\n" +
        "Booking page: [tstantan.example](https://tstantan.example/book), or see https://www.ramen.example/tokyo/best\n\n" +
        "- Go before 11\n  - weekends get busy by 11:30\n- ~~Cash only~~ cards work now\n\n---\n\n" +
        "```python\nbudget = 3000\nper_day = budget / 7\nprint(f\"{per_day:.0f} a day\")\n```"

    val rich = RoomUiState(
        loaded = true,
        connected = true,
        messages = listOf(
            userMessage("m1", "Compare the ramen places near the hotel."),
            agentMessage("m2", nova, RICH),
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
