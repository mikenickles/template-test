package dev.orbit.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private sealed interface Block {
    data class Prose(val text: String) : Block
    data class Code(val text: String) : Block
}

// **bold**, `code`, *italic*, @mention
private val Inline = Regex("""\*\*(.+?)\*\*|`([^`\n]+)`|(?<![\w*])\*(?!\s)([^*\n]+?)(?<!\s)\*(?![\w*])|(?<![\w@])@[\p{L}\p{N}_]+""")
private val Heading = Regex("""^#{1,6}\s+(.*)$""")
private val Bullet = Regex("""^(\s*)[-*•]\s+(.*)$""")

private fun splitBlocks(source: String): List<Block> {
    val blocks = mutableListOf<Block>()
    val current = StringBuilder()
    var inCode = false
    fun flush() {
        val text = current.toString().trim('\n')
        if (text.isNotEmpty()) blocks += if (inCode) Block.Code(text) else Block.Prose(text)
        current.clear()
    }
    for (line in source.lines()) {
        if (line.trimStart().startsWith("```")) {
            flush()
            inCode = !inCode
        } else {
            current.append(line).append('\n')
        }
    }
    flush()
    return blocks
}

private fun renderProse(text: String, mention: Color, codeBackground: Color): AnnotatedString = buildAnnotatedString {
    val lines = text.lines()
    lines.forEachIndexed { index, raw ->
        val heading = Heading.find(raw)
        val bullet = if (heading == null) Bullet.find(raw) else null
        val line = when {
            heading != null -> heading.groupValues[1]
            bullet != null -> "${bullet.groupValues[1]}•  ${bullet.groupValues[2]}"
            else -> raw
        }
        val start = length
        var cursor = 0
        for (match in Inline.findAll(line)) {
            append(line.substring(cursor, match.range.first))
            val (bold, code, italic) = match.destructured
            when {
                bold.isNotEmpty() -> withStyle(SpanStyle(fontWeight = FontWeight.SemiBold)) { append(bold) }
                code.isNotEmpty() -> withStyle(
                    SpanStyle(fontFamily = FontFamily.Monospace, fontSize = 14.sp, background = codeBackground),
                ) { append(code) }
                italic.isNotEmpty() -> withStyle(SpanStyle(fontStyle = FontStyle.Italic)) { append(italic) }
                else -> withStyle(SpanStyle(color = mention, fontWeight = FontWeight.SemiBold)) { append(match.value) }
            }
            cursor = match.range.last + 1
        }
        append(line.substring(cursor))
        if (heading != null) addStyle(SpanStyle(fontWeight = FontWeight.Bold), start, length)
        if (index != lines.lastIndex) append('\n')
    }
}

/** Renders the common subset of Markdown that models write in chat: emphasis, code, lists, headings. */
@Composable
fun MarkdownText(text: String, modifier: Modifier = Modifier, color: Color = MaterialTheme.colorScheme.onSurface) {
    val mention = MaterialTheme.colorScheme.secondary
    val codeBackground = MaterialTheme.colorScheme.surfaceContainerHigh
    val blocks = remember(text) { splitBlocks(text) }
    Column(modifier, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        for (block in blocks) {
            when (block) {
                is Block.Prose -> Text(
                    remember(block.text, mention, codeBackground) { renderProse(block.text, mention, codeBackground) },
                    style = MaterialTheme.typography.bodyLarge,
                    color = color,
                )
                is Block.Code -> Text(
                    block.text,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(MaterialTheme.shapes.small)
                        .background(MaterialTheme.colorScheme.surfaceContainer)
                        .horizontalScroll(rememberScrollState())
                        .padding(12.dp),
                    style = MaterialTheme.typography.bodyMedium.copy(fontFamily = FontFamily.Monospace),
                    color = color,
                )
            }
        }
    }
}
