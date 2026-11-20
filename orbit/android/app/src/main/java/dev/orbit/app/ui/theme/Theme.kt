package dev.orbit.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
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

// The UI itself is ink-on-paper neutral so the agents' avatars carry the color.
private val Dark = darkColorScheme(
    primary = Color(0xFFF3F2F7),
    onPrimary = Color(0xFF0D0D12),
    primaryContainer = Color(0xFF2A2A37),
    onPrimaryContainer = Color(0xFFF3F2F7),
    secondary = Color(0xFFBBA4FF),
    onSecondary = Color(0xFF0D0D12),
    secondaryContainer = Color(0xFF272733),
    onSecondaryContainer = Color(0xFFF3F2F7),
    tertiary = Color(0xFF3DDC97),
    onTertiary = Color(0xFF0D0D12),
    background = Color(0xFF0D0D12),
    onBackground = Color(0xFFF3F2F7),
    surface = Color(0xFF0D0D12),
    onSurface = Color(0xFFF3F2F7),
    surfaceVariant = Color(0xFF22222C),
    onSurfaceVariant = Color(0xFF9D9CAB),
    surfaceContainerLowest = Color(0xFF0A0A0E),
    surfaceContainerLow = Color(0xFF15151C),
    surfaceContainer = Color(0xFF191921),
    surfaceContainerHigh = Color(0xFF1F1F29),
    surfaceContainerHighest = Color(0xFF282834),
    outline = Color(0xFF3D3D4C),
    outlineVariant = Color(0xFF26262F),
    error = Color(0xFFFF8A7A),
    onError = Color(0xFF0D0D12),
    errorContainer = Color(0xFF3A1D1B),
    onErrorContainer = Color(0xFFFFB4A9),
)

private val Light = lightColorScheme(
    primary = Color(0xFF15151A),
    onPrimary = Color(0xFFFAF9F6),
    primaryContainer = Color(0xFFEAE9E3),
    onPrimaryContainer = Color(0xFF15151A),
    secondary = Color(0xFF6B4EE6),
    onSecondary = Color(0xFFFFFFFF),
    secondaryContainer = Color(0xFFEAE9E3),
    onSecondaryContainer = Color(0xFF15151A),
    tertiary = Color(0xFF14915F),
    onTertiary = Color(0xFFFFFFFF),
    background = Color(0xFFFAF9F6),
    onBackground = Color(0xFF15151A),
    surface = Color(0xFFFAF9F6),
    onSurface = Color(0xFF15151A),
    surfaceVariant = Color(0xFFEAE9E3),
    onSurfaceVariant = Color(0xFF6A6975),
    surfaceContainerLowest = Color(0xFFFFFFFF),
    surfaceContainerLow = Color(0xFFFFFFFF),
    surfaceContainer = Color(0xFFF2F1EC),
    surfaceContainerHigh = Color(0xFFEBEAE4),
    surfaceContainerHighest = Color(0xFFE3E2DB),
    outline = Color(0xFFBDBCB4),
    outlineVariant = Color(0xFFE6E5DE),
    error = Color(0xFFC93B28),
    onError = Color(0xFFFFFFFF),
    errorContainer = Color(0xFFFCE4E0),
    onErrorContainer = Color(0xFF7A1D12),
)

private fun outfit(weight: FontWeight) = Font(
    R.font.outfit,
    weight = weight,
    variationSettings = FontVariation.Settings(FontVariation.weight(weight.weight)),
)

/** Rounded geometric display face for names, titles and buttons. Body text stays on the system font. */
val Outfit = FontFamily(
    outfit(FontWeight.Normal),
    outfit(FontWeight.Medium),
    outfit(FontWeight.SemiBold),
    outfit(FontWeight.Bold),
)

private fun display(size: Int, weight: FontWeight, line: Int) = TextStyle(
    fontFamily = Outfit,
    fontWeight = weight,
    fontSize = size.sp,
    lineHeight = line.sp,
    letterSpacing = (-0.01).em,
)

private val OrbitTypography = Typography().run {
    copy(
        displaySmall = display(36, FontWeight.Bold, 42),
        headlineMedium = display(28, FontWeight.SemiBold, 34),
        headlineSmall = display(24, FontWeight.SemiBold, 30),
        titleLarge = display(21, FontWeight.SemiBold, 27),
        titleMedium = display(17, FontWeight.SemiBold, 23),
        titleSmall = display(15, FontWeight.Medium, 20),
        labelLarge = display(15, FontWeight.Medium, 20),
        labelMedium = display(13, FontWeight.Medium, 17),
        labelSmall = display(12, FontWeight.Medium, 15),
        bodyLarge = bodyLarge.copy(fontSize = 16.sp, lineHeight = 24.sp, letterSpacing = 0.sp),
        bodyMedium = bodyMedium.copy(fontSize = 14.sp, lineHeight = 20.sp, letterSpacing = 0.sp),
        bodySmall = bodySmall.copy(fontSize = 12.5.sp, lineHeight = 17.sp, letterSpacing = 0.sp),
    )
}

private val OrbitShapes = Shapes(
    extraSmall = RoundedCornerShape(8.dp),
    small = RoundedCornerShape(12.dp),
    medium = RoundedCornerShape(18.dp),
    large = RoundedCornerShape(24.dp),
    extraLarge = RoundedCornerShape(32.dp),
)

@Composable
fun OrbitTheme(dark: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = if (dark) Dark else Light,
        typography = OrbitTypography,
        shapes = OrbitShapes,
        content = content,
    )
}
