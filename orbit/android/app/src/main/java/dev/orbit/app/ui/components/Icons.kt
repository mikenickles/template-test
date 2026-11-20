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
import kotlin.math.cos
import kotlin.math.sin

/** Orbit's own icon set: one stroke weight, round caps and joins, to sit with the typeface. */
enum class OrbitIcon { Back, Up, Down, Plus, Check, More, Dice, Chevron, Search, Globe, Code, Folder, File, Copy, Retry, Trash }

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
        fun polyline(points: List<Offset>, closed: Boolean = false) {
            val path = Path().apply {
                moveTo(points[0].x, points[0].y)
                for (p in points.drop(1)) lineTo(p.x, p.y)
                if (closed) close()
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
            OrbitIcon.Down -> {
                polyline(listOf(at(0.5f, 0.18f), at(0.5f, 0.8f)))
                polyline(listOf(at(0.23f, 0.54f), at(0.5f, 0.81f), at(0.77f, 0.54f)))
            }
            OrbitIcon.Plus -> {
                polyline(listOf(at(0.5f, 0.2f), at(0.5f, 0.8f)))
                polyline(listOf(at(0.2f, 0.5f), at(0.8f, 0.5f)))
            }
            OrbitIcon.Check -> polyline(listOf(at(0.2f, 0.53f), at(0.41f, 0.74f), at(0.8f, 0.28f)))
            OrbitIcon.Chevron -> polyline(listOf(at(0.39f, 0.26f), at(0.63f, 0.5f), at(0.39f, 0.74f)))
            OrbitIcon.More -> for (y in listOf(0.22f, 0.5f, 0.78f)) drawCircle(tint, s * 0.075f, at(0.5f, y))
            OrbitIcon.Search -> {
                drawCircle(tint, s * 0.255f, at(0.44f, 0.44f), style = stroke)
                polyline(listOf(at(0.63f, 0.63f), at(0.81f, 0.81f)))
            }
            OrbitIcon.Globe -> {
                drawCircle(tint, s * 0.32f, at(0.5f, 0.5f), style = stroke)
                drawOval(tint, at(0.355f, 0.18f), Size(s * 0.29f, s * 0.64f), style = stroke)
                polyline(listOf(at(0.19f, 0.5f), at(0.81f, 0.5f)))
            }
            OrbitIcon.Code -> {
                polyline(listOf(at(0.37f, 0.29f), at(0.16f, 0.5f), at(0.37f, 0.71f)))
                polyline(listOf(at(0.63f, 0.29f), at(0.84f, 0.5f), at(0.63f, 0.71f)))
            }
            OrbitIcon.Folder -> polyline(
                listOf(at(0.15f, 0.27f), at(0.4f, 0.27f), at(0.48f, 0.36f), at(0.85f, 0.36f), at(0.85f, 0.76f), at(0.15f, 0.76f)),
                closed = true,
            )
            OrbitIcon.File -> {
                polyline(listOf(at(0.26f, 0.16f), at(0.57f, 0.16f), at(0.75f, 0.34f), at(0.75f, 0.84f), at(0.26f, 0.84f)), closed = true)
                polyline(listOf(at(0.57f, 0.17f), at(0.57f, 0.34f), at(0.74f, 0.34f)))
            }
            OrbitIcon.Copy -> {
                drawRoundRect(tint, at(0.37f, 0.37f), Size(s * 0.45f, s * 0.45f), CornerRadius(s * 0.1f), style = stroke)
                val back = Path().apply {
                    moveTo(s * 0.21f, s * 0.62f)
                    lineTo(s * 0.21f, s * 0.3f)
                    quadraticTo(s * 0.21f, s * 0.21f, s * 0.3f, s * 0.21f)
                    lineTo(s * 0.62f, s * 0.21f)
                }
                drawPath(back, tint, style = stroke)
            }
            OrbitIcon.Retry -> {
                // An open circle running clockwise, its arrowhead at the top.
                val r = 0.29f
                val start = -60f
                val sweep = 290f
                drawArc(tint, start, sweep, false, at(0.5f - r, 0.53f - r), Size(s * 2 * r, s * 2 * r), style = stroke)
                val end = Math.toRadians((start + sweep).toDouble())
                val tip = at(0.5f + r * cos(end).toFloat(), 0.53f + r * sin(end).toFloat())
                val dir = Offset(-sin(end).toFloat(), cos(end).toFloat())
                val side = Offset(-dir.y, dir.x)
                val len = s * 0.15f
                polyline(listOf(tip - dir * len + side * len * 0.85f, tip, tip - dir * len - side * len * 0.85f))
            }
            OrbitIcon.Trash -> {
                polyline(listOf(at(0.2f, 0.28f), at(0.8f, 0.28f)))
                polyline(listOf(at(0.4f, 0.27f), at(0.4f, 0.18f), at(0.6f, 0.18f), at(0.6f, 0.27f)))
                polyline(listOf(at(0.27f, 0.29f), at(0.31f, 0.82f), at(0.69f, 0.82f), at(0.73f, 0.29f)))
            }
            OrbitIcon.Dice -> {
                drawRoundRect(tint, at(0.16f, 0.16f), Size(s * 0.68f, s * 0.68f), CornerRadius(s * 0.18f), style = stroke)
                for (p in listOf(0.36f, 0.5f, 0.64f)) drawCircle(tint, s * 0.058f, at(p, p))
            }
        }
    }
}
