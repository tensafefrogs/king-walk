# Roadmap

What's planned for King Walk, and what's on hold. Done features move out of this file.

## Next

- **Puzzle rush.** Three minutes, as many puzzles as you can, getting harder as you go. A Game Center leaderboard and a challenge to send a friend. It can reuse the rank streak code (`pickRunPuzzle`, `finishRun`) with a timer in place of the one-miss rule.
- **A page per language for search engines, and a language picker.** Google crawls in English, so it only sees the English game. The website build could make kingwalk.app/de/, /hi/ and so on: the page with its title and description in that language and that language fixed, `hreflang` links between them and in the sitemap. A language picker in Settings would let players choose a language other than their device's, and links Google to the pages. Website only.
- **Store screenshots in the new languages.** The 30 languages added in November 2026 show the English screenshots on their App Store pages; the listing workflow makes and uploads localized ones once a version is editable (the next version).

## On hold

- **Practice by theme, and a weak-spots coach.** Every puzzle is tagged (fork, pin, back-rank mate and so on), and the game knows which ones a player misses. A theme picker would let players practise one idea. A coach note would point at their weakest theme ("you miss pins most; here are 10"). No AI is needed: the data is already in the save.
- **"Why does this work?" explanations.** After a puzzle, a short plain explanation of the winning idea. In the app this could come from Apple's on-device model (the Foundation Models framework), working from the known solution line so it can't make up moves. App only; check its chess claims before shipping.

## Not yet

- **Apple Watch.** First step: the rank, rating and daily streak as watch face complications, reusing the Lock Screen widgets. Playing on the watch would need a native board, since the watch can't run the web game; only if players ask for it.
