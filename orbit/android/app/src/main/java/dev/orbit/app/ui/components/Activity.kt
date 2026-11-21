package dev.orbit.app.ui.components

import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import dev.orbit.app.data.Activity
import dev.orbit.app.data.Source
import dev.orbit.app.ui.theme.Orbit
import dev.orbit.app.ui.theme.OrbitMotion
import dev.orbit.app.ui.theme.OrbitType

/** How one step reads in a reply: a verb ("Searched") and what it acted on ("best ramen in Tokyo"). */
data class ActivityLabel(val verb: String, val detail: String)

/** The site a web address belongs to, without "www.". */
internal fun siteOf(url: String): String =
    url.substringAfter("://").substringBefore('/').substringBefore('?').substringBefore('#').removePrefix("www.").ifEmpty { url }

/** A shared file or folder by its last part: "Notes/trips/japan.md" reads as "japan.md". */
private fun leafOf(path: String): String = path.trimEnd('/').substringAfterLast('/').ifEmpty { path }

/** Words for a step, while it's happening ([live]) and once it's done or has failed. */
fun activityLabel(activity: Activity, live: Boolean = false): ActivityLabel {
    val failed = activity.failed && !live
    val detail = activity.detail
    return when (activity.kind) {
        Activity.KIND_SEARCH -> ActivityLabel(if (live) "Searching" else if (failed) "Search failed" else "Searched", detail)
        Activity.KIND_PAGE -> ActivityLabel(if (live) "Reading" else if (failed) "Couldn't open" else "Read", siteOf(detail))
        Activity.KIND_CODE -> ActivityLabel(if (live) "Running code" else if (failed) "Code didn't run" else "Ran code", "")
        Activity.KIND_FOLDER -> ActivityLabel(
            if (live) "Looking in" else if (failed) "Couldn't open" else "Looked in",
            if (detail.isBlank()) "your shared folders" else leafOf(detail),
        )
        Activity.KIND_FILE -> ActivityLabel(if (live) "Reading" else if (failed) "Couldn't read" else "Read", leafOf(detail))
        Activity.KIND_FIND -> ActivityLabel(
            if (live) "Searching files for" else if (failed) "File search failed for" else "Searched files for",
            "“$detail”",
        )
        Activity.KIND_REMEMBER -> ActivityLabel(if (live) "Remembering" else if (failed) "Couldn't remember" else "Remembered", detail)
        Activity.KIND_FORGET -> ActivityLabel(if (live) "Forgetting" else if (failed) "Couldn't forget" else "Forgot", detail)
        Activity.KIND_MAIL_SEARCH -> ActivityLabel(
            if (live) "Searching email" else if (failed) "Email search failed" else "Searched email",
            if (detail.isBlank()) "" else "for “$detail”",
        )
        Activity.KIND_MAIL_READ -> ActivityLabel(if (live) "Reading an email" else if (failed) "Couldn't read an email" else "Read an email", "")
        Activity.KIND_MAIL_DRAFT -> ActivityLabel(if (live) "Drafting an email" else if (failed) "Couldn't save a draft" else "Saved a draft", if (detail.isBlank()) "" else "to $detail")
        Activity.KIND_CALENDAR -> ActivityLabel(if (live) "Checking the calendar" else if (failed) "Couldn't check the calendar" else "Checked the calendar", detail)
        Activity.KIND_CALENDAR_ADD -> ActivityLabel(if (live) "Adding to the calendar" else if (failed) "Couldn't add to the calendar" else "Added to the calendar", detail)
        Activity.KIND_DRIVE_SEARCH -> ActivityLabel(
            if (live) "Searching Drive" else if (failed) "Drive search failed" else "Searched Drive",
            if (detail.isBlank()) "" else "for “$detail”",
        )
        Activity.KIND_DRIVE_READ -> ActivityLabel(if (live) "Reading from Drive" else if (failed) "Couldn't open a Drive file" else "Read from Drive", "")
        Activity.KIND_FOLLOW_UP -> ActivityLabel(if (live) "Setting a follow-up" else if (failed) "Couldn't set a follow-up" else "Will follow up", detail)
        Activity.KIND_WATCH -> ActivityLabel(if (live) "Setting up a watch" else if (failed) "Couldn't watch" else "Watching", detail)
        Activity.KIND_WATCH_STOP -> ActivityLabel(if (live) "Stopping a watch" else if (failed) "Couldn't stop a watch" else "Stopped watching", detail)
        Activity.KIND_GUIDE -> ActivityLabel(if (live) "Reading the Treehouse guide" else if (failed) "Couldn't read the guide" else "Read the Treehouse guide", "")
        Activity.KIND_SELF -> ActivityLabel(if (live) "Updating its" else if (failed) "Couldn't update its" else "Updated its", detail.ifBlank { "settings" })
        Activity.KIND_ROOM -> ActivityLabel(if (live) "Making a room" else if (failed) "Couldn't make a room" else "Made a room", detail)
        Activity.KIND_SETTINGS -> ActivityLabel(if (live) "Changing" else if (failed) "Couldn't change" else "Changed", detail.ifBlank { "settings" })
        else -> ActivityLabel(if (live) "Working" else "Used a tool", detail)
    }
}

/** One line for many steps: "Searched the web 3 times, read 2 pages and ran code". */
fun activitySummary(activity: List<Activity>): String {
    fun count(kind: String) = activity.count { it.kind == kind }
    fun times(n: Int, one: String, many: String) = if (n == 1) one else many.replace("#", n.toString())
    val parts = buildList {
        count(Activity.KIND_SEARCH).takeIf { it > 0 }?.let { add(times(it, "searched the web", "searched the web # times")) }
        count(Activity.KIND_PAGE).takeIf { it > 0 }?.let { add(times(it, "read a page", "read # pages")) }
        if (count(Activity.KIND_CODE) > 0) add("ran code")
        count(Activity.KIND_FOLDER).takeIf { it > 0 }?.let { add(times(it, "looked in a folder", "looked in # folders")) }
        count(Activity.KIND_FILE).takeIf { it > 0 }?.let { add(times(it, "read a file", "read # files")) }
        if (count(Activity.KIND_FIND) > 0) add("searched your files")
        count(Activity.KIND_REMEMBER).takeIf { it > 0 }?.let { add(times(it, "saved a note", "saved # notes")) }
        if (count(Activity.KIND_FORGET) > 0) add("forgot a note")
        if (count(Activity.KIND_MAIL_SEARCH) > 0) add("searched email")
        count(Activity.KIND_MAIL_READ).takeIf { it > 0 }?.let { add(times(it, "read an email", "read # emails")) }
        count(Activity.KIND_MAIL_DRAFT).takeIf { it > 0 }?.let { add(times(it, "saved a draft", "saved # drafts")) }
        if (count(Activity.KIND_CALENDAR) > 0) add("checked the calendar")
        count(Activity.KIND_CALENDAR_ADD).takeIf { it > 0 }?.let { add(times(it, "added an event", "added # events")) }
        if (count(Activity.KIND_DRIVE_SEARCH) > 0) add("searched Drive")
        count(Activity.KIND_DRIVE_READ).takeIf { it > 0 }?.let { add(times(it, "read a Drive file", "read # Drive files")) }
        if (count(Activity.KIND_FOLLOW_UP) > 0) add("set a follow-up")
        if (count(Activity.KIND_WATCH) > 0) add("started watching")
        if (count(Activity.KIND_WATCH_STOP) > 0) add("stopped a watch")
        if (count(Activity.KIND_GUIDE) > 0) add("read the Treehouse guide")
        if (count(Activity.KIND_SELF) > 0) add("updated itself")
        if (count(Activity.KIND_SETTINGS) > 0) add("changed settings")
        count(Activity.KIND_ROOM).takeIf { it > 0 }?.let { add(times(it, "made a room", "made # rooms")) }
    }.ifEmpty { listOf("used ${activity.size} tools") }
    val joined = if (parts.size == 1) parts[0] else parts.dropLast(1).joinToString(", ") + " and " + parts.last()
    return joined.replaceFirstChar { it.uppercase() }
}

private fun iconFor(kind: String) = when (kind) {
    Activity.KIND_SEARCH -> OrbitIcon.Search
    Activity.KIND_PAGE -> OrbitIcon.Globe
    Activity.KIND_CODE -> OrbitIcon.Code
    Activity.KIND_FOLDER -> OrbitIcon.Folder
    Activity.KIND_FILE -> OrbitIcon.File
    Activity.KIND_FIND -> OrbitIcon.Search
    Activity.KIND_REMEMBER, Activity.KIND_FORGET -> OrbitIcon.Memory
    Activity.KIND_MAIL_SEARCH, Activity.KIND_MAIL_READ, Activity.KIND_MAIL_DRAFT -> OrbitIcon.Mail
    Activity.KIND_CALENDAR, Activity.KIND_CALENDAR_ADD -> OrbitIcon.Calendar
    Activity.KIND_DRIVE_SEARCH -> OrbitIcon.Search
    Activity.KIND_DRIVE_READ -> OrbitIcon.File
    Activity.KIND_FOLLOW_UP -> OrbitIcon.Clock
    Activity.KIND_WATCH, Activity.KIND_WATCH_STOP -> OrbitIcon.Bell
    Activity.KIND_GUIDE -> OrbitIcon.File
    Activity.KIND_SELF, Activity.KIND_SETTINGS -> OrbitIcon.Check
    Activity.KIND_ROOM -> OrbitIcon.Plus
    else -> OrbitIcon.More
}

/**
 * What an agent did on its way to a reply. While it works, one quiet line per step, the current one
 * shimmering. Once the reply has landed, the steps fold into one small chip that opens on tap.
 */
@Composable
fun ActivityTrail(activity: List<Activity>, streaming: Boolean, modifier: Modifier = Modifier) {
    if (activity.isEmpty()) return
    var expanded by rememberSaveable { mutableStateOf(false) }
    Column(modifier.animateContentSize(OrbitMotion.snappy())) {
        if (streaming) {
            for (step in activity) ActivityLine(step, live = !step.done)
        } else {
            val c = Orbit.colors
            Row(
                Modifier
                    .tap(CircleShape, 0.97f) { expanded = !expanded }
                    .background(c.surface)
                    .border(1.dp, c.hairline, CircleShape)
                    .heightIn(min = 30.dp)
                    .padding(start = 10.dp, end = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                OrbitIcon(iconFor(activity.first().kind), size = 14.dp, tint = c.textTertiary)
                Text(
                    if (activity.size == 1) activityLabel(activity[0]).let { listOf(it.verb, it.detail).filter(String::isNotBlank).joinToString(" ") } else activitySummary(activity),
                    Modifier.weight(1f, fill = false).padding(start = 7.dp),
                    style = OrbitType.caption,
                    color = c.textSecondary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                OrbitIcon(OrbitIcon.Chevron, Modifier.padding(start = 3.dp).graphicsLayer { rotationZ = if (expanded) -90f else 90f }, size = 14.dp, tint = c.textTertiary)
            }
            if (expanded) Column(Modifier.padding(top = 6.dp, start = 4.dp)) { for (step in activity) ActivityLine(step, live = false) }
        }
    }
}

@Composable
private fun ActivityLine(step: Activity, live: Boolean) {
    val c = Orbit.colors
    val label = activityLabel(step, live)
    Row(Modifier.heightIn(min = 26.dp), verticalAlignment = Alignment.CenterVertically) {
        OrbitIcon(iconFor(step.kind), size = 15.dp, tint = c.textTertiary)
        val modifier = Modifier.padding(start = 8.dp)
        if (live) {
            ShimmerText(listOf(label.verb, label.detail).filter { it.isNotBlank() }.joinToString(" "), OrbitType.bodyS, c.textTertiary, modifier)
        } else {
            Text(
                buildAnnotatedString {
                    withStyle(SpanStyle(color = c.textTertiary)) { append(label.verb) }
                    if (label.detail.isNotBlank()) {
                        append(' ')
                        withStyle(SpanStyle(color = if (step.failed) c.textTertiary else c.textSecondary)) { append(label.detail) }
                    }
                },
                modifier,
                style = OrbitType.bodyS,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

/** The pages a reply cites, as small numbered chips that open the page. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SourceChips(sources: List<Source>, modifier: Modifier = Modifier) {
    if (sources.isEmpty()) return
    val c = Orbit.colors
    val uri = LocalUriHandler.current
    FlowRow(modifier, horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        sources.forEachIndexed { index, source ->
            Row(
                Modifier
                    .tap(CircleShape, 0.94f) { runCatching { uri.openUri(source.url) } }
                    .background(c.surfaceRaised)
                    .border(1.dp, c.hairline, CircleShape)
                    .heightIn(min = 28.dp)
                    .padding(start = 9.dp, end = 11.dp)
                    .semantics { contentDescription = "Source ${index + 1}: ${source.title.ifBlank { siteOf(source.url) }}" },
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("${index + 1}", style = OrbitType.mono, color = c.textTertiary)
                Text(siteOf(source.url), Modifier.padding(start = 6.dp), style = OrbitType.caption, color = c.textSecondary, maxLines = 1)
            }
        }
    }
}
