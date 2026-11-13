# King Walk

A free chess puzzle game that adapts to the player. It has 53,000 puzzles from real games. Solve puzzles and your puzzle rating goes up and the puzzles get harder. Miss them and the puzzles get easier.

It is a static web page with no server and no accounts. Progress is saved in the browser. It works with a mouse or a touchscreen, can be installed to a phone or tablet home screen, and keeps working offline for puzzle levels it has already loaded. It counts a few anonymous events (see Stats below).

There is also an iOS app for iPhone and iPad (`ios/`), which plays the same page offline and adds haptics, Game Center, a widget and iCloud sync. See `ios/README.md`.

The name comes from chess: a king walk is when a king marches up the board to help win the game. The best-known example is Short vs. Timman, Tilburg 1991. In this game you start at Pawn rank and work your way up to King.

## How it works

- **Puzzle rating.** Each player has a puzzle rating and each puzzle has a rating. A clean solve (no mistakes, no hints) raises the player's rating. A miss lowers it. The size of the change follows the Elo formula, so beating a hard puzzle is worth more than beating an easy one. The rating moves faster during the first 30 puzzles so it finds the player's level quickly.
- **Puzzle choice.** The game picks a puzzle the player has not seen, rated about 50 points below the player. By the rating formula that is a success rate of a little over half, and in practice somewhat more, because the game shows the goal of each puzzle. The "Easier" and "Harder" settings shift the target to 300 below or 100 above.
- **What the number means.** Puzzle ratings come from Lichess, where they are set by how real players did on each puzzle. The player's number is on that same puzzle scale. It measures puzzle solving, not game play, and it usually reads higher than a rating earned by playing games. Treat it as a way to track progress, not as an official Elo rating. Each puzzle links to its page on Lichess at the bottom of the progress card.
- **Hints.** The first hint circles the piece to move. The second circles where it goes. A puzzle solved with a hint counts as half a solve.
- **Second tries.** A missed puzzle comes back once, about 30 new puzzles later, as practice. New puzzles come first; practice puzzles do not change the rating.
- **Ranks.** Pawn (below 700), Knight (700), Bishop (1000), Rook (1300), Queen (1600), King (1900).
- **Starting over.** "Start over" in the menu erases progress and begins again at 600.
- **Moving progress.** "Advanced" in the menu gives a save code to copy and paste on another device.

## Run it

The page loads puzzle files with `fetch`, so it needs to be served over HTTP. Opening `index.html` straight from disk will not work.

```
python3 -m http.server 8000
```

Then open http://localhost:8000. To publish it, turn on GitHub Pages for the repository.

The live copy is at https://geoffstearns.com/king-walk/. The social preview tags in `index.html` use that full address. If you host a copy somewhere else, replace that address everywhere it appears in `index.html`.

## Test it

```
node testing/smoke.js
```

Plays a few puzzles in a browser (Playwright) on the web and in a simulated iOS app, and checks the app gets its messages. GitHub runs it on every push.

## Stats

The game sends anonymous events to GoatCounter: no cookies, no identifiers, nothing linked to a person. `testing/STATS.md` lists them: `start`, `platform/<device>`, `played/<n>`, `rank/<name>`, `back/<days>`, `mode/<difficulty>`, `share`, `fold/table`, `gamecenter`, `rate-ask`, `sound-off`, `haptics-off`, `reset`, `save-code/copy`, `save-code/load`. The privacy policy is `privacy.html`.

## Your own copy

Nothing in the code points at the owner's accounts. Accounts and IDs come from GitHub Actions variables and secrets (Settings → Secrets and variables → Actions), so a copy of this repo builds and runs as its own game and sends nothing anywhere until you set your own:

| Variable | What it's for | Example |
| --- | --- | --- |
| `GOATCOUNTER_URL` | Anonymous stats (optional; none are sent without it) | `https://example.goatcounter.com/count` |
| `SITE_URL` | Where the website lives: the app's Share link and its Support, Privacy and Terms links | `https://example.github.io/king-walk/` |
| `BUNDLE_ID` | The iOS app's bundle ID (the widget gets `.widget` on the end, the app group `group.` in front) | `com.example.kingwalk` |
| `APP_STORE_ID` | The app's Apple ID in App Store Connect, so the app's Share link goes to its App Store page (optional) | `1234567890` |

The iOS secrets (`ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8`, `APPLE_TEAM_ID`) are in `ios/README.md`. The website deploys through `.github/workflows/pages.yml`, which writes `config.js` from the variables: set Settings → Pages → Source to **GitHub Actions**. To run it somewhere else, fill in `config.js` by hand.

## Install it

- **iPhone or iPad:** get the app (`ios/`), or open the site in Safari, tap Share, then "Add to Home Screen".
- **Android or desktop Chrome:** use "Install app" in the browser menu.

## Files

- `index.html` - the whole game: markup, styles and code.
- `chess.js` - the chess rules library (see credits).
- `p/400.txt` to `p/2400.txt` - the puzzles, one file per 100-point rating band. Each line is tab-separated: puzzle id, position (FEN), solution moves, rating, themes. The first move in the solution is the opponent's move that sets up the puzzle.
- `manifest.webmanifest`, `sw.js`, `icons/` - home screen install and offline support.
- `fonts/` - the two typefaces, bundled so the game makes no outside requests.
- `og.png` - the preview image shown when the link is shared.
- `brand/` - logo, icon, colors and the chess piece set. See `brand/README.md`.
- `privacy.html`, `terms.html`, `support.html` - the policy and support pages (linked from the menu and the App Store).
- `ios/` - the iOS app, its App Store listing and the release tooling. See `ios/README.md`.
- `press/` - the press kit page, at /king-walk/press/ (not linked from the game).
- `testing/` - the browser test and the stats notes.

## License

The game is released under the MIT license (see `LICENSE`). That covers the code, the chess piece artwork, the logo and icon, and the preview image, all of which were made for this project.

Parts made by others keep their own licenses:

- **Puzzles:** the [Lichess puzzle database](https://database.lichess.org/#puzzles), released by Lichess into the public domain (CC0). The puzzles here are a sample of that set: 3,000 per rating band from 400 to 1999 and 1,000 per band from 2000 to 2499, limited to well-tested, well-liked puzzles. This game is not made or endorsed by Lichess. Lichess is a free, donation-funded chess site: https://lichess.org
- **Chess rules:** [chess.js](https://github.com/jhlywa/chess.js) version 0.10.3 by Jeff Hlywa, BSD 2-Clause license. The license text is at the top of `chess.js`.
- **Fonts:** [Fredoka](https://fonts.google.com/specimen/Fredoka) and [Nunito](https://fonts.google.com/specimen/Nunito), SIL Open Font License. The license files are in `fonts/`.
