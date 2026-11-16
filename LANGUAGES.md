# Languages

King Walk is in 44 languages: every language the App Store has, plus regional versions of Portuguese, Spanish and
Chinese. This page says how the game picks and loads them, how to add one, and the brief that translators work from.

## How it works

- **Tables:** `lang/<tag>.js`, one per language (`de.js`, `hi.js`), each setting `KW_STRINGS[tag]`: English text →
  translation. The keys are the English strings in `index.html` (`T("…")` calls and the page's markup). A missing key
  shows in English. `{name}` placeholders are filled in by the game.
- **Regional tables** are laid over their language's: `pt-PT` (Portugal and Africa) and `es-ES` (Spain) hold only the
  strings that read differently there; the base `pt` is Brazil's and the base `es` Latin America's. `zh-Hant`
  (Taiwan, Hong Kong, Macau) is a whole table.
- **Picking:** a small script at the top of the page's scripts (`LANGS`, `VARIANTS`) takes the player's first
  language the game has, and the regional table their region asks for, then loads only those files (a player in
  English loads none). `?lang=de` or `?lang=pt-PT` overrides it, for tests and screenshots. `KW_LANG` tells the
  game what was picked; dates and times follow the player's own region (`LOCALE`), with digits always 0-9.
- **Right to left:** Arabic, Hebrew and Urdu (`RTL`) set `dir="rtl"`. The page mirrors; the board, its coordinates
  and the rating chart stay left to right, and a sideways phone keeps the board on the same side.
- **Fonts:** each script has a font that matches Fredoka and Nunito, loaded only for text in that script
  (`unicode-range` in the page's `@font-face` rules): Cyrillic from Nunito; Hebrew from Fredoka and Rubik; Arabic and
  Urdu from Baloo Bhaijaan 2; India's scripts from its Baloo 2 sisters; Greek from M PLUS Rounded 1c; Thai from Mitr;
  accented Latin and Vietnamese from Fredoka and Nunito themselves (Vietnamese headings use Nunito). Japanese,
  Korean and Chinese use the device's fonts. The store captions take the same rules (`ios/store/screenshots.js`).
- **Grammar the game can't do:** one string per key, so where a count changes a noun's form (Russian, Polish, Arabic…)
  translators write a label and the number ("Дней подряд: {n}"), and where a language adds endings to the words the
  game fills in (Finnish, Hungarian, Turkish, Tamil) they rephrase so nothing attaches to them.
- **The app** shows the page in the language iOS picks for it from `CFBundleLocalizations` (`ios/project.yml`), and
  its own few strings (Siri, the widget, Game Center sign-in) come from the `.lproj` folders.
- **Stats:** `lang/<tag>` is the language shown; `lang-wanted/<code>` counts new players whose first language the
  game doesn't have, which is how to choose the next one.

## Adding a language

1. Translate (see the brief below): the game's table, the app's and the widget's `.lproj` files, and the store page.
2. `lang/<tag>.js`, in the key order of `lang/es.js`, and the tag in `LANGS` in `index.html`. A language written right
   to left goes in `RTL`.
3. A new script needs a font: an `@font-face` rule per weight with its `unicode-range`, as the others do (the
   fontsource packages on npm have the files and ranges); check joined scripts in `letter-spacing: 0`.
4. The app: the `.lproj` folders (`ios/KingWalk/<lproj>.lproj/`, `ios/KingWalkWidget/<lproj>.lproj/`) and the tag in
   both `CFBundleLocalizations` lists in `ios/project.yml`.
5. The store: `ios/store/l10n/<locale>.json` (as `es-ES.json`) with `"from_version"`, the first app version whose
   build has the language; the locale in the screenshots list in `.github/workflows/store.yml`; and What's New for it
   in `ios/release.json` when that version ships.
6. The website's structured data (`inLanguage` in `.github/workflows/pages.yml`), the list in `testing/STATS.md`,
   the press kit's language list and the count wherever the listing and `CHANGELOG.md` give one.
7. Test: `node testing/unit.js` (every key, placeholders, the loader's list matches the files), then the layout check
   in the new language on the sizes that break first, and look at it on a phone (`?lang=<tag>`).

Machine translations ship; a native player reading one over is worth asking for, chess terms and tactic names first.

## The brief for translators

Translators (people or agents) get the English keys with two or three existing translations beside them for context
(for example `{en, es, de, ru}` from the tables), and this:

> Translate as a native game localizer would: natural, friendly and short, matching the playful English.
> - Keep every `{placeholder}` exactly. The game fills them with numbers or already-translated words (rank and piece
>   names, squares like e4): make the sentence work whatever goes in, rephrasing ("Rank: {rank}") if case or gender
>   would otherwise break it.
> - Where a count changes the noun's form, write a label and the count ("Days in a row: {n}").
> - Digits stay 0-9. Keep in Latin letters: King Walk, Game Center, iCloud, VoiceOver, Lichess, App Store, MIT,
>   square names and notation (e4, Nf3). Keep "›" and emoji as they are.
> - Keys with HTML: keep the tags and attributes exactly, translate only the text.
> - Button labels stay short: phones are narrow.
> - Chess terms and tactic names as that language's players and chess sites (Lichess, Chess.com) use them,
>   consistently. The ranks are the piece names.
> - Address the player as games in that language do (the game is casual: German du, Spanish tú), avoiding wording
>   that only fits one gender.
> - Store page: name (30 characters, "King Walk: " and "Chess Puzzles" in the language), subtitle 30, promotional
>   text 170, keywords 100 (commas, no spaces, nothing already in the name), description 4000; Game Center names;
>   screenshot captions.
> - No emoji in What's New (App Store Connect refuses them).

Then check: every key present with the same placeholders (`unit.js` does), the store file has the same keys as
`es-ES.json`, the limits hold, and the `.strings` lines are all `"…" = "…";`. Look for characters from the wrong script
in each table (a Hindi table with Bangla letters, Simplified characters in Traditional Chinese).
