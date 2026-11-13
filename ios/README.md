# King Walk for iOS

A native app for iPhone and iPad that plays the game offline. It shows the same `index.html` in a web view, served from inside the app, and adds native parts the website can't have. GitHub Actions builds, signs and uploads it to App Store Connect on a macOS runner, so no Mac is needed. The setup follows the Spark app's (tensafefrogs/spark, `ios/`).

## What's here

- `project.yml`: the Xcode project, as an [XcodeGen](https://github.com/yonaskolb/XcodeGen) spec. The `.xcodeproj` is generated and not committed. Two targets: the app and its widget.
- `KingWalk/`: the app's Swift code and asset catalog (app icon, launch color).
  - `GameViewController.swift`: the web view, and the messages the page sends the app. Links open in Safari; JavaScript dialogs appear as iOS alerts; no pinch zoom or text selection.
  - `BundleSchemeHandler.swift`: serves the game's files at `kingwalk://app/`. That gives the page a stable origin for its saves and lets it load the puzzle files with `fetch()`.
  - `SaveStore.swift`: keeps a copy of the save in the app's own storage and in iCloud (see below). Also sends copy-to-clipboard through the app.
  - `Haptics.swift`, `GameCenter.swift`, `WidgetData.swift`: the native parts below.
- `KingWalkWidget/`: the widget extension (SwiftUI, WidgetKit).
- `Shared/Progress.swift`: the progress the widget shows, shared by both targets.
- `scripts/prepare-web.sh`: copies the game into `KingWalk/web/` (not committed), with two changes for the app: the analytics script loads over https, and it doesn't count a page view (the app's events go under `king-walk-ios/`).
- `scripts/upload.sh`: archives the app, checks its entitlements, and uploads it to App Store Connect.
- `scripts/art.js`: makes the app icon (light, dark and tinted), the widget's piece images and the Game Center achievement images from `brand/`.
- `store/`: the App Store listing, screenshots, header art, app preview, Game Center setup and the scripts that upload them. See `store/listing.md`.
- `release.json`: what the App Store release workflow should do (below).
- `../.github/workflows/`: `ios.yml` (build, upload), `release.yml` (release from `release.json`), `store.yml` (listing, screenshots, Game Center), `test.yml` (plays puzzles in a browser on every push).

The app always bundles the game as it is on the branch being built. To ship a game change to iOS, push it to `main` and make a new build. The website is the repo root on GitHub Pages; the `ios/` folder rides along there but nothing links to it.

## What the app adds to the game

The page talks to the app through `window.webkit.messageHandlers.kingwalk`; the app tells the page what it offers in `window.kingWalkApp` (read as `APP` in `index.html`). On the web none of this runs.

- **Haptics** (`Haptics.swift`): a tick when you pick up a piece and as you drag it over squares it can go to, a click when it lands (firmer for a capture), a soft tap for the other side's move, an error buzz for a wrong move, a success for a solve, and a short drumroll for a new rank. Menu → Haptics turns them off. On the website, Android browsers get the same moments as simple vibrations.
- **Game Center** (`GameCenter.swift`): signs in at launch (iOS shows the banner or sign-in sheet when it decides to), then submits the puzzle rating and best streak to two leaderboards and unlocks 13 achievements (first solve, solved 50/250/1000, streaks of 5/10/20, each rank, and solving a puzzle rated 300+ above you). Menu → Game Center opens the dashboard. On launch the page reports what an existing save has already earned. Leaderboards and achievements are set up in App Store Connect by `store/gamecenter.py`.
- **Widget** (`KingWalkWidget/`): home screen (small, medium) and Lock Screen (circular, rectangular, inline). Shows the rank with its piece, the rating, progress to the next rank, and on the medium size the rating chart and stats. The page sends the numbers after each puzzle; the app saves them in the app group `group.com.geoffstearns.kingwalk` and refreshes the widget.
- **iCloud saves** (`SaveStore.swift`): the save is copied to iCloud key-value storage, and on launch the newer copy wins, so progress carries over between the player's iPhone and iPad.
- **Share sheet**: Menu → Share, and the Share button after a new rank, open the iOS share sheet with the player's rank and rating.
- **Rating prompt**: right after a clean solve, once the player has solved 20 puzzles, at most every 4 months, never right after a rank-up. iOS decides whether it actually shows.
- **Sound** plays even with the ring switch on silent (the game's own Sound switch turns it off), mixed with the player's music.
- Light and dark mode follow the system, and the layout uses the whole screen around the notch and home indicator.

## One-time setup (in your Apple and GitHub accounts)

Most of this is the same as for Spark, and the Apple Developer account and API key can be the same ones.

1. **Register the App IDs.** In developer.apple.com → Certificates, IDs & Profiles → Identifiers:
   - **App Groups:** click **+** → App Groups → `group.com.geoffstearns.kingwalk` (description: King Walk).
   - **The app:** **+** → App IDs → App, Bundle ID (Explicit) `com.geoffstearns.kingwalk`. Capabilities: tick **App Groups** (then Configure → `group.com.geoffstearns.kingwalk`), **iCloud** (key-value storage is enough; CloudKit isn't needed) and **Game Center** (on by default).
   - **The widget:** **+** → App IDs → App, Bundle ID `com.geoffstearns.kingwalk.widget`. Capabilities: **App Groups** → `group.com.geoffstearns.kingwalk`.
   Xcode's automatic signing can register these itself during the upload, but doing it by hand first avoids a failed first build.
2. **Create the app record.** In App Store Connect → Apps, click **+** → New App: Platform iOS, Name **King Walk: Chess Puzzles**, Primary language English (U.S.), Bundle ID `com.geoffstearns.kingwalk`, SKU `king-walk`. The name under the icon on the home screen is "King Walk".
3. **TestFlight group.** In the app's TestFlight tab, add an internal group called **Internal** and add yourself. (`release.json` gives new builds to it.)
4. **API key.** The Spark key works here too (keys belong to the team, not an app). Otherwise: App Store Connect → Users and Access → Integrations → App Store Connect API → Team Keys → generate a key with the **Admin** role (needed so the build can create its own signing certificate), download the `.p8` (only once), and note the Key ID and Issuer ID.
5. **Add four repository secrets** in GitHub → tensafefrogs/king-walk → Settings → Secrets and variables → Actions:

   | Secret | Value |
   | --- | --- |
   | `ASC_KEY_ID` | The key's Key ID |
   | `ASC_ISSUER_ID` | The Issuer ID shown above the keys list |
   | `ASC_KEY_P8` | The whole contents of the `.p8` file, including the BEGIN and END lines |
   | `APPLE_TEAM_ID` | Your Team ID (developer.apple.com → Account → Membership details) |

6. **Run the first build:** edit `note` in `ios/release.json` and push to `main` (or Actions → App Store release → Run workflow). It builds, uploads, waits for processing and gives the build to the Internal group. Then Actions → App Store listing → Run workflow uploads the listing, screenshots and Game Center setup (it also runs by itself when those files change).
7. **By hand in App Store Connect** (Apple's API doesn't cover these): App Privacy answers, price (Free) and availability, the App Review contact details. See `store/listing.md`.

If the upload stops with "The signed app is missing: …", the App ID lacks that capability: turn it on as in step 1 and run it again. If it fails at archiving with a signing error, try `ARCHIVE_SIGNING=automatic` (an Actions variable passed to `upload.sh`, see the script).

## Making a build by hand

GitHub → Actions → **iOS app** → Run workflow (branch `main`, "Upload to TestFlight" checked). About 10 minutes, then 5 to 15 for Apple to process it. Build numbers are the UTC date and time, so each upload is higher than the last. To release a new version, change `version` in `ios/release.json` (or `MARKETING_VERSION` in `project.yml`).

Pushes to `main` that change the app or `index.html` also run a simulator build without signing, to check that the app still compiles.

## Releasing from the repo

`ios/release.json` drives releases, so anyone with push access (or Claude) can ship without clicking through App Store Connect. When it changes on `main`, the **App Store release** workflow does what it says, then writes `ios/store/status.md` (versions, App Review state, recent builds, TestFlight groups) and commits it. Every 6 hours it refreshes the status. It does nothing until the secrets are set.

```json
{
  "version": "1.0",
  "build": true,
  "testflight": {"groups": ["Internal"], "whats_new": "What testers should try"},
  "app_store": {"submit": true, "release": "manual", "whats_new": "What's new (not allowed on 1.0)", "replace_in_review": false},
  "release_now": false
}
```

- `version`: the App Store version. A new number creates that version in App Store Connect.
- `build`: build the app from `main` and upload it as this version. `false` uses the newest processed build already uploaded for it.
- `testflight`: give the build to these TestFlight groups, with "What to Test". External groups need Apple's beta review, which this submits. `null` skips TestFlight.
- `app_store`: attach the build to the version, upload the listing and screenshots, and with `submit` send it to App Review. `release`: `manual` (release it yourself, or with `release_now`) or `after_approval`. `null` skips the App Store. Only one version can be in review at a time; while another is, this step waits and the 6-hourly run does it later.
- `release_now`: release a version that's approved and waiting for a manual release.

Any change to the file runs it again; change `note` to re-run with the same settings. Don't submit to App Review or release without the owner's go-ahead for that version.

To submit 1.0 for review once TestFlight looks good:

```json
"app_store": {"submit": true, "release": "manual"}
```

Not possible through Apple's API, so still done in App Store Connect: reading and answering App Review's messages, App Privacy answers, and agreements.

## Working on a Mac (optional)

```
brew install xcodegen
ios/scripts/prepare-web.sh && (cd ios && xcodegen generate) && open ios/KingWalk.xcodeproj
```

Run `prepare-web.sh` again after changing the game. Set your team in the target's Signing settings to run it on a phone.
