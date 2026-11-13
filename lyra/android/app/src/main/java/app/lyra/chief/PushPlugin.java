package app.lyra.chief;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.messaging.FirebaseMessaging;

/**
 * Push from the home base, through the user's own Firebase project. There's no
 * google-services.json in the build: the project's settings arrive through sync and are
 * kept here, so Firebase can start with them whenever Android wakes Lyra for a message.
 * Notifications are shown by Android itself while Lyra is closed or in the background.
 */
@CapacitorPlugin(name = "LyraPush")
public class PushPlugin extends Plugin {

    static final String PREFS = "lyra_push";
    static final String CHANNEL = "lyra_push";
    private static final String[] KEYS = { "projectId", "appId", "apiKey", "senderId" };

    /** Start Firebase with the saved settings, if there are any. Called when the app's process starts. */
    static boolean start(Context ctx) {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String appId = p.getString("appId", null);
        if (appId == null) return false;
        channel(ctx);
        if (!FirebaseApp.getApps(ctx).isEmpty()) return true;
        FirebaseOptions options = new FirebaseOptions.Builder()
            .setProjectId(p.getString("projectId", ""))
            .setApplicationId(appId)
            .setApiKey(p.getString("apiKey", ""))
            .setGcmSenderId(p.getString("senderId", ""))
            .build();
        FirebaseApp.initializeApp(ctx, options);
        return true;
    }

    static void channel(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        if (nm != null && nm.getNotificationChannel(CHANNEL) == null) {
            nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Lyra", NotificationManager.IMPORTANCE_HIGH));
        }
    }

    /** Sign this phone up for push with the project's settings; resolves with the phone's push address. */
    @PluginMethod
    public void register(PluginCall call) {
        Context ctx = getContext().getApplicationContext();
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        boolean changed = false;
        SharedPreferences.Editor e = p.edit();
        for (String k : KEYS) {
            String v = call.getString(k, "");
            if (v == null || v.isEmpty()) {
                call.reject("Push settings are incomplete.");
                return;
            }
            if (!v.equals(p.getString(k, null))) changed = true;
            e.putString(k, v);
        }
        e.apply();
        try {
            // a different project than before: start over with the new one
            if (changed && !FirebaseApp.getApps(ctx).isEmpty()) FirebaseApp.getInstance().delete();
            start(ctx);
            FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
                if (!task.isSuccessful() || task.getResult() == null) {
                    Exception ex = task.getException();
                    call.reject(ex != null && ex.getMessage() != null ? ex.getMessage() : "Couldn't sign up for push.");
                    return;
                }
                JSObject r = new JSObject();
                r.put("token", task.getResult());
                call.resolve(r);
            });
        } catch (Exception ex) {
            call.reject(ex.getMessage() != null ? ex.getMessage() : "Couldn't sign up for push.");
        }
    }

    @PluginMethod
    public void forget(PluginCall call) {
        Context ctx = getContext().getApplicationContext();
        try {
            if (!FirebaseApp.getApps(ctx).isEmpty()) FirebaseMessaging.getInstance().deleteToken();
        } catch (Exception ignored) {}
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply();
        call.resolve();
    }
}
