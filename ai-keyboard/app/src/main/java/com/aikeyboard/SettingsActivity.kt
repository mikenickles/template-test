package com.aikeyboard

import android.app.Activity
import android.content.Intent
import android.content.ActivityNotFoundException
import android.os.Bundle
import android.provider.Settings
import android.speech.RecognizerIntent
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.widget.LinearLayout
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
    private lateinit var teachButton: Button
    private val corrector = Corrector()

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
        teachButton = findViewById(R.id.teachByVoice)
        teachButton.setOnClickListener { startVoice() }

        findViewById<Button>(R.id.save).setOnClickListener {
            save()
            Toast.makeText(this, "Saved", Toast.LENGTH_SHORT).show()
        }
    }

    override fun onResume() {
        super.onResume()
        updateSetupStatus()
        showLearned()
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

    // ---- Teaching by voice ------------------------------------------------------------------

    private fun startVoice() {
        save() // Make sure the API key just typed is used.
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            .putExtra(RecognizerIntent.EXTRA_PROMPT, "Say a mistake you make when typing")
        try {
            @Suppress("DEPRECATION")
            startActivityForResult(intent, REQUEST_VOICE)
        } catch (e: ActivityNotFoundException) {
            Toast.makeText(this, "Voice input isn't available on this phone", Toast.LENGTH_LONG).show()
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        @Suppress("DEPRECATION")
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != REQUEST_VOICE || resultCode != RESULT_OK) return
        val spoken = data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull()
        if (spoken.isNullOrBlank()) return

        teachButton.isEnabled = false
        teachButton.text = "Learning…"
        Thread {
            val result = corrector.learn(spoken, prefs)
            if (result is LearnResult.Learned) prefs.learned = result.rules
            runOnUiThread {
                teachButton.isEnabled = true
                teachButton.text = "Tell it a mistake"
                val message = when (result) {
                    is LearnResult.Learned -> result.reply
                    is LearnResult.Error -> result.message
                }
                Toast.makeText(this, message, Toast.LENGTH_LONG).show()
                showLearned()
            }
        }.start()
    }

    /** Lists what the keyboard has learned, each with a way to remove it. */
    private fun showLearned() {
        val rules = prefs.learned
        val swaps = findViewById<LinearLayout>(R.id.swapsList)
        val notes = findViewById<LinearLayout>(R.id.notesList)
        swaps.removeAllViews()
        notes.removeAllViews()

        rules.replacements.forEach { (typo, correct) ->
            swaps.addView(ruleRow("$typo  →  $correct") {
                prefs.learned = prefs.learned.let { it.copy(replacements = it.replacements - typo) }
                showLearned()
            })
        }
        rules.notes.forEach { note ->
            notes.addView(ruleRow(note) {
                prefs.learned = prefs.learned.let { it.copy(notes = it.notes - note) }
                showLearned()
            })
        }
        if (rules.replacements.isEmpty()) swaps.addView(emptyRow("Nothing yet"))
        if (rules.notes.isEmpty()) notes.addView(emptyRow("Nothing yet"))
    }

    private fun ruleRow(label: String, onRemove: () -> Unit) = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
        addView(TextView(context).apply {
            text = label
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
        }, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        addView(Button(context, null, android.R.attr.borderlessButtonStyle).apply {
            text = "Remove"
            setOnClickListener { onRemove() }
        })
    }

    private fun emptyRow(label: String): View = TextView(this).apply {
        text = label
        alpha = 0.6f
        setPadding(0, 8, 0, 8)
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

    private companion object {
        const val REQUEST_VOICE = 1
    }
}
