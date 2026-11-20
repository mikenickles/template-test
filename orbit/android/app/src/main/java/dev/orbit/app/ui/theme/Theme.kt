package dev.orbit.app.ui.theme

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
 * Orbit's palette. The interface is strictly neutral so that the agents'
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

private val DarkColors = OrbitColors(
    isDark = true,
    bg = Color(0xFF09090B),
    surface = Color(0xFF121214),
    surfaceRaised = Color(0xFF1A1A1D),
    surfaceHigh = Color(0xFF26262B),
    hairline = Color(0x14FFFFFF),
    line = Color(0x33FFFFFF),
    text = Color(0xFFFAFAFA),
    textSecondary = Color(0xFFA1A1AA),
    textTertiary = Color(0xFF71717A),
    primary = Color(0xFFFAFAFA),
    onPrimary = Color(0xFF09090B),
    live = Color(0xFF34D399),
    danger = Color(0xFFF87171),
    dangerSurface = Color(0x1FF87171),
)

private val LightColors = OrbitColors(
    isDark = false,
    bg = Color(0xFFFFFFFF),
    surface = Color(0xFFF7F7F8),
    surfaceRaised = Color(0xFFF1F1F3),
    surfaceHigh = Color(0xFFE7E7EA),
    hairline = Color(0x12000000),
    line = Color(0x33000000),
    text = Color(0xFF09090B),
    textSecondary = Color(0xFF52525B),
    textTertiary = Color(0xFF8B8B94),
    primary = Color(0xFF09090B),
    onPrimary = Color(0xFFFFFFFF),
    live = Color(0xFF059669),
    danger = Color(0xFFDC2626),
    dangerSurface = Color(0x14DC2626),
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

/** The type scale. Tracking tightens as size grows; mono is reserved for machine-facing detail. */
object OrbitType {
    val display = sans(30.0, 36, FontWeight.SemiBold, -0.032)
    val titleL = sans(22.0, 28, FontWeight.SemiBold, -0.024)
    val titleM = sans(17.0, 22, FontWeight.SemiBold, -0.016)
    val titleS = sans(15.0, 20, FontWeight.Medium, -0.01)
    val body = sans(16.0, 25, FontWeight.Normal, -0.008)
    val bodyM = sans(14.5, 21, FontWeight.Normal, -0.005)
    val bodyS = sans(13.0, 18, FontWeight.Normal, 0.0)
    val label = sans(13.0, 16, FontWeight.Medium, -0.004)

    /** Model ids, addresses, timestamps. */
    val mono = TextStyle(fontFamily = GeistMono, fontWeight = FontWeight.Normal, fontSize = 11.5.sp, lineHeight = 15.sp)

    /** Section headers, set in capitals. */
    val overline = TextStyle(
        fontFamily = GeistMono, fontWeight = FontWeight.Medium, fontSize = 11.sp, lineHeight = 14.sp, letterSpacing = 0.09.em,
    )
}

/** Corner radii and the screen gutter. */
object OrbitDimens {
    val gutter = 20.dp
    val radiusS = 12.dp
    val radiusM = 16.dp
    val radiusL = 22.dp
    val radiusXL = 28.dp
}

private val LocalOrbitColors = staticCompositionLocalOf { DarkColors }

object Orbit {
    val colors: OrbitColors
        @Composable @ReadOnlyComposable get() = LocalOrbitColors.current
}

@Composable
fun OrbitTheme(dark: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
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
    CompositionLocalProvider(LocalOrbitColors provides c) {
        MaterialTheme(colorScheme = scheme, typography = typography, content = content)
    }
}
