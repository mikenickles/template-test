package dev.orbit.app.ui.theme

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.SpringSpec
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.interaction.InteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedback
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay

/**
 * Orbit's motion language. Things arrive fast and settle softly (decelerate), leave quickly
 * (accelerate), and anything you touch answers with a spring rather than a fixed curve.
 */
object OrbitMotion {
    /** For elements moving from one place to another on screen. */
    val Emphasized = CubicBezierEasing(0.2f, 0f, 0f, 1f)

    /** For things arriving. */
    val Decelerate = CubicBezierEasing(0.05f, 0.7f, 0.1f, 1f)

    /** For things leaving. */
    val Accelerate = CubicBezierEasing(0.3f, 0f, 0.8f, 0.15f)

    const val SHORT = 160
    const val MEDIUM = 280
    const val LONG = 420

    /** Quick and settled: presses, toggles, selections. */
    fun <T> snappy(): SpringSpec<T> = spring(dampingRatio = 0.8f, stiffness = 520f)

    /** A little overshoot, for moments meant to feel playful. */
    fun <T> bouncy(): SpringSpec<T> = spring(dampingRatio = 0.52f, stiffness = 420f)

    /** Slow and smooth, for things changing shape or color. */
    fun <T> gentle(): SpringSpec<T> = spring(dampingRatio = 0.9f, stiffness = 180f)
}

/**
 * True when the person has turned animations off in system settings. Ambient motion (orbits, blinks,
 * shimmer) stops, and anything that would animate settles at once.
 */
val LocalReducedMotion = staticCompositionLocalOf { false }

/**
 * Whether one-off entrance animations play. Screenshot tests turn them off so the
 * first rendered frame is the finished layout.
 */
val LocalEntrances = staticCompositionLocalOf { true }

/** A control shrinks slightly while held and springs back on release. */
fun Modifier.pressScale(interaction: InteractionSource, pressed: Float = 0.96f): Modifier = composed {
    val isPressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(if (isPressed) pressed else 1f, OrbitMotion.snappy(), label = "press")
    graphicsLayer {
        scaleX = scale
        scaleY = scale
    }
}

/**
 * Remembers which items of a screen have already made their entrance, so content animates in
 * once, as the screen opens, and not again when it scrolls back into view.
 */
class Entrances internal constructor(private val enabled: Boolean) {
    private val born = System.nanoTime()
    private val played = mutableSetOf<Any>()

    internal fun claim(key: Any): Boolean =
        enabled && played.add(key) && (System.nanoTime() - born) / 1_000_000 < WINDOW_MS

    internal companion object {
        const val WINDOW_MS = 700
    }
}

/**
 * The entrances for one screen. They play once, the first time the screen is [ready] (e.g. when
 * loaded content replaces placeholders), and not again when you navigate back to it.
 */
@Composable
fun rememberEntrances(ready: Boolean = true): Entrances {
    val enabled = LocalEntrances.current
    var played by rememberSaveable { mutableStateOf(false) }
    val entrances = remember(ready) { Entrances(enabled && ready && !played) }
    LaunchedEffect(ready) {
        if (ready) {
            delay(Entrances.WINDOW_MS.toLong())
            played = true
        }
    }
    return entrances
}

/** Fades and lifts the content into place when its screen opens. [order] staggers siblings. */
fun Modifier.entrance(entrances: Entrances, key: Any, order: Int = 0): Modifier = composed {
    val play = remember(key) { entrances.claim(key) }
    if (!play) return@composed Modifier
    val progress = remember { Animatable(0f) }
    LaunchedEffect(Unit) {
        delay(order.coerceAtMost(6) * 30L)
        progress.animateTo(1f, tween(360, easing = OrbitMotion.Decelerate))
    }
    val lift = with(LocalDensity.current) { 12.dp.toPx() }
    graphicsLayer {
        alpha = progress.value
        translationY = (1f - progress.value) * lift
    }
}

/** A short horizontal shake, for "that didn't work". */
class Shake {
    val offset = Animatable(0f)

    suspend fun play() {
        for (x in listOf(-12f, 11f, -8f, 6f, -3f, 0f)) offset.animateTo(x, tween(55))
    }
}

/** Shifts the content by the shake's current offset. */
fun Modifier.shake(shake: Shake): Modifier = graphicsLayer { translationX = shake.offset.value.dp.toPx() }

/** Light haptics for the moments that deserve one. */
class Haptics(private val feedback: HapticFeedback) {
    fun tick() = feedback.performHapticFeedback(HapticFeedbackType.SegmentTick)

    fun toggle(on: Boolean) =
        feedback.performHapticFeedback(if (on) HapticFeedbackType.ToggleOn else HapticFeedbackType.ToggleOff)

    fun confirm() = feedback.performHapticFeedback(HapticFeedbackType.Confirm)

    fun reject() = feedback.performHapticFeedback(HapticFeedbackType.Reject)
}

@Composable
fun rememberHaptics(): Haptics {
    val feedback = LocalHapticFeedback.current
    return remember(feedback) { Haptics(feedback) }
}
