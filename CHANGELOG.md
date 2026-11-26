# King Walk changes

What players notice, release by release, for drafting App Store "What's New", TestFlight notes, posts and press
updates. Newest first. Add each notable change under **Unreleased** as it lands (say whether it's on the website
already or waits for the app); when an app version is submitted, move its part under that version's heading.
Fixes players wouldn't notice, tooling and store plumbing stay out (the git log has them).

## Unreleased

### Next app version (1.0.6)

- **Missed puzzles come back on a spaced-repetition schedule:** a puzzle missed or solved with a hint returns after 1
  day, then 3, 7, 14 and 30 days. Solved cleanly and quickly it moves to the next gap; slowly or with a hint it waits the
  same gap again; missed, it starts over at 1 day; solved at the 30-day step it's learned and leaves the list. Reviews mix
  into normal play (at most 1 puzzle in 5) and leave the rating alone. Before, a miss came back once, 30 puzzles later.
  (Live on the website.)

### 1.0.5 (submitted to App Review 2026-11-26, build 2611260318, released on approval; all of it already on the website)

- **The daily week's ✓ and × sit in the middle of their circles:** they were letters from each phone's own fallback
  font and sat high on some phones; they're drawn now, the same everywhere. (Live on the website.)
- **Android: Play Games' achievements and leaderboards open** from the menu's Google Play Games row (tapping either did
  nothing). (On the Android closed test since 1.0.5 build 29925921.)
- **Slovak and Romanian say "skewer" as their players do:** *napichnutia* and *frigărui* (they read "Röntgeny" and
  "Atacuri liniare"), the terms their chess coaches and sites use; the Romanian store text too. (Live on the website.)
- **The daily puzzle's Answer asks first:** it ends the day and the daily streak, so it now asks ("Show the answer?"), with
  Keep trying to go back to the puzzle. In the iOS app's first weeks the daily ended with the answer shown far more often
  than solved, even on easy days. (Live on the website.)
- **A daily played as the very first puzzle shows how to move a piece,** the tip the first normal puzzle has. (Live on the
  website.)
- **Dialog buttons in Chinese, Japanese and Korean stay whole** on a narrow phone, on a row of their own, rather than
  breaking after any character. (Live on the website.)
- **Sound that stopped comes back:** on iPhone the game's sounds could stop for good after a few puzzles (iOS left the
  audio silent after an interruption, such as a notification). The next tap now starts it again. (Also on the website.)
- **Every solve is celebrated:** a puzzle solved with a hint gets the board's glow and the piece's bounce, and one
  solved after a wrong move the bounce (only a clean solve had any celebration). A clean solve keeps its confetti.
  (Also on the website.)
- **The store pages say it plainly:** the apps play fully offline, with every puzzle on the device (the description,
  the promotional text and the search keywords, in every language).
- **Stats made offline aren't lost:** play counts made without a connection wait on the device (up to 1,000, for a
  week) and go out once it's back online, two a second at most so GoatCounter isn't flooded. (Also on the website.)
- **The daily's week stays put:** the row of the last seven days popped in again after the daily started, and once a
  minute while it was open. It now animates once, as the daily opens. (Also on the website.)
- **End a practice set early:** the practice chip ("Pins 3/10 ✕") is a button that asks, then goes back to your puzzles; the
  puzzles played still count. (Also on the website.)
- **Hints, move by move:** every move of a puzzle has its own two hints, the piece to move and then the arrow (a second
  hint used to stay an arrow for the rest of the puzzle, and two used them up). Any hint still makes it a hint solve.
  (Also on the website.)
- **"Your coach is ready":** once the coach knows enough (about 30 puzzles), a card says so after that puzzle, and its
  button scrolls down to the coach under Progress and lights it up, so players learn where it lives. Once per player.
  (Also on the website.)
- **A coach that learns your weak spots:** after each puzzle the game
  notes, on the device, how you did at that kind of puzzle (forks, pins, checkmates, 15 kinds in all) against what
  your rating expected. After about 30 puzzles, a Coach section under Progress shows what to **work on**, each with a
  one-line explanation and **Practise**, and what you're **strong at**; All areas shows every kind marked better than,
  about as, or worse than expected. No numbers, no account, nothing leaves the device.
- **Progress reads top to bottom:** the rank, the three numbers and the rating chart together (how am I doing), then
  the coach and rank streaks (what to do next). On iPhone Duo the coach has its own row propped up like a laptop, and
  sits under the chart on the notes page held like a book.
- **Practice sets:** Practise starts 10 puzzles of that kind at your level. Hints and Answer are there and a miss
  doesn't end it; each puzzle counts half toward your rating. The set ends with "7 of 10" and whether that kind is
  getting better.
- **Coached puzzle choice, on by default:** once the coach knows your game, about 3 in 10 new puzzles come from what
  you're working on, a little easier than usual, and count fully. Settings, Puzzle choice: Coached or Any kind. About
  1 new player in 10 starts on Any kind for the first month, to measure the coach.
- **Each puzzle's kinds after it:** next to the puzzle's link once it's over ("Pins · Back-rank mates").


- **The daily's share, previewed, in clearer colours:** the card at the end of the daily shows exactly what Share
  sends: the day's number, one square per move and the time, and the streak. The squares: 🟩 first try, 🟨 after one
  wrong try, 🟧 after more, 🟥 answer shown, 💡 solved with a hint (they were 🟩, 🟥 for any wrong try, ⬛ shown).
  The first line has the weekday again ("King Walk Daily #10 · Sunday", in the player's language), since the day says
  how hard the puzzle was. The time comes first, then the squares, and the card's title is a short, smaller "Solved!" (or "That was the
  answer") in place of "Today's puzzle: done".
- **A daily finished after midnight gets its card:** a daily started before midnight and finished after it saved its
  result but stopped there, with no card and no Share; now it shows the day's card as usual. And a daily whose first
  move came while the game was in the background (switching apps right after opening it) no longer counts the time
  spent away.
- **The day's card comes first:** an achievement the daily earns (such as a 3-day streak) now celebrates after the
  daily's card is closed, so the card and its Share are always the first thing after the daily.

What's New: "Meet your coach: King Walk now learns which kinds of puzzle you're strong at and which to work on, with
practice sets of 10. Plus a new card at the end of the daily puzzle that shows what Share sends." (in all 46 store
languages, `ios/release.json`). The App Store and Google Play descriptions gain "A coach that learns your weak spots,
with practice sets to work on them", and the screenshots show the coach under Progress.

### 1.0.4 (released 23 November 2026, build 2611220327)

- **Fits sideways on older iPads:** on a 9.7" or 10.2" iPad held sideways the game no longer scrolls a little: the
  board leaves room for the status bar. (Live on the website since 2026-11-21.)
- The anonymous play counts go to King Walk's own GoatCounter site, like the website's (1.0.3 still sends them to the
  old shared one; `testing/stats.py` can add both).

What's New: "Fits better on older iPads held sideways, and small fixes." (in all 46 store languages, `ios/release.json`)

### Android app (new; not on Google Play yet)

- **King Walk for Android:** the same game in an app for Android phones and tablets (`android/`), playable offline,
  with the daily reminder, haptics, Share, the Google Play rating prompt, the back gesture and a "Today's puzzle"
  shortcut on the app's icon (touch and hold). It turns with the phone, follows dark mode and the phone's text size
  while a game is open (on Android 13 too, whose WebView doesn't pass dark mode on by itself), moves less when the phone's Remove animations is on, and gives the launcher a themed icon. Progress goes into the
  phone's Google backup, so a new phone starts where the old one left off. Not there yet: progress moving between
  devices while they're in use.
- **Android's own parts:** the game's language is the app's language in the phone's settings (Android 13 and later),
  in both directions; a Today's puzzle tile for Quick Settings; links to the website's game and to a shared daily
  puzzle open the app (once Google Play's signing key is known to the site); Google Play updates download while the
  game is open and go in when the player leaves it.
- **Google Play Games:** the same achievements and leaderboards as Game Center, in Settings as "Google Play Games"
  (on once they're made in Play Console). Two new strings in every language: "Achievements" and "Leaderboards".
- **Home screen widgets on Android,** as on iPhone: your rank and rating (wider, with the rating chart and your
  counts), and the daily puzzle with today's board seen from the side to play, the opponent's last move in gold and
  your daily streak (a close-up of the board at 2 x 2, the whole board when it's bigger). The daily one changes to the
  next day's board at midnight with the app closed; tapping it opens today's puzzle.

### Website only (live on kingwalk.app)

- **Android phones hear about the Android app,** once it's on Google Play: the same bar, end-of-page line and settings
  links that point iPhones to the App Store point Android browsers to Google Play ("King Walk for Android"), with
  Google Play Games in place of Game Center. Until the website build finds the app's Google Play page, nothing changes.
  Two new strings in every language.
- **Computers hear about the app too:** on a Mac, Windows or Linux (not Android), the website shows the App Store bar
  at the end of the page, with a QR code to scan with an iPhone, plus the app's lines in Settings and on the daily's
  card, as iPhone and iPad already did. A Mac with Apple silicon can install the app from the Mac App Store.
- **The support, privacy and terms pages open with a Play card:** search can land people there ("king walk app" found
  the terms), so each starts with the game's name and a Play button, in the visitor's language, going to that
  language's page. The game's own page is titled "King Walk: Chess Puzzles" now, as on the App Store.
- Everything in 1.0.2 below is already on the website.
- **Opened from X, Instagram, TikTok and the like,** a quiet line says progress stays in that app's browser, with
  a link that opens the game in Safari (or Chrome), and a pointer to the save code once there's progress to bring.
- **A page in each language** (kingwalk.app/de/, /hi/, /ja/…) with its title and description in that language, so
  search engines and shared links show the game in it.
- **The website downloads only your language**, so it starts as fast as before however many languages it has.
- **The website's first puzzle needs about a tenth of the download** (15–30 KB instead of 125–250 KB): puzzles now
  come in small pieces instead of whole rating bands, and stay saved on the device until they change. Easier on slow
  connections.
- **The iPhone app is suggested now and then** on iPhone and iPad browsers: a bar between puzzles in Chrome and other
  browsers without Safari's banner, a line on the daily's result and on streak awards, a quiet bar at the end of the
  page, and settings rows for what only the app has (daily reminder, widgets, Game Center, iCloud). At most one a
  week, each kind at most once a month, × hides them for a month; people who already have the app see at most one a month.

## 1.0.3 (released; build 2611181939: the daily's clock and pause and resume)

- **The daily puzzle pauses and picks up where you left off:** leave it (the app to the background, Puzzles, another
  tab) and its clock stops and the position is saved, with your marks and time, and in the app to iCloud, so it carries
  on on another device too. Back, the board waits under a Paused card with the time so far; Continue starts the clock
  again. (Also live on the website.)
- **The daily's clock:** the time so far, at the end of the status bar while you play the daily; tap it to pause.
  (Also live on the website.)
- **The daily share leaves out the weekday:** "♟️ King Walk Daily #12", then the squares; the number already says which
  day. (Also live on the website.)
- **Today's puzzle on your Home Screen:** the daily widget in medium and large sizes shows the position itself, whose
  turn and the goal ("Black to play · Checkmate in 2"), with the streak; tap to play. It changes at midnight on its own.
  The small size shows a close-up of the board: the king to be mated, or the square the opponent just moved to.
- **Your first puzzles find your level:** a new player's first few puzzles (up to 10) take big steps up or down
  instead of starting everyone at 600 and climbing slowly, so a strong player isn't stuck on easy puzzles for an hour.
  Meanwhile the rank and rating stay hidden, with no rank-ups; at the end one card says "You placed at Bishop" with the
  rating. Players who have already played are unaffected. (Also live on the website.)
- **Difficulty says what it means:** Relaxed, Balanced, Challenging (were Easier, Just right, Harder), with what to
  expect under them ("Some misses, about 6 in 10") and that the rating is fair in any mode. (Also live on the
  website.)
- **Celebration titles break between words:** a two-line title ("You placed at Bishop", "Streak saved!") could break in
  the middle of a word on a phone. (Also live on the website.)
- **Keep the streak alive:** at a 3-day daily streak the done card offers a daily reminder ("Remind me at 6 pm"), and
  with a reminder set before 7 pm, a day not yet played gets one more note at 9 pm: "Your streak ends at midnight".
- **Settings → Language:** play in a language other than the device's (already on the website).
- **Widgets look more like the game:** its rounded Fredoka numbers, the gold play button while today's puzzle waits,
  the green check once it's done, and the King Walk icon on the daily widget.

## 1.0.2 (released 18 November 2026)

- **Bigger text no longer zooms the game off the screen:** with the iPhone's text even one size larger, the app drew the
  whole page bigger but kept it as wide as the screen, so it was cut off and slid sideways (a player's report: the real
  cause of the stuck zoom). The game now lays itself out for the bigger text and always fits.

- **44 languages, up from 11:** every language the App Store has. New: Arabic and Hebrew (the whole game laid out
  right to left; the board stays as in any chess book), Hindi, Bangla, Marathi, Tamil, Telugu, Gujarati, Kannada,
  Malayalam, Odia, Punjabi and Urdu, Thai, Vietnamese, Indonesian, Malay, Turkish, Polish, Czech, Slovak, Slovenian,
  Croatian, Ukrainian, Greek, Romanian, Hungarian, Catalan, Swedish, Danish, Norwegian, Finnish and Traditional Chinese
  (Taiwan, Hong Kong). Portugal gets its own Portuguese and Spain a few Spain-only words. Each script has a font that
  matches the game's rounded style, and the App Store page goes up in each language.
- **Dates and times follow your region:** a 24-hour clock where people use one (the reminder times, the daily's day).
- **Never stuck zoomed in:** the game could get stuck zoomed in, sliding left and right (a player's report; most
  likely a quick double tap). Every way to zoom is now off, and the page never slides sideways.
- **Fits the largest text sizes:** with the biggest accessibility sizes, some settings and buttons ran off the side of
  the screen; now everything fits.
- **Cards fit a phone on its side:** rank-ups, achievements and the daily's result put the picture beside the words,
  so the buttons no longer fall off the screen.
- **Daily share starts with ♟️**, so it reads as chess at a glance in a group chat.
- **Cards fit the smallest phones** (iPhone SE): a shorter picture, and a card scrolls inside rather than off screen.
- **Rank streak badges** keep their names on narrow screens (long names like Springer or Конь).
- Links from the app to the website say they came from the app, so the website doesn't suggest the app to people who have it.

## 1.0.1 (released 16 November 2026)

- **A green check on the calendar** once today's puzzle is done (a coral dot while it waits).
- **Sharing a daily achievement shares your daily result**, with the achievement on the streak line.
- **A shared daily link opens today's puzzle**, or your result with Share if you've already played.

## 1.0 (released 15 November 2026)

The launch, on iPhone, iPad and the web (kingwalk.app).

- 53,000 puzzles from real games (the Lichess puzzle database), with a puzzle rating that finds your level and climbs with you.
- Ranks from Pawn to King, with big celebrations at each.
- A daily puzzle, the same for everyone, easiest on Monday; daily streaks with streak freezes; an emoji share.
- Rank streaks: 15 puzzles climbing through a rank, no hints, one miss ends the run.
- Hints (the piece, then the arrow), Answer, and missed puzzles coming back for a second try.
- Game Center leaderboards, achievements and challenges; widgets for the Home Screen, Lock Screen and StandBy; a
  Control Center control and Siri action; a daily reminder; iCloud sync; haptics.
- VoiceOver, larger text, dark mode, a left-handed layout, layouts for iPhone Duo.
- 11 languages: English, Spanish, French, German, Italian, Portuguese (Brazil), Dutch, Russian, Japanese, Korean,
  Chinese (Simplified).
- Works offline. No account, no ads, no in-app purchases.
