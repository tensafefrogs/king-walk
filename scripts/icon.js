// Draws King Walk's icon from a few numbers and writes every file made from it: the icon (brand/mark*.svg and
// mark-1024.png), the two logos (the icon beside the name), the website's icons (icons/), the favicon, and the copy
// of the icon in the game's header (index.html).
// The picture, on gold: a 2x2 board grid (dark and cream squares below, a dark square above on the right) and the
// white king in the empty top-left cell, about to step up. Everything sits on the grid: the king is centred on the
// left column, the top of his crown meets the top of the dark square beside him, and his base sits one gap above
// the step, the same gap as between the squares. The cross rises above the line, and the whole shape, cross
// included, is centred.
// The icon uses the king as he looks on the board (shaded); the favicon and other small sizes the flat, outlined
// king, which stays crisp at 16 and 32 pixels.
// After running it: node ios/scripts/art.js (the app icon and its dark and tinted versions come from
// brand/mark-square.svg), node ios/store/header.js (header art and og.png), python3 scripts/press-kit.py.
// usage: node scripts/icon.js      Needs Playwright (for the PNGs).
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const out = (f, s) => fs.writeFileSync(path.join(ROOT, f), s);

const GOLD = "#f2c230", INK = "#16302c", CREAM = "#fdfbf2";
// GRID: cell size and gap, in a 512 square. The king's shapes in their 100 box: crown lobes' top at y 21, base at 90.
const GRID = { cell: 168, gap: 14 };
const KING = fs.readFileSync(path.join(ROOT, "brand/pieces/wk.svg"), "utf8");
const SHAPES = KING.match(/<g fill="#fdfbf2">([\s\S]*?)<\/g>/)[1];
// the king's drawing in its 100 box, and half its outline: shaded (as on the board) or flat (outlined, for small sizes)
const king = (flat, id) => flat
  ? { half: 3, svg: `<g stroke="${INK}" stroke-width="6" stroke-linejoin="round" fill="${INK}">${SHAPES}</g><g fill="${CREAM}">${SHAPES}</g>` }
  : { half: 2.5, svg: KING.slice(KING.indexOf(">") + 1, KING.lastIndexOf("</svg>")).replace(/id="([^"]+)"/g, `id="${id}-$1"`).replace(/url\(#([^)]+)\)/g, `url(#${id}-$1)`) };

/* The icon on a 512 square. rx: corner radius (0 for places that round it themselves); scale: smaller, for the
   maskable icon's safe zone; flat: the outlined king; id: a prefix for the king's mask ids, unique per page. */
function mark({ rx = 116, scale = 1, flat = false, id = "icon" } = {}) {
  const { cell: c, gap: g } = GRID, k = king(flat, id), grid = 2 * c + g, top = 21;
  const s = c / ((90 + k.half) - top);                              // crown on the top line, base on the cell's bottom line
  const over = (top - (4 - k.half)) * s;                            // the cross above the line
  const x0 = (512 - grid) / 2, y0 = (512 - grid - over) / 2 + over, r = (c * 0.17).toFixed(1);
  const body = `<rect x="${x0}" y="${y0 + c + g}" width="${c}" height="${c}" rx="${r}" fill="${INK}"/>`
    + `<rect x="${x0 + c + g}" y="${y0 + c + g}" width="${c}" height="${c}" rx="${r}" fill="${CREAM}"/>`
    + `<rect x="${x0 + c + g}" y="${y0}" width="${c}" height="${c}" rx="${r}" fill="${INK}"/>`
    + `<svg x="${(x0 + c / 2 - 50 * s).toFixed(1)}" y="${(y0 - top * s).toFixed(1)}" width="${(100 * s).toFixed(1)}" height="${(100 * s).toFixed(1)}" viewBox="0 0 100 100">${k.svg}</svg>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="${rx}" fill="${GOLD}"/>`
    + (scale === 1 ? body : `<g transform="translate(256 256) scale(${scale}) translate(-256 -256)">${body}</g>`) + "</svg>";
}
const favicon = () => mark({ rx: 96, flat: true, id: "fav" });

// the icon inside the logos: the first 512 units of their width, up to where the name starts
function inLogo(file) {
  const s = fs.readFileSync(path.join(ROOT, file), "utf8"), a = s.indexOf('<rect width="512" height="512"');
  const inner = s.indexOf("<svg x=", a), end = s.indexOf("</svg>", inner) + 6;
  const m = mark(); out(file, s.slice(0, a) + m.slice(m.indexOf("<rect"), m.lastIndexOf("</svg>")) + s.slice(end));
}

out("brand/mark.svg", mark());
out("brand/mark-square.svg", mark({ rx: 0 }));
out("brand/mark-maskable.svg", mark({ rx: 0, scale: 0.78 }));          // inside the 80% circle Android may cut it to
out("icons/favicon.svg", favicon());
inLogo("brand/logo.svg"); inLogo("brand/logo-on-dark.svg");
// the game's header (about 40 px): the flat icon with the page's corner radius, inline
const page = fs.readFileSync(path.join(ROOT, "index.html"), "utf8"), a = page.indexOf('<svg class="mark"'), b = page.indexOf("</svg></svg>", a) + 12;
const head = mark({ rx: 128, flat: true, id: "hdr" }).replace('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">', '<svg class="mark" viewBox="0 0 512 512" aria-hidden="true">');
out("index.html", page.slice(0, a) + head + page.slice(b));

(async () => {
  const { chromium } = require("playwright");
  const b = await chromium.launch(), p = await b.newPage();
  const png = async (svgFile, file, w, h = w) => {
    await p.setViewportSize({ width: w, height: h });
    await p.setContent(`<html><body style="margin:0;background:transparent"><img src="data:image/svg+xml;base64,${fs.readFileSync(path.join(ROOT, svgFile)).toString("base64")}" style="display:block;width:${w}px;height:${h}px"></body></html>`);
    await p.waitForTimeout(150);
    await p.screenshot({ path: path.join(ROOT, file), omitBackground: true });
  };
  await png("brand/mark.svg", "brand/mark-1024.png", 1024);
  await png("brand/mark.svg", "icons/icon-512.png", 512);
  await png("brand/mark.svg", "icons/icon-192.png", 192);
  await png("brand/mark-square.svg", "icons/apple-touch-icon.png", 180);          // iOS rounds the corners itself
  await png("brand/mark-maskable.svg", "icons/icon-maskable-512.png", 512);
  await png("icons/favicon.svg", "icons/favicon-32.png", 32);
  await png("brand/logo.svg", "brand/logo.png", 1600, 490);
  await png("brand/logo-on-dark.svg", "brand/logo-on-dark.png", 1600, 490);
  await b.close();
  console.log("saved the icon, logos, website icons, favicon and the header's icon");
})();
