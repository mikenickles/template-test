package dev.orbit.app.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import dev.orbit.app.ui.theme.Orbit

/** Orbit's own icon set: one stroke weight, round caps and joins, to sit with the typeface. */
enum class OrbitIcon { Back, Up, Plus, Check, More, Dice, Chevron }

@Composable
fun OrbitIcon(
    icon: OrbitIcon,
    modifier: Modifier = Modifier,
    size: Dp = 22.dp,
    tint: Color = Orbit.colors.text,
    description: String? = null,
) {
    val labelled = if (description != null) modifier.semantics { contentDescription = description } else modifier
    Canvas(labelled.size(size)) {
        val s = this.size.minDimension
        val stroke = Stroke(width = 1.75.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
        fun at(x: Float, y: Float) = Offset(s * x, s * y)
        fun polyline(points: List<Offset>) {
            val path = Path().apply {
                moveTo(points[0].x, points[0].y)
                for (p in points.drop(1)) lineTo(p.x, p.y)
            }
            drawPath(path, tint, style = stroke)
        }
        when (icon) {
            OrbitIcon.Back -> {
                polyline(listOf(at(0.82f, 0.5f), at(0.2f, 0.5f)))
                polyline(listOf(at(0.46f, 0.23f), at(0.19f, 0.5f), at(0.46f, 0.77f)))
            }
            OrbitIcon.Up -> {
                polyline(listOf(at(0.5f, 0.82f), at(0.5f, 0.2f)))
                polyline(listOf(at(0.23f, 0.46f), at(0.5f, 0.19f), at(0.77f, 0.46f)))
            }
            OrbitIcon.Plus -> {
                polyline(listOf(at(0.5f, 0.2f), at(0.5f, 0.8f)))
                polyline(listOf(at(0.2f, 0.5f), at(0.8f, 0.5f)))
            }
            OrbitIcon.Check -> polyline(listOf(at(0.2f, 0.53f), at(0.41f, 0.74f), at(0.8f, 0.28f)))
            OrbitIcon.Chevron -> polyline(listOf(at(0.39f, 0.26f), at(0.63f, 0.5f), at(0.39f, 0.74f)))
            OrbitIcon.More -> for (y in listOf(0.22f, 0.5f, 0.78f)) drawCircle(tint, s * 0.075f, at(0.5f, y))
            OrbitIcon.Dice -> {
                drawRoundRect(tint, at(0.16f, 0.16f), Size(s * 0.68f, s * 0.68f), CornerRadius(s * 0.18f), style = stroke)
                for (p in listOf(0.36f, 0.5f, 0.64f)) drawCircle(tint, s * 0.058f, at(p, p))
            }
        }
    }
}
