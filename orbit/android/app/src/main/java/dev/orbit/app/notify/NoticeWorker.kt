package dev.orbit.app.notify

import android.content.Context
import androidx.core.content.edit
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import dev.orbit.app.OrbitApp
import dev.orbit.app.data.HubException
import dev.orbit.app.data.Notice
import java.util.concurrent.TimeUnit

/** How a scheduled result reads in a notification. */
fun noticeText(notice: Notice): String = when {
    notice.author.isBlank() -> "Your scheduled message ran."
    notice.text.startsWith("couldn't reply") -> "${notice.author} ${notice.text}"
    else -> "${notice.author}: ${notice.text}"
}

/**
 * Checks the hub every so often for results of scheduled runs and posts a notification for each, so
 * "every morning at 8" reaches the phone even when Orbit hasn't been opened. Android decides exactly
 * when it runs, about every 15 minutes while there's a network.
 */
class NoticeWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val client = (applicationContext as OrbitApp).repository.client ?: return Result.success()
        val prefs = applicationContext.getSharedPreferences("orbit-ui", Context.MODE_PRIVATE)
        val seen = prefs.getLong(SEEN, 0)
        val fresh = try {
            client.notices(seen)
        } catch (e: HubException) {
            return Result.success() // the hub is off or out of reach; try next time
        }
        // The first check only marks where to start, rather than replaying old results.
        if (seen > 0 && !AppVisibility.onScreen) {
            for (notice in fresh.notices) {
                Notifier.announce(applicationContext, notice.roomId, notice.room.ifBlank { "Orbit" }, noticeText(notice), "Scheduled")
            }
        }
        prefs.edit { putLong(SEEN, fresh.notices.maxOfOrNull { it.at }?.coerceAtLeast(fresh.now) ?: fresh.now.coerceAtLeast(seen)) }
        return Result.success()
    }

    companion object {
        private const val NAME = "scheduled-results"
        private const val SEEN = "noticesSeen"

        /** Starts the periodic check. Safe to call again: a check already set up is kept. */
        fun schedule(context: Context) {
            val request = PeriodicWorkRequestBuilder<NoticeWorker>(15, TimeUnit.MINUTES)
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(NAME, ExistingPeriodicWorkPolicy.KEEP, request)
        }

        /** Stops checking, after unpairing. */
        fun cancel(context: Context) {
            WorkManager.getInstance(context).cancelUniqueWork(NAME)
            context.getSharedPreferences("orbit-ui", Context.MODE_PRIVATE).edit { remove(SEEN) }
        }
    }
}
