// The King Walk Android app: the game's page (index.html, copied into assets/web by scripts/prepare-web.sh) in a
// WebView, with the native parts the website can't have. Settings that identify the owner's copy come from the
// environment (GitHub Actions variables and secrets in the workflows), so they stay out of the code:
//   ANDROID_APPLICATION_ID  the app's package name on Google Play (default: a placeholder for local builds)
//   VERSION_NAME, VERSION_CODE  from android/release.json and the build time (scripts in .github/workflows/android.yml)
//   ANDROID_KEYSTORE, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD  the upload key, for release builds
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val env: (String) -> String? = { System.getenv(it)?.trim()?.ifEmpty { null } }

android {
    namespace = "kingwalk.android"
    compileSdk = 36

    defaultConfig {
        applicationId = env("ANDROID_APPLICATION_ID") ?: "kingwalk.android.dev"
        minSdk = 26
        targetSdk = 36
        versionCode = env("VERSION_CODE")?.toInt() ?: 1
        versionName = env("VERSION_NAME") ?: "0.0.0"
    }

    signingConfigs {
        val store = env("ANDROID_KEYSTORE")
        if (store != null) create("upload") {
            storeFile = file(store)
            storePassword = env("ANDROID_KEYSTORE_PASSWORD")
            keyAlias = env("ANDROID_KEY_ALIAS")
            keyPassword = env("ANDROID_KEY_PASSWORD") ?: env("ANDROID_KEYSTORE_PASSWORD")
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.findByName("upload")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures { buildConfig = true }
    // the libraries' newest versions need Android Gradle plugin 9; these are the newest for 8.13
    lint { disable += "GradleDependency" }
    androidResources {
        // the game's files are served as they are (the puzzle chunks, fonts, icons): no compression to undo
        noCompress += listOf("txt", "woff2", "js", "html", "json", "png", "svg")
    }
}

kotlin { compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) } }

dependencies {
    implementation("androidx.core:core-ktx:1.17.0")
    implementation("androidx.activity:activity-ktx:1.11.0")
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("com.google.android.play:review-ktx:2.0.2")
    implementation("androidx.fragment:fragment:1.8.8")          // review pulls in an old one, which mishandles permission results
}
