# Player stats

The game sends a few anonymous events to GoatCounter (no cookies, nothing linked to a person), on the GoatCounter site named in the `GOATCOUNTER_URL` Actions variable. This page lists them and how to read them. The privacy policy (`privacy.html`) describes them for players; keep it in step.

## Events

Every event is named `<prefix>/<event>`. The prefix is `king-walk` for the website and `king-walk-ios` for the iOS app. Events are only sent where the GoatCounter address is set (the `GOATCOUNTER_URL` Actions variable, written into `config.js`); a copy of the repo sends none. The website's page view is counted too (`/king-walk/`); the app doesn't count one.

| Event | Sent when | Code (index.html) |
| --- | --- | --- |
| `start` | The first launch on a device with no save | startup |
| `platform/<name>` | Same moment as `start`, with the device. Web: `iphone`, `ipad`, `android-phone`, `android-tablet`, `windows`, `mac`, `linux`, `chromeos`, `other`. iOS app: `iphone`, `ipad`, `mac` (the iPad app on a Mac) | `PLATFORM` |
| `played/<n>` | The player finishes their nth rated puzzle, for n = 1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500 | `finish()` |
| `rank/<name>` | The player reaches a rank for the first time: `knight`, `bishop`, `rook`, `queen`, `king` | `finish()` |
| `back/1d`, `back/7d`, `back/30d` | The game is opened 1, 7 or 30 days or more after the player's first visit (once each) | startup |
| `mode/<easy\|normal\|hard>` | The puzzle difficulty is changed | the difficulty buttons |
| `share` | Share is pressed (under the board after a puzzle, or in the menu) | `shareProgress()` |
| `award/<id>` | An award is earned for the first time (the ids in `ios/store/gamecenter.json`, e.g. `award/rank_knight`, `award/clear_pawn`) | `checkAwards()` |
| `share/award` | Share is pressed on an award's celebration screen | `celebrate()` |
| `fold/table`, `fold/book` | The screen is folded across like a laptop, or top to bottom like a book (iPhone Duo or another foldable), once per fold | `foldLayout()` |
| `run/start/<rank>` | A rank streak starts (`pawn` … `king`) | `startRun()` |
| `run/end/<rank>/<n>` | A rank streak ends on a miss after n solves | `finishRun()` |
| `run/cleared/<rank>` | All 15 puzzles of a rank streak solved | `finishRun()` |
| `run/quit/<rank>` | End streak pressed during a run | the End streak button |
| `daily/start` | Today's daily puzzle starts | `startDaily()` |
| `daily/resume` | Today's daily puzzle starts again after leaving it | `startDaily()` |
| `daily/later` | The player leaves the daily puzzle before finishing it | `leaveDaily()` |
| `daily/solved` | The daily puzzle solved (hints and wrong tries allowed) | `finishDaily()` |
| `daily/missed` | The daily puzzle's answer shown | `finishDaily()` |
| `daily/streak/<n>` | The daily streak reaches 3, 7, 14, 30, 50, 100 or 365 days | `finishDaily()` |
| `daily/freeze-earned` | A streak freeze earned (every 7 days in a row, up to 2 held) | `finishDaily()` |
| `daily/freeze-used` | Streak freezes used to cover skipped days (sent once per catch-up) | `checkFreezes()` |
| `app-promo` | The website's "Also on iPhone and iPad" App Store link tapped (shown on Apple devices once the app is on sale) | the line under Progress |
| `tip/closed` | The first puzzle's hint closed with its × (it also goes on the first move) | the hint |
| `remind/<hour>`, `remind/off` | The daily reminder set to an hour (8, 12, 18, 20) or turned off (app only) | the Daily reminder setting |
| `lefty-on`, `lefty-off` | The Left-handed layout setting is turned on or off | menu |
| `gamecenter` | The Game Center button is pressed (app only) | menu |
| `rate-ask` | The app asks iOS to show the rating prompt (iOS may not show it) | `maybeAskForRating()` |
| `sound-off`, `haptics-off` | Sound or haptics turned off | menu |
| `reset` | Start over | menu |
| `save-code/copy`, `save-code/load` | The save code is copied or loaded | menu → Advanced |

## Reading them

- **Funnel:** `start` → `played/1` → `played/10` → `played/50` → `played/100`. The drop from `start` to `played/1` shows people who left before finishing a puzzle; from `played/1` to `played/10`, people who tried it and didn't stay.
- **Retention:** `back/1d`, `back/7d` and `back/30d` as a share of `start` from the period before (a week earlier for `back/7d`).
- **Difficulty:** how many reach each `rank/...`, and `mode/easy` versus `mode/hard`.
- **Platforms:** `platform/...` counts, and the web against the app (`king-walk/` against `king-walk-ios/`).

GoatCounter counts unique visitors per event per day, so treat the numbers as approximate. Open the GoatCounter dashboard and filter by `king-walk`.

If you add, rename or remove a `track()` call, update this page and the events list in `README.md`.
