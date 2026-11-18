// Films the sizzle reel: a 3D board (scripts/sizzle/scene.html, drawn with Three.js) where the game's pieces drop in
// and play a fork, three quick puzzles while the rating climbs the ranks, the daily puzzle with its streak, then a few
// headline features and the end card. The scene draws any moment on demand (renderAt), so it's filmed frame by frame:
// every frame is exactly 1/30 s, however slowly the machine draws. Music: scripts/sizzle/music.py (made, not recorded).
// usage: node scripts/sizzle.js [--vertical] [--frames 0,4.5,12]   Needs Playwright, ffmpeg, npm (for three) and
// python3 with numpy. --frames saves stills at those times instead (to look at a cut quickly).
// Output: press/king-walk-sizzle.mp4 (1920x1080) or press/king-walk-sizzle-vertical.mp4 (1080x1920), and a poster .jpg.
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), os = require("os"), { execFileSync } = require("child_process");
const server = require("../testing/server");
const ROOT = path.join(__dirname, "..");
const vertical = process.argv.includes("--vertical");
const fi = process.argv.indexOf("--frames"), stills = fi > 0 ? process.argv[fi + 1].split(",").map(Number) : null;
const SIZE = vertical ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 };
const NAME = vertical ? "king-walk-sizzle-vertical" : "king-walk-sizzle", FPS = 30;
const OUT = path.join(ROOT, "press");

// the scene's folder: the page, three.js, and the fonts and art it uses
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "king-walk-sizzle-"));
const site = path.join(TMP, "site"); fs.mkdirSync(site);
fs.copyFileSync(path.join(__dirname, "sizzle", "scene.html"), path.join(site, "index.html"));
fs.cpSync(path.join(ROOT, "fonts"), path.join(site, "fonts"), { recursive: true });
fs.cpSync(path.join(ROOT, "brand"), path.join(site, "brand"), { recursive: true });
execFileSync("npm", ["install", "--silent", "--no-save", "--prefix", TMP, "three@0.160.0"], { stdio: "inherit" });
fs.copyFileSync(path.join(TMP, "node_modules", "three", "build", "three.module.min.js"), path.join(site, "three.module.min.js"));

(async () => {
  const srv = await server.start(site);
  const b = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const p = await b.newPage({ viewport: SIZE, deviceScaleFactor: 1 });
  const errs = []; p.on("pageerror", e => errs.push(e.message)); p.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
  await p.goto(srv.url + "index.html"); await p.waitForFunction(() => window.ready, null, { timeout: 30000 });
  if (errs.length) throw new Error(errs.join("\n"));
  if (stills) {
    for (const t of stills) { await p.evaluate(t => renderAt(t), t); await p.screenshot({ path: path.join(TMP, `still-${t}.png`) }); }
    console.log("stills in", TMP); await b.close(); srv.close(); return;
  }
  const dur = await p.evaluate(() => window.DURATION), frames = Math.round(dur * FPS), dir = path.join(TMP, "f"); fs.mkdirSync(dir);
  for (let i = 0; i < frames; i++) {
    await p.evaluate(t => renderAt(t), i / FPS);
    await p.screenshot({ path: path.join(dir, String(i).padStart(5, "0") + ".jpg"), type: "jpeg", quality: 94 });
    if (i % 150 === 0) console.log(`frame ${i} of ${frames}`);
  }
  await b.close(); srv.close();
  if (errs.length) throw new Error(errs.join("\n"));
  const wav = path.join(TMP, "music.wav");
  execFileSync("python3", [path.join(__dirname, "sizzle", "music.py"), wav, String(dur)], { stdio: "inherit" });
  fs.mkdirSync(OUT, { recursive: true });
  const mp4 = path.join(OUT, NAME + ".mp4");
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", path.join(dir, "%05d.jpg"), "-i", wav,
    "-c:v", "libx264", "-preset", "slow", "-crf", "23", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", mp4]);
  fs.copyFileSync(path.join(dir, String(Math.round(29.6 * FPS)).padStart(5, "0") + ".jpg"), path.join(OUT, NAME + ".jpg"));
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log("wrote", path.relative(ROOT, mp4));
})().catch(e => { console.error(e); process.exit(1); });
