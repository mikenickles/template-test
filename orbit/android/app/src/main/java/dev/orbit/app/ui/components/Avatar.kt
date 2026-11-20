package dev.orbit.app.ui.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import dev.orbit.app.data.AvatarSpec
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.sin
import kotlin.random.Random

/** Body colors as (highlight, base) pairs, drawn as a soft top-to-bottom gradient. */
val AvatarPalette: List<Pair<Color, Color>> = listOf(
    Color(0xFFFF9A8B) to Color(0xFFFF5F52), // coral
    Color(0xFFFFBE7A) to Color(0xFFFF8C3A), // tangerine
    Color(0xFFFFE785) to Color(0xFFFFC42E), // sun
    Color(0xFFCDF58C) to Color(0xFF8FDB4B), // lime
    Color(0xFF86EFC6) to Color(0xFF2FCB8C), // mint
    Color(0xFF8ADFFB) to Color(0xFF35B3E8), // sky
    Color(0xFF9DBBFF) to Color(0xFF557FF0), // blue
    Color(0xFFC2ADFF) to Color(0xFF8B66F5), // violet
    Color(0xFFFFADDC) to Color(0xFFF765B4), // pink
    Color(0xFFC3CBD9) to Color(0xFF7E8AA3), // slate
)

const val SHAPE_COUNT = 5
const val EYES_COUNT = 7
const val MOUTH_COUNT = 6
const val EXTRA_COUNT = 6

private val Ink = Color(0xFF17171F)

fun randomAvatar(random: Random = Random): AvatarSpec = AvatarSpec(
    shape = random.nextInt(SHAPE_COUNT),
    color = random.nextInt(AvatarPalette.size),
    eyes = random.nextInt(EYES_COUNT),
    mouth = random.nextInt(MOUTH_COUNT),
    extra = random.nextInt(EXTRA_COUNT),
)

/** The agent's base color, for tinting its name and accents. */
fun AvatarSpec.tint(): Color = AvatarPalette[color.mod(AvatarPalette.size)].second

/** The agent's lighter highlight color, readable on dark backgrounds. */
fun AvatarSpec.highlight(): Color = AvatarPalette[color.mod(AvatarPalette.size)].first

/**
 * An agent's dot character. When [thinking] it bobs and glances side to side.
 */
@Composable
fun AgentAvatar(spec: AvatarSpec, modifier: Modifier = Modifier, size: Dp = 48.dp, thinking: Boolean = false) {
    if (thinking) {
        val transition = rememberInfiniteTransition(label = "thinking")
        val phase by transition.animateFloat(
            initialValue = 0f,
            targetValue = 1f,
            animationSpec = infiniteRepeatable(tween(1400, easing = LinearEasing), RepeatMode.Restart),
            label = "phase",
        )
        AvatarCanvas(spec, modifier.size(size), phase)
    } else {
        AvatarCanvas(spec, modifier.size(size), null)
    }
}

@Composable
private fun AvatarCanvas(spec: AvatarSpec, modifier: Modifier, phase: Float?) {
    Box(modifier) {
        Canvas(Modifier.fillMaxSize()) {
            val wave = phase?.let { sin(it * 2 * PI).toFloat() } ?: 0f
            drawAvatar(spec, bob = -abs(wave) * 0.05f, look = wave * 0.035f)
        }
    }
}

// Everything below draws in units of `s`, the canvas width. The body is a
// circle-ish shape centered a little low, leaving headroom for antennae etc.
private fun DrawScope.drawAvatar(spec: AvatarSpec, bob: Float, look: Float) {
    val s = size.minDimension
    val (light, base) = AvatarPalette[spec.color.mod(AvatarPalette.size)]
    val cx = s * 0.5f
    val cy = s * (0.57f + bob)
    val r = s * 0.41f
    val body = Rect(cx - r, cy - r, cx + r, cy + r)

    drawExtraBehind(spec.extra.mod(EXTRA_COUNT), s, cx, body, light, base)
    drawPath(bodyPath(spec.shape.mod(SHAPE_COUNT), body), Brush.verticalGradient(listOf(light, base), body.top, body.bottom))
    // Soft highlight, top left.
    drawOval(
        Color.White.copy(alpha = 0.28f),
        topLeft = Offset(cx - r * 0.62f, cy - r * 0.74f),
        size = Size(r * 0.5f, r * 0.3f),
    )

    val eyeY = cy - s * 0.035f
    val gap = s * 0.15f
    drawEyes(spec.eyes.mod(EYES_COUNT), s, cx + look * s, eyeY, gap)
    drawMouth(spec.mouth.mod(MOUTH_COUNT), s, cx + look * s * 0.6f, cy + s * 0.15f)
    if (spec.extra.mod(EXTRA_COUNT) == 3) {
        val blush = Color(0xFFFF4F7B).copy(alpha = 0.32f)
        drawCircle(blush, s * 0.055f, Offset(cx - s * 0.25f, cy + s * 0.08f))
        drawCircle(blush, s * 0.055f, Offset(cx + s * 0.25f, cy + s * 0.08f))
    }
}

private fun bodyPath(shape: Int, b: Rect): Path = Path().apply {
    val r = b.width / 2
    fun corners(tl: Float, tr: Float, br: Float, bl: Float) = addRoundRect(
        RoundRect(
            b,
            topLeft = CornerRadius(r * tl),
            topRight = CornerRadius(r * tr),
            bottomRight = CornerRadius(r * br),
            bottomLeft = CornerRadius(r * bl),
        ),
    )
    when (shape) {
        0 -> addOval(b) // dot
        1 -> corners(0.62f, 0.62f, 0.62f, 0.62f) // squircle
        2 -> corners(1f, 0.7f, 1f, 0.56f) // pebble
        3 -> { // egg: narrow crown, wide base
            val cx = b.center.x
            moveTo(cx, b.top)
            cubicTo(cx + r * 0.78f, b.top, b.right, b.center.y - r * 0.05f, b.right, b.center.y + r * 0.3f)
            cubicTo(b.right, b.bottom - r * 0.1f, cx + r * 0.55f, b.bottom, cx, b.bottom)
            cubicTo(cx - r * 0.55f, b.bottom, b.left, b.bottom - r * 0.1f, b.left, b.center.y + r * 0.3f)
            cubicTo(b.left, b.center.y - r * 0.05f, cx - r * 0.78f, b.top, cx, b.top)
            close()
        }
        else -> corners(1f, 1f, 0.36f, 0.36f) // gumdrop
    }
}

private fun DrawScope.drawExtraBehind(extra: Int, s: Float, cx: Float, body: Rect, light: Color, base: Color) {
    val top = body.top
    val stroke = Stroke(width = s * 0.035f, cap = StrokeCap.Round)
    when (extra) {
        1 -> { // antenna
            drawLine(base, Offset(cx, top + s * 0.04f), Offset(cx, top - s * 0.06f), stroke.width, StrokeCap.Round)
            drawCircle(light, s * 0.05f, Offset(cx, top - s * 0.09f))
        }
        2 -> { // twin antennae
            for (dir in listOf(-1f, 1f)) {
                val tip = Offset(cx + dir * s * 0.2f, top - s * 0.05f)
                drawLine(base, Offset(cx + dir * s * 0.12f, top + s * 0.08f), tip, stroke.width, StrokeCap.Round)
                drawCircle(light, s * 0.042f, tip)
            }
        }
        4 -> { // halo
            drawOval(
                Color(0xFFFFD75E),
                topLeft = Offset(cx - s * 0.17f, top - s * 0.115f),
                size = Size(s * 0.34f, s * 0.1f),
                style = Stroke(width = s * 0.032f),
            )
        }
        5 -> { // sprout
            val green = Color(0xFF4CCB6B)
            drawLine(green, Offset(cx, top + s * 0.03f), Offset(cx, top - s * 0.05f), stroke.width, StrokeCap.Round)
            for (dir in listOf(-1f, 1f)) {
                val leaf = Path().apply {
                    moveTo(cx, top - s * 0.045f)
                    quadraticTo(cx + dir * s * 0.05f, top - s * 0.15f, cx + dir * s * 0.15f, top - s * 0.1f)
                    quadraticTo(cx + dir * s * 0.1f, top - s * 0.025f, cx, top - s * 0.045f)
                    close()
                }
                drawPath(leaf, green)
            }
        }
    }
}

private fun DrawScope.drawEyes(eyes: Int, s: Float, cx: Float, y: Float, gap: Float) {
    val line = Stroke(width = s * 0.04f, cap = StrokeCap.Round)
    fun arc(x: Float, w: Float = s * 0.11f) = drawArc(
        Ink, startAngle = 200f, sweepAngle = 140f, useCenter = false,
        topLeft = Offset(x - w / 2, y - w * 0.35f), size = Size(w, w), style = line,
    )
    when (eyes) {
        0 -> for (x in listOf(cx - gap, cx + gap)) drawCircle(Ink, s * 0.05f, Offset(x, y)) // dots
        1 -> for (x in listOf(cx - gap, cx + gap)) { // tall
            drawRoundRect(
                Ink, Offset(x - s * 0.04f, y - s * 0.08f), Size(s * 0.08f, s * 0.16f), CornerRadius(s * 0.04f),
            )
        }
        2 -> for (x in listOf(cx - gap, cx + gap)) arc(x) // happy
        3 -> { // wink
            arc(cx - gap)
            drawCircle(Ink, s * 0.05f, Offset(cx + gap, y))
        }
        4 -> for (x in listOf(cx - gap, cx + gap)) { // wide
            drawCircle(Color.White, s * 0.095f, Offset(x, y))
            drawCircle(Ink, s * 0.05f, Offset(x + s * 0.015f, y + s * 0.01f))
            drawCircle(Color.White, s * 0.016f, Offset(x + s * 0.035f, y - s * 0.015f))
        }
        5 -> { // visor
            drawRoundRect(
                Ink, Offset(cx - s * 0.27f, y - s * 0.075f), Size(s * 0.54f, s * 0.15f), CornerRadius(s * 0.075f),
            )
            for (x in listOf(cx - gap, cx + gap)) drawCircle(Color(0xFF7DF9C1), s * 0.03f, Offset(x, y))
        }
        else -> for (x in listOf(cx - gap, cx + gap)) { // sleepy
            drawLine(Ink, Offset(x - s * 0.05f, y), Offset(x + s * 0.05f, y), line.width, StrokeCap.Round)
        }
    }
}

private fun DrawScope.drawMouth(mouth: Int, s: Float, cx: Float, y: Float) {
    val line = Stroke(width = s * 0.035f, cap = StrokeCap.Round)
    when (mouth) {
        1 -> drawArc( // smile
            Ink, 25f, 130f, false, Offset(cx - s * 0.085f, y - s * 0.1f), Size(s * 0.17f, s * 0.13f), style = line,
        )
        2 -> drawCircle(Ink, s * 0.035f, Offset(cx, y)) // "o"
        3 -> drawLine(Ink, Offset(cx - s * 0.06f, y), Offset(cx + s * 0.06f, y), line.width, StrokeCap.Round) // flat
        4 -> drawArc( // grin
            Ink, 0f, 180f, true, Offset(cx - s * 0.09f, y - s * 0.085f), Size(s * 0.18f, s * 0.15f),
        )
        5 -> for (dir in listOf(-1f, 1f)) { // cat
            drawArc(
                Ink, 20f, 140f, false,
                Offset(cx + dir * s * 0.045f - s * 0.045f, y - s * 0.06f), Size(s * 0.09f, s * 0.08f), style = line,
            )
        }
    }
}

/** Overlapping row of avatars, for rooms. */
@Composable
fun AvatarStack(specs: List<AvatarSpec>, modifier: Modifier = Modifier, size: Dp = 36.dp, max: Int = 4) {
    val shown = specs.take(max)
    val step = size * 0.62f
    Box(modifier.size(width = if (shown.isEmpty()) size else step * (shown.size - 1) + size, height = size)) {
        shown.forEachIndexed { index, spec ->
            AgentAvatar(spec, Modifier.offset(x = step * index), size)
        }
    }
}
