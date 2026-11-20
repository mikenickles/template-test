package dev.orbit.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.union
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import dev.orbit.app.data.Session
import dev.orbit.app.ui.AppState
import dev.orbit.app.ui.AppViewModel
import dev.orbit.app.ui.RoomViewModel
import dev.orbit.app.ui.screens.AgentEditorScreen
import dev.orbit.app.ui.screens.HomeScreen
import dev.orbit.app.ui.screens.PairScreen
import dev.orbit.app.ui.screens.RoomEditorScreen
import dev.orbit.app.ui.screens.RoomScreen
import dev.orbit.app.ui.screens.SettingsScreen
import dev.orbit.app.ui.theme.Orbit
import dev.orbit.app.ui.theme.OrbitTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        setContent { OrbitTheme { OrbitRoot() } }
    }
}

@Composable
private fun OrbitRoot(vm: AppViewModel = viewModel()) {
    val session by vm.session.collectAsStateWithLifecycle()
    val state by vm.state.collectAsStateWithLifecycle()
    val pairState by vm.pairState.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    LaunchedEffect(Unit) { vm.notices.collect { snackbar.showSnackbar(it) } }

    Surface(Modifier.fillMaxSize(), color = Orbit.colors.bg) {
        Box {
            val current = session
            if (current == null) {
                PairScreen(pairState, onFind = vm::findHubs, onConnect = vm::pair)
            } else {
                MainNav(vm, state, current, snackbar)
            }
            SnackbarHost(
                snackbar,
                Modifier
                    .align(Alignment.BottomCenter)
                    .windowInsetsPadding(WindowInsets.ime.union(WindowInsets.navigationBars))
                    .padding(bottom = 72.dp),
            )
        }
    }
}

private val OptionalId = listOf(navArgument("id") { type = NavType.StringType; nullable = true })

@Composable
private fun MainNav(vm: AppViewModel, state: AppState, session: Session, snackbar: SnackbarHostState) {
    val nav = rememberNavController()
    LifecycleResumeEffect(Unit) {
        vm.refresh()
        onPauseOrDispose {}
    }

    // Screens push in from the right with a short fade; going back reverses it.
    NavHost(
        nav,
        startDestination = "home",
        enterTransition = { slideInHorizontally(tween(260)) { it / 10 } + fadeIn(tween(200)) },
        exitTransition = { fadeOut(tween(120)) },
        popEnterTransition = { fadeIn(tween(200)) },
        popExitTransition = { slideOutHorizontally(tween(220)) { it / 10 } + fadeOut(tween(160)) },
    ) {
        composable("home") {
            // Coming back from a room: pick up new previews and activity.
            LaunchedEffect(Unit) { vm.refresh() }
            HomeScreen(
                state = state,
                onOpenRoom = { nav.navigate("room/${it.id}") },
                onNewRoom = { nav.navigate("roomEdit") },
                onNewAgent = { nav.navigate("agent") },
                onEditAgent = { nav.navigate("agent?id=${it.id}") },
                onSettings = { nav.navigate("settings") },
                onRefresh = vm::refresh,
            )
        }
        composable("room/{id}") { entry ->
            val id = entry.arguments?.getString("id").orEmpty()
            val room = state.room(id)
            if (room == null) {
                if (state.loaded) LaunchedEffect(Unit) { nav.popBackStack("home", inclusive = false) }
                return@composable
            }
            val roomVm: RoomViewModel = viewModel(factory = RoomViewModel.Factory(id))
            val roomState by roomVm.state.collectAsStateWithLifecycle()
            LaunchedEffect(roomVm) { roomVm.notices.collect { snackbar.showSnackbar(it) } }
            RoomScreen(
                room = room,
                agents = room.agentIds.mapNotNull(state::agent),
                state = roomState,
                onSend = roomVm::send,
                onStop = roomVm::stop,
                onBack = { nav.popBackStack() },
                onEdit = { nav.navigate("roomEdit?id=$id") },
                onClear = roomVm::clear,
                everyone = state.agents,
            )
        }
        composable("agent?id={id}", arguments = OptionalId) { entry ->
            val agent = state.agent(entry.arguments?.getString("id"))
            AgentEditorScreen(
                initial = agent,
                providers = state.providers,
                loadModels = vm::models,
                onSave = { vm.saveAgent(it) { nav.popBackStack() } },
                onDelete = agent?.let { { vm.deleteAgent(it.id) { nav.popBackStack() } } },
                onBack = { nav.popBackStack() },
            )
        }
        composable("roomEdit?id={id}", arguments = OptionalId) { entry ->
            val room = state.room(entry.arguments?.getString("id"))
            RoomEditorScreen(
                initial = room,
                agents = state.agents,
                onSave = { edited ->
                    vm.saveRoom(edited) { saved ->
                        if (room == null) {
                            nav.navigate("room/${saved.id}") { popUpTo("home") }
                        } else {
                            nav.popBackStack()
                        }
                    }
                },
                onDelete = room?.let { { vm.deleteRoom(it.id) { nav.popBackStack("home", inclusive = false) } } },
                onBack = { nav.popBackStack() },
            )
        }
        composable("settings") {
            SettingsScreen(state, session.baseUrl, onUnpair = vm::unpair, onBack = { nav.popBackStack() })
        }
    }
}
