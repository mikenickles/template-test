package dev.orbit.app

import dev.orbit.app.ui.screens.LocalModelsScreen
import dev.orbit.app.ui.screens.ProviderKeyScreen
import dev.orbit.app.ui.components.rememberQrScanner
import kotlinx.coroutines.launch
import androidx.compose.runtime.rememberCoroutineScope
import androidx.activity.viewModels
import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.togetherWith
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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavType
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import dev.orbit.app.data.Session
import dev.orbit.app.notify.AppVisibility
import dev.orbit.app.notify.ReplyWatcher
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.CompositionLocalProvider
import dev.orbit.app.ui.MAX_DRAFTS
import dev.orbit.app.ui.components.LocalHubImages
import dev.orbit.app.notify.rememberNotificationAsk
import dev.orbit.app.ui.AppState
import dev.orbit.app.ui.AppViewModel
import dev.orbit.app.ui.OrbitNavHost
import dev.orbit.app.ui.RoomViewModel
import dev.orbit.app.ui.screen
import dev.orbit.app.ui.screens.AboutYouScreen
import dev.orbit.app.ui.screens.AgentEditorScreen
import dev.orbit.app.ui.screens.HomeScreen
import dev.orbit.app.ui.screens.PairScreen
import dev.orbit.app.ui.screens.RoomEditorScreen
import dev.orbit.app.ui.screens.RoomScreen
import dev.orbit.app.ui.screens.SettingsScreen
import dev.orbit.app.ui.screens.UsageScreen
import dev.orbit.app.ui.screens.ShareScreen
import dev.orbit.app.ui.screens.ScheduleEditorScreen
import dev.orbit.app.ui.screens.SchedulesScreen
import android.net.Uri
import androidx.core.content.IntentCompat
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import dev.orbit.app.ui.theme.Orbit
import dev.orbit.app.ui.theme.OrbitMotion
import dev.orbit.app.ui.theme.OrbitTheme
import dev.orbit.app.ui.theme.rememberHaptics
import kotlinx.coroutines.delay

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        val images = (application as OrbitApp).images
        setContent {
            OrbitTheme {
                CompositionLocalProvider(LocalHubImages provides images) { OrbitRoot(vm) }
            }
        }
        if (savedInstanceState == null) openLink(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        openLink(intent)
    }

    /**
     * orbit://pair (the hub's QR code, scanned by the phone's camera) pairs right away; orbit://room/<id>
     * (a tapped reply notification) opens that room.
     */
    private fun openLink(intent: Intent?) {
        if (intent?.action == Intent.ACTION_SEND || intent?.action == Intent.ACTION_SEND_MULTIPLE) {
            // Shared from another app: text, a link, photos or files.
            val uris = if (intent.action == Intent.ACTION_SEND_MULTIPLE) {
                IntentCompat.getParcelableArrayListExtra(intent, Intent.EXTRA_STREAM, Uri::class.java).orEmpty()
            } else {
                listOfNotNull(IntentCompat.getParcelableExtra(intent, Intent.EXTRA_STREAM, Uri::class.java))
            }
            vm.receiveShare(intent.getStringExtra(Intent.EXTRA_TEXT), intent.getStringExtra(Intent.EXTRA_SUBJECT), uris)
            return
        }
        val link = intent?.data?.takeIf { it.scheme == "orbit" } ?: return
        when (link.host) {
            "room" -> link.pathSegments.firstOrNull()?.let(vm::openRoom)
            else -> vm.pairWithLink(link.toString())
        }
    }

    override fun onStart() {
        super.onStart()
        AppVisibility.onScreen = true
        // Back on screen: the app shows replies itself.
        ReplyWatcher.stop(this)
    }

    override fun onStop() {
        super.onStop()
        AppVisibility.onScreen = false
        // Leaving while agents are still replying: keep listening, so their reply can ping the phone.
        if (!isChangingConfigurations && (application as OrbitApp).repository.mayBeWorking()) ReplyWatcher.start(this)
    }

    private val vm: AppViewModel by viewModels()
}

@Composable
private fun OrbitRoot(vm: AppViewModel) {
    val session by vm.session.collectAsStateWithLifecycle()
    val state by vm.state.collectAsStateWithLifecycle()
    val pairState by vm.pairState.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    LaunchedEffect(Unit) { vm.notices.collect { snackbar.showSnackbar(it) } }
    val scanQr = rememberQrScanner(
        onCode = vm::pairWithLink,
        onUnavailable = {
            scope.launch { snackbar.showSnackbar("Scanning isn't available on this phone. Type the address and code instead.") }
        },
    )

    // A confirming tap the moment pairing succeeds.
    val haptics = rememberHaptics()
    var paired by remember { mutableStateOf(session != null) }
    LaunchedEffect(session) {
        if (session != null && !paired) haptics.confirm()
        paired = session != null
    }

    Surface(Modifier.fillMaxSize(), color = Orbit.colors.bg) {
        Box {
            // Pairing hands off to the app with the pair screen falling away and home rising in.
            AnimatedContent(
                session,
                contentKey = { it != null },
                transitionSpec = {
                    (fadeIn(tween(OrbitMotion.LONG, delayMillis = 120)) + scaleIn(tween(OrbitMotion.LONG + 80, easing = OrbitMotion.Decelerate), initialScale = 0.94f)) togetherWith
                        (fadeOut(tween(OrbitMotion.MEDIUM)) + scaleOut(tween(OrbitMotion.MEDIUM, easing = OrbitMotion.Accelerate), targetScale = 1.04f))
                },
                label = "session",
            ) { current ->
                if (current == null) {
                    PairScreen(pairState, onFind = vm::findHubs, onConnect = vm::pair, onScan = scanQr)
                } else {
                    MainNav(vm, state, current, snackbar)
                }
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
    val haptics = rememberHaptics()
    val scope = rememberCoroutineScope()
    LifecycleResumeEffect(Unit) {
        vm.refresh()
        onPauseOrDispose {}
    }
    // A tapped notification opens its room.
    val updateStatus by vm.updateStatus.collectAsStateWithLifecycle()
    val pendingRoom by vm.pendingRoom.collectAsStateWithLifecycle()
    LaunchedEffect(pendingRoom) {
        val id = pendingRoom ?: return@LaunchedEffect
        nav.navigate("room/$id") {
            popUpTo("home")
            launchSingleTop = true
        }
        vm.roomOpened()
    }
    val askNotifications = rememberNotificationAsk()
    // Something shared from another app: choose where it goes.
    val share by vm.share.collectAsStateWithLifecycle()
    LaunchedEffect(share != null) {
        if (share != null && nav.currentDestination?.route != "share") nav.navigate("share") { launchSingleTop = true }
    }

    OrbitNavHost(nav, startDestination = "home") {
        screen("home") {
            // Coming back from a room: pick up new previews and activity. While any room is
            // working, keep checking so home shows who is replying and when they finish.
            LaunchedEffect(Unit) { vm.refresh() }
            val working = state.rooms.any { it.active }
            LaunchedEffect(working) {
                while (working) {
                    delay(2500)
                    vm.refresh()
                }
            }
            HomeScreen(
                state = state,
                onOpenRoom = { nav.navigate("room/${it.id}") },
                onNewRoom = { nav.navigate("roomEdit") },
                onNewAgent = { nav.navigate("agent") },
                onEditAgent = { nav.navigate("agent?id=${it.id}") },
                onSettings = { nav.navigate("settings") },
                onRefresh = vm::refresh,
                onAddKey = { nav.navigate("settings") },
                appUpdate = state.appUpdate(vm.installedVersion),
                updateStatus = updateStatus,
                onUpdate = vm::installUpdate,
                onStartIntro = {
                    vm.startIntro { id, error ->
                        if (id != null) nav.navigate("room/$id")
                        else scope.launch { snackbar.showSnackbar(error ?: "The chat couldn't start.") }
                    }
                },
            )
        }
        screen("room/{id}") { entry ->
            val id = entry.arguments?.getString("id").orEmpty()
            val room = state.room(id)
            if (room == null) {
                if (state.loaded) LaunchedEffect(Unit) { nav.popBackStack("home", inclusive = false) }
                return@screen
            }
            val roomVm: RoomViewModel = viewModel(factory = RoomViewModel.Factory(id))
            // Arriving with something shared: its files join the drafts and its text starts the message.
            val shared = remember(id) { vm.claimShare(id) }
            LaunchedEffect(shared) { shared?.let { roomVm.attachShared(it.files) } }
            val pickPhotos = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(MAX_DRAFTS)) { roomVm.attach(it) }
            val pickFiles = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { roomVm.attach(it) }
            val roomState by roomVm.state.collectAsStateWithLifecycle()
            LaunchedEffect(roomVm) { roomVm.notices.collect { snackbar.showSnackbar(it) } }
            RoomScreen(
                room = room,
                agents = room.agentIds.mapNotNull(state::agent),
                state = roomState,
                onSend = {
                    askNotifications()
                    roomVm.send(it)
                },
                onDeleteMessage = roomVm::delete,
                onRetry = roomVm::retry,
                onPickPhotos = { pickPhotos.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                onPickFiles = { pickFiles.launch(arrayOf("application/pdf", "text/*", "application/json")) },
                onRemoveDraft = roomVm::detach,
                initialDraft = shared?.text.orEmpty(),
                onSchedules = { nav.navigate("schedules/$id") },
                onStop = roomVm::stop,
                onBack = { nav.popBackStack() },
                onEdit = { nav.navigate("roomEdit?id=$id") },
                onClear = roomVm::clear,
                everyone = state.agents,
                onOpenRoom = { other -> vm.refreshThen { nav.navigate("room/$other") } },
                onStale = vm::refresh,
            )
        }
        screen("agent?id={id}", arguments = OptionalId) { entry ->
            val agent = state.agent(entry.arguments?.getString("id"))
            AgentEditorScreen(
                initial = agent,
                providers = state.providers,
                loadModels = vm::models,
                onSave = {
                    vm.saveAgent(it) {
                        haptics.confirm()
                        nav.popBackStack()
                    }
                },
                onDelete = agent?.let { { vm.deleteAgent(it.id) { nav.popBackStack() } } },
                onBack = { nav.popBackStack() },
                onAddKey = { nav.navigate("provider/$it") },
                folders = state.folders,
                onAddMemory = { text, done -> agent?.let { vm.addMemory(it.id, text, done) } },
                onRemoveMemory = { note -> agent?.let { vm.removeMemory(it.id, note.id) } },
            )
        }
        screen("roomEdit?id={id}", arguments = OptionalId) { entry ->
            val room = state.room(entry.arguments?.getString("id"))
            RoomEditorScreen(
                initial = room,
                agents = state.agents,
                onSave = { edited ->
                    vm.saveRoom(edited) { saved ->
                        haptics.confirm()
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
        screen("settings") {
            val via by vm.via.collectAsStateWithLifecycle()
            val usage by vm.usage.collectAsStateWithLifecycle()
            LaunchedEffect(Unit) { vm.loadUsage(30) }
            SettingsScreen(
                state,
                via ?: session.baseUrl,
                onUnpair = vm::unpair,
                onBack = { nav.popBackStack() },
                onOpenProvider = { nav.navigate("provider/$it") },
                onRemoveFolder = {
                    haptics.tick()
                    vm.removeFolder(it)
                },
                usage = usage?.takeIf { it.days == 30 },
                onOpenUsage = { nav.navigate("usage") },
                onOpenAbout = { nav.navigate("about") },
                installedVersion = vm.installedVersion,
                updateStatus = updateStatus,
                onUpdate = vm::installUpdate,
            )
        }
        screen("schedules/{id}") { entry ->
            val room = state.room(entry.arguments?.getString("id")) ?: return@screen
            SchedulesScreen(
                room = room,
                schedules = state.schedules.filter { it.roomId == room.id },
                onNew = { nav.navigate("schedule/${room.id}") },
                onEdit = { nav.navigate("schedule/${room.id}?id=${it.id}") },
                onToggle = { vm.saveSchedule(it.copy(enabled = !it.enabled)) {} },
                onBack = { nav.popBackStack() },
            )
        }
        screen("schedule/{room}?id={id}", arguments = OptionalId) { entry ->
            val room = state.room(entry.arguments?.getString("room")) ?: return@screen
            val schedule = state.schedules.firstOrNull { it.id == entry.arguments?.getString("id") }
            ScheduleEditorScreen(
                room = room,
                initial = schedule,
                onSave = {
                    vm.saveSchedule(it) {
                        haptics.confirm()
                        nav.popBackStack()
                    }
                },
                onDelete = schedule?.let { { vm.deleteSchedule(it.id) { nav.popBackStack() } } },
                onRunNow = schedule?.let {
                    {
                        vm.runSchedule(it.id) {
                            haptics.confirm()
                            nav.navigate("room/${room.id}") { popUpTo("home") }
                        }
                    }
                },
                onBack = { nav.popBackStack() },
            )
        }
        screen("share") {
            val content = share ?: return@screen
            ShareScreen(
                content = content,
                rooms = state.rooms,
                agents = state.agents,
                onPick = { room ->
                    vm.routeShare(room.id)
                    nav.navigate("room/${room.id}") { popUpTo("home") }
                },
                onNewRoom = {
                    vm.dropShare()
                    nav.navigate("roomEdit") { popUpTo("home") }
                },
                onBack = {
                    vm.dropShare()
                    nav.popBackStack()
                },
            )
        }
        screen("about") {
            AboutYouScreen(
                profile = state.profile,
                agents = state.agents,
                canIntro = state.canIntro,
                onSetName = vm::setProfileName,
                onAdd = vm::addProfileNote,
                onRemove = { vm.removeProfileNote(it.id) },
                onIntro = {
                    vm.startIntro { id, error ->
                        if (id != null) nav.navigate("room/$id")
                        else scope.launch { snackbar.showSnackbar(error ?: "The chat couldn't start.") }
                    }
                },
                onBack = { nav.popBackStack() },
            )
        }
        screen("usage") {
            var days by rememberSaveable { mutableIntStateOf(30) }
            val usage by vm.usage.collectAsStateWithLifecycle()
            LaunchedEffect(days) { vm.loadUsage(days) }
            UsageScreen(usage, state.agents, days, onDays = { days = it }, onBack = { nav.popBackStack() })
        }
        screen("provider/{id}") { entry ->
            val provider = state.providers.firstOrNull { it.id == entry.arguments?.getString("id") } ?: return@screen
            if (provider.local) {
                LocalModelsScreen(
                    provider = provider,
                    onDownload = { model, done -> vm.pullModel(provider.id, model, done) },
                    onDismissError = { vm.clearDownload(provider.id) },
                    onRefresh = vm::refresh,
                    onBack = { nav.popBackStack() },
                )
                return@screen
            }
            ProviderKeyScreen(
                provider = provider,
                onSave = { key, done ->
                    vm.setKey(provider.id, key) { error ->
                        done(error)
                        if (error == null) {
                            haptics.confirm()
                            nav.popBackStack()
                            scope.launch { snackbar.showSnackbar("${provider.label} key saved. Agents on ${provider.label} are ready.") }
                        }
                    }
                },
                onRemove = { vm.removeKey(provider.id) { nav.popBackStack() } },
                onBack = { nav.popBackStack() },
            )
        }
    }
}
