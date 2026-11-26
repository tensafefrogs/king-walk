# Roadmap

What's planned for King Walk, and what's on hold. Done features move out of this file.

## Next

**Learning by playing (proposed; the owner's brief of 26 November 2026).** Move King Walk toward a coach you improve with
just by playing, built only on methods with good research behind them, so the website can say so honestly. Nothing here
is built yet. In order:

1. **Solve times, kept on the device (started 26 November: each puzzle has its own clock now, used only by the review
   list's speed rule; the coach's use of it is still to do).** Before, only the daily had a clock. Time each
   puzzle from the player's first turn to the solve, stopped while the game is hidden (the daily's pause code already
   does this), and keep it in the save: the last time per puzzle in the review list, and a running median per area for
   the coach. Private: no time is sent to GoatCounter, not even rounded. Uses: the speed rule in 2, slow-but-right
   counted as shaky by the coach, and later a player's own "usual time" per area.
2. **Spaced repetition for missed puzzles (the owner's plan; built 26 November 2026, on the website, in the apps from
   1.0.6).** Before, a missed puzzle came back once, 30 new puzzles later, and was then forgotten. Next: check the
   `review/...` counts after a few weeks (the share solved at each step), then the website's wording (6).
   - A puzzle missed, or solved with a hint, goes into the review list. It comes back after 1 day, then 3, 7, 14 and 30.
     Solved cleanly and quickly: the next, longer gap. Solved slowly or with a hint: the same gap again. Missed again:
     back to 1 day. Solved cleanly at the 30-day step: learned, and it leaves the list.
   - Reviews are mixed into normal play, no separate screen: at most about 1 puzzle in 5 is a review, so a backlog never
     takes over. Order of choice: due reviews (within that limit), then the coach's weak areas, then new puzzles.
   - Gaps are counted in days, not puzzles (memory fades with time), with a few new puzzles required in between so a
     player who plays 50 in a sitting doesn't see a review twice in an hour.
   - Speed is the Woodpecker part: a puzzle moves up only if solved cleanly and faster than the first time, or in under
     about 30 seconds (needs 1).
   - The rating stays out of it, as for second tries now (the player has seen the puzzle); reviews feed the coach at half
     weight.
   - Not doing (owner, 26 November): a "4 puzzles to review" line and Review now button on the coach card. The status
     line's "You've seen this one before" is enough.
   - The list grows from 20 entries to a few hundred (a few bytes each); existing second tries move in at the 1-day step.
   - Measure it: the share of reviews solved at each step (an event per step and result), which is also the honest
     evidence for 6.
3. **Keep the success rate where learning is fastest.** Research on learning by trial suggests about 85% success
   (Wilson and others, 2019): too easy teaches little, too hard discourages. Check today's rate per player from the
   save and steer the puzzle choice's target toward it, rather than a fixed offset from the rating. The stats showed
   new iOS players stopping after one or two puzzles: worth checking whether their first ones are too hard.
4. **Mix areas rather than block them (interleaving; decided and built 26 November 2026, the owner's brief of 25 November).**
   Mixed practice beats one-kind-at-a-time for telling which method a problem needs (Rohrer and Taylor, 2007), and a
   real game never says "this is a fork". Practice is now one session, Practise my weak spots: 10 puzzles, about 6 from
   the weak areas and 4 chosen as in normal play, shuffled, with no area named until each is over; a thin area's slot
   goes to another weak area, then a normal puzzle. Due reviews stay in normal play. Next: `coach/practice-done/<n>`
   against the old per-area sets.
5. **A similar puzzle soon after a miss.** After a miss, the next puzzle or two of the same theme near the same rating,
   so the idea is used again while it's fresh (varied practice, for transfer to new positions), before the spaced
   review brings back the same position days later.
6. **Show progress that's real, then say so.** Per area, the player's results over time on the coach card, and for the
   website only claims the numbers support. Safe now: "Missed puzzles come back on a spaced-repetition schedule, a study
   method backed by decades of memory research" (once 2 ships). Not until measured: anything like "improve X% faster".
   A short "How King Walk teaches" page could cite the research: spacing (Cepeda and others, 2006 and 2008), retrieval
   practice (Roediger and Karpicke, 2006), interleaving (Rohrer and Taylor, 2007), desirable difficulties (Bjork, 1994),
   pattern recognition in chess (Chase and Simon, 1973; Gobet and Simon), and the 85% rule (Wilson and others, 2019).
   Check each citation before publishing it (these are from memory).
7. **Later, from the same research:** "why it works" explanations (On hold below) are the feedback half; asking how sure
   the player is before a move (confidence training) is backed too, but adds a tap to every puzzle, so only as an
   option.

**Coach programs (proposed in the owner's brief of 25 November; ask the owner before building either).**
- *Cycles (Woodpecker-style).* Opt in, for players who want a fixed set to repeat faster each time, apart from spaced
  repetition (which brings misses back for everyone). A set of 50 or 100 at the player's level, about half from weak
  areas, mixed. Cycle 1 has no target; each later one aims at half the previous time ("Cycle 3: 42 min, aim for 21"). A
  progress screen with each cycle's time and solved count; a cycle can span days; misses also go into spaced
  repetition. Called "Cycles" in the game; "Woodpecker-style" only in describing it, never the book's name as the
  feature's, nor any suggestion that its authors are involved. Uses the puzzle clock (item 1).
- *Flash drill.* From perceptual learning (training fast recognition, as for reading medical images; Kellman's
  perceptual learning modules). 3 minutes: a position shows for about 3 seconds, then one question, "Tap the piece
  that moves" (the solution's first player move) or "What's the idea?" with 3 area names to choose from. Instant
  right or wrong, a score at the end, no rating change; feeds the coach at a small weight (0.25), since a look isn't
  a solve. Measure: sessions started and finished, and whether Flash players' solve rates in their weak areas rise.

**Openings (later; from the owner's question of 26 November).**
- *What the data has.* Lichess's puzzle file has an `OpeningTags` column (the opening and variation of the game a
  puzzle came from, for puzzles from the opening phase: 3,085 of our 53,000, about 6%, carry the `opening` theme).
  `scripts/puzzles.py` drops it today. It can't go into the puzzle chunks without changing every chunk's hash
  (`testing/puzzles.lock.json`); a separate small file of id to opening would leave the bands alone.
- *Open sources.* lichess-org/chess-openings: about 3,500 named openings with ECO codes and moves, public domain (CC0).
  The Lichess game database (database.lichess.org) is CC0 too, for how often each move is played at each level; its
  opening explorer is an online service with rate limits, so a bundled table made from the dumps suits an offline game
  better.
- *Features it allows.* An "Openings" area in the coach (puzzles from the openings a player meets); "name that opening"
  as a quick quiz; and a repertoire trainer that drills a player's chosen lines with the same spaced repetition as 2
  (moves instead of positions). The trainer is the biggest of these and the most coaching-like.

**The coach (in progress, from the owner's brief of 22 November 2026).** The game learns which kinds of puzzle a player
does better or worse at than their rating expects, and mixes in more of what they're working on, with practice sets of
10. All of it is arithmetic on the save; nothing leaves the device.

1. **Results by area (done, no visible change).** 15 areas from the puzzles' themes (`AREAS` in `index.html`), scored
   against the rating's expectation with older results fading, saved in `coach`. Thin areas to keep in mind for
   practice sets (under 40 puzzles in a band): pins, discovered attacks, luring, defending, quiet moves and skewers in
   the lowest bands (400-700); back-rank mates from 1200 up (none at 2300-2400); skewers from 2000 up; in-between moves
   and clearing the way below 900. Offer Practise only where the player's level has enough.
2. **The coach card, each puzzle's areas after it, practice sets at half rating (done; the coach before puzzle rush,
   the brief's area names: the owner, 23 November).**
3. **Coached puzzle choice, on by default (done)**, with Settings, Puzzle choice: Coached / Any kind, and a holdback.
   **Around 23 December 2026: compare and remove the holdback** (`COACH_HOLDBACK` in `index.html`): `coach-back/7d`
   against `back/7d`, and the holdback's own returns (`testing/STATS.md`, The coach). The coach ships in 1.0.5 (rebuilt with it, the owner's call),
   with the listing's new line and screenshots showing it. A screenshot of its own (Work on with Practise) would sell it
   better than the corner of the progress card the current ones show.
4. **Nudges**, after the stats from 2 and 3: on the daily's card, after a miss, and "Today's focus" on the widgets.

iOS, in order of impact for the effort (November 2026):

1. **Today's puzzle on the Home Screen (two or three days).** The daily widget shows the position itself: the board drawn from the puzzle (SwiftUI, from the FEN the app already has), whose move, mate in n; a tap opens it. A puzzle in view is a stronger nudge than a number, and it shows in StandBy and on the Lock Screen too.
2. **Apple Games app and Game Center activities (a day or two).** Since iOS 26 the Games app lists a game's activities and lets friends jump into them: add one for the daily puzzle and one per rank streak, so a friend's challenge or score opens the right place. Discovery among people who already play games.
3. **Sticker pack (half a day).** The pieces, the crown, "Checkmate!", "Fork!", the streak flame, as iMessage stickers inside the app. Small but nearly free, and it puts the brand in group chats next to the daily share.
4. **Apple Watch complications (a few days).** The daily streak and today's puzzle (done or not) on the watch face, from the same data as the Lock Screen widgets. Needs a small watch app; no playing on the watch.
5. **Later, if sharing takes off: a Messages app.** Send a friend today's puzzle as a bubble, they solve it in Messages, both see who did it faster. The most viral of these, and the most work (a week or more).

Not worth it now: Live Activities (a puzzle takes a minute, nothing to follow on the Lock Screen), an App Clip (a shared link already plays instantly on the website), CarPlay, Focus filters.

- **Puzzle rush.** Three minutes, as many puzzles as you can, getting harder as you go. A Game Center leaderboard and a challenge to send a friend. It can reuse the rank streak code (`pickRunPuzzle`, `finishRun`) with a timer in place of the one-miss rule.
- **Store screenshots in the new languages.** The 30 languages added in November 2026 show the English screenshots on their App Store pages; the listing workflow makes and uploads localized ones once a version is editable (the next version).

Android (the app is built: `android/README.md`; it launches once Google Play is set up):

1. **Launch steps (the owner's).** Package name, Play Console app, upload key, first bundle by hand, then the closed test (12 testers for 14 days on a personal account) before production. Play Games and App Links once the app is in Play Console. Everything after that is automated (release, listing, Play Games ids).
2. **Check on a real phone before the first release.** TalkBack, haptics, the widgets on a home screen, the Quick Settings tile, Play Games' screens: the emulator test can't see these.
3. **Progress between devices while they're in use (later).** iCloud does it on iOS; on Android only the Google backup (a new phone). Play Games' saved games could carry the save the same way.
4. **Store screenshots in other languages.** Google Play shows the English ones everywhere; `screenshots.js android --lang` can make them, and `store/listing.py` would upload them per language.

## On hold

- **"Why does this work?" explanations.** After a puzzle, a short plain explanation of the winning idea. In the app this could come from Apple's on-device model (the Foundation Models framework), working from the known solution line so it can't make up moves. App only; check its chess claims before shipping. In China mainland it counts as AI-generated content: turn it off there, or the App Compliance answers change (ios/store/launch.md).

## Not yet

- **Apple Watch.** First step: the rank, rating and daily streak as watch face complications, reusing the Lock Screen widgets. Playing on the watch would need a native board, since the watch can't run the web game; only if players ask for it.
