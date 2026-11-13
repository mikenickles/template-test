package app.lyra.chief;

import android.Manifest;
import android.content.Intent;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.ArrayList;

/**
 * Quick capture and voice memos, with the phone's own speech recognition (free, and on the
 * device where the phone supports it). Quick mode stops when you pause; memo mode keeps going,
 * one sentence after another, until you tap Done. The words stream to the app as you speak.
 *
 * Also hands the app a "capture" request from the Quick Settings tile or the widget's mic.
 */
@CapacitorPlugin(name = "LyraListen", permissions = { @Permission(alias = "mic", strings = { Manifest.permission.RECORD_AUDIO }) })
public class ListenPlugin extends Plugin {

    static final String CAPTURE = "lyra_capture";

    private SpeechRecognizer rec;
    private boolean memo;
    private boolean stopping;
    private final StringBuilder said = new StringBuilder();

    @Override
    public void load() {
        deliver(getActivity() != null ? getActivity().getIntent() : null);
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        deliver(intent);
    }

    /** Opened from the tile or the widget's mic: tell the app to show the capture sheet. */
    private void deliver(Intent intent) {
        if (intent == null || !intent.hasExtra(CAPTURE)) return;
        JSObject o = new JSObject();
        o.put("mode", intent.getStringExtra(CAPTURE));
        intent.removeExtra(CAPTURE);
        notifyListeners("capture", o, true);
    }

    @PluginMethod
    public void available(PluginCall call) {
        JSObject r = new JSObject();
        r.put("available", SpeechRecognizer.isRecognitionAvailable(getContext()));
        call.resolve(r);
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (getPermissionState("mic") != PermissionState.GRANTED) {
            requestPermissionForAlias("mic", call, "micAnswered");
            return;
        }
        begin(call);
    }

    @PermissionCallback
    private void micAnswered(PluginCall call) {
        if (getPermissionState("mic") != PermissionState.GRANTED) {
            call.reject("Lyra needs the microphone to hear you. You can allow it in Android's settings for Lyra.");
            return;
        }
        begin(call);
    }

    private void begin(PluginCall call) {
        if (!SpeechRecognizer.isRecognitionAvailable(getContext())) {
            call.reject("This phone doesn't have speech recognition. Type it instead.");
            return;
        }
        memo = call.getBoolean("memo", false);
        stopping = false;
        said.setLength(0);
        getActivity().runOnUiThread(() -> {
            if (rec != null) rec.destroy();
            rec = SpeechRecognizer.createSpeechRecognizer(getContext());
            rec.setRecognitionListener(listener);
            listen();
            call.resolve();
        });
    }

    private void listen() {
        Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            .putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            .putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true);
        // a memo lets you pause to think
        if (memo) i.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 4000L);
        rec.startListening(i);
    }

    /** Done: whatever was heard is final. */
    @PluginMethod
    public void stop(PluginCall call) {
        stopping = true;
        getActivity().runOnUiThread(() -> {
            if (rec != null) rec.stopListening();
            call.resolve();
        });
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        stopping = true;
        getActivity().runOnUiThread(() -> {
            if (rec != null) rec.destroy();
            rec = null;
            call.resolve();
        });
    }

    private void emit(String partial, boolean done) {
        JSObject o = new JSObject();
        String text = (said + (partial.isEmpty() ? "" : (said.length() > 0 ? " " : "") + partial)).trim();
        o.put("text", text);
        o.put("done", done);
        notifyListeners("words", o);
    }

    private final RecognitionListener listener = new RecognitionListener() {
        @Override public void onReadyForSpeech(Bundle b) {}
        @Override public void onBeginningOfSpeech() {}
        @Override public void onRmsChanged(float v) {}
        @Override public void onBufferReceived(byte[] b) {}
        @Override public void onEndOfSpeech() {}
        @Override public void onEvent(int t, Bundle b) {}

        @Override
        public void onPartialResults(Bundle b) {
            ArrayList<String> r = b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
            if (r != null && !r.isEmpty()) emit(r.get(0), false);
        }

        @Override
        public void onResults(Bundle b) {
            ArrayList<String> r = b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
            if (r != null && !r.isEmpty() && !r.get(0).trim().isEmpty()) said.append(said.length() > 0 ? " " : "").append(r.get(0).trim());
            // a memo carries on after each sentence until Done
            if (memo && !stopping) {
                emit("", false);
                listen();
            } else emit("", true);
        }

        @Override
        public void onError(int code) {
            // a pause with nothing said, in a memo: just keep listening
            if (memo && !stopping && (code == SpeechRecognizer.ERROR_NO_MATCH || code == SpeechRecognizer.ERROR_SPEECH_TIMEOUT)) {
                listen();
                return;
            }
            if (said.length() > 0 || code == SpeechRecognizer.ERROR_NO_MATCH || code == SpeechRecognizer.ERROR_SPEECH_TIMEOUT) {
                emit("", true);
                return;
            }
            JSObject o = new JSObject();
            o.put("error", code == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS ? "Lyra needs the microphone." : code == SpeechRecognizer.ERROR_NETWORK || code == SpeechRecognizer.ERROR_NETWORK_TIMEOUT ? "Speech recognition needs the internet on this phone." : "Didn't catch that. Try again.");
            notifyListeners("words", o);
        }
    };

    @Override
    protected void handleOnDestroy() {
        if (rec != null) rec.destroy();
        rec = null;
    }
}
