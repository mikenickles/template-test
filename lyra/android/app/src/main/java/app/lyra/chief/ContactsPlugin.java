package app.lyra.chief;

import android.Manifest;
import android.content.ContentResolver;
import android.database.Cursor;
import android.provider.ContactsContract;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;

/**
 * Looks a name up in the phone's contacts, only when Lyra asks for one person
 * (never a full copy of the address book). Read-only; Android asks the user first.
 */
@CapacitorPlugin(name = "LyraContacts", permissions = { @Permission(alias = "contacts", strings = { Manifest.permission.READ_CONTACTS }) })
public class ContactsPlugin extends Plugin {

    @PluginMethod
    public void allow(PluginCall call) {
        if (getPermissionState("contacts") == PermissionState.GRANTED) {
            JSObject r = new JSObject();
            r.put("allowed", true);
            call.resolve(r);
        } else requestPermissionForAlias("contacts", call, "allowed");
    }

    @PermissionCallback
    private void allowed(PluginCall call) {
        JSObject r = new JSObject();
        r.put("allowed", getPermissionState("contacts") == PermissionState.GRANTED);
        call.resolve(r);
    }

    @PluginMethod
    public void find(PluginCall call) {
        String q = call.getString("name", "").trim();
        JSObject out = new JSObject();
        JSArray list = new JSArray();
        if (q.isEmpty() || getPermissionState("contacts") != PermissionState.GRANTED) {
            out.put("contacts", list);
            call.resolve(out);
            return;
        }
        ContentResolver cr = getContext().getContentResolver();
        Map<Long, String> names = new LinkedHashMap<>();
        try (Cursor c = cr.query(
            ContactsContract.Contacts.CONTENT_URI,
            new String[] { ContactsContract.Contacts._ID, ContactsContract.Contacts.DISPLAY_NAME_PRIMARY },
            ContactsContract.Contacts.DISPLAY_NAME_PRIMARY + " LIKE ?",
            new String[] { "%" + q.replace("%", "").replace("_", "") + "%" },
            ContactsContract.Contacts.DISPLAY_NAME_PRIMARY + " LIMIT 5"
        )) {
            while (c != null && c.moveToNext()) names.put(c.getLong(0), c.getString(1));
        }
        for (Map.Entry<Long, String> e : names.entrySet()) {
            JSObject o = new JSObject();
            o.put("name", e.getValue());
            o.put("emails", values(cr, ContactsContract.CommonDataKinds.Email.CONTENT_URI, ContactsContract.CommonDataKinds.Email.ADDRESS, ContactsContract.CommonDataKinds.Email.CONTACT_ID, e.getKey()));
            o.put("phones", values(cr, ContactsContract.CommonDataKinds.Phone.CONTENT_URI, ContactsContract.CommonDataKinds.Phone.NUMBER, ContactsContract.CommonDataKinds.Phone.CONTACT_ID, e.getKey()));
            list.put(o);
        }
        out.put("contacts", list);
        call.resolve(out);
    }

    private static JSArray values(ContentResolver cr, android.net.Uri uri, String column, String idColumn, long id) {
        Set<String> seen = new LinkedHashSet<>();
        try (Cursor c = cr.query(uri, new String[] { column }, idColumn + " = ?", new String[] { String.valueOf(id) }, null)) {
            while (c != null && c.moveToNext() && seen.size() < 5) {
                String v = c.getString(0);
                if (v != null && !v.isEmpty()) seen.add(v);
            }
        }
        JSArray a = new JSArray();
        for (String v : seen) a.put(v);
        return a;
    }
}
