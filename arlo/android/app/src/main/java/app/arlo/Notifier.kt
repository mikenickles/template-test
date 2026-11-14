package app.arlo

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.TimeUnit

/**
 * Asks the hub now and then whether Arlo has something for you (an approval
 * to give, a reminder, a routine's report) and shows it as a notification.
 * It talks only to your own hub; no push service is involved.
 */
class Notifier(context: Context, params: WorkerParameters) : Worker(context, params) {

    override fun doWork(): Result {
        val prefs = applicationContext.getSharedPreferences(MainActivity.PREFS, Context.MODE_PRIVATE)
        val hub = prefs.getString(MainActivity.KEY_HUB, null) ?: return Result.success()
        val cookie = prefs.getString(MainActivity.KEY_COOKIE, null) ?: return Result.success()
        val after = prefs.getLong(MainActivity.KEY_LAST, -1)

        return try {
            val connection = (URL("$hub/api/notifications?after=$after").openConnection() as HttpURLConnection).apply {
                connectTimeout = 8000
                readTimeout = 8000
                setRequestProperty("Cookie", cookie)
            }
            if (connection.responseCode != 200) return Result.success()
            val body = JSONObject(connection.inputStream.bufferedReader().use { it.readText() })
            val items = body.getJSONArray("items")
            for (i in 0 until items.length()) {
                val item = items.getJSONObject(i)
                show(item.getInt("id"), item.getString("title"), item.getString("body"))
            }
            prefs.edit().putLong(MainActivity.KEY_LAST, body.getLong("latest")).apply()
            Result.success()
        } catch (e: Exception) {
            Result.success() // the computer is off or out of reach; try again next time
        }
    }

    private fun show(id: Int, title: String, text: String) {
        val context = applicationContext
        val open = PendingIntent.getActivity(
            context, 0, Intent(context, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_dot)
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setContentIntent(open)
            .setAutoCancel(true)
            .build()
        try {
            NotificationManagerCompat.from(context).notify(id, notification)
        } catch (e: SecurityException) {
            // Notifications are not allowed for this app; nothing to do.
        }
    }

    companion object {
        private const val CHANNEL = "arlo"

        fun createChannel(context: Context) {
            val channel = NotificationChannel(CHANNEL, context.getString(R.string.channel_name), NotificationManager.IMPORTANCE_DEFAULT)
            context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }

        /** Android runs this roughly every 15 minutes, the shortest interval it allows. */
        fun schedule(context: Context) {
            val request = PeriodicWorkRequestBuilder<Notifier>(15, TimeUnit.MINUTES)
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork("arlo-notifier", ExistingPeriodicWorkPolicy.KEEP, request)
        }
    }
}
