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

/* ---------- Game Center art: flat, travel-poster style ----------
   Bold flat colour, simple shapes, no gradients or soft shadows: a sky, a big sun with wedge rays, layered hills,
   and the pieces as solid silhouettes. */
const C = { gold: "#f2c230", sun: "#f7d35a", ink: "#16302c", deep: "#143f38", teal: "#1c7868", mint: "#56c2ad", sea: "#2f9c86", cream: "#fdfbf2", sky: "#cfe9df", coral: "#e2704f" };
// a piece as one solid shape: the outline layer of the brand piece, filled with one colour
function silhouette(t, x, y, size, color) {
  const svg = pieceSvg("w" + t), m = svg.match(/<g fill="#1c2826" stroke="#1c2826" stroke-width="5">([\s\S]*?)<\/g>/);
  return `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 100 100"><g fill="${color}" stroke="${color}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round">${m[1]}</g></svg>`;
}
function sunRays(cx, cy, r1, r2, n, color, turn = 0) {
  let d = "";
  for (let i = 0; i < n; i++) {
    const a0 = (i / n + turn) * Math.PI * 2, a1 = ((i + 0.5) / n + turn) * Math.PI * 2;
    d += `M${cx + Math.cos(a0) * r1},${cy + Math.sin(a0) * r1} L${cx + Math.cos(a0) * r2},${cy + Math.sin(a0) * r2} L${cx + Math.cos(a1) * r2},${cy + Math.sin(a1) * r2} L${cx + Math.cos(a1) * r1},${cy + Math.sin(a1) * r1} Z`;
  }
  return `<path d="${d}" fill="${color}"/>`;
}
// a hill as a smooth bump across the width w, its top at peakX/peakY, sitting on baseY
const hill = (w, baseY, peakX, peakY, color, spread = 0.55) =>
  `<path d="M0,${baseY} C${peakX - w * spread * 0.5},${baseY} ${peakX - w * spread * 0.35},${peakY} ${peakX},${peakY} C${peakX + w * spread * 0.35},${peakY} ${peakX + w * spread * 0.5},${baseY} ${w},${baseY} L${w},${baseY + 4000} L0,${baseY + 4000} Z" fill="${color}"/>`;
const mountain = (x, y, w, h, color, snow) => `<path d="M${x - w / 2},${y + h} L${x},${y} L${x + w / 2},${y + h} Z" fill="${color}"/>` +
  (snow ? `<path d="M${x - w * 0.12},${y + h * 0.24} L${x},${y} L${x + w * 0.12},${y + h * 0.24} L${x + w * 0.04},${y + h * 0.19} L${x - w * 0.03},${y + h * 0.26} Z" fill="${snow}"/>` : "");

/* An achievement badge, 512x512 (Game Center shows it in a circle, so everything sits inside one) */
function badge(a) {
  const S = 512, art = a.art;
  let sky = C.sky, scene = "";
  if (art.piece && !art.number && !art.label) {          // a new rank: the piece on top of the hill, the sun behind
    scene = sunRays(256, 230, 120, 250, 14, C.cream) + `<circle cx="256" cy="230" r="112" fill="${C.gold}"/>`
      + hill(S, 520, 120, 360, C.mint, 0.6) + hill(S, 560, 400, 380, C.sea, 0.6) + hill(S, 600, 256, 330, C.teal, 0.5)
      + silhouette(art.piece, 186, 168, 140, C.ink);
  } else if (art.label && art.piece) {          // a rank streak cleared: the piece on a summit, a flag beside it, gold sky
    sky = C.gold;
    scene = sunRays(256, 250, 110, 270, 12, C.sun) + mountain(256, 210, 420, 330, C.deep, C.cream) + mountain(110, 330, 300, 220, C.teal) + mountain(410, 320, 320, 230, C.teal)
      + `<rect x="300" y="150" width="7" height="70" fill="${C.ink}"/><path d="M307,150 L352,163 L307,176 Z" fill="${C.coral}"/>`
      + silhouette(art.piece, 196, 92, 120, C.ink);
  } else if (art.number) {          // a count: the number big on a sun
    const streak = /row/.test(art.label || "");
    sky = streak ? C.deep : C.teal;
    scene = sunRays(256, 236, 150, 270, 16, streak ? C.teal : C.sea) + `<circle cx="256" cy="236" r="150" fill="${C.gold}"/>`
      + `<text x="256" y="${String(art.number).length > 3 ? 280 : 292}" text-anchor="middle" font-family="Fredoka" font-weight="700" font-size="${String(art.number).length > 3 ? 120 : 150}" fill="${C.ink}">${art.number}</text>`
      + (streak ? Array.from({ length: 5 }, (_, i) => `<rect x="${126 + i * 54}" y="${420 - i * 14}" width="44" height="${40 + i * 14}" rx="8" fill="${i % 2 ? C.cream : C.gold}"/>`).join("")
                : hill(S, 470, 256, 410, C.mint, 0.9));
  } else if (art.slayer) {          // a small pawn facing a giant king
    scene = `<circle cx="330" cy="180" r="80" fill="${C.gold}"/>` + hill(S, 520, 256, 420, C.teal, 0.9)
      + silhouette("k", 220, 120, 280, C.ink) + silhouette("p", 92, 330, 100, C.coral);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}"><rect width="${S}" height="${S}" fill="${sky}"/>${scene}</svg>`;
}

/* A challenge image, 1920x1080, no text: Game Center shows the challenge's name over it */
function challengeArt(kind, t) {
  const W = 1920, H = 1080;
  let sky = C.sky, scene = "";
  if (kind === "hardest") {          // a king alone on the highest peak, a huge sun behind
    sky = C.gold;
    scene = sunRays(1260, 420, 260, 1100, 18, C.sun) + `<circle cx="1260" cy="420" r="250" fill="${C.coral}"/>`
      + mountain(1260, 330, 1100, 900, C.deep, C.cream) + mountain(560, 520, 900, 700, C.teal) + mountain(1800, 560, 800, 600, C.teal)
      + hill(W, 1000, 900, 860, C.mint, 0.8) + silhouette("k", 1165, 160, 190, C.ink);
  } else {          // a rank streak: 15 steps zigzag up a hill to the rank's piece on the top
    scene = sunRays(1500, 330, 200, 900, 16, C.cream) + `<circle cx="1500" cy="330" r="190" fill="${C.gold}"/>`
      + hill(W, 1080, 300, 640, C.mint, 0.7) + hill(W, 1080, 1180, 420, C.teal, 0.9) + hill(W, 1180, 1700, 820, C.sea, 0.6);
    for (let i = 0; i < 15; i++) {
      const k = i / 14, x = 300 + k * 860 + (i % 2 ? 40 : -40) * (1 - k), y = 1000 - k * 520;
      scene += `<rect x="${x - 34}" y="${y - 14}" width="68" height="28" rx="10" fill="${i % 2 ? C.cream : C.gold}"/>`;
    }
    scene += silhouette(t, 1070, 225, 220, C.ink);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${sky}"/>${scene}</svg>`;
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
    await render(badge(a), 512, path.join(gc, a.id + ".png"), false);
  }
  // Game Center challenge art
  try { fs.unlinkSync(path.join(gc, "challenge-streak.png")); } catch (e) {}
  const arts = [["challenge-hardest.png", challengeArt("hardest")], ...["p", "n", "b", "r", "q", "k"].map(t => [`challenge-streak-${t}.png`, challengeArt("streak", t)])];
  for (const [name, svg] of arts) {
    await p.setViewportSize({ width: 1920, height: 1080 });
    await p.setContent(`<!doctype html><style>html,body{margin:0}svg{display:block}</style>${svg}`);
    await p.screenshot({ path: path.join(gc, name) });
  }
  await b.close();
  console.log("saved the app icon, widget pieces,", ACH.length, "achievement images and", arts.length, "challenge images");
})();
