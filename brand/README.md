# King Walk brand pack

Everything here is MIT licensed with the rest of the project.

## Logo

| File | Use |
|---|---|
| `mark.svg`, `mark-1024.png` | The icon on its own, with rounded corners. |
| `mark-square.svg` | Square corners, for places that round the corners themselves (iOS home screen). |
| `mark-maskable.svg` | Extra padding, for Android adaptive icons. |
| `logo.svg`, `logo.png` | Icon plus name, for light backgrounds. |
| `logo-on-dark.svg`, `logo-on-dark.png` | Icon plus name, for dark backgrounds. |
| `wordmark.svg`, `wordmark-on-dark.svg` | The name on its own. The letters are outlines, so no font is needed. |

The icon is a white king walking up a staircase of board squares, on gold. It shows the name: a king walk is a king marching up the board. At very small sizes (16 to 32 pixels) the king is hard to see and the staircase carries the shape.

Rules of thumb:

- Keep clear space around the logo equal to one square of the staircase.
- Do not go below 24 px for the icon or 120 px wide for the full logo.
- Do not recolor the tiles, rotate the icon, or put the gold icon on a yellow background.

## Colors

| Name | Hex | Use |
|---|---|---|
| Gold | `#f2c230` | Icon background, hints, celebration |
| Ink | `#16302c` | Icon tiles, name on light backgrounds |
| Cream | `#fdfbf2` | Icon tiles, white pieces, name on dark backgrounds |
| Teal | `#1c7868` | Buttons and links (light theme) |
| Deep teal | `#143f38` | Preview image background |
| Mint | `#56c2ad` | Buttons and links (dark theme) |
| Page | `#edf1ef` / `#111817` | Page background, light / dark |
| Board light | `#eceed8` | Light squares |
| Board dark | `#7c9d70` | Dark squares |
| Board frame | `#24443d` | Frame around the board |
| Good | `#1f7a3c` | Solved, rating up |
| Bad | `#b23a30` | Wrong move, rating down |

## Type

- **Fredoka** (500, 600, 700) for the name, headings, buttons and numbers.
- **Nunito** (400, 600, 700, 800) for body text.

Both are in `../fonts/` under the SIL Open Font License.

## Chess pieces

`pieces/` holds the twelve pieces as separate SVG files on a 100 x 100 grid: `wk`, `wq`, `wr`, `wb`, `wn`, `wp` for White and `bk` to `bp` for Black. They are original to this project. White pieces are cream with an ink outline. Black pieces are slate (`#38454b`) with a near-black outline. Each has a darker right side for depth.

## Preview image

`../og.png` (1200 x 630) is the image shown when the link is shared. Tagline: "Chess puzzles that grow with you."
