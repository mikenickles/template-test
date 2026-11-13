package app.lyra.chief;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;

/**
 * "Keep watch": a quiet foreground service that keeps Lyra's process alive while it's in
 * the background, so the app's own code (still running in its WebView) can run routines,
 * heads-ups and reminders. It does no work itself; BackgroundPlugin wakes the app every
 * 15 minutes. Swiping Lyra out of recent apps ends it until Lyra is opened again.
 *
 * Android insists on a notification while it runs, so it says something worth reading: the same
 * words as the home-screen widget (what's next, what's ready, the latest thing Lyra posted).
 */
public class KeepWatchService extends Service {

    static final String CHANNEL = "lyra_keep_watch";
    static final int NOTIFICATION_ID = 4100;

    static boolean running = false;

    static void channel(Context c) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm.getNotificationChannel(CHANNEL) == null) {
            // lowest importance: no sound, no pop-up, no status bar icon, tucked at the bottom of the shade
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Keeping watch", NotificationManager.IMPORTANCE_MIN);
            ch.setDescription("Shown while Lyra runs your routines and heads-ups in the background. Android requires it.");
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }
    }

    /** The notification, with the widget's latest words. */
    static Notification build(Context c) {
        channel(c);
        SharedPreferences p = c.getSharedPreferences(LyraWidget.PREFS, Context.MODE_PRIVATE);
        String status = p.getString("status", "Here when you need me");
        String detail = p.getString("detail", "");
        Intent open = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
        PendingIntent tap = PendingIntent.getActivity(c, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        NotificationCompat.Builder b = new NotificationCompat.Builder(c, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_lyra)
            .setContentTitle(status)
            .setContentIntent(tap)
            .setOngoing(true)
            .setSilent(true)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setCategory(NotificationCompat.CATEGORY_SERVICE);
        // the latest thing Lyra said, if there is one (not the widget's "tap to talk" filler)
        if (!detail.isEmpty() && !detail.startsWith("Tap to")) b.setContentText(detail).setStyle(new NotificationCompat.BigTextStyle().bigText(detail));
        return b.build();
    }

    /** New words from the widget: show them, if the service is running. */
    static void refresh(Context c) {
        if (!running) return;
        try {
            c.getSystemService(NotificationManager.class).notify(NOTIFICATION_ID, build(c));
        } catch (RuntimeException ignored) {
            // the notification is a nicety on top of the service
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        int type = Build.VERSION.SDK_INT >= 34 ? ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE : 0;
        ServiceCompat.startForeground(this, NOTIFICATION_ID, build(this), type);
        running = true;
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        running = false;
        super.onDestroy();
    }

    /** Swiped away from recent apps: the app's code is gone, so there's nothing to keep alive. */
    @Override
    public void onTaskRemoved(Intent rootIntent) {
        BackgroundPlugin.cancelAlarm(this);
        stopSelf();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
