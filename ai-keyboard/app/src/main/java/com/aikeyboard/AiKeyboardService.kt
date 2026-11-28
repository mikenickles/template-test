package com.aikeyboard

import android.content.Intent
import android.inputmethodservice.InputMethodService
import android.os.Handler
import android.os.Looper
import android.text.InputType
import android.view.KeyEvent
import android.view.View
import android.view.inputmethod.EditorInfo
import java.util.concurrent.Executors

class AiKeyboardService : InputMethodService(), KeyboardView.Listener {

    private lateinit var prefs: Prefs
    private val corrector = Corrector()
    private val executor = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())

    private var keyboard: KeyboardView? = null
    private var pending: CheckResult.Fixed? = null
    private var requestId = 0
    private var lastChecked: String? = null

    /** True for password fields and fields that ask keyboards not to learn from them. */
    private var privateField = false

    /** True for password and non-text fields, where even on-phone swaps would be wrong. */
    private var passwordField = false

    /** Teach mode: keys type a description of a mistake into the bar instead of the app. */
    private var teaching = false
    private val teachText = StringBuilder()

    /** The last instant swap, so one backspace can undo it. */
    private data class Swap(val original: String, val replaced: String)
    private var lastSwap: Swap? = null

    /** Words the user undid in this field; don't swap them again until the field changes. */
    private val undone = mutableSetOf<String>()

    private val autoCheck = Runnable { runCheck(manual = false) }

    override fun onCreate() {
        super.onCreate()
        prefs = Prefs(this)
    }

    override fun onCreateInputView(): View = KeyboardView(this, this).also { keyboard = it }

    override fun onStartInputView(info: EditorInfo, restarting: Boolean) {
        super.onStartInputView(info, restarting)
        privateField = isPrivate(info)
        passwordField = isPassword(info)
        lastSwap = null
        undone.clear()
        endTeaching()
        cancelCheck()
        lastChecked = null
        keyboard?.showIdle(if (privateField) "AI checking is off for this field" else "")
        updateAutoShift()
    }

    override fun onFinishInputView(finishingInput: Boolean) {
        cancelCheck()
        endTeaching()
        super.onFinishInputView(finishingInput)
    }

    override fun onDestroy() {
        executor.shutdownNow()
        super.onDestroy()
    }

    // ---- Key handling ----------------------------------------------------------------------

    override fun onText(text: String) {
        if (teaching) {
            teachText.append(text)
            afterTeachKey()
            return
        }
        val ic = currentInputConnection ?: return
        lastSwap = null
        val swapped = text.length == 1 && text[0] in DELIMITERS && commitWithSwap(text)
        if (!swapped) ic.commitText(text, 1)
        val kb = keyboard
        if (kb != null && kb.shift == KeyboardView.Shift.ONCE && text.any { it.isLetter() }) {
            kb.shift = KeyboardView.Shift.OFF
        }
        onUserTyped(text.lastOrNull())
        updateAutoShift()
    }

    override fun onBackspace() {
        if (teaching) {
            if (teachText.isNotEmpty()) {
                // Remove a whole character, including emoji made of two UTF-16 units.
                val end = teachText.length
                teachText.delete(teachText.offsetByCodePoints(end, -1), end)
            }
            afterTeachKey()
            return
        }
        val ic = currentInputConnection ?: return
        if (undoSwap()) {
            onUserTyped(null)
            updateAutoShift()
            return
        }
        if (!ic.getSelectedText(0).isNullOrEmpty()) {
            ic.commitText("", 1)
        } else {
            // Sending a real DEL key event lets the editor delete whole emoji / surrogate pairs.
            sendDownUpKeyEvents(KeyEvent.KEYCODE_DEL)
        }
        onUserTyped(null)
        updateAutoShift()
    }

    override fun onEnter() {
        if (teaching) {
            submitTeaching()
            return
        }
        val ic = currentInputConnection ?: return
        val info = currentInputEditorInfo
        val action = info?.imeOptions?.and(EditorInfo.IME_MASK_ACTION) ?: EditorInfo.IME_ACTION_NONE
        val noEnterAction = (info?.imeOptions ?: 0) and EditorInfo.IME_FLAG_NO_ENTER_ACTION != 0
        val multiLine = (info?.inputType ?: 0) and InputType.TYPE_TEXT_FLAG_MULTI_LINE != 0
        if (!multiLine && !noEnterAction &&
            action != EditorInfo.IME_ACTION_NONE && action != EditorInfo.IME_ACTION_UNSPECIFIED
        ) {
            lastSwap = null
            commitWithSwap("") // Fix the last word before sending.
            ic.performEditorAction(action)
        } else {
            lastSwap = null
            if (!commitWithSwap("\n")) ic.commitText("\n", 1)
            onUserTyped('\n')
        }
        updateAutoShift()
    }

    override fun onShiftChanged() {}

    private fun updateAutoShift() {
        val kb = keyboard ?: return
        if (kb.shift == KeyboardView.Shift.LOCKED) return
        if (teaching) {
            val want = if (teachText.isBlank()) KeyboardView.Shift.ONCE else KeyboardView.Shift.OFF
            if (kb.shift != want) kb.shift = want
            return
        }
        val info = currentInputEditorInfo ?: return
        val caps = currentInputConnection?.getCursorCapsMode(info.inputType) ?: 0
        val want = if (caps != 0) KeyboardView.Shift.ONCE else KeyboardView.Shift.OFF
        if (kb.shift != want) kb.shift = want
    }

    // ---- Instant "always fix" swaps ---------------------------------------------------------

    /**
     * If the word just before the cursor is one of the user's always-fix typos, replace it and
     * commit [delimiter] after it. Runs on the phone, so it's instant and works offline.
     */
    private fun commitWithSwap(delimiter: String): Boolean {
        if (passwordField) return false
        val rules = prefs.learned.replacements
        if (rules.isEmpty()) return false
        val ic = currentInputConnection ?: return false
        val before = ic.getTextBeforeCursor(MAX_WORD, 0)?.toString() ?: return false
        val word = before.takeLastWhile { it.isLetterOrDigit() || it == '\'' || it == '’' }
        if (word.isEmpty() || word.length == before.length && before.length == MAX_WORD) return false
        val key = word.lowercase()
        if (key in undone) return false
        val correct = rules[key] ?: return false
        val fixed = matchCase(word, correct)
        if (fixed == word) return false

        ic.beginBatchEdit()
        ic.deleteSurroundingText(word.length, 0)
        ic.commitText(fixed + delimiter, 1)
        ic.endBatchEdit()
        lastSwap = Swap(word, fixed + delimiter)
        return true
    }

    /** Backspace right after a swap puts the original word back (and stops swapping it here). */
    private fun undoSwap(): Boolean {
        val swap = lastSwap ?: return false
        lastSwap = null
        val ic = currentInputConnection ?: return false
        if (ic.getTextBeforeCursor(swap.replaced.length, 0)?.toString() != swap.replaced) return false
        ic.beginBatchEdit()
        ic.deleteSurroundingText(swap.replaced.length, 0)
        ic.commitText(swap.original, 1)
        ic.endBatchEdit()
        undone += swap.original.lowercase()
        return true
    }

    /** "Teh" -> "The", "TEH" -> "THE", "teh" -> "the". */
    private fun matchCase(typed: String, correct: String): String = when {
        typed.length > 1 && typed.all { !it.isLetter() || it.isUpperCase() } -> correct.uppercase()
        typed.first().isUpperCase() -> correct.replaceFirstChar { it.uppercaseChar() }
        else -> correct
    }

    // ---- Teaching mistakes in plain language -----------------------------------------------

    override fun onTeach() {
        if (teaching) {
            endTeaching()
            keyboard?.showIdle()
            return
        }
        cancelCheck()
        teaching = true
        teachText.clear()
        keyboard?.showTeachInput("")
        updateAutoShift()
    }

    private fun afterTeachKey() {
        val kb = keyboard ?: return
        if (kb.shift == KeyboardView.Shift.ONCE && teachText.isNotEmpty()) kb.shift = KeyboardView.Shift.OFF
        kb.showTeachInput(teachText.toString())
        updateAutoShift()
    }

    private fun submitTeaching() {
        val description = teachText.toString().trim()
        endTeaching()
        if (description.isEmpty()) {
            keyboard?.showIdle()
            return
        }
        keyboard?.showLearning()
        executor.execute {
            val result = corrector.learn(description, prefs)
            // Save on the worker thread so a second request always builds on this one.
            if (result is LearnResult.Learned) prefs.learned = result.rules
            main.post {
                when (result) {
                    is LearnResult.Learned -> keyboard?.showMessage(result.reply)
                    is LearnResult.Error -> keyboard?.showIdle(result.message)
                }
            }
        }
        updateAutoShift()
    }

    private fun endTeaching() {
        teaching = false
        teachText.clear()
    }

    // ---- AI checking -----------------------------------------------------------------------

    /**
     * Called after every keystroke. Any keystroke cancels a pending check; finishing a word or
     * sentence schedules a new one, so we only call Claude once the user pauses.
     */
    private fun onUserTyped(last: Char?) {
        main.removeCallbacks(autoCheck)
        if (privateField || !prefs.autoCheck) return
        when (last) {
            '.', '!', '?', '\n' -> main.postDelayed(autoCheck, 600)
            ' ', ',' -> main.postDelayed(autoCheck, 1500)
            else -> {}
        }
    }

    override fun onCheckNow() {
        if (teaching) endTeaching()
        if (privateField) {
            keyboard?.showIdle("AI checking is off for this field")
            return
        }
        runCheck(manual = true)
    }

    private fun runCheck(manual: Boolean) {
        val ic = currentInputConnection ?: return
        val text = ic.getTextBeforeCursor(MAX_CHARS, 0)?.toString().orEmpty()
        if (text.isBlank()) {
            if (manual) keyboard?.showIdle("Nothing to check yet")
            return
        }
        if (!manual && text == lastChecked) return
        lastChecked = text

        val id = ++requestId
        if (manual || pending == null) keyboard?.showChecking()
        executor.execute {
            val result = corrector.check(text, prefs)
            main.post { onResult(id, result, manual) }
        }
    }

    private fun onResult(id: Int, result: CheckResult, manual: Boolean) {
        if (id != requestId) return // A newer check was started; ignore this one.
        when (result) {
            is CheckResult.Fixed -> {
                pending = result
                if (prefs.autoApply) {
                    onApplySuggestion()
                } else {
                    keyboard?.showSuggestion(result.changes, result.corrected)
                }
            }
            is CheckResult.NoChanges -> {
                pending = null
                keyboard?.showIdle(if (manual) "Looks good" else "")
            }
            is CheckResult.Error -> {
                // Leave any earlier suggestion in place for background checks.
                if (manual || pending == null) keyboard?.showIdle(result.message)
            }
        }
    }

    override fun onApplySuggestion() {
        if (teaching) {
            submitTeaching()
            return
        }
        val fix = pending ?: return
        pending = null
        val ic = currentInputConnection ?: return

        // The user may have kept typing after the check. Find the checked text right before
        // whatever they typed since, and only replace the part that actually changed.
        val now = ic.getTextBeforeCursor(fix.original.length + MAX_TAIL, 0)?.toString().orEmpty()
        val start = now.lastIndexOf(fix.original)
        if (start < 0) {
            keyboard?.showIdle("Text changed — tap the sparkle to check again")
            return
        }
        val tail = now.substring(start + fix.original.length)

        val prefix = commonPrefixLength(fix.original, fix.corrected)
        val oldMiddle = fix.original.length - prefix
        val replacement = fix.corrected.substring(prefix)

        ic.beginBatchEdit()
        ic.deleteSurroundingText(oldMiddle + tail.length, 0)
        ic.commitText(replacement + tail, 1)
        ic.endBatchEdit()

        lastChecked = null
        keyboard?.showIdle(if (prefs.autoApply) "Fixed" else "")
        updateAutoShift()
    }

    override fun onDismissSuggestion() {
        if (teaching) {
            endTeaching()
            keyboard?.showIdle()
            updateAutoShift()
            return
        }
        pending = null
        keyboard?.showIdle()
    }

    override fun onOpenSettings() {
        startActivity(
            Intent(this, SettingsActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
    }

    private fun cancelCheck() {
        main.removeCallbacks(autoCheck)
        requestId++
        pending = null
    }

    private fun isPassword(info: EditorInfo): Boolean {
        val type = info.inputType
        val cls = type and InputType.TYPE_MASK_CLASS
        val variation = type and InputType.TYPE_MASK_VARIATION
        return cls != InputType.TYPE_CLASS_TEXT ||
            variation == InputType.TYPE_TEXT_VARIATION_PASSWORD ||
            variation == InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD ||
            variation == InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD
    }

    private fun isPrivate(info: EditorInfo): Boolean {
        val type = info.inputType
        val cls = type and InputType.TYPE_MASK_CLASS
        val variation = type and InputType.TYPE_MASK_VARIATION
        val password = when (cls) {
            InputType.TYPE_CLASS_TEXT -> variation == InputType.TYPE_TEXT_VARIATION_PASSWORD ||
                variation == InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD ||
                variation == InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD
            InputType.TYPE_CLASS_NUMBER -> variation == InputType.TYPE_NUMBER_VARIATION_PASSWORD
            else -> false
        }
        val noLearning = info.imeOptions and EditorInfo.IME_FLAG_NO_PERSONALIZED_LEARNING != 0
        val notText = cls != InputType.TYPE_CLASS_TEXT
        return password || noLearning || notText
    }

    private fun commonPrefixLength(a: String, b: String): Int {
        var i = 0
        val max = minOf(a.length, b.length)
        while (i < max && a[i] == b[i]) i++
        // Don't split a surrogate pair (emoji).
        if (i > 0 && i < a.length && Character.isLowSurrogate(a[i])) i--
        return i
    }

    companion object {
        /** How much of the text before the cursor is sent to Claude. */
        private const val MAX_CHARS = 1500
        /** How much the user may type after a check before we give up applying it. */
        private const val MAX_TAIL = 500
        /** Longest word we look at for instant swaps. */
        private const val MAX_WORD = 48
        /** Typing one of these ends a word and triggers an instant swap. */
        private val DELIMITERS = setOf(' ', ',', '.', '!', '?', ';', ':')
    }
}
