// Makes the App Store screenshots: loads the game with a saved player partway up the ranks, poses five moments,
// captures the screen at the exact device size, then frames each with a caption.
// usage: node ios/store/screenshots.js [iphone|ipad|duo-inner|duo-book|duo-table]   (default: all). Needs Playwright.
// Output: ios/store/screenshots/<device>-<n>.png (captioned, upload these) and raw/<device>-<n>.png.
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const server = require("../../testing/server");
const DEVICES = {   // App Store sizes: iPhone 6.9" 1320x2868, iPad 13" 2064x2752, iPhone Duo inner screen 2007x2853
  iphone: { viewport: { width: 440, height: 956 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  ipad: { viewport: { width: 1032, height: 1376 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  // iPhone Duo: open flat, held like a book and propped up like a laptop (q fakes the fold; see Fold in index.html)
  "duo-inner": { viewport: { width: 669, height: 951 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  "duo-book": { viewport: { width: 669, height: 951 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, q: "?fold=v" },
  "duo-table": { viewport: { width: 951, height: 669 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, q: "?fold=h" },
};
const FRAME = { iphone: { cap: 34, sub: 19, top: 0.17, r: 30 }, ipad: { cap: 56, sub: 28, top: 0.15, r: 22 },   // caption sizes, caption band height, corner radius
  "duo-inner": { cap: 40, sub: 22, top: 0.17, r: 26 }, "duo-book": { cap: 40, sub: 22, top: 0.17, r: 26 }, "duo-table": { cap: 38, sub: 21, top: 0.15, r: 22 } };
// captions that say what a half-open iPhone Duo does, in place of the usual ones
const CAPTIONS = {
  "duo-book": { 1: { caption: "Open it like a <b>book</b>", sub: "The board on one page, the notes on the other." } },
  "duo-table": { 1: { caption: "Prop it up like a <b>laptop</b>", sub: "The board lies flat under your hands. Your progress stands up to read." } },
};
const SHOTS = [
  { id: 1, caption: "Chess puzzles that <b>grow with you</b>", sub: "Solve one and the next gets harder. Miss one and it eases off." },
  { id: 2, caption: "<b>53,000 puzzles</b> from real games", sub: "Forks, pins, mates in two, and the rest." },
  { id: 3, caption: "Stuck? Take a <b>hint</b>", sub: "The first circles the piece. The second shows where it goes." },
  { id: 4, caption: "Walk up from <b>Pawn to King</b>", sub: "Your puzzle rating, your rank and how far you've come." },
  { id: 5, caption: "Light or <b>dark</b>. No account. No ads.", sub: "Plays offline, on iPhone and iPad." },
];
const out = path.join(__dirname, "screenshots"), raw = path.join(out, "raw");
fs.mkdirSync(raw, { recursive: true });
const FONT_DIR = path.join(__dirname, "..", "..", "fonts");
const font = (name, w) => `@font-face{font-family:${name};font-weight:${w};src:url(data:font/woff2;base64,${fs.readFileSync(path.join(FONT_DIR, name.toLowerCase() + "-latin-" + w + "-normal.woff2")).toString("base64")})}`;

/* A player partway up: Bishop rank, a climb in the chart, a streak going. Deterministic, so re-running gives the same shots. */
function savedPlayer() {
  let a = 7, rnd = () => (a = (a * 16807) % 2147483647) / 2147483647;
  const hist = [600]; let r = 600;
  for (let i = 0; i < 180; i++) { r += Math.round((rnd() - 0.36) * 34 * (i < 30 ? 1.6 : 1)); r = Math.max(560, r); hist.push(r); }
  const shift = 1112 - hist[hist.length - 1];
  const h = hist.map((v, i) => Math.max(560, Math.round(v + shift * i / (hist.length - 1))));
  return { v: 2, updatedAt: Date.now(), cur: 0, sound: false, haptics: true, rateAsked: Date.now(), players: [{
    name: "Player 1", rating: h[h.length - 1], n: 180, solved: 117, streak: 4, best: 13, peak: Math.max(...h), hist: h,
    last: [1, 1, 0, 1, 1, 0.5, 1, 1, 1, 0, 1, 1, 1, 0.5, 1, 1, 0, 1, 1, 1], seen: {}, review: [], mode: "normal", since: Date.now() - 40 * 864e5, back: 7 }] };
}

async function newGame(b, name, dark, seed) {
  const { q, ...dev } = DEVICES[name];
  const ctx = await b.newContext({ ...dev, colorScheme: dark ? "dark" : "light", reducedMotion: "no-preference" });
  const p = await ctx.newPage(), errs = [];
  p.on("pageerror", e => errs.push(e.message));
  await p.route(/zgo\.at|goatcounter/, r => r.abort());
  await p.addInitScript(([save, seed]) => {
    let a = seed; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    if (!sessionStorage.getItem("seeded")) { sessionStorage.setItem("seeded", "1"); localStorage.setItem("chess-climb-v1", JSON.stringify(save)); }
  }, [savedPlayer(), seed]);
  await p.goto(srv.url + (q || ""));
  await p.waitForFunction(() => typeof locked !== "undefined" && !locked && !done && cur, null, { timeout: 20000 });
  await p.waitForTimeout(500);
  return { ctx, p, errs };
}
// play the player's moves of the solution (the other side answers by itself)
async function playMove(p) {
  await p.waitForFunction(() => done || !locked, null, { timeout: 15000 });
  await p.evaluate(() => { if (done) return; const m = cur.pz.moves[idx]; commit(m.slice(0, 2), m.slice(2, 4), m[4] || ""); });
}
async function solve(p) { while (!(await p.evaluate(() => done))) { await playMove(p); await p.waitForTimeout(200); } }
const shot = (p, name, id) => p.screenshot({ path: path.join(raw, `${name}-${id}.png`) });

// Seeds that deal a good-looking puzzle (a full-ish board with a clear goal); found by trying a few
const SEEDS = { 1: 11, 2: 5, 3: 23, 4: 11, 5: 41 };
let srv;

async function capture(b, name) {
  // 1: the player's turn, with the goal showing
  let g = await newGame(b, name, false, SEEDS[1]);
  await shot(g.p, name, 1); await g.ctx.close();
  // 2: solved, with confetti, the rating going up and the puzzle's themes
  g = await newGame(b, name, false, SEEDS[2]);
  await solve(g.p); await g.p.waitForTimeout(420); await shot(g.p, name, 2); await g.ctx.close();
  // 3: two hints showing
  g = await newGame(b, name, false, SEEDS[3]);
  await g.p.evaluate(() => { showHint(); showHint(); }); await g.p.waitForTimeout(500); await shot(g.p, name, 3); await g.ctx.close();
  // 4: the progress card, right after a rank up: the ladder, the chart, the stats
  g = await newGame(b, name, false, SEEDS[4]);
  await g.p.evaluate(() => { const p = me(); p.rating = 1291; p.hist.push(1291); renderPanel(); cur.pz.r = Math.max(cur.pz.r, 1420); });
  await solve(g.p); await g.p.waitForTimeout(1200);
  await g.p.evaluate(() => { const c = document.querySelector(".progress"); const r = c.getBoundingClientRect(); window.scrollTo(0, Math.max(0, r.bottom + window.scrollY - window.innerHeight + 24)); });
  await g.p.waitForTimeout(400); await shot(g.p, name, 4); await g.ctx.close();
  // 5: dark mode, a puzzle in progress with a piece picked up
  g = await newGame(b, name, true, SEEDS[5]);
  await g.p.evaluate(() => { const m = cur.pz.moves[idx]; sel = m.slice(0, 2); paint(); }); await g.p.waitForTimeout(300); await shot(g.p, name, 5);
  if (g.errs.length) console.log(name, "page errors", g.errs);
  await g.ctx.close();
  console.log(name, "captured");
}

async function caption(b, name) {
  const d = DEVICES[name], W = d.viewport.width, H = d.viewport.height, F = FRAME[name];
  const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: d.deviceScaleFactor }); const p = await ctx.newPage();
  for (const s0 of SHOTS) {
    const s = Object.assign({}, s0, (CAPTIONS[name] || {})[s0.id]);
    const f = path.join(raw, `${name}-${s.id}.png`); if (!fs.existsSync(f)) continue;
    const img = "data:image/png;base64," + fs.readFileSync(f).toString("base64");
    const top = Math.round(H * F.top), iw = Math.round(Math.min(W * 0.86, (H - top - H * 0.035) * W / H));
    await p.setContent(`<!doctype html><html><head><style>${font("Fredoka", 600)}${font("Nunito", 700)}
      body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:radial-gradient(130% 80% at 50% 0%,#1c7868,#143f38 55%,#0d2925)}
      .cap{height:${top}px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${Math.round(F.sub * 0.5)}px;padding:0 ${Math.round(W * 0.07)}px;box-sizing:border-box;text-align:center}
      h1{margin:0;text-wrap:balance;font:600 ${F.cap}px/1.12 Fredoka,sans-serif;color:#fdfbf2;letter-spacing:-0.01em}h1 b{color:#f2c230;font-weight:600}
      p{margin:0;text-wrap:balance;font:700 ${F.sub}px/1.3 Nunito,sans-serif;color:rgba(253,251,242,.78)}
      img{display:block;margin:0 auto;width:${iw}px;border-radius:${F.r}px;box-shadow:0 0 0 1px rgba(255,255,255,.14),0 24px 70px rgba(0,0,0,.45)}</style></head>
      <body><div class="cap"><h1>${s.caption}</h1><p>${s.sub}</p></div><img src="${img}"></body></html>`);
    await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(200);
    await p.screenshot({ path: path.join(out, `${name}-${s.id}.png`) });
  }
  await ctx.close();
}

(async () => {
  const which = process.argv[2] ? [process.argv[2]] : Object.keys(DEVICES);
  srv = await server.start(); const b = await chromium.launch();
  for (const n of which) { await capture(b, n); await caption(b, n); }
  await b.close(); srv.close(); console.log("saved to", out);
})();
