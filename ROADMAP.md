# Roadmap

What's planned for King Walk, and what's on hold. Done features move out of this file.

## Next

- **Puzzle rush.** Three minutes, as many puzzles as you can, getting harder as you go. A Game Center leaderboard and a challenge to send a friend. It can reuse the rank streak code (`pickRunPuzzle`, `finishRun`) with a timer in place of the one-miss rule.
- **Languages for India.** Chess is booming there, and the App Store has taken store pages in Hindi and ten more Indian languages since March 2026 (Bangla, Gujarati, Kannada, Malayalam, Marathi, Odia, Punjabi, Tamil, Telugu, Urdu; codes like `ta-IN`). Many Indian players keep their phones in English (`en-IN` already gets Indian date and time formats), so start with Hindi: the game, the app and an App Store page, with Baloo 2's Devanagari to match the Arabic font, and Indian piece names (हाथी, ऊँट, घोड़ा, प्यादा) where players use them. Add more languages where the stats show players.

## On hold

- **Practice by theme, and a weak-spots coach.** Every puzzle is tagged (fork, pin, back-rank mate and so on), and the game knows which ones a player misses. A theme picker would let players practise one idea. A coach note would point at their weakest theme ("you miss pins most; here are 10"). No AI is needed: the data is already in the save.
- **"Why does this work?" explanations.** After a puzzle, a short plain explanation of the winning idea. In the app this could come from Apple's on-device model (the Foundation Models framework), working from the known solution line so it can't make up moves. App only; check its chess claims before shipping.

## Not yet

- **Apple Watch.** First step: the rank, rating and daily streak as watch face complications, reusing the Lock Screen widgets. Playing on the watch would need a native board, since the watch can't run the web game; only if players ask for it.
