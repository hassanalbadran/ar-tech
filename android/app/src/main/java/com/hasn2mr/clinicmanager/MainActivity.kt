package com.hasn2mr.clinicmanager

import android.Manifest
import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebViewAssetLoader
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning

/** One full-screen WebView that hosts assets/app (the same design language as the PC app). Native help lives in [NativeBridge]. */
class MainActivity : ComponentActivity() {
    lateinit var web: WebView
    private lateinit var root: FrameLayout
    private lateinit var bridge: NativeBridge

    private var pendingSave: Triple<String, String, String>? = null // id, file name, text
    private var pendingOpen: String? = null
    private var pendingNotif: String? = null

    private val createDoc = registerForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        val p = pendingSave ?: return@registerForActivityResult
        pendingSave = null
        if (uri == null) { bridge.reply(p.first, 204, ""); return@registerForActivityResult }
        try {
            contentResolver.openOutputStream(uri)?.use { it.write(p.third.toByteArray(Charsets.UTF_8)) }
            bridge.reply(p.first, 200, p.second)
        } catch (e: Exception) { bridge.reply(p.first, 500, e.message ?: "write failed") }
    }

    private val openDoc = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        val id = pendingOpen ?: return@registerForActivityResult
        pendingOpen = null
        if (uri == null) { bridge.reply(id, 204, ""); return@registerForActivityResult }
        try {
            val text = contentResolver.openInputStream(uri)?.use { it.readBytes().toString(Charsets.UTF_8) } ?: ""
            if (text.length > 5_000_000) bridge.reply(id, 500, "file too large") else bridge.reply(id, 200, text)
        } catch (e: Exception) { bridge.reply(id, 500, e.message ?: "read failed") }
    }

    private val notifPerm = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        val id = pendingNotif ?: return@registerForActivityResult
        pendingNotif = null
        bridge.reply(id, 200, if (granted) "granted" else "denied")
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)

        root = FrameLayout(this).apply { setBackgroundColor(Color.parseColor("#0a161c")) }
        web = WebView(this)
        bridge = NativeBridge(this)
        root.addView(web, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        setContentView(root)

        // edge-to-edge: keep the page clear of the status/navigation bars and the keyboard
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val i = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime() or WindowInsetsCompat.Type.displayCutout())
            v.setPadding(i.left, i.top, i.right, i.bottom)
            WindowInsetsCompat.CONSUMED
        }

        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            setSupportZoom(false)
            builtInZoomControls = false
            textZoom = 100
            mediaPlaybackRequiresUserGesture = true
            cacheMode = WebSettings.LOAD_DEFAULT
        }
        web.overScrollMode = android.view.View.OVER_SCROLL_NEVER
        web.setBackgroundColor(Color.TRANSPARENT)
        web.addJavascriptInterface(bridge, "Native")

        // assets are served from a virtual https origin so fetch / CSP / fonts behave like a normal site
        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                loader.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (request.url.host == WebViewAssetLoader.DEFAULT_DOMAIN) return false
                openExternal(request.url.toString())
                return true
            }
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                // the page closes sheets / returns to the home tab first; only then does the app leave
                web.evaluateJavascript("(function(){return !!(window.__back && window.__back());})()") { handled ->
                    if (handled != "true") { isEnabled = false; onBackPressedDispatcher.onBackPressed(); isEnabled = true }
                }
            }
        })

        val tab = intent?.getStringExtra("tab").orEmpty()
        web.loadUrl("https://${WebViewAssetLoader.DEFAULT_DOMAIN}/assets/app/index.html" + if (tab.isNotEmpty()) "#$tab" else "")
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        val tab = intent.getStringExtra("tab").orEmpty()
        if (tab.isNotEmpty()) web.evaluateJavascript("window.__go && window.__go(${org.json.JSONObject.quote(tab)})", null)
    }

    override fun onResume() { super.onResume(); web.onResume() }
    override fun onPause() { web.onPause(); super.onPause() }
    override fun onDestroy() { root.removeAllViews(); web.destroy(); super.onDestroy() }

    // ---- called from NativeBridge (UI thread) ----

    fun scanQr(id: String) {
        val opts = GmsBarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_QR_CODE).enableAutoZoom().build()
        GmsBarcodeScanning.getClient(this, opts).startScan()
            .addOnSuccessListener { b -> bridge.reply(id, 200, b.rawValue ?: "") }
            .addOnCanceledListener { bridge.reply(id, 204, "") }
            .addOnFailureListener { e -> bridge.reply(id, 500, getString(R.string.scan_failed) + " (" + (e.message ?: "") + ")") }
    }

    fun saveFile(id: String, name: String, text: String) {
        pendingSave = Triple(id, name, text)
        createDoc.launch(name)
    }

    fun pickFile(id: String) {
        pendingOpen = id
        openDoc.launch(arrayOf("application/json", "text/plain", "*/*"))
    }

    fun askNotifications(id: String) {
        if (Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) {
            bridge.reply(id, 200, "granted"); return
        }
        pendingNotif = id
        notifPerm.launch(Manifest.permission.POST_NOTIFICATIONS)
    }

    fun openExternal(url: String) {
        val u = Uri.parse(url)
        val ok = u.scheme == "https" || u.scheme == "tel" || u.scheme == "sms" || u.scheme == "mailto"
        if (!ok) return
        try {
            startActivity(Intent(if (u.scheme == "tel") Intent.ACTION_DIAL else Intent.ACTION_VIEW, u).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (e: ActivityNotFoundException) { /* nothing can open it */ }
    }

    fun setBars(hex: String, darkIcons: Boolean) {
        try { root.setBackgroundColor(Color.parseColor(hex)) } catch (e: IllegalArgumentException) { return }
        val c = WindowCompat.getInsetsController(window, window.decorView)
        c.isAppearanceLightStatusBars = darkIcons
        c.isAppearanceLightNavigationBars = darkIcons
    }
}
