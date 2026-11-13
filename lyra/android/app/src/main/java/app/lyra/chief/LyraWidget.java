package app.lyra.chief;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Base64;
import android.widget.RemoteViews;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;

/**
 * The home-screen widget: Lyra's avatar, its status (what it's doing, what's ready,
 * what's next) and the latest thing it posted on its own. The app sends the words
 * (LyraWidget.update) whenever they change; tapping the widget opens Lyra.
 */
public class LyraWidget extends AppWidgetProvider {

    static final String PREFS = "lyra_widget";
    static final String AVATAR = "widget_avatar.png";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) manager.updateAppWidget(id, views(context));
    }

    static RemoteViews views(Context c) {
        SharedPreferences p = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.lyra_widget);
        v.setTextViewText(R.id.widget_status, p.getString("status", "Here when you need me"));
        v.setTextViewText(R.id.widget_detail, p.getString("detail", "Tap to talk to Lyra"));
        File f = new File(c.getFilesDir(), AVATAR);
        Bitmap b = f.exists() ? BitmapFactory.decodeFile(f.getPath()) : null;
        if (b != null) v.setImageViewBitmap(R.id.widget_avatar, b);
        Intent open = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
        v.setOnClickPendingIntent(R.id.widget_root, PendingIntent.getActivity(c, 1, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        Intent talk = new Intent(c, MainActivity.class)
            .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP)
            .putExtra(ListenPlugin.CAPTURE, "quick");
        v.setOnClickPendingIntent(R.id.widget_mic, PendingIntent.getActivity(c, 2, talk, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        return v;
    }

    static void refresh(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        int[] ids = m.getAppWidgetIds(new ComponentName(c, LyraWidget.class));
        for (int id : ids) m.updateAppWidget(id, views(c));
    }

    @CapacitorPlugin(name = "LyraWidget")
    public static class WidgetPlugin extends Plugin {

        @PluginMethod
        public void update(PluginCall call) {
            Context c = getContext();
            SharedPreferences.Editor e = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
            String status = call.getString("status");
            String detail = call.getString("detail");
            if (status != null) e.putString("status", status.length() > 60 ? status.substring(0, 60) : status);
            if (detail != null) e.putString("detail", detail.length() > 200 ? detail.substring(0, 200) : detail);
            e.apply();
            String avatar = call.getString("avatar");
            if (avatar != null) {
                try (FileOutputStream out = new FileOutputStream(new File(c.getFilesDir(), AVATAR))) {
                    byte[] png = Base64.decode(avatar.replaceFirst("^data:image/png;base64,", ""), Base64.DEFAULT);
                    // a small square picture only
                    if (png.length < 400_000) out.write(png);
                } catch (Exception ignored) {
                    // keeps the previous avatar
                }
            }
            refresh(c);
            // the Keep watch notification says the same thing
            KeepWatchService.refresh(c);
            call.resolve();
        }
    }
}
