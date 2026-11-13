package app.lyra.chief;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Live progress (0.45): while Lyra works on a task, one quiet, ongoing notification shows
 * the task, Lyra's latest step and how far through the checklist it is, updated in place.
 * On Android 16 it asks to be shown as a Live Update (the status bar chip and the lock
 * screen). Tapping it opens the task. It goes away when the work stops.
 */
@CapacitorPlugin(name = "LyraLive")
public class LivePlugin extends Plugin {
    static final String CHANNEL = "lyra_live";
    static final int BASE = 700_000;

    @PluginMethod
    public void show(PluginCall call) {
        Context c = getContext();
        int task = call.getInt("task", 0);
        if (!NotificationManagerCompat.from(c).areNotificationsEnabled()) {
            call.resolve();
            return;
        }
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Lyra at work", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("What Lyra is working on right now, updated as it goes.");
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }
        String title = call.getString("title", "Lyra is working");
        String text = call.getString("text", "");
        int done = call.getInt("done", 0);
        int total = call.getInt("total", 0);
        Intent open = new Intent(c, MainActivity.class)
            .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP)
            .putExtra(LyraMessagingService.HASH, "#/t/" + task);
        NotificationCompat.Builder b = new NotificationCompat.Builder(c, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_lyra)
            .setContentTitle(title)
            .setContentText(text)
            .setSubText(total > 0 ? done + " of " + total : null)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setShowWhen(true)
            .setUsesChronometer(true)
            .setWhen(call.getLong("since", System.currentTimeMillis()))
            .setCategory(NotificationCompat.CATEGORY_PROGRESS)
            .setProgress(total > 0 ? total : 0, total > 0 ? done : 0, total <= 0)
            // never left behind if the app stops without clearing it
            .setTimeoutAfter(45 * 60_000L)
            .setContentIntent(PendingIntent.getActivity(c, BASE + task, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        // Android 16: ask for a Live Update (the system decides, and the user can turn it off)
        b.getExtras().putBoolean("android.requestPromotedOngoing", true);
        try {
            nm.notify(BASE + task, b.build());
        } catch (SecurityException ignored) {
            // notifications are off
        }
        call.resolve();
    }

    @PluginMethod
    public void end(PluginCall call) {
        NotificationManager nm = getContext().getSystemService(NotificationManager.class);
        Integer task = call.getInt("task");
        if (task != null) nm.cancel(BASE + task);
        else if (Build.VERSION.SDK_INT >= 23) {
            for (android.service.notification.StatusBarNotification s : nm.getActiveNotifications())
                if (s.getId() >= BASE && s.getId() < BASE + 100_000) nm.cancel(s.getId());
        }
        call.resolve();
    }
}
