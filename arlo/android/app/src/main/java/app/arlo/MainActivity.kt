package app.arlo

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.speech.RecognizerIntent
import android.view.View
import android.view.inputmethod.EditorInfo
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.EditText
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
import org.json.JSONObject

/**
 * A thin shell around Arlo's own interface, which is served by the hub on your
 * computer. The shell adds what a browser tab cannot: pairing by QR code,
 * "Share to Arlo", voice input, and notifications while the app is closed.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var web: WebView
    private lateinit var setup: View
    private lateinit var error: View
    private var pendingShare: String? = null
    private var failed = false

    private val prefs by lazy { getSharedPreferences(PREFS, Context.MODE_PRIVATE) }
    private var hub: String?
        get() = prefs.getString(KEY_HUB, null)
        set(value) = prefs.edit().putString(KEY_HUB, value).apply()

    private val voice = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val heard = result.data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull().orEmpty()
        web.evaluateJavascript("window.arloVoice && window.arloVoice(${JSONObject.quote(heard)})", null)
    }

    private val askNotifications = registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        web = findViewById(R.id.web)
        setup = findViewById(R.id.setup)
        error = findViewById(R.id.error)

        // Keep content clear of the status bar, the navigation bar and the keyboard.
        val root = findViewById<View>(R.id.root)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            WindowInsetsCompat.CONSUMED
        }
        val night = resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK == Configuration.UI_MODE_NIGHT_YES
        WindowCompat.getInsetsController(window, root).apply {
            isAppearanceLightStatusBars = !night
            isAppearanceLightNavigationBars = !night
        }

        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        CookieManager.getInstance().setAcceptCookie(true)
        web.addJavascriptInterface(Bridge(), "ArloNative")
        web.webViewClient = object : WebViewClient() {
            // Only the hub is shown in here. Any other link opens in the browser.
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (sameSite(request.url)) return false
                runCatching { startActivity(Intent(Intent.ACTION_VIEW, request.url)) }
                return true
            }

            override fun onPageStarted(view: WebView, url: String?, favicon: android.graphics.Bitmap?) {
                failed = false
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, err: WebResourceError) {
                if (request.isForMainFrame) {
                    failed = true
                    show(error)
                }
            }

            override fun onPageFinished(view: WebView, url: String?) {
                if (failed) return
                show(web)
                // Remember the pairing so the background check can use it.
                CookieManager.getInstance().flush()
                hub?.let { prefs.edit().putString(KEY_COOKIE, CookieManager.getInstance().getCookie(it)).apply() }
                pendingShare?.let {
                    web.evaluateJavascript("window.arloShare && window.arloShare(${JSONObject.quote(it)})", null)
                    pendingShare = null
                }
            }
        }

        findViewById<Button>(R.id.scan).setOnClickListener { scan() }
        findViewById<Button>(R.id.connect).setOnClickListener { connectTyped() }
        findViewById<EditText>(R.id.address).setOnEditorActionListener { _, action, _ ->
            if (action == EditorInfo.IME_ACTION_GO) connectTyped()
            true
        }
        findViewById<Button>(R.id.retry).setOnClickListener { hub?.let { web.loadUrl(it) } }
        findViewById<Button>(R.id.change).setOnClickListener { show(setup) }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (web.visibility == View.VISIBLE && web.canGoBack()) web.goBack() else finish()
            }
        })

        takeShare(intent)
        Notifier.createChannel(this)
        val address = hub
        if (address == null) show(setup) else open(address)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        takeShare(intent)
        pendingShare?.let {
            if (web.visibility == View.VISIBLE) {
                web.evaluateJavascript("window.arloShare && window.arloShare(${JSONObject.quote(it)})", null)
                pendingShare = null
            }
        }
    }

    private fun takeShare(intent: Intent?) {
        if (intent?.action == Intent.ACTION_SEND && intent.type == "text/plain") {
            pendingShare = intent.getStringExtra(Intent.EXTRA_TEXT)
        }
    }

    private fun show(view: View) {
        for (v in listOf(web, setup, error)) v.visibility = if (v === view) View.VISIBLE else View.GONE
    }

    private fun sameSite(url: Uri): Boolean {
        val home = hub?.let(Uri::parse) ?: return false
        return url.scheme == home.scheme && url.host == home.host && url.port == home.port
    }

    /** Start (or restart) the session with a hub address, optionally landing on a pairing link. */
    private fun open(base: String, landing: String = base) {
        hub = base
        web.loadUrl(landing)
        Notifier.schedule(this)
        if (Build.VERSION.SDK_INT >= 33) askNotifications.launch(Manifest.permission.POST_NOTIFICATIONS)
    }

    private fun connectTyped() {
        val typed = findViewById<EditText>(R.id.address).text.toString().trim()
        val base = baseOf(if (typed.contains("://")) typed else "http://$typed")
        if (base == null) Toast.makeText(this, R.string.bad_address, Toast.LENGTH_LONG).show() else open(base)
    }

    private fun scan() {
        val options = GmsBarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_QR_CODE).build()
        GmsBarcodeScanning.getClient(this, options).startScan()
            .addOnSuccessListener { code ->
                val link = code.rawValue.orEmpty()
                val base = baseOf(link)
                if (base == null) Toast.makeText(this, R.string.bad_address, Toast.LENGTH_LONG).show() else open(base, link)
            }
            .addOnFailureListener { Toast.makeText(this, R.string.no_scanner, Toast.LENGTH_LONG).show() }
    }

    /** "http://192.168.1.20:8787/pair#CODE" becomes "http://192.168.1.20:8787". */
    private fun baseOf(link: String): String? {
        val uri = runCatching { Uri.parse(link) }.getOrNull() ?: return null
        val scheme = uri.scheme ?: return null
        val host = uri.host ?: return null
        if (scheme != "http" && scheme != "https") return null
        return if (uri.port > 0) "$scheme://$host:${uri.port}" else "$scheme://$host"
    }

    /** What the page can ask the phone to do. Only the hub's own pages are ever loaded here. */
    private inner class Bridge {
        @JavascriptInterface
        fun listen() {
            runOnUiThread {
                val ask = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                    .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                    .putExtra(RecognizerIntent.EXTRA_PROMPT, getString(R.string.speak_prompt))
                runCatching { voice.launch(ask) }.onFailure {
                    web.evaluateJavascript("window.arloVoice && window.arloVoice('')", null)
                }
            }
        }
    }

    companion object {
        const val PREFS = "arlo"
        const val KEY_HUB = "hub"
        const val KEY_COOKIE = "cookie"
        const val KEY_LAST = "last_notification"
    }
}
