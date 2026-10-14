package com.mikenickles.ailauncher;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/** Loads installed apps and remembers which ones the user pins or opens most. */
final class AppStore {
    private static final String KEY_PINS = "pins";

    private final Context context;
    private final SharedPreferences usage;
    private final SharedPreferences prefs;

    AppStore(Context context) {
        this.context = context.getApplicationContext();
        this.usage = context.getSharedPreferences("usage", Context.MODE_PRIVATE);
        this.prefs = context.getSharedPreferences("dock", Context.MODE_PRIVATE);
    }

    /** Slow (loads icons); call off the main thread. Sorted by label. */
    List<AppEntry> loadApps() {
        PackageManager pm = context.getPackageManager();
        Intent query = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
        List<AppEntry> apps = new ArrayList<AppEntry>();
        for (ResolveInfo ri : pm.queryIntentActivities(query, 0)) {
            if (ri.activityInfo.packageName.equals(context.getPackageName())) {
                continue;
            }
            apps.add(new AppEntry(ri.loadLabel(pm).toString(),
                    new ComponentName(ri.activityInfo.packageName, ri.activityInfo.name),
                    ri.loadIcon(pm)));
        }
        Collections.sort(apps, new Comparator<AppEntry>() {
            @Override
            public int compare(AppEntry a, AppEntry b) {
                return a.label.compareToIgnoreCase(b.label);
            }
        });
        return apps;
    }

    void recordLaunch(AppEntry app) {
        usage.edit().putInt(app.key(), usage.getInt(app.key(), 0) + 1).apply();
    }

    boolean isPinned(AppEntry app) {
        return pins().contains(app.key());
    }

    void togglePin(AppEntry app) {
        List<String> pins = pins();
        if (!pins.remove(app.key())) {
            pins.add(app.key());
        }
        StringBuilder sb = new StringBuilder();
        for (String p : pins) {
            if (sb.length() > 0) {
                sb.append('\n');
            }
            sb.append(p);
        }
        prefs.edit().putString(KEY_PINS, sb.toString()).apply();
    }

    private List<String> pins() {
        String raw = prefs.getString(KEY_PINS, "");
        List<String> out = new ArrayList<String>();
        if (!raw.isEmpty()) {
            out.addAll(Arrays.asList(raw.split("\n")));
        }
        return out;
    }

    /** Pinned apps, then most-used, then sensible defaults (phone, messages, camera, browser). */
    List<AppEntry> dock(List<AppEntry> apps, int size) {
        Set<AppEntry> picked = new LinkedHashSet<AppEntry>();
        for (String key : pins()) {
            AppEntry e = find(apps, key);
            if (e != null) {
                picked.add(e);
            }
        }

        List<AppEntry> used = new ArrayList<AppEntry>();
        for (AppEntry e : apps) {
            if (usage.getInt(e.key(), 0) > 0) {
                used.add(e);
            }
        }
        Collections.sort(used, new Comparator<AppEntry>() {
            @Override
            public int compare(AppEntry a, AppEntry b) {
                return usage.getInt(b.key(), 0) - usage.getInt(a.key(), 0);
            }
        });
        picked.addAll(used);

        Intent[] defaults = {
                new Intent(Intent.ACTION_DIAL),
                new Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:")),
                new Intent("android.media.action.IMAGE_CAPTURE"),
                new Intent(Intent.ACTION_VIEW, Uri.parse("https://example.com")),
        };
        PackageManager pm = context.getPackageManager();
        for (Intent intent : defaults) {
            ResolveInfo ri = pm.resolveActivity(intent, PackageManager.MATCH_DEFAULT_ONLY);
            if (ri != null && ri.activityInfo != null) {
                AppEntry e = findByPackage(apps, ri.activityInfo.packageName);
                if (e != null) {
                    picked.add(e);
                }
            }
        }

        List<AppEntry> out = new ArrayList<AppEntry>(picked);
        return out.size() > size ? out.subList(0, size) : out;
    }

    static AppEntry find(List<AppEntry> apps, String key) {
        for (AppEntry e : apps) {
            if (e.key().equals(key)) {
                return e;
            }
        }
        return null;
    }

    static AppEntry findByPackage(List<AppEntry> apps, String pkg) {
        for (AppEntry e : apps) {
            if (e.packageName().equals(pkg)) {
                return e;
            }
        }
        return null;
    }

    /** True when this launcher is the device's default Home app. */
    boolean isDefaultHome() {
        Intent home = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME);
        ResolveInfo ri = context.getPackageManager()
                .resolveActivity(home, PackageManager.MATCH_DEFAULT_ONLY);
        return ri != null && ri.activityInfo != null
                && context.getPackageName().equals(ri.activityInfo.packageName);
    }
}
