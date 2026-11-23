# How the repo works

The short version, for whoever picks up the next change (people or Claude). Details live in the files named.

## The pieces

- `index.html`: the whole game, one file. `lang/<tag>.js` holds the translations, `p/` the puzzles, `sw.js` the
  offline cache, and `config.js` the owner's IDs (written by the build).
- `ios/` and `android/`: apps that show the same page in a web view and add native features. The page talks to
  them through `APP.post({op})`.
- `ios/store/`, `android/store/`, `press/`, `scripts/`: store listings, screenshots, videos and the scripts that
  make and upload them.
- `.github/workflows/`:
  - `test.yml`: the checks below, on every push.
  - `pages.yml`: the website, from `main`.
  - `ios.yml`, `android.yml`: app builds.
  - `release.yml`, `store.yml`, `play-listing.yml`: App Store and Google Play releases and listings.
- Branches besides `main`: `media` (videos), `status` (where the app stands in App Store Connect) and
  `android-screenshots`. Workflows write them; don't work on them.

## Getting a change out

1. Work on a branch, `claude/work` for Claude.
2. Push it, and wait for its Test run to pass.
3. `git push origin HEAD:main`. A ruleset refuses `main` any commit whose required checks haven't passed.

The website deploys from `main` in about a minute. App releases are separate: edit `ios/release.json` or
`android/release.json`, and only with the owner's go-ahead for that version.

## Checking a change

| What changed | Run | Also in CI |
|---|---|---|
| Anything | `node testing/parity.js` (seconds): website and both apps in step, release.json, store scripts, saves model, committed files, the puzzle bands, every stat documented, the coach's kinds | `smoke` |
| Game behaviour (the coach included) | `node testing/smoke.js` (plays puzzles on the web and in simulated apps), `node testing/unit.js` (3.5 min, on a fixed clock) | `smoke` |
| Anything on screen | `node testing/layout.js <langs> <sizes>` (screenshots in `testing/out/`) | `layout` (en, de; 6 sizes) |
| The daily puzzle, practice sets, rank streaks | `node testing/daily-model.js` (random play across days) | `daily-model` |
| Save rules | `testing/save-cases.json` (both rules), `node testing/sync-model.js` | `save-rank` (Swift) |
| Release scripts | `python3 ios/store/release_config.py`, `check_pages.py`, `release_model.py` | via parity |
| The Android app | `android/testing/device.js` (emulator) | `android.yml` (not required; the emulator is flaky) |
| The iOS app | — | `ios.yml` simulator build |

Each check is there because a mistake slipped through once. `docs/mistake-catalog.md` lists the mistakes, the
checks, and what's still checked only by hand (Safari's zoom, real-device screenshots).

## Where else to look

- `CLAUDE.md`: the working rules.
- `CHANGELOG.md`: what shipped and what's waiting.
- `ROADMAP.md`: what's next.
- `ios/README.md`, `android/README.md`: building and releasing.
- `LANGUAGES.md`: translations.
- `testing/STATS.md`: the anonymous stats.
