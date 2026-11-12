package app.lyra.chief;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Lyra's own native plugin: Google sign-in through Play services.
        registerPlugin(GoogleAuthPlugin.class);
        // and installing updates from your Drive (Android asks you to confirm each one)
        registerPlugin(ApkInstallerPlugin.class);
        // things shared to Lyra from other apps
        registerPlugin(ShareTargetPlugin.class);
        // keeping watch in the background (routines, heads-ups) when you turn it on
        registerPlugin(BackgroundPlugin.class);
        // the home-screen widget's words
        registerPlugin(LyraWidget.WidgetPlugin.class);
        // looking a name up in your contacts, when you allow it
        registerPlugin(ContactsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
