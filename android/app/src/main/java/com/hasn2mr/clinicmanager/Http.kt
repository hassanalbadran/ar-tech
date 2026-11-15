package com.hasn2mr.clinicmanager

import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL

/**
 * The only network door of the app. HTTPS only, and only to the hosts the app needs:
 * the clinic's Apps Script (script.google.com → script.googleusercontent.com) and GitHub's release API.
 * No CORS here (native), so JSON is POSTed as text/plain exactly like the desktop app does (docs/API.md).
 */
object Http {
    private val ALLOWED = setOf("script.google.com", "script.googleusercontent.com", "api.github.com")
    private const val MAX_BYTES = 12_000_000

    data class Res(val status: Int, val body: String)

    fun request(method: String, url: String, body: String): Res {
        val u = try { URL(url) } catch (e: Exception) { return Res(400, "bad url") }
        if (u.protocol != "https" || u.host !in ALLOWED) return Res(400, "blocked host")
        var conn: HttpURLConnection? = null
        return try {
            conn = (u.openConnection() as HttpURLConnection).apply {
                requestMethod = if (method == "GET") "GET" else "POST"
                connectTimeout = 15_000
                readTimeout = 45_000
                instanceFollowRedirects = true // Apps Script answers POST with a 302 to the result (followed as GET)
                setRequestProperty("User-Agent", "ClinicManager-Android")
                setRequestProperty("Accept", "application/json")
                if (requestMethod == "POST") {
                    doOutput = true
                    setRequestProperty("Content-Type", "text/plain;charset=utf-8")
                    outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
                }
            }
            val code = conn.responseCode
            val stream = if (code in 200..299) conn.inputStream else conn.errorStream
            Res(code, stream?.let { readLimited(it) } ?: "")
        } catch (e: IOException) {
            Res(0, e.message ?: "network")
        } finally {
            conn?.disconnect()
        }
    }

    private fun readLimited(s: InputStream): String {
        s.use { input ->
            val out = ByteArrayOutputStream()
            val buf = ByteArray(16 * 1024)
            var total = 0
            while (true) {
                val n = input.read(buf)
                if (n < 0) break
                total += n
                if (total > MAX_BYTES) throw IOException("response too large")
                out.write(buf, 0, n)
            }
            return out.toString("UTF-8")
        }
    }
}
