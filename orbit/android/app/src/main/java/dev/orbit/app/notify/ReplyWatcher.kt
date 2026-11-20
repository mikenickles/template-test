package dev.orbit.app.notify

import android.annotation.SuppressLint
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import dev.orbit.app.MainActivity
import dev.orbit.app.OrbitApp
import dev.orbit.app.R
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull

/**
 * Keeps an ear on the hub while the app is in the background and agents are still replying, then posts
 * "Nova replied in Launch plan" when they finish. It runs only as long as a reply is in progress.
 *
 * Android only lets an app start this kind of service as it leaves the screen, which is exactly when
 * MainActivity starts it; it stops again as soon as the app is back in front.
 */
class ReplyWatcher : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var job: Job? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val type = if (Build.VERSION.SDK_INT >= 29) ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC else 0
        try {
            ServiceCompat.startForeground(this, ID_WORKING, working("Your crew is working"), type)
        } catch (e: RuntimeException) {
            // Started too late for Android to allow it; there's nothing to watch with.
            stopSelf()
            return START_NOT_STICKY
        }
        running = true
        // The app came back before the service got going: nothing to watch for.
        if (!wanted) {
            stopSelf()
            return START_NOT_STICKY
        }
        if (job == null) job = scope.launch { follow() }
        return START_NOT_STICKY
    }

    private suspend fun follow() {
        val repository = (application as OrbitApp).repository
        val tracker = ReplyTracker()
        withTimeoutOrNull(MAX_WATCH_MS) {
            var failures = 0
            while (failures < 3) {
                val client = repository.client ?: break
                try {
                    // The first event lists what is running; nothing running means nothing to wait for.
                    client.watch().first { event ->
                        failures = 0
                        tracker.onEvent(event).forEach(::announce)
                        if (!tracker.idle) update(tracker.status())
                        tracker.idle
                    }
                    break
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    failures++
                    delay(2000L * failures)
                }
            }
        }
        stopSelf()
    }

    /** Android 15 caps how long a data-sync service may run; a reply that long isn't worth waiting on. */
    override fun onTimeout(startId: Int, fgsType: Int) {
        stopSelf()
    }

    override fun onDestroy() {
        running = false
        scope.cancel()
        super.onDestroy()
    }

    @SuppressLint("MissingPermission") // canNotify() checks it
    private fun update(status: String) {
        if (Notifier.canNotify(this)) NotificationManagerCompat.from(this).notify(ID_WORKING, working(status))
    }

    private fun working(status: String) = NotificationCompat.Builder(this, Notifier.CHANNEL_WORKING)
        .setSmallIcon(R.drawable.ic_stat_orbit)
        .setContentTitle(status)
        .setContentText("You'll get a ping when they're done.")
        .setOngoing(true)
        .setSilent(true)
        .setCategory(NotificationCompat.CATEGORY_PROGRESS)
        .setContentIntent(Notifier.open(this, null))
        .build()

    private fun announce(finished: Finished) =
        Notifier.announce(this, finished.roomId, finished.title, finished.text, if (finished.count > 1) "${finished.count} replies" else null)

    companion object {
        private const val ID_WORKING = 1
        private const val MAX_WATCH_MS = 45 * 60_000L

        // Main thread only. A service asked to start must reach startForeground() before it stops,
        // so stopping one that hasn't started yet is left to the service itself.
        private var wanted = false
        private var running = false

        /** Starts watching, as the app leaves the screen. Does nothing if Android won't allow it. */
        fun start(context: Context) {
            wanted = true
            runCatching { ContextCompat.startForegroundService(context, Intent(context, ReplyWatcher::class.java)) }
                .onFailure { wanted = false }
        }

        fun stop(context: Context) {
            wanted = false
            if (running) context.stopService(Intent(context, ReplyWatcher::class.java))
        }
    }
}
