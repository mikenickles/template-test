package dev.orbit.app

import dev.orbit.app.data.ActivityUpdate
import dev.orbit.app.data.Card
import dev.orbit.app.data.CardEvent
import dev.orbit.app.data.CardsUpdate
import dev.orbit.app.data.RoomEvent
import dev.orbit.app.ui.components.followUpWhen
import dev.orbit.app.ui.components.freeBetween
import dev.orbit.app.ui.components.initials
import dev.orbit.app.ui.components.lengthLabel
import dev.orbit.app.ui.components.shortWhen
import dev.orbit.app.ui.components.untilLabel
import dev.orbit.app.ui.reduce
import java.time.ZoneOffset
import java.util.Locale
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test

class CardTimesTest {
    private val utc = ZoneOffset.UTC
    private val now = SampleData.NOW // 2027-01-15 08:00 UTC
    private val market = CardEvent("Farmers market", "2027-01-15T11:00:00Z", "2027-01-15T12:00:00Z")
    private val party = CardEvent("Party", "2027-01-15T16:00:00Z", "2027-01-15T18:30:00Z")

    @Before fun english() = Locale.setDefault(Locale.US)

    @Test fun lengthsAndGaps() {
        assertEquals("1 hr", lengthLabel(market, utc))
        assertEquals("2 hr 30 min", lengthLabel(party, utc))
        assertEquals("4 hours free", freeBetween(market, party, utc))
        assertNull(freeBetween(market, market.copy(start = "2027-01-15T12:30:00Z"), utc))
        assertNull(lengthLabel(CardEvent("Trip", "2027-01-15", "2027-01-16", allDay = true), utc))
    }

    @Test fun untilTheNextEvent() {
        assertEquals("In 3 hr", untilLabel(market, now, utc))
        assertEquals("In 20 min", untilLabel(market, market.let { java.time.Instant.parse(it.start).toEpochMilli() } - 20 * 60_000, utc))
        assertNull(untilLabel(market, now + 5 * 3_600_000, utc))
    }

    @Test fun shortTimes() {
        assertEquals("6:40\u00A0am", shortWhen(now - 80 * 60_000, now, utc))
        assertEquals("Yesterday", shortWhen(now - 86_400_000, now, utc))
        assertEquals("on Tue", shortWhen(now - 3 * 86_400_000, now, utc, phrase = true))
        assertEquals("Tomorrow at 9:00\u00A0am", followUpWhen(now + 86_400_000 + 3_600_000, now, utc))
    }

    @Test fun senderInitials() {
        assertEquals("DP", initials("Dana Park"))
        assertEquals("K", initials("kim@example.com"))
        assertEquals("?", initials(""))
    }

    @Test fun cardsArriveLiveOnTheirReply() {
        val base = SampleData.chat
        val id = base.messages.last().id
        val card = Card(id = "c1", type = Card.FILES, at = 3)
        val updated = base.reduce(RoomEvent.Cards(CardsUpdate(id, listOf(card))))!!
        assertEquals(listOf(card), updated.messages.last().cards)
        assertNull(base.reduce(RoomEvent.Cards(CardsUpdate("nope", listOf(card)))))
        // Other updates keep the cards.
        val stepped = updated.reduce(RoomEvent.Progress(ActivityUpdate(id, emptyList())))!!
        assertEquals(listOf(card), stepped.messages.last().cards)
    }
}
