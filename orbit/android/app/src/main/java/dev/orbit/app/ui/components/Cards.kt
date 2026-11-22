package dev.orbit.app.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.getValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.orbit.app.data.AvatarSpec
import dev.orbit.app.data.Card
import dev.orbit.app.data.CardEvent
import dev.orbit.app.ui.theme.Orbit
import dev.orbit.app.ui.theme.OrbitDimens
import dev.orbit.app.ui.theme.OrbitType
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale

/** The time zone cards show times in: the phone's own, fixed in screenshot tests. */
val LocalZone = staticCompositionLocalOf<ZoneId> { ZoneId.systemDefault() }

/**
 * A card for what an agent's tool found or did, in that agent's colors: a stretch of the calendar, an
 * event it added, emails, a draft it saved, Drive files, or a follow-up or watch it set.
 * [live] says whether a follow-up or watch is still set; [onCancel] cancels it.
 */
@Composable
fun ToolCard(
    card: Card,
    avatar: AvatarSpec,
    agentName: String,
    now: Long,
    modifier: Modifier = Modifier,
    live: Boolean = true,
    onCancel: (Card) -> Unit = {},
    onDecide: (Card, Boolean) -> Unit = { _, _ -> },
) {
    ToolCardBody(card, avatar, agentName, now, modifier, live, onCancel, onDecide)
}

@Composable
private fun ToolCardBody(
    card: Card,
    avatar: AvatarSpec,
    agentName: String,
    now: Long,
    modifier: Modifier,
    live: Boolean,
    onCancel: (Card) -> Unit,
    onDecide: (Card, Boolean) -> Unit,
) {
    when (card.type) {
        Card.APPROVAL -> ApprovalCard(card, avatar, agentName, modifier) { allow -> onDecide(card, allow) }
        Card.EVENTS -> EventsCard(card, avatar, now, modifier)
        Card.EVENT_ADDED -> card.event?.let { EventAddedCard(it, avatar, modifier) }
        Card.EMAILS -> EmailsCard(card, avatar, now, modifier)
        Card.DRAFT -> DraftCard(card, avatar, modifier)
        Card.FILES -> FilesCard(card, avatar, now, modifier)
        Card.FOLLOWUP, Card.WATCH -> PlanCard(card, avatar, agentName, now, live, modifier) { onCancel(card) }
    }
}

// ---------- Calendar ----------

@Composable
private fun EventsCard(card: Card, avatar: AvatarSpec, now: Long, modifier: Modifier) {
    val c = Orbit.colors
    val zone = LocalZone.current
    val events = card.events
    val days = events.mapNotNull { eventDay(it, zone) }.distinct()
    val firstDay = days.firstOrNull() ?: card.from?.let { Instant.ofEpochMilli(it).atZone(zone).toLocalDate() } ?: LocalDate.now(zone)
    val upcoming = events.indexOfFirst { (startMillis(it, zone) ?: 0) > now }
    CardFrame(modifier, footer = { OpenPill("Open Calendar", events.firstOrNull()?.link ?: CALENDAR) }) {
        Row(Modifier.padding(OrbitDimens.rowPad), verticalAlignment = Alignment.CenterVertically) {
            DateBadge(firstDay, avatar)
            Column(Modifier.padding(start = 12.dp)) {
                Text(
                    if (days.size <= 1) dayTitle(firstDay) else rangeLabel(days.first(), days.last()),
                    style = OrbitType.titleS,
                    color = c.text,
                )
                Text(
                    "Google Calendar · " + when (events.size) { 0 -> "nothing on"; 1 -> "1 event"; else -> "${events.size} events" },
                    style = OrbitType.caption,
                    color = c.textTertiary,
                )
            }
        }
        Hairline()
        Column(Modifier.padding(start = OrbitDimens.rowPad, end = 12.dp, top = 12.dp, bottom = 12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            if (events.isEmpty()) Text("Your calendar is clear.", style = OrbitType.bodyM, color = c.textSecondary)
            events.forEachIndexed { i, event ->
                val day = eventDay(event, zone)
                if (days.size > 1 && day != null && day != events.getOrNull(i - 1)?.let { eventDay(it, zone) }) {
                    Text(
                        dayHeading(day),
                        Modifier.padding(top = if (i == 0) 0.dp else 8.dp, bottom = 2.dp).semantics { heading() },
                        style = OrbitType.overline,
                        color = c.textTertiary,
                    )
                }
                if (i > 0 && day != null && day == eventDay(events[i - 1], zone)) {
                    freeBetween(events[i - 1], event, zone)?.let { FreeGap(it) }
                }
                EventRow(event, if (i == upcoming) c.surfaceHigh else characterTile(), if (i == upcoming) untilLabel(event, now, zone) else null, c.text)
            }
        }
    }
}

@Composable
private fun EventRow(event: CardEvent, fill: Color, tag: String?, tagColor: Color) {
    val c = Orbit.colors
    val zone = LocalZone.current
    Row {
        Column(Modifier.width(68.dp).padding(top = 9.dp)) {
            if (event.allDay) {
                Text("All day", style = OrbitType.mono, color = c.text)
            } else {
                Text(clock(event.start, zone, bare = true), style = OrbitType.mono, color = c.text)
                Text(clock(event.end, zone), style = OrbitType.mono, color = c.textTertiary)
            }
        }
        Column(
            Modifier
                .weight(1f)
                .clip(RoundedCornerShape(OrbitDimens.radiusS))
                .background(fill)
                .padding(horizontal = 12.dp, vertical = 9.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(event.title, Modifier.weight(1f), style = OrbitType.titleS, color = c.text, maxLines = 2, overflow = TextOverflow.Ellipsis)
                tag?.let { Text(it, Modifier.padding(start = 8.dp), style = OrbitType.caption.copy(fontWeight = FontWeight.Medium), color = tagColor) }
            }
            val detail = listOfNotNull(event.location.ifBlank { null }, lengthLabel(event, zone)).joinToString(" · ")
            if (detail.isNotEmpty()) Text(detail, Modifier.padding(top = 2.dp), style = OrbitType.bodyS, color = c.textSecondary, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

/** A dashed line between two events with the free time it leaves. */
@Composable
private fun FreeGap(label: String) {
    val c = Orbit.colors
    val dash = c.line
    Row(Modifier.fillMaxWidth().height(26.dp), verticalAlignment = Alignment.CenterVertically) {
        Spacer(Modifier.width(68.dp))
        Canvas(Modifier.weight(1f).height(1.dp)) {
            drawLine(dash, Offset(0f, 0f), Offset(size.width, 0f), strokeWidth = 1.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(6f, 6f)))
        }
        Text(label, Modifier.padding(horizontal = 8.dp), style = OrbitType.caption, color = c.textTertiary)
        Canvas(Modifier.width(16.dp).height(1.dp)) {
            drawLine(dash, Offset(0f, 0f), Offset(size.width, 0f), strokeWidth = 1.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(6f, 6f)))
        }
    }
}

@Composable
private fun DateBadge(day: LocalDate, avatar: AvatarSpec) {
    Column(
        Modifier.size(38.dp).clip(RoundedCornerShape(11.dp)).background(characterTile()),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(weekdayBadge(day), style = OrbitType.overline.copy(fontSize = OrbitType.overline.fontSize * 0.85f), color = Orbit.colors.textSecondary)
        Text(day.dayOfMonth.toString(), style = OrbitType.titleS, color = Orbit.colors.text)
    }
}

@Composable
private fun EventAddedCard(event: CardEvent, avatar: AvatarSpec, modifier: Modifier) {
    val c = Orbit.colors
    val zone = LocalZone.current
    CardFrame(modifier, footer = { OpenPill("Open Calendar", event.link.ifBlank { CALENDAR }) }) {
        Row(Modifier.padding(start = OrbitDimens.rowPad, end = OrbitDimens.rowPad, top = 14.dp, bottom = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(28.dp).clip(CircleShape).background(characterTile()), contentAlignment = Alignment.Center) {
                OrbitIcon(OrbitIcon.Check, size = 16.dp, tint = c.textSecondary)
            }
            Text("Added to your calendar", Modifier.padding(start = 10.dp), style = OrbitType.titleS, color = c.text)
        }
        Column(
            Modifier
                .padding(start = 12.dp, end = 12.dp, bottom = 12.dp)
                .fillMaxWidth()
                .clip(RoundedCornerShape(OrbitDimens.radiusS))
                .background(characterTile())
                .padding(horizontal = 12.dp, vertical = 10.dp),
        ) {
            Text(event.title, style = OrbitType.titleS, color = c.text)
            Text(
                listOfNotNull(whenLabel(event, zone), event.location.ifBlank { null }).joinToString(" · "),
                Modifier.padding(top = 2.dp),
                style = OrbitType.bodyS,
                color = c.textSecondary,
            )
        }
    }
}

// ---------- Gmail ----------

@Composable
private fun EmailsCard(card: Card, avatar: AvatarSpec, now: Long, modifier: Modifier) {
    val c = Orbit.colors
    val uri = LocalUriHandler.current
    val shown = card.emails.take(MAX_ROWS)
    CardFrame(modifier, footer = if (card.emails.size > MAX_ROWS) ({ Text("${card.emails.size - MAX_ROWS} more in Gmail", style = OrbitType.caption, color = c.textTertiary) }) else null) {
        shown.forEachIndexed { i, email ->
            if (i > 0) Hairline(Modifier.padding(start = 62.dp))
            Row(
                Modifier
                    .fillMaxWidth()
                    .tap(RoundedCornerShape(0.dp), 0.99f) { openSafely(uri, email.link) }
                    .padding(horizontal = 14.dp, vertical = 11.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(Modifier.size(34.dp).clip(CircleShape).background(c.surfaceHigh), contentAlignment = Alignment.Center) {
                    Text(initials(email.from), style = OrbitType.label, color = c.textSecondary)
                }
                Column(Modifier.weight(1f).padding(start = 12.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        if (email.unread) Box(Modifier.padding(end = 6.dp).size(7.dp).clip(CircleShape).background(c.textSecondary))
                        Text(email.from, Modifier.weight(1f), style = OrbitType.titleS, color = c.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        email.at?.let { Text(shortWhen(it, now, LocalZone.current), Modifier.padding(start = 8.dp), style = OrbitType.caption, color = c.textTertiary) }
                    }
                    Text(
                        listOf(email.subject, email.snippet).filter { it.isNotBlank() }.joinToString(" · "),
                        style = OrbitType.bodyS,
                        color = c.textSecondary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
        if (shown.isEmpty()) Text("No emails matched.", Modifier.padding(OrbitDimens.rowPad), style = OrbitType.bodyM, color = c.textSecondary)
    }
}

@Composable
private fun DraftCard(card: Card, avatar: AvatarSpec, modifier: Modifier) {
    val c = Orbit.colors
    CardFrame(
        modifier,
        footer = {
            OpenPill("Open in Gmail", card.link.ifBlank { GMAIL_DRAFTS })
            Spacer(Modifier.weight(1f))
            Text("You send it from Gmail", style = OrbitType.caption, color = c.textTertiary)
        },
    ) {
        Row(Modifier.padding(start = 14.dp, end = 14.dp, top = 12.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(
                "DRAFT",
                Modifier.clip(RoundedCornerShape(6.dp)).background(characterTile()).padding(horizontal = 7.dp, vertical = 2.dp),
                style = OrbitType.overline,
                color = c.textSecondary,
            )
            Text(
                listOf("To ${card.recipient}", card.subject).filter { it.isNotBlank() }.joinToString(" · "),
                Modifier.padding(start = 8.dp),
                style = OrbitType.bodyS,
                color = c.textSecondary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Text(card.body.trim(), Modifier.padding(start = 14.dp, end = 14.dp, bottom = 12.dp), style = OrbitType.bodyM, color = c.text, maxLines = 8, overflow = TextOverflow.Ellipsis)
    }
}

// ---------- Drive ----------

@Composable
private fun FilesCard(card: Card, avatar: AvatarSpec, now: Long, modifier: Modifier) {
    val c = Orbit.colors
    val uri = LocalUriHandler.current
    CardFrame(modifier) {
        card.files.take(MAX_ROWS).forEachIndexed { i, file ->
            if (i > 0) Hairline(Modifier.padding(start = 68.dp))
            Row(
                Modifier
                    .fillMaxWidth()
                    .tap(RoundedCornerShape(0.dp), 0.99f) { openSafely(uri, file.link) }
                    .padding(horizontal = 14.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(Modifier.size(40.dp).clip(RoundedCornerShape(OrbitDimens.radiusS)).background(characterTile()), contentAlignment = Alignment.Center) {
                    OrbitIcon(OrbitIcon.File, size = 20.dp, tint = c.textSecondary)
                }
                Column(Modifier.weight(1f).padding(start = 12.dp)) {
                    Text(file.name, style = OrbitType.titleS, color = c.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(
                        listOfNotNull(file.kind.ifBlank { null }, file.modified?.let { "edited ${shortWhen(it, now, LocalZone.current, phrase = true)}" }).joinToString(" · "),
                        style = OrbitType.caption,
                        color = c.textTertiary,
                        maxLines = 1,
                    )
                }
                OrbitIcon(OrbitIcon.Chevron, size = 18.dp, tint = c.textTertiary)
            }
        }
    }
}

// ---------- Follow-ups and watches ----------

@Composable
private fun PlanCard(card: Card, avatar: AvatarSpec, agentName: String, now: Long, live: Boolean, modifier: Modifier, onCancel: () -> Unit) {
    val c = Orbit.colors
    val followUp = card.type == Card.FOLLOWUP
    CardFrame(
        modifier,
        footer = {
            if (live) Pill(if (followUp) "Cancel" else "Stop watching", onCancel)
            else Text(
                when {
                    !followUp -> "Stopped"
                    (card.time ?: 0) <= now -> "Checked in"
                    else -> "Cancelled"
                },
                style = OrbitType.caption,
                color = c.textTertiary,
            )
        },
    ) {
        Row(Modifier.padding(OrbitDimens.rowPad), verticalAlignment = Alignment.CenterVertically) {
            AgentPortrait(avatar, size = 40.dp)
            Column(Modifier.padding(start = 12.dp)) {
                Text(if (followUp) "$agentName will check in" else "$agentName is watching", style = OrbitType.titleS, color = c.text)
                Text(
                    if (followUp) card.time?.let { followUpWhen(it, now, LocalZone.current) } ?: "" else if (card.every == "hour") "Checked every hour" else "Checked every day",
                    style = OrbitType.caption,
                    color = c.textSecondary,
                )
            }
        }
        val detail = if (followUp) card.note else listOf(card.what, card.condition.ifBlank { null }?.let { "for when $it" }).filterNotNull().joinToString(", ")
        if (detail.isNotBlank()) Text(detail, Modifier.padding(start = OrbitDimens.rowPad, end = OrbitDimens.rowPad, bottom = 12.dp), style = OrbitType.bodyS, color = c.textSecondary)
    }
}

// ---------- Asking first ----------

/** A big action an agent wants to take in the Treehouse browser, with Allow and Deny until it's answered. */
@Composable
private fun ApprovalCard(card: Card, avatar: AvatarSpec, agentName: String, modifier: Modifier, onDecide: (Boolean) -> Unit) {
    val c = Orbit.colors
    // Answered here, before the hub's update arrives: the buttons go quiet so it isn't sent twice.
    var answered by remember(card.ref) { mutableStateOf(false) }
    val pending = card.status == Card.PENDING
    CardFrame(
        modifier,
        footer = {
            if (pending) {
                Pill("Deny", { if (!answered) { answered = true; onDecide(false) } }, dimmed = answered)
                Spacer(Modifier.width(8.dp))
                Pill("Allow", { if (!answered) { answered = true; onDecide(true) } }, selected = !answered, dimmed = answered)
                Spacer(Modifier.weight(1f))
                Text("Waiting for you", style = OrbitType.caption, color = c.textSecondary)
            } else {
                Text(
                    when (card.status) {
                        Card.ALLOWED -> "You allowed this"
                        Card.DENIED -> "You said no"
                        "expired" -> "No answer in time, so it wasn't done"
                        else -> "The reply stopped, so it wasn't done"
                    },
                    style = OrbitType.caption,
                    color = c.textTertiary,
                )
            }
        },
    ) {
        Row(Modifier.padding(OrbitDimens.rowPad), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(40.dp).clip(CircleShape).background(characterTile()), contentAlignment = Alignment.Center) {
                OrbitIcon(OrbitIcon.Globe, size = 20.dp, tint = c.textSecondary)
            }
            Column(Modifier.padding(start = 12.dp)) {
                Text(if (pending) "$agentName asks first" else "$agentName asked first", style = OrbitType.caption, color = c.textTertiary)
                Text(card.action, style = OrbitType.titleS, color = c.text)
                if (card.site.isNotBlank()) Text("on ${card.site}, in the Treehouse browser", style = OrbitType.bodyS, color = c.textSecondary)
            }
        }
    }
}

// ---------- Shared parts ----------

@Composable
private fun CardFrame(modifier: Modifier, footer: (@Composable androidx.compose.foundation.layout.RowScope.() -> Unit)? = null, content: @Composable () -> Unit) {
    val shape = RoundedCornerShape(24.dp)
    Box(modifier.fillMaxWidth().quietCard(shape, strength = 0.6f).clip(shape)) {
        Column {
            content()
            if (footer != null) {
                Hairline()
                Row(Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically, content = footer)
            }
        }
    }
}

@Composable
private fun OpenPill(label: String, link: String) {
    val uri = LocalUriHandler.current
    Pill(label, { openSafely(uri, link) })
}

private fun openSafely(uri: androidx.compose.ui.platform.UriHandler, link: String) {
    // Only web links Google gave the hub: never anything that would open something else on the phone.
    if (link.startsWith("https://")) runCatching { uri.openUri(link) }
}

private const val MAX_ROWS = 5
private const val CALENDAR = "https://calendar.google.com/calendar/r"
private const val GMAIL_DRAFTS = "https://mail.google.com/mail/u/0/#drafts"

// ---------- Times, as cards say them ----------

/** "DP" for Dana Park, "K" for kim@x.com. */
internal fun initials(name: String): String {
    val words = name.substringBefore('@').split(' ', '.', '_', '-').filter { it.isNotBlank() && it[0].isLetterOrDigit() }
    return words.take(2).joinToString("") { it.take(1).uppercase() }.ifEmpty { "?" }
}

private fun zoned(value: String?, zone: ZoneId): ZonedDateTime? = value?.let {
    runCatching { OffsetDateTime.parse(it).atZoneSameInstant(zone) }.getOrNull()
        ?: runCatching { LocalDate.parse(it).atStartOfDay(zone) }.getOrNull()
}

internal fun eventDay(event: CardEvent, zone: ZoneId): LocalDate? = zoned(event.start, zone)?.toLocalDate()

private fun startMillis(event: CardEvent, zone: ZoneId): Long? = zoned(event.start, zone)?.toInstant()?.toEpochMilli()

/** "9:30 am", or "21:30" where the phone uses a 24-hour clock; [bare] leaves am/pm off. */
internal fun clock(value: String?, zone: ZoneId, bare: Boolean = false): String {
    val at = zoned(value, zone) ?: return ""
    val text = timeOf(at)
    return if (bare) text.replace(Regex("[\\s\u00A0]?[ap]m$"), "") else text
}

private fun timeOf(at: ZonedDateTime): String =
    at.format(DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT).withLocale(Locale.getDefault())).replace("AM", "am").replace("PM", "pm").replace('\u202F', '\u00A0').replace(' ', '\u00A0')

/** "1 hr", "45 min", "2 hr 30 min"; nothing for all-day events. */
internal fun lengthLabel(event: CardEvent, zone: ZoneId): String? {
    if (event.allDay) return null
    val start = zoned(event.start, zone) ?: return null
    val end = zoned(event.end, zone) ?: return null
    return durationLabel(Duration.between(start, end).toMinutes())
}

private fun durationLabel(minutes: Long): String? = when {
    minutes <= 0 -> null
    minutes < 60 -> "$minutes min"
    minutes % 60 == 0L -> "${minutes / 60} hr"
    else -> "${minutes / 60} hr ${minutes % 60} min"
}

/** "4 hours free" between two events on the same day, when the gap is an hour or more. */
internal fun freeBetween(before: CardEvent, after: CardEvent, zone: ZoneId): String? {
    if (before.allDay || after.allDay) return null
    val end = zoned(before.end, zone) ?: return null
    val start = zoned(after.start, zone) ?: return null
    val minutes = Duration.between(end, start).toMinutes()
    if (minutes < 60) return null
    val hours = minutes / 60
    val half = minutes % 60 >= 30
    return when {
        hours == 1L && !half -> "1 hour free"
        half -> "$hours½ hours free"
        else -> "$hours hours free"
    }
}

/** "In 2 hr", "In 20 min" for the next event today; "Now" once it has started. */
internal fun untilLabel(event: CardEvent, now: Long, zone: ZoneId): String? {
    val start = startMillis(event, zone) ?: return null
    val minutes = (start - now) / 60_000
    return when {
        event.allDay -> null
        minutes < 0 -> null
        minutes < 60 -> "In $minutes min"
        minutes < 12 * 60 -> "In ${minutes / 60} hr"
        else -> null
    }
}

/** "Friday, January 15". */
private fun dayTitle(day: LocalDate): String = day.format(DateTimeFormatter.ofPattern("EEEE, MMMM d", Locale.getDefault()))

/** "FRI, JAN 15", between days in a card that covers several. */
private fun dayHeading(day: LocalDate): String = day.format(DateTimeFormatter.ofPattern("EEE, MMM d", Locale.getDefault())).uppercase()

/** "FRI", on the date badge. */
private fun weekdayBadge(day: LocalDate): String = day.format(DateTimeFormatter.ofPattern("EEE", Locale.getDefault())).uppercase()

private fun rangeLabel(first: LocalDate, last: LocalDate): String {
    val day = DateTimeFormatter.ofPattern("MMM d", Locale.getDefault())
    return if (first.month == last.month) "${first.format(day)} – ${last.dayOfMonth}" else "${first.format(day)} – ${last.format(day)}"
}

/** "Tue, Nov 24 · 9:30 – 10:15" or "Thu, Dec 24 · All day". */
internal fun whenLabel(event: CardEvent, zone: ZoneId): String? {
    val start = zoned(event.start, zone) ?: return null
    val day = start.format(DateTimeFormatter.ofPattern("EEE, MMM d", Locale.getDefault()))
    if (event.allDay) return "$day · All day"
    val end = zoned(event.end, zone)
    return "$day · ${timeOf(start)}" + (end?.let { " – ${timeOf(it)}" } ?: "")
}

/** "6:40", "Yesterday", "Thu", "Nov 12"; with [phrase], "today", "yesterday", "on Thu", "on Nov 12". */
internal fun shortWhen(at: Long, now: Long, zone: ZoneId, phrase: Boolean = false): String {
    val then = Instant.ofEpochMilli(at).atZone(zone)
    val today = Instant.ofEpochMilli(now).atZone(zone).toLocalDate()
    val days = Duration.between(then.toLocalDate().atStartOfDay(zone), today.atStartOfDay(zone)).toDays()
    return when {
        days <= 0L -> if (phrase) "today" else timeOf(then)
        days == 1L -> if (phrase) "yesterday" else "Yesterday"
        days < 7 -> (if (phrase) "on " else "") + then.format(DateTimeFormatter.ofPattern("EEE", Locale.getDefault()))
        else -> (if (phrase) "on " else "") + then.format(DateTimeFormatter.ofPattern("MMM d", Locale.getDefault()))
    }
}

/** "Today at 6:00 PM", "Tomorrow at 9:00 AM", "Fri, Dec 4 at 9:00 AM". */
internal fun followUpWhen(at: Long, now: Long, zone: ZoneId): String {
    val then = Instant.ofEpochMilli(at).atZone(zone)
    val today = Instant.ofEpochMilli(now).atZone(zone).toLocalDate()
    val time = timeOf(then)
    val day = when (then.toLocalDate()) {
        today -> "Today"
        today.plusDays(1) -> "Tomorrow"
        else -> then.format(DateTimeFormatter.ofPattern("EEE, MMM d", Locale.getDefault()))
    }
    return "$day at $time"
}
