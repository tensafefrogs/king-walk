# Accessibility

What King Walk supports, how it works, and how to check it on a device. The App Store shows these as Accessibility
Nutrition Labels (`accessibility` in `ios/store/listing.json`): claim one only after checking it on an iPhone and an iPad.

## What's supported

| Feature | How | Where |
| --- | --- | --- |
| **VoiceOver** (and other screen readers) | Each square is a button named for what is on it and what it means now: "e4, white knight, selected", "f6, empty, can move here", "c3, hint". Every move is announced: "Black knight from g8 to f6, takes pawn, check. Your move." The status line (whose turn, the goal, the result) is a live region. The board has a short description of how to play. | `squareName()`, `describeMove()`, `announce()` in `index.html` |
| **Keyboard, Switch Control, Full Keyboard Access** | The board is one stop in the tab order. The arrow keys move between squares the way the board faces, Enter or Space chooses a piece and then its square, Escape puts it down. The promotion picker takes focus. | the keydown handler on `#squares` |
| **Voice Control** | Every button's spoken name starts with its visible label ("Hint", "Answer", "Next puzzle"), and squares are named by coordinate, so "Tap e4" works. | |
| **Larger Text** | In the app, the page zooms with Settings → Accessibility → Display & Text Size → Larger Text, up to 2x at the largest accessibility size; the layout reflows down to 195 CSS pixels wide. On the web, browser zoom does the same. | `applyTextSize()` in `GameViewController.swift` |
| **Dark Interface** | Light and dark themes follow the system. | CSS `prefers-color-scheme` |
| **Differentiate Without Color** | Results have icons and words (Solved, Not that one), hints and selection are rings and dots, not only color. | |
| **Sufficient Contrast** | Text and controls pass WCAG AA in both themes (axe). | |
| **Reduced Motion** | Confetti, piece flights and other animations are cut or shortened. | `REDUCED` and the CSS `prefers-reduced-motion` block |
| Haptics and sound | Optional, each with its own switch; nothing depends on them. | |

`node testing/smoke.js` plays a whole puzzle with the keyboard alone and checks the squares' names and the move
announcements. An axe audit (axe-core in a browser) of the playing, menu and solved screens, light and dark, found
nothing beyond a missing landmark, since fixed.

## Checking on a device (before publishing the labels)

- **VoiceOver** (triple-click the side button if set up): swipe through the status, the board's squares and the buttons; double-tap one of your pieces, then a square it can move to; hear the other side's reply; solve a puzzle; use Hint and Answer; open the menu and change a setting.
- **Voice Control**: "Show names", then "Tap Hint", "Tap e2", "Tap e4", "Tap Next puzzle".
- **Larger Text**: set the largest accessibility size, open the app, check nothing is cut off and the buttons wrap; change the size with the app open.
- **Switch Control / Full Keyboard Access** with a keyboard: Tab to the board, arrows, Space.
- **Reduce Motion** on: solve a puzzle; no confetti, no sliding.

Then set `"publish": true` under `accessibility` in `ios/store/listing.json` and push; the App Store listing workflow publishes the labels.
