package app.lyra.chief;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
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
 */
public class KeepWatchService extends Service {

    static final String CHANNEL = "lyra_keep_watch";
    static final int NOTIFICATION_ID = 4100;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm.getNotificationChannel(CHANNEL) == null) {
            // lowest importance: no sound, no pop-up, tucked at the bottom of the shade
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Keeping watch", NotificationManager.IMPORTANCE_MIN);
            ch.setDescription("Shown while Lyra runs your routines and heads-ups in the background.");
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }
        Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent tap = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification n = new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_lyra)
            .setContentTitle("Lyra is keeping watch")
            .setContentText("Routines and heads-ups keep running. Turn this off in Settings.")
            .setContentIntent(tap)
            .setOngoing(true)
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build();
        int type = Build.VERSION.SDK_INT >= 34 ? ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE : 0;
        ServiceCompat.startForeground(this, NOTIFICATION_ID, n, type);
        return START_NOT_STICKY;
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
