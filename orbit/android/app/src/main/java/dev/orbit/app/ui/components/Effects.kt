package dev.orbit.app.ui.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInWindow
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import dev.orbit.app.data.AvatarSpec
import dev.orbit.app.ui.theme.LocalReducedMotion
import dev.orbit.app.ui.theme.Orbit
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.roundToInt
import kotlin.math.sin

/**
 * Text with a band of light sweeping across it: the "working on it" voice of the app,
 * used where a spinner would otherwise go.
 */
@Composable
fun ShimmerText(
    text: String,
    style: TextStyle,
    color: Color,
    modifier: Modifier = Modifier,
    highlight: Color = Orbit.colors.text,
) {
    if (LocalReducedMotion.current) {
        Text(text, modifier, style = style, color = color, maxLines = 1, overflow = TextOverflow.Ellipsis)
        return
    }
    val transition = rememberInfiniteTransition(label = "shimmer")
    val sweep = transition.animateFloat(0f, 1f, infiniteRepeatable(tween(1700, easing = LinearEasing)), label = "sweep")
    Text(
        text,
        modifier
            .graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen }
            .drawWithContent {
                drawContent()
                val band = size.width * 0.5f + 40.dp.toPx()
                val x = -band + (size.width + 2 * band) * sweep.value
                drawRect(
                    Brush.horizontalGradient(listOf(Color.Transparent, highlight, Color.Transparent), startX = x - band / 2, endX = x + band / 2),
                    blendMode = BlendMode.SrcAtop,
                )
            },
        style = style,
        color = color,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
    )
}

/**
 * A placeholder block for content that's still loading. One slow sheen crosses the whole screen,
 * passing over every block in turn, rather than each block flickering on its own.
 */
fun Modifier.skeleton(shape: Shape): Modifier = composed {
    val c = Orbit.colors
    val sweep = if (LocalReducedMotion.current) {
        null
    } else {
        rememberInfiniteTransition(label = "skeleton").animateFloat(0f, 1f, infiniteRepeatable(tween(1600, easing = LinearEasing)), label = "sweep")
    }
    val screen = LocalWindowInfo.current.containerSize.width.toFloat()
    var left by remember { mutableFloatStateOf(0f) }
    val block = if (c.isDark) c.surfaceRaised else c.surfaceHigh
    val sheen = if (c.isDark) Color.White.copy(alpha = 0.06f) else Color.White.copy(alpha = 0.6f)
    onGloballyPositioned { left = it.positionInWindow().x }
        .clip(shape)
        .background(block)
        .drawBehind {
            val progress = sweep?.value ?: return@drawBehind
            val width = if (screen > 0f) screen else size.width
            val band = width * 0.5f
            val x = -band + (width + 2 * band) * progress - left
            drawRect(Brush.horizontalGradient(listOf(Color.Transparent, sheen, Color.Transparent), startX = x - band / 2, endX = x + band / 2))
        }
}

/**
 * The Orbit motif made literal: a softly glowing core (the hub on your PC) with avatars travelling
 * around it on two tilted orbits. Avatars on the far side pass behind the core, smaller and dimmer.
 * [speed] can be changed on the fly (it eases), e.g. to show the app working.
 */
@Composable
fun OrbitSystem(
    specs: List<AvatarSpec>,
    modifier: Modifier = Modifier,
    avatarSize: Dp = 44.dp,
    speed: Float = 1f,
) {
    val c = Orbit.colors
    val pace by animateFloatAsState(speed, tween(900), label = "pace")
    var clock by remember { mutableFloatStateOf(0f) }
    if (!LocalReducedMotion.current) {
        LaunchedEffect(Unit) {
            var last = 0L
            while (true) {
                withFrameNanos { now ->
                    if (last != 0L) clock += (now - last) / 1e9f * pace
                    last = now
                }
            }
        }
    }
    val shown = specs.take(8)
    val ringColor = c.text.copy(alpha = if (c.isDark) 0.09f else 0.1f)
    val tilt = -14f

    Layout(
        modifier = modifier.drawBehind {
            // The two orbits, as faint ellipses.
            rotate(tilt) {
                for ((rx, ry) in Orbits) {
                    val w = size.width * rx * 2
                    val h = size.width * ry * 2
                    drawOval(ringColor, Offset(center.x - w / 2, center.y - h / 2), Size(w, h), style = Stroke(1.dp.toPx()))
                }
            }
        },
        content = {
            // The core: a soft halo around a bright point. Avatars on the far side pass behind it.
            Canvas(Modifier.size(avatarSize * 1.6f)) {
                val r = size.minDimension / 2
                // On a dark page the core glows; on a light one a strong halo would read as a smudge.
                drawCircle(Brush.radialGradient(listOf(c.text.copy(alpha = if (c.isDark) 0.22f else 0.07f), Color.Transparent), center, r), r)
                drawCircle(c.text, r * 0.17f)
            }
            shown.forEach { AgentAvatar(it, size = avatarSize, alive = true) }
        },
    ) { measurables, constraints ->
        val all = measurables.map { it.measure(Constraints()) }
        val core = all.first()
        val placeables = all.drop(1)
        val width = constraints.maxWidth
        val height = if (constraints.hasBoundedHeight) constraints.maxHeight else (width * 0.62f).roundToInt()
        layout(width, height) {
            val cx = width / 2f
            val cy = height / 2f
            core.place((cx - core.width / 2f).roundToInt(), (cy - core.height / 2f).roundToInt(), zIndex = 0f)
            val tiltRad = tilt * PI.toFloat() / 180f
            // A small crew shares the outer orbit, evenly spaced; a larger one splits across both.
            val split = shown.size > 3
            val inner = if (split) shown.size / 2 else 0
            placeables.forEachIndexed { index, placeable ->
                val ring = if (index < inner) 0 else 1
                val (rx, ry) = Orbits[ring]
                val perRing = if (ring == 0) inner else shown.size - inner
                val slot = if (ring == 0) index else index - inner
                // A slow drift (about 20dp a second); the inner orbit turns a little faster, like real orbits.
                val rate = if (ring == 0) 0.04f else 0.025f
                val angle = 2 * PI.toFloat() * (slot.toFloat() / perRing + ring * 0.13f + 0.08f + clock * rate)
                val ex = width * rx * cos(angle)
                val ey = width * ry * sin(angle)
                val x = cx + ex * cos(tiltRad) - ey * sin(tiltRad)
                val y = cy + ex * sin(tiltRad) + ey * cos(tiltRad)
                val depth = sin(angle) // 1 = nearest the viewer
                placeable.placeWithLayer(
                    (x - placeable.width / 2f).roundToInt(),
                    (y - placeable.height / 2f).roundToInt(),
                    zIndex = depth,
                ) {
                    val scale = 0.7f + 0.3f * (depth + 1) / 2
                    scaleX = scale
                    scaleY = scale
                    alpha = 0.86f + 0.14f * (depth + 1) / 2
                }
            }
        }
    }
}

/** Orbit radii as fractions of the width: (horizontal, vertical). */
private val Orbits = listOf(0.25f to 0.13f, 0.43f to 0.22f)

/** An empty placeholder of the given size, for skeleton layouts. */
@Composable
fun SkeletonBlock(width: Dp, height: Dp, shape: Shape, modifier: Modifier = Modifier) {
    Box(modifier.size(width, height).skeleton(shape))
}
