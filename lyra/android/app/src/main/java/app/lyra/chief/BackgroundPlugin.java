package app.lyra.chief;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.os.SystemClock;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Lets Lyra keep working with the app in the background (Settings, "Keep watch"):
 * starts KeepWatchService and, every 15 minutes, wakes the phone briefly and tells the
 * app ("lyraBackgroundTick") to run anything due. The app calls done() when it has
 * finished; the wake lock also ends by itself after 3 minutes, whatever happens.
 */
@CapacitorPlugin(name = "LyraBackground")
public class BackgroundPlugin extends Plugin {

    private static final String PREFS = "lyra_background";
    private static final long EVERY = 15 * 60_000L;
    private static final long WAKE_MAX = 3 * 60_000L;

    /** The running app, if any (the alarm finds it here). */
    static BackgroundPlugin current;
    private static PowerManager.WakeLock wake;

    @Override
    public void load() {
        current = this;
        // it was on when Lyra last ran: carry on (Lyra is on screen now, so Android allows starting it)
        if (enabled(getContext())) begin(getContext());
    }

    @Override
    protected void handleOnDestroy() {
        if (current == this) current = null;
        cancelAlarm(getContext());
        getContext().stopService(new Intent(getContext(), KeepWatchService.class));
        release();
    }

    static boolean enabled(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean("on", false);
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject r = new JSObject();
        r.put("on", enabled(getContext()));
        call.resolve(r);
    }

    @PluginMethod
    public void set(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        SharedPreferences p = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        p.edit().putBoolean("on", on).apply();
        if (on) begin(getContext());
        else {
            cancelAlarm(getContext());
            getContext().stopService(new Intent(getContext(), KeepWatchService.class));
            release();
        }
        JSObject r = new JSObject();
        r.put("on", on);
        call.resolve(r);
    }

    /** Whether battery saving can hold Lyra back (true: it can't). */
    @PluginMethod
    public void battery(PluginCall call) {
        PowerManager pm = getContext().getSystemService(PowerManager.class);
        JSObject r = new JSObject();
        r.put("unrestricted", pm != null && pm.isIgnoringBatteryOptimizations(getContext().getPackageName()));
        call.resolve(r);
    }

    /** Android's own "let this app run in the background?" question. */
    @PluginMethod
    public void askBattery(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        } catch (RuntimeException e) {
            Intent i = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        }
        call.resolve();
    }

    /** Lyra's notification settings in Android (when notifications were turned off there). */
    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        Intent i;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
            i.putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
        } else {
            i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName()));
        }
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        call.resolve();
    }

    /** The app finished its background tick: let the phone sleep again. */
    @PluginMethod
    public void done(PluginCall call) {
        release();
        call.resolve();
    }

    private static void begin(Context c) {
        try {
            ContextCompat.startForegroundService(c, new Intent(c, KeepWatchService.class));
        } catch (RuntimeException e) {
            // Android refused (Lyra wasn't on screen): it starts next time Lyra is opened
            return;
        }
        schedule(c);
    }

    private static PendingIntent alarmIntent(Context c) {
        Intent i = new Intent(c, TickReceiver.class);
        return PendingIntent.getBroadcast(c, 0, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    /** Inexact, so Android can batch it with other wake-ups; allowed even in Doze (at most every ~10 minutes). */
    static void schedule(Context c) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        am.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, SystemClock.elapsedRealtime() + EVERY, alarmIntent(c));
    }

    static void cancelAlarm(Context c) {
        c.getSystemService(AlarmManager.class).cancel(alarmIntent(c));
    }

    private static synchronized void release() {
        if (wake != null && wake.isHeld()) wake.release();
        wake = null;
    }

    /** The alarm: hold the CPU awake for a moment and tell the app to run what's due. */
    static synchronized void tick(Context c) {
        BackgroundPlugin p = current;
        if (p == null || !enabled(c)) return; // the app isn't running (or this was turned off)
        schedule(c);
        release();
        wake = c.getSystemService(PowerManager.class).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Lyra:tick");
        wake.acquire(WAKE_MAX);
        p.getBridge().executeOnMainThread(() -> p.getBridge().triggerWindowJSEvent("lyraBackgroundTick"));
    }

    public static class TickReceiver extends BroadcastReceiver {
        @Override
        public void onReceive(Context context, Intent intent) {
            tick(context.getApplicationContext());
        }
    }
}
