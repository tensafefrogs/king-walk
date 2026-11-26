# King Walk

A single-file chess puzzle game (`index.html`), live at https://kingwalk.app/ from `main` (GitHub Pages, deployed by `.github/workflows/pages.yml`), plus an iOS app in `ios/` and an Android app in `android/` (`android/README.md`; $0.99 on Google Play, in internal testing: a closed test of 12 testers for 14 days comes before production). It is separate from Spark, but the iOS wrapper and release tooling follow Spark's (tensafefrogs/spark, `ios/`).

How the repo fits together, how a change gets to `main`, and which check covers what: `docs/README.md` (one page; read it first).

## Working on it

- `main` is the website (and what the apps bundle), and it takes only a commit whose tests have already passed on GitHub: push to a branch, wait for its **Test** run to pass, then push the same commit to `main` (`git push origin HEAD:main`; the repository's rules refuse it otherwise). Test first: `node testing/parity.js` (seconds: the website, the iOS app and the Android app in step), `node testing/smoke.js` (plays puzzles on the web and in simulated iOS and Android apps) and `node testing/unit.js` (the rules one by one, and that every language has every string); GitHub runs all three on every push.
- The iOS app bundles `index.html` as it is on `main`, and so does the Android app. The page talks to either app through `APP` (`window.webkit.messageHandlers.kingwalk` on iOS, `window.KingWalkAndroid` on Android; `APP.os` says which); keep the web working when `APP` is null, and don't assume the app is the iOS one (iCloud, Game Center, App Store). The **Android app** workflow builds the Android app on such pushes and plays it on an emulator (`android/testing/device.js`): check it passes. A push to `main` that changes `ios/` or `index.html` runs a simulator build of the app (the **iOS app** workflow): check it passes.
- Anything new on screen (a card, a bar, a row, a dialog, new text) has to work in every layout: run `node testing/layout.js` before pushing. It checks phones upright and sideways (down to 320 wide), iPad full screen, Split View and Slide Over, desktop, iPhone Duo propped up (`?fold=h`) and held like a book (`?fold=v`), the app with the iPhone's biggest text sizes (`text-xxxl`, `text-ax5`: the app zooms the page, leaving as little as 201 CSS px), in long and tall languages, with every overlay open, and flags sideways scrolling, text spilling out, cards or buttons off screen and a board that doesn't fit. Look at its screenshots in `testing/out/`; for a quick pass, name the sizes (`node testing/layout.js en-US,de-DE phone-390-land,duo-book`).
- Text the player sees or hears goes through `T("English text")` and needs an entry in every language's table, `lang/<tag>.js` (unit.js checks). A player downloads only their own table; the loader at the top of the page's scripts lists the languages (`LANGS`). The regional tables `pt-PT` and `es-ES` only hold strings that differ from `pt` and `es`: add one there only if the new text reads differently in Portugal or Spain; `zh-Hant` (Traditional Chinese) is a whole table like the others.
- Saves from two devices (the app's iCloud copy): `betterSave` in `index.html` decides which to keep, and `SaveRank` in `ios/KingWalk/SaveRank.swift` is the same rule for the app. Both are checked against `testing/save-cases.json` (unit.js and the Test workflow's save-rank job), and `testing/sync-model.js` plays two devices through iCloud with the page's rule: a change to the rule goes in the cases.
- The three versions move together, and `testing/parity.js` checks what can be checked: a message the page sends an app (`APP.post({op})`) is handled by both apps (or listed in its `PLATFORM_ONLY`); the widgets' fields are the same on both; the Android app's own words come from the iOS app's translations (`android/scripts/strings.py`); every award is a Game Center and Play Games achievement; both apps carry the same version number (`ios/release.json`, `android/release.json`: bump both). A feature added to one app goes into the other in the same change, or into `CHANGELOG.md` as not there yet.
- The home screen widgets' data (`reportProgress` in `index.html`, op `widget`) is read by `ios/Shared/Progress.swift` and by `android/app/src/main/java/kingwalk/android/Progress.kt` (the same rules; `WidgetsTest.kt` tests them): a new or changed field goes into both.
- The icon, logos and favicon are drawn by `node scripts/icon.js` (see `brand/README.md`). The service worker serves fonts and icons from its cache first; the website build names that cache after their contents, so changing them needs nothing more.
- Puzzles are in `p/<band>/<k>.txt`, chunks of 300 a player downloads one at a time. After changing them, run `python3 scripts/puzzles.py`: it re-cuts the chunks and writes their counts and hashes into `index.html` (`PUZZLES`), and the service worker keeps each chunk until its hash changes. Add puzzles only at a band's end (`python3 scripts/puzzles.py --add <file>`); never edit, remove or reorder the ones already there: saves, second tries and the daily puzzle find puzzles by their place in the band, and the daily (which picks only from each band's first `DAILY_SIZES` puzzles, frozen) must match the app versions already out. parity.js fails on a change to a band's locked puzzles (`testing/puzzles.lock.json`); fields after the rating may change.
- Russian text uses the bundled Nunito Cyrillic fonts (`fonts/nunito-cyrillic-*`), also in place of Fredoka, which has no Cyrillic. Hebrew uses Fredoka's Hebrew letters and Rubik (for Nunito), Arabic uses Baloo Bhaijaan 2 for both, India's scripts its Baloo 2 sisters, Greek M PLUS Rounded 1c, Thai Mitr (Urdu uses the Arabic font); each is loaded only for text in its script (`unicode-range`). A new script needs the same, and the store captions pick them up from those rules.
- Arabic and Hebrew run right to left (`html[dir="rtl"]`): the page mirrors, the board and the chart don't. Write new CSS with logical properties (`margin-inline-start`, `inset-inline-end`) rather than left and right, flip direction-giving icons (`svg.flip`), and include `ar-SA` when you run the layout check on something new.
- Keep the owner's accounts and IDs out of the code: the GoatCounter address, site, bundle ID and App Store ID come from Actions variables through `config.js` and the build (README, "Your own copy").

## Where to look first

- What changed and what's waiting for the app: `CHANGELOG.md`. What's planned: `ROADMAP.md`.
- Where the app stands in App Store Connect: `ios/store/status.md`, which lives on the `status` branch (`python3 scripts/status.py fetch` puts it in place; rewritten by every release run and every 6 hours), then the run's log on GitHub (Actions → App Store release).
- App Store numbers (impressions, page views, downloads, sessions, units and proceeds by day): `ios/store/appstats.md`, on the same `status` branch, written by `ios/store/appstats.py` in the same runs.
- Releasing, its settings and what has gone wrong before: `ios/README.md`, "Releasing from the repo". The store listing and its languages: `ios/store/listing.md`.
- Languages: how they're loaded, how to add one and the brief for translators: `LANGUAGES.md`.
- The stats and what each event means: `testing/STATS.md`; `python3 testing/stats.py` (needs `GOATCOUNTER_TOKEN` and `GOATCOUNTER_URL`).
- Puzzles: `scripts/puzzles.py` (its docstring says how the chunks work).

## Mistakes to avoid (each has happened)

- Committing with a failing test: `main` refuses a commit whose Test run hasn't passed (the repository's ruleset; `docs/mistake-catalog.md` §2), so run the tests before pushing a branch to save a wait.
- The layout check in other languages: the Test workflow's `layout` job checks English and German at the sizes that break first on every push (`docs/mistake-catalog.md` §1). For a change that can break in a tall script or right to left (a card, a font, a language), run `node testing/layout.js` with `ja-JP,ar-SA` and those sizes (`phone-320,phone-375-land,ipad-slideover,duo-book,text-xxxl,text-ax5`); `LAYOUT_OUT=<folder>` per run lets several run at once.
- Assuming Chromium shows what an iPhone does: Safari and the app's web view zoom, pick fonts and treat safe areas differently. The layout check can't see a zoom; a player's screenshot can. Ask for one.
- Asking an App Store action in an ambiguous way: get a clear go-ahead naming the version before submitting or releasing, and say exactly what will happen.

## Keep the store materials current

After any change that alters what's on screen (layout, text in the panels, colors, the board, pieces), regenerate the store screenshots in the same change and look at them before committing:

```
node ios/store/screenshots.js      # iPhone, iPad, iPhone Duo, and Google Play's Android phone and tablet
python3 scripts/press-kit.py       # the press page's small copies
python3 scripts/producthunt.py     # the Product Hunt gallery and thumbnail
```

If a change makes a caption in `ios/store/screenshots.js` untrue, update it. The listing text is in `ios/store/listing.json` (described in `ios/store/listing.md`); keep it in step with the game (puzzle count, features). The header art is `node ios/store/header.js` (`--play` for Google Play's feature graphic only), the app preview and trailers `node scripts/trailer.js` (`--preview`, `--vertical`), the 3D sizzle reel `node scripts/sizzle.js` (`--vertical`; its scene is `scripts/sizzle/scene.html`, its music `scripts/sizzle/music.py`); re-record them when the game's look changes noticeably, and watch them before publishing. The videos aren't in main's history (they'd add tens of MB to every clone each time): `python3 scripts/media.py publish` puts them on the `media` branch and updates `media.json`, which you commit; `python3 scripts/media.py fetch` gets them (the website and App Store workflows do). The press kit is `press/index.html` (linked from the menu); keep its description and facts in step with the listing. Google Play's listing is `android/store/listing.json` (English; the other languages are made from the iOS ones by `android/store/listing.py`), uploaded by the Google Play listing workflow when it or its pictures change.

## Player stats

The game sends anonymous events to GoatCounter. `testing/STATS.md` lists each event and how to read them. If you add, rename or remove a `track()` call, update `testing/STATS.md` and the events list in `README.md`, and check `privacy.html` still describes them.

## iOS releases

Every change a player would notice goes into `CHANGELOG.md` under **Unreleased** in the same commit (say whether it's live on the website or waits for the app). When an app version is submitted, move its part under that version's heading and draft its What's New from there; the owner reads it to plan release notes and posts between releases.

The launch checklist and post drafts are in `ios/store/launch.md`. To ship, edit `ios/release.json` and push to `main`; the App Store release workflow builds, uploads, submits and releases as it says (fields in `ios/README.md`, "Releasing from the repo"). `ios/store/status.md` shows where the app stands. Don't submit for review or release to the App Store without the owner's go-ahead for that version.

## Game Center

The page calls `achieve(id)` and reports scores in `reportProgress()`. The ids are listed in `ios/store/gamecenter.json` (with the `kingwalk.` prefix added by the app) and must match App Store Connect. Achievements can't be deleted or have their points changed once live.
