package app.lyra.chief;

import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Opens a sign-in page (Spotify's) in the phone's browser (the page sends the user back
 * to Lyra through the app.lyra.chief://spotify link), directions in Google Maps, and a
 * text ready to send in the phone's messaging app. Nothing else.
 */
@CapacitorPlugin(name = "LyraLinks")
public class LinksPlugin extends Plugin {

    @PluginMethod
    public void open(PluginCall call) {
        String url = call.getString("url", "");
        // only Spotify's own sign-in page, and directions (leave-now nudges)
        if (!url.startsWith("https://accounts.spotify.com/") && !url.startsWith("https://www.google.com/maps/dir/")) {
            call.reject("Not a sign-in page Lyra opens.");
            return;
        }
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        call.resolve();
    }

    /** A text in the messaging app, ready to send. The user sends it there; Lyra never sends texts. */
    @PluginMethod
    public void sms(PluginCall call) {
        String number = call.getString("number", "").replaceAll("[^0-9+]", "");
        String body = call.getString("body", "");
        if (number.length() < 3) {
            call.reject("No phone number.");
            return;
        }
        Intent i = new Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:" + Uri.encode(number)));
        i.putExtra("sms_body", body);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(i);
            call.resolve();
        } catch (android.content.ActivityNotFoundException e) {
            call.reject("There's no messaging app on this phone.");
        }
    }
}
