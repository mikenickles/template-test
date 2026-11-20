package dev.orbit.app.update

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import androidx.core.content.FileProvider
import dev.orbit.app.data.isNewerVersion
import java.io.File

/** Hands a downloaded Orbit update to Android's installer. Android asks the user to confirm; no app can skip that. */
object ApkInstaller {
    private const val MIME = "application/vnd.android.package-archive"

    fun file(context: Context) = File(context.cacheDir, "updates/orbit-update.apk")

    /** The version of Orbit installed on this phone. */
    fun installedVersion(context: Context): String =
        runCatching { context.packageManager.getPackageInfo(context.packageName, 0).versionName }.getOrNull().orEmpty()

    /** Android makes the user allow each app to install other apps, once, in a settings screen. */
    fun canInstall(context: Context) = context.packageManager.canRequestPackageInstalls()

    fun openPermissionSettings(context: Context) {
        context.startActivity(
            Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
    }

    /** Null if [file] is an Orbit app newer than this one; otherwise what is wrong with it. */
    fun problem(context: Context, file: File): String? {
        val archive = context.packageManager.getPackageArchiveInfo(file.path, 0)
            ?: return "The download isn't an app. Try again."
        if (archive.packageName != context.packageName) return "That file isn't an Orbit update."
        if (!isNewerVersion(archive.versionName.orEmpty(), installedVersion(context))) return "That update isn't newer than this version."
        return null
    }

    fun install(context: Context, file: File) {
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.files", file)
        context.startActivity(
            Intent(Intent.ACTION_VIEW)
                .setDataAndType(uri, MIME)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK),
        )
    }

    /** Removes an old download. A fresh one may still be open in Android's installer, so it is left alone. */
    fun cleanUp(context: Context) {
        val file = file(context)
        if (file.exists() && System.currentTimeMillis() - file.lastModified() > 60 * 60 * 1000) file.delete()
    }
}
