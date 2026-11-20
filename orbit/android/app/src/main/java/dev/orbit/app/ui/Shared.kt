package dev.orbit.app.ui

import androidx.compose.animation.AnimatedVisibilityScope
import androidx.compose.animation.BoundsTransform
import androidx.compose.animation.ExperimentalSharedTransitionApi
import androidx.compose.animation.SharedTransitionLayout
import androidx.compose.animation.SharedTransitionScope
import androidx.compose.animation.core.VisibilityThreshold
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Rect
import androidx.navigation.NamedNavArgument
import androidx.navigation.NavBackStackEntry
import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import dev.orbit.app.ui.theme.OrbitMotion

@OptIn(ExperimentalSharedTransitionApi::class)
private val LocalSharedScope = staticCompositionLocalOf<SharedTransitionScope?> { null }
private val LocalScreenScope = staticCompositionLocalOf<AnimatedVisibilityScope?> { null }

/** Shared elements travel on a soft spring, so they settle rather than stop. */
@OptIn(ExperimentalSharedTransitionApi::class)
private val Travel = BoundsTransform { _, _ -> spring(dampingRatio = 0.86f, stiffness = 340f, visibilityThreshold = Rect.VisibilityThreshold) }

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
    SharedTransitionLayout(modifier) {
        CompositionLocalProvider(LocalSharedScope provides this) {
            NavHost(
                nav,
                startDestination = startDestination,
                enterTransition = {
                    slideInHorizontally(tween(OrbitMotion.LONG, easing = OrbitMotion.Decelerate)) { it / 6 } +
                        fadeIn(tween(OrbitMotion.MEDIUM, delayMillis = 40))
                },
                exitTransition = {
                    slideOutHorizontally(tween(OrbitMotion.LONG, easing = OrbitMotion.Emphasized)) { -it / 14 } +
                        fadeOut(tween(OrbitMotion.MEDIUM))
                },
                popEnterTransition = {
                    slideInHorizontally(tween(OrbitMotion.LONG, easing = OrbitMotion.Decelerate)) { -it / 14 } +
                        fadeIn(tween(OrbitMotion.MEDIUM))
                },
                popExitTransition = {
                    slideOutHorizontally(tween(OrbitMotion.MEDIUM, easing = OrbitMotion.Accelerate)) { it / 6 } +
                        fadeOut(tween(OrbitMotion.SHORT + 40))
                },
                builder = builder,
            )
        }
    }
}

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

    fun roomTitle(roomId: String) = "room:$roomId:title"

    fun roomMember(roomId: String, agentId: String) = "room:$roomId:agent:$agentId"
}
