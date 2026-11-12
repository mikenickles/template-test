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
        // voice input, and things shared to Lyra from other apps
        registerPlugin(SpeechPlugin.class);
        registerPlugin(ShareTargetPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
