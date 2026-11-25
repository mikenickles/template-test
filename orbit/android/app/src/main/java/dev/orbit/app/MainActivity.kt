package dev.orbit.app

import dev.orbit.app.data.SearchResults
import dev.orbit.app.ui.screens.SearchScreen
import android.speech.RecognizerIntent
import dev.orbit.app.ui.screens.AwayScreen
import dev.orbit.app.ui.screens.FoldersScreen
import dev.orbit.app.ui.screens.GoogleScreen
import dev.orbit.app.ui.screens.BrowserScreen
import dev.orbit.app.ui.screens.LocalModelsScreen
import dev.orbit.app.ui.screens.ModelsScreen
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
import dev.orbit.app.ui.screens.ProactiveScreen
import dev.orbit.app.ui.screens.AgentEditorScreen
import dev.orbit.app.ui.screens.HomeScreen
import dev.orbit.app.ui.screens.PairScreen
import dev.orbit.app.ui.screens.RoomEditorScreen
import dev.orbit.app.data.RoomContext
import dev.orbit.app.data.Card
import dev.orbit.app.ui.components.tint
import dev.orbit.app.ui.screens.RoomScreen
import dev.orbit.app.ui.screens.RoomTokensScreen
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
    val pcUpdating by vm.pcUpdating.collectAsStateWithLifecycle()
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
            val roomsAsCards by vm.roomsAsCards.collectAsStateWithLifecycle()
            HomeScreen(
                state = state,
                roomsAsCards = roomsAsCards,
                onRoomsAsCards = vm::showRoomsAsCards,
                onOpenRoom = { nav.navigate("room/${it.id}") },
                onNewRoom = { nav.navigate("roomEdit") },
                onNewAgent = { nav.navigate("agent") },
                onEditAgent = { nav.navigate("agent?id=${it.id}") },
                onSettings = { nav.navigate("settings") },
                onRefresh = vm::refresh,
                onAddKey = { nav.navigate("settings/models") },
                appUpdate = state.appUpdate(vm.installedVersion),
                updateStatus = updateStatus,
                onUpdate = vm::installUpdate,
                pcUpdating = pcUpdating,
                onUpdatePc = vm::updatePc,
                onOpenNudge = { nudge ->
                    vm.nudgesSeen(nudge.roomId)
                    nav.navigate("room/${nudge.roomId}")
                },
                onDismissNudge = { vm.dismissNudge(it.id) },
                onSearch = { nav.navigate("search") },
                onEditRoom = { nav.navigate("roomEdit?id=${it.id}") },
                onDeleteRoom = { room ->
                    vm.deleteRoom(room.id) {
                        haptics.confirm()
                        scope.launch { snackbar.showSnackbar("Deleted ${room.name}") }
                    }
                },
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
            // The mic: the phone's own voice typing, whose words land in the message box.
            var onWords by remember { mutableStateOf<((String) -> Unit)?>(null) }
            val listen = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
                result.data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull()?.takeIf { it.isNotBlank() }?.let { onWords?.invoke(it) }
                onWords = null
            }
            val roomState by roomVm.state.collectAsStateWithLifecycle()
            // When a run ends, agents may have changed themselves or the room: catch up with the hub.
            LaunchedEffect(roomState.run.active) { if (!roomState.run.active && roomState.loaded) vm.refresh() }
            LaunchedEffect(roomVm) { roomVm.notices.collect { snackbar.showSnackbar(it) } }
            // About how many tokens the next reply sends, for the header chip: checked again after each reply.
            var contextTokens by remember(id) { mutableStateOf<Int?>(null) }
            LaunchedEffect(id, roomState.run.active, roomState.messages.size) {
                if (!roomState.run.active) vm.roomContext(id)?.let { contextTokens = it.tokens.total }
            }
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
                scheduleCount = state.schedules.count { it.roomId == id && it.enabled },
                onSearchRoom = { nav.navigate("search?room=$id") },
                onAddMember = { agentId -> vm.saveRoom(room.copy(agentIds = room.agentIds + agentId)) {} },
                contextTokens = contextTokens,
                onTokens = { nav.navigate("tokens/$id") },
                liveRefs = (state.followUps.map { it.id } + state.watches.map { it.id }).toSet(),
                onCancelCard = { card ->
                    if (card.type == Card.FOLLOWUP) vm.deleteFollowUp(card.ref) else vm.deleteWatch(card.ref)
                },
                onDecide = { card, allow ->
                    haptics.confirm()
                    vm.decide(card.ref, allow) { ok -> if (!ok) scope.launch { snackbar.showSnackbar("That isn't waiting for an answer any more.") } }
                },
                onStop = roomVm::stop,
                onBack = { nav.popBackStack() },
                onEdit = { nav.navigate("roomEdit?id=$id") },
                onClear = roomVm::clear,
                onDeleteRoom = { vm.deleteRoom(id) { nav.popBackStack("home", inclusive = false) } },
                everyone = state.agents,
                onOpenRoom = { other -> vm.refreshThen { nav.navigate("room/$other") } },
                onStale = vm::refresh,
                onOpenAgent = { agentId -> vm.refreshThen { nav.navigate("agent?id=$agentId") } },
                onSendReply = { text, replyTo ->
                    askNotifications()
                    roomVm.send(text, replyTo)
                },
                onVoice = { deliver ->
                    onWords = deliver
                    val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                        .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                        .putExtra(RecognizerIntent.EXTRA_PROMPT, "Talk to the crew")
                    runCatching { listen.launch(intent) }.onFailure {
                        onWords = null
                        scope.launch { snackbar.showSnackbar("Voice typing isn't available on this phone.") }
                    }
                },
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
                google = state.google,
                browser = state.browser,
                main = state.main,
                rooms = state.rooms,
                crew = state.agents,
                onSetMain = { agentId, leave, done -> vm.setMain(agentId, leave) { _, error -> done(error) } },
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
                onPlan = { text, done ->
                    vm.planRoom(text) { made, error ->
                        done(error)
                        if (made != null) {
                            haptics.confirm()
                            nav.navigate("room/${made.id}") { popUpTo("home") }
                        }
                    }
                },
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
                onRenamePc = vm::renamePc,
                onBack = { nav.popBackStack() },
                usage = usage?.takeIf { it.days == 30 },
                onOpenUsage = { nav.navigate("usage") },
                onOpenAbout = { nav.navigate("about") },
                installedVersion = vm.installedVersion,
                updateStatus = updateStatus,
                onUpdate = vm::installUpdate,
                pcUpdating = pcUpdating,
                onUpdatePc = vm::updatePc,
                onCheckUpdates = vm::checkForUpdates,
                onOpenProactive = { nav.navigate("proactive") },
                onOpenModels = { nav.navigate("settings/models") },
                onOpenGoogle = { nav.navigate("settings/google") },
                onOpenBrowser = { nav.navigate("settings/browser") },
                onOpenFolders = { nav.navigate("settings/folders") },
                onOpenAway = { nav.navigate("settings/away") },
            )
        }
        screen("search?room={room}", arguments = listOf(navArgument("room") { type = NavType.StringType; nullable = true })) { entry ->
            val scope = state.room(entry.arguments?.getString("room"))
            var query by rememberSaveable { mutableStateOf("") }
            var results by remember { mutableStateOf<SearchResults?>(null) }
            var searching by remember { mutableStateOf(false) }
            // Asks the hub a moment after typing stops, so each keystroke isn't a request.
            LaunchedEffect(query) {
                if (query.isBlank()) {
                    results = null
                    searching = false
                    return@LaunchedEffect
                }
                delay(250)
                searching = true
                results = vm.search(query.trim(), scope?.id)
                searching = false
            }
            SearchScreen(
                query = query,
                onQuery = { query = it },
                results = results,
                searching = searching,
                agents = state.agents,
                onOpenRoom = { if (it == scope?.id) nav.popBackStack() else nav.navigate("room/$it") },
                onBack = { nav.popBackStack() },
                roomName = scope?.name,
            )
        }
        screen("settings/models") {
            ModelsScreen(state, onOpenProvider = { nav.navigate("provider/$it") }, onBack = { nav.popBackStack() })
        }
        screen("settings/browser") {
            val via by vm.via.collectAsStateWithLifecycle()
            BrowserScreen(state, via ?: session.baseUrl, onBack = { nav.popBackStack() })
        }
        screen("settings/google") {
            val via by vm.via.collectAsStateWithLifecycle()
            GoogleScreen(state, via ?: session.baseUrl, onDisconnect = vm::disconnectGoogle, onBack = { nav.popBackStack() })
        }
        screen("settings/folders") {
            val via by vm.via.collectAsStateWithLifecycle()
            FoldersScreen(
                state,
                via ?: session.baseUrl,
                onRemove = {
                    haptics.tick()
                    vm.removeFolder(it)
                },
                onBack = { nav.popBackStack() },
            )
        }
        screen("settings/away") {
            val via by vm.via.collectAsStateWithLifecycle()
            AwayScreen(state, via ?: session.baseUrl, onBack = { nav.popBackStack() })
        }
        screen("proactive") {
            ProactiveScreen(
                state = state,
                onSave = vm::saveProactive,
                onEditAgent = { nav.navigate("agent?id=${it.id}") },
                onCancelFollowUp = { vm.deleteFollowUp(it.id) },
                onStopWatch = { vm.deleteWatch(it.id) },
                onBack = { nav.popBackStack() },
            )
        }
        screen("tokens/{id}") { entry ->
            val room = state.room(entry.arguments?.getString("id")) ?: return@screen
            var context by remember { mutableStateOf<RoomContext?>(null) }
            var compacting by remember { mutableStateOf(false) }
            var error by remember { mutableStateOf<String?>(null) }
            LaunchedEffect(room.id) { context = vm.roomContext(room.id) }
            RoomTokensScreen(
                roomName = room.name,
                context = context,
                onSize = { size ->
                    context = context?.copy(size = size)
                    vm.setRoomContext(room.id, size, context?.photos ?: true) { it?.let { context = it } }
                },
                onPhotos = { photos ->
                    context = context?.copy(photos = photos)
                    vm.setRoomContext(room.id, context?.size ?: RoomContext.SIZE_MEDIUM, photos) { it?.let { context = it } }
                },
                onCompact = {
                    compacting = true
                    error = null
                    vm.compactRoom(room.id) { updated, problem ->
                        compacting = false
                        if (updated != null) {
                            context = updated
                            haptics.confirm()
                        } else error = problem ?: "The summary couldn't be written."
                    }
                },
                compacting = compacting,
                error = error,
                onBack = { nav.popBackStack() },
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
