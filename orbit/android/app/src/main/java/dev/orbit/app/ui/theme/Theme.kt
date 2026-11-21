package dev.orbit.app.ui.theme

import android.animation.ValueAnimator
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import dev.orbit.app.R

/**
 * Treehouse's palette. The interface is strictly neutral so that the agents'
 * avatars are the only saturated color on screen.
 */
@Immutable
data class OrbitColors(
    val isDark: Boolean,
    val bg: Color,
    /** Cards and list rows. */
    val surface: Color,
    /** Inputs, chips, and anything sitting on a card. */
    val surfaceRaised: Color,
    /** Selected and pressed states, the user's own chat bubble. */
    val surfaceHigh: Color,
    /** Frosted surfaces that float over the crew's wash: headers and room cards. */
    val glass: Color,
    /** The lit edge of glass. */
    val glassEdge: Color,
    /** Default 1dp edge on surfaces. */
    val hairline: Color,
    /** A stronger edge: focus rings, unselected controls. */
    val line: Color,
    val text: Color,
    val textSecondary: Color,
    val textTertiary: Color,
    val primary: Color,
    val onPrimary: Color,
    /** An agent is working, the hub is reachable. */
    val live: Color,
    val danger: Color,
    val dangerSurface: Color,
)

// Neutrals are warm, like paper and bark, rather than flat grey: friendly, while staying quiet
// enough that the avatars are still the only real color.
private val DarkColors = OrbitColors(
    isDark = true,
    bg = Color(0xFF0E0D0B),
    surface = Color(0xFF171513),
    surfaceRaised = Color(0xFF1F1D1A),
    surfaceHigh = Color(0xFF2B2824),
    glass = Color(0xB81F1D1A),
    glassEdge = Color(0x17FFF3E2),
    hairline = Color(0x14FFF3E2),
    line = Color(0x33FFF3E2),
    text = Color(0xFFF7F3EE),
    textSecondary = Color(0xFFB2AAA0),
    textTertiary = Color(0xFF968E84),
    primary = Color(0xFFF7F3EE),
    onPrimary = Color(0xFF0E0D0B),
    live = Color(0xFF5BD9A0),
    danger = Color(0xFFFF7B72),
    dangerSurface = Color(0x1FFF7B72),
)

// Light is its own design, not an inversion: a warm paper page with white surfaces on it.
private val LightColors = OrbitColors(
    isDark = false,
    bg = Color(0xFFF6F2EC),
    surface = Color(0xFFFFFFFF),
    surfaceRaised = Color(0xFFFFFFFF),
    surfaceHigh = Color(0xFFE9E3DA),
    glass = Color(0xB8FFFFFF),
    glassEdge = Color(0xC0FFFFFF),
    hairline = Color(0x1A2A1C0C),
    line = Color(0x3D2A1C0C),
    text = Color(0xFF17130F),
    textSecondary = Color(0xFF574E45),
    textTertiary = Color(0xFF6A6157),
    primary = Color(0xFF17130F),
    onPrimary = Color(0xFFFFFFFF),
    live = Color(0xFF0A7A55),
    danger = Color(0xFFC42F22),
    dangerSurface = Color(0x14C42F22),
)

private fun variable(resource: Int, weight: FontWeight) = Font(
    resource,
    weight = weight,
    variationSettings = FontVariation.Settings(FontVariation.weight(weight.weight)),
)

private val Weights = listOf(FontWeight.Normal, FontWeight.Medium, FontWeight.SemiBold)
val Geist = FontFamily(Weights.map { variable(R.font.geist, it) })
val GeistMono = FontFamily(Weights.map { variable(R.font.geist_mono, it) })

private fun sans(size: Double, line: Int, weight: FontWeight, tracking: Double) = TextStyle(
    fontFamily = Geist, fontWeight = weight, fontSize = size.sp, lineHeight = line.sp, letterSpacing = tracking.em,
)

private fun mono(size: Int, line: Int, weight: FontWeight = FontWeight.Normal, tracking: Double = 0.0) = TextStyle(
    fontFamily = GeistMono, fontWeight = weight, fontSize = size.sp, lineHeight = line.sp, letterSpacing = tracking.em,
)

/**
 * The whole type scale; screens don't make their own sizes. Tracking tightens as size grows.
 * Mono is reserved for what a machine reads: model ids, addresses, codes, times.
 */
object OrbitType {
    /** The one headline number a screen leads with, like a month's spend. */
    val hero = sans(48.0, 54, FontWeight.SemiBold, -0.04)
    val display = sans(30.0, 36, FontWeight.SemiBold, -0.032)
    val titleL = sans(22.0, 28, FontWeight.SemiBold, -0.024)

    /** Section headings within a screen: clear, but quieter than the wordmark. */
    val heading = sans(17.0, 22, FontWeight.SemiBold, -0.016)
    val titleM = sans(17.0, 22, FontWeight.SemiBold, -0.016)

    /** Names, buttons, row titles. */
    val titleS = sans(15.0, 20, FontWeight.SemiBold, -0.01)
    val body = sans(16.0, 24, FontWeight.Normal, -0.008)
    val bodyM = sans(15.0, 21, FontWeight.Normal, -0.006)
    val bodyS = sans(13.0, 18, FontWeight.Normal, 0.0)
    val label = sans(13.0, 16, FontWeight.Medium, -0.004)
    val caption = sans(12.0, 16, FontWeight.Normal, 0.0)

    val mono = mono(12, 16)
    val monoL = mono(15, 22)
    val monoDigit = mono(24, 30, FontWeight.Medium)

    /** Section headers, set in capitals. */
    val overline = mono(11, 14, FontWeight.Medium, 0.09)
}

/** Shared spacing and corner radii. */
object OrbitDimens {
    val gutter = 20.dp

    /** Between one section and the next. */
    val section = 28.dp

    /** Between a label and the control it names. */
    val labelGap = 12.dp
    val rowPad = 16.dp
    val radiusS = 12.dp
    val radiusM = 16.dp
    val radiusL = 24.dp
    val radiusXL = 32.dp
}

private val LocalOrbitColors = staticCompositionLocalOf { DarkColors }

object Orbit {
    val colors: OrbitColors
        @Composable @ReadOnlyComposable get() = LocalOrbitColors.current
}

@Composable
fun OrbitTheme(
    dark: Boolean = isSystemInDarkTheme(),
    /** Off in screenshot tests, so screens render in their settled state. */
    entrances: Boolean = true,
    /** Follows the system's "remove animations" setting unless a test says otherwise. */
    reducedMotion: Boolean = !ValueAnimator.areAnimatorsEnabled(),
    content: @Composable () -> Unit,
) {
    val c = if (dark) DarkColors else LightColors
    // Material components we don't restyle by hand (menus, snackbars, pull-to-refresh) follow the same palette.
    val scheme = (if (dark) darkColorScheme() else lightColorScheme()).copy(
        primary = c.primary,
        onPrimary = c.onPrimary,
        secondary = c.text,
        onSecondary = c.bg,
        background = c.bg,
        onBackground = c.text,
        surface = c.bg,
        onSurface = c.text,
        surfaceVariant = c.surfaceHigh,
        onSurfaceVariant = c.textSecondary,
        surfaceContainerLowest = c.bg,
        surfaceContainerLow = c.surface,
        surfaceContainer = c.surfaceRaised,
        surfaceContainerHigh = c.surfaceRaised,
        surfaceContainerHighest = c.surfaceHigh,
        inverseSurface = c.primary,
        inverseOnSurface = c.onPrimary,
        outline = c.line,
        outlineVariant = c.hairline,
        error = c.danger,
    )
    val typography = Typography(
        titleLarge = OrbitType.titleL,
        titleMedium = OrbitType.titleM,
        titleSmall = OrbitType.titleS,
        bodyLarge = OrbitType.body,
        bodyMedium = OrbitType.bodyM,
        bodySmall = OrbitType.bodyS,
        labelLarge = OrbitType.label,
        labelMedium = OrbitType.label,
        labelSmall = OrbitType.label,
    )
    CompositionLocalProvider(
        LocalOrbitColors provides c,
        LocalEntrances provides (entrances && !reducedMotion),
        LocalReducedMotion provides reducedMotion,
    ) {
        MaterialTheme(colorScheme = scheme, typography = typography, content = content)
    }
}
