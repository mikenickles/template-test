package com.aikeyboard

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * Mistakes the user described in their own words.
 * [replacements]: typo (lowercase) -> correct word, swapped instantly on the phone every time.
 * [notes]: context-dependent mistakes (e.g. your/you're) that Claude watches for on each check.
 */
data class LearnedRules(
    val replacements: Map<String, String> = emptyMap(),
    val notes: List<String> = emptyList(),
)

/** Simple wrapper around the app's private SharedPreferences. */
class Prefs(context: Context) {
    private val sp = context.applicationContext.getSharedPreferences("ai_keyboard", Context.MODE_PRIVATE)

    var apiKey: String
        get() = sp.getString(KEY_API_KEY, "") ?: ""
        set(v) = sp.edit().putString(KEY_API_KEY, v.trim()).apply()

    var model: String
        get() = sp.getString(KEY_MODEL, Models.DEFAULT) ?: Models.DEFAULT
        set(v) = sp.edit().putString(KEY_MODEL, v).apply()

    /** Check text automatically after each word / sentence. */
    var autoCheck: Boolean
        get() = sp.getBoolean(KEY_AUTO_CHECK, true)
        set(v) = sp.edit().putBoolean(KEY_AUTO_CHECK, v).apply()

    /** Apply fixes without waiting for a tap. */
    var autoApply: Boolean
        get() = sp.getBoolean(KEY_AUTO_APPLY, false)
        set(v) = sp.edit().putBoolean(KEY_AUTO_APPLY, v).apply()

    var learned: LearnedRules
        get() {
            val raw = sp.getString(KEY_LEARNED, null) ?: return LearnedRules()
            return try {
                val obj = JSONObject(raw)
                val reps = obj.optJSONObject("replacements")
                val map = LinkedHashMap<String, String>()
                reps?.keys()?.forEach { k -> map[k] = reps.getString(k) }
                val notesJson = obj.optJSONArray("notes")
                val notes = (0 until (notesJson?.length() ?: 0)).map { notesJson!!.getString(it) }
                LearnedRules(map, notes)
            } catch (e: Exception) {
                LearnedRules()
            }
        }
        set(v) {
            val obj = JSONObject()
                .put("replacements", JSONObject(v.replacements as Map<*, *>))
                .put("notes", JSONArray(v.notes))
            sp.edit().putString(KEY_LEARNED, obj.toString()).apply()
        }

    companion object {
        private const val KEY_API_KEY = "api_key"
        private const val KEY_MODEL = "model"
        private const val KEY_AUTO_CHECK = "auto_check"
        private const val KEY_AUTO_APPLY = "auto_apply"
        private const val KEY_LEARNED = "learned_rules"
    }
}

object Models {
    const val OPUS = "claude-opus-5-5"
    const val SONNET = "claude-sonnet-5-5"
    const val HAIKU = "claude-haiku-5-5"
    const val DEFAULT = OPUS
}
