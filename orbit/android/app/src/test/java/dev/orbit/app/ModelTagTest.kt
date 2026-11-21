package dev.orbit.app

import dev.orbit.app.data.Agent
import dev.orbit.app.data.Message
import dev.orbit.app.data.Author
import dev.orbit.app.ui.screens.modelTag
import dev.orbit.app.ui.screens.suggestionsFor
import org.junit.Assert.assertEquals
import org.junit.Test

class ModelTagTest {
    @Test fun modelsReadByTheirEverydayNames() {
        assertEquals("Opus 5.5", modelTag("claude-opus-5-5"))
        assertEquals("Haiku 5", modelTag("claude-haiku-5"))
        assertEquals("Sonnet 4.5", modelTag("anthropic/claude-sonnet-4-5-20250929"))
        assertEquals("GPT-6.1 terra", modelTag("gpt-6.1-terra"))
        assertEquals("llama3.2", modelTag("llama3.2:latest"))
    }

    @Test fun suggestionsBringInWhoeverHasBeenQuiet() {
        val nova = Agent(id = "a1", name = "Nova")
        val mochi = Agent(id = "a2", name = "Mochi Bear")
        val said = listOf(Message(id = "m1", author = Author(type = "agent", agentId = "a1", name = "Nova")))
        val suggestions = suggestionsFor(listOf(nova, mochi), said)
        assertEquals(listOf("Summarize so far", "What's next?", "@MochiBear"), suggestions.map { it.label })
        assertEquals("@MochiBear ", suggestions.last().text)
        assertEquals(false, suggestions.last().send)
    }
}
