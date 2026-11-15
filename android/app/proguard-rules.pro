# The WebView calls these by name from JavaScript.
-keepclassmembers class com.hasn2mr.clinicmanager.NativeBridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class com.hasn2mr.clinicmanager.SyncWorker { *; }
-keep class com.hasn2mr.clinicmanager.ClinicWidget { *; }
