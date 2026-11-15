package com.hasn2mr.clinicmanager

import android.view.HapticFeedbackConstants
import android.webkit.JavascriptInterface
import org.json.JSONObject
import java.util.concurrent.Executors

/**
 * `window.Native` inside the WebView (see assets/app/js/native.js). All arguments and results are strings.
 * Asynchronous calls take an id and answer later through `window.__natCb(id, status, text)`
 * (status 200 = ok, 204 = cancelled, anything else = failure with a message in text).
 */
class NativeBridge(private val act: MainActivity) {
    private val io = Executors.newFixedThreadPool(3)

    fun reply(id: String, status: Int, text: String) {
        val js = "window.__natCb(${JSONObject.quote(id)},$status,${JSONObject.quote(text)})"
        act.runOnUiThread { act.web.evaluateJavascript(js, null) }
    }

    // ---- network (no CORS: done natively; HTTPS + host allow-list in Http) ----
    @JavascriptInterface
    fun http(id: String, method: String, url: String, body: String) {
        io.execute {
            val r = Http.request(method, url, body)
            reply(id, r.status, r.body)
        }
    }

    // ---- storage ----
    @JavascriptInterface fun kvGet(k: String): String = Prefs.get(act, k)
    @JavascriptInterface fun kvSet(k: String, v: String) { Prefs.set(act, k, v) }
    @JavascriptInterface fun kvDel(k: String) { Prefs.del(act, k) }
    @JavascriptInterface fun secGet(k: String): String = Prefs.secGet(act, k)
    @JavascriptInterface fun secSet(k: String, v: String) { Prefs.secSet(act, k, v) }

    // ---- camera / files / system ----
    @JavascriptInterface fun scanQr(id: String) { act.runOnUiThread { act.scanQr(id) } }
    @JavascriptInterface fun saveFile(id: String, name: String, text: String) { act.runOnUiThread { act.saveFile(id, name, text) } }
    @JavascriptInterface fun pickFile(id: String) { act.runOnUiThread { act.pickFile(id) } }
    @JavascriptInterface fun askNotifications(id: String) { act.runOnUiThread { act.askNotifications(id) } }
    @JavascriptInterface fun openExternal(url: String) { act.runOnUiThread { act.openExternal(url) } }

    @JavascriptInterface
    fun setBackground(on: Boolean) { if (on) SyncWorker.schedule(act) else SyncWorker.cancel(act) }

    @JavascriptInterface fun refreshWidgets() { ClinicWidget.updateAll(act) }
    @JavascriptInterface fun setBars(hex: String, darkIcons: Boolean) { act.runOnUiThread { act.setBars(hex, darkIcons) } }
    @JavascriptInterface fun haptic() { act.runOnUiThread { act.web.performHapticFeedback(HapticFeedbackConstants.CONTEXT_CLICK) } }
    @JavascriptInterface fun appVersion(): String = BuildConfig.VERSION_NAME
}
