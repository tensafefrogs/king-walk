// Makes the app's images from the brand files (brand/): the app icon (with its dark and tinted versions for iOS 18
// and later), the pieces the widget shows, and the Game Center achievement images. Renders with Playwright.
// usage: node ios/scripts/art.js     Run it again after changing brand/mark-square.svg or brand/pieces/.
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const mkdir = d => { fs.mkdirSync(d, { recursive: true }); return d; };
const font = (name, w) => `@font-face{font-family:${name};font-weight:${w};src:url(data:font/woff2;base64,${fs.readFileSync(path.join(ROOT, "fonts", name.toLowerCase() + "-latin-" + w + "-normal.woff2")).toString("base64")})}`;
const FONTS = font("Fredoka", 600) + font("Fredoka", 700) + font("Nunito", 800);

const mark = read("brand/mark-square.svg");
const BG = '<rect width="512" height="512" rx="0" fill="#f2c230"/>';
if (!mark.includes(BG)) throw new Error("brand/mark-square.svg changed: update the icon variants in ios/scripts/art.js");
const ICONS = {
  "icon-1024.png": mark,
  // dark: no background (iOS draws its own dark one), the ink tiles turn gold
  "icon-dark-1024.png": mark.replace(BG, "").split('fill="#16302c"').join('fill="#f2c230"'),
  // tinted: grayscale on no background; iOS colors it with the player's tint
  "icon-tinted-1024.png": mark.replace(BG, "").split('fill="#16302c"').join('fill="#8c8c8c"').split('fill="#fdfbf2"').join('fill="#ffffff"').split('fill="#1c2826"').join('fill="#3a3a3a"'),
};
const pieceSvg = code => read("brand/pieces/" + code + ".svg").trim();

// Game Center achievements: id, title, how to earn it, and the picture. Kept in step with ios/store/gamecenter.json.
const ACH = JSON.parse(read("ios/store/gamecenter.json")).achievements;

function badge(a) {
  const ring = `<circle cx="256" cy="256" r="236" fill="url(#bg)"/><circle cx="256" cy="256" r="222" fill="none" stroke="#f2c230" stroke-width="10"/>`;
  const defs = `<defs><radialGradient id="bg" cx="50%" cy="35%" r="70%"><stop offset="0" stop-color="#1c7868"/><stop offset="1" stop-color="#143f38"/></radialGradient></defs>`;
  let inner = "";
  const piece = (code, x, y, s, extra = "") => `<g transform="translate(${x} ${y}) ${extra}"><svg width="${s}" height="${s}" viewBox="0 0 100 100">${pieceSvg(code).replace(/^<svg[^>]*>|<\/svg>$/g, "")}</svg></g>`;
  if (a.art.piece && !a.art.number) inner = `<circle cx="256" cy="256" r="150" fill="#f2c230"/>` + piece("w" + a.art.piece, 136, 130, 240);
  if (a.art.number) inner = `<text x="256" y="${a.art.label ? 300 : 320}" text-anchor="middle" font-family="Fredoka" font-weight="700" font-size="${String(a.art.number).length > 3 ? 150 : 190}" fill="#fdfbf2">${a.art.number}</text>` +
    (a.art.label ? `<text x="256" y="370" text-anchor="middle" font-family="Nunito" font-weight="800" font-size="44" fill="#f2c230" letter-spacing="3">${a.art.label.toUpperCase()}</text>` : "");
  if (a.art.slayer) inner = piece("bk", 210, 110, 230, "rotate(18 115 115)") + piece("wp", 96, 216, 190);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">${defs}${ring}${inner}</svg>`;
}

(async () => {
  const b = await chromium.launch(), p = await b.newPage();
  async function render(svg, size, out, transparent) {
    await p.setViewportSize({ width: size, height: size });
    await p.setContent(`<!doctype html><style>${FONTS}html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
    await p.evaluate(() => document.fonts.ready);
    await p.screenshot({ path: out, omitBackground: !!transparent });
  }
  const icons = mkdir(path.join(ROOT, "ios/KingWalk/Assets.xcassets/AppIcon.appiconset"));
  for (const [name, svg] of Object.entries(ICONS)) await render(svg.replace("<svg ", '<svg width="1024" height="1024" '), 1024, path.join(icons, name), name !== "icon-1024.png");
  fs.writeFileSync(path.join(icons, "Contents.json"), JSON.stringify({ images: [
    { filename: "icon-1024.png", idiom: "universal", platform: "ios", size: "1024x1024" },
    { appearances: [{ appearance: "luminosity", value: "dark" }], filename: "icon-dark-1024.png", idiom: "universal", platform: "ios", size: "1024x1024" },
    { appearances: [{ appearance: "luminosity", value: "tinted" }], filename: "icon-tinted-1024.png", idiom: "universal", platform: "ios", size: "1024x1024" },
  ], info: { author: "xcode", version: 1 } }, null, 2) + "\n");

  // the white pieces for the widget, at 3x for 64 points
  const wcat = mkdir(path.join(ROOT, "ios/KingWalkWidget/Assets.xcassets"));
  fs.writeFileSync(path.join(wcat, "Contents.json"), JSON.stringify({ info: { author: "xcode", version: 1 } }, null, 2) + "\n");
  for (const t of "kqrbnp") {
    const dir = mkdir(path.join(wcat, `piece-w${t}.imageset`));
    await render(pieceSvg("w" + t), 192, path.join(dir, `piece-w${t}@3x.png`), true);
    fs.writeFileSync(path.join(dir, "Contents.json"), JSON.stringify({ images: [{ filename: `piece-w${t}@3x.png`, idiom: "universal", scale: "3x" }], info: { author: "xcode", version: 1 } }, null, 2) + "\n");
  }

  // Game Center achievement images (512x512, opaque)
  const gc = mkdir(path.join(ROOT, "ios/store/gamecenter"));
  for (const a of ACH) {
    await render(badge(a).replace("<svg ", '<svg style="background:#143f38" '), 512, path.join(gc, a.id + ".png"), false);
  }
  // Game Center challenge art (1920x1080, no text: Game Center shows the challenge's name over it)
  const W = 1920, H = 1080, bg = `<defs><radialGradient id="cbg" cx="50%" cy="38%" r="75%"><stop offset="0" stop-color="#1f8572"/><stop offset=".55" stop-color="#165547"/><stop offset="1" stop-color="#0e2f29"/></radialGradient></defs><rect width="${W}" height="${H}" fill="url(#cbg)"/>`;
  const pc = (code, x, y, size) => `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 100 100">${pieceSvg(code).replace(/^<svg[^>]*>|<\/svg>$/g, "")}</svg>`;
  // Longest Streak: the ranks walking up a staircase of gold tiles, the brand's own picture
  let stairs = "";
  "pnbrqk".split("").forEach((t, i) => {
    const step = 180, x = 330 + i * step, top = 860 - i * 95;
    stairs += `<rect x="${x}" y="${top}" width="${step - 16}" height="${H}" rx="22" fill="${i % 2 ? "#fdfbf2" : "#f2c230"}" opacity="${0.92}"/>`;
    stairs += pc("w" + t, x - 8, top - 172, 180);
  });
  // Hardest Solve: a white king alone on a gold disc with a glow, the top of the climb
  const king = `<circle cx="960" cy="540" r="330" fill="#f2c230" opacity=".18"/><circle cx="960" cy="540" r="250" fill="#f2c230"/>${pc("wk", 760, 330, 400)}`
    + Array.from({ length: 16 }, (_, i) => { const a = i / 16 * Math.PI * 2; return `<line x1="${960 + Math.cos(a) * 360}" y1="${540 + Math.sin(a) * 360}" x2="${960 + Math.cos(a) * 470}" y2="${540 + Math.sin(a) * 470}" stroke="#f2c230" stroke-width="10" stroke-linecap="round" opacity=".55"/>`; }).join("");
  for (const [name, inner] of [["challenge-streak.png", stairs], ["challenge-hardest.png", king]]) {
    await p.setViewportSize({ width: W, height: H });
    await p.setContent(`<!doctype html><style>html,body{margin:0}svg{display:block}</style><svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${bg}${inner}</svg>`);
    await p.screenshot({ path: path.join(gc, name) });
  }
  await b.close();
  console.log("saved the app icon, widget pieces,", ACH.length, "achievement images and 2 challenge images");
})();
