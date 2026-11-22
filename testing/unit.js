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
  const ctx = { window: {} }, dir = path.join(__dirname, "..", "lang");
  for (const f of fs.readdirSync(dir)) vm.runInNewContext(fs.readFileSync(path.join(dir, f), "utf8"), ctx);
  const langs = ctx.window.KW_STRINGS || {};
  const keys = new Set([...html.matchAll(/\bT\("((?:[^"\\]|\\.)+)"/g)].map(m => JSON.parse('"' + m[1] + '"')));
  const holes = k => (k.match(/\{\w+\}/g) || []).sort().join();
  const OVERRIDES = ["pt-PT", "es-ES"];          /* regional tables that only replace some of their language's strings */
  for (const [lang, dict] of Object.entries(langs)) {
    const missing = OVERRIDES.includes(lang) ? Object.keys(dict).filter(k => !(k in langs[lang.slice(0, 2)])) : [...keys].filter(k => !(k in dict));
    check(!missing.length, OVERRIDES.includes(lang) ? `${lang}: replaces only strings ${lang.slice(0, 2)} has` : `${lang}: every T() key translated`, missing.slice(0, 8));
    const broken = Object.entries(dict).filter(([k, v]) => holes(k) !== holes(v)).map(([k]) => k);
    check(!broken.length, `${lang}: placeholders kept`, broken.slice(0, 8));
  }
  // the loader's list in index.html and the files in lang/ agree
  const listed = JSON.parse(html.match(/var LANGS = (\[[^\]]+\])/)[1]);
  const variants = Object.keys(langs).filter(t => t.includes("-"));
  check(listed.filter(l => l !== "en" && !langs[l]).length === 0 && Object.keys(langs).every(t => listed.includes(t) || variants.includes(t)),
    "every listed language has a table in lang/, and every table is listed", { missing: listed.filter(l => l !== "en" && !langs[l]), extra: Object.keys(langs).filter(t => !listed.includes(t) && !variants.includes(t)) });
  // the Play card on the support, privacy and terms pages: cta.js has every language, and each page has the card
  const cta = fs.readFileSync(path.join(__dirname, "..", "cta.js"), "utf8"), C = JSON.parse(cta.match(/var C = (\{.*?\});/)[1]);
  const LANGS = JSON.parse(html.match(/var LANGS = (\[[^\]]+\])/)[1]);
  const lacking = [...LANGS.filter(t => t !== "en"), "pt-PT", "es-ES", "zh-Hant"].filter(t => !(C[t] && C[t].every(Boolean)));
  check(!lacking.length, "cta.js has the Play card in every language (python3 scripts/cta.py)", lacking);
  for (const f of ["support.html", "privacy.html", "terms.html"]) { const pg = fs.readFileSync(path.join(__dirname, "..", f), "utf8");
    check(/<a class="play" id="play" href="\.\/">/.test(pg) && /<script src="cta\.js">/.test(pg), f + " starts with the Play card"); }
  return Object.keys(langs);
}

(async () => {
  const langs = translations();
  const srv = await server.start(), b = await chromium.launch();
  const page = async (q = "", init, opts) => {
    const ctx = await b.newContext(opts), p = await ctx.newPage(), errs = [];
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

  // placement: players of known strength (solving by the Elo odds) are placed near it, within 10 puzzles
  const pl = await p.evaluate(() => {
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const out = {};
    for (const S of [450, 800, 1200, 1600, 2000, 2300]) {
      const errs = [], ks = [];
      for (let t = 0; t < 300; t++) {
        let q = newPlace();
        while (!q.done) { const pr = clamp(q.r + (rnd() - 0.5) * 50, 400, 2499), solve = rnd() < 1 / (1 + Math.pow(10, (pr - S) / 400)); q = placeStep(q, solve ? 1 : 0); }
        errs.push(Math.abs(q.r - S)); ks.push(q.k);
      }
      errs.sort((a, b) => a - b);
      out[S] = { median: errs[150], p90: errs[270], maxK: Math.max(...ks), avgK: ks.reduce((a, b) => a + b) / ks.length };
    }
    const hint = placeStep(newPlace(), 0.5);
    return { out, hint: [hint.r, hint.k], first: placeStep(newPlace(), 1).r, miss: placeStep(newPlace(), 0).r };
  });
  check(Object.values(pl.out).every(o => o.maxK <= 10), "placement ends within 10 puzzles", pl.out);
  check(Object.values(pl.out).every(o => o.median <= 250), "placement lands near the player's strength (median within 250)", pl.out);
  check(pl.first === 800 && pl.miss === 400 && pl.hint.join() === "600,1", "placement steps 200 up or down, a hint stays", pl);
  const pc = await p.evaluate(() => {
    const a = cleanState({ players: [{ rating: 600, n: 0 }] }).players[0], b = cleanState({ players: [{ rating: 1100, n: 40 }] }).players[0];
    const c = cleanState({ players: [{ rating: 600, n: 3, place: { r: 9999, step: 7, dir: 5, turns: -2, k: 99 } }] }).players[0];
    return { fresh: !!a.place, old: !!b.place, damaged: c.place, newcomer: !!newPlayer(600).place };
  });
  check(pc.fresh && !pc.old && pc.newcomer, "a new or never-played save places; one that played before is already placed", pc);
  check(pc.damaged && pc.damaged.r === 2400 && pc.damaged.step === 50 && pc.damaged.dir === 1 && pc.damaged.k === 10, "a damaged placement is cleaned", pc.damaged);
  // the last placement puzzle: the level becomes the rating, passed ranks are earned quietly, the number shows again
  const pf = await p.evaluate(async () => {
    const q = me(); S.awards = []; q.place = { r: 1300, step: 50, dir: 1, turns: 2, k: 9 }; renderPanel();
    const shown = $("rating").textContent, rankLine = $("rankName").textContent;
    failed = false; hintLevel = 0; finish(true);
    await new Promise(r => setTimeout(r, 1500));
    const card = document.querySelector(".cele .cele-title");
    return { shown, rankLine, place: q.place, rating: q.rating, hist: q.hist, awards: S.awards.slice(), text: $("rating").textContent, card: card && card.textContent, mode: $("modeNote").textContent };
  });
  check(pf.shown === "?" && pf.rankLine === "Finding your level", "during placement the rating and rank are hidden", pf);
  check(!pf.place && pf.rating === 1350 && pf.hist.join() === "1350", "placement ends: the level found is the rating", pf);
  check(["rank_knight", "rank_bishop", "rank_rook"].every(id => pf.awards.includes(id)) && !pf.awards.includes("rank_queen"), "the ranks passed are earned quietly", pf.awards);
  check(pf.card === "You placed at Rook", "one card says where the player placed", pf.card);
  check(/about 6 in 10/.test(pf.mode) && /fair in any mode/.test(pf.mode), "the difficulty says what it means", pf.mode);
  await p.evaluate(() => { document.querySelectorAll(".cele").forEach(e => e.remove()); });

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
    const nap = ms => new Promise(r => setTimeout(r, ms));
    me().rating = 1234; me().runs.n = 7; save();
    const c = saveCode(); startRun(2); await nap(50);
    const inRun = !!RUN; me().rating = 600;
    $("pasteCode").click(); await nap(80);
    const d = document.querySelector(".dlg"), ta = d.querySelector("textarea"), go = d.querySelector(".go");
    const emptyOff = go.disabled;
    ta.value = "not a code"; ta.dispatchEvent(new Event("input")); go.click(); await nap(50);
    const err = !!d.querySelector(".dlg-err").textContent && !!document.querySelector(".dlg");
    ta.value = c; ta.dispatchEvent(new Event("input")); go.click(); await nap(400);
    return { inRun, after: !!RUN, rating: me().rating, runs: me().runs.n, emptyOff, err, closed: !document.querySelector(".dlg") };
  });
  check(code.emptyOff && code.err && code.closed, "the paste dialog: off while empty, a bad code shows an error, a good one closes it", code);
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

  // the daily puzzle: the same puzzle for a date every time, harder through the week, at most 4 moves
  const dp = await p.evaluate(async () => {
    const out = [];
    for (let n = 1; n <= 21; n++) { const a = await dailyPuzzle(n), b = await dailyPuzzle(n); out.push({ n, id: a.pz.id, same: a.pz.id === b.pz.id, r: a.pz.r, len: a.pz.moves.length, range: DAILY_RANGE[dayDate(n).getDay()] }); }
    return out;
  });
  check(dp.every(d => d.same), "a date always gives the same daily puzzle", dp.filter(d => !d.same));
  check(dp.every(d => d.r >= d.range[0] && d.r <= d.range[1] && d.len <= 8), "daily puzzles fit their weekday's range and length", dp.filter(d => !(d.r >= d.range[0] && d.r <= d.range[1] && d.len <= 8)));
  check(new Set(dp.map(d => d.id)).size === dp.length, "three weeks of daily puzzles, no repeats", dp.map(d => d.id));
  check(await p.evaluate(() => dayNumber(new Date(2026, 10, 13, 23, 59)) === 1 && dayNumber(new Date(2026, 10, 14, 0, 1)) === 2 && dayKey(3) === "2026-11-15"), "daily numbers change at local midnight");
  // the daily streak: yesterday's solve grows it, a gap restarts it, showing the answer ends it, a skipped day lapses it
  const ds = await p.evaluate(() => {
    const D = newDaily(), log = [];
    recordDaily(D, 10, "g", 30, true); recordDaily(D, 11, "gy", 40, true); recordDaily(D, 12, "rg", 50, true); log.push(D.streak);
    recordDaily(D, 14, "g", 20, true); log.push(D.streak, D.best);
    recordDaily(D, 15, "xx", 60, false); log.push(D.streak, D.best, D.last);
    const p = newPlayer(600), n = dayNumber(); p.daily.streak = 4; p.daily.last = n - 1; const live = dailyStreak(p); p.daily.last = n - 2;
    return { log, live, lapsed: dailyStreak(p) };
  });
  check(ds.log.join() === "3,1,3,0,3,14" && ds.live === 4 && ds.lapsed === 0, "daily streak rules", ds);
  // streak freezes: one per 7 days in a row (at most 2), each covers one skipped day; more skipped days than freezes ends it
  const fz = await p.evaluate(() => {
    const D = newDaily(); let earned = [];
    for (let n = 1; n <= 14; n++) earned.push(recordDaily(D, n, "g", 10, true));
    const atFourteen = { streak: D.streak, freezes: D.freezes, earnedOn: earned.map((e, i) => e ? i + 1 : 0).filter(Boolean) };
    for (let n = 15; n <= 21; n++) recordDaily(D, n, "g", 10, true);          /* a third week: still 2 held */
    const held = D.freezes, pl = newPlayer(600), today = 100;          /* a day well after Daily #1, whatever the date */
    Object.assign(pl.daily, { streak: 9, best: 9, last: today - 3, freezes: 2, days: {} });
    const used = applyFreezes(pl, today), after = { streak: dailyStreak(pl, today), freezes: pl.daily.freezes, frozen: [today - 2, today - 1].every(k => pl.daily.days[k] && pl.daily.days[k].fz) };
    recordDaily(pl.daily, today, "g", 5, true);
    const pl2 = newPlayer(600); Object.assign(pl2.daily, { streak: 9, best: 9, last: today - 4, freezes: 2, days: {} });
    return { atFourteen, held, used, after, grew: pl.daily.streak, tooLong: applyFreezes(pl2, today), lapsed: dailyStreak(pl2, today), kept: cleanDaily({ freezes: 9, days: { 3: { fz: true } } }) };
  });
  check(fz.atFourteen.streak === 14 && fz.atFourteen.earnedOn.join() === "7,14" && fz.held === 2, "a freeze every 7 days, at most 2", fz.atFourteen);
  check(fz.used === 2 && fz.after.streak === 9 && fz.after.freezes === 0 && fz.after.frozen && fz.grew === 10, "freezes cover skipped days and the streak carries on", fz);
  check(fz.tooLong === 0 && fz.lapsed === 0, "more skipped days than freezes ends the streak", fz);
  check(fz.kept.freezes === 2 && fz.kept.days[3].fz === true, "saved freezes are kept and capped", fz.kept);
  // the first puzzle's hint shows once, and goes after the first move
  const tip = await p.evaluate(async () => { S.tip = false; const pl = me(), n0 = pl.n; pl.n = 0; showTip(); const shown = !$("tip").hidden; hideTip();
    await new Promise(r => setTimeout(r, 300)); const gone = $("tip").hidden && S.tip; showTip(); pl.n = n0; return { shown, gone, again: !$("tip").hidden }; });          // it leaves with a short exit
  check(tip.shown && tip.gone && !tip.again, "the first-puzzle hint shows once", tip);
  // a piece's landing animation (class "pop") isn't mistaken for a modal's box: no border, no background
  const pop = await p.evaluate(() => { const el = document.querySelector(".piece"); if (!el) return "no piece"; el.classList.add("pop");
    const cs = getComputedStyle(el), r = { border: cs.borderTopWidth, bg: cs.backgroundColor }; el.classList.remove("pop"); return r; });
  check(pop.border === "0px" && pop.bg === "rgba(0, 0, 0, 0)", "a landing piece looks like a piece", pop);
  // a daily achievement's card shares the day's result, with the achievement on the streak line
  const dshare = await p.evaluate(() => { const n = dayNumber(), D = me().daily; Object.assign(D, { streak: 2, best: 2, last: n - 1 }); recordDaily(D, n, "gyg", 83, true); return dailyShareText(n, "Hat Trick"); });
  check(/Daily #\d+/.test(dshare) && dshare.includes("\ud83d\udfe9\ud83d\udca1\ud83d\udfe9") && dshare.includes("\ud83d\udd25 3  \ud83c\udfc6 Hat Trick"), "a daily achievement shares the daily result", dshare);
  // the Daily button: a coral dot while today's waits, a green check once it's done (also while in the daily)
  const badge = await p.evaluate(() => { const D = me().daily, n = dayNumber(), keep = JSON.stringify(D); delete D.days[n]; if (D.last === n) D.last = n - 1; DAILY = null; renderDaily();
    const dot = $("dailyDot"), waiting = !dot.hidden && !dot.classList.contains("done");
    recordDaily(D, n, "g", 9, true); renderDaily(); const done = !dot.hidden && dot.classList.contains("done");
    Object.assign(D, JSON.parse(keep)); renderDaily(); return { waiting, done }; });
  check(badge.waiting && badge.done, "the Daily button shows a dot while waiting and a check when done", badge);
  // two devices' saves: more progress wins, an empty save never does, a newer Start over does
  const sv = await p.evaluate(() => {
    const mk = (n, days, since, extra) => Object.assign({ v: 2, updatedAt: Date.now(), players: [Object.assign(newPlayer(600), { n, since, daily: Object.assign(newDaily(), { days: Object.fromEntries(Array.from({ length: days }, (_, i) => [i + 1, { m: "g", t: 5, ok: true }])) }) })] }, extra);
    const old = mk(50, 3, 1000), stale = mk(40, 3, 1000, { updatedAt: Date.now() + 99999 }), fresh = mk(0, 0, 5000), freshPlayed = mk(2, 0, 5000), reset = mk(0, 0, 9000, { reset: true });
    return { more: betterSave(old, stale), staleLoses: !betterSave(stale, old), emptyLoses: !betterSave(fresh, old), smallNewInstall: !betterSave(freshPlayed, old), resetWins: betterSave(reset, old), oldVsReset: !betterSave(old, reset) };
  });
  check(Object.values(sv).every(Boolean), "which device's save to keep", sv);
  const cl = await p.evaluate(() => { const before = me().n; const other = JSON.parse(JSON.stringify(S)); other.players[0].n = before + 40; other.players[0].rating = 1777;
    kingWalkCloud(JSON.stringify(other)); const took = me().rating; const worse = JSON.parse(JSON.stringify(S)); worse.players[0].n = 1; worse.players[0].rating = 401; kingWalkCloud(JSON.stringify(worse)); kingWalkCloud("not json");
    return { took, kept: me().rating }; });
  check(cl.took === 1777 && cl.kept === 1777, "the app's iCloud copy is taken only when it has more progress", cl);
  // a finished daily from yesterday doesn't block today's; no freeze is spent on the day being played
  const st = await p.evaluate(() => { const n = dayNumber(); DAILY = { n: n - 1, marks: [], spent: 0, t0: 0 }; done = true; dropStaleDaily(); const dropped = DAILY === null;
    const pl = me(); Object.assign(pl.daily, { streak: 4, last: n - 2, freezes: 1, days: {} }); DAILY = { n: n - 1, marks: [], spent: 0, t0: 0 }; done = false; checkFreezes(); const kept = pl.daily.freezes;
    DAILY = null; done = true; return { dropped, kept }; });
  check(st.dropped && st.kept === 1, "yesterday's finished daily steps aside; no freeze for the day being played", st);
  // "Copied" replaces a button's label, not its icon
  const cp = await p.evaluate(async () => { const b = $("dailyBtn"); const hadIcon = !!b.querySelector("svg"); Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
    try { Object.defineProperty(navigator, "clipboard", { value: { writeText: () => Promise.resolve() }, configurable: true }); } catch (e) {}
    shareProgress(b, null); await new Promise(r => setTimeout(r, 50)); return { icon: hadIcon && !!b.querySelector("svg") && !!$("dailyDot"), span: true }; });
  check(cp.icon && cp.span, "Copied keeps the Daily button's icon and dot", cp);
  // the daily done: the Daily button opens a card saying so, with Share on it, not a share sheet
  const dc = await p.evaluate(async () => { const n = dayNumber(); recordDaily(me().daily, n, "gg", 33, true); DAILY = null; let shared = 0;
    const real = window.shareProgress; window.shareProgress = () => { shared++; };
    $("dailyBtn").click(); for (let i = 0; i < 40 && !document.querySelector(".cele.quiet"); i++) await new Promise(r => setTimeout(r, 100));
    const card = document.querySelector(".cele.quiet"); const board = { review: DAILY && DAILY.mode, done, buttons: !$("doneBtns").hidden && !$("againBtn").hidden };
    const r = { card: !!card, title: card && card.querySelector(".cele-title").textContent, sharedOnTap: shared };
    card.querySelector(".sh").click(); r.sharedFromCard = shared; card.querySelector(".go").click(); await new Promise(r2 => setTimeout(r2, 400));
    r.closed = !document.querySelector(".cele"); r.board = board; window.shareProgress = real;
    /* Try again: practice, and the day's result stays */
    const before = JSON.stringify(me().daily.days[n]); $("againBtn").click(); await new Promise(r2 => setTimeout(r2, 1500));
    r.practice = DAILY && DAILY.mode; while (!done) { if (!locked) { const m = cur.pz.moves[idx]; commit(m.slice(0, 2), "a1", ""); showAnswer(); } await new Promise(r2 => setTimeout(r2, 400)); }
    r.kept = JSON.stringify(me().daily.days[n]) === before; DAILY = null; return r; });
  check(dc.card && dc.title === "Solved!" && dc.sharedOnTap === 0 && dc.sharedFromCard === 1 && dc.closed, "a done daily shows its card, Share is on the card", dc);
  check(dc.board.review === "review" && dc.board.done && dc.board.buttons && dc.practice === "practice" && dc.kept, "the done daily's board, and Try again as practice that leaves the result alone", dc);
  // the mode switch: Daily on while the daily is played (coral frame, the daily's card), Puzzles back
  const ms = await p.evaluate(async () => { const n = dayNumber(); delete me().daily.days[n]; DAILY = null; done = true; renderDaily();
    const before = { puzzles: $("puzzlesBtn").getAttribute("aria-pressed"), mode: document.documentElement.classList.contains("daily") };
    $("dailyBtn").click(); await new Promise(r => setTimeout(r, 300));
    const during = { daily: $("dailyBtn").getAttribute("aria-pressed"), mode: document.documentElement.classList.contains("daily"), card: getComputedStyle($("dailyInfo")).display !== "none", rate: getComputedStyle($("rate")).display };
    $("puzzlesBtn").click(); await new Promise(r => setTimeout(r, 300));
    return { before, during, after: document.documentElement.classList.contains("daily") }; });
  check(ms.before.puzzles === "true" && !ms.before.mode && ms.during.daily === "true" && ms.during.mode && ms.during.card && ms.during.rate === "none" && !ms.after, "the Puzzles | Daily switch", ms);
  // the daily pauses: hidden, its clock stops and it's saved; back, it waits under the Continue cover; left and opened
  // again, it picks up at the same move with its time, the cover saying so
  const pz = await p.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms)), n = dayNumber(), q = me();
    delete q.daily.days[n]; delete q.daily.now; DAILY = null; done = true; renderDaily();
    startDaily(); for (let i = 0; i < 60 && (locked || !DAILY || idx < 1); i++) await wait(100);
    const hide = h => { Object.defineProperty(document, "hidden", { configurable: true, get: () => h }); document.dispatchEvent(new Event("visibilitychange")); };
    DAILY.spent = 30; DAILY.t0 = Date.now() - 5000;          /* 35 s played so far */
    hide(true); const away = { t0: DAILY.t0, saved: q.daily.now && q.daily.now.t, k: q.daily.now && q.daily.now.k };
    await wait(1200); hide(false);
    const back = { cover: !$("dailyCover").hidden, locked, title: $("dcTitle").textContent, time: $("dcTime").textContent, sub: $("dcSub").textContent, clock: DAILY.t0 };
    $("dcGo").click(); const going = { cover: !$("dailyCover").hidden, locked, clock: DAILY.t0 > 0 };
    /* the player's first move, then the reply: their turn again, two moves on */
    tryMove(cur.pz.moves[1].slice(0, 2), cur.pz.moves[1].slice(2, 4)); for (let i = 0; i < 40 && locked; i++) await wait(100);
    const kAfter = idx, fen = game.fen(), saved = { ...q.daily.now };
    leaveDaily(); await wait(400); startDaily(); for (let i = 0; i < 60 && !(DAILY && DAILY.paused); i++) await wait(100);
    const again = { cover: !$("dailyCover").hidden, sub: $("dcSub").textContent, idx, fen: game.fen(), spent: DAILY.spent, marks: DAILY.marks.join("") };
    $("dcGo").click(); leaveDaily(); delete q.daily.now;
    return { away, back, going, kAfter, fen, saved, again, moves: cur && cur.pz.moves.length };
  });
  check(pz.away.t0 === 0 && pz.away.saved >= 35 && pz.away.k === 1, "the daily, hidden: its clock stops and it's saved with its place", pz.away);
  check(pz.back.cover && pz.back.locked && pz.back.title === "Paused" && /0:3[5-6]/.test(pz.back.time) && !pz.back.sub && pz.back.clock === 0, "back to the game: the daily waits under Paused, the clock stopped", pz.back);
  check(!pz.going.cover && !pz.going.locked && pz.going.clock, "Continue: the cover goes, the clock runs", pz.going);
  check(pz.again.cover && pz.again.sub === "Pick up where you left off." && pz.again.idx === pz.kAfter && pz.again.fen === pz.fen && pz.again.spent >= 35 && pz.saved.k === pz.kAfter,
    "the daily, left and opened again: the same position and time, under the cover", { kAfter: pz.kAfter, saved: pz.saved, again: pz.again });
  // the daily's clock: in the status bar while it's played, the time so far; a tap pauses it; gone once it's done
  const tm = await p.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms)), n = dayNumber(), q = me();
    delete q.daily.days[n]; delete q.daily.now; DAILY = null; done = true; renderDaily();
    startDaily(); for (let i = 0; i < 60 && (locked || !DAILY || idx < 1); i++) await wait(100);
    DAILY.spent = 65; DAILY.t0 = Date.now(); renderTimer();
    const shown = { hidden: $("dTimer").hidden, text: $("dTimer").textContent };
    $("dTimer").click(); const tapped = { cover: !$("dailyCover").hidden, paused: !!DAILY.paused, cls: $("dTimer").classList.contains("paused") };
    $("dcGo").click(); leaveDaily(); await wait(300); renderTimer(); const after = $("dTimer").hidden; delete q.daily.now;
    return { shown, tapped, after };
  });
  check(!tm.shown.hidden && /1:0[56]/.test(tm.shown.text), "the daily's clock shows the time so far", tm.shown);
  check(tm.tapped.cover && tm.tapped.paused && tm.tapped.cls && tm.after, "a tap on the clock pauses the daily; it goes with the daily", tm);
  // marks: a worse one wins (first try < hint < one wrong try < more < shown), and the share has a square per move and no moves
  const mk = await p.evaluate(() => {
    const n = dayNumber(); DAILY = { n, mode: "play", marks: [], spent: 0, t0: 0 };
    dailyMark("g", 1); dailyMark("y", 3); dailyMark("r", 3); dailyMark("y", 3); dailyMark("g", 3);
    dailyMark("r", 5); dailyMark("r", 5); dailyMark("x", 7); const marks = DAILY.marks.join("");
    DAILY = null; const p = me(); recordDaily(p.daily, n, "gyrsx", 67, true); recordDaily(p.daily, n - 1, "g", 5, true);
    p.daily.streak = 2; p.daily.last = n;
    return { marks, share: dailyShareText(n) };
  });
  check(mk.marks === "grsx", "a worse daily mark wins, and a second wrong try on a move is its own mark", mk.marks);
  check(/^\u265f\ufe0f King Walk Daily #\d+ \u00b7 [A-Z][a-z]+day\n\u23f1 1:07  🟩💡🟨🟧🟥\n\ud83d\udd25 2/.test(mk.share), "the daily share: number and weekday (the weekday says how hard), time, a square per move (Duolingo's colours, a bulb for a hint), streak", mk.share);
  // damaged daily data is cleaned
  const cd = await p.evaluate(() => cleanDaily({ streak: -3, best: "x", last: 5, days: { 3: { m: "gzz", t: 5 }, 4: { m: "gy", t: 1e9, ok: 1 }, x: {} }, now: { n: 6, m: "<b>" } }));
  check(cd.streak === 0 && cd.best === 0 && !cd.days[3] && cd.days[4].t === 86400 && cd.days[4].ok === true && !cd.now, "damaged daily data is cleaned", cd);
  await ctx.close();

  // launch in the app with an iCloud copy that has more progress than this device's: the page starts from it
  const boot = await page("", () => {
    const mk = (n, r) => JSON.stringify({ v: 2, updatedAt: n, cur: 0, players: [{ rating: r, n, since: 1000, hist: [r] }] });
    if (!sessionStorage.k) { sessionStorage.k = 1; localStorage.setItem("chess-climb-v1", mk(5, 650)); }
    window.kingWalkCloudSave = mk(80, 1234);
  });
  const bt = await boot.p.evaluate(() => ({ rating: me().rating, stored: JSON.parse(localStorage.getItem("chess-climb-v1")).players[0].rating }));
  check(bt.rating === 1234 && bt.stored === 1234, "at launch, the iCloud copy with more progress wins", bt);
  await boot.ctx.close();

  // the app: kingWalkOpen("daily") starts the daily puzzle, and the reminders cover the next week with no repeats
  const ap = await page("", () => { window.sent = []; window.webkit = { messageHandlers: { kingwalk: { postMessage: m => window.sent.push(m) } } }; window.kingWalkApp = { widget: true, reminders: true }; });
  const app = await ap.p.evaluate(async () => {
    const ready = window.sent.some(m => m.op === "ready");
    S.remind = 23; sendDaily(); const rem = window.sent.filter(m => m.op === "reminders").pop();
    kingWalkOpen("daily"); await new Promise(r => setTimeout(r, 1500));
    return { ready, hour: rem.hour, dates: rem.items.map(i => i.date), titles: rem.items.map(i => i.title), daily: !!DAILY && cur && cur.daily, widget: (window.sent.filter(m => m.op === "widget").pop() || {}).data };
  });
  check(app.ready && app.daily === await ap.p.evaluate(() => dayNumber()), "the app's daily request starts today's puzzle", app.daily);
  check(app.hour === 23 && app.dates.length >= 6 && app.dates.length <= 7 && new Set(app.dates).size === app.dates.length && app.titles.every(t => /#\d+/.test(t)), "reminders: a week of days, each once", app);
  check(app.widget && "dailyStreak" in app.widget && app.widget.dailyTodo, "the widget gets the daily state", app.widget);
  await ap.ctx.close();
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
    const x = await w.p.evaluate(lang => ({ lang: document.documentElement.lang, widget: (window.sent.find(m => m.op === "widget") || {}).data, title: $("hintLabel").textContent,
      want: ((window.KW_STRINGS || {})[lang] || {}).Hint || ((window.KW_STRINGS || {})[lang.slice(0, 2)] || {}).Hint }), lang);
    check(x.lang === lang && x.widget && x.widget.piece === "p" && x.widget.rankLine && !w.errs.length, `${lang}: loads, widget gets the piece letter`, { x: x.lang, piece: x.widget && x.widget.piece, errs: w.errs });
    if (lang !== "en") check(x.title === x.want, `${lang}: the Hint button uses the translation`, x.title);
    await w.ctx.close();
  }
  // right to left: Arabic and Hebrew mirror the page but never the board (a1 stays bottom left for White, the file
  // letters read a to h); a sideways phone keeps the board on the right; other languages stay left to right
  for (const [lang, size] of [["ar", { width: 390, height: 844 }], ["he", { width: 844, height: 390 }], ["de", { width: 390, height: 844 }]]) {
    const w = await page("?lang=" + lang, null, { viewport: size });
    const x = await w.p.evaluate(() => {
      const sqs = [...document.querySelectorAll("#squares .sq")], first = sqs[0].getBoundingClientRect(), last = sqs[63].getBoundingClientRect();
      const board = $("board").getBoundingClientRect(), status = $("status").getBoundingClientRect();
      return { dir: document.documentElement.dir, orient, first: sqs[0].dataset.sq, topLeft: first.left < last.left && first.top < last.top,
        boardRight: board.left > status.left, rtlText: getComputedStyle($("status")).direction };
    });
    const rtl = lang !== "de";
    check(x.dir === (rtl ? "rtl" : "") && x.topLeft && x.first === (x.orient === "w" ? "a8" : "h1"), `${lang}: ${rtl ? "right to left, " : ""}the board isn't mirrored`, x);
    if (size.width > size.height) check(x.boardRight && x.rtlText === "rtl", `${lang}: sideways, the board stays on the right and the text runs right to left`, x);
    await w.ctx.close();
  }
  // only this player's tables are downloaded (lang/<tag>.js): none in English, one in German, two in Portugal
  for (const [locale, want] of [["en-US", []], ["de-DE", ["de"]], ["pt-PT", ["pt", "pt-PT"]], ["fil-PH", []]]) {
    const w = await page("", null, { locale });
    const got = await w.p.evaluate(() => performance.getEntriesByType("resource").map(e => (e.name.match(/\/lang\/([\w-]+)\.js/) || [])[1]).filter(Boolean).sort());
    check(got.join() === want.join(), `${locale}: loads only ${want.join(", ") || "no language table"}`, got);
    await w.ctx.close();
  }
  // the language pages the website build makes (scripts/langpages.py): kingwalk.app/de/ is the game in German with its
  // files one folder up, its title and description in German, and hreflang links; and the language picker
  {
    const site = path.join(__dirname, "out", "site"), repo = path.join(__dirname, "..");
    fs.rmSync(site, { recursive: true, force: true }); fs.mkdirSync(site, { recursive: true });
    for (const f of ["chess.js", "lang", "config.js", "sw.js", "manifest.webmanifest", "og.png", "p", "fonts", "icons", "privacy.html"]) fs.symlinkSync(path.join(repo, f), path.join(site, f));
    fs.copyFileSync(path.join(repo, "index.html"), path.join(site, "index.html"));
    fs.writeFileSync(path.join(site, "sitemap.xml"), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>https://example.org/</loc></url>\n</urlset>\n');
    require("child_process").execFileSync("python3", [path.join(repo, "scripts", "langpages.py"), site, "https://example.org/"]);
    const de = fs.readFileSync(path.join(site, "de", "index.html"), "utf8"), sm = fs.readFileSync(path.join(site, "sitemap.xml"), "utf8");
    check(/<html lang="de">/.test(de) && /<title>King Walk: Schachrätsel<\/title>/.test(de) && /hreflang="hi" href="https:\/\/example.org\/hi\/"/.test(de)
      && /<link rel="canonical" href="https:\/\/example.org\/de\/">/.test(de) && /url\(\.\.\/fonts\//.test(de) && /<use [^>]*href="#pc-/.test(de),
      "language page: German title, lang, canonical, hreflang, files one folder up, in-page links untouched");
    check(/<html lang="ar" dir="rtl">/.test(fs.readFileSync(path.join(site, "ar", "index.html"), "utf8")) && fs.existsSync(path.join(site, "pt-PT", "index.html")), "language page: Arabic right to left; regional pages made");
    check((sm.match(/<loc>/g) || []).length === 46 && /xhtml:link rel="alternate" hreflang="x-default"/.test(sm), "sitemap: every language page, with hreflang links", (sm.match(/<loc>/g) || []).length);
    const dectx = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(repo, "lang", "de.js"), "utf8"), dectx);
    const deHint = dectx.window.KW_STRINGS.de.Hint;
    const srv2 = await server.start(site), ctx2 = await b.newContext({ locale: "en-US" }), p2 = await ctx2.newPage(), bad = [], errs2 = [];
    p2.on("response", r => { if (r.status() >= 400) bad.push(r.status() + " " + r.url()); }); p2.on("pageerror", e => errs2.push(e.message));
    await p2.goto(srv2.url + "de/");
    await p2.waitForFunction(() => typeof cur !== "undefined" && cur && !locked, null, { timeout: 15000 }).catch(() => {});
    const x = await p2.evaluate(() => ({ lang: document.documentElement.lang, hint: $("hintLabel").textContent, pz: !!(cur && cur.pz), site: SITE }));
    check(x.lang === "de" && x.hint === deHint && x.pz && !bad.length && !errs2.length, "language page plays: German, a puzzle loaded, no missing files", { x, bad: bad.slice(0, 3), errs2 });
    // the picker: French is kept and the main page reloads in French; Same as device forgets it
    await p2.goto(srv2.url);
    await p2.waitForFunction(() => typeof cur !== "undefined" && cur && !locked, null, { timeout: 15000 });
    await Promise.all([p2.waitForNavigation(), p2.selectOption("#langSel", "fr")]);
    await p2.waitForFunction(() => typeof cur !== "undefined" && cur, null, { timeout: 15000 });
    const fr = await p2.evaluate(() => ({ lang: document.documentElement.lang, sel: $("langSel").value, kept: localStorage.getItem("kw-lang") }));
    await Promise.all([p2.waitForNavigation(), p2.selectOption("#langSel", "")]);
    await p2.waitForFunction(() => typeof cur !== "undefined" && cur, null, { timeout: 15000 });
    const dev = await p2.evaluate(() => ({ lang: document.documentElement.lang, kept: localStorage.getItem("kw-lang") }));
    check(fr.lang === "fr" && fr.sel === "fr" && fr.kept === "fr" && dev.lang === "en" && dev.kept === null, "language picker: French kept, then back to the device's", { fr, dev });
    await ctx2.close(); srv2.close();
  }
  // the streak saver (the app): with reminders on and a streak of 2+, a 9 pm note on a day not yet played (today, or
  // tomorrow once today's is done), none without a streak; at a streak of 3 with reminders off, the done card offers
  // one, once, and a tap turns it on at 6 pm
  {
    const w = await page("", () => { window.sent = []; window.webkit = { messageHandlers: { kingwalk: { postMessage: m => window.sent.push(m) } } }; window.kingWalkApp = { reminders: true, widget: true }; });
    const r = await w.p.evaluate(async () => {
      const sleep = ms => new Promise(r => setTimeout(r, ms)), p = me(), D = p.daily, n = dayNumber(), last = () => window.sent.filter(m => m.op === "reminders").pop();
      const lates = () => (last().items || []).filter(i => i.id === "late").map(i => i.date + "@" + i.hour);
      S.remind = 8; D.days = {}; D.streak = 0; D.last = 0;
      sendDaily(); const none = lates();
      recordDaily(D, n - 2, "g", 30, true); recordDaily(D, n - 1, "g", 30, true);
      sendDaily(); const today = lates(), hourNow = new Date().getHours();
      recordDaily(D, n, "g", 30, true); sendDaily(); const tomorrow = lates();
      S.remind = 20; sendDaily(); const evening = lates(); S.remind = 18; sendDaily(); const six = lates();
      S.remind = -1; try { localStorage.removeItem("kw-remind-offered"); } catch (e) {}
      showDailyDone(); await sleep(600);
      const btn = document.querySelector(".cele-app button"), offered = !!btn;
      if (btn) btn.click();
      const after = { remind: S.remind, text: (document.querySelector(".cele-app") || {}).textContent || "" };
      document.querySelector(".cele .go").click(); await sleep(500);
      showDailyDone(); await sleep(600); const again = !!document.querySelector(".cele-app button");
      return { none, today, hourNow, tomorrow, evening, six, dayToday: dayKey(n), dayTomorrow: dayKey(n + 1), offered, after, again };
    });
    check(!r.none.length && (r.hourNow >= 21 ? !r.today.length : r.today.join() === r.dayToday + "@21") && r.tomorrow.join() === r.dayTomorrow + "@21"
      && !r.evening.length && r.six.join() === r.dayTomorrow + "@21",
      "streak saver: a 9 pm note only with a streak and a reminder before 7 pm, today until it's played, then tomorrow", r);
    check(r.offered && r.after.remind === 18 && /18|6/.test(r.after.text) && !r.again, "the done card offers a reminder once at a streak of 3; a tap sets 6 pm", r);
    await w.ctx.close();
  }
  // inside a social app's browser (X here), a quiet line says progress stays there, with a link that opens Safari;
  // with progress it points to the save code; × hides it for good; plain Safari never sees it
  {
    const X = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Twitter for iPhone/11.20";
    const SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1";
    const look = async ua => { const w = await page("", null, { userAgent: ua, isMobile: true, hasTouch: true, viewport: { width: 390, height: 844 } });
      const r = await w.p.evaluate(() => { const b = document.querySelector(".appbar.inapp"); return b ? { text: b.textContent, href: b.querySelector("a").href } : null; }); return { w, r }; };
    const safari = await look(SAFARI); await safari.w.ctx.close();
    const x = await look(X);
    check(!safari.r && x.r && /inside X/.test(x.r.text) && /^x-safari-https:\/\/127\.0\.0\.1:\d+\/$/.test(x.r.href) && !/save code/.test(x.r.text),
      "in X's browser: a line with an Open in Safari link to this page; none in Safari", { safari: safari.r, x: x.r });
    await x.w.p.evaluate(() => { S.players[S.cur].n = 5; save(); });
    await x.w.p.reload(); await x.w.p.waitForFunction(() => typeof cur !== "undefined" && cur && !locked, null, { timeout: 15000 });
    const withProgress = await x.w.p.evaluate(() => (document.querySelector(".appbar.inapp") || {}).textContent || "");
    await x.w.p.click(".appbar.inapp .tip-x"); await x.w.p.waitForTimeout(400);
    await x.w.p.reload(); await x.w.p.waitForFunction(() => typeof cur !== "undefined" && cur && !locked, null, { timeout: 15000 });
    const afterClose = await x.w.p.evaluate(() => !!document.querySelector(".appbar.inapp"));
    check(/save code/.test(withProgress) && !afterClose, "with progress it points to the save code; × hides it for good", { withProgress, afterClose });
    await x.w.ctx.close();
  }
  // the daily widget's boards: seven days from today, each the position the player sees (today's matches the game's
  // board once the daily has started), whose turn, the goal and the last move
  {
    const w = await page("", () => { window.sent = []; window.webkit = { messageHandlers: { kingwalk: { postMessage: m => window.sent.push(m) } } }; window.kingWalkApp = { widget: true }; });
    await w.p.waitForFunction(() => window.sent.some(m => m.op === "widget" && m.data.dailyBoards), null, { timeout: 15000 }).catch(() => {});
    const r = await w.p.evaluate(async () => {
      const b = (window.sent.filter(m => m.op === "widget" && m.data.dailyBoards).pop() || { data: {} }).data.dailyBoards || [];
      startDaily(); await new Promise(r => setTimeout(r, 2500));
      return { count: b.length, first: b[0] && b[0].n, today: dayNumber(), days: b.map(x => x.n), shape: b.every(x => x.fen.split("/").length === 8 && /^[wb]$/.test(x.turn) && x.toPlay && x.goal && /^[a-h][1-8]$/.test(x.from) && /^[a-h][1-8]$/.test(x.to) && /^[a-h][1-8]$/.test(x.focus)),
        same: b[0] && game.fen().split(" ")[0] === b[0].fen && game.turn() === b[0].turn };
    });
    check(r.count === 7 && r.first === r.today && r.days.join() === [0, 1, 2, 3, 4, 5, 6].map(k => r.today + k).join() && r.shape && r.same,
      "the widget gets seven daily boards from today; today's is the board the daily shows", r);
    await w.ctx.close();
  }
  // the player's region picks the variant: Taiwan and Hong Kong get Traditional Chinese, Portugal and Angola Portugal's
  // Portuguese, Spain Spain's Spanish; Mexico and Brazil the base tables
  for (const [locale, want] of [["zh-TW", "zh-Hant"], ["zh-HK", "zh-Hant"], ["zh-CN", "zh"], ["pt-PT", "pt-PT"], ["pt-AO", "pt-PT"], ["pt-BR", "pt"], ["es-ES", "es-ES"], ["es-MX", "es"]]) {
    const w = await page("", null, { locale });
    const got = await w.p.evaluate(() => document.documentElement.lang);
    check(got === want, `${locale}: the page is in ${want}`, got);
    await w.ctx.close();
  }
  // a new player whose first language the game doesn't have: counted, so we know which language to add next
  for (const [locale, want] of [["sw-KE", "lang-wanted/sw"], ["de-DE", null]]) {
    const w = await page("", () => { Object.defineProperty(window, "KING_WALK_CONFIG", { get: () => ({ goatcounter: "https://example.invalid/count" }), set() {} });
      window.counted = []; Object.defineProperty(window, "goatcounter", { get: () => ({ count: o => window.counted.push(o.title) }), set() {} }); }, { locale });
    const got = await w.p.evaluate(() => window.counted.filter(t => /^lang/.test(t)));
    check(want ? got.includes(want) : !got.some(t => t.startsWith("lang-wanted")), `${locale}: ${want || "no lang-wanted"}`, got);
    await w.ctx.close();
  }
  // dates and times follow the player's region in their language: a 24-hour clock in Britain, 12-hour in the US;
  // Arabic keeps the digits 0-9
  for (const [locale, want] of [["en-GB", /^20:00$/], ["en-US", /8:00\sPM/i], ["ar-EG", /[0-9]/]]) {
    const w = await page("", null, { locale });
    const t = await w.p.evaluate(() => { renderRemind(); return $("remindSel").options[4].textContent; });
    check(want.test(t) && !/[\u0660-\u0669]/.test(t), `${locale}: the reminder times read ${t}`, t);
    await w.ctx.close();
  }
  check(!errs.length, "no page errors", errs);
  await b.close(); srv.close();
  console.log(`${good} passed, ${bad} failed`);
  process.exit(bad ? 1 : 0);
})();
