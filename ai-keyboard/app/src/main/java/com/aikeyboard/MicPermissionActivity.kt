package com.aikeyboard

import android.Manifest
import android.app.Activity
import android.content.pm.PackageManager
import android.os.Bundle
import android.widget.Toast

/**
 * Invisible screen that asks for microphone permission. A keyboard can't show the permission
 * prompt itself, so it opens this when the mic button is tapped for the first time.
 */
class MicPermissionActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            finish()
            return
        }
        requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), 1)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        val granted = grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED
        Toast.makeText(
            this,
            if (granted) "Microphone on — tap the mic again to talk" else "Microphone is needed to teach mistakes by voice",
            Toast.LENGTH_LONG,
        ).show()
        finish()
    }
}
