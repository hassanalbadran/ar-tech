package com.hasn2mr.clinicmanager

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import org.json.JSONObject
import java.text.NumberFormat
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/** Home-screen widget (4×2, resizable; works on Samsung One UI): today's patients, waiting, bookings, net income. */
class ClinicWidget : AppWidgetProvider() {

    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        for (id in ids) manager.updateAppWidget(id, build(context))
    }

    companion object {
        fun updateAll(c: Context) {
            val m = AppWidgetManager.getInstance(c)
            val ids = m.getAppWidgetIds(ComponentName(c, ClinicWidget::class.java))
            if (ids.isNotEmpty()) for (id in ids) m.updateAppWidget(id, build(c))
        }

        private fun build(c: Context): RemoteViews {
            val v = RemoteViews(c.packageName, R.layout.widget_clinic)
            val s = try { JSONObject(Prefs.get(c, "summary", "{}")) } catch (e: Exception) { JSONObject() }
            val money = NumberFormat.getIntegerInstance(Locale.US)
            if (s.has("at")) {
                v.setTextViewText(R.id.w_total, s.optInt("total").toString())
                v.setTextViewText(R.id.w_waiting, s.optInt("waiting").toString())
                v.setTextViewText(R.id.w_bookings, s.optInt("bookings").toString())
                if (s.has("net")) v.setTextViewText(R.id.w_net, money.format(s.optDouble("net").toLong())) else v.setTextViewText(R.id.w_net, "—")
                val f = SimpleDateFormat("HH:mm", Locale.US).apply { timeZone = TimeZone.getTimeZone("Asia/Baghdad") }
                v.setTextViewText(R.id.w_updated, c.getString(R.string.w_updated, f.format(Date(s.optLong("at")))))
            } else {
                v.setTextViewText(R.id.w_total, "—"); v.setTextViewText(R.id.w_waiting, "—")
                v.setTextViewText(R.id.w_bookings, "—"); v.setTextViewText(R.id.w_net, "—")
                v.setTextViewText(R.id.w_updated, c.getString(R.string.w_open_app))
            }
            val open = Intent(c, MainActivity::class.java).apply { flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP }
            v.setOnClickPendingIntent(R.id.w_root, PendingIntent.getActivity(c, 0, open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
            return v
        }
    }
}
