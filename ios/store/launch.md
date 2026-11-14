# Launch plan

How King Walk 1.0 goes from TestFlight to launch day. The website is already live and free; the launch is the iOS app ($0.99) and a push for the daily puzzle.

## 1. Before submitting (the day of submission)

On your iPhone, with the newest TestFlight build:

- [ ] Play a few puzzles; reach a celebration (Menu → Start over on a test device, or play until a rank-up).
- [ ] The daily puzzle: Daily → solve it → Share (the picture and the text arrive together in Messages).
- [ ] Widgets: add both (rank, and Daily puzzle) to the Home Screen; put the phone on a charger on its side for StandBy; add the Lock Screen one.
- [ ] Control Center → + → King Walk → Daily puzzle; tap it.
- [ ] "Hey Siri, play today's King Walk puzzle".
- [ ] Touch and hold the app icon → Today's puzzle.
- [ ] Menu → Daily reminder → pick the next hour; allow notifications; wait for it, tap it.
- [ ] Game Center: Menu → Game Center: leaderboards and challenges show their pictures.
- [ ] VoiceOver: a few moves by swiping and double-tapping. Then publish the accessibility labels (App Store Connect → App Accessibility; they're saved as a draft).
- [ ] Larger Text at the largest size; dark mode; the phone sideways.
- [ ] Switch the phone to another language (Settings → General → Language) and back.

In App Store Connect (not possible through the API):

- [ ] Business → Agreements: the Paid Apps agreement is active, with banking and tax filled in. Without it a $0.99 app can't go on sale.
- [ ] App Privacy still matches: nothing new is collected (the reminder is a local notification).
- [ ] App Review Information: contact name, phone and email.

Then submit, by changing `ios/release.json` and pushing to `main`:

```json
"build": false,
"app_store": {"submit": true, "release": "manual"}
```

`build: false` submits the newest TestFlight build; `manual` keeps the release in your hands after approval. Review usually takes a day or two. `ios/store/status.md` shows the state; App Review's messages arrive by email and in App Store Connect.

## 2. After approval, before launch day

- [ ] App Store Connect → Featuring Nominations: nominate the launch (what's new: a daily chess puzzle, Game Center challenges, widgets, iPhone Duo layouts, 11 languages). Apple asks for at least two weeks' notice for its best chance; submit it as soon as the app is approved, even if launch is sooner.
- [ ] Pick a launch day: Tuesday to Thursday, morning US time.
- [ ] Draft the posts below and line up the people to tell.

## 3. Launch day

- [ ] Release: `"release_now": true` in `ios/release.json`, push (or Release in App Store Connect).
- [ ] When the App Store page is live (an hour or so): check the link works, then update the press kit (`press/index.html`): Release "iOS: out now" with the App Store link.
- [ ] The website: run the **Website** workflow (Actions → Website → Run workflow) once the App Store page is live. The build sees the app is on sale and turns on the quiet "Also on iPhone and iPad" line for Apple devices; Safari's Smart App Banner shows by itself.
- [ ] Post, in this order, a few hours apart, answering replies as they come:
  1. X (@tensafefrogs): the trailer (`press/king-walk-trailer.mp4`) or the vertical one, and the link.
  2. Reddit: r/chess (the free website, the daily puzzle; read the self-promotion rules first), r/iosgaming (the app).
  3. Hacker News: "Show HN: King Walk – chess puzzles that adapt to you, with a daily puzzle" (the free web version, one HTML file, no build step, open source).
  4. Product Hunt, if you want: a launch can be prepared from here with the Product Hunt connector, with your go-ahead.
  5. The Lichess forum (General Chess Discussion): a thank-you for the puzzle database, with the link. Keep it about the puzzles, not the sale.
- [ ] Email or DM a few writers and chess creators: the press kit link (`/king-walk/press/`) and a promo code each (App Store Connect → the app → Promo Codes; 100 per version).

## 4. The week after

- [ ] `python3 testing/stats.py`-style check of the GoatCounter counts (`testing/STATS.md`): starts, first solves, `daily/start` vs `daily/solved`, `back/1d` and `back/7d` (are people coming back?), `share`.
- [ ] Ratings and reviews: reply to the first ones in App Store Connect.
- [ ] Crashes: App Store Connect → TestFlight / App Analytics → Crashes.
- [ ] Start 1.1 from `ROADMAP.md` (puzzle rush is next).

## Drafts

**X:**
> King Walk is out on iPhone and iPad. Chess puzzles that fight back: solve one, the next gets tougher; miss one, it backs off. Plus a new daily puzzle for everyone, every day. 🔥
> Free on the web, $0.99 on iOS. [link]

**Reddit (r/chess):**
> I made a free chess puzzle site with a daily puzzle. Everyone gets the same one, Monday's easy and Sunday's hard, and you can share your result as squares like Wordle (no spoilers). The puzzles are from the Lichess database; your rating adapts as you go. No account, no ads. Feedback welcome. [link]

**Show HN:**
> Show HN: King Walk – adaptive chess puzzles and a daily puzzle, in one HTML file
> [link] — It's a single index.html with no build step, plays offline, and the daily puzzle is picked from the date, so there's no server. The iOS app wraps the same page and adds widgets, Game Center and iCloud sync.
