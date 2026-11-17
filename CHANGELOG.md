# King Walk changes

What players notice, release by release, for drafting App Store "What's New", TestFlight notes, posts and press
updates. Newest first. Add each notable change under **Unreleased** as it lands (say whether it's on the website
already or waits for the app); when an app version is submitted, move its part under that version's heading.
Fixes players wouldn't notice, tooling and store plumbing stay out (the git log has them).

## Unreleased

### Next app version

- Nothing yet.

### Website only (live on kingwalk.app)

- Everything in 1.0.2 below is already on the website.
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

## 1.0.3 (queued: built for TestFlight, submitted once 1.0.2 is out, released on approval)

- **Keep the streak alive:** at a 3-day daily streak the done card offers a daily reminder ("Remind me at 6 pm"), and
  with a reminder set before 7 pm, a day not yet played gets one more note at 9 pm: "Your streak ends at midnight".
- **Settings → Language:** play in a language other than the device's (already on the website).
- **Widgets look more like the game:** its rounded Fredoka numbers, the gold play button while today's puzzle waits,
  the green check once it's done, and the King Walk icon on the daily widget.

## 1.0.2 (in App Review, third build submitted 16 November 2026)

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
