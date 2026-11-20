package dev.orbit.app.notify

import android.Manifest
import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.core.net.toUri
import dev.orbit.app.MainActivity
import dev.orbit.app.R

/** Orbit's notifications: one channel for finished replies, one for the "still working" note. */
object Notifier {
    const val CHANNEL_WORKING = "working"
    const val CHANNEL_REPLIES = "replies"
    private const val ID_REPLY = 2

    /** The two channels, so people can silence one without the other. */
    fun createChannels(context: Context) {
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL_REPLIES, "Replies", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "When your agents finish replying while Orbit is in the background, and scheduled results"
            },
        )
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL_WORKING, "Agents working", NotificationManager.IMPORTANCE_LOW).apply {
                description = "Shown while agents are still replying and Orbit is in the background"
                setShowBadge(false)
            },
        )
    }

    fun canNotify(context: Context) =
        NotificationManagerCompat.from(context).areNotificationsEnabled() &&
            (Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED)

    /**
     * A finished reply in [roomId]. One per room: a newer one replaces it, so the same reply heard
     * twice (by the watcher and by the scheduled-results check) shows once.
     */
    @SuppressLint("MissingPermission") // canNotify() checks it
    fun announce(context: Context, roomId: String, title: String, text: String, subText: String? = null) {
        if (!canNotify(context)) return
        val notification = NotificationCompat.Builder(context, CHANNEL_REPLIES)
            .setSmallIcon(R.drawable.ic_stat_orbit)
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setSubText(subText)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setAutoCancel(true)
            .setContentIntent(open(context, roomId))
            .build()
        NotificationManagerCompat.from(context).notify(roomId, ID_REPLY, notification)
    }

    /** Opens the app, in [roomId] if given. */
    fun open(context: Context, roomId: String?): PendingIntent {
        val intent = Intent(context, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        if (roomId != null) intent.data = "orbit://room/$roomId".toUri()
        return PendingIntent.getActivity(context, roomId.hashCode(), intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }
}

/** Whether Orbit is on screen. Background checks stay quiet while it is: the app shows replies itself. */
object AppVisibility {
    @Volatile
    var onScreen = false
}
