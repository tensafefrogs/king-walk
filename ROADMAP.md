# Roadmap

What's planned for King Walk, and what's on hold. Done features move out of this file.

## Next

iOS, in order of impact for the effort (November 2026):

1. **Today's puzzle on the Home Screen (two or three days).** The daily widget shows the position itself: the board drawn from the puzzle (SwiftUI, from the FEN the app already has), whose move, mate in n; a tap opens it. A puzzle in view is a stronger nudge than a number, and it shows in StandBy and on the Lock Screen too.
2. **Apple Games app and Game Center activities (a day or two).** Since iOS 26 the Games app lists a game's activities and lets friends jump into them: add one for the daily puzzle and one per rank streak, so a friend's challenge or score opens the right place. Discovery among people who already play games.
3. **Sticker pack (half a day).** The pieces, the crown, "Checkmate!", "Fork!", the streak flame, as iMessage stickers inside the app. Small but nearly free, and it puts the brand in group chats next to the daily share.
4. **Apple Watch complications (a few days).** The daily streak and today's puzzle (done or not) on the watch face, from the same data as the Lock Screen widgets. Needs a small watch app; no playing on the watch.
5. **Later, if sharing takes off: a Messages app.** Send a friend today's puzzle as a bubble, they solve it in Messages, both see who did it faster. The most viral of these, and the most work (a week or more).

Not worth it now: Live Activities (a puzzle takes a minute, nothing to follow on the Lock Screen), an App Clip (a shared link already plays instantly on the website), CarPlay, Focus filters.

- **Puzzle rush.** Three minutes, as many puzzles as you can, getting harder as you go. A Game Center leaderboard and a challenge to send a friend. It can reuse the rank streak code (`pickRunPuzzle`, `finishRun`) with a timer in place of the one-miss rule.
- **Store screenshots in the new languages.** The 30 languages added in November 2026 show the English screenshots on their App Store pages; the listing workflow makes and uploads localized ones once a version is editable (the next version).

## On hold

- **Practice by theme, and a weak-spots coach.** Every puzzle is tagged (fork, pin, back-rank mate and so on), and the game knows which ones a player misses. A theme picker would let players practise one idea. A coach note would point at their weakest theme ("you miss pins most; here are 10"). No AI is needed: the data is already in the save.
- **"Why does this work?" explanations.** After a puzzle, a short plain explanation of the winning idea. In the app this could come from Apple's on-device model (the Foundation Models framework), working from the known solution line so it can't make up moves. App only; check its chess claims before shipping.

## Not yet

- **Apple Watch.** First step: the rank, rating and daily streak as watch face complications, reusing the Lock Screen widgets. Playing on the watch would need a native board, since the watch can't run the web game; only if players ask for it.
