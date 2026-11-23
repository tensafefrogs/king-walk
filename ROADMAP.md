# Roadmap

What's planned for King Walk, and what's on hold. Done features move out of this file.

## Next

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
   against `back/7d`, and the holdback's own returns (`testing/STATS.md`, The coach). With the first app version that has the
   coach (1.0.6; 1.0.5, queued now, doesn't): the listing's "A coach that learns your weak spots", and store screenshots
   and press kit showing the coach card (`ios/store/screenshots.js` should pose a player whose coach is ready). Not
   before: 1.0.5's submission uploads the repo's screenshots.
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
