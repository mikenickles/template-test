package app.lyra.chief;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.speech.RecognizerIntent;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;

/**
 * Voice input through Android's own speech recognizer (the "Speak now" sheet).
 * Android does the listening and hands back text, so Lyra never holds the
 * microphone and needs no audio permission.
 */
@CapacitorPlugin(name = "Speech")
public class SpeechPlugin extends Plugin {

    @PluginMethod
    public void listen(PluginCall call) {
        Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        i.putExtra(RecognizerIntent.EXTRA_PROMPT, call.getString("prompt", "Speak to Lyra"));
        i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        try {
            startActivityForResult(call, i, "heard");
        } catch (ActivityNotFoundException e) {
            call.reject("This phone has no speech recognition. Install or turn on Google's voice typing.", "UNAVAILABLE");
        }
    }

    @ActivityCallback
    private void heard(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject r = new JSObject();
        String text = "";
        if (result.getResultCode() == Activity.RESULT_OK && result.getData() != null) {
            ArrayList<String> out = result.getData().getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
            if (out != null && !out.isEmpty()) text = out.get(0);
        }
        r.put("text", text);
        call.resolve(r);
    }
}
