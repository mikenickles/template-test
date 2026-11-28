package com.aikeyboard

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer

/** Listens for one spoken sentence using the phone's speech recognizer. Main thread only. */
class VoiceInput(private val context: Context) {

    interface Callback {
        fun onPartial(text: String)
        fun onFinal(text: String)
        fun onError(message: String, needsPermission: Boolean)
    }

    private var recognizer: SpeechRecognizer? = null
    var isListening = false
        private set

    fun hasPermission() =
        context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED

    fun start(callback: Callback) {
        if (!SpeechRecognizer.isRecognitionAvailable(context)) {
            callback.onError("Voice recognition isn't available on this phone", false)
            return
        }
        stop()
        val r = SpeechRecognizer.createSpeechRecognizer(context)
        recognizer = r
        r.setRecognitionListener(object : RecognitionListener {
            override fun onPartialResults(partialResults: Bundle) {
                best(partialResults)?.let { callback.onPartial(it) }
            }

            override fun onResults(results: Bundle) {
                isListening = false
                val text = best(results)
                if (text.isNullOrBlank()) callback.onError("Didn't catch that — try again", false)
                else callback.onFinal(text)
            }

            override fun onError(error: Int) {
                isListening = false
                when (error) {
                    SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS ->
                        callback.onError("Allow microphone access", true)
                    SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT ->
                        callback.onError("Didn't catch that — try again", false)
                    SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT ->
                        callback.onError("No connection", false)
                    SpeechRecognizer.ERROR_CLIENT -> {} // We stopped it ourselves.
                    else -> callback.onError("Voice input error — try again", false)
                }
            }

            override fun onReadyForSpeech(params: Bundle?) {}
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(rmsdB: Float) {}
            override fun onBufferReceived(buffer: ByteArray?) {}
            override fun onEndOfSpeech() {}
            override fun onEvent(eventType: Int, params: Bundle?) {}
        })
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            .putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
        isListening = true
        r.startListening(intent)
    }

    fun stop() {
        isListening = false
        recognizer?.destroy()
        recognizer = null
    }

    private fun best(bundle: Bundle) =
        bundle.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()
}
