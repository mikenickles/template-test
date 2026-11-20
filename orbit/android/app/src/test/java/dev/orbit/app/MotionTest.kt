package dev.orbit.app

import androidx.activity.OnBackPressedDispatcher
import androidx.activity.OnBackPressedDispatcherOwner
import androidx.activity.compose.LocalOnBackPressedDispatcherOwner
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.LifecycleRegistry
import androidx.lifecycle.ViewModelStore
import androidx.lifecycle.ViewModelStoreOwner
import androidx.lifecycle.viewmodel.compose.LocalViewModelStoreOwner
import androidx.navigation.compose.rememberNavController
import androidx.navigationevent.NavigationEventDispatcher
import androidx.navigationevent.NavigationEventDispatcherOwner
import androidx.navigationevent.compose.LocalNavigationEventDispatcherOwner
import app.cash.paparazzi.DeviceConfig
import app.cash.paparazzi.Paparazzi
import dev.orbit.app.data.AvatarSpec
import dev.orbit.app.data.Message
import dev.orbit.app.data.RunState
import dev.orbit.app.ui.OrbitNavHost
import dev.orbit.app.ui.PairState
import dev.orbit.app.ui.RoomUiState
import dev.orbit.app.ui.components.AgentAvatar
import dev.orbit.app.ui.screen
import dev.orbit.app.ui.screens.AgentEditorScreen
import dev.orbit.app.ui.screens.HomeScreen
import dev.orbit.app.ui.screens.PairScreen
import dev.orbit.app.ui.screens.RoomScreen
import dev.orbit.app.ui.theme.Orbit
import dev.orbit.app.ui.theme.OrbitTheme
import kotlinx.coroutines.delay
import org.junit.Rule
import org.junit.Test

/**
 * Records the app's motion as animated PNGs under app/src/test/snapshots/videos, so animations can be
 * reviewed frame by frame without a device: `./gradlew :app:recordPaparazziDebug --tests '*MotionTest*'`.
 */
class MotionTest {

    @get:Rule
    val paparazzi = Paparazzi(deviceConfig = DeviceConfig.PIXEL_6)

    private fun record(name: String, end: Long, fps: Int = 20, dark: Boolean = true, content: @Composable () -> Unit) {
        paparazzi.gif(name, start = 0, end = end, fps = fps) { OrbitTheme(dark = dark, reducedMotion = false) { Hosted(content) } }
    }

    /** The pairing hero: the crew orbiting the hub, blinking. */
    @Test fun pairOrbit() = record("pair-orbit", 3000, fps = 12) {
        PairScreen(PairState(), {}, { _, _ -> })
    }

    /** One avatar cycling through looks: shapes morph, colors blend, eyes swap behind a blink. */
    @Test fun avatarMorph() = record("avatar-morph", 3600) {
        val looks = listOf(
            AvatarSpec(0, 7, 1), AvatarSpec(1, 7, 1), AvatarSpec(1, 5, 5), AvatarSpec(2, 4, 5),
            AvatarSpec(2, 4, 2), AvatarSpec(4, 2, 2), AvatarSpec(3, 0, 3),
        )
        var index by remember { mutableIntStateOf(0) }
        LaunchedEffect(Unit) {
            while (index < looks.lastIndex) {
                delay(500)
                index++
            }
        }
        Box(Modifier.fillMaxSize().background(Orbit.colors.bg), contentAlignment = Alignment.Center) {
            AgentAvatar(looks[index], size = 180.dp, alive = true)
        }
    }

    /** A conversation in motion: your message springs up, an agent thinks, then its reply streams in. */
    @Test fun chatStream() = record("chat-stream", 5200) {
        val base = SampleData.chat.messages.take(3)
        var state by remember { mutableStateOf(RoomUiState(loaded = true, connected = true, messages = base.take(2))) }
        LaunchedEffect(Unit) {
            delay(300)
            state = state.copy(messages = base.take(3), run = RunState(true, "a2"))
            delay(500)
            state = state.copy(messages = state.messages + SampleData.userMessage("m5", "@Sage what could go wrong?"), run = RunState())
            delay(500)
            state = state.copy(
                messages = state.messages + SampleData.agentMessage("m6", SampleData.sage, "", Message.STATUS_STREAMING),
                run = RunState(true, "a3"),
            )
            delay(900)
            // Chunks arrive in uneven bursts, as they do over the network.
            val text = SampleData.SAGE_RISKS
            var sent = 0
            for (size in listOf(14, 40, 9, 55, 30, 70, 22, 60, 40)) {
                sent = minOf(text.length, sent + size)
                state = state.copy(messages = state.messages.dropLast(1) + SampleData.agentMessage("m6", SampleData.sage, text.take(sent), Message.STATUS_STREAMING))
                delay(180)
            }
            state = state.copy(
                messages = state.messages.dropLast(1) + SampleData.agentMessage("m6", SampleData.sage, text),
                run = RunState(),
            )
        }
        RoomScreen(SampleData.launch, listOf(SampleData.nova, SampleData.pixel, SampleData.sage), state, {}, {}, {}, {}, {})
    }

    /** Home opening: content staggers in, a working room's tile has light circling it. */
    @Test fun homeOpen() = record("home-open", 2400, fps = 15) {
        HomeScreen(SampleData.app, {}, {}, {}, {}, {}, {}, now = SampleData.NOW)
    }

    /** Light theme: home opening. */
    @Test fun homeOpenLight() = record("home-open-light", 1600, fps = 10, dark = false) {
        HomeScreen(SampleData.app, {}, {}, {}, {}, {}, {}, now = SampleData.NOW)
    }

    /** Shared elements: a room's faces and title fly into its top bar, and an agent flies into its editor. */
    @Test fun navigation() = record("navigation", 4200, fps = 24) {
        val nav = rememberNavController()
        LaunchedEffect(Unit) {
            delay(400)
            nav.navigate("room")
            delay(1300)
            nav.popBackStack()
            delay(1000)
            nav.navigate("agent")
            delay(1200)
            nav.popBackStack()
        }
        OrbitNavHost(nav, startDestination = "home") {
            screen("home") { HomeScreen(SampleData.app.copy(rooms = SampleData.app.rooms.map { it.copy(active = false) }), {}, {}, {}, {}, {}, {}, now = SampleData.NOW) }
            screen("room") {
                RoomScreen(
                    SampleData.launch.copy(active = false), listOf(SampleData.nova, SampleData.pixel, SampleData.sage),
                    SampleData.chat.copy(messages = SampleData.chat.messages.take(3), run = RunState()), {}, {}, {}, {}, {},
                )
            }
            screen("agent") { AgentEditorScreen(SampleData.nova, SampleData.providers, { emptyList() }, {}, {}, {}) }
        }
    }
}

/** Supplies what an activity normally would, so navigation can run inside a Paparazzi render. */
@Composable
private fun Hosted(content: @Composable () -> Unit) {
    val owner = remember {
        object : ViewModelStoreOwner, OnBackPressedDispatcherOwner, LifecycleOwner, NavigationEventDispatcherOwner {
            private val registry = LifecycleRegistry.createUnsafe(this).apply { currentState = Lifecycle.State.RESUMED }
            override val viewModelStore = ViewModelStore()
            override val lifecycle: Lifecycle get() = registry
            override val onBackPressedDispatcher = OnBackPressedDispatcher()
            override val navigationEventDispatcher = NavigationEventDispatcher()
        }
    }
    CompositionLocalProvider(
        LocalViewModelStoreOwner provides owner,
        LocalOnBackPressedDispatcherOwner provides owner,
        LocalLifecycleOwner provides owner,
        LocalNavigationEventDispatcherOwner provides owner,
    ) { content() }
}
