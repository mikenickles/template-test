package com.aikeyboard

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.StateListDrawable
import android.os.Handler
import android.os.Looper
import android.text.TextUtils
import android.util.TypedValue
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.MotionEvent
import android.view.View
import android.widget.LinearLayout
import android.widget.TextView

/**
 * A simple QWERTY keyboard with a suggestion strip on top that shows Claude's fixes.
 * Built in code (no XML) so the whole layout lives in one place.
 */
@SuppressLint("ViewConstructor")
class KeyboardView(context: Context, private val listener: Listener) : LinearLayout(context) {

    interface Listener {
        fun onText(text: String)
        fun onBackspace()
        fun onEnter()
        fun onShiftChanged()
        fun onApplySuggestion()
        fun onDismissSuggestion()
        fun onCheckNow()
        fun onOpenSettings()
    }

    enum class Shift { OFF, ONCE, LOCKED }

    var shift = Shift.OFF
        set(value) {
            field = value
            if (!symbols) buildKeys()
        }

    private var symbols = false
    private val keysContainer = LinearLayout(context).apply { orientation = VERTICAL }
    private val statusText = TextView(context)
    private val applyButton = TextView(context)
    private val dismissButton = TextView(context)
    private val repeatHandler = Handler(Looper.getMainLooper())

    private val keyHeight = dp(50)
    private val keyMargin = dp(3)

    init {
        orientation = VERTICAL
        setBackgroundColor(color(R.color.kb_background))
        setPadding(dp(3), 0, dp(3), dp(6))
        addView(buildStrip(), LayoutParams(LayoutParams.MATCH_PARENT, dp(44)))
        addView(keysContainer, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT))
        buildKeys()
        showIdle()
    }

    // ---- Suggestion strip ------------------------------------------------------------------

    private fun buildStrip(): View {
        val strip = LinearLayout(context).apply {
            orientation = HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setBackgroundColor(color(R.color.kb_strip))
            setPadding(dp(6), 0, dp(4), 0)
        }

        val settings = stripButton("⚙") { listener.onOpenSettings() }
        strip.addView(settings, LayoutParams(dp(40), LayoutParams.MATCH_PARENT))

        statusText.apply {
            setTextColor(color(R.color.kb_strip_text))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
            maxLines = 1
            ellipsize = TextUtils.TruncateAt.END
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(6), 0, dp(6), 0)
            setOnClickListener { if (applyButton.visibility == VISIBLE) listener.onApplySuggestion() }
        }
        strip.addView(statusText, LayoutParams(0, LayoutParams.MATCH_PARENT, 1f))

        applyButton.apply {
            text = "Fix"
            setTextColor(color(R.color.kb_accent_text))
            setTypeface(typeface, Typeface.BOLD)
            gravity = Gravity.CENTER
            background = rounded(color(R.color.kb_accent), dp(14).toFloat())
            setPadding(dp(14), 0, dp(14), 0)
            setOnClickListener { haptic(it); listener.onApplySuggestion() }
        }
        strip.addView(applyButton, LayoutParams(LayoutParams.WRAP_CONTENT, dp(30)).apply { marginEnd = dp(4) })

        dismissButton.apply {
            text = "✕"
            setTextColor(color(R.color.kb_strip_text))
            gravity = Gravity.CENTER
            setOnClickListener { haptic(it); listener.onDismissSuggestion() }
        }
        strip.addView(dismissButton, LayoutParams(dp(36), LayoutParams.MATCH_PARENT))

        val check = stripButton("✨") { listener.onCheckNow() }
        check.contentDescription = "Check spelling now"
        strip.addView(check, LayoutParams(dp(44), LayoutParams.MATCH_PARENT))
        return strip
    }

    private fun stripButton(label: String, onClick: () -> Unit) = TextView(context).apply {
        text = label
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f)
        setTextColor(color(R.color.kb_strip_text))
        gravity = Gravity.CENTER
        setOnClickListener { haptic(it); onClick() }
    }

    fun showIdle(message: String = "") {
        statusText.text = message
        applyButton.visibility = GONE
        dismissButton.visibility = GONE
    }

    fun showChecking() = showIdle("Checking…")

    fun showSuggestion(changes: List<Change>, corrected: String) {
        val summary = changes
            .filter { it.original != it.fixed }
            .joinToString("   ") { "${it.original} → ${it.fixed}" }
        statusText.text = summary.ifEmpty { corrected.takeLast(60) }
        applyButton.visibility = VISIBLE
        dismissButton.visibility = VISIBLE
    }

    // ---- Keys ------------------------------------------------------------------------------

    private fun buildKeys() {
        keysContainer.removeAllViews()
        if (symbols) {
            row("1234567890".map { it.toString() })
            row(listOf("@", "#", "$", "%", "&", "-", "+", "(", ")", "/"))
            row(listOf("*", "\"", "'", ":", ";", "!", "?", "_", "="), leading = null, trailing = backspaceKey())
        } else {
            val upper = shift != Shift.OFF
            fun letters(s: String) = s.map { if (upper) it.uppercase() else it.toString() }
            row(letters("qwertyuiop"))
            row(letters("asdfghjkl"), sidePadding = 0.5f)
            row(letters("zxcvbnm"), leading = shiftKey(), trailing = backspaceKey())
        }
        bottomRow()
    }

    private fun row(
        labels: List<String>,
        sidePadding: Float = 0f,
        leading: View? = null,
        trailing: View? = null,
    ) {
        val row = LinearLayout(context).apply { orientation = HORIZONTAL }
        if (sidePadding > 0f) row.addView(View(context), LayoutParams(0, keyHeight, sidePadding))
        leading?.let { row.addView(it, keyParams(1.5f)) }
        labels.forEach { label -> row.addView(charKey(label), keyParams(1f)) }
        trailing?.let { row.addView(it, keyParams(1.5f)) }
        if (sidePadding > 0f) row.addView(View(context), LayoutParams(0, keyHeight, sidePadding))
        keysContainer.addView(row)
    }

    private fun bottomRow() {
        val row = LinearLayout(context).apply { orientation = HORIZONTAL }
        row.addView(specialKey(if (symbols) "ABC" else "?123") {
            symbols = !symbols
            buildKeys()
        }, keyParams(1.5f))
        row.addView(charKey(","), keyParams(1f))
        row.addView(key(" ", special = false) { listener.onText(" ") }, keyParams(5f))
        row.addView(charKey("."), keyParams(1f))
        row.addView(specialKey("⏎") { listener.onEnter() }, keyParams(1.5f))
        keysContainer.addView(row)
    }

    private fun charKey(label: String) = key(label, special = false) { listener.onText(label) }

    private fun shiftKey() = specialKey(
        when (shift) {
            Shift.OFF -> "⇧"
            Shift.ONCE -> "⬆"
            Shift.LOCKED -> "⇪"
        }
    ) {
        shift = when (shift) {
            Shift.OFF -> Shift.ONCE
            Shift.ONCE -> Shift.LOCKED
            Shift.LOCKED -> Shift.OFF
        }
        listener.onShiftChanged()
    }

    @SuppressLint("ClickableViewAccessibility")
    private fun backspaceKey(): View = specialKey("⌫") {}.apply {
        // Delete once on press, then repeat while held.
        val repeater = object : Runnable {
            override fun run() {
                listener.onBackspace()
                repeatHandler.postDelayed(this, 50)
            }
        }
        setOnClickListener(null)
        setOnTouchListener { v, ev ->
            when (ev.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    v.isPressed = true
                    haptic(v)
                    listener.onBackspace()
                    repeatHandler.postDelayed(repeater, 400)
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    v.isPressed = false
                    repeatHandler.removeCallbacks(repeater)
                }
            }
            true
        }
    }

    private fun specialKey(label: String, onClick: () -> Unit) = key(label, special = true, onClick)

    private fun key(label: String, special: Boolean, onClick: () -> Unit) = TextView(context).apply {
        text = label
        gravity = Gravity.CENTER
        setTextColor(color(R.color.kb_key_text))
        setTextSize(TypedValue.COMPLEX_UNIT_SP, if (label.length > 1) 15f else 21f)
        background = StateListDrawable().apply {
            val radius = dp(6).toFloat()
            addState(intArrayOf(android.R.attr.state_pressed), rounded(color(R.color.kb_key_pressed), radius))
            addState(
                intArrayOf(),
                rounded(color(if (special) R.color.kb_key_special else R.color.kb_key), radius)
            )
        }
        isClickable = true
        setOnClickListener { haptic(it); onClick() }
    }

    private fun keyParams(weight: Float) = LayoutParams(0, keyHeight, weight).apply {
        setMargins(keyMargin, keyMargin, keyMargin, keyMargin)
    }

    // ---- Helpers ---------------------------------------------------------------------------

    private fun haptic(v: View) = v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)

    private fun rounded(fill: Int, radius: Float) = GradientDrawable().apply {
        setColor(fill)
        cornerRadius = radius
    }

    private fun color(id: Int) = context.getColor(id)

    private fun dp(v: Int) = TypedValue.applyDimension(
        TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), resources.displayMetrics
    ).toInt()

    override fun onDetachedFromWindow() {
        repeatHandler.removeCallbacksAndMessages(null)
        super.onDetachedFromWindow()
    }
}
