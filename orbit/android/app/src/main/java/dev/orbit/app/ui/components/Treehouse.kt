package dev.orbit.app.ui.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Fill
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.unit.min
import dev.orbit.app.data.AvatarSpec
import dev.orbit.app.ui.theme.LocalReducedMotion
import dev.orbit.app.ui.theme.Orbit
import dev.orbit.app.ui.theme.OrbitColors
import kotlin.math.PI
import kotlin.math.sin

/**
 * Treehouse's picture of the crew at home: a little house in a tree, with the agents in the window,
 * on the porch, out on the branches and down by the ladder. The first agent gets the window.
 *
 * Drawn, not a bitmap, so it follows light and dark. Its colors are washes of three characters'
 * own tints (the Forest Tree's wood, the Leafy Bush's leaves, the Happy Sun's lamplight), so the
 * agents stay the brightest thing in it. The leaves rustle and the agents breathe, unless system
 * animations are off.
 */
@Composable
fun TreehouseScene(specs: List<AvatarSpec>, modifier: Modifier = Modifier) {
    val c = Orbit.colors
    val palette = TreehousePalette.of(c)
    val rustle = if (LocalReducedMotion.current) null else rustling()
    BoxWithConstraints(modifier) {
        // The scene is 1.5 units wide and 1 tall, centered in whatever space it's given.
        val u = min(maxHeight, maxWidth / SCENE_WIDTH)
        val left = (maxWidth - u * SCENE_WIDTH) / 2
        val top = (maxHeight - u) / 2
        Canvas(Modifier.fillMaxSize()) {
            drawTreehouse(palette, Offset(size.width / 2, top.toPx()), u.toPx(), rustle?.value ?: 0f)
        }
        val shown = specs.take(Slots.size)
        shown.forEachIndexed { index, spec ->
            val slot = Slots[index]
            val x = left + u * (SCENE_WIDTH / 2 + slot.x - slot.size / 2)
            val y = top + u * (slot.bottom - slot.size)
            if (index == 0) {
                // In the window, so only the top of them shows, as if leaning on the sill.
                val (wl, wt, ww, wh) = Window
                Box(
                    Modifier
                        .offset(left + u * (SCENE_WIDTH / 2 + wl), top + u * wt)
                        .size(u * ww, u * wh)
                        .clip(RoundedCornerShape(u * 0.045f)),
                ) {
                    AgentAvatar(spec, Modifier.offset(x - (left + u * (SCENE_WIDTH / 2 + wl)), y - (top + u * wt)), size = u * slot.size, alive = true)
                }
            } else {
                AgentAvatar(spec, Modifier.offset(x, y), size = u * slot.size, alive = true)
            }
        }
    }
}

private const val SCENE_WIDTH = 1.5f

/** Where each agent sits: x from the trunk, the y their feet rest on, and their size, all in scene units. */
private class Slot(val x: Float, val bottom: Float, val size: Float)

private val Slots = listOf(
    Slot(0f, 0.665f, 0.2f), // the window
    Slot(-0.275f, 0.668f, 0.17f), // the porch, left
    Slot(0.6f, 0.965f, 0.2f), // by the ladder
    Slot(-0.45f, 0.452f, 0.15f), // out on the low branch
    Slot(0.265f, 0.668f, 0.17f), // the porch, right
    Slot(-0.6f, 0.965f, 0.18f), // under the tree
    Slot(0.45f, 0.285f, 0.14f), // up on the high branch
)

/** The window: left (from the trunk), top, width, height. */
private val Window = listOf(-0.1f, 0.45f, 0.2f, 0.15f)

private class TreehousePalette(
    val shadow: Color,
    val leafBack: Color,
    val leafFront: Color,
    val wood: Color,
    val walls: Color,
    val beams: Color,
    val lamp: Color,
) {
    companion object {
        fun of(c: OrbitColors): TreehousePalette {
            val wood = AvatarSpec(character = 11).tint()
            val leaf = AvatarSpec(character = 18).tint()
            val sun = AvatarSpec(character = 20).tint()
            val dark = c.isDark
            return TreehousePalette(
                shadow = c.text.copy(alpha = if (dark) 0.06f else 0.07f),
                leafBack = lerp(c.bg, leaf, if (dark) 0.2f else 0.26f),
                leafFront = lerp(c.bg, leaf, if (dark) 0.3f else 0.4f),
                wood = lerp(c.bg, wood, if (dark) 0.5f else 0.62f),
                walls = lerp(c.bg, wood, if (dark) 0.34f else 0.32f),
                beams = lerp(c.bg, wood, if (dark) 0.68f else 0.82f),
                // A lamp is on inside, brighter against the dark.
                lamp = lerp(c.bg, sun, if (dark) 0.5f else 0.34f),
            )
        }
    }
}

@Composable
private fun rustling(): State<Float> =
    rememberInfiniteTransition(label = "rustle").animateFloat(
        0f,
        (2 * PI).toFloat(),
        infiniteRepeatable(tween(7000, easing = LinearEasing)),
        label = "leaves",
    )

private fun DrawScope.drawTreehouse(p: TreehousePalette, origin: Offset, u: Float, t: Float) {
    fun pt(x: Float, y: Float) = Offset(origin.x + x * u, origin.y + y * u)

    // Each clump of leaves drifts on its own small loop.
    fun leaves(color: Color, clumps: List<Triple<Float, Float, Float>>, phase: Float) {
        clumps.forEachIndexed { i, (x, y, r) ->
            val sway = sin(t + i * 1.7f + phase) * 0.006f
            drawCircle(color, r * u, pt(x + sway, y + sway * 0.5f))
        }
    }

    // The ground.
    drawOval(p.shadow, pt(-0.78f, 0.935f), Size(1.56f * u, 0.06f * u))

    // Leaves behind the house.
    leaves(
        p.leafBack,
        listOf(
            Triple(0f, 0.3f, 0.3f), Triple(-0.31f, 0.36f, 0.19f), Triple(0.31f, 0.37f, 0.19f),
            Triple(-0.18f, 0.15f, 0.17f), Triple(0.19f, 0.14f, 0.17f), Triple(0f, 0.07f, 0.13f),
        ),
        0f,
    )
    leaves(p.leafFront, listOf(Triple(-0.13f, 0.2f, 0.13f), Triple(0.15f, 0.22f, 0.14f), Triple(0.01f, 0.13f, 0.11f)), 2f)

    // The trunk, flaring into roots.
    val trunk = Path().apply {
        moveTo(pt(-0.1f, 0.96f).x, pt(-0.1f, 0.96f).y)
        cubicTo(pt(-0.055f, 0.92f).x, pt(-0.055f, 0.92f).y, pt(-0.05f, 0.8f).x, pt(-0.05f, 0.8f).y, pt(-0.045f, 0.62f).x, pt(-0.045f, 0.62f).y)
        lineTo(pt(-0.04f, 0.32f).x, pt(-0.04f, 0.32f).y)
        lineTo(pt(0.04f, 0.32f).x, pt(0.04f, 0.32f).y)
        lineTo(pt(0.045f, 0.62f).x, pt(0.045f, 0.62f).y)
        cubicTo(pt(0.05f, 0.8f).x, pt(0.05f, 0.8f).y, pt(0.055f, 0.92f).x, pt(0.055f, 0.92f).y, pt(0.1f, 0.96f).x, pt(0.1f, 0.96f).y)
        close()
    }
    drawPath(trunk, p.wood)

    // Two branches reaching out, each ending in a tuft of leaves.
    val branch = Stroke(width = 0.032f * u, cap = StrokeCap.Round)
    drawLine(p.wood, pt(-0.03f, 0.54f), pt(-0.53f, 0.44f), branch.width, StrokeCap.Round)
    drawLine(p.wood, pt(0.03f, 0.37f), pt(0.51f, 0.28f), branch.width * 0.85f, StrokeCap.Round)
    leaves(p.leafFront, listOf(Triple(-0.57f, 0.41f, 0.06f), Triple(-0.62f, 0.45f, 0.04f)), 4f)
    leaves(p.leafFront, listOf(Triple(0.55f, 0.25f, 0.055f), Triple(0.6f, 0.29f, 0.038f)), 5f)

    // Struts holding up the porch.
    val strut = 0.02f * u
    drawLine(p.beams, pt(-0.3f, 0.69f), pt(-0.04f, 0.8f), strut, StrokeCap.Round)
    drawLine(p.beams, pt(0.3f, 0.69f), pt(0.04f, 0.8f), strut, StrokeCap.Round)

    // The house: plank walls under a soft-cornered roof.
    drawRoundRect(p.walls, pt(-0.22f, 0.4f), Size(0.44f * u, 0.27f * u), CornerRadius(0.03f * u))
    val roof = Path().apply {
        moveTo(pt(-0.27f, 0.42f).x, pt(-0.27f, 0.42f).y)
        lineTo(pt(0f, 0.235f).x, pt(0f, 0.235f).y)
        lineTo(pt(0.27f, 0.42f).x, pt(0.27f, 0.42f).y)
        close()
    }
    drawPath(roof, p.beams, style = Fill)
    drawPath(roof, p.beams, style = Stroke(width = 0.04f * u, join = StrokeJoin.Round))
    drawCircle(p.lamp, 0.032f * u, pt(0f, 0.345f))
    val (wl, wt, ww, wh) = Window
    drawRoundRect(p.lamp, pt(wl, wt), Size(ww * u, wh * u), CornerRadius(0.045f * u))

    // The porch, with a rail at each end.
    drawRoundRect(p.beams, pt(-0.36f, 0.655f), Size(0.72f * u, 0.038f * u), CornerRadius(0.019f * u))
    val rail = 0.014f * u
    for (side in listOf(-1f, 1f)) {
        drawLine(p.beams, pt(side * 0.345f, 0.66f), pt(side * 0.345f, 0.585f), rail, StrokeCap.Round)
        drawLine(p.beams, pt(side * 0.345f, 0.59f), pt(side * 0.225f, 0.59f), rail, StrokeCap.Round)
    }

    // The ladder down to the ground.
    val ladder = 0.014f * u
    drawLine(p.beams, pt(0.34f, 0.69f), pt(0.41f, 0.96f), ladder, StrokeCap.Round)
    drawLine(p.beams, pt(0.43f, 0.69f), pt(0.5f, 0.96f), ladder, StrokeCap.Round)
    var y = 0.74f
    while (y < 0.95f) {
        val shift = (y - 0.69f) / 0.27f * 0.07f
        drawLine(p.beams, pt(0.34f + shift, y), pt(0.43f + shift, y), ladder, StrokeCap.Round)
        y += 0.055f
    }
}
