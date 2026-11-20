package kingwalk.android

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.ScriptHandler
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import com.google.android.play.core.review.ReviewManagerFactory
import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale

/**
 * Shows the game in a WebView. The page is served from the app's assets (assets/web, copied from the repository by
 * scripts/prepare-web.sh) at an https address of WebViewAssetLoader's, so it plays offline and keeps its storage.
 * Links to the web open in the browser. The page talks to the app through window.KingWalkAndroid (APP in index.html):
 * the same messages as the iOS app's (ios/KingWalk/GameViewController.swift).
 */
class MainActivity : ComponentActivity() {
    private lateinit var web: WebView
    private lateinit var saves: SaveStore
    private var startScripts = listOf<ScriptHandler>()
    private var pageReady = false
    /** a part of the game to open once the page is ready ("daily", from a reminder) */
    private var pendingOpen: String? = null
    private var lastViewport = ""

    private val loader by lazy {
        WebViewAssetLoader.Builder().addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this)).build()
    }

    private val askNotifications = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        Reminders.reschedule(this)
        tellPage("window.kingWalkReminders&&kingWalkReminders($granted)")
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        saves = SaveStore(this)
        pendingOpen = intent.getStringExtra(EXTRA_OPEN)

        web = WebView(this)
        web.setBackgroundColor(ContextCompat.getColor(this, R.color.page))
        web.overScrollMode = View.OVER_SCROLL_NEVER
        web.isHorizontalScrollBarEnabled = false
        with(web.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            mediaPlaybackRequiresUserGesture = false
            // the page lays itself out at the phone's text size (kingWalkViewport, below), so text isn't zoomed on its own
            textZoom = 100
            useWideViewPort = true
            loadWithOverviewMode = false
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
            setSupportMultipleWindows(false)
        }
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        web.webViewClient = Client()
        listen()
        installScripts()

        // edge to edge: the game sits inside the status and navigation bars and any camera cutout, on its own colour
        val frame = FrameLayout(this)
        frame.setBackgroundColor(ContextCompat.getColor(this, R.color.page))
        frame.addView(web, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        ViewCompat.setOnApplyWindowInsetsListener(frame) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout() or WindowInsetsCompat.Type.ime())
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            WindowInsetsCompat.CONSUMED
        }
        setContentView(frame)
        web.addOnLayoutChangeListener { _, _, _, _, _, _, _, _, _ -> sendViewport() }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                // the page closes what's open (a card, a dialog, the menu); with nothing open, the app goes to the background
                web.evaluateJavascript("window.kingWalkBack?kingWalkBack():false") { closed ->
                    if (closed != "true") moveTaskToBack(true)
                }
            }
        })

        web.loadUrl(START)          // the page restores the game from its save, so a new start is the same game
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        intent.getStringExtra(EXTRA_OPEN)?.let { pendingOpen = it; openRequested() }
    }

    /** the font size changed in the phone's settings (the activity handles fontScale itself, see the manifest) */
    override fun onConfigurationChanged(newConfig: android.content.res.Configuration) {
        super.onConfigurationChanged(newConfig)
        sendViewport(force = true)
    }

    override fun onResume() {
        super.onResume()
        web.onResume()
    }

    override fun onPause() {
        // the page saves the daily's clock and position when it's hidden (visibilitychange)
        web.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        (web.parent as? ViewGroup)?.removeView(web)
        web.destroy()
        super.onDestroy()
    }

    // MARK: Scripts that run as the page loads

    /** What the app offers the page (read by APP in index.html) and the save (SaveStore). Built again before each load,
     *  so a reload never brings back an older save. */
    private fun installScripts() {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) return
        startScripts.forEach { it.remove() }
        val app = JSONObject()
            .put("platform", platform())
            .put("gameCenter", false)
            .put("widget", false)
            .put("reminders", true)
        val viewport = """
            window.kingWalkViewport=function(w,z){var m=document.querySelector('meta[name=viewport]');if(!m||!(w>0))return;
            var c=z===1?'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover'
              :'width='+Math.round(w/z)+', initial-scale='+z+', minimum-scale='+z+', maximum-scale='+z+', user-scalable=no, viewport-fit=cover';
            if(m.content!==c)m.content=c;};
            document.addEventListener('DOMContentLoaded',function(){
              var s=document.createElement('style');s.textContent='body{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent}textarea{-webkit-user-select:text;user-select:text}';
              document.head.appendChild(s);});
        """.trimIndent()
        val origins = setOf(ORIGIN)
        startScripts = listOf(
            WebViewCompat.addDocumentStartJavaScript(web, "window.kingWalkApp=$app;", origins),
            WebViewCompat.addDocumentStartJavaScript(web, saves.bootstrapScript(), origins),
            WebViewCompat.addDocumentStartJavaScript(web, viewport, origins),
        )
    }

    /** for the stats (platform/<name>) and the page's layout choices */
    private fun platform(): String {
        val pm = packageManager
        return when {
            pm.hasSystemFeature("org.chromium.arc") || pm.hasSystemFeature("org.chromium.arc.device_management") -> "chromeos"
            resources.configuration.smallestScreenWidthDp >= 600 -> "android-tablet"
            else -> "android-phone"
        }
    }

    // MARK: Larger text

    /** The page follows the phone's font size: it's laid out at the WebView's width divided by the scale and drawn at
     *  that scale, so it reflows around bigger text (as the iOS app does with Larger Text). */
    private fun sendViewport(force: Boolean = false) {
        val density = resources.displayMetrics.density
        val w = web.width / density
        if (w <= 0f) return
        val z = resources.configuration.fontScale.coerceIn(0.85f, 2f)
        val js = String.format(Locale.US, "window.kingWalkViewport&&kingWalkViewport(%.1f,%s)", w, if (z == 1f) "1" else String.format(Locale.US, "%.2f", z))
        if (!force && js == lastViewport) return
        lastViewport = js
        web.evaluateJavascript(js, null)
    }

    // MARK: Messages from the page

    private fun listen() {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return
        WebViewCompat.addWebMessageListener(web, "KingWalkAndroid", setOf(ORIGIN)) { _, message, source, isMainFrame, _ ->
            if (!isMainFrame || source.toString().trimEnd('/') != ORIGIN) return@addWebMessageListener
            val body = runCatching { JSONObject(message.data ?: "") }.getOrNull() ?: return@addWebMessageListener
            handle(body)
        }
    }

    private fun handle(body: JSONObject) {
        when (body.optString("op")) {
            "set" -> if (body.has("key")) saves.set(body.getString("key"), body.optString("value"))
            "remove" -> if (body.has("key")) saves.remove(body.getString("key"))
            "clear" -> saves.clear()
            "copy" -> getSystemService(ClipboardManager::class.java)?.setPrimaryClip(ClipData.newPlainText("King Walk", body.optString("text")))
            "haptic" -> Haptics.play(web, body.optString("kind"))
            "share" -> share(body.optString("text"))
            "review" -> review()
            "ready" -> { pageReady = true; openRequested() }
            "reminders" -> reminders(body.optInt("hour", -1), body.optJSONArray("items") ?: JSONArray())
            // Game Center's messages (score, achieve, gamecenter) and the widget's have no Android part yet
        }
    }

    /** pass a request on to the page once it has started (it posts "ready") */
    private fun openRequested() {
        val what = pendingOpen ?: return
        if (!pageReady) return
        pendingOpen = null
        val safe = what.filter { it.isLetter() }
        tellPage("window.kingWalkOpen&&kingWalkOpen('$safe')")
    }

    private fun tellPage(js: String) = runOnUiThread { web.evaluateJavascript(js, null) }

    private fun share(text: String) {
        val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text)
        startActivity(Intent.createChooser(send, null))
    }

    /** The page decides when (after a clean solve, once the player has solved 20); Google Play decides whether to show it */
    private fun review() {
        val manager = ReviewManagerFactory.create(this)
        manager.requestReviewFlow().addOnSuccessListener { info -> manager.launchReviewFlow(this, info) }
    }

    /** The daily reminder: the page sends the next week's notifications in the player's language (sendDaily in
     *  index.html); Android 13 and later ask for permission the first time */
    private fun reminders(hour: Int, items: JSONArray) {
        Reminders.save(this, hour, items)
        val needsAsking = hour >= 0 && Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(this, android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        if (needsAsking) {
            askNotifications.launch(android.Manifest.permission.POST_NOTIFICATIONS)
            return
        }
        Reminders.reschedule(this)
        tellPage("window.kingWalkReminders&&kingWalkReminders(${hour < 0 || Reminders.allowed(this)})")
    }

    // MARK: Loading and links

    private inner class Client : WebViewClient() {
        override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
            loader.shouldInterceptRequest(request.url)

        /** the game's own pages load here; anything else (Lichess puzzle pages, the policy pages, credits) opens in the browser */
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val url = request.url
            if (url.host == HOST) return false
            try {
                startActivity(Intent(Intent.ACTION_VIEW, url).addCategory(Intent.CATEGORY_BROWSABLE))
            } catch (_: ActivityNotFoundException) {
            }
            return true
        }

        override fun onPageStarted(view: WebView, url: String?, favicon: android.graphics.Bitmap?) {
            pageReady = false
        }

        override fun onPageFinished(view: WebView, url: String?) {
            sendViewport(force = true)          // a reload (the language picker) starts from the page's own viewport again
        }

        /** if Android stops the WebView's process (memory pressure), start the game again with today's save */
        override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
            recreate()
            return true
        }
    }

    companion object {
        const val EXTRA_OPEN = "open"
        private const val HOST = WebViewAssetLoader.DEFAULT_DOMAIN
        private const val ORIGIN = "https://$HOST"
        private const val START = "$ORIGIN/assets/web/index.html"

        fun openIntent(context: android.content.Context, what: String): Intent =
            Intent(context, MainActivity::class.java).putExtra(EXTRA_OPEN, what)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    }
}
