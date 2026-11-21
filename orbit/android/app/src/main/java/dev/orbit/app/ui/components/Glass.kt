package dev.orbit.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.dropShadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.shadow.Shadow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.DpOffset
import androidx.compose.ui.unit.dp
import dev.orbit.app.ui.theme.Orbit

/**
 * The frosted surface of Treehouse in its agents' colors: glass with a soft tint of the first agents' colors
 * inside, a lit top edge, and a shadow in the first agent's color instead of grey. It doesn't clip, so
 * characters can stand on it and peek over its edge. With no tints it's plain glass with a neutral shadow.
 */
@Composable
fun Modifier.crewGlass(tints: List<Color>, shape: Shape, lift: Dp = 14.dp): Modifier {
    val c = Orbit.colors
    val inside = if (c.isDark) 0.18f else 0.3f
    val tint = when (tints.size) {
        0 -> null
        1 -> Brush.linearGradient(listOf(tints[0].copy(alpha = inside), Color.Transparent))
        else -> Brush.linearGradient(listOf(tints[0].copy(alpha = inside), Color.Transparent, tints[1].copy(alpha = inside * 0.85f)))
    }
    val glow = (tints.firstOrNull() ?: c.text).copy(alpha = if (c.isDark) 0.32f else if (tints.isEmpty()) 0.12f else 0.4f)
    return this
        .dropShadow(shape, Shadow(radius = lift * 1.4f, color = glow, spread = -(lift / 2), offset = DpOffset(0.dp, lift * 0.7f)))
        .background(c.glass, shape)
        .then(if (tint != null) Modifier.background(tint, shape) else Modifier)
        .border(1.dp, c.glassEdge, shape)
}
