package app.lyra.chief;

import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;
import org.json.JSONArray;

/**
 * Push from the home base arrives here, even with Lyra closed. The message is data only, so
 * Lyra draws the notification itself: tapping it opens the chat it's about, and its buttons
 * (Lyra's suggested next steps, like "Draft a reply") open that chat and send that step.
 */
public class LyraMessagingService extends FirebaseMessagingService {

    static final String HASH = "lyra_hash";
    static final String SAY = "lyra_say";
    static final String NOTIF = "lyra_notif";

    @Override
    public void onMessageReceived(RemoteMessage message) {
        Map<String, String> d = message.getData();
        String title = d.get("title");
        if (title == null) return;
        String[] options = new String[0];
        try {
            JSONArray a = new JSONArray(d.getOrDefault("options", "[]"));
            options = new String[Math.min(a.length(), 3)];
            for (int i = 0; i < options.length; i++) options[i] = a.getString(i);
        } catch (Exception ignored) {
            // no buttons, then
        }
        show(this, title, d.getOrDefault("body", ""), d.getOrDefault("hash", "#/"), options);
    }

    /** The phone signs up again each time Lyra starts, so a new address reaches the home base then. */
    @Override
    public void onNewToken(String token) {}

    static void show(Context c, String title, String body, String hash, String[] options) {
        if (!NotificationManagerCompat.from(c).areNotificationsEnabled()) return;
        PushPlugin.channel(c);
        int id = (int) (System.currentTimeMillis() % 1_000_000) + 400_000;
        NotificationCompat.Builder b = new NotificationCompat.Builder(c, PushPlugin.CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_lyra)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(open(c, id, 0, hash, null));
        for (int i = 0; i < options.length; i++) {
            if (options[i] == null || options[i].isEmpty()) continue;
            b.addAction(0, options[i], open(c, id, i + 1, hash, options[i]));
        }
        try {
            c.getSystemService(NotificationManager.class).notify(id, b.build());
        } catch (SecurityException ignored) {
            // notifications were turned off just now
        }
    }

    /** Opens Lyra at that chat; with a step, sends it there as the user's message. */
    private static PendingIntent open(Context c, int id, int n, String hash, String say) {
        Intent i = new Intent(c, MainActivity.class)
            .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP)
            .putExtra(HASH, hash)
            .putExtra(NOTIF, id);
        if (say != null) i.putExtra(SAY, say);
        // a distinct request code per button, or Android would hand every button the same intent
        return PendingIntent.getActivity(c, id * 4 + n, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }
}
