package dev.orbit.app.ui.screens

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.orbit.app.data.Room
import dev.orbit.app.data.Schedule
import dev.orbit.app.ui.components.BarAction
import dev.orbit.app.ui.components.DangerRow
import dev.orbit.app.ui.components.FieldLabel
import dev.orbit.app.ui.components.Hairline
import dev.orbit.app.ui.components.OrbitCard
import dev.orbit.app.ui.components.OrbitField
import dev.orbit.app.ui.components.OrbitIcon
import dev.orbit.app.ui.components.OrbitSwitch
import dev.orbit.app.ui.components.Pill
import dev.orbit.app.ui.components.PrimaryButton
import dev.orbit.app.ui.components.ScreenBar
import dev.orbit.app.ui.components.SecondaryButton
import dev.orbit.app.ui.components.SectionTitle
import dev.orbit.app.ui.components.tap
import dev.orbit.app.ui.theme.Orbit
import dev.orbit.app.ui.theme.OrbitDimens
import dev.orbit.app.ui.theme.OrbitMotion
import dev.orbit.app.ui.theme.OrbitType
import dev.orbit.app.ui.theme.rememberHaptics
import java.time.Instant
import java.time.ZoneId
import java.time.format.TextStyle
import java.time.temporal.ChronoUnit
import java.util.Locale

/** Days of the week as the hub counts them, 0 (Sunday) to 6, in the order people read a week. */
private val WEEK = listOf(1, 2, 3, 4, 5, 6, 0)
private val DAY_LETTERS = mapOf(0 to "S", 1 to "M", 2 to "T", 3 to "W", 4 to "T", 5 to "F", 6 to "S")
private val DAY_NAMES = mapOf(0 to "Sun", 1 to "Mon", 2 to "Tue", 3 to "Wed", 4 to "Thu", 5 to "Fri", 6 to "Sat")
private val EVERY_DAY = (0..6).toList()
private val WEEKDAYS = (1..5).toList()
private val WEEKENDS = listOf(0, 6)

/** "Every day", "Weekdays", "Weekends", or "Mon, Wed, Fri", as the hub says it too. */
internal fun describeDays(days: List<Int>): String {
    val set = days.toSortedSet()
    return when (set.toList()) {
        EVERY_DAY -> "Every day"
        WEEKDAYS -> "Weekdays"
        WEEKENDS -> "Weekends"
        else -> WEEK.filter { it in set }.joinToString(", ") { DAY_NAMES.getValue(it) }
    }
}

/** When a schedule runs next, in words: "Today at 08:00", "Tomorrow at 08:00", "Mon at 08:00". */
internal fun nextRunLabel(nextRunAt: Long?, now: Long, zone: ZoneId = ZoneId.systemDefault()): String? {
    if (nextRunAt == null) return null
    val next = Instant.ofEpochMilli(nextRunAt).atZone(zone)
    val days = ChronoUnit.DAYS.between(Instant.ofEpochMilli(now).atZone(zone).toLocalDate(), next.toLocalDate())
    val time = "%02d:%02d".format(next.hour, next.minute)
    val day = when {
        days <= 0L -> "Today"
        days == 1L -> "Tomorrow"
        days < 7 -> next.dayOfWeek.getDisplayName(TextStyle.SHORT, Locale.getDefault())
        else -> "%d %s".format(next.dayOfMonth, next.month.getDisplayName(TextStyle.SHORT, Locale.getDefault()))
    }
    return "$day at $time"
}

private const val CLOCK_NOTE =
    "Schedules run on your PC's clock while the hub is running. If the PC is off at that time, that run is skipped. " +
        "Results come to your phone as a notification."

/** A room's schedules: when each runs, what it asks, and a switch to pause it. */
@Composable
fun SchedulesScreen(
    room: Room,
    schedules: List<Schedule>,
    onNew: () -> Unit,
    onEdit: (Schedule) -> Unit,
    onToggle: (Schedule) -> Unit,
    onBack: () -> Unit,
    now: Long = System.currentTimeMillis(),
) {
    val c = Orbit.colors
    val scroll = rememberScrollState()
    val scrolled by remember { derivedStateOf { scroll.value > 0 } }
    Scaffold(
        containerColor = c.bg,
        topBar = { ScreenBar("Schedules", onBack, scrolled = scrolled) { if (schedules.isNotEmpty()) BarAction("New", onNew) } },
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(scroll)
                .padding(start = OrbitDimens.gutter, end = OrbitDimens.gutter, top = 12.dp, bottom = 48.dp),
        ) {
            if (schedules.isEmpty()) {
                Text("Nothing scheduled in ${room.name}", style = OrbitType.titleM, color = c.text)
                Text(
                    "Have the crew do something at a set time, like a morning briefing or a Friday wrap-up.",
                    Modifier.padding(top = 6.dp, bottom = OrbitDimens.section),
                    style = OrbitType.bodyM,
                    color = c.textSecondary,
                )
                PrimaryButton("New schedule", onNew)
            } else {
                OrbitCard(Modifier.fillMaxWidth()) {
                    Column {
                        schedules.sortedBy { it.time }.forEachIndexed { index, schedule ->
                            if (index > 0) Hairline()
                            ScheduleRow(schedule, now, { onEdit(schedule) }, { onToggle(schedule) })
                        }
                    }
                }
            }
            Text(CLOCK_NOTE, Modifier.padding(top = OrbitDimens.labelGap), style = OrbitType.bodyS, color = c.textTertiary)
        }
    }
}

@Composable
private fun ScheduleRow(schedule: Schedule, now: Long, onEdit: () -> Unit, onToggle: () -> Unit) {
    val c = Orbit.colors
    val haptics = rememberHaptics()
    val ink = if (schedule.enabled) c.text else c.textTertiary
    Row(
        Modifier.fillMaxWidth().tap(RectangleShape, 0.985f, onEdit).padding(start = OrbitDimens.rowPad, end = 6.dp, top = 14.dp, bottom = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.Bottom) {
                Text(schedule.time, style = OrbitType.titleL, color = ink)
                Text(describeDays(schedule.days), Modifier.padding(start = 10.dp, bottom = 3.dp), style = OrbitType.label, color = c.textSecondary)
            }
            Text(
                schedule.text,
                Modifier.padding(top = 4.dp),
                style = OrbitType.bodyM,
                color = if (schedule.enabled) c.textSecondary else c.textTertiary,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            val next = if (schedule.enabled) nextRunLabel(schedule.nextRunAt, now) else null
            Text(
                next?.let { "Next: $it" } ?: "Paused",
                Modifier.padding(top = 4.dp),
                style = OrbitType.caption,
                color = c.textTertiary,
            )
        }
        Box(
            Modifier
                .padding(start = 8.dp)
                .toggleable(schedule.enabled, role = Role.Switch) {
                    haptics.tick()
                    onToggle()
                }
                .padding(10.dp),
        ) {
            OrbitSwitch(schedule.enabled)
        }
    }
}

/**
 * Making or changing a schedule: what to ask the crew, at what time, on which days. Times are picked
 * from rows of hours and minutes rather than typed, so they can't be wrong.
 */
@Composable
fun ScheduleEditorScreen(
    room: Room,
    initial: Schedule?,
    onSave: (Schedule) -> Unit,
    onDelete: (() -> Unit)?,
    onRunNow: (() -> Unit)?,
    onBack: () -> Unit,
) {
    val c = Orbit.colors
    val start = remember(initial?.id) { initial ?: Schedule(roomId = room.id) }
    var text by rememberSaveable { mutableStateOf(start.text) }
    var hour by rememberSaveable { mutableStateOf(start.time.substringBefore(':').toIntOrNull() ?: 8) }
    var minute by rememberSaveable { mutableStateOf(start.time.substringAfter(':').toIntOrNull() ?: 0) }
    var days by rememberSaveable { mutableStateOf(start.days.sorted()) }
    val canSave = text.isNotBlank() && days.isNotEmpty()
    fun save() = onSave(start.copy(text = text.trim(), time = "%02d:%02d".format(hour, minute), days = days, enabled = true))

    val scroll = rememberScrollState()
    val scrolled by remember { derivedStateOf { scroll.value > 0 } }
    Scaffold(
        containerColor = c.bg,
        topBar = {
            ScreenBar(if (initial == null) "New schedule" else "Edit schedule", onBack, scrolled = scrolled) {
                BarAction(if (initial == null) "Create" else "Save", ::save, enabled = canSave)
            }
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).imePadding().verticalScroll(scroll).padding(top = 12.dp, bottom = 48.dp)) {
            Column(Modifier.padding(horizontal = OrbitDimens.gutter)) {
                FieldLabel("Ask the crew in ${room.name}")
                OrbitField(
                    text, { text = it.take(4000) }, "Summarize today's news about solar power, in five bullets",
                    singleLine = false, minLines = 3,
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
                )
            }

            SectionTitle("Time", Modifier.padding(start = OrbitDimens.gutter, top = OrbitDimens.section + 4.dp, bottom = 4.dp))
            Text(
                "%02d:%02d".format(hour, minute),
                Modifier.padding(horizontal = OrbitDimens.gutter),
                style = OrbitType.hero,
                color = c.text,
            )
            FieldLabel("Hour", Modifier.padding(start = OrbitDimens.gutter, top = 8.dp))
            NumberRow((0..23).toList(), hour) { hour = it }
            FieldLabel("Minute", Modifier.padding(start = OrbitDimens.gutter, top = 16.dp))
            NumberRow((0..55 step 5).toList(), minute) { minute = it }

            SectionTitle("Days", Modifier.padding(start = OrbitDimens.gutter, top = OrbitDimens.section + 4.dp, bottom = 8.dp))
            Column(Modifier.padding(horizontal = OrbitDimens.gutter)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    for (day in WEEK) DayToggle(DAY_LETTERS.getValue(day), DAY_NAMES.getValue(day), day in days) {
                        days = if (day in days) days - day else (days + day).sorted()
                    }
                }
                Spacer(Modifier.height(12.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Pill("Every day", { days = EVERY_DAY }, selected = days == EVERY_DAY)
                    Pill("Weekdays", { days = WEEKDAYS }, selected = days == WEEKDAYS)
                    Pill("Weekends", { days = WEEKENDS }, selected = days == WEEKENDS)
                }
                Text(CLOCK_NOTE, Modifier.padding(top = OrbitDimens.section), style = OrbitType.bodyS, color = c.textTertiary)
                if (onRunNow != null) {
                    Spacer(Modifier.height(OrbitDimens.section))
                    SecondaryButton("Run it now", onRunNow)
                }
                if (onDelete != null) {
                    Spacer(Modifier.height(40.dp))
                    DangerRow("Delete schedule", onDelete)
                }
            }
        }
    }
}

/** A row of numbers to pick one from, scrolled so the chosen one is in view. */
@Composable
private fun NumberRow(values: List<Int>, selected: Int, onPick: (Int) -> Unit) {
    val list = rememberLazyListState(initialFirstVisibleItemIndex = (values.indexOf(selected) - 2).coerceAtLeast(0))
    LazyRow(
        Modifier.padding(top = 8.dp),
        state = list,
        contentPadding = PaddingValues(horizontal = OrbitDimens.gutter),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        items(values, key = { it }) { value ->
            Pill("%02d".format(value), { onPick(value) }, selected = value == selected, textStyle = OrbitType.mono)
        }
    }
}

/** One day of the week as a round toggle. */
@Composable
private fun DayToggle(letter: String, name: String, on: Boolean, onToggle: () -> Unit) {
    val c = Orbit.colors
    val haptics = rememberHaptics()
    val fill by animateColorAsState(if (on) c.primary else c.surfaceRaised, OrbitMotion.snappy(), label = "day")
    val ink by animateColorAsState(if (on) c.onPrimary else c.textSecondary, OrbitMotion.snappy(), label = "dayInk")
    Box(
        Modifier
            .size(42.dp)
            .clip(CircleShape)
            // Screen readers hear the day's name, not its letter.
            .semantics { contentDescription = name }
            .toggleable(on, role = Role.Checkbox) {
                haptics.tick()
                onToggle()
            }
            .background(fill, CircleShape)
            .border(1.dp, if (on) fill else c.hairline, CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        Text(letter, Modifier.clearAndSetSemantics {}, style = OrbitType.titleS, color = ink)
    }
}
