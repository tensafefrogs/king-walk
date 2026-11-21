// The King Walk Android app: the game's page (index.html, copied into assets/web by scripts/prepare-web.sh) in a
// WebView, with the native parts the website can't have. Settings that identify the owner's copy come from the
// environment (GitHub Actions variables and secrets in the workflows), so they stay out of the code:
//   ANDROID_APPLICATION_ID  the app's package name on Google Play (default: a placeholder for local builds)
//   VERSION_NAME, VERSION_CODE  from android/release.json and the build time (scripts in .github/workflows/android.yml)
//   ANDROID_KEYSTORE, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD  the upload key, for release builds
//   ANDROID_PLAY_GAMES_APP_ID, ANDROID_PLAY_GAMES_IDS  Google Play Games: the game's project id and the map from the
//     page's achievement and leaderboard ids to Play's (store/playgames.py prints it); without them Play Games is off
//   SITE_URL  the website, whose links open the app (App Links; the site's .well-known/assetlinks.json names the app)
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
        val games = env("ANDROID_PLAY_GAMES_APP_ID")?.filter { it.isDigit() } ?: ""
        buildConfigField("String", "PLAY_GAMES_APP_ID", "\"$games\"")
        val gameIds = (env("ANDROID_PLAY_GAMES_IDS") ?: "{}").replace("\\", "\\\\").replace("\"", "\\\"")
        buildConfigField("String", "PLAY_GAMES_IDS", "\"$gameIds\"")
        resValue("string", "game_services_project_id", games)
        manifestPlaceholders["siteHost"] = env("SITE_URL")?.let { Regex("^https?://([^/:]+)").find(it)?.groupValues?.get(1) } ?: "kingwalk.invalid"
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
    // the widgets' tests (app/src/test) run on Robolectric, which draws with Android's own graphics code
    testOptions { unitTests.isIncludeAndroidResources = true }
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
    implementation("com.google.android.play:app-update-ktx:2.1.0")
    implementation("com.google.android.gms:play-services-games-v2:21.0.0")
    implementation("androidx.fragment:fragment:1.8.8")          // review pulls in an old one, which mishandles permission results
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.robolectric:robolectric:4.16")
}
