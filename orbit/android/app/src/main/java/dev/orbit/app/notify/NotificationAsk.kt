package dev.orbit.app.notify

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import androidx.core.content.edit

/**
 * Asks once for permission to post notifications, at the moment it makes sense: right after the first
 * message is sent, so a reply can ping you if you leave. Returns a function to call on send.
 */
@Composable
fun rememberNotificationAsk(): () -> Unit {
    if (Build.VERSION.SDK_INT < 33) return {}
    val context = LocalContext.current
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {}
    return remember(context, launcher) {
        {
            val prefs = context.getSharedPreferences("orbit-ui", Context.MODE_PRIVATE)
            val granted = ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
            if (!granted && !prefs.getBoolean(ASKED, false)) {
                prefs.edit { putBoolean(ASKED, true) }
                launcher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
    }
}

private const val ASKED = "askedNotifications"
