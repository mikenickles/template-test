package dev.orbit.app.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Animatable
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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import dev.orbit.app.data.AvatarSpec
import dev.orbit.app.ui.theme.Orbit
import dev.orbit.app.ui.theme.OrbitMotion
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.pow
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

// ---------------------------------------------------------------------------------------------
// Shapes. Every shape is described the same way, as its distance from the center at each angle,
// so any shape can morph smoothly into any other by blending those distances.
// ---------------------------------------------------------------------------------------------

private const val SAMPLES = 240

/**
 * How much of the canvas each shape spans. Shapes that reach into the corners carry more area,
 * so they are drawn slightly smaller to look the same size as the circle beside them.
 */
private val ShapeExtent = floatArrayOf(1f, 0.9f, 1.04f, 0.95f, 1f)

/** Distance from center to edge of a superellipse of exponent [n], for a unit "radius". */
private fun superellipse(angle: Double, n: Double): Double =
    (abs(cos(angle)).pow(n) + abs(sin(angle)).pow(n)).pow(-1 / n)

/** A circle, except the lower-left corner, which is a tight round corner like a speech bubble's tail. */
private fun bubble(angle: Double): Double {
    val c = cos(angle)
    val s = sin(angle)
    if (c >= 0 || s <= 0) return 1.0
    val k = 0.22 // corner radius
    val ux = abs(c)
    val uy = abs(s)
    var t = 1 / max(ux, uy)
    if (t * ux > 1 - k && t * uy > 1 - k) {
        val d = (ux + uy) * (1 - k)
        t = d + sqrt(d * d - 2 * (1 - k) * (1 - k) + k * k)
    }
    return t
}

private fun outline(shape: Int, angle: Double): Double = when (shape) {
    0 -> 1.0 // circle
    1 -> superellipse(angle, 3.8) // squircle
    2 -> { // diamond: a softer superellipse stood on its corner, scaled back inside the box
        val n = 2.7
        superellipse(angle - PI / 4, n) / sqrt(2.0).pow(1 - 2 / n)
    }
    3 -> bubble(angle)
    else -> 0.93 + 0.07 * cos(8 * angle) // scallop
}

/** Each shape's edge, sampled once: its radius as a fraction of the canvas half-width, per angle. */
private val Outlines: List<FloatArray> = List(SHAPE_COUNT) { shape ->
    FloatArray(SAMPLES) { i -> (outline(shape, 2 * PI * i / SAMPLES) * ShapeExtent[shape]).toFloat() }
}

private val Angles = FloatArray(SAMPLES) { i -> (2 * PI * i / SAMPLES).toFloat() }

/** Tracks a shape change: the outline it started from, the one it's heading to, and progress. */
private class ShapeMorph(initial: FloatArray) {
    var from = initial
    var to = initial
    val progress = Animatable(1f)

    fun radius(i: Int): Float {
        val t = progress.value
        return (from[i] + (to[i] - from[i]) * t).coerceAtLeast(0.2f)
    }

    suspend fun morphTo(target: FloatArray) {
        if (target === to) return
        // Start from wherever the shape is now, even mid-morph, so changes never jump.
        from = FloatArray(SAMPLES) { radius(it) }
        to = target
        progress.snapTo(0f)
        // A slight overshoot gives the change a soft, jelly-like settle.
        progress.animateTo(1f, androidx.compose.animation.core.spring(dampingRatio = 0.62f, stiffness = 260f))
    }
}

private fun bodyPath(radius: (Int) -> Float, s: Float): Path = Path().apply {
    val c = s / 2
    for (i in 0 until SAMPLES) {
        val r = radius(i) * c
        val x = c + r * cos(Angles[i])
        val y = c + r * sin(Angles[i])
        if (i == 0) moveTo(x, y) else lineTo(x, y)
    }
    close()
}

// ---------------------------------------------------------------------------------------------
// The avatar.
// ---------------------------------------------------------------------------------------------

/**
 * An agent's avatar: one flat geometric shape, one color, two eyes.
 *
 * - [alive]: it blinks now and then, glances around, and animates any change to its look
 *   (shapes morph, colors blend, eyes swap behind a blink). For avatars someone looks at,
 *   not for every face in a list.
 * - [thinking]: a moon circles it, trailing light, and its eyes look side to side.
 * - [ring]: outlines it in a color, to separate it from an avatar it overlaps.
 */
@Composable
fun AgentAvatar(
    spec: AvatarSpec,
    modifier: Modifier = Modifier,
    size: Dp = 48.dp,
    thinking: Boolean = false,
    ring: Color? = null,
    alive: Boolean = false,
) {
    val dark = Orbit.colors.isDark
    val shape = spec.shape.mod(SHAPE_COUNT)
    val eyes = spec.eyes.mod(EYES_COUNT)

    if (!alive) {
        // The common case, kept cheap: no animation state unless thinking.
        val phase = if (thinking) thinkingPhase() else null
        Canvas(modifier.size(size)) {
            val wave = phase?.value?.let { sin(it * 4 * PI).toFloat() } ?: 0f
            drawAvatar({ Outlines[shape][it] }, spec.tint(), eyes, size.value, dark, look = wave * 0.045f, openness = 1f, ring = ring)
            phase?.let { drawSatellite(spec.tint(), it.value) }
        }
        return
    }

    val morph = remember { ShapeMorph(Outlines[shape]) }
    LaunchedEffect(shape) { morph.morphTo(Outlines[shape]) }

    val color by animateColorAsState(spec.tint(), OrbitMotion.gentle(), label = "color")

    // Eyes change behind a quick blink, so the swap is never seen.
    val openness = remember { Animatable(1f) }
    var shownEyes by remember { mutableIntStateOf(eyes) }
    LaunchedEffect(eyes) {
        if (eyes == shownEyes) return@LaunchedEffect
        openness.animateTo(0.05f, tween(90, easing = OrbitMotion.Accelerate))
        shownEyes = eyes
        openness.animateTo(1f, OrbitMotion.bouncy())
    }

    // Idle life: a blink every few seconds (sometimes two), and the odd glance.
    val glance = remember { Animatable(0f) }
    LaunchedEffect(Unit) {
        val random = Random(spec.hashCode())
        launch {
            while (true) {
                delay(2400L + random.nextLong(4200))
                repeat(if (random.nextInt(5) == 0) 2 else 1) {
                    openness.animateTo(0.06f, tween(70, easing = OrbitMotion.Accelerate))
                    openness.animateTo(1f, tween(150, easing = OrbitMotion.Decelerate))
                }
            }
        }
        while (true) {
            delay(5000L + random.nextLong(6000))
            glance.animateTo(if (random.nextBoolean()) 0.045f else -0.045f, tween(320, easing = OrbitMotion.Emphasized))
            delay(900L + random.nextLong(900))
            glance.animateTo(0f, tween(420, easing = OrbitMotion.Emphasized))
        }
    }

    val phase = if (thinking) thinkingPhase() else null
    Canvas(modifier.size(size)) {
        val wave = phase?.value?.let { sin(it * 4 * PI).toFloat() * 0.045f } ?: 0f
        drawAvatar(morph::radius, color, shownEyes, size.value, dark, look = wave + glance.value, openness = openness.value, ring = ring)
        phase?.let { drawSatellite(color, it.value) }
    }
}

@Composable
private fun thinkingPhase(): State<Float> {
    val transition = rememberInfiniteTransition(label = "thinking")
    return transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(2200, easing = LinearEasing), RepeatMode.Restart),
        label = "phase",
    )
}

/** The mark of an agent at work: a small moon on a faint orbit, trailing light. */
private fun DrawScope.drawSatellite(color: Color, phase: Float) {
    val s = size.minDimension
    val orbit = s * 0.66f
    drawCircle(color.copy(alpha = 0.18f), orbit, center, style = Stroke(width = 1.dp.toPx()))
    for (i in 7 downTo 0) {
        val angle = ((phase - i * 0.022f) * 2 * PI - PI / 4).toFloat()
        val fade = 1f - i / 8f
        drawCircle(
            color.copy(alpha = if (i == 0) 1f else 0.5f * fade * fade),
            s * 0.075f * (if (i == 0) 1f else 0.55f + 0.45f * fade),
            Offset(center.x + orbit * cos(angle), center.y + orbit * sin(angle)),
        )
    }
}

// Drawn in units of `s`, the canvas width.
private fun DrawScope.drawAvatar(
    radius: (Int) -> Float,
    base: Color,
    eyes: Int,
    dp: Float,
    dark: Boolean,
    look: Float,
    openness: Float,
    ring: Color?,
) {
    val s = size.minDimension
    val body = bodyPath(radius, s)
    if (ring != null) drawPath(body, ring, style = Stroke(width = s * 0.14f))
    // A quiet top-left to bottom-right ramp. On a light page the shape is shaded rather than
    // highlighted, so yellows and greens keep their edge against white.
    val ramp = if (dark) listOf(lerp(base, Color.White, 0.2f), base) else listOf(base, lerp(base, Color.Black, 0.1f))
    drawPath(body, Brush.linearGradient(ramp, start = Offset(s * 0.15f, 0f), end = Offset(s * 0.7f, s)))
    val cx = s * (0.5f + look)
    val y = s * 0.485f
    withTransform({ scale(1f, openness, pivot = Offset(cx, y)) }) {
        drawEyes(eyes, s, dp, cx, y, base)
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

/** Avatars side by side. [keyOf] lets each take part in a shared transition. */
@Composable
fun AvatarRow(
    specs: List<AvatarSpec>,
    modifier: Modifier = Modifier,
    size: Dp = 36.dp,
    max: Int = 5,
    gap: Dp = size * 0.16f,
    alive: Boolean = false,
    itemModifier: @Composable (index: Int) -> Modifier = { Modifier },
) {
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(gap), verticalAlignment = Alignment.CenterVertically) {
        specs.take(max).forEachIndexed { index, spec -> AgentAvatar(spec, itemModifier(index), size = size, alive = alive) }
    }
}

/**
 * A room's badge: up to three of its members arranged inside one rounded tile.
 * Never more than three, so each face stays large enough to read.
 */
@Composable
fun CrewTile(
    specs: List<AvatarSpec>,
    modifier: Modifier = Modifier,
    size: Dp = 56.dp,
    color: Color = Orbit.colors.surfaceRaised,
    itemModifier: @Composable (index: Int) -> Modifier = { Modifier },
) {
    // (x, y, diameter) as fractions of the tile.
    val layout = when (minOf(specs.size, 3)) {
        0 -> emptyList()
        1 -> listOf(Triple(0.2f, 0.2f, 0.6f))
        2 -> listOf(Triple(0.1f, 0.1f, 0.5f), Triple(0.4f, 0.4f, 0.5f))
        else -> listOf(Triple(0.285f, 0.075f, 0.43f), Triple(0.06f, 0.495f, 0.43f), Triple(0.51f, 0.495f, 0.43f))
    }
    Box(modifier.size(size).clip(RoundedCornerShape(size * 0.3f)).background(color)) {
        layout.forEachIndexed { index, (x, y, d) ->
            AgentAvatar(
                specs[index],
                Modifier.offset(size * x, size * y).then(itemModifier(index)),
                size * d,
                ring = if (index > 0) color else null,
            )
        }
    }
}
