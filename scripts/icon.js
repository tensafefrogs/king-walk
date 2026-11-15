// Draws King Walk's icon from a few numbers and writes every file made from it: the icon (brand/mark*.svg and
// mark-1024.png), the two logos (the icon beside the name), the website's icons (icons/), the small favicon, and
// the copy of the icon in the game's header (index.html). The picture: a white king climbing a staircase of board
// squares, on gold. The king stands on the middle step, against the top one.
// The favicon is drawn separately (FAVICON below): at 16 and 32 pixels the full picture is only a checkerboard, so
// it has three squares and a much bigger king.
// After running it: node ios/scripts/art.js (the app icon and its dark and tinted versions come from
// brand/mark-square.svg), node ios/store/header.js (header art and og.png), python3 scripts/press-kit.py.
// usage: node scripts/icon.js      Needs Playwright (for the PNGs).
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const out = (f, s) => fs.writeFileSync(path.join(ROOT, f), s);

// The king (brand/pieces/wk.svg's shapes), drawn in a 100x100 box with a soft shadow, as on the board.
const KING = fs.readFileSync(path.join(ROOT, "brand/pieces/wk.svg"), "utf8");
const kingSvg = (x, y, size, id) => {
  const inner = KING.slice(KING.indexOf(">") + 1, KING.lastIndexOf("</svg>")).replace(/id="([^"]+)"/g, `id="${id}-$1"`).replace(/url\(#([^)]+)\)/g, `url(#${id}-$1)`);
  return `<svg x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${size}" height="${size}" viewBox="0 0 100 100">${inner}</svg>`;
};

const GOLD = "#f2c230", INK = "#16302c", CREAM = "#fdfbf2";
// LAYOUT: square size, gap, king size, how far the picture sits below the middle, and the king's nudge left
const LAYOUT = { sq: 92, gap: 7, king: 236, down: 30, kingLeft: 6 };

/* The icon on a 512 square. rx: corner radius (0 for places that round it themselves); scale: smaller, for the
   maskable icon's safe zone; id: a prefix for the king's mask ids, unique per page. */
function mark({ rx = 116, scale = 1, id = "icon" } = {}) {
  const L = LAYOUT, s = L.sq * scale, g = L.gap * scale, step = s + g, k = L.king * scale;
  const w = 3 * s + 2 * g, x0 = 256 - w / 2, yb = 256 + L.down * scale + w / 2 - s;          // left edge, bottom row's top
  const cells = [[0, 0, INK], [1, 0, CREAM], [1, 1, INK], [2, 0, INK], [2, 1, CREAM], [2, 2, INK]];
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="${rx}" fill="${GOLD}"/>`;
  for (const [c, r, fill] of cells) svg += `<rect x="${(x0 + c * step).toFixed(1)}" y="${(yb - r * step).toFixed(1)}" width="${s.toFixed(1)}" height="${s.toFixed(1)}" rx="${(s * 0.18).toFixed(1)}" fill="${fill}"/>`;
  const stepTop = yb - step, stepCx = x0 + step + s / 2 - L.kingLeft * scale;          // the middle step
  return svg + kingSvg(stepCx - k / 2, stepTop - k * 0.9, k, id) + "</svg>";          // the king's base is at 90 of its 100
}

/* The favicon: two steps of three squares (dark and light below, dark above on the right) and a big king on the
   lower step, outlined so it holds its shape at 16 pixels. */
function favicon() {
  const shapes = KING.match(/<g fill="#fdfbf2">([\s\S]*?)<\/g>/)[1];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="96" fill="${GOLD}"/>`
    + `<rect x="60" y="316" width="190" height="150" rx="30" fill="${INK}"/><rect x="262" y="316" width="190" height="150" rx="30" fill="${CREAM}"/>`
    + `<rect x="262" y="154" width="190" height="150" rx="30" fill="${INK}"/>`
    + `<svg x="10" y="46" width="300" height="300" viewBox="0 0 100 100"><g stroke="${INK}" stroke-width="7" stroke-linejoin="round" fill="${INK}">${shapes}</g><g fill="${CREAM}">${shapes}</g></svg></svg>`;
}

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
// the game's header: the same icon with the page's corner radius, inline
const page = fs.readFileSync(path.join(ROOT, "index.html"), "utf8"), a = page.indexOf('<svg class="mark"'), b = page.indexOf("</svg></svg>", a) + 12;
const head = mark({ rx: 128, id: "hdr" }).replace('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">', '<svg class="mark" viewBox="0 0 512 512" aria-hidden="true">');
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
