# King Walk for Android

The game's page (`index.html`, the same file as the website and the iOS app) in a WebView, with the parts the website can't have. GitHub Actions builds it, plays it on an Android emulator, and builds the signed bundle for Google Play, so no Android Studio is needed.

| File | What it does |
|---|---|
| `app/src/main/java/kingwalk/android/MainActivity.kt` | The WebView: serves the game from the app's files at an https address (so it plays offline and keeps its storage), passes the page's messages on, the back gesture, larger text, links that open in the browser |
| `SaveStore.kt` | A copy of the page's save, which Android's Google backup takes: a new phone, or the app installed again, starts with the player's progress |
| `Reminders.kt` | The daily puzzle reminder, scheduled on the phone (no server), with the text in the player's language from the page |
| `Haptics.kt` | The page's haptic kinds as Android's own touch feedback |
| `Languages.kt` | The game's language as the phone's per-app language (Android 13 and later), set from either side |
| `DailyTile.kt` | The Today's puzzle tile for Quick Settings |
| `PlayGames.kt` | Google Play Games: achievements and leaderboards, the same as Game Center's |
| `Updates.kt` | Google Play updates, downloaded while the game is open and installed when the player leaves it |
| `res/xml/shortcuts.xml` | The Today's puzzle shortcut (touch and hold the app's icon) |
| `store/playgames.py` | Makes the Play Games achievements and leaderboards, and prints the ids the app needs |
| `Widgets.kt`, `Progress.kt`, `WidgetArt.kt` | The home screen widgets, as the iOS app's: rank and rating, and today's daily puzzle with its board. The page sends the progress (op `widget`); `Progress.kt` is `ios/Shared/Progress.swift`'s rules, `WidgetArt.kt` draws the board and the rating chart, the layouts are `res/layout/widget_*.xml`. An alarm redraws them at midnight, for the new daily |
| `app/src/test/…/WidgetsTest.kt` | The widgets' rules, and every size drawn to PNGs in `app/build/widgets/` (Robolectric): `./gradlew :app:testDebugUnitTest`. The widget picker's pictures (`res/drawable-nodpi/widget_preview_*.png`) are its `preview-*.png`, copied by hand when the widgets' look changes |
| `scripts/prepare-web.sh` | Copies the game into the app and writes its `config.js` (run before building) |
| `scripts/art.js` | The launcher icon (adaptive, with a themed version) and the Play listing icon, from `brand/` |
| `scripts/strings.py` | The app's own few words in 45 languages (the reminders' channel, the widgets' names in the widget picker), from the iOS app's and its widget's translations |
| `testing/device.js` | Plays the real app on an emulator or phone and checks the app's parts |
| `release.json`, `store/play.py` | What to upload to Google Play, and the upload |
| `store/listing.py` | The Google Play store listing in every language, with its pictures (the Google Play listing workflow) |

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
2. **Create the app in Play Console:** Home → Create app. Name King Walk, default language English (United States), Game, **Paid** ($0.99, as on the App Store). Choose Paid here: Google Play never lets an app that has been free become paid (the reverse is allowed). A paid app needs a payments profile (Play Console → Setup → Payments profile, with a bank account and tax details); the price goes in Monetize with Play → Products → App pricing, where Google fills in each country's local price.
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

7. **Google Play Games (optional):** in Play Console → Grow users → Play Games Services → Setup and management, create the game's Play Games project (choose "No, my game doesn't use Google APIs"), and add the Android app to it (Credentials; the package name and the Play signing key's SHA-1 from Test and release → App integrity). Add the project id shown under the game's name as the variable **`ANDROID_PLAY_GAMES_APP_ID`**. Then make the 22 achievements and 10 leaderboards: run Actions → Android app with "playgames" ticked (it uses `PLAY_SERVICE_ACCOUNT_JSON`; give that account access to the game), or enter them by hand from `python3 android/store/playgames.py list`. The script hasn't been run against Google yet, so check what it made. Put the id map it prints into the variable **`ANDROID_PLAY_GAMES_IDS`**, add yourself as a tester under Play Games Services → Testers, and publish the Play Games project when the app goes out. Until both variables are set, the app has no Play Games row.
8. **Website links open the app:** add the variable **`ANDROID_CERT_SHA256`**, the SHA-256 fingerprint of Google Play's app signing key (App integrity → App signing; several can be given, separated by commas). The website build then writes `.well-known/assetlinks.json`, and Android sends links to the game's page and to a shared daily puzzle (`#daily`) to the app. `SITE_URL` (already set for the website) names the site in the app.

### Before the app can go to production

- **Personal developer accounts** (made after November 2023) must run a closed test with **at least 12 testers opted in for 14 days in a row** before Play Console lets the app apply for production. Start the closed test early: the internal track doesn't count. The app is paid: internal testers install it free, but closed (and open) testers have to buy it, so give the closed testers a promo code for it (Monetize with Play → Promo codes; a code for a paid app gives it free).
- **App content** (Policy → App content): privacy policy (the website's `privacy.html`), ads (none), content rating questionnaire, target audience, data safety. For data safety: the game sends anonymous counts to GoatCounter (`testing/STATS.md`), no account, nothing linked to a person; Google's form counts that as app interactions collected for analytics, not shared, not linked to the user.
  Answered in November 2026: the app follows Google Play's Families policy (shown in its Data safety section), and its Advertising ID answer is No. The manifest removes the `AD_ID` permission so no library can add it (`testing/parity.js` checks the manifest, `android/testing/device.js` the installed app). Data safety: Location → Approximate location and App activity → App interactions, both collected (not shared), not ephemeral, required, for Analytics; encrypted in transit; no account; no deletion requests (nothing is linked to a person).
- **Store listing:** made and uploaded by the **Google Play listing** workflow (`android/store/listing.py`) once `PLAY_SERVICE_ACCOUNT_JSON` is set: the text in English (`android/store/listing.json`) and in the iOS app's 45 languages, the 512 px icon (`store/icon-512.png`), the feature graphic (`store/feature-1024x500.png`, `node ios/store/header.js --play`) and five phone screenshots (`store/screenshots/`, `node ios/store/screenshots.js android`). Play Console still asks for the category (Games → Board, set in November 2026; the API can't set it), contact email and the App content forms by hand.

## Releasing

Edit `release.json` (version, track, notes) and push to `main`, as for the iOS app: the workflow builds and releases as it says (or run Actions → Android app with "release" ticked). The version is the iOS app's (`ios/release.json`): `testing/parity.js` fails until both say the same. Each run builds, checks the app on the emulator, signs and uploads (or keeps the bundle in Artifacts if `upload` is false). The build number is the build time, so it always goes up.

`status: draft` leaves the release in Play Console for a person to start; `completed` sends it to the track's testers at once. Production releases wait for the owner's go-ahead, as on iOS.

## Not in the Android app yet

Progress moving between devices while they're in use (iCloud on iOS; here only the backup, which covers a new phone). Play Games' saved games could do it later. Siri and Shortcuts on iOS have no Android counterpart here: Google's App Actions for Assistant are being retired.
