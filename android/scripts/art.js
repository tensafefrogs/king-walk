// The Android app's icons from the brand files (brand/mark-square.svg): the adaptive icon's foreground (the tiles and
// the king, on Android's gold background from res/values/colors.xml), its monochrome version for themed icons
// (Android 13 and later), and the 512 px icon for the Google Play listing. Renders with Playwright.
// usage: node android/scripts/art.js     Run it again after changing brand/mark-square.svg.
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const RES = path.join(ROOT, "android", "app", "src", "main", "res");
const mark = fs.readFileSync(path.join(ROOT, "brand", "mark-square.svg"), "utf8");
const BG = '<rect width="512" height="512" rx="0" fill="#f2c230"/>';
if (!mark.includes(BG)) throw new Error("brand/mark-square.svg changed: update android/scripts/art.js");
// the adaptive icon is 108 dp, of which a launcher may show only the middle 66 dp circle: the art keeps inside it
const inner = mark.replace(BG, "").replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
const fit = (body, k) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><g transform="translate(256 256) scale(${k}) translate(-256 -256)">${body}</g></svg>`;
const SCALE = 0.64;          // the art (73% of mark-square) at 47% of 108 dp: inside the 72 dp a launcher shows, even in a circle
const foreground = fit(inner, SCALE);
// monochrome: one colour, the shape is what counts (Android tints it); every fill opaque white
const mono = fit(inner.replace(/fill="#[0-9a-f]{6}"/gi, 'fill="#ffffff"').replace(/stroke="#[0-9a-f]{6}"/gi, 'stroke="#ffffff"'), SCALE);
const DENSITIES = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };

(async () => {
  const b = await chromium.launch(), p = await b.newPage({ deviceScaleFactor: 1 });
  const shot = async (svg, size, file, transparent = true) => {
    await p.setViewportSize({ width: size, height: size });
    await p.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await p.screenshot({ path: file, omitBackground: transparent });
  };
  for (const [d, px] of Object.entries(DENSITIES)) {
    await shot(foreground, px, path.join(RES, "mipmap-" + d, "ic_launcher_foreground.png"));
    await shot(mono, px, path.join(RES, "mipmap-" + d, "ic_launcher_monochrome.png"));
  }
  await shot(mark, 512, path.join(ROOT, "android", "store", "icon-512.png"), false);          // Google Play's icon: square, Play rounds it
  await b.close();
  console.log("wrote the launcher icons and android/store/icon-512.png");
})().catch(e => { console.error(e); process.exit(1); });
