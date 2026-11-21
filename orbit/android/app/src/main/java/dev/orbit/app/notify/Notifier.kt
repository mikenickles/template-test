package dev.orbit.app.notify

import android.Manifest
import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.os.Build
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.graphics.toArgb
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.Person
import androidx.core.app.RemoteInput
import androidx.core.content.ContextCompat
import androidx.core.content.edit
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.createBitmap
import androidx.core.graphics.drawable.IconCompat
import androidx.core.net.toUri
import dev.orbit.app.MainActivity
import dev.orbit.app.OrbitApp
import dev.orbit.app.R
import dev.orbit.app.data.AvatarSpec
import dev.orbit.app.ui.components.character
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** One line in a room's notification: who said it (null for the user), what, and their character. */
data class NotifyLine(val author: String?, val text: String, val character: Int? = null)

/**
 * Treehouse's notifications. Replies show as a conversation, in Android's conversation style: the room
 * as the title, each agent's face and name beside what they said, and Reply, Mark as read and Mute for
 * an hour right there. One channel for replies, one for the "still working" note.
 */
object Notifier {
    const val CHANNEL_WORKING = "working"
    const val CHANNEL_REPLIES = "replies"
    private const val ID_REPLY = 2
    private const val PREFS = "orbit-notify"
    private const val MUTE_MS = 60 * 60_000L
    internal const val KEY_REPLY = "reply"
    internal const val EXTRA_ROOM = "room"
    internal const val EXTRA_TITLE = "title"
    internal const val ACTION_REPLY = "dev.orbit.app.REPLY"
    internal const val ACTION_READ = "dev.orbit.app.READ"
    internal const val ACTION_MUTE = "dev.orbit.app.MUTE"

    /** The two channels, so people can silence one without the other. */
    fun createChannels(context: Context) {
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL_REPLIES, "Replies", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "When your agents finish replying while Treehouse is in the background, and scheduled results"
            },
        )
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL_WORKING, "Agents working", NotificationManager.IMPORTANCE_LOW).apply {
                description = "Shown while agents are still replying and Treehouse is in the background"
                setShowBadge(false)
            },
        )
    }

    fun canNotify(context: Context) =
        NotificationManagerCompat.from(context).areNotificationsEnabled() &&
            (Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED)

    /** Quiets a room's notifications for an hour. */
    fun mute(context: Context, roomId: String) =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit { putLong("mute:$roomId", System.currentTimeMillis() + MUTE_MS) }

    private fun muted(context: Context, roomId: String) =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getLong("mute:$roomId", 0) > System.currentTimeMillis()

    /**
     * What landed in [roomId], as one conversation notification. One per room: a newer one replaces it,
     * so the same reply heard twice (by the watcher and by the scheduled-results check) shows once.
     */
    @SuppressLint("MissingPermission") // canNotify() checks it
    fun announce(context: Context, roomId: String, title: String, text: String, subText: String? = null, lines: List<NotifyLine> = emptyList()) {
        if (!canNotify(context) || muted(context, roomId)) return
        val style = conversation(context, title, lines.ifEmpty { listOf(NotifyLine(title, text)) })
        val first = lines.firstOrNull { it.character != null }?.character
        publishShortcut(context, roomId, title, first)
        NotificationManagerCompat.from(context).notify(roomId, ID_REPLY, build(context, roomId, title, style, subText).build())
    }

    /** After a reply from the notification: the user's words join the conversation, or it says why not. */
    @SuppressLint("MissingPermission")
    fun replied(context: Context, roomId: String, title: String, text: String, sent: Boolean) {
        if (!canNotify(context)) return
        val manager = context.getSystemService(NotificationManager::class.java)
        val shown = manager?.activeNotifications?.firstOrNull { it.tag == roomId && it.id == ID_REPLY }?.notification
        val style = shown?.let { NotificationCompat.MessagingStyle.extractMessagingStyleFromNotification(it) } ?: conversation(context, title, emptyList())
        if (sent) {
            style.addMessage(text, System.currentTimeMillis(), null as Person?)
        } else {
            style.addMessage("Couldn't send: your PC didn't answer. Open Treehouse to try again.", System.currentTimeMillis(), Person.Builder().setName("Treehouse").build())
        }
        NotificationManagerCompat.from(context).notify(roomId, ID_REPLY, build(context, roomId, title, style, null).setSilent(true).build())
    }

    fun dismiss(context: Context, roomId: String) = NotificationManagerCompat.from(context).cancel(roomId, ID_REPLY)

    private fun conversation(context: Context, title: String, lines: List<NotifyLine>): NotificationCompat.MessagingStyle {
        val style = NotificationCompat.MessagingStyle(Person.Builder().setName("You").build())
            .setConversationTitle(title)
            .setGroupConversation(true)
        val people = mutableMapOf<String, Person>()
        val now = System.currentTimeMillis()
        lines.takeLast(6).forEachIndexed { index, line ->
            val person = line.author?.let { name ->
                people.getOrPut(name) {
                    Person.Builder().setName(name).setKey(name).apply { line.character?.let { setIcon(IconCompat.createWithBitmap(face(context, it))) } }.build()
                }
            }
            style.addMessage(line.text, now - (lines.size - index) * 1000L, person)
        }
        return style
    }

    private fun build(context: Context, roomId: String, title: String, style: NotificationCompat.MessagingStyle, subText: String?) =
        NotificationCompat.Builder(context, CHANNEL_REPLIES)
            .setSmallIcon(R.drawable.ic_stat_treehouse)
            .setStyle(style)
            .setSubText(subText)
            .setShortcutId(shortcutId(roomId))
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setAutoCancel(true)
            .setOnlyAlertOnce(false)
            .setContentIntent(open(context, roomId))
            .addAction(
                NotificationCompat.Action.Builder(0, "Reply", action(context, ACTION_REPLY, roomId, title, mutable = true))
                    .addRemoteInput(RemoteInput.Builder(KEY_REPLY).setLabel("Reply to $title").build())
                    .setSemanticAction(NotificationCompat.Action.SEMANTIC_ACTION_REPLY)
                    .setShowsUserInterface(false)
                    .build(),
            )
            .addAction(
                NotificationCompat.Action.Builder(0, "Mark as read", action(context, ACTION_READ, roomId, title))
                    .setSemanticAction(NotificationCompat.Action.SEMANTIC_ACTION_MARK_AS_READ)
                    .setShowsUserInterface(false)
                    .build(),
            )
            .addAction(
                NotificationCompat.Action.Builder(0, "Mute for an hour", action(context, ACTION_MUTE, roomId, title))
                    .setSemanticAction(NotificationCompat.Action.SEMANTIC_ACTION_MUTE)
                    .setShowsUserInterface(false)
                    .build(),
            )

    private fun action(context: Context, name: String, roomId: String, title: String, mutable: Boolean = false): PendingIntent {
        val intent = Intent(context, NotificationActions::class.java).setAction(name).putExtra(EXTRA_ROOM, roomId).putExtra(EXTRA_TITLE, title)
        // A reply carries the typed words, which Android fills in, so its intent must be mutable.
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or if (mutable) PendingIntent.FLAG_MUTABLE else PendingIntent.FLAG_IMMUTABLE
        return PendingIntent.getBroadcast(context, (name + roomId).hashCode(), intent, flags)
    }

    private fun shortcutId(roomId: String) = "room-$roomId"

    /** A long-lived shortcut per room lets Android show its notifications in the Conversations section. */
    private fun publishShortcut(context: Context, roomId: String, title: String, character: Int?) {
        runCatching {
            val intent = Intent(Intent.ACTION_VIEW, "orbit://room/$roomId".toUri(), context, MainActivity::class.java)
            val icon = character?.let { IconCompat.createWithBitmap(face(context, it)) } ?: IconCompat.createWithResource(context, R.mipmap.ic_launcher)
            ShortcutManagerCompat.pushDynamicShortcut(
                context,
                ShortcutInfoCompat.Builder(context, shortcutId(roomId))
                    .setShortLabel(title.ifBlank { "Treehouse" })
                    .setLongLived(true)
                    .setIntent(intent)
                    .setIcon(icon)
                    .build(),
            )
        }
    }

    /** An agent's character on a soft circle of its own color, as notifications show faces. */
    private fun face(context: Context, character: Int): Bitmap {
        val size = 144
        val look = AvatarSpec(character).character()
        val bitmap = createBitmap(size, size)
        val canvas = Canvas(bitmap)
        val wash = look.fill.copy(alpha = 0.28f).compositeOver(androidx.compose.ui.graphics.Color.White)
        canvas.drawCircle(size / 2f, size / 2f, size / 2f, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = wash.toArgb() })
        ContextCompat.getDrawable(context, look.image)?.let { picture ->
            val inset = (size * 0.1f).toInt()
            picture.setBounds(inset, inset, size - inset, size - inset)
            picture.draw(canvas)
        }
        return bitmap
    }

    /** Opens the app, in [roomId] if given. */
    fun open(context: Context, roomId: String?): PendingIntent {
        val intent = Intent(context, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        if (roomId != null) intent.data = "orbit://room/$roomId".toUri()
        return PendingIntent.getActivity(context, roomId.hashCode(), intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }
}

/** Reply, Mark as read and Mute for an hour, from a room's notification. */
class NotificationActions : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val roomId = intent.getStringExtra(Notifier.EXTRA_ROOM) ?: return
        val title = intent.getStringExtra(Notifier.EXTRA_TITLE).orEmpty()
        when (intent.action) {
            Notifier.ACTION_READ -> Notifier.dismiss(context, roomId)
            Notifier.ACTION_MUTE -> {
                Notifier.mute(context, roomId)
                Notifier.dismiss(context, roomId)
            }
            Notifier.ACTION_REPLY -> {
                val text = RemoteInput.getResultsFromIntent(intent)?.getCharSequence(Notifier.KEY_REPLY)?.toString()?.trim()
                if (text.isNullOrEmpty()) return
                val pending = goAsync()
                val app = context.applicationContext as OrbitApp
                CoroutineScope(Dispatchers.IO).launch {
                    val sent = runCatching { app.repository.client!!.send(roomId, text) }.isSuccess
                    withContext(Dispatchers.Main) {
                        Notifier.replied(context, roomId, title, text, sent)
                        // Listen for the crew's answer, so it arrives as a notification too.
                        if (sent && !AppVisibility.onScreen) ReplyWatcher.start(context)
                    }
                    pending.finish()
                }
            }
        }
    }
}

/** Whether Orbit is on screen. Background checks stay quiet while it is: the app shows replies itself. */
object AppVisibility {
    @Volatile
    var onScreen = false
}
