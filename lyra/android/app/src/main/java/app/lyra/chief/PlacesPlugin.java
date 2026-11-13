package app.lyra.chief;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.location.Address;
import android.location.Geocoder;
import android.location.Location;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.android.gms.location.Geofence;
import com.google.android.gms.location.GeofencingClient;
import com.google.android.gms.location.GeofencingEvent;
import com.google.android.gms.location.GeofencingRequest;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Where you are, only when you've allowed it:
 *  - place reminders ("when I get to Costco"): Android's geofences, which cost almost no battery
 *    and fire with Lyra closed; the reminder is shown right here, then the app hears about it;
 *  - leave-now nudges: where you are now, once, when Lyra works out travel time to an event;
 *  - finding a place by name or address, with the phone's own geocoder.
 */
@CapacitorPlugin(
    name = "LyraPlaces",
    permissions = {
        @Permission(alias = "location", strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }),
        @Permission(alias = "background", strings = { Manifest.permission.ACCESS_BACKGROUND_LOCATION }),
    }
)
public class PlacesPlugin extends Plugin {

    static final String PREFS = "lyra_places";
    static final String CHANNEL = "lyra_places";

    /** "none", "while-open" or "always" (place reminders need "always": they fire with Lyra closed). */
    private String access() {
        if (getPermissionState("location") != PermissionState.GRANTED) return "none";
        if (Build.VERSION.SDK_INT < 29) return "always";
        return getPermissionState("background") == PermissionState.GRANTED ? "always" : "while-open";
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject r = new JSObject();
        r.put("access", access());
        call.resolve(r);
    }

    /** Ask for location (and, with always: true, for "Allow all the time", which Android shows in its own settings). */
    @PluginMethod
    public void allow(PluginCall call) {
        if (getPermissionState("location") != PermissionState.GRANTED) requestPermissionForAlias("location", call, "answered");
        else answered(call);
    }

    @PermissionCallback
    private void answered(PluginCall call) {
        if (getPermissionState("location") == PermissionState.GRANTED && call.getBoolean("always", false) && Build.VERSION.SDK_INT >= 29 && getPermissionState("background") != PermissionState.GRANTED) {
            requestPermissionForAlias("background", call, "answeredAlways");
            return;
        }
        status(call);
    }

    @PermissionCallback
    private void answeredAlways(PluginCall call) {
        status(call);
    }

    /** Where the phone is now (one reading, then nothing). */
    @SuppressLint("MissingPermission")
    @PluginMethod
    public void here(PluginCall call) {
        if (getPermissionState("location") != PermissionState.GRANTED) {
            call.reject("Location isn't allowed.");
            return;
        }
        LocationServices.getFusedLocationProviderClient(getContext())
            .getCurrentLocation(Priority.PRIORITY_BALANCED_POWER_ACCURACY, null)
            .addOnSuccessListener((Location l) -> {
                if (l == null) {
                    call.reject("Couldn't tell where you are right now.");
                    return;
                }
                JSObject r = new JSObject();
                r.put("lat", l.getLatitude());
                r.put("lng", l.getLongitude());
                call.resolve(r);
            })
            .addOnFailureListener((e) -> call.reject("Couldn't tell where you are right now."));
    }

    /** A place by name or address, nearest to `near` when given ("Costco" finds the one close by). */
    @PluginMethod
    public void find(PluginCall call) {
        String q = call.getString("query", "").trim();
        if (q.isEmpty() || !Geocoder.isPresent()) {
            call.resolve(new JSObject().put("places", new JSArray()));
            return;
        }
        Double lat = call.getDouble("lat");
        Double lng = call.getDouble("lng");
        new Thread(() -> {
            JSArray out = new JSArray();
            try {
                Geocoder g = new Geocoder(getContext(), Locale.getDefault());
                List<Address> list;
                if (lat != null && lng != null) {
                    // about 40 km around you first
                    list = g.getFromLocationName(q, 5, lat - 0.35, lng - 0.45, lat + 0.35, lng + 0.45);
                    if (list == null || list.isEmpty()) list = g.getFromLocationName(q, 5);
                } else list = g.getFromLocationName(q, 5);
                if (list != null) for (Address a : list) {
                    JSObject o = new JSObject();
                    o.put("lat", a.getLatitude());
                    o.put("lng", a.getLongitude());
                    StringBuilder label = new StringBuilder();
                    for (int i = 0; i <= a.getMaxAddressLineIndex(); i++) label.append(i > 0 ? ", " : "").append(a.getAddressLine(i));
                    o.put("label", label.toString());
                    out.put(o);
                }
            } catch (Exception ignored) {
                // no network, or nothing found: an empty list
            }
            call.resolve(new JSObject().put("places", out));
        }).start();
    }

    /**
     * Replace all of Lyra's geofences with this list (the app's pending place reminders). Each
     * is {id, text, lat, lng, radius, on: "arrive"|"leave"}; the text is shown when it fires.
     */
    @SuppressLint("MissingPermission")
    @PluginMethod
    public void fences(PluginCall call) {
        Context c = getContext();
        GeofencingClient client = LocationServices.getGeofencingClient(c);
        JSArray list = call.getArray("list", new JSArray());
        SharedPreferences.Editor e = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
        client.removeGeofences(pending(c)).addOnCompleteListener((t) -> {
            List<Geofence> fences = new ArrayList<>();
            try {
                for (int i = 0; i < list.length() && i < 90; i++) {
                    JSONObject f = list.getJSONObject(i);
                    String id = "place-" + f.getInt("id");
                    e.putString(id, f.toString());
                    fences.add(new Geofence.Builder()
                        .setRequestId(id)
                        .setCircularRegion(f.getDouble("lat"), f.getDouble("lng"), (float) Math.max(100, f.optDouble("radius", 150)))
                        .setExpirationDuration(Geofence.NEVER_EXPIRE)
                        .setTransitionTypes("leave".equals(f.optString("on")) ? Geofence.GEOFENCE_TRANSITION_EXIT : Geofence.GEOFENCE_TRANSITION_ENTER)
                        .build());
                }
            } catch (Exception ex) {
                call.reject("Those places couldn't be set.");
                return;
            }
            e.apply();
            if (fences.isEmpty() || !"always".equals(access())) {
                call.resolve(new JSObject().put("set", 0));
                return;
            }
            GeofencingRequest req = new GeofencingRequest.Builder()
                .setInitialTrigger(0) // not for being there already when it's set
                .addGeofences(fences)
                .build();
            client.addGeofences(req, pending(c))
                .addOnSuccessListener((v) -> call.resolve(new JSObject().put("set", fences.size())))
                .addOnFailureListener((ex) -> call.reject("Android didn't accept the place reminders. Is location on?"));
        });
    }

    /** Place reminders that went off since the app last asked (it marks them done and posts them). */
    @PluginMethod
    public void fired(PluginCall call) {
        SharedPreferences p = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String raw = p.getString("fired", "[]");
        p.edit().putString("fired", "[]").apply();
        JSArray out;
        try {
            out = new JSArray(raw);
        } catch (Exception e) {
            out = new JSArray();
        }
        call.resolve(new JSObject().put("ids", out));
    }

    static PendingIntent pending(Context c) {
        Intent i = new Intent(c, FenceReceiver.class);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
        return PendingIntent.getBroadcast(c, 0, i, flags);
    }

    /** A geofence went off: show the reminder now (Lyra may be closed) and note it for the app. */
    public static class FenceReceiver extends BroadcastReceiver {
        @Override
        public void onReceive(Context c, Intent intent) {
            GeofencingEvent ev = GeofencingEvent.fromIntent(intent);
            if (ev == null || ev.hasError() || ev.getTriggeringGeofences() == null) return;
            SharedPreferences p = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            List<String> done = new ArrayList<>();
            for (Geofence g : ev.getTriggeringGeofences()) {
                String raw = p.getString(g.getRequestId(), null);
                if (raw == null) continue;
                try {
                    JSONObject f = new JSONObject(raw);
                    show(c, f.getInt("id"), f.optString("place", "a place"), f.optString("text", ""), "leave".equals(f.optString("on")));
                    JSONArray fired = new JSONArray(p.getString("fired", "[]"));
                    fired.put(f.getInt("id"));
                    p.edit().putString("fired", fired.toString()).remove(g.getRequestId()).apply();
                    done.add(g.getRequestId());
                } catch (Exception ignored) {
                    // a broken entry: skip it
                }
            }
            // each reminder goes off once
            if (!done.isEmpty()) LocationServices.getGeofencingClient(c).removeGeofences(done);
        }
    }

    static void show(Context c, int id, String place, String text, boolean leaving) {
        if (!NotificationManagerCompat.from(c).areNotificationsEnabled()) return;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null)
            nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Place reminders", NotificationManager.IMPORTANCE_HIGH));
        Intent open = new Intent(c, MainActivity.class)
            .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP)
            .putExtra(LyraMessagingService.HASH, "#/");
        NotificationCompat.Builder b = new NotificationCompat.Builder(c, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_lyra)
            .setContentTitle((leaving ? "Leaving " : "At ") + place)
            .setContentText(text)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(PendingIntent.getActivity(c, 900_000 + id, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        try {
            nm.notify(900_000 + id, b.build());
        } catch (SecurityException ignored) {
            // notifications are off
        }
    }
}
