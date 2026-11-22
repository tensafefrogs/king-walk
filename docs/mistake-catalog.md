# Mistake catalog

Mistakes that have happened more than once in this repo, or once with real harm, and what will stop each one.
Phase 1 of "make repeated mistakes impossible": this file lists the mistakes and proposes checks. Nothing is
enforced yet beyond what the "Status" lines say.

Sources (read 2026-11-22):
- all 292 commits on `main` (the repo is 10 days old, so "the last 12 months" is all of it) and the diffs of the fix
  commits;
- the logs of every failed GitHub Actions run (Test, App Store release, App Store listing, Android app; the iOS app,
  website and Google Play listing workflows have never failed);
- `CLAUDE.md`, `ios/README.md` ("Things that have gone wrong") and the code comments with never, don't, must,
  always or TODO.

There are no pull requests or review comments: every change was pushed straight to `main`.

Commit hashes are the current ones on `main`. The video history was rewritten on 2026-11-21, so the hashes in the
Actions run list differ for older runs. Where a run is cited, its current commit is named by subject.

## Ranking

Score = how often × how bad. Sections below keep their own numbers (§); the table is in rank order. Classes with one occurrence stay in when it was a data loss, a production incident or a failed release, as the scope rules allow. How bad: 3 means players or the App Store were affected; 2 means a release or
deploy failed or was blocked; 1 means only CI or the developer lost time.

| Rank (section) | Mistake class | Times | How bad | Score | Proposal | Level |
|---|---|---|---|---|---|---|
| 1 (§1) | A screen size or text size breaks the layout | 11 | 3 | 33 | Enforced: the Test workflow's `layout` job | test |
| 2 (§2) | Pushes to `main` while the tests fail; the website deploys anyway | 9 runs (4 causes) | 3 | 27 | `main` takes only commits whose tests passed (ruleset); no workflow pushes to `main` | architecture |
| 3 (§3) | The release scripts assume what App Store Connect returns or accepts | 9 | 2–3 | 22 | Enforced: all_pages + check_pages.py; release_model.py | architecture + lint + model |
| 4 (§5) | Daily puzzle state across days, pauses and links | 6 | 3 | 18 | Enforced: testing/daily-model.js (`daily-model` job) | model |
| 5 (§4) | `ios/release.json` has text App Store Connect refuses | 4 runs | 2 | 8 | Enforced: release_config.py, run on every push | parse at the boundary |
| 6 (§9) | Files that don't belong in git | 3 | 2–3 | 8 | Enforced: parity.js checks what git holds | lint |
| 7 (§12) | A string missing from a language | 2 | 2 | 4 | Already enforced (unit.js); §2 stops it reaching the site | test |
| 8 (§7) | Two devices' saves: the wrong copy wins | 1 (lost progress) | 3 | 3 → kept, data loss | Enforced: save-cases.json for both rules; sync-model.js | test + model |
| 9 (§8) | Submitting to the App Store without the owner's go-ahead | 1 | 3 | 3 → kept, production incident | Not enforced: the owner's decision | — |
| 10 (§6) | Tests that depend on today's date | 2 | 1 | 2 | Enforced: unit.js on a fixed clock | architecture (tests) |
| 11 (§10) | A workflow uses a file it didn't fetch | 1 run (a release) | 2 | 2 → kept, release failed | Already enforced (parity.js) | test |
| 12 (§11) | The website and the two apps drift apart | 1+ | 2 | 2 | Already enforced (parity.js) | test |

Skipped, with reasons, after the table's classes: the Android emulator falling over in CI, WebView and Safari
differences, stale store screenshots, a CSS class name clash, owner IDs in code, reordering puzzle bands, and
CHANGELOG and stats docs.

CI time today: the Test workflow takes about 5 minutes. 20% is about 1 minute, so the new checks have to stay
inside that on the Test workflow, or run as a separate job that runs at the same time.

---

## §1. A screen size or text size breaks the layout

**What goes wrong:** something new fits the sizes it was tried at, then spills, scrolls or runs off screen at
another size (phone sideways, the smallest phones, large text, older iPads, long languages).

**Where:**
- `16b632a`: phone on its side, the board off the bottom.
- `adf7899`: cards on a phone on its side, the buttons fell off the screen.
- `570c714`: cards on the smallest phones.
- `1fa8888`: rank badges on narrow rows.
- `a12e11a`: the rank streak badges fold into one row.
- `5b4ea9b`: the daily done buttons when the row wraps.
- `9d2a3c9`: the button row with long labels.
- `0719156`: largest text sizes, things off the side.
- `2b61523`: larger text zooming the app off screen (a player's report).
- `7e3c60a`: celebration titles breaking mid-word.
- `fd44f9a`: the slight scroll on an older iPad sideways (the owner's photo).

**How it was caught:** player and owner screenshots (`2b61523`, `fd44f9a`, the zoom in `0719156`), otherwise by
looking at screenshots by hand. `testing/layout.js` (from `1fa8888`) catches most of these, but it takes about 12
minutes per language for every size, so it runs by hand and isn't in CI.

**Status: enforced** (test), as the Test workflow's `layout` job.
- It runs `testing/layout.js` in English and German at the sizes that broke before: `phone-320`,
  `phone-375-land`, `ipad-slideover`, `duo-book`, `text-ax5` and `app-ipad-10-land`. Each size is its own process,
  all at once: 46 seconds locally.
- It runs beside the `smoke` job, so a push waits no longer than before. On failure, the job keeps the screenshots
  as an artifact.
- layout.js gained two app sizes with the iPad status bar's safe area (`app-ipad-9-land`, `app-ipad-10-land`),
  through Chrome's `Emulation.setSafeAreaInsetsOverride`.

Why a test: the layout depends on the browser's rendering, which no type or lint rule can see.

**Proof:**

```
adf7899^ phone-375-land en-US   problems in 5 views:
  3 | .cele-card does not fit                | done-card rank-card award-card
  3 | .cele-card button off screen: .sh / .go | done-card rank-card award-card
  2 | board not fully on screen              | base daily
adf7899  phone-375-land en-US   no layout problems found
```

**Unproven:** the older iPad's slight scroll (`fd44f9a`). With the safe area emulated, the board fits inside the
screen both before and after the fix (bottom at 754 of 810 before, 708 after), and the page scrolls by design in
both (there's content below the board). The scroll came from the app's web view, which Chromium doesn't reproduce.
That case stays with a player's screenshot.

**Limits:** Chromium can't see Safari's zoom (`0719156`) or the app's text-size zoom exactly.

**To do for the owner:** add `layout` to the ruleset's required checks beside `smoke`, so a layout problem also
keeps a commit off `main`.

## §2. Pushes to `main` while the tests fail; the website deploys anyway

**What goes wrong:** a commit that fails the Test workflow is pushed to `main`, and `pages.yml` deploys it to
kingwalk.app anyway, because the deploy doesn't wait for the tests.

**Where:** 9 failed Test runs, 4 causes:
- `9d2a3c9`: the keyboard smoke test heard the wrong announcement.
- `7ef9672`: 4 new strings missing from 10 languages.
- `48d589d`, `fada6d7`, `95a9d9e`, `5928e88`, `f2de9c9`, `a3864da`: six pushes in a row, all red, on a freeze test
  that depended on the date (see §6). The fix came in `49c0bf4`.
- `c60539e`: the daily share text changed and the unit test didn't; fixed in the follow-up `17549af`.

CLAUDE.md already says "Committing with a failing test" is a mistake that happened. It is prose only.

**How it was caught:** the Test workflow, after the push. Each time, the website was already deployed.

**Decision (owner, 2026-11-22):** require the tests before `main`.

**Enforcement (architecture):** a repository ruleset on `main` requires the Test workflow's check (`smoke`, the job
that runs parity, smoke and unit) to have passed. GitHub then refuses any push to `main` of a commit whose check
hasn't passed on another branch first. Work goes to a branch; once its Test run is green, the same commit is pushed
to `main` (or merged through a PR). Nobody is on the bypass list, so an agent pushing with the owner's credentials
is held to it too.

Why this level: a red commit can't reach `main`, so the deploy, the 6-hourly rebuild and the app builds (which
bundle `main`) all get only tested code. No deploy-ordering change is needed.

What it needed first: the App Store release workflow committed `ios/store/status.md` to `main` from Actions every 6
hours, which the ruleset would refuse. That file now lives on its own `status` branch (`scripts/status.py`, as
`scripts/media.py` does for the videos), and parity.js fails any workflow that pushes to `main`:

> release.yml pushes only to its own branch, never main (push to HEAD:<branch>, as scripts/status.py does; main
> refuses commits whose tests haven't passed)

That check, run on `main`'s release.yml before this change (`3108604`): `22 passed, 1 failed`, the line above; after:
`23 passed, 0 failed`.

The ruleset itself is a repository setting, which only the owner can create (steps in the PR).

**CI time:** none added to the Test workflow. A change waits for its Test run (about 5 minutes) before it can go
to `main`.

**Status: enforced** (the owner created the ruleset on 2026-11-22: required check `smoke`, no bypass).

**Proof:** `c60539e`'s mistake recreated on a branch from `main` (`2433f3c`: the share's first line changed,
`testing/unit.js` not). Pushed straight to `main`, a fast-forward, before its tests had run:

```
! [remote rejected] HEAD -> main (push declined due to repository rule violations)
- Required status check "smoke" is expected.
```

After its Test run:

```
FAIL the daily share: number and weekday ..., streak "♟️ King Walk daily #3 · Sunday\n⏱ 1:07  🟩💡🟨🟧🟥\n🔥 2"
286 passed, 2 failed
! [remote rejected] 2433f3c -> main (push declined due to repository rule violations)
- Required status check "smoke" is failing.
```

The same flow with green tests was accepted (`f0335c6`, the commit before this one). CLAUDE.md's "Committing with
a failing test" now points here instead of asking for care.

## §3. The release scripts assume what App Store Connect returns or accepts

**What goes wrong:** `ios/store/*.py` reads only the first page of a list, or assumes a version's state (no
pages, no review details, screenshots done processing, builds of other versions), and the release run fails
part-way. One time, App Review refused the version.

**Where:**
- Only the first page read:
  - `644dd9f`: creative.py read only the first 200 library images, missed the header art and uploaded it again
    (409).
  - `9a4bf4c`: the lists now ask for 200.
  - `fa4b214`: the creative step's filter missed an uploaded video.
- State assumed:
  - `9a4bf4c`: App Store Connect adds empty language pages, so creating them failed with DUPLICATE. The version
    went up without descriptions, and App Review refused it.
  - `9707e4a`: a new version has no App Review details. The store.yml run on `9707e4a^` crashed with
    `'NoneType' object is not subscriptable`.
  - `78036b6`: submitted while screenshots were processing (ASSET_IN_POST_PROCESSING).
  - `05a1059`: a TestFlight-only upload expired the queued 1.0.3 build, which would have left its submission with
    nothing to submit.
- `cddbcbd`: the age rating's new questions wanted booleans (Apple changed the API; it happened once, see
  Skipped).

**How it was caught:** failed release runs, and App Review's refusal for `9a4bf4c`.

**Proposal:**
- **Pagination (architecture + lint):**
  - Add `asc.all(path)` in `ios/store/asc.py`, which follows `links.next`.
  - A lint check (a small Python script run from parity.js) flags any GET of a collection whose `['data']` is
    used without `asc.all`, unless the path sorts and takes the newest few (`sort=-` and a `limit`). Its error:
    "This reads only the first page of an App Store Connect list. Use asc.all(path), which follows links.next,
    or sort and take the newest N on purpose."
  - The single-page reads in the scripts today go in a baseline file, which may only shrink. Most are fixed in
    the same PR.
- **State (model, Phase 4):** a fake App Store Connect in Python (stdlib only: versions, builds, review
  submissions, screenshot processing, language pages). A random-walk test drives release.py's steps through
  states and failures (a step fails part-way and the run is repeated; a TestFlight-only upload while a version is
  queued).
  - Properties: a queued version always has a build to submit; nothing is submitted while assets are processing;
    every language page has a description after the listing upload.
  - Why not TLA+ or Hypothesis: the logic is in Python already, and a stdlib random walk against a fake avoids a
    new dependency and a second spec language.

**Status (pagination): enforced** (architecture + lint).
- `asc.all_pages(path)` follows `links.next` 200 at a time and returns one response (`data` and `included`);
  `asc.first_page(path)` says on purpose that one page is enough (used once, for the status report's recent
  submissions).
- `ios/store/check_pages.py` (AST, run by parity.js) fails on any `call('GET', …)` or `request('GET', …)` of a list:
  a path ending in a plural collection, or in a relationship named at run time. Its error names the line and the
  fix. A path with `sort=` (newest first on purpose) is allowed.
- All 36 list reads found were moved to `all_pages`. Three were latent: `gamecenter.py`'s `all_related` read 200
  at most, and the version and review-submission lists read 20 and 10. The baseline (`check_pages.baseline`) holds
  one entry, a to-one image read the check can't tell from a list.

**Proof (pagination):** the check on `644dd9f^` flags `creative.py:47`, the library read that missed the header
art past the first 200 images:

```
creative.py:47 reads the list {relationship} with call() or request(), which stops at its first page: use asc.all_pages(path), ...
```

On `644dd9f`, that line is gone (it followed `links.next` by hand); the other reads it still flags there were moved
in this change. Today: no findings.

**Status (state): enforced** (model, Phase 4). `ios/store/release_model.py` runs the real `release.py` against a
pretend App Store Connect (its `asc` module swapped for one that keeps builds, versions and review submissions, and
refuses what Apple refuses while screenshots process). It drives random sequences:
- uploads of builds of three versions, with `prune` after each;
- versions queued behind another;
- new screenshots processing for a few minutes;
- submissions.

The rules: a queued version always has its newest build (not expired), and a submission started while screenshots
process gets through once they're done. 300 runs take well under a second, from parity.js.

Kept in step with release.py: the pretend App Store Connect fails on any request it doesn't know ("the model has no
GET …"), so release.py can't start calling something new without the model learning it. Python stdlib, no
Hypothesis, for the same reason as the daily model.

**Proof (state):**

```
05a1059^  FAIL 1.0.3 is queued for the App Store, but its newest build was expired (seed 1)
          steps: upload 1.0.5, upload 1.0.4, upload 1.0.4, queue 1.0.4, submit 1.0.4, upload 1.0.3, queue 1.0.3, queue 1.0.4, screenshots 1.0.3, upload 1.0.5
78036b6^  (today's prune backported, to isolate it)
          FAIL the submission of 1.0.5 failed instead of waiting: POST /v1/reviewSubmissionItems failed with 409 ... ASSET_IN_POST_PROCESSING
today     3000 runs of 25 steps: every rule held
```

**A bug it found:** `78036b6`'s fix never worked for the step it moved into the retry. Adding the version to the
review submission went through `create()`, which exits the program on an error rather than raising `ApiError`, so
the retry couldn't catch "still processing" there. The model fails on `78036b6` itself and every version after
(checked on `1b44d80`). It's fixed here: that step sends its request directly.

## §4. `ios/release.json` has text App Store Connect refuses

**What goes wrong:** the TestFlight or App Store notes in release.json have an emoji; App Store Connect refuses it
(409 INVALID_TEXT) after the 10-minute build.

**Where:**
- `c8d4575` and `d5eac30`: 🧊 in What to Test. The first fix, `57c389f`, filtered such characters out.
- `c3757d3`: ♟️ in What's New. The second fix, `efd7001`, filtered more.

The rule "no emoji in What's New or TestFlight notes" is also in the owner's standing instructions and
`ios/README.md`. (The run on `efd7001` then failed on a missing What's New; that was the empty language pages of
§3, fixed in `9a4bf4c`, not this file.)

**How it was caught:** failed release runs, after the build.

**Status: enforced** (parse at the boundary, run as a test). `ios/store/release_config.py` loads and checks
release.json and beta.json:
- the settings release.py knows (a misspelt one is an error; a renamed `app_store_…` is a held version, kept);
- true/false fields;
- notes without the characters App Store Connect refuses, each named with its code point;
- notes within 4000 characters;
- What's New for every store language when submitting.

release.py reads the files only through `load()`. parity.js runs the check on every push, so a bad file fails the
Test workflow in seconds and, with §2, never reaches `main`. Example error:

```
app_store.whats_new.en-US: '♟' (U+265F), '️' (U+FE0F) refused by App Store Connect as INVALID_TEXT; write the notes without emoji
```

Why this level: one loader is the only way release.py gets its settings, so no path skips the check; it can't be
a type, since the input is a JSON file.

**Proof** (`release_config.check` on each commit's release.json):

```
c8d4575  testflight.whats_new: '🧊' (U+1F9CA) refused by App Store Connect as INVALID_TEXT; write the notes without emoji
d5eac30  (the same)
57c389f  ok
c3757d3  47 problems: app_store.whats_new.<each language> and testflight.whats_new: '♟' (U+265F), '️' (U+FE0F) refused ...
efd7001  ok
```

Run over every release.json and beta.json in history, it flagged nothing else, after one correction. The old
filter (and the first draft of this check) treated the zero-width joiner U+200D as emoji. Bengali uses it to join
letters, so 1.0.3's Bengali What's New (`9640524` to `d961fa3`) went to the App Store with letters split. The
check no longer refuses U+200D; the emoji it joins are refused on their own.

## §5. Daily puzzle state across days, pauses and links

**What goes wrong:** the daily is right on the day it's played, but goes wrong after midnight, after a pause, when
opened from a link or a widget, or when an award arrives with it.

**Where:**
- `cb08c29`: `#daily` after today's is done showed regular puzzles.
- `fe15eb9` (four daily bugs from one review):
  - yesterday's daily finished blocked today's;
  - playing yesterday's daily past midnight spent a freeze;
  - the clock ran in the background;
  - opening a done daily showed a share sheet.
- `99c1408`: an achievement the daily earned showed before the daily's card (the owner's report).

**How it was caught:** a code review before launch (`fe15eb9`), the owner using the game (`cb08c29`, `99c1408`).

**Status: enforced** (a model-based test, Phase 4), as the Test workflow's `daily-model` job (about 40 seconds).

`testing/daily-model.js` drives the real page through random, seeded sequences of what a player does across days:
- the button, a link in the open game, a link opened fresh, the app's request;
- right and wrong moves, a hint, the answer;
- hiding the game, coming back, Continue, leaving, reloading, closing cards;
- minutes, midnight and whole days passing on Playwright's fake clock.

After every step it checks the rules the past bugs broke (listed at the top of the file), plus "the page didn't
throw" and "a solved day stays solved". A failure prints the seed and the steps, which replay exactly.

Why a model and not more unit tests: each bug was an order of events nobody had written a test for, and the
random walk finds orders like that by itself.

Why plain JS, not fast-check: the page runs in Playwright already, and a 30-line seeded random walk covers what
fast-check's model runner would, without a dependency. Shrinking (fast-check's minimal failing sequence) is the one
thing missing; the step lists it prints are short enough to read.

**Proof** (30 runs of 30 steps on each commit; the two bugs below, which exist in all of them, backported as fixed
so they don't hide the older ones):

```
cb08c29^  FAIL with today's done, a link or the app shows today's solved board  {"today":8,"daily":null,"done":false}
          steps: wrong wrong hide answer reload wrong button wrong hide solve solve reload solve show resume visit
fe15eb9^  FAIL opening the daily opened another day's  {"today":12,"daily":{"n":7}}
          steps: show button wrong days good hide resume solve days wrong link
99c1408^  FAIL a card came before the day's card  ["Achievement|Hat Trick"]
today     30 runs of 30 steps: every rule held
```

It also found the same rule broken at `fe15eb9` itself (the app opening yesterday's daily after midnight; fixed by
`cb08c29`'s change to `kingWalkOpen`).

**Two new bugs it found, fixed in the same change:**
- **A daily finished after midnight crashed `finishDaily`.** `renderPanel` drops a daily from an earlier day, so
  `DAILY.mode = "review"` threw on null. The result was saved, but the day's card and Share never showed. It was
  there in every version since the daily's card. The fix uses the daily being finished (`d`) and gives
  `showDailyDone` its day.
- **The clock ran in the background.** A daily whose first move came while the game was hidden (switching apps
  right after opening it) started its clock anyway, and counted every hour away. It now starts on Continue.

## §6. Tests that depend on today's date

**What goes wrong:** a test reads the real date, so it passes or fails depending on the day it runs.

**Where:** the freeze test that failed six pushes in a row near Daily §1 (fixed in `49c0bf4`). `unit.js`'s
weekday check also relies on English weekday names, which is fine, but it reads the real date.

**Status: enforced** (architecture of the tests, not the page). Every page `unit.js` opens starts at the same
moment (2026-11-15 00:30 UTC, the time the freeze test failed in CI) in the same time zone, on Playwright's clock,
whatever day the tests run. `UNIT_NOW` and `UNIT_TZ` try another moment.

The daily model (§5) explores other moments and days on purpose. No change to the page was needed: Playwright's
clock replaces `Date` and the timers, so the proposed `now()` function and its lint rule would add nothing.

Two language-loading tests read `performance` entries, which the fake clock replaces. They now record the page's
requests instead.

**Proof:** the freeze test as it was at `48d589d`, under the same clock:

```
UNIT_NOW=2026-11-15T00:30:00Z  FAIL freezes cover skipped days and the streak carries on {... "used":0,"after":{"streak":0,"freezes":2,"frozen":false} ...}  81 passed, 1 failed
UNIT_NOW=2026-11-22T12:00:00Z  82 passed, 0 failed
```

The same test passed or failed by the day it ran. With the clock pinned, it fails every time or never.

## §7. Two devices' saves: the wrong copy wins

**What goes wrong:** with iCloud, the copy written last replaced the copy with more progress. Every launch writes,
so progress could be lost. The page's rule (`betterSave`) and the app's (`SaveRank` in Swift) must stay the same,
and only prose says so.

**Where:** `fe15eb9` (found in review before launch; a data-loss bug). The two-places rule is in CLAUDE.md.

**Status: enforced** (architecture + test + model).
- **One set of cases for both rules.** `testing/save-cases.json` holds 12 pairs of saves and which should win.
  `unit.js` runs the page's `betterSave` on them. The Test workflow's `save-rank` job compiles `SaveRank` (moved to
  its own file, `ios/KingWalk/SaveRank.swift`, so it builds on Linux) with `testing/SaveRankCases.swift` and runs
  the same cases. A change to either rule that the other doesn't share fails one of them.
- **Proof that the cases catch drift, on every run.** The same job compiles a copy of `SaveRank` with the progress
  comparison flipped, and fails unless the cases catch it.
- **The model (Phase 4).** `testing/sync-model.js` plays two devices through iCloud:
  - play and daily puzzles on either device;
  - writes reaching iCloud in any order;
  - copies delivered late, twice, or older after newer;
  - coming back to the app.

  It uses the page's real `betterSave`, read from `index.html`, and SaveStore's write and offer steps. The property:
  once everything has arrived, both devices hold the same save, with the most progress any device reached. It
  runs 2000 sequences in under a second, from parity.js.
  - Why a hand-written model and not TLA+: one rule and three steps, in the language the rule is written in, run
    on the real function. The rule can't drift from the model, since it's read from the source. SaveStore's steps
    are written out in the model (`persist`, `adopt`); a change there needs the model changed too, which the file
    says at the top.

**Proof:**

```
the cases, on the rule before fe15eb9 (newest write wins): 7 of 12 fail, first:
  "more progress wins over a copy written later (iCloud kept the last write once: fe15eb9)"
MODEL_RULE=newest node testing/sync-model.js
  FAIL progress lost or the devices disagree (seed 1): the most any device reached 12, the devices end with 11 and 11, iCloud 11
node testing/sync-model.js
  2000 runs of 40 steps (rule: page): every rule held
```

The Swift side's proof is the mutant step in every `save-rank` run (shown in the PR's CI log).

## §8. Submitting to the App Store without the owner's go-ahead

**What goes wrong:** a release run submits a version to App Review that the owner wanted held.

**Where:** 2026-11-16, 1.0.2. The owner said to hold it; the run was cancelled, but it had submitted a few seconds
before. The hold came in the next commit, `b4b60f7`. It's recorded in `ios/README.md` ("a cancel came too late
once"). The rule "don't submit or release without the owner's go-ahead for that version" is prose, in CLAUDE.md
and the session instructions.

**How it was caught:** by looking at what the cancelled run had done.

**Status: not enforced, by the owner's decision** (2026-11-22): the owner is fine with Claude handling App Store
submissions from release.json, so no approval gate. The proposal was a GitHub environment (`app-store`) with the
owner as required reviewer on the steps that submit and release. Revisit if a version is submitted against the
owner's wishes again.

## §9. Files that don't belong in git

**What goes wrong:** something local or large is committed: the videos (each re-record added tens of MB until the
history reached 1 GB), an agent worktree, Python caches.

**Where:**
- The videos: removed from history and force-pushed on 2026-11-21 (`0eaf1cd`).
- `85df665`: `.claude/worktrees/...` committed; removed in `72f41f4`.
- `923b6da`: Python caches.

**How it was caught:** by hand, each time. The 1 GB history needed a force-push to fix.

**Proposal (lint):** a check in parity.js over `git ls-files`:
- no file over 2 MB except a short allow list (the puzzle chunks and fonts are far below that);
- no `.mp4`/`.mov` outside media.json;
- nothing under `.claude/`, `__pycache__/` or `*.pyc`.

Its error names the file and says where it goes instead (`python3 scripts/media.py publish` for videos,
.gitignore for local files). It takes milliseconds.

**Status: enforced** by `testing/parity.js` (lint level: a check over `git ls-files`, milliseconds). Size limit 5
MB: the largest legitimate files are the store header art, about 4.4 MB. Gitlinks (an agent worktree is committed
as one) count as local.

**Proof** (the check alone, run on each commit's checkout):

```
85df665  FAIL nothing local is committed (git rm --cached it and add it to .gitignore)
         [".claude/worktrees/agent-aa038f033662c6292","ios/store/__pycache__/asc.cpython-313.pyc"]
72f41f4  FAIL nothing local is committed ... ["ios/store/__pycache__/asc.cpython-313.pyc"]
9b58c65^ 3 passed, 0 failed
9b58c65  FAIL nothing local is committed ... ["ios/store/__pycache__/asc.cpython-313.pyc"]
```

It found a mistake still in the repo: `9b58c65` committed a Python cache, and `923b6da` ("Ignore Python caches")
ignored new ones without untracking it. The same change removes it; with it removed, the check passes. The video
part is unproven on real history (those commits were removed from it in `0eaf1cd`).

## §10. A workflow uses a file it didn't fetch

**What goes wrong:** a workflow uses one of the videos (now on the `media` branch) without running
`scripts/media.py fetch`.

**Where:** the release run on `cddbcbd`: `FileNotFoundError: press/king-walk-trailer.mp4` in the App Review
attachment step. Fixed in `1b44d80`.

**Status: enforced** since `1b44d80` by parity.js ("fetches the videos before it uses them").

**Proof** (the check alone):

```
cddbcbd  FAIL release.yml fetches the videos before it uses them (python3 scripts/media.py fetch)
1b44d80  3 passed, 0 failed
```

## §11. The website and the two apps drift apart

**What goes wrong:** a message, widget field, string, achievement or version number changes in one place and
not the others.

**Where:** `46dff1a` found the Android app at version 1.0.0 while iOS was at 1.0.4. The bridge, widget and string
checks were written alongside the code they check.

**Status: enforced** by `testing/parity.js`, which runs first on every push.

**Proof** (the version check alone):

```
46dff1a^ FAIL the iOS and Android apps have the same version number {"ios":"1.0.4","android":"1.0.0"}
46dff1a  1 passed, 0 failed
```

## §12. A string missing from a language

**What goes wrong:** new text reaches players untranslated.

**Where:**
- `7ef9672`: 4 strings missing from 10 languages; Test failed after the push.
- `9b58c65`: T() keys inside ternaries were invisible to the check.

**Status: enforced** by unit.js ("every T() key translated", plain literal keys). The remaining hole is that it
runs after the push. §2 closes that for the website.

---

## Skipped, and why

- **The Android emulator falling over in CI** (about 15 of the 19 failed Android runs, and about 12 commits:
  `aa2558d`, `35f019e`, `7173b56`, `f582440`, `bc6fac3`, `8ef7b07`, `bc3c1c5`, `ca00fe7`, `a01c017`, `3c1bb40`,
  `547073c`, `764409d`).
  - The emulator segfaults or drops the page on GitHub's machines. This is infrastructure, not a coding mistake,
    and a check can't prevent it; a retry is in place.
  - Note: the run on the latest commit (`47ce8c9`) failed on both tries, so the retry isn't always enough. That is
    a reliability issue to look at separately, not a mistake class.
- **WebView and Safari behaving differently from Chromium:**
  - Safari's double-tap zoom: `f2dd048`, `0719156`.
  - Safari scrolling cancelling drags: `9e2b764`.
  - Android 13 not passing on dark mode (`9080f1d`) or reduced motion (`8d55b4e`).

  This happens often, but no deterministic engine for iOS Safari runs in Linux CI. The Android ones are covered by
  the device test, which checks dark mode and reduced motion. Cost is above value for iOS (a simulator UI test on
  macOS for each push).
- **Store screenshots and videos out of date:** many regenerate-after commits (`5cd38e4`, `d521375`, `24583a5`,
  `5bce427`, `ea11c4e`, `255b84e`, `fc2d38a`, `76c72df`, `c9b87cf`).
  - These were follow-ups in the same session, not stale images that shipped. `76c72df` fixed a bug visible in the
    images, not stale images.
  - Rendering them in CI takes minutes, and font and timing differences would give false failures.
- **A CSS class name used for two things** (`d233052`, "pop"): once, and unit.js tests it since.
- **The owner's IDs in code:** they were moved out in `62d9a22`, at the start, and haven't come back.
  - A check needs the values, which are Actions variables. A workflow step could grep for them cheaply if this
    ever recurs.
- **Reordering a puzzle band:** high impact (the daily would differ between app versions) but it has never
  happened. Note for later: a committed list of each band's chunk hashes that may only grow would catch it in
  milliseconds.
- **CHANGELOG, STATS.md and README kept in step:** prose rules with no reliable signal (which commits are
  "player-visible" is a judgement). A check would misfire often and be ignored.
- **The age rating's booleans** (`cddbcbd`): Apple changed the API; once. §3's model doesn't cover Apple changing
  its schema.
- **First-day signing and key setup** (the four release runs on 11-14 01:03–01:20): one-time setup, not repeated.
- **Apple's 500** on 11-17: their side.

## Phase 3: comments

- Rules in `CLAUDE.md` now enforced by a check were cut back to what the check doesn't cover:
  - The layout entry under "Mistakes to avoid" now points at the `layout` job and only asks for the languages
    the job leaves out.
  - The save entry points at `save-cases.json` and `sync-model.js`.
  - `ios/README.md`'s emoji entry points at `release_config.py`.
- "Committing with a failing test" stays as written until the `main` ruleset exists. Then it goes, with a pointer
  to §2.
- Code comments: the constraint comments in the files changed here were encoded and moved:
  - "never Simplified for Traditional" is now `release_config.notes_for`, used by release.py and the check.
  - "SaveRank below is the same rule" is now the shared cases.

  The page's other comments explain why rather than restate the code. With the page this large, a sweep for
  restating comments would be churn for little value, so it was not done.

## Phase 5: brittle tests

One test pinned an internal field: the daily's pause test checked `DAILY.t0 === 0` ("the clock stopped"). It now
checks what the player sees: `dailySpent()` doesn't move while the game is hidden, nor under the Paused card, and
moves after Continue.

Shown to catch the bug it guards: with the line that stops the clock on hide removed, it fails:

```
FAIL the daily, hidden: its clock stops and it's saved with its place {"spent":35,"saved":35,"k":1,"later":36}
```

No test was deleted. The rest of unit.js and smoke.js check outcomes through the page's own functions, and
none guards security, privacy or billing behaviour in a way that would need replacing.

## CI time

The Test workflow's `smoke` job was about 5 minutes and is about the same now. parity.js gained the repo, release,
pagination, sync and release-model checks, which add about 1 second.

Four jobs now run beside it, so a push waits no longer than before:

| Job | Time |
|---|---|
| `layout` | about 1.5 minutes with setup (47 s of checks) |
| `daily-model` | about 1 minute (36 s) |
| `save-rank` | about 30 seconds |

`unit.js` on a fixed clock takes the same 3.5 minutes. Total runner time per push is up by about 3 minutes;
waiting time is unchanged.

## Final report

| § | Class | Status | Check | Proof |
|---|---|---|---|---|
| 1 | Layout at a screen or text size | Enforced; one case unproven | `layout` job (`testing/layout.js`) | `adf7899^` fails; `fd44f9a` (the iPad scroll) doesn't reproduce in Chromium |
| 2 | Red pushes reach `main` | Enforced | the `main` ruleset (required check `smoke`); workflows never push to `main` (parity.js) | `2433f3c` (c60539e's mistake) refused, before and after its tests ran; parity on `3108604`'s release.yml fails |
| 3 | Release scripts assume App Store Connect | Enforced | `asc.all_pages` + `check_pages.py`; `release_model.py` | `644dd9f^`, `05a1059^`, `78036b6^` fail |
| 4 | release.json text App Store Connect refuses | Enforced | `release_config.py` (parity.js; release.py loads through it) | `c8d4575`, `d5eac30`, `c3757d3` fail |
| 5 | Daily state across days | Enforced | `daily-model` job (`testing/daily-model.js`) | `cb08c29^`, `fe15eb9^`, `99c1408^` fail |
| 6 | Tests that depend on the date | Enforced | unit.js on a fixed clock | `48d589d`'s test fails at 2026-11-15 00:30, passes a week later |
| 7 | Two devices' saves | Enforced | `save-cases.json` (unit.js, `save-rank` job with a mutant), `sync-model.js` | the pre-`fe15eb9` rule fails 7 cases and loses progress in the model |
| 8 | Submitting without the owner's go-ahead | Not enforced: the owner's decision | — | — |
| 9 | Files that don't belong in git | Enforced | parity.js | `85df665`, `9b58c65` fail; video part unproven |
| 10 | A workflow uses a file it didn't fetch | Enforced (before this work) | parity.js | `cddbcbd` fails |
| 11 | Website and apps drift | Enforced (before this work) | parity.js | `46dff1a^` fails |
| 12 | A string missing from a language | Enforced (before this work) | unit.js; §2 keeps it off `main` | — |

Bugs the new checks found and this work fixed:
- finishing a daily after midnight crashed before its card;
- a daily started while hidden counted the time away;
- `78036b6`'s submission retry never covered adding the version to the submission;
- 1.0.3's Bengali What's New lost its zero-width joiners;
- a Python cache file was still tracked;
- three App Store Connect lists read only their first page.

Left for the owner: add `layout`, `daily-model` and `save-rank` to the ruleset's required checks beside `smoke`.
They run on every push and pass on `main`. Until they're required, a layout problem, a daily-model failure or a
SaveRank drift shows as a red job but doesn't keep a commit off `main`.
