package dev.orbit.app.ui

import androidx.compose.animation.AnimatedVisibilityScope
import androidx.compose.animation.BoundsTransform
import androidx.compose.animation.ExperimentalSharedTransitionApi
import androidx.compose.animation.SharedTransitionLayout
import androidx.compose.animation.SharedTransitionScope
import androidx.compose.animation.core.ArcMode
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.keyframes
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.navigationevent.NavigationEventTransitionState
import androidx.navigationevent.compose.LocalNavigationEventDispatcherOwner
import kotlinx.coroutines.delay
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

/** True while a back swipe is under way: shared elements stay with their page rather than flying mid-gesture. */
private val LocalBackSwipe = compositionLocalOf { false }

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
    if (LocalReducedMotion.current || LocalBackSwipe.current) return this
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
    // A back swipe follows the finger and can be called off, so pictures shared between the two pages would hang
    // in mid-air between them. While one is under way, and until its page has settled, they ride with their page.
    val gestures = LocalNavigationEventDispatcherOwner.current?.navigationEventDispatcher
    var swiping by remember { mutableStateOf(false) }
    LaunchedEffect(gestures) {
        gestures?.transitionState?.collect { state ->
            if (state is NavigationEventTransitionState.InProgress) {
                swiping = true
            } else if (swiping) {
                delay(BACK_MS + 120L)
                swiping = false
            }
        }
    }
    SharedTransitionLayout(modifier) {
        CompositionLocalProvider(LocalSharedScope provides this, LocalBackSwipe provides swiping) {
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
                // The back swipe: the page follows the finger to the right and the one behind settles into place
                // under it, both whole, rather than the library's default of shrinking the page away. The swipe
                // drives these directly, so they're linear in time and stay solid until near the end.
                predictivePopEnterTransition = {
                    if (reduced) {
                        fadeIn(tween(BACK_MS))
                    } else {
                        fadeIn(tween(BACK_MS, easing = LinearEasing), initialAlpha = 0.6f) +
                            slideInHorizontally(tween(BACK_MS, easing = LinearEasing)) { -(it * BACK_BEHIND).toInt() }
                    }
                },
                predictivePopExitTransition = {
                    if (reduced) {
                        fadeOut(tween(BACK_MS))
                    } else {
                        slideOutHorizontally(tween(BACK_MS, easing = LinearEasing)) { (it * BACK_TRAVEL).toInt() } +
                            fadeOut(tween(BACK_MS * 2 / 5, delayMillis = BACK_MS * 3 / 5, easing = LinearEasing))
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

/** The back swipe: how long it plays out once let go, how far the page travels with it, and how far the page behind starts. */
private const val BACK_MS = 300
private const val BACK_TRAVEL = 0.4f
private const val BACK_BEHIND = 0.08f

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
