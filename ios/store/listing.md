# App Store listing and materials: King Walk

Everything the App Store needs for King Walk, what makes each piece, and what is still done by hand. Limits are App Store Connect's.

The text, URLs, categories, age rating, review notes and screenshots are uploaded from `listing.json` and `screenshots/` by `upload_listing.py`. The header art and app preview go up through `creative.py`, and Game Center through `gamecenter.py`. All three run on GitHub (the **App Store listing** workflow, `.github/workflows/store.yml`) whenever their files change on `main`. Edit `listing.json` to change the listing, and keep this page in step.

## Checklist

| Material | Size / limit | Made by | Status |
| --- | --- | --- | --- |
| App icon (light, dark, tinted) | 1024×1024 | `node ios/scripts/art.js` from `brand/mark-square.svg` | Done: `ios/KingWalk/Assets.xcassets/AppIcon.appiconset/` |
| iPhone screenshots, 6.9" | 1320×2868, 3 to 10 | `node ios/store/screenshots.js iphone` | Done: `screenshots/iphone-1` to `5` |
| iPad screenshots, 13" | 2064×2752, 3 to 10 | `node ios/store/screenshots.js ipad` | Done: `screenshots/ipad-1` to `5` |
| iPhone Duo screenshots | inner screen 2007×2853 (open, or held like a book) and 2853×2007 (propped up) | `node ios/store/screenshots.js duo-inner`, `duo-book`, `duo-table` | Done: one set of five, `APP_IPHONE_DUO` in `listing.json` |
| App preview video (iPhone, also used for iPhone Duo) | 886×1920, 15 to 30 s, stereo audio track | `node scripts/trailer.js --preview` | `previews/iphone-1.mp4` |
| Product page header and search results art (iOS 27) | 5244×2950 (16:9), no alpha | `node ios/store/header.js` | Done: `header/universal-16x9.png` (+ 21:9 and 3:2 cuts) |
| Game Center achievement images | 512×512, 13 of them | `node ios/scripts/art.js` | Done: `gamecenter/*.png` |
| Name, subtitle, promotional text, description, keywords | see below | `listing.json` | Done |
| Privacy policy, terms, support pages | URLs | `privacy.html`, `terms.html`, `support.html` at the repo root | Done (live once pushed to `main`) |
| Press kit | | `press/index.html`, `python3 scripts/press-kit.py` | Done |
| Trailer for the press kit and social posts | 1920×1080 and 1080×1920 | `node scripts/trailer.js`, `--vertical` | `press/king-walk-trailer*.mp4` |
| App Privacy answers | | by hand, see below | To do in App Store Connect |
| Pricing ($0.99), availability | | by hand | Done in App Store Connect |
| App Review contact (name, phone, email) | | by hand | To do in App Store Connect |
| TestFlight group "Internal" | | by hand | To do in App Store Connect |

Optional, later: a Promotional Event card (needs a 1920×1080 image, no text), in-app events, a custom product page, localizations.

## App information

- **Name** (30): King Walk: Chess Puzzles
- **Subtitle** (30): Chess puzzles that fight back
- **Category:** Games. Subcategories: Board, Puzzle. Secondary category: Education
- **Content rights:** Yes, it contains third-party content, and we have the rights: the puzzles are from the Lichess puzzle database, public domain (CC0)
- **Age rating:** None to every question. Rating: 4+
- **Copyright:** © 2026 Geoff Stearns

## Version 1.0

**Promotional text** (170, can change without a new build):

> Spot the fork. Find the mate. Survive the streak. 53,000 puzzles from real games that get harder as you get better. Pawn today, King someday.

**Description** (4000):

> Think you can see three moves ahead? Prove it.
>
> King Walk throws real chess puzzles at you, 53,000 of them, pulled from actual games. Solve one and the next gets tougher. Miss one and it backs off. A few dozen puzzles in, it knows exactly how good you are. Then it starts pushing.
>
> You start as a Pawn. Earn Knight, Bishop, Rook and Queen. Reach King and you've walked the whole board.
>
> • 53,000 puzzles from real games: forks, pins, skewers and sneaky back-rank mates
> • A rating that finds your level and climbs with you
> • Rank streaks: 15 puzzles, no hints, one miss and you're out
> • Challenge friends in Game Center and settle who's actually good
> • Stuck? Take a hint. We won't tell anyone.
> • Missed one? It comes back later for a rematch
> • Big, loud celebrations every time you rank up
> • A home screen widget to show off your rank
> • Haptics, dark mode, VoiceOver and larger text
> • Works offline. No account, no ads, no in-app purchases
>
> The puzzles come from the public-domain Lichess puzzle database. King Walk is not made or endorsed by Lichess.

**Keywords** (100, commas, no spaces after them; words already in the name, like chess and puzzles, don't need repeating):

> tactics,checkmate,mate in 2,elo,rating,trainer,strategy,board,brain,logic,fork,pin,endgame,daily

**Support URL:** https://geoffstearns.com/king-walk/support.html
**Marketing URL:** https://geoffstearns.com/king-walk/
**Privacy policy URL:** https://geoffstearns.com/king-walk/privacy.html

## Screenshots

Five per device, in this order. Each is the real game at the device's size, framed on the brand's deep teal with a caption. They're made from a saved player at Bishop rank (rating about 1110), so the progress card and chart look lived in. Re-run the script after any change to what's on screen and look at the results before committing.

| # | Caption | Shows |
| --- | --- | --- |
| 1 | Chess puzzles that grow with you | A puzzle, the player's turn, with the goal |
| 2 | 53,000 puzzles from real games | Solved: confetti, the rating going up, the puzzle's themes |
| 3 | Stuck? Take a hint | Both hint circles on the board |
| 4 | Walk up from Pawn to King | The progress card right after reaching Rook: the ladder, stats and chart |
| 5 | Light or dark. No account. No ads. | Dark mode, a piece picked up with its moves shown |

**iPhone Duo** (one set, `APP_IPHONE_DUO`): `duo-table-1` ("Prop it up like a laptop": the board on the flat half, the scoreboard on the upright half), `duo-book-2` (held like a book: the board on the right page), `duo-table-4`, `duo-inner-3`, `duo-table-5`. The other `duo-*` files are there to swap in. If Apple's API refuses the Duo type, the upload skips that set and says so; it can go up by hand.

Ideas for later sets: the widget on a home screen (needs a real device screenshot), Game Center achievements, an iPad landscape shot, the emoji share text in Messages.

## Header and search results (iOS 27 and later)

`header/universal-16x9.png` (5244×2950) fills both the product page header and the search results slot. It shows a real puzzle board from the game, tilted, beside the icon, the name and the tagline. `header/header-21x9.png` and `header/search-3x2.png` are the same picture cut for each slot; everything that matters sits inside the area both cuts keep. Uploaded by `creative.py` from `creative` in `listing.json`.

## App preview (video)

`previews/iphone-1.mp4`: 886×1920, under 30 seconds, a silent stereo track, real gameplay at normal speed, no URL or price on screen. Made with `node scripts/trailer.js --preview`; re-record it when the game's look changes, and watch it before committing. Placed for iPhone by `creative.py`. App Store Connect makes the poster frame from the video.

## Game Center

`gamecenter.json` lists the 9 leaderboards (Puzzle Rating, Best Streak, Hardest Solve and a streak for each rank), 19 achievements (970 points of the 1000 allowed) and 7 challenges (each rank's streak, and Hardest Solve), with names, descriptions and images. `gamecenter.py` turns Game Center on for the app, creates whatever is missing and adds Game Center to the version being prepared. Ids are `kingwalk.<id>`. Achievements and leaderboards can't be deleted, and points can't change, once they're live, so settle them before the first release.

If the script can't do a step (it says which), do it in App Store Connect → the app → Features → Game Center: add each leaderboard and achievement with the id, name, description and image from `gamecenter.json` and `gamecenter/`, then on the version page under Game Center, turn it on and add them all.

## App Privacy

- **Data used to track you:** none
- **Data linked to you:** none
- **Data not linked to you,** both used for Analytics only:
  - Usage Data → Product Interaction (GoatCounter event counts)
  - Location → Coarse Location (GoatCounter works out the country from the IP address and doesn't store the address)

Game Center and iCloud are Apple's services and aren't declared by the app.

## Pricing and availability

$0.99 (US price tier), all countries and regions. Needs the Paid Apps Agreement, banking and tax forms in App Store Connect → Business. The website stays free.

## App Review notes

Uploaded from `review_notes` in `listing.json` (App Review Information → Notes). They explain what the app is, how to use it and what it adds on iOS beyond the website (App Review checks web-based apps under guideline 4.2, minimum functionality). Set the contact details in App Store Connect by hand. No sign-in is needed, so no demo account.

> King Walk is a single-player chess puzzle game. No account, no login, no in-app purchases, no ads, no user-generated content, no chat.
>
> PURPOSE AND AUDIENCE
> For anyone who wants to get better at chess tactics, from beginners to club players. Each puzzle is a position from a real game where there is one best line. The player's puzzle rating goes up with clean solves and down with misses, and the next puzzles are chosen near that rating, so the difficulty follows the player.
>
> HOW TO USE IT (no setup needed)
> - Launch the app. The first puzzle loads right away: the other side moves first, then it is your turn ("White to play", with the goal, e.g. "Checkmate in 2").
> - Tap a piece, then tap where it goes (or drag it). A wrong move is shown and taken back.
> - Hint circles the piece to move; a second hint circles where it goes. Answer plays the solution.
> - After each puzzle: Next puzzle. The Progress card shows the rating, the rank ladder (Pawn to King), stats and a rating chart.
> - Rank streaks (under Progress): tap a rank for 15 puzzles that climb through it, with Hint and Answer off; a wrong move ends the run. They don't change the rating, and are the Game Center challenges (Pawn Streak to King Streak, plus Hardest Solve).
> - After each puzzle: Share (iOS share sheet). Menu (top right): Sound, Haptics, puzzle difficulty, Share, Game Center (leaderboards and achievements), Start over, How it works, Credits, Advanced (a save code to move progress to the website), and Support / Privacy / Terms links.
> - Home screen and Lock Screen widget: shows the player's rank and rating.
>
> WHAT THE APP ADDS ON iOS
> Haptic feedback for moves, captures, wrong moves and solves; Game Center leaderboards, 19 achievements and 7 challenges; a home screen and Lock Screen widget; iCloud sync of progress between the player's devices; the iOS share sheet (an emoji summary of the player's progress with a link to the App Store page); on iPhone Duo, layouts for half open like a laptop (the board on the flat half, progress on the upright half) and like a book (the board on one page, notes on the other), with a left-handed option; light and dark appearance, portrait and landscape. All 53,000 puzzles are bundled, so it plays fully offline.
>
> EXTERNAL SERVICES
> None are needed to play. Optional: Game Center (Apple), iCloud key-value storage (Apple) for syncing progress, and GoatCounter, which receives anonymous event counts (for example, "reached Bishop rank") with no personal data, no identifiers and no cookies. Each puzzle has a link to its page on lichess.org, which opens in Safari.
>
> REGIONS
> The app works the same in every region. English only.
>
> THIRD-PARTY MATERIAL
> The puzzles come from the Lichess puzzle database, which Lichess released into the public domain (CC0): https://database.lichess.org/#puzzles. The app is not made or endorsed by Lichess and says so in Credits. Chess rules: chess.js (BSD license). Fonts: Fredoka and Nunito (SIL Open Font License). The pieces, icon and artwork are original.
