package dev.orbit.app.ui.components

import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import dev.orbit.app.ui.theme.Orbit

/** Where each agent's glow sits, as fractions of the screen: top left, top right, lower right, bottom left. */
private val Corners = listOf(Offset(0.08f, 0.03f), Offset(0.96f, 0.12f), Offset(1f, 0.6f), Offset(0f, 0.95f))

/**
 * The crew's own colors glowing softly behind a screen, one agent to a corner, so each room looks like the
 * agents in it. It never moves. The only color it adds is the agents' tints, as with every wash in the app.
 */
@Composable
fun CrewWash(tints: List<Color>, modifier: Modifier = Modifier, strength: Float = 1f) {
    if (tints.isEmpty()) return
    val alpha = (if (Orbit.colors.isDark) 0.2f else 0.3f) * strength
    // Fewer agents than corners: their colors take turns, so one agent fills the whole screen with its own.
    val glows = Corners.indices.map { tints[it % tints.size].copy(alpha = alpha) }
    Box(
        modifier.drawBehind {
            Corners.forEachIndexed { i, at ->
                val center = Offset(size.width * at.x, size.height * at.y)
                drawRect(Brush.radialGradient(listOf(glows[i], Color.Transparent), center = center, radius = size.width * 0.85f))
            }
        },
    )
}
