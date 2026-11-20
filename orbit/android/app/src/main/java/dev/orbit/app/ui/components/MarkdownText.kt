package dev.orbit.app.ui.components

import android.content.ClipData
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.platform.ClipEntry
import androidx.compose.ui.platform.LocalClipboard
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withLink
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.orbit.app.ui.theme.GeistMono
import dev.orbit.app.ui.theme.Orbit
import dev.orbit.app.ui.theme.OrbitDimens
import dev.orbit.app.ui.theme.OrbitType
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.max
import kotlin.math.min

internal sealed interface Block {
    /** Running text. */
    data class Paragraph(val text: String) : Block

    /** A heading; [level] 1 and 2 are larger than the rest. */
    data class Heading(val text: String, val level: Int) : Block

    /** One list item: its marker ("•" or "2."), its text, and how deeply it's nested (0 to 3). */
    data class Item(val marker: String, val text: String, val level: Int = 0) : Block

    /** A fenced code block, with the language it was marked as, if any. */
    data class Code(val text: String, val language: String = "") : Block

    data class Quote(val text: String) : Block

    /** A table: its header cells, its rows, and each column's alignment (-1 left, 0 center, 1 right). */
    data class Table(val header: List<String>, val rows: List<List<String>>, val align: List<Int>) : Block

    data object Rule : Block
}

// Links, then **bold**, ~~struck~~, `code`, *italic*, bare web addresses, and @mentions.
private val Inline = Regex(
    """\[([^\]\n]+)]\((https?://[^)\s]+)\)""" +
        """|\*\*(.+?)\*\*""" +
        """|~~(.+?)~~""" +
        """|`([^`\n]+)`""" +
        """|(?<![\w*])\*(?!\s)([^*\n]+?)(?<!\s)\*(?![\w*])""" +
        """|(https?://[^\s<>()\[\]]+[^\s<>()\[\].,;:!?'"])""" +
        """|(?<![\w@])@[\p{L}\p{N}_]+""",
)
private val HeadingLine = Regex("""^(#{1,6})\s+(.*)$""")
private val Bullet = Regex("""^(\s*)[-*•+]\s+(.*)$""")
private val Numbered = Regex("""^(\s*)(\d{1,3})[.)]\s+(.*)$""")
private val QuoteLine = Regex("""^\s*>\s?(.*)$""")
private val RuleLine = Regex("""^\s*([-*_])(\s*\1){2,}\s*$""")
private val TableSeparator = Regex("""^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$""")

private fun cells(line: String): List<String> = line.trim().removePrefix("|").removeSuffix("|").split('|').map { it.trim() }

private fun alignOf(cell: String): Int {
    val c = cell.trim()
    return when {
        c.startsWith(':') && c.endsWith(':') -> 0
        c.endsWith(':') -> 1
        else -> -1
    }
}

/** Splits Markdown into blocks. Works on half-arrived text too, since replies are parsed as they stream. */
internal fun parseMarkdown(source: String): List<Block> {
    val blocks = mutableListOf<Block>()
    val paragraph = StringBuilder()
    val quote = StringBuilder()
    val code = StringBuilder()
    var language = ""
    var inCode = false
    fun flushParagraph() {
        if (paragraph.isNotBlank()) blocks += Block.Paragraph(paragraph.toString().trim('\n'))
        paragraph.clear()
    }
    fun flushQuote() {
        if (quote.isNotBlank()) blocks += Block.Quote(quote.toString().trim('\n'))
        quote.clear()
    }
    val lines = source.lines()
    var i = 0
    while (i < lines.size) {
        val line = lines[i]
        if (line.trimStart().startsWith("```")) {
            if (inCode) {
                blocks += Block.Code(code.toString().trimEnd('\n'), language)
                code.clear()
            } else {
                flushParagraph()
                flushQuote()
                language = line.trimStart().removePrefix("```").trim()
            }
            inCode = !inCode
            i++
            continue
        }
        if (inCode) {
            code.append(line).append('\n')
            i++
            continue
        }
        // A table starts with a row of cells followed by a row of dashes.
        if (line.contains('|') && i + 1 < lines.size && TableSeparator.matches(lines[i + 1])) {
            flushParagraph()
            flushQuote()
            val header = cells(line)
            val align = cells(lines[i + 1]).map(::alignOf)
            val rows = mutableListOf<List<String>>()
            i += 2
            while (i < lines.size && lines[i].contains('|') && lines[i].isNotBlank()) rows += cells(lines[i++])
            blocks += Block.Table(header, rows, List(header.size) { align.getOrElse(it) { -1 } })
            continue
        }
        val quoted = QuoteLine.find(line)
        if (quoted != null) {
            flushParagraph()
            quote.append(quoted.groupValues[1]).append('\n')
            i++
            continue
        }
        flushQuote()
        val heading = HeadingLine.find(line)
        val bullet = Bullet.find(line)
        val numbered = Numbered.find(line)
        when {
            line.isBlank() -> flushParagraph()
            RuleLine.matches(line) && paragraph.isEmpty() -> blocks += Block.Rule
            heading != null -> {
                flushParagraph()
                blocks += Block.Heading(heading.groupValues[2], heading.groupValues[1].length)
            }
            bullet != null -> {
                flushParagraph()
                blocks += Block.Item("•", bullet.groupValues[2], (bullet.groupValues[1].length / 2).coerceAtMost(3))
            }
            numbered != null -> {
                flushParagraph()
                blocks += Block.Item("${numbered.groupValues[2]}.", numbered.groupValues[3], (numbered.groupValues[1].length / 2).coerceAtMost(3))
            }
            else -> paragraph.append(line).append('\n')
        }
        i++
    }
    if (inCode && code.isNotBlank()) blocks += Block.Code(code.toString().trimEnd('\n'), language) // still streaming
    flushParagraph()
    flushQuote()
    return blocks
}

private fun inline(text: String, mentions: Map<String, Color>, linkColor: Color): AnnotatedString = buildAnnotatedString {
    val linkStyle = TextLinkStyles(SpanStyle(color = linkColor, textDecoration = TextDecoration.Underline))
    var cursor = 0
    for (match in Inline.findAll(text)) {
        append(text.substring(cursor, match.range.first))
        val g = match.groupValues
        when {
            g[1].isNotEmpty() -> withLink(LinkAnnotation.Url(g[2], linkStyle)) { append(g[1]) }
            g[3].isNotEmpty() -> withStyle(SpanStyle(fontWeight = FontWeight.SemiBold)) { append(g[3]) }
            g[4].isNotEmpty() -> withStyle(SpanStyle(textDecoration = TextDecoration.LineThrough)) { append(g[4]) }
            g[5].isNotEmpty() -> withStyle(SpanStyle(fontFamily = GeistMono, fontSize = 14.sp, fontWeight = FontWeight.Medium)) { append(g[5]) }
            g[6].isNotEmpty() -> withStyle(SpanStyle(fontStyle = FontStyle.Italic)) { append(g[6]) }
            // A bare address reads as its site and path, without the scheme.
            g[7].isNotEmpty() -> withLink(LinkAnnotation.Url(g[7], linkStyle)) { append(g[7].removePrefix("https://").removePrefix("http://").removePrefix("www.")) }
            else -> {
                // A mention takes the color of the agent it names.
                val color = mentions[match.value.drop(1).lowercase()] ?: Color.Unspecified
                withStyle(SpanStyle(color = color, fontWeight = FontWeight.SemiBold)) { append(match.value) }
            }
        }
        cursor = match.range.last + 1
    }
    append(text.substring(cursor))
}

/** Fades the last [count] characters from solid to faint, so freshly streamed text eases in. */
private fun AnnotatedString.fadeTail(count: Int, color: Color): AnnotatedString {
    if (count <= 0 || isEmpty()) return this
    val n = minOf(count, length)
    return buildAnnotatedString {
        append(this@fadeTail)
        for (j in 0 until n) {
            val index = length - n + j
            val alpha = 1f - 0.88f * (j + 1) / (n + 1)
            addStyle(SpanStyle(color = color.copy(alpha = color.alpha * alpha)), index, index + 1)
        }
    }
}

/**
 * Renders the Markdown that models write in chat: paragraphs, emphasis, links, lists, headings,
 * quotes, tables and code. [mentions] maps a lowercase agent handle (name without spaces) to the
 * color its @mention is drawn in. [fadeTail] fades that many trailing characters, for text that is
 * still streaming in.
 */
@Composable
fun MarkdownText(
    text: String,
    modifier: Modifier = Modifier,
    color: Color = Orbit.colors.text,
    mentions: Map<String, Color> = emptyMap(),
    fadeTail: Int = 0,
) {
    val c = Orbit.colors
    // Everything before the last paragraph break is settled, so a streaming reply re-parses only its tail.
    val cut = text.lastIndexOf("\n\n")
    val settled = if (cut > 0 && text.substring(0, cut).split("```").size % 2 == 1) text.substring(0, cut) else ""
    val head = remember(settled) { parseMarkdown(settled) }
    val tail = remember(text) { parseMarkdown(text.substring(settled.length)) }
    val blocks = head + tail
    val styled = { s: String, fade: Int -> inline(s, mentions, color).fadeTail(fade, color) }
    Column(modifier) {
        blocks.forEachIndexed { index, block ->
            // List items sit closer to each other than paragraphs do.
            val previous = blocks.getOrNull(index - 1)
            val gap = when {
                previous == null -> 0.dp
                block is Block.Item && previous is Block.Item -> 4.dp
                block is Block.Heading -> 16.dp
                else -> 10.dp
            }
            val spaced = Modifier.padding(top = gap)
            val fade = if (index == blocks.lastIndex) fadeTail else 0
            when (block) {
                is Block.Paragraph -> Text(remember(block, mentions, fade) { styled(block.text, fade) }, spaced, style = OrbitType.body, color = color)
                is Block.Heading -> Text(
                    remember(block, mentions, fade) { styled(block.text, fade) },
                    spaced,
                    style = if (block.level <= 2) OrbitType.heading else OrbitType.body.copy(fontWeight = FontWeight.SemiBold),
                    color = color,
                )
                // The marker sits in its own column, so wrapped lines align with the text, not the bullet.
                is Block.Item -> Row(spaced.padding(start = (block.level * 18).dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(block.marker, Modifier.widthIn(min = 14.dp), style = OrbitType.body, color = c.textSecondary)
                    Text(remember(block, mentions, fade) { styled(block.text, fade) }, style = OrbitType.body, color = color)
                }
                is Block.Quote -> Row(spaced.height(IntrinsicSize.Min)) {
                    Box(Modifier.padding(vertical = 3.dp).width(3.dp).fillMaxHeight().background(c.line, CircleShape))
                    Text(
                        remember(block, mentions, fade) { styled(block.text, fade) },
                        Modifier.padding(start = 12.dp),
                        style = OrbitType.body,
                        color = c.textSecondary,
                    )
                }
                is Block.Code -> CodeBlock(block, spaced, color, fade)
                is Block.Table -> TableBlock(block, spaced, mentions)
                Block.Rule -> Box(spaced.padding(vertical = 6.dp).fillMaxWidth().height(1.dp).background(c.hairline))
            }
        }
    }
}

/** Code, with its language and a button that copies it. */
@Composable
private fun CodeBlock(block: Block.Code, modifier: Modifier, color: Color, fade: Int) {
    val c = Orbit.colors
    val clipboard = LocalClipboard.current
    val scope = rememberCoroutineScope()
    var copied by remember { mutableStateOf(false) }
    val shape = RoundedCornerShape(OrbitDimens.radiusS)
    Column(modifier.fillMaxWidth().clip(shape).background(c.surface).border(1.dp, c.hairline, shape)) {
        Row(Modifier.fillMaxWidth().padding(start = 14.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(block.language.ifBlank { "code" }, Modifier.weight(1f), style = OrbitType.mono, color = c.textTertiary)
            Row(
                Modifier
                    .tap(CircleShape, 0.94f) {
                        scope.launch {
                            clipboard.setClipEntry(ClipEntry(ClipData.newPlainText("Code", block.text)))
                            copied = true
                            delay(1600)
                            copied = false
                        }
                    }
                    .padding(horizontal = 10.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                OrbitIcon(if (copied) OrbitIcon.Check else OrbitIcon.Copy, size = 14.dp, tint = c.textSecondary)
                Text(if (copied) "Copied" else "Copy", Modifier.padding(start = 6.dp), style = OrbitType.caption, color = c.textSecondary)
            }
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(c.hairline))
        Text(
            AnnotatedString(block.text).fadeTail(fade, color),
            modifier = Modifier.horizontalScroll(rememberScrollState()).padding(14.dp),
            style = OrbitType.mono.copy(fontSize = 13.sp, lineHeight = 20.sp),
            color = color,
        )
    }
}

/**
 * A table sized to its content: each column as wide as its widest cell (up to a limit, past which
 * cells wrap), scrolling sideways when it's wider than the reply.
 */
@Composable
private fun TableBlock(block: Block.Table, modifier: Modifier, mentions: Map<String, Color>) {
    val c = Orbit.colors
    val shape = RoundedCornerShape(OrbitDimens.radiusS)
    val columns = block.header.size.coerceAtLeast(1)
    val line = c.hairline
    Box(modifier.fillMaxWidth().horizontalScroll(rememberScrollState())) {
        Layout(
            content = {
                block.header.forEachIndexed { i, cell ->
                    Cell(cell, block.align[i], header = true, mentions = mentions, modifier = Modifier.background(c.surface))
                }
                for (row in block.rows) {
                    for (i in 0 until columns) {
                        Cell(
                            row.getOrElse(i) { "" },
                            block.align.getOrElse(i) { -1 },
                            header = false,
                            mentions = mentions,
                            modifier = Modifier.drawBehind { drawLine(line, Offset(0f, 0f), Offset(size.width, 0f), 1.dp.toPx()) },
                        )
                    }
                }
            },
            modifier = Modifier.clip(shape).border(1.dp, line, shape),
        ) { measurables, _ ->
            val widest = 260.dp.roundToPx()
            val widths = IntArray(columns)
            measurables.forEachIndexed { i, m -> widths[i % columns] = max(widths[i % columns], min(m.maxIntrinsicWidth(Constraints.Infinity), widest)) }
            val placeables = measurables.mapIndexed { i, m -> m.measure(Constraints(minWidth = widths[i % columns], maxWidth = widths[i % columns])) }
            val rows = (placeables.size + columns - 1) / columns
            val heights = IntArray(rows) { r -> (0 until columns).maxOf { col -> placeables.getOrNull(r * columns + col)?.height ?: 0 } }
            layout(widths.sum(), heights.sum()) {
                var y = 0
                for (r in 0 until rows) {
                    var x = 0
                    for (col in 0 until columns) {
                        placeables.getOrNull(r * columns + col)?.place(x, y)
                        x += widths[col]
                    }
                    y += heights[r]
                }
            }
        }
    }
}

@Composable
private fun Cell(text: String, align: Int, header: Boolean, mentions: Map<String, Color>, modifier: Modifier) {
    val c = Orbit.colors
    Text(
        remember(text, mentions) { inline(text, mentions, c.text) },
        modifier.padding(horizontal = 12.dp, vertical = 8.dp),
        style = if (header) OrbitType.label.copy(fontWeight = FontWeight.SemiBold) else OrbitType.bodyM,
        color = if (header) c.text else c.textSecondary,
        textAlign = when (align) {
            0 -> TextAlign.Center
            1 -> TextAlign.End
            else -> TextAlign.Start
        },
    )
}
