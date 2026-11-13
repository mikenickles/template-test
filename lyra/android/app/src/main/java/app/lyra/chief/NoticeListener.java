package app.lyra.chief;

import android.app.Notification;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Reading the phone's notifications (texts, chats, deliveries, app alerts), once the user
 * turns on Notification access for Lyra in Android settings. Each one is kept as a short
 * line on this phone only (the last two days, at most 300), so Lyra can answer "did Mom
 * text?" or mention it in a brief. Nothing here leaves the phone unless Lyra reads it in a
 * reply. Lyra's own, ongoing and system notifications are skipped, apps the user turned
 * off are skipped, and anything that looks like a sign-in code is blanked out.
 */
public class NoticeListener extends NotificationListenerService {
    static final String PREFS = "lyra_notices";
    static final int MAX = 300;
    static final long KEEP_MS = 48L * 3600_000L;
    private static final Pattern CODE_WORDS = Pattern.compile("(?i)(code|otp|one.time|verif|passcode|password|pin\\b|2fa|security)");
    private static final Pattern DIGITS = Pattern.compile("\\b\\d[\\d -]{2,8}\\d\\b");

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        try {
            record(this, sbn);
        } catch (Exception ignored) {
        }
    }

    static void record(Context ctx, StatusBarNotification sbn) throws Exception {
        String pkg = sbn.getPackageName();
        if (pkg.equals(ctx.getPackageName()) || pkg.equals("android") || pkg.equals("com.android.systemui")) return;
        Notification n = sbn.getNotification();
        if (sbn.isOngoing() || (n.flags & Notification.FLAG_GROUP_SUMMARY) != 0 || (n.flags & Notification.FLAG_FOREGROUND_SERVICE) != 0) return;
        String cat = n.category;
        if (cat != null && (cat.equals(Notification.CATEGORY_SERVICE) || cat.equals(Notification.CATEGORY_PROGRESS) || cat.equals(Notification.CATEGORY_TRANSPORT)
            || cat.equals(Notification.CATEGORY_SYSTEM) || cat.equals(Notification.CATEGORY_NAVIGATION))) return;

        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSONArray blocked = new JSONArray(p.getString("blocked", "[]"));
        for (int i = 0; i < blocked.length(); i++) if (pkg.equals(blocked.optString(i))) return;

        Bundle x = n.extras;
        String title = str(x.getCharSequence(Notification.EXTRA_TITLE));
        String text = str(x.getCharSequence(Notification.EXTRA_BIG_TEXT));
        if (text.isEmpty()) text = str(x.getCharSequence(Notification.EXTRA_TEXT));
        CharSequence[] lines = x.getCharSequenceArray(Notification.EXTRA_TEXT_LINES);
        if (lines != null && lines.length > 0) {
            StringBuilder b = new StringBuilder();
            for (CharSequence l : lines) b.append(b.length() > 0 ? " / " : "").append(l);
            text = b.toString();
        }
        if (title.isEmpty() && text.isEmpty()) return;
        if (CODE_WORDS.matcher(title + " " + text).find()) text = DIGITS.matcher(text).replaceAll("••••");
        if (text.length() > 400) text = text.substring(0, 400) + "…";
        if (title.length() > 120) title = title.substring(0, 120);

        String label = pkg;
        try {
            PackageManager pm = ctx.getPackageManager();
            ApplicationInfo ai = pm.getApplicationInfo(pkg, 0);
            label = String.valueOf(pm.getApplicationLabel(ai));
        } catch (Exception ignored) {
        }
        long now = System.currentTimeMillis();

        synchronized (NoticeListener.class) {
            JSONArray old = new JSONArray(p.getString("list", "[]"));
            JSONArray out = new JSONArray();
            for (int i = 0; i < old.length(); i++) {
                JSONObject o = old.getJSONObject(i);
                if (now - o.optLong("at") > KEEP_MS) continue;
                // the same notification posted again (an update): keep only the newest
                if (o.optString("pkg").equals(pkg) && o.optString("title").equals(title) && o.optString("text").equals(text)) continue;
                out.put(o);
            }
            JSONObject e = new JSONObject();
            e.put("pkg", pkg);
            e.put("app", label);
            e.put("title", title);
            e.put("text", text);
            e.put("at", now);
            e.put("msg", Notification.CATEGORY_MESSAGE.equals(cat) || x.containsKey(Notification.EXTRA_MESSAGES));
            out.put(e);
            while (out.length() > MAX) out.remove(0);
            JSONObject apps = new JSONObject(p.getString("apps", "{}"));
            JSONObject app = apps.optJSONObject(pkg);
            if (app == null) app = new JSONObject();
            app.put("label", label);
            app.put("count", app.optInt("count") + 1);
            app.put("last", now);
            apps.put(pkg, app);
            p.edit().putString("list", out.toString()).putString("apps", apps.toString()).apply();
        }
    }

    private static String str(CharSequence s) {
        return s == null ? "" : s.toString().replaceAll("\\s+", " ").trim();
    }
}
