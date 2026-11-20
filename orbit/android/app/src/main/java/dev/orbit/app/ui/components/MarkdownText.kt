package dev.orbit.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.orbit.app.ui.theme.GeistMono
import dev.orbit.app.ui.theme.Orbit
import dev.orbit.app.ui.theme.OrbitDimens
import dev.orbit.app.ui.theme.OrbitType

private sealed interface Block {
    /** Running text. [heading] makes it a bold line. */
    data class Paragraph(val text: String, val heading: Boolean = false) : Block

    /** One list item: its marker ("•" or "2.") and its text. */
    data class Item(val marker: String, val text: String) : Block
    data class Code(val text: String) : Block
}

// **bold**, `code`, *italic*, @mention
private val Inline = Regex("""\*\*(.+?)\*\*|`([^`\n]+)`|(?<![\w*])\*(?!\s)([^*\n]+?)(?<!\s)\*(?![\w*])|(?<![\w@])@[\p{L}\p{N}_]+""")
private val Heading = Regex("""^#{1,6}\s+(.*)$""")
private val Bullet = Regex("""^\s*[-*•]\s+(.*)$""")
private val Numbered = Regex("""^\s*(\d{1,3})[.)]\s+(.*)$""")

private fun parse(source: String): List<Block> {
    val blocks = mutableListOf<Block>()
    val paragraph = StringBuilder()
    val code = StringBuilder()
    var inCode = false
    fun flushParagraph() {
        if (paragraph.isNotBlank()) blocks += Block.Paragraph(paragraph.toString().trim('\n'))
        paragraph.clear()
    }
    for (line in source.lines()) {
        if (line.trimStart().startsWith("```")) {
            if (inCode) {
                blocks += Block.Code(code.toString().trimEnd('\n'))
                code.clear()
            } else {
                flushParagraph()
            }
            inCode = !inCode
            continue
        }
        if (inCode) {
            code.append(line).append('\n')
            continue
        }
        val heading = Heading.find(line)
        val bullet = Bullet.find(line)
        val numbered = Numbered.find(line)
        when {
            line.isBlank() -> flushParagraph()
            heading != null -> {
                flushParagraph()
                blocks += Block.Paragraph(heading.groupValues[1], heading = true)
            }
            bullet != null -> {
                flushParagraph()
                blocks += Block.Item("•", bullet.groupValues[1])
            }
            numbered != null -> {
                flushParagraph()
                blocks += Block.Item("${numbered.groupValues[1]}.", numbered.groupValues[2])
            }
            else -> paragraph.append(line).append('\n')
        }
    }
    if (inCode && code.isNotBlank()) blocks += Block.Code(code.toString().trimEnd('\n')) // still streaming
    flushParagraph()
    return blocks
}

private fun inline(text: String, mentions: Map<String, Color>): AnnotatedString = buildAnnotatedString {
    var cursor = 0
    for (match in Inline.findAll(text)) {
        append(text.substring(cursor, match.range.first))
        val (bold, code, italic) = match.destructured
        when {
            bold.isNotEmpty() -> withStyle(SpanStyle(fontWeight = FontWeight.SemiBold)) { append(bold) }
            code.isNotEmpty() -> withStyle(SpanStyle(fontFamily = GeistMono, fontSize = 14.sp, fontWeight = FontWeight.Medium)) { append(code) }
            italic.isNotEmpty() -> withStyle(SpanStyle(fontStyle = FontStyle.Italic)) { append(italic) }
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
 * Renders the subset of Markdown that models write in chat: paragraphs, emphasis, lists, headings, code.
 * [mentions] maps a lowercase agent handle (name without spaces) to the color its @mention is drawn in.
 * [fadeTail] fades that many trailing characters, for text that is still streaming in.
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
    val head = remember(settled) { parse(settled) }
    val tail = remember(text) { parse(text.substring(settled.length)) }
    val blocks = head + tail
    Column(modifier) {
        blocks.forEachIndexed { index, block ->
            // List items sit closer to each other than paragraphs do.
            val previous = blocks.getOrNull(index - 1)
            val gap = when {
                previous == null -> 0.dp
                block is Block.Item && previous is Block.Item -> 4.dp
                else -> 10.dp
            }
            val spaced = Modifier.padding(top = gap)
            val fade = if (index == blocks.lastIndex) fadeTail else 0
            when (block) {
                is Block.Paragraph -> Text(
                    remember(block, mentions, fade) { inline(block.text, mentions).fadeTail(fade, color) },
                    spaced,
                    style = if (block.heading) OrbitType.body.copy(fontWeight = FontWeight.SemiBold) else OrbitType.body,
                    color = color,
                )
                // The marker sits in its own column, so wrapped lines align with the text, not the bullet.
                is Block.Item -> Row(spaced, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(block.marker, Modifier.widthIn(min = 14.dp), style = OrbitType.body, color = c.textSecondary)
                    Text(remember(block, mentions, fade) { inline(block.text, mentions).fadeTail(fade, color) }, style = OrbitType.body, color = color)
                }
                is Block.Code -> {
                    val shape = RoundedCornerShape(OrbitDimens.radiusS)
                    Text(
                        AnnotatedString(block.text).fadeTail(fade, color),
                        modifier = spaced
                            .fillMaxWidth()
                            .clip(shape)
                            .background(c.surface)
                            .border(1.dp, c.hairline, shape)
                            .horizontalScroll(rememberScrollState())
                            .padding(14.dp),
                        style = OrbitType.mono.copy(fontSize = 13.sp, lineHeight = 20.sp),
                        color = color,
                    )
                }
            }
        }
    }
}
