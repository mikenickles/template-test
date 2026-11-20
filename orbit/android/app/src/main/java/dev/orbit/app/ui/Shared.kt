package dev.orbit.app.ui

import androidx.compose.animation.AnimatedVisibilityScope
import androidx.compose.animation.BoundsTransform
import androidx.compose.animation.ExperimentalSharedTransitionApi
import androidx.compose.animation.SharedTransitionLayout
import androidx.compose.animation.SharedTransitionScope
import androidx.compose.animation.core.ArcMode
import androidx.compose.animation.core.keyframes
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.navigation.NamedNavArgument
import androidx.navigation.NavBackStackEntry
import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import dev.orbit.app.ui.theme.LocalReducedMotion
import dev.orbit.app.ui.theme.OrbitMotion

@OptIn(ExperimentalSharedTransitionApi::class)
private val LocalSharedScope = staticCompositionLocalOf<SharedTransitionScope?> { null }
private val LocalScreenScope = staticCompositionLocalOf<AnimatedVisibilityScope?> { null }

/** Shared elements travel on a gentle arc rather than a straight diagonal, and land with the page. */
@OptIn(ExperimentalSharedTransitionApi::class)
private val Travel = BoundsTransform { initial, target ->
    keyframes {
        durationMillis = TRAVEL_MS
        initial at 0 using ArcMode.ArcBelow using OrbitMotion.Emphasized
        target at TRAVEL_MS
    }
}

private const val TRAVEL_MS = 340

/**
 * Marks this element as the same thing on two screens, so navigating between them moves it
 * from one place to the other instead of cutting. Has no effect outside [OrbitNavHost],
 * e.g. in screenshot tests.
 */
@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
fun Modifier.shared(key: String): Modifier {
    val scope = LocalSharedScope.current ?: return this
    val screen = LocalScreenScope.current ?: return this
    if (LocalReducedMotion.current) return this
    return with(scope) {
        this@shared.sharedElement(rememberSharedContentState(key), screen, boundsTransform = Travel)
    }
}

/**
 * The app's navigation host. Screens push in from the right and the one behind drifts back;
 * elements marked with [shared] fly between screens.
 */
@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
fun OrbitNavHost(
    nav: NavHostController,
    startDestination: String,
    modifier: Modifier = Modifier,
    builder: NavGraphBuilder.() -> Unit,
) {
    // A fade-through on a short shared axis: the old screen is gone before the new one appears, so
    // the two are never seen through each other. Reduced motion keeps only a quick fade.
    val reduced = LocalReducedMotion.current
    SharedTransitionLayout(modifier) {
        CompositionLocalProvider(LocalSharedScope provides this) {
            NavHost(
                nav,
                startDestination = startDestination,
                enterTransition = {
                    if (reduced) {
                        fadeIn(tween(150))
                    } else {
                        fadeIn(tween(IN_MS, delayMillis = OUT_MS, easing = OrbitMotion.Decelerate)) +
                            slideInHorizontally(tween(OUT_MS + IN_MS, easing = OrbitMotion.Emphasized)) { (it * AXIS).toInt() }
                    }
                },
                exitTransition = {
                    if (reduced) {
                        fadeOut(tween(150))
                    } else {
                        fadeOut(tween(OUT_MS, easing = OrbitMotion.Accelerate)) +
                            slideOutHorizontally(tween(OUT_MS + IN_MS, easing = OrbitMotion.Emphasized)) { -(it * AXIS).toInt() }
                    }
                },
                popEnterTransition = {
                    if (reduced) {
                        fadeIn(tween(150))
                    } else {
                        fadeIn(tween(IN_MS, delayMillis = OUT_MS, easing = OrbitMotion.Decelerate)) +
                            slideInHorizontally(tween(OUT_MS + IN_MS, easing = OrbitMotion.Emphasized)) { -(it * AXIS).toInt() }
                    }
                },
                popExitTransition = {
                    if (reduced) {
                        fadeOut(tween(150))
                    } else {
                        fadeOut(tween(OUT_MS, easing = OrbitMotion.Accelerate)) +
                            slideOutHorizontally(tween(OUT_MS + IN_MS, easing = OrbitMotion.Emphasized)) { (it * AXIS).toInt() }
                    }
                },
                builder = builder,
            )
        }
    }
}

private const val OUT_MS = 90
private const val IN_MS = 210

/** How far screens slide, as a fraction of the width: about 30dp on a phone. */
private const val AXIS = 0.075f

/** A destination in [OrbitNavHost] whose content can take part in shared-element transitions. */
fun NavGraphBuilder.screen(
    route: String,
    arguments: List<NamedNavArgument> = emptyList(),
    content: @Composable (NavBackStackEntry) -> Unit,
) {
    composable(route, arguments) { entry ->
        CompositionLocalProvider(LocalScreenScope provides this) { content(entry) }
    }
}

/** Keys shared between screens. */
object SharedKeys {
    fun agentAvatar(agentId: String) = "agent:$agentId"

    fun roomMember(roomId: String, agentId: String) = "room:$roomId:agent:$agentId"
}
