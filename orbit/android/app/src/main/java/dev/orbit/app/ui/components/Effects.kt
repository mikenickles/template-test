package dev.orbit.app.ui.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInWindow
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import dev.orbit.app.ui.theme.LocalReducedMotion
import dev.orbit.app.ui.theme.Orbit

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

/** An empty placeholder of the given size, for skeleton layouts. */
@Composable
fun SkeletonBlock(width: Dp, height: Dp, shape: Shape, modifier: Modifier = Modifier) {
    Box(modifier.size(width, height).skeleton(shape))
}
