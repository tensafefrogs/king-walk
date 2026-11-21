# King Walk for Android

The game's page (`index.html`, the same file as the website and the iOS app) in a WebView, with the parts the website can't have. GitHub Actions builds it, plays it on an Android emulator, and builds the signed bundle for Google Play, so no Android Studio is needed.

| File | What it does |
|---|---|
| `app/src/main/java/kingwalk/android/MainActivity.kt` | The WebView: serves the game from the app's files at an https address (so it plays offline and keeps its storage), passes the page's messages on, the back gesture, larger text, links that open in the browser |
| `SaveStore.kt` | A copy of the page's save, which Android's Google backup takes: a new phone, or the app installed again, starts with the player's progress |
| `Reminders.kt` | The daily puzzle reminder, scheduled on the phone (no server), with the text in the player's language from the page |
| `Haptics.kt` | The page's haptic kinds as Android's own touch feedback |
| `Widgets.kt`, `Progress.kt`, `WidgetArt.kt` | The home screen widgets, as the iOS app's: rank and rating, and today's daily puzzle with its board. The page sends the progress (op `widget`); `Progress.kt` is `ios/Shared/Progress.swift`'s rules, `WidgetArt.kt` draws the board and the rating chart, the layouts are `res/layout/widget_*.xml`. An alarm redraws them at midnight, for the new daily |
| `app/src/test/…/WidgetsTest.kt` | The widgets' rules, and every size drawn to PNGs in `app/build/widgets/` (Robolectric): `./gradlew :app:testDebugUnitTest`. The widget picker's pictures (`res/drawable-nodpi/widget_preview_*.png`) are its `preview-*.png`, copied by hand when the widgets' look changes |
| `scripts/prepare-web.sh` | Copies the game into the app and writes its `config.js` (run before building) |
| `scripts/art.js` | The launcher icon (adaptive, with a themed version) and the Play listing icon, from `brand/` |
| `scripts/strings.py` | The app's own few words in 45 languages (the reminders' channel, the widgets' names in the widget picker), from the iOS app's and its widget's translations |
| `testing/device.js` | Plays the real app on an emulator or phone and checks the app's parts |
| `release.json`, `store/play.py` | What to upload to Google Play, and the upload |

The page talks to the app the same way as to the iOS app (`APP` in `index.html`; on Android `window.KingWalkAndroid.postMessage(json)`), so a change to the game reaches both apps. `APP.os` is `"android"` here, and the stats go under `king-walk-android/`.

## Building on your own computer

Needs JDK 17 or later and the Android SDK (Android Studio installs both; or set `sdk.dir` in `android/local.properties`).

```bash
android/scripts/prepare-web.sh
```

```bash
cd android && ./gradlew :app:assembleDebug
```

The unit tests (the widgets) run with `./gradlew :app:testDebugUnitTest`.

The APK is in `app/build/outputs/apk/debug/`. With a phone or emulator connected (`adb devices`): `node android/testing/device.js android/app/build/outputs/apk/debug/app-debug.apk`.

## Setting up Google Play (once)

1. **Pick the package name.** It's the app's permanent ID on Google Play and can never change (for example `app.kingwalk`). Add it as the repository variable **`ANDROID_APPLICATION_ID`** (Settings → Secrets and variables → Actions → Variables). It stays out of the code, like the iOS bundle ID.
2. **Create the app in Play Console:** Home → Create app. Name King Walk, default language English (United States), Game, Free.
3. **Make the upload key** on your computer (keep the file and passwords somewhere safe; Google signs the app for players with its own key, so a lost upload key can be reset through Play Console):
   ```bash
   keytool -genkeypair -v -keystore king-walk-upload.jks -alias upload -keyalg RSA -keysize 4096 -validity 10000
   ```
   ```bash
   base64 -i king-walk-upload.jks | pbcopy
   ```
   Then add the repository secrets: **`ANDROID_UPLOAD_KEYSTORE`** (the base64 text you just copied), **`ANDROID_KEYSTORE_PASSWORD`**, **`ANDROID_KEY_ALIAS`** (`upload`) and **`ANDROID_KEY_PASSWORD`** (the same as the keystore's unless you chose another).
4. **Build the first bundle:** Actions → Android app → Run workflow, with "release" ticked. When it finishes, download the `.aab` from the run's Artifacts.
5. **Upload it by hand once:** Play Console → King Walk → Test and release → Testing → Internal testing → Create new release. Leave "Play App Signing" on. Google's API only knows a new app after this first upload.
6. **Let the workflow upload from then on (optional):** in Google Cloud, enable the *Google Play Android Developer API* in a project, create a service account and a JSON key for it. In Play Console → Users and permissions, invite the service account's email with permission to release to testing tracks. Add the JSON as the secret **`PLAY_SERVICE_ACCOUNT_JSON`**, and set `"upload": true` in `release.json`.

### Before the app can go to production

- **Personal developer accounts** (made after November 2023) must run a closed test with **at least 12 testers opted in for 14 days in a row** before Play Console lets the app apply for production. Start the closed test early: the internal track doesn't count.
- **App content** (Policy → App content): privacy policy (the website's `privacy.html`), ads (none), content rating questionnaire, target audience, data safety. For data safety: the game sends anonymous counts to GoatCounter (`testing/STATS.md`), no account, nothing linked to a person; Google's form counts that as app interactions collected for analytics, not shared, not linked to the user.
- **Store listing:** short and full description, the 512 px icon (`android/store/icon-512.png`), a 1024 x 500 feature graphic and phone screenshots. Not made yet; the iOS listing (`ios/store/listing.json`) is the starting point.

## Releasing

Edit `release.json` (version, track, notes), push, then run Actions → Android app with "release" ticked. Each run builds, checks the app on the emulator, signs and uploads (or keeps the bundle in Artifacts if `upload` is false). The build number is the build time, so it always goes up.

`status: draft` leaves the release in Play Console for a person to start; `completed` sends it to the track's testers at once. Production releases wait for the owner's go-ahead, as on iOS.

## Not in the Android app yet

Game Center (Google Play Games would be the Android version), progress moving between devices while they're in use (iCloud on iOS; here only the backup), and website links that open the app (needs the Play signing key's fingerprint in `kingwalk.app/.well-known/assetlinks.json`).
