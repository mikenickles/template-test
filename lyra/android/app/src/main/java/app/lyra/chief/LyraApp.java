package app.lyra.chief;

import android.app.Application;
import android.util.Log;

/** Starts push (when it's been set up) as soon as Android starts Lyra, including for a message that arrives while it's closed. */
public class LyraApp extends Application {

    @Override
    public void onCreate() {
        super.onCreate();
        try {
            PushPlugin.start(this);
        } catch (Exception e) {
            Log.w("Lyra", "push didn't start", e);
        }
    }
}
