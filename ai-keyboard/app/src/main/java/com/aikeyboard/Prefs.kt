package com.aikeyboard

import android.content.Context

/** Simple wrapper around the app's private SharedPreferences. */
class Prefs(context: Context) {
    private val sp = context.applicationContext.getSharedPreferences("ai_keyboard", Context.MODE_PRIVATE)

    var apiKey: String
        get() = sp.getString(KEY_API_KEY, "") ?: ""
        set(v) = sp.edit().putString(KEY_API_KEY, v.trim()).apply()

    var model: String
        get() = sp.getString(KEY_MODEL, Models.DEFAULT) ?: Models.DEFAULT
        set(v) = sp.edit().putString(KEY_MODEL, v).apply()

    /** Free-form notes from the user about mistakes they commonly make. */
    var commonMistakes: String
        get() = sp.getString(KEY_MISTAKES, "") ?: ""
        set(v) = sp.edit().putString(KEY_MISTAKES, v).apply()

    /** Check text automatically after each word / sentence. */
    var autoCheck: Boolean
        get() = sp.getBoolean(KEY_AUTO_CHECK, true)
        set(v) = sp.edit().putBoolean(KEY_AUTO_CHECK, v).apply()

    /** Apply fixes without waiting for a tap. */
    var autoApply: Boolean
        get() = sp.getBoolean(KEY_AUTO_APPLY, false)
        set(v) = sp.edit().putBoolean(KEY_AUTO_APPLY, v).apply()

    companion object {
        private const val KEY_API_KEY = "api_key"
        private const val KEY_MODEL = "model"
        private const val KEY_MISTAKES = "common_mistakes"
        private const val KEY_AUTO_CHECK = "auto_check"
        private const val KEY_AUTO_APPLY = "auto_apply"
    }
}

object Models {
    const val OPUS = "claude-opus-5-5"
    const val SONNET = "claude-sonnet-5-5"
    const val HAIKU = "claude-haiku-5-5"
    const val DEFAULT = OPUS
}
