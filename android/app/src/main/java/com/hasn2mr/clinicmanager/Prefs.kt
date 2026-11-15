package com.hasn2mr.clinicmanager

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Key/value storage shared by the WebView (through [NativeBridge]) and the background worker.
 *  - kv:  plain app-private preferences (cached JSON, settings, pairing URL + token)
 *  - sec: encrypted preferences (the finance PIN). Falls back to private plain prefs if the Keystore misbehaves on a device.
 * Keys used by the worker: cm.url, cm.token, cm.notify, summary, w.seen, w.waiting.
 */
object Prefs {
    private fun kv(c: Context): SharedPreferences = c.applicationContext.getSharedPreferences("kv", Context.MODE_PRIVATE)

    fun get(c: Context, k: String, d: String = ""): String = kv(c).getString(k, d) ?: d
    fun set(c: Context, k: String, v: String) { kv(c).edit().putString(k, v).apply() }
    fun del(c: Context, k: String) { kv(c).edit().remove(k).apply() }

    @Volatile private var secCache: SharedPreferences? = null

    private fun sec(c: Context): SharedPreferences {
        secCache?.let { return it }
        synchronized(this) {
            secCache?.let { return it }
            val app = c.applicationContext
            val p = try {
                val key = MasterKey.Builder(app).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build()
                EncryptedSharedPreferences.create(
                    app, "sec", key,
                    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
                )
            } catch (e: Exception) {
                app.getSharedPreferences("sec_fallback", Context.MODE_PRIVATE)
            }
            secCache = p
            return p
        }
    }

    fun secGet(c: Context, k: String): String = try { sec(c).getString(k, "") ?: "" } catch (e: Exception) { "" }
    fun secSet(c: Context, k: String, v: String) { try { sec(c).edit().putString(k, v).apply() } catch (e: Exception) { /* best effort */ } }
}
