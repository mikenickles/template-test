package dev.orbit.app.ui.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
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
import kotlin.math.sqrt
import kotlin.random.Random

/** One agent color: the fill, and a deeper version of it that reads as text on a light page. */
class AvatarColor(val fill: Color, val onLight: Color)

/** Ten hues spread around the wheel. A user picks from these. */
val AvatarPalette: List<AvatarColor> = listOf(
    AvatarColor(Color(0xFFFF6B57), Color(0xFFC2410C)), // coral
    AvatarColor(Color(0xFFFF9F2E), Color(0xFFB45309)), // amber
    AvatarColor(Color(0xFFFFD233), Color(0xFFA16207)), // sun
    AvatarColor(Color(0xFF93E04B), Color(0xFF4D7C0F)), // lime
    AvatarColor(Color(0xFF2FD9A0), Color(0xFF047857)), // mint
    AvatarColor(Color(0xFF38C6F4), Color(0xFF0E7490)), // cyan
    AvatarColor(Color(0xFF5E8BFF), Color(0xFF1D4ED8)), // blue
    AvatarColor(Color(0xFF9B7CFF), Color(0xFF6D28D9)), // violet
    AvatarColor(Color(0xFFD07CFF), Color(0xFFA21CAF)), // orchid
    AvatarColor(Color(0xFFFF6FB5), Color(0xFFBE185D)), // pink
)

/** Not offered in the picker: marks an agent that no longer exists. */
private val Graphite = AvatarColor(Color(0xFFA3A8B4), Color(0xFF52525B))
private const val GRAPHITE = -1

const val SHAPE_COUNT = 5
const val EYES_COUNT = 8

/** Stand-in for an agent that has since been deleted. */
val FormerAgentAvatar = AvatarSpec(shape = 0, color = GRAPHITE, eyes = 7)

private val Ink = Color(0xFF0B0B0F)

fun randomAvatar(random: Random = Random): AvatarSpec = AvatarSpec(
    shape = random.nextInt(SHAPE_COUNT),
    color = random.nextInt(AvatarPalette.size),
    eyes = random.nextInt(EYES_COUNT),
)

private fun AvatarSpec.swatch(): AvatarColor = if (color == GRAPHITE) Graphite else AvatarPalette[color.mod(AvatarPalette.size)]

fun AvatarSpec.tint(): Color = swatch().fill

/** The agent's color as text on the current background. */
@Composable
fun AvatarSpec.textColor(): Color = if (Orbit.colors.isDark) swatch().fill else swatch().onLight

/**
 * An agent's avatar: one flat geometric shape, one color, two eyes.
 * While [thinking], a satellite circles it and its eyes glance side to side.
 * [ring] outlines it in the given color, to separate it from an avatar it overlaps.
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
            animationSpec = infiniteRepeatable(tween(2200, easing = LinearEasing), RepeatMode.Restart),
            label = "phase",
        )
        value
    } else {
        null
    }
    val dark = Orbit.colors.isDark
    Canvas(modifier.size(size)) {
        val look = phase?.let { sin(it * 4 * PI).toFloat() * 0.045f } ?: 0f
        drawAvatar(spec, dp = size.value, dark = dark, look = look, ring = ring)
        if (phase != null) drawSatellite(spec.tint(), phase)
    }
}

/** The mark of an agent at work: a small moon on a faint orbit just outside the avatar. */
private fun DrawScope.drawSatellite(color: Color, phase: Float) {
    val s = size.minDimension
    val orbit = s * 0.66f
    val angle = (phase * 2 * PI - PI / 4).toFloat()
    drawCircle(color.copy(alpha = 0.22f), orbit, center, style = Stroke(width = 1.dp.toPx()))
    drawCircle(color, s * 0.075f, Offset(center.x + orbit * cos(angle), center.y + orbit * sin(angle)))
}

/**
 * How much of the canvas each shape spans. Shapes that reach into the corners carry more area,
 * so they are drawn slightly smaller to look the same size as the circle beside them.
 */
private val ShapeExtent = floatArrayOf(1f, 0.9f, 1.04f, 0.95f, 1f)

// Drawn in units of `s`, the canvas width.
private fun DrawScope.drawAvatar(spec: AvatarSpec, dp: Float, dark: Boolean, look: Float, ring: Color?) {
    val s = size.minDimension
    val base = spec.tint()
    val shape = spec.shape.mod(SHAPE_COUNT)
    val inset = s * (1f - ShapeExtent[shape]) / 2
    val body = bodyPath(shape, Rect(inset, inset, s - inset, s - inset))
    if (ring != null) drawPath(body, ring, style = Stroke(width = s * 0.14f))
    // A quiet top-left to bottom-right ramp. On a light page the shape is shaded rather than
    // highlighted, so yellows and greens keep their edge against white.
    val ramp = if (dark) listOf(lerp(base, Color.White, 0.2f), base) else listOf(base, lerp(base, Color.Black, 0.1f))
    drawPath(body, Brush.linearGradient(ramp, start = Offset(s * 0.15f, 0f), end = Offset(s * 0.7f, s)))
    drawEyes(spec.eyes.mod(EYES_COUNT), s, dp, cx = s * (0.5f + look), y = s * 0.485f, base = base)
}

private fun bodyPath(shape: Int, b: Rect): Path = Path().apply {
    val r = b.width / 2
    val c = b.center

    /** Closed curve traced from the angle around the center. */
    fun polar(point: (Double) -> Offset) {
        val steps = 240
        for (i in 0 until steps) {
            val p = point(2 * PI * i / steps)
            if (i == 0) moveTo(c.x + p.x, c.y + p.y) else lineTo(c.x + p.x, c.y + p.y)
        }
        close()
    }

    /** A superellipse: rounded-square with continuous curvature, no seam where flat meets corner. */
    fun superellipse(n: Double, radius: Float, turn: Double = 0.0) = polar { t ->
        val x = radius * sign(cos(t)) * abs(cos(t)).pow(2 / n)
        val y = radius * sign(sin(t)) * abs(sin(t)).pow(2 / n)
        Offset((x * cos(turn) - y * sin(turn)).toFloat(), (x * sin(turn) + y * cos(turn)).toFloat())
    }
    when (shape) {
        0 -> addOval(b) // circle
        1 -> superellipse(3.8, r) // squircle
        2 -> { // diamond: a softer superellipse stood on its corner, scaled back inside the box
            val n = 2.7
            superellipse(n, r / sqrt(2.0).pow(1 - 2 / n).toFloat(), turn = PI / 4)
        }
        3 -> addRoundRect( // bubble: round, with one tight corner like a speech bubble's tail
            RoundRect(b, CornerRadius(r), CornerRadius(r), CornerRadius(r), CornerRadius(r * 0.22f)),
        )
        else -> polar { t -> // scallop
            val radius = r * (0.93 + 0.07 * cos(8 * t))
            Offset((radius * cos(t)).toFloat(), (radius * sin(t)).toFloat())
        }
    }
}

private fun DrawScope.drawEyes(eyes: Int, s: Float, dp: Float, cx: Float, y: Float, base: Color) {
    // Optical sizing: small avatars get heavier, simpler eyes so they don't dissolve into specks.
    val k = if (dp < 28f) 1.28f else 1f
    val style = if (dp < 24f && (eyes == 4 || eyes == 5)) 0 else eyes
    val u = s * k
    fun pair(halfGap: Float) = listOf(cx - s * halfGap * (1 + (k - 1) * 0.5f), cx + s * halfGap * (1 + (k - 1) * 0.5f))
    fun capsule(x: Float, w: Float, h: Float) =
        drawRoundRect(Ink, Offset(x - w / 2, y - h / 2), Size(w, h), CornerRadius(minOf(w, h) / 2))

    fun arc(x: Float) {
        val w = u * 0.13f
        drawArc(
            Ink, 200f, 140f, false, Offset(x - w / 2, y - w * 0.28f), Size(w, w),
            style = Stroke(width = u * 0.075f, cap = StrokeCap.Round),
        )
    }
    val dot = u * 0.07f
    when (style) {
        0 -> pair(0.135f).forEach { drawCircle(Ink, dot, Offset(it, y)) } // dot
        1 -> pair(0.135f).forEach { capsule(it, u * 0.105f, u * 0.215f) } // tall
        2 -> pair(0.145f).forEach(::arc) // smiling
        3 -> pair(0.145f).let { (left, right) -> // wink
            arc(left)
            drawCircle(Ink, dot, Offset(right, y))
        }
        4 -> pair(0.155f).forEach { x -> // sparkle: a four-point star
            val long = u * 0.115f
            val short = u * 0.03f
            val star = Path().apply {
                moveTo(x, y - long)
                quadraticTo(x + short, y - short, x + long, y)
                quadraticTo(x + short, y + short, x, y + long)
                quadraticTo(x - short, y + short, x - long, y)
                quadraticTo(x - short, y - short, x, y - long)
                close()
            }
            drawPath(star, Ink)
        }
        5 -> pair(0.16f).forEach { // bright: a larger eye, with a glint where there is room for one
            drawCircle(Ink, u * 0.092f, Offset(it, y))
            if (dp >= 32f) drawCircle(Color.White, u * 0.03f, Offset(it + u * 0.03f, y - u * 0.032f))
        }
        6 -> { // visor
            capsule(cx, s * 0.58f, u * 0.2f)
            listOf(cx - s * 0.14f, cx + s * 0.14f).forEach { drawCircle(lerp(base, Color.White, 0.25f), u * 0.042f, Offset(it, y)) }
        }
        else -> pair(0.145f).forEach { capsule(it, u * 0.15f, u * 0.075f) } // calm
    }
}

/** Avatars side by side. */
@Composable
fun AvatarRow(specs: List<AvatarSpec>, modifier: Modifier = Modifier, size: Dp = 36.dp, max: Int = 5, gap: Dp = size * 0.16f) {
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(gap), verticalAlignment = Alignment.CenterVertically) {
        for (spec in specs.take(max)) AgentAvatar(spec, size = size)
    }
}

/**
 * A room's badge: up to three of its members arranged inside one rounded tile.
 * Never more than three, so each face stays large enough to read.
 */
@Composable
fun CrewTile(specs: List<AvatarSpec>, modifier: Modifier = Modifier, size: Dp = 56.dp, color: Color = Orbit.colors.surfaceRaised) {
    // (x, y, diameter) as fractions of the tile.
    val layout = when (minOf(specs.size, 3)) {
        0 -> emptyList()
        1 -> listOf(Triple(0.2f, 0.2f, 0.6f))
        2 -> listOf(Triple(0.1f, 0.1f, 0.5f), Triple(0.4f, 0.4f, 0.5f))
        else -> listOf(Triple(0.285f, 0.075f, 0.43f), Triple(0.06f, 0.495f, 0.43f), Triple(0.51f, 0.495f, 0.43f))
    }
    Box(modifier.size(size).clip(RoundedCornerShape(size * 0.3f)).background(color)) {
        layout.forEachIndexed { index, (x, y, d) ->
            AgentAvatar(specs[index], Modifier.offset(size * x, size * y), size * d, ring = if (index > 0) color else null)
        }
    }
}
