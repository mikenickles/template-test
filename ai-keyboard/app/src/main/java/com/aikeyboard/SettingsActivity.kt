package com.aikeyboard

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import android.view.inputmethod.InputMethodManager
import android.widget.Button
import android.widget.EditText
import android.widget.RadioGroup
import android.widget.Switch
import android.widget.TextView
import android.widget.Toast

class SettingsActivity : Activity() {

    private lateinit var prefs: Prefs
    private lateinit var apiKey: EditText
    private lateinit var mistakes: EditText
    private lateinit var autoCheck: Switch
    private lateinit var autoApply: Switch
    private lateinit var model: RadioGroup
    private lateinit var setupStatus: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_settings)
        prefs = Prefs(this)

        apiKey = findViewById(R.id.apiKey)
        mistakes = findViewById(R.id.mistakes)
        autoCheck = findViewById(R.id.autoCheck)
        autoApply = findViewById(R.id.autoApply)
        model = findViewById(R.id.model)
        setupStatus = findViewById(R.id.setupStatus)

        apiKey.setText(prefs.apiKey)
        mistakes.setText(prefs.commonMistakes)
        autoCheck.isChecked = prefs.autoCheck
        autoApply.isChecked = prefs.autoApply
        model.check(
            when (prefs.model) {
                Models.SONNET -> R.id.modelSonnet
                Models.HAIKU -> R.id.modelHaiku
                else -> R.id.modelOpus
            }
        )

        findViewById<Button>(R.id.enableKeyboard).setOnClickListener {
            startActivity(Intent(Settings.ACTION_INPUT_METHOD_SETTINGS))
        }
        findViewById<Button>(R.id.pickKeyboard).setOnClickListener {
            getSystemService(InputMethodManager::class.java).showInputMethodPicker()
        }
        findViewById<Button>(R.id.save).setOnClickListener {
            save()
            Toast.makeText(this, "Saved", Toast.LENGTH_SHORT).show()
        }
    }

    override fun onResume() {
        super.onResume()
        updateSetupStatus()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        // Refresh after the keyboard picker dialog closes.
        if (hasFocus) updateSetupStatus()
    }

    override fun onPause() {
        save()
        super.onPause()
    }

    private fun save() {
        prefs.apiKey = apiKey.text.toString()
        prefs.commonMistakes = mistakes.text.toString()
        prefs.autoCheck = autoCheck.isChecked
        prefs.autoApply = autoApply.isChecked
        prefs.model = when (model.checkedRadioButtonId) {
            R.id.modelSonnet -> Models.SONNET
            R.id.modelHaiku -> Models.HAIKU
            else -> Models.OPUS
        }
    }

    private fun updateSetupStatus() {
        val imm = getSystemService(InputMethodManager::class.java)
        val enabled = imm.enabledInputMethodList.any { it.packageName == packageName }
        val current = Settings.Secure.getString(contentResolver, Settings.Secure.DEFAULT_INPUT_METHOD)
            ?.startsWith("$packageName/") == true
        setupStatus.text = when {
            current -> "✓ AI Keyboard is your current keyboard"
            enabled -> "Enabled — now tap \"Switch to AI Keyboard\""
            else -> "Not enabled yet"
        }
    }
}
