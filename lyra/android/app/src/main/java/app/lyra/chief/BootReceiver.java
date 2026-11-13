package app.lyra.chief;

import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

/**
 * After the phone restarts (or Lyra updates), Keep watch has stopped: Lyra's work runs in the
 * app, and Android won't open an app by itself. Push keeps arriving without it (the home base
 * does the work), and reminders are put back by Android. If Keep watch was on and there's no
 * home base pushing, say so once, quietly, so one tap starts it again.
 */
public class BootReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context c, Intent intent) {
        String a = intent.getAction();
        if (!Intent.ACTION_BOOT_COMPLETED.equals(a) && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(a)) return;
        // the alarm doesn't survive a restart: put it back, so a tick finds Lyra if it's opened
        if (BackgroundPlugin.enabled(c)) BackgroundPlugin.schedule(c);
        if (!BackgroundPlugin.enabled(c) || PushPlugin.signedUp(c)) return;
        if (!NotificationManagerCompat.from(c).areNotificationsEnabled()) return;
        KeepWatchService.channel(c);
        Intent open = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
        if (open == null) return;
        PendingIntent tap = PendingIntent.getActivity(c, 1, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        NotificationCompat.Builder b = new NotificationCompat.Builder(c, KeepWatchService.CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_lyra)
            .setContentTitle(Intent.ACTION_BOOT_COMPLETED.equals(a) ? "Your phone restarted" : "Lyra updated")
            .setContentText("Tap to let Lyra keep watch again.")
            .setContentIntent(tap)
            .setAutoCancel(true)
            .setSilent(true)
            .setShowWhen(false)
            .setPriority(NotificationCompat.PRIORITY_MIN);
        try {
            // the same id as Keep watch's own notification, which replaces it once Lyra is open
            c.getSystemService(NotificationManager.class).notify(KeepWatchService.NOTIFICATION_ID, b.build());
        } catch (SecurityException ignored) {
            // notifications are off
        }
    }
}
