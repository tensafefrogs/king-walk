# Player stats

The game sends a few anonymous events to GoatCounter (no cookies, nothing linked to a person), on the GoatCounter site named in the `GOATCOUNTER_URL` Actions variable. This page lists them and how to read them. The privacy policy (`privacy.html`) describes them for players; keep it in step.

## Events

Every event is named `<prefix>/<event>`. The prefix is `king-walk` for the website, `king-walk-ios` for the iOS app from the App Store, `king-walk-testflight` for the iOS app from TestFlight or Xcode (since 1.0.5; older TestFlight builds counted as `king-walk-ios`, so testers made up most of its launch-week players; `--testflight` alone) and `king-walk-android` for the Android app (not on Google Play yet; `testing/stats.py` shows it beside the others once it has counts, or alone with `--android`). Events are only sent where the GoatCounter address is set (the `GOATCOUNTER_URL` Actions variable, written into `config.js`); a copy of the repo sends none. The website's page view is counted too (`/king-walk/`); the app doesn't count one.

| Event | Sent when | Code (index.html) |
| --- | --- | --- |
| `start` | The first launch on a device with no save | startup |
| `platform/<name>` | Same moment as `start`, with the device. Web: `iphone`, `ipad`, `android-phone`, `android-tablet`, `windows`, `mac`, `linux`, `chromeos`, `other`. iOS app: `iphone`, `ipad`, `mac` (the iPad app on a Mac) | `PLATFORM` |
| `lang/<code>` | Same moment as `start`: the language the game shows (`en`, `es`, `fr`, `de`, `it`, `pt`, `nl`, `ru`, `ja`, `ko`, `zh`, `ar`, `he`, and from November 2026 `hi`, `mr`, `ur`, `bn`, `gu`, `pa`, `ta`, `te`, `kn`, `ml`, `or`, `th`, `tr`, `id`, `ms`, `vi`, `pl`, `cs`, `sk`, `sl`, `hr`, `uk`, `el`, `ro`, `hu`, `ca`, `sv`, `da`, `nb`, `fi`; and the regional `zh-Hant`, `pt-PT`, `es-ES`) | startup |
| `lang-wanted/<code>` | Same moment as `start`, only when the player's first language isn't one the game has (`sw`, `fa`, `tl`…; the game then shows their next listed language it has, or English). Which language to add next | startup |
| `lang-chosen/<tag>` | The player picks a language in Settings (`device`: back to the device's). How many prefer a language other than their device's | Settings |
| `played/<n>` | The player finishes their nth rated puzzle, for n = 1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500 | `finish()` |
| `rank/<name>` | The player reaches a rank for the first time: `knight`, `bishop`, `rook`, `queen`, `king` | `finish()` |
| `placed/<name>` | A new player's placement ends (their first puzzles found their level), with the rank they placed at: `pawn` … `king`. The ranks passed on the way also count as `rank/...` | `finish()` |
| `back/1d`, `back/7d`, `back/30d` | The game is opened 1, 7 or 30 days or more after the player's first visit (once each) | startup |
| `mode/<easy\|normal\|hard>` | The puzzle difficulty is changed (shown as Relaxed, Balanced, Challenging) | the difficulty buttons |
| `hint/1`, `hint/2` | The first (the piece) and second (the arrow) hint on a move; each of the player's moves has its own two since 1.0.5 (23 Nov 2026), so a puzzle can send several (before, at most one of each per puzzle) | `showHint()` |
| `answer` | Answer pressed: the solution is shown | `showAnswer()` |
| `save/unread` | The save on this device couldn't be read and the game started fresh; the save was kept as it was under `chess-climb-v1-unread` (once) so it can be recovered. Any count is a bug to look into | `loadLocal()` |
| `review/up/<step>`, `review/same/<step>`, `review/reset/<step>`, `review/learned/<step>` | A spaced-repetition review finished (since 26 Nov 2026 on the website; the apps from 1.0.6). `<step>` is where it was (0 to 4: due after 1, 3, 7, 14, 30 days); up: solved cleanly and quickly, so the next, longer gap; same: slowly or with a hint; reset: missed, back to 1 day; learned: solved at the last step, off the list. The share solved at each step is the evidence for spaced repetition working | `finish()` |
| `share` | Share is pressed (under the board after a puzzle, or in the menu) | `shareProgress()` |
| `share/daily` | Share pressed after the daily puzzle (its coloured squares); `share` is then everything else (the progress summary) | `shareProgress()` |
| `award/<id>` | An award is earned for the first time (the ids in `ios/store/gamecenter.json`, e.g. `award/rank_knight`, `award/clear_pawn`) | `checkAwards()` |
| `share/award` | Share is pressed on an award's celebration screen | `celebrate()` |
| `share/placed` | Share is pressed on the card that says where a new player placed | `showPlaced()` |
| `fold/table`, `fold/book` | The screen is folded across like a laptop, or top to bottom like a book (iPhone Duo or another foldable), once per fold | `foldLayout()` |
| `run/start/<rank>` | A rank streak starts (`pawn` … `king`) | `startRun()` |
| `run/end/<rank>/<n>` | A rank streak ends on a miss after n solves | `finishRun()` |
| `run/cleared/<rank>` | All 15 puzzles of a rank streak solved | `finishRun()` |
| `run/quit/<rank>` | End streak pressed during a run | the End streak button |
| `coach/ready` | The coach card first shows strong and weak areas on this device (about 30 puzzles, 3 areas known) | `renderCoach()` |
| `coach/open` | All areas opened on the coach card | the All areas line |
| `coach/practice` | A practice session starts (Practise my weak spots, or Practise again): 10 mixed puzzles, about 6 from the weak areas. Since 26 Nov 2026 (website; the apps from 1.0.6); before, `coach/practice/<area>`, one area per set: don't add the two together in a report | `startPractice()` |
| `coach/practice-done/<n>` | A practice session ends, n of 10 solved (before 26 Nov 2026: `coach/practice-done/<area>/<n>`) | `stepPractice()` |
| `coach/practice-quit` | A practice session ended early (its chip, "Practice 3/10 ✕", then End practice; before 26 Nov 2026: `coach/practice-quit/<area>`) | `askEndPractice()` |
| `coach/choice/<coached\|any>` | The puzzle choice, once per device at startup, then each time it's changed in Settings | startup, the Puzzle choice buttons |
| `coach/holdback` | This player is in the holdback (started on Any kind; about 1 new player in 10), once per device | startup |
| `coach-back/1d`, `coach-back/7d`, `coach-back/30d` | As `back/...`, for players on Coached | startup |
| `daily/start` | Today's daily puzzle starts | `startDaily()` |
| `daily/resume` | Today's daily puzzle starts again after leaving it | `startDaily()` |
| `daily/later` | The player leaves the daily puzzle before finishing it | `leaveDaily()` |
| `daily/continue` | Continue is pressed on the daily's Paused cover: after the game was in the background, or when a daily left earlier is opened again | `resumeDaily()` |
| `daily/pause` | The daily's clock (in the status bar) is tapped to pause it | the clock's tap handler |
| `daily/solved` | The daily puzzle solved (hints and wrong tries allowed) | `finishDaily()` |
| `daily/missed` | The daily puzzle's answer shown | `finishDaily()` |
| `daily/missed/tried`, `daily/missed/untried` | With `daily/missed` (since 26 Nov 2026, website; the apps from their next version): the player made a move or took a hint first (found it too hard), or showed the answer without either (didn't know how to play it, or tapped Answer by mistake) | `finishDaily()` |
| `daily/start/new-player` | With `daily/start`: the player had played no puzzle before this daily, so hadn't seen the first puzzle's how-to-move tip (since 26 Nov 2026) | `startDaily()` |
| `daily/streak/<n>` | The daily streak reaches 3, 7, 14, 30, 50, 100 or 365 days | `finishDaily()` |
| `daily/practice` | Try again on a finished daily: practice, which doesn't change the day's result | the Try again button |
| `daily/done-card` | The "Today's puzzle: done" card shown (Daily tapped, or a widget, Siri or a reminder opened the game, after today's puzzle) | `showDailyDone()` |
| `link/daily` | The website opened from a shared daily result's link (`#daily`) | startup |
| `open/daily` | The app asked for the daily: a widget, Control Center, Siri, the quick action or a reminder (also the `#daily` link followed with the game already open) | `kingWalkOpen()` |
| `daily/freeze-earned` | A streak freeze earned (every 7 days in a row, up to 2 held) | `finishDaily()` |
| `daily/freeze-used` | Streak freezes used to cover skipped days (sent once per catch-up) | `checkFreezes()` |
| `inapp/shown/<app>`, `inapp/open/<app>`, `inapp/close` | The game opened inside a social app's own browser (X, Instagram, Facebook, TikTok…) and showed the line saying progress stays there; the player tapped Open in Safari (or Chrome); or hid it for good. Which apps bring players, and how many move to their own browser | startup |
| `promo/<where>/shown`, `promo/<where>/tap` | The website suggested the iPhone app, and the suggestion was followed. `<where>`: `bar` (the slim bar in Chrome, Firefox or Edge on iPhone and iPad), `daily` (a line on the daily's done card), `streak` (on a daily streak's achievement), `settings` (the app-only settings), `save` (Advanced), `foot` (the quiet bar at the end of the page, always there, so it has no `shown`; on computers it has a QR code to scan with an iPhone, and a tap there may be a Mac with Apple silicon opening the Mac App Store). At most one a week, each at most once a month; app owners (followed a link, or came from the app) at most one a month; iPhone, iPad and computers (from 20 November 2026; before, iPhone and iPad only), never Android. `platform/<device>` tells them apart | `promoBar()`, `promoLine()`, `promoFoot()` |
| `promo/bar/close`, `promo/foot/close` | The top bar's or the bottom bar's × (hides the suggestions for a month) | `promoBar()`, `promoFoot()` |
| `tip/closed` | The first puzzle's hint closed with its × (it also goes on the first move) | the hint |
| `remind/<hour>`, `remind/off` | The daily reminder set to an hour (8, 12, 18, 20) or turned off (app only) | the Daily reminder setting |
| `remind/offered`, `remind/offer-yes` | The app's done card offered a daily reminder (a daily streak of 3, reminders off; once per device), and the player took it (6 pm). How many the offer turns into reminders | the daily's done card |
| `lefty-on`, `lefty-off` | The Left-handed layout setting is turned on or off | menu |
| `gamecenter` | The Game Center button is pressed (app only) | menu |
| `rate-ask` | The app asks iOS to show the rating prompt (iOS may not show it) | `maybeAskForRating()` |
| `sound-off`, `haptics-off` | Sound or haptics turned off | menu |
| `sound/restart` | The game's sound had gone silent (iOS stopped the audio after an interruption) and was started again on a tap | `wakeAudio()` |
| `reset` | Start over | menu |
| `save-code/copy`, `save-code/load` | The save code is copied or loaded | menu → Advanced |
| `icloud/newer` | The app found more progress in iCloud (another device played) and switched to it | `kingWalkCloud()` |

## Reading them

- **Funnel:** `start` → `played/1` → `played/10` → `played/50` → `played/100`. The drop from `start` to `played/1` shows people who left before finishing a puzzle; from `played/1` to `played/10`, people who tried it and didn't stay.
- **Retention:** `back/1d`, `back/7d` and `back/30d` as a share of `start` from the period before (a week earlier for `back/7d`).
- **Difficulty:** how many reach each `rank/...`, and `mode/easy` versus `mode/hard`. Since placement (November 2026), `placed/...` against `start` shows where new players begin; fewer `mode/hard` from new players is the sign it's working.
- **The coach:** `coach-back/7d` against `back/7d` (Coached returns as a share of all returns), with `coach/holdback`
  against `coach/choice/any` for the holdback's size: if Coached players come back more than the holdback, the coach
  helps. `coach/practice-done/<n>` shows whether practice sessions go well (most should land around 6 to 8 of 10).
- **Platforms:** `platform/...` counts, and the web against the apps (`king-walk/` against `king-walk-ios/` and `king-walk-android/`).

GoatCounter counts unique visitors per event per day, so treat the numbers as approximate. Events made offline wait on the device (at most 1000, none older than 7 days) and are sent once it's back online, one every half second (GoatCounter takes at most 4 a second from a player), so they're counted on the day they arrive: a day's counts can include some of the week before. Open the GoatCounter dashboard and filter by `king-walk`.

If you add, rename or remove a `track()` call, update this page and the events list in `README.md`.

## The report

`python3 testing/stats.py` prints the funnel (new players, coming back, puzzles played, ranks), the daily puzzle, every achievement (from `ios/store/gamecenter.json`), rank streaks, hints, sharing and settings, for the website and the app side by side. It needs `GOATCOUNTER_TOKEN` (GoatCounter > Settings > API, "Read statistics" only) and `GOATCOUNTER_URL` (the count address the website uses) in the environment. `--days 30`, `--since`/`--until`, `--web` or `--app` change what it shows.

## Moving to another GoatCounter site

King Walk moved to its own site, kingwalk.goatcounter.com, on 20 November 2026 (the website that day, the app from 1.0.4),
and its history from the shared site (geoffstearns.goatcounter.com) up to 19 November was imported there. App builds
from before the move (1.0.3 and older) keep sending to the shared site until players update: in their first week that
was more than half the app's new players. So the report reads both, the shared site only from the first day not
imported:
`GOATCOUNTER_URL="https://kingwalk.goatcounter.com/count https://geoffstearns.goatcounter.com/count@2026-11-20"`.
Without the `@` date the days before the move would count twice. To import the shared site's later events instead,
export it (Settings > Export), run `python3 -I scripts/goatcounter-filter.py <export.zip> <out.zip> --since <the first
day not imported>`, import `out.zip` in the kingwalk site, and move the `@` date past it. Imports so far: everything up
to 19 November 2026 (checked day by day: from 20 November each site has its own events).

The website and the app send to the address in the `GOATCOUNTER_URL` Actions variable, read when they're built (the
website on every push, the app with each build). To move King Walk to a site of its own:

1. In GoatCounter, add the site (for example `kingwalk`, giving `https://kingwalk.goatcounter.com/count`), and under its
   Settings → API make a token that can only read statistics.
2. Change `GOATCOUNTER_URL` in the repository's Actions variables to the new address, and push anything (or run the
   **Website** workflow) so the website picks it up. The app sends there from the next build.
3. Bring the history over: export the old site and import King Walk's part in the new one
   (`scripts/goatcounter-filter.py`). App versions built before the change keep sending to the old site until players
   update; import their events later the same way, with `--since` so nothing is imported twice. (The report can also
   add sites together, `GOATCOUNTER_URL="<new> <old>@<first day not imported>"`; without the date it counts the imported
   history twice.)
4. Update `privacy.html` if it names the GoatCounter site.
