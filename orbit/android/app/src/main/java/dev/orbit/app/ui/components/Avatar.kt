package dev.orbit.app.ui.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
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
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import dev.orbit.app.data.AvatarSpec
import dev.orbit.app.ui.theme.Orbit
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.sign
import kotlin.math.sin
import kotlin.random.Random

/** Agent colors: ten hues at matched brightness, vivid on both black and white. */
val AvatarPalette: List<Color> = listOf(
    Color(0xFFFF6B57), // coral
    Color(0xFFFF9F2E), // amber
    Color(0xFFFFD233), // sun
    Color(0xFFA6E63A), // lime
    Color(0xFF2FD9A0), // mint
    Color(0xFF38C6F4), // cyan
    Color(0xFF5E8BFF), // blue
    Color(0xFF9B7CFF), // violet
    Color(0xFFFF6FB5), // pink
    Color(0xFFA3A8B4), // graphite
)

const val SHAPE_COUNT = 5
const val EYES_COUNT = 8

private val Ink = Color(0xFF0B0B0F)

fun randomAvatar(random: Random = Random): AvatarSpec = AvatarSpec(
    shape = random.nextInt(SHAPE_COUNT),
    color = random.nextInt(AvatarPalette.size),
    eyes = random.nextInt(EYES_COUNT),
)

fun AvatarSpec.tint(): Color = AvatarPalette[color.mod(AvatarPalette.size)]

/** The agent's color adjusted to read as text on the current background. */
@Composable
fun AvatarSpec.textColor(): Color = if (Orbit.colors.isDark) tint() else lerp(tint(), Color.Black, 0.42f)

/**
 * An agent's avatar: one flat geometric shape, one color, two eyes.
 * While [thinking] it breathes and glances side to side.
 * [ring] draws an outline in the given color, to separate overlapping avatars.
 */
@Composable
fun AgentAvatar(
    spec: AvatarSpec,
    modifier: Modifier = Modifier,
    size: Dp = 48.dp,
    thinking: Boolean = false,
    ring: Color? = null,
) {
    val phase = if (thinking) {
        val transition = rememberInfiniteTransition(label = "thinking")
        val value by transition.animateFloat(
            initialValue = 0f,
            targetValue = 1f,
            animationSpec = infiniteRepeatable(tween(1600, easing = LinearEasing), RepeatMode.Restart),
            label = "phase",
        )
        value
    } else {
        null
    }
    Canvas(modifier.size(size)) {
        val wave = phase?.let { sin(it * 2 * PI).toFloat() } ?: 0f
        scale(1f - 0.05f * abs(wave)) { drawAvatar(spec, look = wave * 0.05f, ring = ring) }
    }
}

// Drawn in units of `s`, the canvas width. The shape fills the canvas edge to
// edge so avatars align optically with text and with each other.
private fun DrawScope.drawAvatar(spec: AvatarSpec, look: Float, ring: Color?) {
    val s = size.minDimension
    val base = spec.tint()
    val body = bodyPath(spec.shape.mod(SHAPE_COUNT), Rect(0f, 0f, s, s))
    if (ring != null) drawPath(body, ring, style = Stroke(width = s * 0.11f))
    drawPath(
        body,
        Brush.linearGradient(listOf(lerp(base, Color.White, 0.2f), base), start = Offset(s * 0.15f, 0f), end = Offset(s * 0.7f, s)),
    )
    drawEyes(spec.eyes.mod(EYES_COUNT), s, cx = s * (0.5f + look), y = s * 0.48f, base = base)
}

private fun bodyPath(shape: Int, b: Rect): Path = Path().apply {
    val r = b.width / 2
    val c = b.center
    fun corners(tl: Float, tr: Float, br: Float, bl: Float) = addRoundRect(
        RoundRect(
            b,
            topLeft = CornerRadius(r * tl),
            topRight = CornerRadius(r * tr),
            bottomRight = CornerRadius(r * br),
            bottomLeft = CornerRadius(r * bl),
        ),
    )

    /** Closed curve traced from the angle around the center. */
    fun polar(steps: Int, point: (Double) -> Offset) {
        for (i in 0 until steps) {
            val p = point(2 * PI * i / steps)
            if (i == 0) moveTo(c.x + p.x, c.y + p.y) else lineTo(c.x + p.x, c.y + p.y)
        }
        close()
    }
    when (shape) {
        0 -> addOval(b) // circle
        1 -> polar(96) { t -> // squircle: a superellipse, so the corners have no flat-to-arc seam
            val e = 2 / 4.4
            Offset(
                (r * sign(cos(t)) * abs(cos(t)).pow(e)).toFloat(),
                (r * sign(sin(t)) * abs(sin(t)).pow(e)).toFloat(),
            )
        }
        2 -> corners(1f, 1f, 0.5f, 0.5f) // arch
        3 -> corners(1f, 1f, 1f, 0.24f) // bubble
        else -> polar(160) { t -> // scallop
            val radius = r * (0.945 + 0.055 * cos(8 * t))
            Offset((radius * cos(t)).toFloat(), (radius * sin(t)).toFloat())
        }
    }
}

private fun DrawScope.drawEyes(eyes: Int, s: Float, cx: Float, y: Float, base: Color) {
    val gap = s * 0.135f
    val xs = listOf(cx - gap, cx + gap)
    val stroke = Stroke(width = s * 0.062f, cap = StrokeCap.Round)
    fun capsule(x: Float, w: Float, h: Float, color: Color = Ink) =
        drawRoundRect(color, Offset(x - w / 2, y - h / 2), Size(w, h), CornerRadius(minOf(w, h) / 2))

    fun arc(x: Float) {
        val w = s * 0.15f
        drawArc(Ink, 205f, 130f, false, Offset(x - w / 2, y - w * 0.3f), Size(w, w), style = stroke)
    }
    when (eyes) {
        0 -> xs.forEach { drawCircle(Ink, s * 0.066f, Offset(it, y)) } // dot
        1 -> xs.forEach { capsule(it, s * 0.105f, s * 0.215f) } // tall
        2 -> xs.forEach(::arc) // smiling
        3 -> { // wink
            arc(xs[0])
            drawCircle(Ink, s * 0.066f, Offset(xs[1], y))
        }
        4 -> xs.forEach { // hooded: the lower half of a dot
            val d = s * 0.17f
            drawArc(Ink, 0f, 180f, true, Offset(it - d / 2, y - d * 0.62f), Size(d, d))
        }
        5 -> xs.forEach { // bright: a larger eye with a glint
            drawCircle(Ink, s * 0.092f, Offset(it, y))
            drawCircle(Color.White, s * 0.03f, Offset(it + s * 0.03f, y - s * 0.032f))
        }
        6 -> { // visor
            capsule(cx, s * 0.56f, s * 0.2f)
            xs.forEach { drawCircle(lerp(base, Color.White, 0.25f), s * 0.042f, Offset(it, y)) }
        }
        else -> xs.forEach { capsule(it, s * 0.15f, s * 0.062f) } // calm
    }
}

/**
 * A row of avatars. A positive [overlap] (a fraction of the avatar's width) tucks each one behind
 * the next, outlined in [ring] to match the surface behind; zero or less sets them apart instead.
 */
@Composable
fun AvatarStack(
    specs: List<AvatarSpec>,
    modifier: Modifier = Modifier,
    size: Dp = 36.dp,
    max: Int = 4,
    overlap: Float = 0.2f,
    ring: Color = Orbit.colors.bg,
) {
    val shown = specs.take(max)
    val step = size * (1f - overlap)
    Box(modifier.size(width = if (shown.isEmpty()) size else step * (shown.size - 1) + size, height = size)) {
        shown.forEachIndexed { index, spec ->
            AgentAvatar(spec, Modifier.offset(x = step * index), size, ring = if (index > 0 && overlap > 0f) ring else null)
        }
    }
}

/** A room's badge: its members arranged inside one rounded tile. */
@Composable
fun CrewTile(specs: List<AvatarSpec>, modifier: Modifier = Modifier, size: Dp = 52.dp) {
    val tile = Orbit.colors.surfaceRaised
    // (x, y, diameter) as fractions of the tile, for one to four members.
    val layout = when (minOf(specs.size, 4)) {
        0 -> emptyList()
        1 -> listOf(Triple(0.2f, 0.2f, 0.6f))
        2 -> listOf(Triple(0.12f, 0.12f, 0.48f), Triple(0.4f, 0.4f, 0.48f))
        3 -> listOf(Triple(0.3f, 0.11f, 0.4f), Triple(0.09f, 0.48f, 0.4f), Triple(0.51f, 0.48f, 0.4f))
        else -> listOf(
            Triple(0.11f, 0.11f, 0.36f), Triple(0.53f, 0.11f, 0.36f),
            Triple(0.11f, 0.53f, 0.36f), Triple(0.53f, 0.53f, 0.36f),
        )
    }
    Box(modifier.size(size).clip(RoundedCornerShape(size * 0.3f)).background(tile)) {
        layout.forEachIndexed { index, (x, y, d) ->
            AgentAvatar(
                specs[index],
                Modifier.offset(size * x, size * y),
                size * d,
                ring = if (layout.size == 2 && index == 1) tile else null,
            )
        }
    }
}
