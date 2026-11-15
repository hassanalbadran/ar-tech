plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Version: ./gradlew assembleRelease -PversionName=1.2.0 -PversionCode=12   (CI passes the tag and the run number)
val vName = (project.findProperty("versionName") as String?) ?: "1.0.0"
val vCode = ((project.findProperty("versionCode") as String?) ?: "1").toInt()

android {
    lint {
        abortOnError = false
        checkReleaseBuilds = false
    }
    namespace = "com.hasn2mr.clinicmanager"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.hasn2mr.clinicmanager"
        minSdk = 26
        targetSdk = 35
        versionCode = vCode
        versionName = vName
    }

    // Release signing comes from the environment (CI secrets). Without it the APK is signed with the debug key
    // (installable, but an update must come from a build signed with the same key).
    val ksPath: String? = System.getenv("ANDROID_KEYSTORE_PATH")
    signingConfigs {
        if (ksPath != null) {
            create("release") {
                storeFile = file(ksPath)
                storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("ANDROID_KEY_ALIAS")
                keyPassword = System.getenv("ANDROID_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            signingConfig = if (ksPath != null) signingConfigs.getByName("release") else signingConfigs.getByName("debug")
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    buildFeatures { buildConfig = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    packaging { resources.excludes += "/META-INF/{AL2.0,LGPL2.1}" }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.fragment:fragment-ktx:1.8.5")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("androidx.work:work-runtime-ktx:2.10.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    implementation("androidx.security:security-crypto:1.1.0-alpha06")
    implementation("com.google.android.gms:play-services-code-scanner:16.1.0")
}
