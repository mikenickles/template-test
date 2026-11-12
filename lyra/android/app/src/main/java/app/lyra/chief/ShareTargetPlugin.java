package app.lyra.chief;

import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Base64;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.ArrayList;

/**
 * "Share to Lyra" from other apps: text, links, photos and PDFs. What was shared
 * waits here until the app asks for it with take(); nothing is sent anywhere
 * until the user presses Send in the chat.
 */
@CapacitorPlugin(name = "ShareTarget")
public class ShareTargetPlugin extends Plugin {

    private static final int MAX_BYTES = 12 * 1024 * 1024;
    private static final int MAX_FILES = 4;
    private JSObject pending;

    @Override
    public void load() {
        read(getActivity().getIntent());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        if (read(intent)) notifyListeners("shared", new JSObject(), true);
    }

    @PluginMethod
    public void take(PluginCall call) {
        JSObject r = pending != null ? pending : new JSObject();
        pending = null;
        call.resolve(r);
    }

    private boolean read(Intent intent) {
        if (intent == null) return false;
        String action = intent.getAction();
        if (!Intent.ACTION_SEND.equals(action) && !Intent.ACTION_SEND_MULTIPLE.equals(action)) return false;
        JSObject out = new JSObject();
        String text = intent.getStringExtra(Intent.EXTRA_TEXT);
        String subject = intent.getStringExtra(Intent.EXTRA_SUBJECT);
        if (text != null && !text.isEmpty()) out.put("text", subject != null && !subject.isEmpty() && !text.contains(subject) ? subject + "\n" + text : text);

        ArrayList<Uri> uris = new ArrayList<>();
        if (Intent.ACTION_SEND_MULTIPLE.equals(action)) {
            ArrayList<Uri> many = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (many != null) uris.addAll(many);
        } else {
            Uri one = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (one != null) uris.add(one);
        }
        JSArray files = new JSArray();
        int skipped = 0;
        for (Uri uri : uris) {
            if (files.length() >= MAX_FILES) {
                skipped++;
                continue;
            }
            JSObject f = file(uri);
            if (f != null) files.put(f);
            else skipped++;
        }
        out.put("files", files);
        out.put("skipped", skipped);
        pending = out;
        // so a later restart of the activity doesn't deliver the same share twice
        intent.setAction(Intent.ACTION_MAIN);
        intent.removeExtra(Intent.EXTRA_STREAM);
        intent.removeExtra(Intent.EXTRA_TEXT);
        return true;
    }

    private JSObject file(Uri uri) {
        ContentResolver cr = getContext().getContentResolver();
        try (InputStream in = cr.openInputStream(uri)) {
            if (in == null) return null;
            ByteArrayOutputStream buf = new ByteArrayOutputStream();
            byte[] chunk = new byte[64 * 1024];
            int n;
            while ((n = in.read(chunk)) > 0) {
                buf.write(chunk, 0, n);
                if (buf.size() > MAX_BYTES) return null;
            }
            String name = "shared";
            try (Cursor c = cr.query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
                if (c != null && c.moveToFirst() && !c.isNull(0)) name = c.getString(0);
            } catch (Exception ignored) {
                // a name is a nicety
            }
            String type = cr.getType(uri);
            JSObject f = new JSObject();
            f.put("name", name);
            f.put("mediaType", type != null ? type : "application/octet-stream");
            f.put("data", Base64.encodeToString(buf.toByteArray(), Base64.NO_WRAP));
            return f;
        } catch (Exception e) {
            return null;
        }
    }
}
