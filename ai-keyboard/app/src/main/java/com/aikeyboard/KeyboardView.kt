package com.aikeyboard

import android.animation.ObjectAnimator
import android.animation.ValueAnimator
import android.annotation.SuppressLint
import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Typeface
import android.graphics.drawable.Drawable
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.LayerDrawable
import android.graphics.drawable.RippleDrawable
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.TextUtils
import android.text.style.ForegroundColorSpan
import android.text.style.StrikethroughSpan
import android.text.style.StyleSpan
import android.util.TypedValue
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.MotionEvent
import android.view.View
import android.view.WindowInsets
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView

/**
 * A minimal QWERTY keyboard with a suggestion bar on top that shows Claude's fixes.
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
        fun onMic()
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
    private val fixButton = TextView(context)
    private val dismissButton = ImageView(context)
    private val sparkle = ImageView(context)
    private lateinit var mic: ImageView
    private var pulse: ObjectAnimator? = null
    private val repeatHandler = Handler(Looper.getMainLooper())

    private val textColor = color(R.color.kb_text)
    private val mutedColor = color(R.color.kb_text_muted)
    private val keyHeight = dp(46)
    private val keyGapH = dp(3)
    private val keyGapV = dp(5)
    private val basePaddingBottom = dp(8)

    init {
        orientation = VERTICAL
        setBackgroundColor(color(R.color.kb_background))
        setPadding(dp(4), 0, dp(4), basePaddingBottom)
        addView(buildBar(), LayoutParams(LayoutParams.MATCH_PARENT, dp(46)))
        addView(keysContainer, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT))
        buildKeys()
        showIdle()

        // On Android 15+ the keyboard is drawn behind the navigation bar; keep keys above it.
        if (Build.VERSION.SDK_INT >= 35) {
            setOnApplyWindowInsetsListener { v, insets ->
                val nav = insets.getInsets(WindowInsets.Type.navigationBars()).bottom
                v.setPadding(v.paddingLeft, v.paddingTop, v.paddingRight, basePaddingBottom + nav)
                insets
            }
        }
    }

    // ---- Suggestion bar --------------------------------------------------------------------

    private fun buildBar(): View {
        val bar = LinearLayout(context).apply {
            orientation = HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, 0, 0, dp(2))
        }

        bar.addView(
            iconButton(R.drawable.ic_settings, "Settings", mutedColor) { listener.onOpenSettings() },
            LayoutParams(dp(44), dp(40))
        )
        mic = iconButton(R.drawable.ic_mic, "Teach a mistake by voice", mutedColor) { listener.onMic() }
        bar.addView(mic, LayoutParams(dp(40), dp(40)))

        statusText.apply {
            setTextColor(mutedColor)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
            maxLines = 1
            ellipsize = TextUtils.TruncateAt.END
            gravity = Gravity.CENTER
            setPadding(dp(8), 0, dp(8), 0)
            setOnClickListener { if (fixButton.visibility == VISIBLE) listener.onApplySuggestion() }
        }
        bar.addView(statusText, LayoutParams(0, LayoutParams.MATCH_PARENT, 1f))

        fixButton.apply {
            text = "Fix"
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
            setTextColor(color(R.color.kb_pill_text))
            typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
            gravity = Gravity.CENTER
            setPadding(dp(16), 0, dp(16), 0)
            background = ripple(rounded(color(R.color.kb_pill), dp(16).toFloat()), dp(16).toFloat())
            setOnClickListener { haptic(it); listener.onApplySuggestion() }
        }
        bar.addView(fixButton, LayoutParams(LayoutParams.WRAP_CONTENT, dp(32)))

        dismissButton.apply {
            setImageResource(R.drawable.ic_close)
            imageTintList = ColorStateList.valueOf(mutedColor)
            scaleType = ImageView.ScaleType.CENTER_INSIDE
            setPadding(dp(11), dp(11), dp(11), dp(11))
            contentDescription = "Dismiss"
            background = borderlessRipple()
            setOnClickListener { haptic(it); listener.onDismissSuggestion() }
        }
        bar.addView(dismissButton, LayoutParams(dp(40), dp(40)))

        sparkle.apply {
            setImageResource(R.drawable.ic_sparkle)
            imageTintList = ColorStateList.valueOf(textColor)
            scaleType = ImageView.ScaleType.CENTER_INSIDE
            setPadding(dp(10), dp(10), dp(10), dp(10))
            contentDescription = "Check spelling now"
            background = borderlessRipple()
            setOnClickListener { haptic(it); listener.onCheckNow() }
        }
        bar.addView(sparkle, LayoutParams(dp(44), dp(40)))
        return bar
    }

    fun showIdle(message: String = "") {
        stopPulse()
        statusText.text = message
        statusText.setTextColor(mutedColor)
        fixButton.visibility = GONE
        dismissButton.visibility = GONE
    }

    fun showChecking() {
        showIdle()
        startPulse(sparkle)
    }

    /** A message that should stand out more than [showIdle]'s, e.g. confirming a learned rule. */
    fun showMessage(message: String) {
        showIdle(message)
        statusText.setTextColor(textColor)
    }

    /** Mic is listening; [partial] is what has been heard so far. */
    fun showListening(partial: String) {
        showIdle(partial.ifBlank { "Listening… say a mistake you make" })
        if (partial.isNotBlank()) statusText.setTextColor(textColor)
        mic.imageTintList = ColorStateList.valueOf(textColor)
        startPulse(mic)
    }

    fun showLearning() {
        showIdle("Learning…")
        mic.imageTintList = ColorStateList.valueOf(textColor)
        startPulse(mic)
    }

    private fun startPulse(view: View) {
        if (pulse?.target === view) return
        pulse?.cancel()
        pulse = ObjectAnimator.ofFloat(view, View.ALPHA, 1f, 0.25f).apply {
            duration = 550
            repeatMode = ValueAnimator.REVERSE
            repeatCount = ValueAnimator.INFINITE
            start()
        }
    }

    fun showSuggestion(changes: List<Change>, corrected: String) {
        stopPulse()
        val shown = changes.filter { it.original != it.fixed }
        val text = SpannableStringBuilder()
        if (shown.isEmpty()) {
            text.append(corrected.trim().takeLast(60))
        } else {
            // Show the first couple of fixes; the rest become a "+N" so nothing gets cut off mid-word.
            shown.take(MAX_SHOWN_FIXES).forEachIndexed { i, change ->
                if (i > 0) text.append("    ")
                if (change.original.isNotBlank()) {
                    text.span(change.original, StrikethroughSpan(), ForegroundColorSpan(mutedColor))
                    text.append("  ")
                }
                text.span(change.fixed, ForegroundColorSpan(textColor), StyleSpan(Typeface.BOLD))
            }
            val more = shown.size - MAX_SHOWN_FIXES
            if (more > 0) {
                text.append("    ")
                text.span("+$more", ForegroundColorSpan(mutedColor))
            }
        }
        statusText.text = text
        fixButton.visibility = VISIBLE
        dismissButton.visibility = VISIBLE
    }

    private fun stopPulse() {
        pulse?.cancel()
        pulse = null
        sparkle.alpha = 1f
        mic.alpha = 1f
        mic.imageTintList = ColorStateList.valueOf(mutedColor)
    }

    private fun SpannableStringBuilder.span(s: String, vararg spans: Any) {
        val start = length
        append(s)
        spans.forEach { setSpan(it, start, length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE) }
    }

    // ---- Keys ------------------------------------------------------------------------------

    private fun buildKeys() {
        keysContainer.removeAllViews()
        if (symbols) {
            row("1234567890".map { it.toString() })
            row(listOf("@", "#", "$", "%", "&", "-", "+", "(", ")", "/"))
            row(listOf("*", "\"", "'", ":", ";", "!", "?", "_", "="), trailing = backspaceKey())
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
        row.addView(labelKey(if (symbols) "ABC" else "?123") {
            symbols = !symbols
            buildKeys()
        }, keyParams(1.5f))
        row.addView(charKey(","), keyParams(1f))
        row.addView(keyFrame(View(context), special = false) { listener.onText(" ") }, keyParams(5f))
        row.addView(charKey("."), keyParams(1f))
        row.addView(iconKey(R.drawable.ic_enter, "Enter") { listener.onEnter() }, keyParams(1.5f))
        keysContainer.addView(row)
    }

    private fun charKey(label: String): View {
        val text = TextView(context).apply {
            this.text = label
            gravity = Gravity.CENTER
            setTextColor(textColor)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 22f)
            typeface = Typeface.create("sans-serif", Typeface.NORMAL)
            includeFontPadding = false
        }
        return keyFrame(text, special = false) { listener.onText(label) }
    }

    private fun labelKey(label: String, onClick: () -> Unit): View {
        val text = TextView(context).apply {
            this.text = label
            gravity = Gravity.CENTER
            setTextColor(textColor)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
            typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
        }
        return keyFrame(text, special = true, onClick = onClick)
    }

    private fun iconKey(icon: Int, description: String, onClick: () -> Unit): View {
        val image = ImageView(context).apply {
            setImageResource(icon)
            imageTintList = ColorStateList.valueOf(textColor)
            contentDescription = description
        }
        return keyFrame(image, special = true, iconSize = dp(22), onClick = onClick)
    }

    private fun shiftKey(): View {
        val icon = when (shift) {
            Shift.OFF -> R.drawable.ic_shift
            Shift.ONCE -> R.drawable.ic_shift_on
            Shift.LOCKED -> R.drawable.ic_caps_lock
        }
        return iconKey(icon, "Shift") {
            shift = when (shift) {
                Shift.OFF -> Shift.ONCE
                Shift.ONCE -> Shift.LOCKED
                Shift.LOCKED -> Shift.OFF
            }
            listener.onShiftChanged()
        }
    }

    @SuppressLint("ClickableViewAccessibility")
    private fun backspaceKey(): View = iconKey(R.drawable.ic_backspace, "Delete") {}.apply {
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
                    v.background?.setHotspot(ev.x, ev.y)
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

    /** A rounded key with a soft shadow and a ripple, holding [content] centered. */
    private fun keyFrame(
        content: View,
        special: Boolean,
        iconSize: Int = LayoutParams.MATCH_PARENT,
        onClick: () -> Unit,
    ): FrameLayout = FrameLayout(context).apply {
        val radius = dp(8).toFloat()
        val fill = rounded(color(if (special) R.color.kb_key_special else R.color.kb_key), radius)
        val shadow = rounded(color(R.color.kb_key_shadow), radius)
        val layered = LayerDrawable(arrayOf(shadow, fill)).apply {
            setLayerInset(0, 0, dp(1), 0, 0)
            setLayerInset(1, 0, 0, 0, dp(1))
        }
        background = ripple(layered, radius)
        isClickable = true
        addView(content, FrameLayout.LayoutParams(iconSize, iconSize, Gravity.CENTER))
        setOnClickListener { haptic(it); onClick() }
    }

    private fun iconButton(icon: Int, description: String, tint: Int, onClick: () -> Unit) =
        ImageView(context).apply {
            setImageResource(icon)
            imageTintList = ColorStateList.valueOf(tint)
            scaleType = ImageView.ScaleType.CENTER_INSIDE
            setPadding(dp(10), dp(10), dp(10), dp(10))
            contentDescription = description
            background = borderlessRipple()
            setOnClickListener { haptic(it); onClick() }
        }

    private fun keyParams(weight: Float) = LayoutParams(0, keyHeight, weight).apply {
        setMargins(keyGapH, keyGapV, keyGapH, keyGapV)
    }

    // ---- Helpers ---------------------------------------------------------------------------

    private fun haptic(v: View) = v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)

    private fun rounded(fill: Int, radius: Float) = GradientDrawable().apply {
        setColor(fill)
        cornerRadius = radius
    }

    private fun ripple(content: Drawable, radius: Float) = RippleDrawable(
        ColorStateList.valueOf(color(R.color.kb_ripple)),
        content,
        rounded(0xFF000000.toInt(), radius),
    )

    private fun borderlessRipple() =
        RippleDrawable(ColorStateList.valueOf(color(R.color.kb_ripple)), null, null)

    private fun color(id: Int) = context.getColor(id)

    private fun dp(v: Int) = TypedValue.applyDimension(
        TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), resources.displayMetrics
    ).toInt()

    override fun onDetachedFromWindow() {
        repeatHandler.removeCallbacksAndMessages(null)
        stopPulse()
        super.onDetachedFromWindow()
    }

    private companion object {
        const val MAX_SHOWN_FIXES = 2
    }
}
