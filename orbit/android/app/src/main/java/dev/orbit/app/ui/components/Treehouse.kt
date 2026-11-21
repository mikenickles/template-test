package dev.orbit.app.ui.components

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.FilterQuality
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.res.imageResource
import androidx.compose.ui.unit.dp
import dev.orbit.app.R
import dev.orbit.app.ui.theme.LocalReducedMotion
import dev.orbit.app.ui.theme.OrbitMotion

/**
 * Treehouse's picture of the crew at home: the treehouse illustration, fitted to the space it's
 * given. It's the one picture in the app besides the avatars. It floats gently, unless system
 * animations are off.
 */
@Composable
fun TreehouseScene(modifier: Modifier = Modifier) {
    val float = if (LocalReducedMotion.current) {
        null
    } else {
        rememberInfiniteTransition(label = "treehouse").animateFloat(
            0f,
            1f,
            infiniteRepeatable(tween(3600, easing = OrbitMotion.Emphasized), RepeatMode.Reverse),
            label = "float",
        )
    }
    Image(
        ImageBitmap.imageResource(R.drawable.treehouse),
        contentDescription = null,
        modifier = modifier.graphicsLayer { translationY = -(float?.value ?: 0f) * 4.dp.toPx() },
        contentScale = ContentScale.Fit,
        filterQuality = FilterQuality.High,
    )
}
