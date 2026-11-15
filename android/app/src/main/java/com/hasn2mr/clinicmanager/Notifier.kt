package com.hasn2mr.clinicmanager

import android.Manifest
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat

object Notifier {
    const val CH_BOOKINGS = "bookings"
    const val CH_QUEUE = "queue"

    fun canPost(c: Context): Boolean =
        Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(c, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    /** [tab] is opened when the notification is tapped (see MainActivity / main.js window.__go). */
    fun post(c: Context, id: Int, channel: String, title: String, text: String, tab: String) {
        if (!canPost(c)) return
        val open = Intent(c, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra("tab", tab)
        }
        val pi = PendingIntent.getActivity(c, id, open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val n = NotificationCompat.Builder(c, channel)
            .setSmallIcon(R.drawable.ic_stat_clinic)
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setAutoCancel(true)
            .setContentIntent(pi)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .build()
        try { NotificationManagerCompat.from(c).notify(id, n) } catch (e: SecurityException) { /* permission revoked meanwhile */ }
    }
}
