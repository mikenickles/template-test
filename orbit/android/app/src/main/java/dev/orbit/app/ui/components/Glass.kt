package dev.orbit.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import dev.orbit.app.ui.theme.Orbit

/**
 * Treehouse's card surface: plain and neutral, with a thin edge and, in light mode, a soft shadow. It adds no
 * color of its own, so the characters standing on it are the only color. It doesn't clip, so they can peek over
 * its edge. [color] is for surfaces content passes under, like a bar, which use the translucent glass.
 */
@Composable
fun Modifier.quietCard(shape: Shape, color: Color = Orbit.colors.surface, strength: Float = 1f): Modifier =
    this.lift(shape, strength).background(color, shape).border(surfaceBorder(), shape)

/** The neutral tile a character sits on, wherever one sits on something. */
@Composable
fun characterTile(): Color = if (Orbit.colors.isDark) Orbit.colors.surfaceRaised else Orbit.colors.bg
