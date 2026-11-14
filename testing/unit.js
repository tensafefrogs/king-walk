// Checks the game's rules one at a time, by calling its functions in a browser page: the rating, damaged saves,
// save codes, rank streak puzzles, awards, translations, and what the app's widget is sent.
// usage: node testing/unit.js        (testing/smoke.js plays whole puzzles; this checks the pieces)
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), vm = require("vm");
const server = require("./server");
let bad = 0, good = 0;
const check = (ok, what, detail) => { if (ok) good++; else { bad++; console.log("FAIL", what, detail === undefined ? "" : JSON.stringify(detail)); } };

// translations: every key the game uses is in every language, with the same {placeholders} (plain Node)
function translations() {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const ctx = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "lang.js"), "utf8"), ctx);
  const langs = ctx.window.KW_STRINGS || {};
  const keys = new Set([...html.matchAll(/\bT\("((?:[^"\\]|\\.)+)"/g)].map(m => JSON.parse('"' + m[1] + '"')));
  const holes = k => (k.match(/\{\w+\}/g) || []).sort().join();
  for (const [lang, dict] of Object.entries(langs)) {
    const missing = [...keys].filter(k => !(k in dict));
    check(!missing.length, `${lang}: every T() key translated`, missing.slice(0, 8));
    const broken = Object.entries(dict).filter(([k, v]) => holes(k) !== holes(v)).map(([k]) => k);
    check(!broken.length, `${lang}: placeholders kept`, broken.slice(0, 8));
  }
  return Object.keys(langs);
}

(async () => {
  const langs = translations();
  const srv = await server.start(), b = await chromium.launch();
  const page = async (q = "", init) => {
    const ctx = await b.newContext(), p = await ctx.newPage(), errs = [];
    p.on("pageerror", e => errs.push(e.message));
    await p.route(/zgo\.at|goatcounter/, r => r.abort());
    if (init) await p.addInitScript(init);
    await p.goto(srv.url + q);
    await p.waitForFunction(() => typeof locked !== "undefined" && !locked && cur, null, { timeout: 15000 });
    return { p, ctx, errs };
  };
  const { p, ctx, errs } = await page();

  // the rating: Elo, faster for the first puzzles, a clean solve always gains, a miss against an equal puzzle loses
  const r = await p.evaluate(() => ({
    even: [ratingChange(1000, 1000, 1, 0), ratingChange(1000, 1000, 1, 15), ratingChange(1000, 1000, 1, 50)],
    miss: ratingChange(1000, 1000, 0, 50), hint: ratingChange(1000, 1000, 0.5, 50), easyWin: ratingChange(2000, 600, 1, 50),
    hardWin: ratingChange(600, 1400, 1, 50), easyMiss: ratingChange(1400, 600, 0, 50) }));
  check(r.even.join() === "24,18,12", "K is 48, then 36, then 24", r.even);
  check(r.miss === -12 && r.hint === 0, "an even miss loses 12, an even hint solve is level", r);
  check(r.easyWin === 1, "a far easier clean solve still gains 1", r.easyWin);
  check(r.hardWin > 20 && r.easyMiss < -20, "a hard win gains a lot, an easy miss costs a lot", r);

  // damaged saves never break the game: cleanState gives a valid state or null
  const fuzz = await p.evaluate(() => {
    const cases = [null, 1, "x", {}, { players: [] }, { players: [null, { rating: "abc" }] }, { players: [{ rating: 1e9, hist: ["a", 5, 99999], last: [3, 1], review: [{ b: 7 }], runs: { p: 99, x: 3 }, now: { b: 450, i: -1 } }] },
      { players: [{ rating: 900, seen: { 400: "x".repeat(5000) }, mode: "silly", awards: 3 }], awards: ["first_solve", 5, "x".repeat(99)] }];
    return cases.map(c => { try { const s = cleanState(c); return s === null ? "null" : { r: s.players[0].rating, h: s.players[0].hist, runs: s.players[0].runs, now: s.players[0].now, mode: s.players[0].mode, seen: Object.keys(s.players[0].seen).length, awards: s.awards }; } catch (e) { return "threw " + e.message; } });
  });
  check(fuzz.slice(0, 6).every(x => x === "null"), "nonsense saves are rejected", fuzz.slice(0, 6));
  check(fuzz[6].r === 4000 && fuzz[6].h.join() === "300,4000" && fuzz[6].runs.p === 15 && !("x" in fuzz[6].runs) && fuzz[6].now === undefined, "out-of-range values are clamped or dropped", fuzz[6]);
  check(fuzz[7].mode === "normal" && fuzz[7].seen === 0 && fuzz[7].awards.join() === "first_solve", "bad mode, oversized seen list and junk awards are cleaned", fuzz[7]);

  // a save code round trip gives the same progress, and loading one ends a rank streak
  const code = await p.evaluate(async () => {
    me().rating = 1234; me().runs.n = 7; save();
    $("copyCode").click(); await new Promise(r => setTimeout(r, 50));
    const c = $("saveCode").value; startRun(2); await new Promise(r => setTimeout(r, 50));
    const inRun = !!RUN; me().rating = 600; $("saveCode").value = c; $("loadCode").click(); $("loadCode").click();
    await new Promise(r => setTimeout(r, 100));
    return { inRun, after: !!RUN, rating: me().rating, runs: me().runs.n };
  });
  check(code.inRun && !code.after && code.rating === 1234 && code.runs === 7, "save code round trip, and it ends a streak", code);

  // rank streak puzzles: within the rank, climbing from its bottom to its top, never repeated
  const climb = await p.evaluate(async () => {
    const out = [];
    for (const rank of [1, 5]) {
      RUN = { rank, step: 0, used: new Set(), over: false }; const rs = [];
      for (let i = 0; i < STREAK_LEN; i++) { RUN.step = i; rs.push((await pickRunPuzzle()).pz.r); }
      out.push({ rank, rs, ids: RUN.used.size });
    }
    RUN = null; return out;
  });
  for (const c of climb) {
    const [lo, hi] = [[0, 0], [700, 999], [], [], [], [1900, 2300]][c.rank];
    check(c.rs.every(x => x >= lo && x <= hi), `rank ${c.rank} streak stays in ${lo}-${hi}`, c.rs);
    check(c.rs[0] < lo + 60 && c.rs[14] > hi - 120 && c.ids === 15, `rank ${c.rank} streak climbs, no repeats`, c);
  }

  // awards: thresholds, and nothing is celebrated twice
  const aw = await p.evaluate(() => {
    const p = newPlayer(1350); p.peak = 1350; p.solved = 50; p.best = 10; p.runs = { p: 15, n: 3 };
    return { earned: earnedAwards(p, { clean: true, r: 1700, before: 1350 }).sort(), none: earnedAwards(newPlayer(600)) };
  });
  check(aw.earned.join() === ["clear_pawn", "first_solve", "giant_slayer", "rank_bishop", "rank_knight", "rank_rook", "solved_50", "streak_10", "streak_5"].join(), "award thresholds", aw.earned);
  check(aw.none.length === 0, "a new player has no awards", aw.none);
  const twice = await p.evaluate(async () => {
    S.awards = []; const p = me(); p.solved = 1; const shown = [];
    const real = celebrate; window.celebrate = ids => shown.push(...ids);
    checkAwards(p); checkAwards(p); await new Promise(r => setTimeout(r, 1200));
    window.celebrate = real; return shown;
  });
  check(twice.filter(id => id === "first_solve").length === 1, "an award is celebrated once", twice);
  await ctx.close();
  // an old save (no awards list) starts with what it has earned: no flood of celebrations
  const old = await page("", () => { if (!sessionStorage.k) { sessionStorage.k = 1; localStorage.setItem("chess-climb-v1", JSON.stringify({ v: 2, updatedAt: 1, cur: 0, players: [{ rating: 1500, peak: 1500, hist: [1500], solved: 300, best: 12 }] })); } });
  await old.p.waitForTimeout(1500);
  const o = await old.p.evaluate(() => ({ awards: S.awards.length, shown: !!document.querySelector(".cele") }));
  check(o.awards >= 8 && !o.shown, "an old save gets its awards quietly", o);
  await old.ctx.close();

  // every language loads, and the widget gets the rank's piece letter (its bar keys on it) with the name translated
  for (const lang of langs) {
    const w = await page("?lang=" + lang, () => { window.sent = []; window.webkit = { messageHandlers: { kingwalk: { postMessage: m => window.sent.push(m) } } }; window.kingWalkApp = { widget: true }; });
    await w.p.waitForTimeout(1800);
    const x = await w.p.evaluate(() => ({ lang: document.documentElement.lang, widget: (window.sent.find(m => m.op === "widget") || {}).data, title: $("hintLabel").textContent, dict: (window.KW_STRINGS || {})[document.documentElement.lang] }));
    check(x.lang === lang && x.widget && x.widget.piece === "p" && x.widget.rankLine && !w.errs.length, `${lang}: loads, widget gets the piece letter`, { x: x.lang, piece: x.widget && x.widget.piece, errs: w.errs });
    if (lang !== "en") check(x.title === (x.dict || {}).Hint, `${lang}: the Hint button uses the translation`, x.title);
    await w.ctx.close();
  }
  check(!errs.length, "no page errors", errs);
  await b.close(); srv.close();
  console.log(`${good} passed, ${bad} failed`);
  process.exit(bad ? 1 : 0);
})();
