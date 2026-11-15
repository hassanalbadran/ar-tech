package com.hasn2mr.clinicmanager

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build

class ClinicApp : Application() {
    override fun onCreate() {
        super.onCreate()
        if (Build.VERSION.SDK_INT >= 26) {
            val nm = getSystemService(NotificationManager::class.java)
            nm.createNotificationChannel(NotificationChannel(Notifier.CH_BOOKINGS, getString(R.string.ch_bookings), NotificationManager.IMPORTANCE_DEFAULT))
            nm.createNotificationChannel(NotificationChannel(Notifier.CH_QUEUE, getString(R.string.ch_queue), NotificationManager.IMPORTANCE_DEFAULT))
        }
        // keep the background check alive after app updates / process restarts
        if (Prefs.get(this, "cm.token").isNotEmpty()) SyncWorker.schedule(this)
    }
}
