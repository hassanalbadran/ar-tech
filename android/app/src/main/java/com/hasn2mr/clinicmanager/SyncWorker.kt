package com.hasn2mr.clinicmanager

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.TimeUnit

/**
 * Background check (every ~15 min, the WorkManager minimum): asks the clinic for today's queue and bookings,
 * mirrors a small summary for the widget (kv key "summary", same shape as main.js mirrorSummary) and posts notifications
 * for new bookings and for patients waiting for the doctor.
 */
class SyncWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val c = applicationContext
        val url = Prefs.get(c, "cm.url")
        val token = Prefs.get(c, "cm.token")
        if (url.isEmpty() || token.isEmpty()) return@withContext Result.success()
        try {
            // one tiny request first: nothing changed (and same day, checked within the last 3 h) -> nothing else to download
            val rev = post(url, JSONObject().put("action", "rev").put("token", token))?.optLong("rev", -1) ?: -1L
            val day = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US).apply { timeZone = java.util.TimeZone.getTimeZone("Asia/Baghdad") }.format(java.util.Date())
            val key = "$rev|$day"
            val lastFull = Prefs.get(c, "w.fullAt", "0").toLongOrNull() ?: 0L
            if (rev >= 0 && key == Prefs.get(c, "w.rev") && System.currentTimeMillis() - lastFull < 3 * 3600_000L && Prefs.get(c, "summary").isNotEmpty()) {
                return@withContext Result.success()
            }
            val snap = call(url, token, "getTodayQueueSnapshot", JSONArray()) ?: return@withContext Result.success()
            Prefs.set(c, "w.rev", key); Prefs.set(c, "w.fullAt", System.currentTimeMillis().toString())
            val patients = snap.optJSONArray("patients") ?: JSONArray()
            val today = snap.optJSONArray("bookings") ?: JSONArray()
            val upcoming = snap.optJSONArray("upcoming") ?: JSONArray()

            var waiting = 0
            for (i in 0 until patients.length()) if (patients.getJSONObject(i).optString("visitStatus") == "waiting") waiting++
            var todayBookings = 0
            for (i in 0 until today.length()) if (today.getJSONObject(i).optString("status") != "ملغى") todayBookings++

            // finance numbers only when the doctor stored the finance PIN
            var income: Double? = null
            var net: Double? = null
            val pin = Prefs.secGet(c, "pin")
            if (pin.isNotEmpty()) {
                try {
                    call(url, token, "getClinicDashboardStats", JSONArray().put(pin))?.let {
                        income = it.optDouble("todayIncome", 0.0)
                        net = it.optDouble("todayNet", 0.0)
                    }
                } catch (e: Exception) { /* wrong PIN etc.: widget simply omits money */ }
            }

            val sum = JSONObject()
                .put("at", System.currentTimeMillis())
                .put("total", patients.length())
                .put("waiting", waiting)
                .put("bookings", todayBookings)
            income?.let { sum.put("income", it) }
            net?.let { sum.put("net", it) }
            Prefs.set(c, "summary", sum.toString())
            ClinicWidget.updateAll(c)

            if (Prefs.get(c, "cm.notify", "1") != "0") notify(c, today, upcoming, waiting)
            Result.success()
        } catch (e: AuthException) {
            Result.success() // device was revoked: the app shows the pairing screen next time it opens
        } catch (e: Exception) {
            Result.success() // offline etc.: try again at the next period
        }
    }

    private class AuthException : Exception()

    private fun call(url: String, token: String, fn: String, args: JSONArray): JSONObject? =
        post(url, JSONObject().put("action", "call").put("token", token).put("fn", fn).put("args", args).put("cid", UUID.randomUUID().toString()))

    private fun post(url: String, body: JSONObject): JSONObject? {
        val r = Http.request("POST", url, body.toString())
        if (r.status != 200) return null
        val j = JSONObject(r.body)
        if (!j.optBoolean("ok")) { if (j.optString("code") == "AUTH") throw AuthException(); return null }
        return j.optJSONObject("data")
    }

    private fun notify(c: Context, today: JSONArray, upcoming: JSONArray, waiting: Int) {
        // new bookings = ids not seen before (first run only records the baseline)
        val ids = LinkedHashMap<String, JSONObject>()
        for (arr in listOf(today, upcoming)) for (i in 0 until arr.length()) {
            val b = arr.getJSONObject(i)
            if (b.optString("status") == "ملغى") continue
            ids[b.optString("bookingId")] = b
        }
        val seenRaw = Prefs.get(c, "w.seen", "")
        val first = seenRaw.isEmpty() && Prefs.get(c, "w.init") != "1"
        val seen = seenRaw.split(",").filter { it.isNotEmpty() }.toMutableSet()
        val fresh = ids.filterKeys { it !in seen }
        if (!first && fresh.isNotEmpty()) {
            val lines = fresh.values.take(5).joinToString("\n") {
                val t = it.optString("callTime")
                "${it.optString("patientName")} — ${it.optString("callDate")} ${if (t.length >= 16) t.substring(11, 16) else ""}".trim()
            }
            Notifier.post(c, 11, Notifier.CH_BOOKINGS, if (fresh.size == 1) c.getString(R.string.n_new_booking) else c.getString(R.string.n_new_bookings, fresh.size), lines, "bookings")
        }
        Prefs.set(c, "w.init", "1")
        Prefs.set(c, "w.seen", ids.keys.take(300).joinToString(","))

        val last = Prefs.get(c, "w.waiting", "0").toIntOrNull() ?: 0
        if (!first && waiting > 0 && waiting > last) {
            Notifier.post(c, 12, Notifier.CH_QUEUE, c.getString(R.string.n_waiting, waiting), c.getString(R.string.n_waiting_text), "patients")
        }
        Prefs.set(c, "w.waiting", waiting.toString())
    }

    companion object {
        private const val NAME = "clinic-sync"

        fun schedule(c: Context) {
            val req = PeriodicWorkRequestBuilder<SyncWorker>(15, TimeUnit.MINUTES)
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build()
            WorkManager.getInstance(c).enqueueUniquePeriodicWork(NAME, ExistingPeriodicWorkPolicy.KEEP, req)
        }

        fun cancel(c: Context) { WorkManager.getInstance(c).cancelUniqueWork(NAME) }
    }
}
