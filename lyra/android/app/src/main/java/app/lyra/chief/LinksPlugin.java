package app.lyra.chief;

import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Opens a sign-in page (Spotify's) in the phone's browser. The page sends the user back
 * to Lyra through the app.lyra.chief://spotify link, which the app picks up.
 */
@CapacitorPlugin(name = "LyraLinks")
public class LinksPlugin extends Plugin {

    @PluginMethod
    public void open(PluginCall call) {
        String url = call.getString("url", "");
        // only Spotify's own sign-in page
        if (!url.startsWith("https://accounts.spotify.com/")) {
            call.reject("Not a sign-in page Lyra opens.");
            return;
        }
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        call.resolve();
    }
}
