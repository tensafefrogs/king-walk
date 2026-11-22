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
| 1 (§1) | A screen size or text size breaks the layout | 11 | 3 | 33 | Run the layout check on the sizes that break first, in CI | test |
| 2 (§2) | Pushes to `main` while the tests fail; the website deploys anyway | 9 runs (4 causes) | 3 | 27 | `main` takes only commits whose tests passed (ruleset); no workflow pushes to `main` | architecture |
| 3 (§3) | The release scripts assume what App Store Connect returns or accepts | 9 | 2–3 | 22 | One paginated list helper, plus a lint rule; a model of the release steps (Phase 4) | architecture + lint + model |
| 4 (§5) | Daily puzzle state across days, pauses and links | 6 | 3 | 18 | A model-based test of the daily with a fake clock (Phase 4) | model |
| 5 (§4) | `ios/release.json` has text App Store Connect refuses | 4 runs | 2 | 8 | Check release.json and beta.json on every push, before any build | test (parse at the boundary) |
| 6 (§9) | Files that don't belong in git | 3 | 2–3 | 8 | A repo check: size limit and forbidden paths | lint |
| 7 (§12) | A string missing from a language | 2 | 2 | 4 | Already enforced (unit.js); §2 stops it reaching the site | test |
| 8 (§7) | Two devices' saves: the wrong copy wins | 1 (lost progress) | 3 | 3 → kept, data loss | Shared test cases run by the page's rule and the Swift rule; a two-device model (Phase 4) | test + model |
| 9 (§8) | Submitting to the App Store without the owner's go-ahead | 1 | 3 | 3 → kept, production incident | Not enforced: the owner's decision | — |
| 10 (§6) | Tests that depend on today's date | 2 | 1 | 2 | One injectable clock, used by the model in §5 | architecture (with §5) |
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

**Proposal (test):** a CI job that runs `layout.js` on English and one long language (German) at the sizes that
broke before: `phone-320`, `phone-375-land`, `ipad-9-land`, `text-ax5`, `duo-book`. It runs as its own job beside
the Test job, so it adds no waiting time. Its target is under 2 minutes; if it takes longer, cut the sizes. A
layout problem fails the build with the size, the element and the overflow in pixels (layout.js already reports
these).

Why a test: the layout depends on the browser's rendering, which no type or lint rule can see.

**Proof:**
- `adf7899^`: the cards sideways should fail at `phone-375-land`.
- `fd44f9a^`: the iPad case should fail at `ipad-9-land`. That is only if layout.js reproduces the app's safe
  areas there; otherwise this case is marked unproven.

Run the current layout.js against the old `index.html` for each.

**Limits:** Chromium can't see Safari's zoom (`0719156`) or the app's text-size zoom exactly. These stay with the
player's screenshot (CLAUDE.md says so).

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

**Proof (after the ruleset exists):** recreate `c60539e`'s mistake on a branch from `main`: the share text changed
without its unit test (put back the previous expectation in `testing/unit.js`). Its Test run fails, and `git push
origin HEAD:main` is refused. The current commit, after its green run, is accepted.

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

**Proof:**
- Pagination: the lint flags `creative.py` at `644dd9f^`; on `644dd9f` it passes, for that line.
- Model: at `05a1059^`, the queued build gets expired; at `78036b6^`, a submission happens while assets are
  processing. Both pass today.

## §4. `ios/release.json` has text App Store Connect refuses

**What goes wrong:** the TestFlight or App Store notes in release.json have an emoji, or a language has no What's
New. App Store Connect refuses it after the 10-minute build.

**Where:**
- `c8d4575` and `d5eac30`: 🧊 in What to Test, 409 INVALID_TEXT, twice. The fix, `57c389f`, filters them.
- `c3757d3`: ♟️ in What's New, 409 INVALID_TEXT. The fix, `efd7001`, filters more.
- `efd7001`'s run: 409 ATTRIBUTE.REQUIRED for `whatsNew` in some languages.

The rule "no emoji in What's New or TestFlight notes" is also in the owner's standing instructions and
`ios/README.md`.

**How it was caught:** failed release runs, after the build.

**Proposal (parse at the boundary, run as a test):**
- A `release_config.py` that loads `release.json` and `beta.json` into a checked structure:
  - the fields release.py knows;
  - What's New for every language the listing has;
  - text without the characters App Store Connect refuses (the same rule as `plain_notes`, which moves there);
  - lengths within Apple's limits.
- release.py uses only that loader. parity.js runs it on every push, so a bad release.json fails Test in seconds
  rather than the release after a build.
- Error example: "ios/release.json app_store.whats_new.de-DE: '♟' (U+265F) is refused by App Store Connect as
  INVALID_TEXT; write the notes without emoji."
- The silent dropping in `plain_notes` becomes an error at push time. The notes read as written, not with holes
  in them.

**Proof:** `c3757d3` (♟️) and `c8d4575` (🧊) fail, and `efd7001`'s missing What's New fails. Their fixes pass.

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

**Proposal (model, Phase 4):**
- A model-based test in `testing/` (plain JS, no fast-check, to avoid a dependency).
- It drives the page through random sequences:
  - start, move, pause, resume, finish;
  - pass midnight;
  - open `#daily`, open from the app;
  - earn a freeze, skip a day.
- A small model says what should be true after each step:
  - which day's puzzle is open;
  - the streak and freezes;
  - whether the clock runs;
  - which card shows first.
- It needs the clock from §6.

Why a model rather than more unit tests: each bug was an order of events nobody wrote a test for.

**Proof:** at `fe15eb9^`, passing midnight during yesterday's daily spends a freeze. At `cb08c29^`, `#daily` after
done opens a regular puzzle.

## §6. Tests that depend on today's date

**What goes wrong:** a test reads the real date, so it passes or fails depending on the day it runs.

**Where:** the freeze test that failed six pushes in a row near Daily §1 (fixed in `49c0bf4`). `unit.js`'s
weekday check also relies on English weekday names, which is fine, but it reads the real date.

**Proposal (architecture, with §5):** the page gets its time from one function, `now()`, which tests can set
(`?now=` or a test hook). Then a lint rule in unit.js fails on `Date.now()` or `new Date()` without an argument in
`index.html` outside `now()`. Its error: "Read the time through now(), so tests can set the day."

Existing uses go in a baseline that may only shrink.

**Proof:** the freeze test at `48d589d`, run with the clock set to 2026-11-15 00:30 UTC, fails as it did in CI.
The lint flags the date reads in that test's path.

## §7. Two devices' saves: the wrong copy wins

**What goes wrong:** with iCloud, the copy written last replaced the copy with more progress. Every launch writes,
so progress could be lost. The page's rule (`betterSave`) and the app's (`SaveRank` in Swift) must stay the same,
and only prose says so.

**Where:** `fe15eb9` (found in review before launch; a data-loss bug). The two-places rule is in CLAUDE.md.

**Proposal:**
- **Test:** `testing/save-cases.json` holds pairs of saves and the one that should win.
  - `unit.js` runs `betterSave` on them.
  - A Swift test in the iOS app workflow (macOS, already runs) runs `SaveRank` on the same file.
  - A new case goes in one place and both rules must pass it.
- **Model (Phase 4):** two devices and iCloud, with writes arriving late, twice and out of order. The property:
  the rated count and dailies played never go down. It reproduces last-writer-wins.

Architecture alternative: the app asks the page to decide and drops SaveRank. That's cleaner, but larger and it
touches the app's launch path; I propose the shared cases first.

**Proof:** with the current file, the pre-`fe15eb9` rule (last writer wins) fails the cases where an older copy
has more progress. A changed `SaveRank` (one condition flipped) fails the Swift test while `betterSave` passes.

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

**Proof:** at `85df665` it fails on `.claude/worktrees/agent-…`; at `72f41f4` it passes. The video commits are no
longer in history, so that part is unproven: it can only be shown by committing a video on a branch.

## §10. A workflow uses a file it didn't fetch

**What goes wrong:** a workflow uses one of the videos (now on the `media` branch) without running
`scripts/media.py fetch`.

**Where:** the release run on `cddbcbd`: `FileNotFoundError: press/king-walk-trailer.mp4` in the App Review
attachment step. Fixed in `1b44d80`.

**Status: enforced** since `1b44d80` by parity.js ("fetches the videos before it uses them").

**Proof still to record:** parity.js today, run on `cddbcbd`'s release.yml, fails; on `1b44d80`, it passes.

## §11. The website and the two apps drift apart

**What goes wrong:** a message, widget field, string, achievement or version number changes in one place and
not the others.

**Where:** `46dff1a` found the Android app at version 1.0.0 while iOS was at 1.0.4. The bridge, widget and string
checks were written alongside the code they check.

**Status: enforced** by `testing/parity.js`, which runs first on every push.

**Proof still to record:** parity.js on `46dff1a^` with the version check fails (1.0.4 vs 1.0.0).

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

## Order for Phase 2 (one PR each)

1. §2, tests before `main` (the ruleset, and the status file off `main`).
2. §9, the repo file check (tiny).
3. §4, the release.json loader and check.
4. §3, the pagination helper and lint, with a baseline.
5. §1, the layout job in CI (needs timing first).
6. §6, then §5: the clock, then the daily model (Phase 4).
7. §7, the shared save cases and the Swift test, then the two-device model (Phase 4).

Proof runs for §10 and §11 go in with §2's PR, since they need no code.

## Status

Phase 1 written 2026-11-22; §10, §11 and §12 were already enforced before this catalog.

- §2: in progress. The status file is off `main` and the workflow check is in parity.js; enforced once the owner
  creates the ruleset and the proof above has run.
- §8: not enforced, by the owner's decision.
