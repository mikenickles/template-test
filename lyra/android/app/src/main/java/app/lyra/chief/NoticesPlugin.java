package app.lyra.chief;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Iterator;
import org.json.JSONArray;
import org.json.JSONObject;

/** The phone's notifications for Lyra: whether access is on, the recent ones, and which apps to leave out. */
@CapacitorPlugin(name = "LyraNotices")
public class NoticesPlugin extends Plugin {

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(NoticeListener.PREFS, Context.MODE_PRIVATE);
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject r = new JSObject();
        r.put("access", NotificationManagerCompat.getEnabledListenerPackages(getContext()).contains(getContext().getPackageName()));
        call.resolve(r);
    }

    /** Android's Notification access page (Lyra's own entry where the phone allows). */
    @PluginMethod
    public void open(PluginCall call) {
        Intent i;
        if (Build.VERSION.SDK_INT >= 30) {
            i = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_DETAIL_SETTINGS);
            i.putExtra(Settings.EXTRA_NOTIFICATION_LISTENER_COMPONENT_NAME, new ComponentName(getContext(), NoticeListener.class).flattenToString());
        } else {
            i = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
        }
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(i);
        } catch (Exception e) {
            Intent all = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
            all.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(all);
        }
        call.resolve();
    }

    /** App info for Lyra: where "Allow restricted settings" lives, for an app installed from a file. */
    @PluginMethod
    public void appInfo(PluginCall call) {
        Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName()));
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        call.resolve();
    }

    @PluginMethod
    public void recent(PluginCall call) {
        long since = call.getLong("since", 0L);
        try {
            JSONArray all = new JSONArray(prefs().getString("list", "[]"));
            JSArray out = new JSArray();
            long now = System.currentTimeMillis();
            for (int i = 0; i < all.length(); i++) {
                JSONObject o = all.getJSONObject(i);
                long at = o.optLong("at");
                if (at > since && now - at <= NoticeListener.KEEP_MS) out.put(o);
            }
            JSObject r = new JSObject();
            r.put("list", out);
            call.resolve(r);
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    @PluginMethod
    public void apps(PluginCall call) {
        try {
            JSONObject apps = new JSONObject(prefs().getString("apps", "{}"));
            JSONArray blocked = new JSONArray(prefs().getString("blocked", "[]"));
            JSArray out = new JSArray();
            for (Iterator<String> it = apps.keys(); it.hasNext(); ) {
                String pkg = it.next();
                JSONObject a = apps.getJSONObject(pkg);
                JSObject o = new JSObject();
                o.put("pkg", pkg);
                o.put("label", a.optString("label", pkg));
                o.put("count", a.optInt("count"));
                o.put("last", a.optLong("last"));
                boolean b = false;
                for (int i = 0; i < blocked.length(); i++) if (pkg.equals(blocked.optString(i))) b = true;
                o.put("blocked", b);
                out.put(o);
            }
            JSObject r = new JSObject();
            r.put("apps", out);
            call.resolve(r);
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    /** Leave an app out (and forget what it already sent), or let it back in. */
    @PluginMethod
    public void block(PluginCall call) {
        String pkg = call.getString("pkg", "");
        boolean on = Boolean.TRUE.equals(call.getBoolean("blocked", true));
        synchronized (NoticeListener.class) {
            try {
                JSONArray blocked = new JSONArray(prefs().getString("blocked", "[]"));
                JSONArray next = new JSONArray();
                for (int i = 0; i < blocked.length(); i++) if (!pkg.equals(blocked.optString(i))) next.put(blocked.optString(i));
                if (on) next.put(pkg);
                JSONArray list = new JSONArray(prefs().getString("list", "[]"));
                JSONArray kept = new JSONArray();
                for (int i = 0; i < list.length(); i++) if (!on || !pkg.equals(list.getJSONObject(i).optString("pkg"))) kept.put(list.getJSONObject(i));
                prefs().edit().putString("blocked", next.toString()).putString("list", kept.toString()).apply();
                call.resolve();
            } catch (Exception e) {
                call.reject(e.getMessage());
            }
        }
    }

    /** Forget everything kept so far. */
    @PluginMethod
    public void clear(PluginCall call) {
        prefs().edit().putString("list", "[]").putString("apps", "{}").apply();
        call.resolve();
    }
}
