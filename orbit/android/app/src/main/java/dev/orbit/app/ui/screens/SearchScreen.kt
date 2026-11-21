package dev.orbit.app.ui.screens

import dev.orbit.app.ui.components.characterTile
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import dev.orbit.app.data.Agent
import dev.orbit.app.data.SearchHit
import dev.orbit.app.data.SearchResults
import dev.orbit.app.ui.components.AvatarDisc
import dev.orbit.app.ui.components.CrewTile
import dev.orbit.app.ui.components.Hairline
import dev.orbit.app.ui.components.IconTap
import dev.orbit.app.ui.components.OrbitCard
import dev.orbit.app.ui.components.OrbitIcon
import dev.orbit.app.ui.components.OrbitSpinner
import dev.orbit.app.ui.components.surfaceBorder
import dev.orbit.app.ui.components.tap
import dev.orbit.app.ui.components.textColor
import dev.orbit.app.ui.theme.Orbit
import dev.orbit.app.ui.theme.OrbitDimens
import dev.orbit.app.ui.theme.OrbitType
import androidx.compose.foundation.border
import androidx.compose.foundation.background
import androidx.compose.ui.draw.clip

/**
 * Search across every room: rooms by name or description, and messages, newest first, with the words
 * around each match. Tapping one opens its room.
 */
@Composable
fun SearchScreen(
    query: String,
    onQuery: (String) -> Unit,
    results: SearchResults?,
    searching: Boolean,
    agents: List<Agent>,
    onOpenRoom: (roomId: String) -> Unit,
    onBack: () -> Unit,
    now: Long = System.currentTimeMillis(),
    autoFocus: Boolean = true,
    /** The room being searched, when it's just one. */
    roomName: String? = null,
) {
    val c = Orbit.colors
    val focus = remember { FocusRequester() }
    val focusManager = LocalFocusManager.current
    LaunchedEffect(Unit) { if (autoFocus) runCatching { focus.requestFocus() } }
    val byId = remember(agents) { agents.associateBy { it.id } }
    Scaffold(
        containerColor = c.bg,
        topBar = {
            Row(
                Modifier.fillMaxWidth().statusBarsPadding().padding(start = 6.dp, end = 16.dp, top = 8.dp, bottom = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconTap(OrbitIcon.Back, "Back", onBack)
                Row(
                    Modifier
                        .weight(1f)
                        .height(48.dp)
                        .clip(CircleShape)
                        .background(c.surface)
                        .border(surfaceBorder(), CircleShape)
                        .padding(start = 16.dp, end = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    OrbitIcon(OrbitIcon.Search, size = 18.dp, tint = c.textTertiary)
                    BasicTextField(
                        value = query,
                        onValueChange = { onQuery(it.take(200)) },
                        modifier = Modifier.weight(1f).padding(start = 10.dp).focusRequester(focus),
                        singleLine = true,
                        textStyle = OrbitType.body.copy(color = c.text),
                        cursorBrush = SolidColor(c.text),
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                        keyboardActions = KeyboardActions(onSearch = { focusManager.clearFocus() }),
                        decorationBox = { inner ->
                            if (query.isEmpty()) Text(roomName?.let { "Search $it" } ?: "Search rooms and messages", style = OrbitType.body, color = c.textTertiary, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            inner()
                        },
                    )
                    when {
                        searching -> Box(Modifier.size(40.dp), contentAlignment = Alignment.Center) { OrbitSpinner(c.textTertiary, size = 18.dp) }
                        query.isNotEmpty() -> IconTap(OrbitIcon.Close, "Clear", { onQuery("") }, tint = c.textTertiary)
                    }
                }
            }
        },
    ) { padding ->
        val found = results?.takeIf { query.isNotBlank() }
        if (found == null || (found.rooms.isEmpty() && found.messages.isEmpty())) {
            Box(Modifier.fillMaxSize().padding(padding).imePadding(), contentAlignment = Alignment.Center) {
                Text(
                    when {
                        query.isBlank() -> if (roomName != null) "Find anything said in $roomName." else "Find anything you or your crew said, in any room."
                        found == null || searching -> ""
                        else -> "Nothing found for “${query.trim()}”."
                    },
                    Modifier.padding(horizontal = 40.dp),
                    style = OrbitType.bodyM,
                    color = c.textTertiary,
                    textAlign = TextAlign.Center,
                )
            }
            return@Scaffold
        }
        LazyColumn(Modifier.fillMaxSize().padding(padding).imePadding(), contentPadding = PaddingValues(start = OrbitDimens.gutter, end = OrbitDimens.gutter, bottom = 40.dp)) {
            if (found.rooms.isNotEmpty()) {
                item(key = "rooms-title") { GroupTitle("Rooms") }
                item(key = "rooms") {
                    OrbitCard(Modifier.fillMaxWidth()) {
                        Column {
                            found.rooms.forEachIndexed { index, room ->
                                if (index > 0) Hairline(Modifier.padding(start = OrbitDimens.rowPad + 40.dp + 14.dp))
                                val members = room.agentIds.mapNotNull(byId::get)
                                Row(
                                    Modifier.fillMaxWidth().tap(RectangleShape, 0.985f) { onOpenRoom(room.id) }.padding(horizontal = OrbitDimens.rowPad, vertical = 10.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    CrewTile(members.map { it.avatar }, size = 40.dp, color = characterTile())
                                    Text(room.name, Modifier.weight(1f).padding(start = 14.dp), style = OrbitType.titleS, color = c.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    OrbitIcon(OrbitIcon.Chevron, size = 18.dp, tint = c.textTertiary)
                                }
                            }
                        }
                    }
                }
            }
            if (found.messages.isNotEmpty()) {
                item(key = "messages-title") { GroupTitle("Messages") }
                items(found.messages, key = { "${it.roomId}/${it.messageId}" }) { hit ->
                    Hit(hit, byId[hit.agentId], words = found.query.split(' ').filter { it.isNotBlank() }, now = now) { onOpenRoom(hit.roomId) }
                }
            }
        }
    }
}

@Composable
private fun GroupTitle(text: String) = Text(
    text.uppercase(),
    Modifier.padding(start = 4.dp, top = 20.dp, bottom = 10.dp),
    style = OrbitType.overline,
    color = Orbit.colors.textTertiary,
)

/** One matching message: who said it, in which room and when, and the words around the match in bold. */
@Composable
private fun Hit(hit: SearchHit, agent: Agent?, words: List<String>, now: Long, onClick: () -> Unit) {
    val c = Orbit.colors
    Row(
        Modifier.fillMaxWidth().tap(RoundedCornerShape(OrbitDimens.radiusM), 0.985f, onClick).padding(vertical = 10.dp, horizontal = 4.dp),
    ) {
        if (agent != null) {
            AvatarDisc(agent.avatar, size = 34.dp)
        } else {
            Box(Modifier.size(34.dp).clip(CircleShape).background(c.surfaceHigh), contentAlignment = Alignment.Center) {
                OrbitIcon(OrbitIcon.Person, size = 18.dp, tint = c.textSecondary)
            }
        }
        Column(Modifier.weight(1f).padding(start = 12.dp)) {
            Row(Modifier.heightIn(min = 20.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(hit.author, style = OrbitType.titleS, color = agent?.avatar?.textColor() ?: c.text)
                Text(" · ${hit.roomName}", Modifier.weight(1f), style = OrbitType.bodyS, color = c.textTertiary, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(relativeTime(hit.at, now), Modifier.padding(start = 8.dp), style = OrbitType.caption, color = c.textTertiary)
            }
            Text(
                highlight(hit.snippet, words, c.text),
                Modifier.padding(top = 2.dp),
                style = OrbitType.bodyM,
                color = c.textSecondary,
                maxLines = 3,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

/** The snippet with every searched word drawn bold, in full text color. */
private fun highlight(text: String, words: List<String>, ink: androidx.compose.ui.graphics.Color) = buildAnnotatedString {
    val low = text.lowercase()
    var i = 0
    while (i < text.length) {
        val match = words.filter { it.isNotEmpty() && low.startsWith(it, i) }.maxByOrNull { it.length }
        if (match != null) {
            withStyle(SpanStyle(color = ink, fontWeight = FontWeight.SemiBold)) { append(text.substring(i, i + match.length)) }
            i += match.length
        } else {
            append(text[i])
            i++
        }
    }
}
