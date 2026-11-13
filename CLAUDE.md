# King Walk

A single-file chess puzzle game (`index.html`), live at https://geoffstearns.com/king-walk/ from `main` (GitHub Pages, deployed by `.github/workflows/pages.yml`), plus an iOS app in `ios/`. It is separate from Spark, but the iOS wrapper and release tooling follow Spark's (tensafefrogs/spark, `ios/`).

## Working on it

- Push to `main` to release the website. Test first: `node testing/smoke.js` (plays puzzles on the web and in a simulated iOS app; GitHub runs it on every push).
- The iOS app bundles `index.html` as it is on `main`. The page talks to the app through `APP` (`window.webkit.messageHandlers.kingwalk`); keep the web working when `APP` is null. A push to `main` that changes `ios/` or `index.html` runs a simulator build of the app (the **iOS app** workflow): check it passes.
- Check layouts at phone (portrait and landscape), iPad portrait and landscape, desktop, and iPhone Duo propped up (`?fold=h` at 951x669) after layout changes.
- Keep the owner's accounts and IDs out of the code: the GoatCounter address, site, bundle ID and App Store ID come from Actions variables through `config.js` and the build (README, "Your own copy").

## Keep the store materials current

After any change that alters what's on screen (layout, text in the panels, colors, the board, pieces), regenerate the store screenshots in the same change and look at them before committing:

```
node ios/store/screenshots.js      # iPhone, iPad and iPhone Duo
python3 scripts/press-kit.py       # the press page's small copies
```

If a change makes a caption in `ios/store/screenshots.js` untrue, update it. The listing text is in `ios/store/listing.json` (described in `ios/store/listing.md`); keep it in step with the game (puzzle count, features). The header art is `node ios/store/header.js`, the app preview and trailers `node scripts/trailer.js` (`--preview`, `--vertical`); re-record them when the game's look changes noticeably, and watch them before committing. The press kit is `press/index.html` (not linked from the game); keep its description and facts in step with the listing.

## Player stats

The game sends anonymous events to GoatCounter. `testing/STATS.md` lists each event and how to read them. If you add, rename or remove a `track()` call, update `testing/STATS.md` and the events list in `README.md`, and check `privacy.html` still describes them.

## iOS releases

To ship, edit `ios/release.json` and push to `main`; the App Store release workflow builds, uploads, submits and releases as it says (fields in `ios/README.md`, "Releasing from the repo"). `ios/store/status.md` shows where the app stands. Don't submit for review or release to the App Store without the owner's go-ahead for that version.

## Game Center

The page calls `achieve(id)` and reports scores in `reportProgress()`. The ids are listed in `ios/store/gamecenter.json` (with the `kingwalk.` prefix added by the app) and must match App Store Connect. Achievements can't be deleted or have their points changed once live.
