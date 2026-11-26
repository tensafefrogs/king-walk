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

// Every page here starts at the same moment, in the same time zone, whatever day the tests run: the daily, streaks and
// freezes follow the date, and a test once passed or failed by the day it ran (the freeze test, six red runs near
// Daily #1). UNIT_NOW tries another moment (an ISO time); the clock runs on from it.
const NOW = new Date(process.env.UNIT_NOW || "2026-11-15T00:30:00Z"), ZONE = process.env.UNIT_TZ || "UTC";
if (isNaN(NOW)) { console.log("UNIT_NOW isn't a date:", process.env.UNIT_NOW); process.exit(1); }

(async () => {
  const langs = translations();
  const srv = await server.start(), b0 = await chromium.launch();
  const b = { newContext: async (opts = {}) => {          /* every context on the tests' clock */
    const ctx = await b0.newContext({ timezoneId: ZONE, ...opts });
    const np = ctx.newPage.bind(ctx); ctx.newPage = async () => { const p = await np(); await p.clock.install({ time: NOW }); return p; };
    return ctx;
  }, close: () => b0.close() };
  const page = async (q = "", init, opts) => {
    const ctx = await b.newContext(opts), p = await ctx.newPage(), errs = [];
    const reqs = []; p.on("request", r => reqs.push(r.url()));
    p.on("pageerror", e => errs.push(e.message));
    await p.route(/zgo\.at|goatcounter/, r => r.abort());
    if (init) await p.addInitScript(init);
    await p.goto(srv.url + q);
    await p.waitForFunction(() => typeof locked !== "undefined" && !locked && cur, null, { timeout: 15000 });
    return { p, ctx, errs, reqs };
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
  // two devices' saves: the cases both rules are checked against (betterSave here, SaveRank in Swift in the save-rank job)
  const saveCases = JSON.parse(fs.readFileSync(path.join(__dirname, "save-cases.json"), "utf8")).cases;
  const sv = await p.evaluate(cases => cases.map(c => ({ what: c.what, got: betterSave(cleanState(c.a) || c.a, cleanState(c.b) || c.b), want: c.a_wins })), saveCases);
  for (const c of sv) check(c.got === c.want, "which device's save to keep: " + c.what, c);
  // the coach: themes to areas, the score against the rating's expectation with older results fading, second tries
  // at half weight, the save cleaned, Start over clearing it
  const co = await p.evaluate(() => {
    const areas = puzzleAreas({ th: ["endgame", "pin", "backRankMate", "mateIn2", "crushing", "castling"] }), none = puzzleAreas({ th: ["middlegame", "long", "enPassant"] });
    const pl = newPlayer(1500), pz = { r: 1500, th: ["pin"] };
    coachRecord(pl, pz, 1, 1500); const one = pl.coach.pin.slice();
    coachRecord(pl, pz, 1, 1500); const two = pl.coach.pin.slice();
    coachRecord(pl, pz, 0, 1500, 0.5); const half = pl.coach.pin.slice();
    const hint = newPlayer(1500); coachRecord(hint, { r: 1100, th: ["fork"] }, 0.5, 1500);          /* expected about 0.91: a hint on an easy one is below it */
    const cleaned = cleanCoach({ pin: [2, 1], bogus: [1, 1], fork: ["x", 1], mate: [-1, 0], skewer: [50, 99], sac: [3, -9] });
    const round = cleanState({ players: [Object.assign(newPlayer(900), { coach: { pin: [2.5, -0.75] } })] }).players[0].coach;
    return { areas, none, one, two, half, hint: hint.coach.fork, strength: coachStrength(pl, "pin"), cleaned, round, fresh: newPlayer(600).coach, played: me().coach };
  });
  check(co.areas.join() === "mate,pin,backrank" && !co.none.length, "the coach: a puzzle's themes map to its areas; phase and result tags don't", co.areas);
  check(co.one.join() === "1,0.5" && co.two.join() === "1.95,0.975" && co.half.join() === "2.353,0.676", "the coach: score minus expectation, older results fading, a second try at half weight", [co.one, co.two, co.half]);
  check(co.hint[0] === 1 && co.hint[1] < -0.4 && co.strength > 0, "the coach: a hint counts half a solve, against what the rating expects", { hint: co.hint, strength: co.strength });
  check(JSON.stringify(co.cleaned) === JSON.stringify({ sac: [3, -3], pin: [2, 1], skewer: [20, 20] }) && JSON.stringify(co.round) === JSON.stringify({ pin: [2.5, -0.75] }), "the coach's save is cleaned: known areas, numbers in range", co.cleaned);
  check(JSON.stringify(co.fresh) === "{}" && co.played && typeof co.played === "object", "the coach: a new player (Start over) starts with no record", co);
  // the coach card and a practice session: learning at first; then Work on (no button per row) with one Practise my weak
  // spots, Strong at, and the areas marked; a mixed session of 10 (6 weak-area slots and 4 normal, shuffled, no area
  // named) at half the rating change, hints allowed, a miss not ending it, the normal game's puzzle kept waiting, and its
  // card splitting the score by area
  { const w = await page();
    const ps = await w.p.evaluate(async () => {
      const nap = ms => new Promise(r => setTimeout(r, ms)), q = me(); delete q.place; q.n = 5; renderPanel();
      const learning = $("coachBody").innerText;
      q.n = 40; q.coach = { pin: [10, -3], fork: [9, 2], mate: [12, 0.1], skewer: [9, -1], sac: [3, -2] }; renderPanel();
      const card = { work: [...document.querySelectorAll("#coachBody .co-row b")].map(b => b.textContent), marks: [...document.querySelectorAll("#coachBody .co-mark")].map(m => m.className.split(" ")[1]),
        rowButtons: document.querySelectorAll("#coachBody .co-row button").length, go: [...document.querySelectorAll("#coachBody .co-go")].map(b => b.textContent) };
      const waiting = JSON.stringify(q.now), halves = [], statuses = [];
      document.querySelector("#coachBody .co-go").click(); await nap(400);
      const ask = document.querySelector(".cele:not(.out) .cele-title").textContent; document.querySelector(".cele:not(.out) .go").click(); await nap(300);
      const slots = RUN.practice.slots.join(""); let missed = false;
      for (let k = 0; k < 10; k++) {
        for (let t = 0; t < 80 && (locked || !cur || !RUN); t++) await nap(100);
        const pz = cur.pz, before = q.rating, n = q.n, inArea = ["pin", "skewer"].includes(cur.area) && puzzleAreas(pz).includes(cur.area); statuses.push($("stMain").textContent + " | " + $("endSetTxt").textContent);
        if (k === 1) { showHint(); }
        if (k === 2) { showAnswer(); missed = true; }
        while (!done) { for (let t = 0; t < 80 && locked && !done; t++) await nap(100); if (done) break; const m = cur.pz.moves[idx]; commit(m.slice(0, 2), m.slice(2, 4), m[4] || ""); await nap(50); }
        for (let t = 0; t < 30 && !done; t++) await nap(100);
        const score = k === 2 ? 0 : k === 1 ? 0.5 : 1, full = ratingChange(before, pz.r, score, n);
        halves.push({ inArea, got: q.rating - before, want: score === 1 ? Math.max(1, Math.round(full / 2)) : Math.round(full / 2), areasShown: !!document.querySelector("#pzInfo .pz-areas") || !puzzleAreas(pz).length });          /* a puzzle in no area has no line */
        await nap(1200);
        if (k < 9) $("nextBtn").click();
      }
      await nap(1500);          /* the set's card waits for any achievement's card to close */
      for (let t = 0; t < 8; t++) { const t1 = document.querySelector(".cele:not(.out) .cele-title"); if (!t1 || / of 10$/.test(t1.textContent)) break; document.querySelector(".cele:not(.out) .go").click(); await nap(1200); }
      const end = { over: RUN && RUN.over, card: (document.querySelector(".cele:not(.out) .cele-title") || {}).textContent, text: (document.querySelector(".cele:not(.out) .cele-text") || {}).textContent, chip: $("stLevel").textContent, endShown: !$("endSetBtn").hidden, chipShown: !$("stLevel").hidden };
      const tally = Object.entries(RUN.practice.byArea).reduce((t, [, v]) => t + v[1], 0);
      return { learning, card, ask, slots, statuses, halves, missed, end, tally, keptWaiting: JSON.stringify(q.now) === waiting, coachPin: q.coach.pin[0] };
    });
    await w.ctx.close();
    check(/learning your game/.test(ps.learning), "the coach: learning at first", ps.learning);
    check(ps.card.work.join() === "Pins,Skewers" && ps.card.marks.includes("up") && ps.card.marks.includes("down") && ps.card.rowButtons === 0 && ps.card.go.join() === "Practise my weak spots" && ps.ask === "Practise my weak spots",
          "the coach card: Work on the weak areas with no button each, one Practise my weak spots (asks first), the known ones marked", ps.card);
    check(ps.slots.split("w").length - 1 === 6 && ps.slots.length === 10 && ps.halves.filter(h => h.inArea).length >= 5 && ps.halves.every(h => h.got === h.want && h.areasShown),
          "a practice session: 6 weak-area slots and 4 others, shuffled; half the rating change, the areas shown after each", { slots: ps.slots, halves: ps.halves });
    check(ps.statuses.every((t, k) => t.endsWith(" | Practice " + (k + 1) + "/10") && !/Pins|Skewers/.test(t)), "a practice session names no area while it's played (its chip says Practice n/10)", ps.statuses);
    check(ps.end.over && !ps.end.endShown && ps.end.chipShown && ps.end.card === "9 of 10" && ps.end.chip === "Practice 10/10" && ps.tally === 10 && /(Pins|Skewers): \d+ of \d+/.test(ps.end.text),
          "a practice session ends with its card: the solves out of 10 (a hint counts, the answer doesn't), split by area", ps.end);
    check(ps.keptWaiting && ps.coachPin > 10, "a practice session keeps the normal game's puzzle waiting and adds to the coach's record", ps); }
  // a weak area with nothing near the player's level gives its slot to a normal puzzle; the card lists the rest as Others
  { const w = await page();
    const th = await w.p.evaluate(async () => {
      RUN = { practice: { slots: ["w"], weak: ["no-such-area"], turn: 0, from: {}, byArea: {} }, step: 0, good: 0, used: new Set(), over: false };
      const pick = await pickPracticePuzzle(); const P = RUN.practice; RUN = null;
      const sum = practiceSummary({ weak: ["pin", "fork"], from: { pin: -99, fork: 99 }, byArea: { pin: [3, 4], "": [2, 4] } });
      return { area: pick.area, got: !!pick.pz, sum };
    });
    await w.ctx.close();
    check(th.got && th.area === "" && th.sum === "Pins: 3 of 4 \u00b7 Others: 2 of 4\nPins: getting better.", "a practice session: a thin weak area's slot goes to a normal puzzle; the card reads Pins: 3 of 4 · Others: 2 of 4", th); }
  // a practice set can be ended early: the ✕ beside its chip asks first; Keep practising goes on, End practice goes back
  // to the normal game's waiting puzzle. Not there in normal play or a rank streak
  { const w = await page();
    const es = await w.p.evaluate(async () => {
      const nap = ms => new Promise(r => setTimeout(r, ms)), q = me(); delete q.place; q.n = 40; q.coach = { pin: [10, -3], fork: [9, 2], mate: [12, 0.1] };
      const waiting = JSON.stringify(q.now), out = { normal: !$("endSetBtn").hidden };
      startPractice(); for (let t = 0; t < 80 && (locked || !RUN); t++) await nap(100);
      out.shown = !$("endSetBtn").hidden && $("stLevel").hidden; out.pill = $("endSetBtn").textContent; out.label = $("endSetBtn").getAttribute("aria-label");
      $("endSetBtn").click(); await nap(400); const dlg = document.querySelector(".cele:not(.out)");
      out.ask = dlg && dlg.querySelector(".cele-title").textContent; dlg.querySelector(".sh").click(); await nap(500);
      out.kept = !!(RUN && RUN.practice) && !$("endSetBtn").hidden;
      $("endSetBtn").click(); await nap(400); document.querySelector(".cele:not(.out) .go").click(); await nap(400);
      for (let t = 0; t < 80 && (locked || !cur); t++) await nap(100);
      out.ended = RUN === null && $("endSetBtn").hidden && JSON.stringify(q.now) === waiting;
      startRun(0); for (let t = 0; t < 80 && (locked || !RUN); t++) await nap(100); out.streak = !$("endSetBtn").hidden; leaveRun();
      return out; });
    await w.ctx.close();
    check(!es.normal && es.shown && es.label === "End practice" && es.pill === "Practice 1/10" && es.ask === "End this practice set?" && es.kept, "a practice session: its chip (Practice 1/10 ✕) is the End button and asks first; Keep practising goes on", es);
    check(es.ended && !es.streak, "End practice goes back to the waiting puzzle; no ✕ in normal play or a rank streak", es); }
  // coached choice: about 3 in 10 new puzzles from the weak areas once the coach is ready, none on Any kind; a new
  // player on Any kind 1 time in 10 (the holdback), kept in the save; a player from before the coach on Coached
  const cc = await p.evaluate(async () => {
    const q = me(), keep = JSON.stringify(q), orig = Math.random; delete q.place; q.n = 40; q.choice = "coached";
    q.coach = { pin: [10, -3], fork: [9, 2], mate: [12, 0.1], skewer: [9, -1] };
    const picks = []; for (let k = 0; k < 6; k++) { Math.random = () => 0.05; const c = await pickCoached(q, q.rating); Math.random = orig; picks.push(c && puzzleAreas(c.pz).includes(c.coached) ? c.coached : null); q.n++; }
    Math.random = () => 0.5; const offRoll = await pickCoached(q, q.rating); Math.random = orig;
    q.choice = "any"; Math.random = () => 0.05; const onAny = await pickCoached(q, q.rating); Math.random = orig;
    let holds = 0; for (let k = 0; k < 4000; k++) if (coachChoiceForNew().holdback) holds++;
    const kept = cleanState({ players: [{ rating: 900, choice: "any", holdback: true }] }).players[0], old = cleanState({ players: [{ rating: 900, n: 50 }] }).players[0];
    Object.assign(S.players[S.cur], JSON.parse(keep));
    return { picks, offRoll, onAny, holds, kept: [kept.choice, kept.holdback], old: [old.choice, old.holdback] };
  });
  check(cc.picks.every(a => a === "pin" || a === "skewer") && new Set(cc.picks).size === 2 && !cc.offRoll && !cc.onAny, "coached choice: weak areas in turn, about 3 in 10, never on Any kind", cc);
  check(cc.holds > 300 && cc.holds < 500 && cc.kept.join() === "any,true" && cc.old[0] === "coached" && cc.old[1] === undefined, "the holdback: about 1 new player in 10 on Any kind, kept in the save; older players on Coached", cc);
  // the sound comes back when iOS leaves the audio silent: a context whose clock stands still, or that won't resume over
  // two taps, is replaced on the next tap; a healthy one is kept
  const snd = await p.evaluate(async () => {
    const out = {}, made = [];
    class Fake { constructor() { made.push(this); this.state = "running"; this.frozen = false; this.t0 = performance.now(); }
      get currentTime() { return this.frozen ? 0 : (performance.now() - this.t0) / 1000; }
      get destination() { return {}; } createBuffer() { return {}; } createBufferSource() { return { connect() {}, start() {} }; }
      resume() { if (this.wontWake) return Promise.resolve(); this.state = "running"; return Promise.resolve(); } close() { this.state = "closed"; } }
    const keep = [window.AudioContext, actx, S.sound], nap = ms => new Promise(r => setTimeout(r, ms));
    window.AudioContext = Fake; actx = null; S.sound = true;
    wakeAudio(); await nap(1300); wakeAudio(); out.healthy = made.length;          /* the clock moves: kept */
    actx.frozen = true; await nap(1300); wakeAudio(); out.stalled = made.length;          /* the clock stood still: a new one */
    actx.state = "suspended"; actx.wontWake = true; wakeAudio(); await nap(200); wakeAudio(); out.wontWake = made.length;          /* won't resume twice: a new one */
    [window.AudioContext, actx, S.sound] = keep;
    return out;
  });
  check(snd.healthy === 1 && snd.stalled === 2 && snd.wontWake === 3, "sound: a silent audio context (clock stopped, or won't resume) is replaced on a tap; a working one is kept", snd);
  // the daily's week isn't rebuilt on every redraw (each new circle replayed the pop-in): the same circles stay
  const ww = await page();
  const wkr = await ww.p.evaluate(async () => {
    startDaily(); for (let t = 0; t < 60 && !(DAILY && cur && cur.daily); t++) await new Promise(r => setTimeout(r, 100));
    const first = [...$("diWeek").children]; renderDaily(); renderPanel(); renderDaily();
    return { same: [...$("diWeek").children].every((li, i) => li === first[i]), n: first.length };
  });
  await ww.ctx.close();
  check(wkr.same && wkr.n === 7, "the daily's week keeps its circles when redrawn (no pop-in replay)", wkr);
  // the rating and the badge count like a flip board: every whole number shows, over 1 to 2 s, green going up and
  // red going down, ending on the new value; the badge goes +0, +1, ... (or −0, −1, ...)
  { const w = await page();
    const ct = await w.p.evaluate(async () => {
      const nap = ms => new Promise(r => setTimeout(r, ms)), watch = async (el, ms) => { const seen = [], cls = new Set(), t0 = performance.now(); let end = 0;
        while (performance.now() - t0 < ms) { const v = el.textContent; if (seen[seen.length - 1] !== v) { seen.push(v); end = performance.now() - t0; } el.classList.forEach(c => cls.add(c)); await nap(10); }
        return { seen, end, cls: [...cls], after: el.className }; };
      const el = $("rating"); countTo(el, 1000, 1012); const up = await watch(el, 2500);
      countTo(el, 1012, 1004); const down = await watch(el, 2500);
      const d = $("delta"), signed = v => "+" + Math.abs(v); countTo(d, 0, 9, signed); const badge = await watch(d, 2500);
      return { up, down, badge };
    });
    await w.ctx.close();
    const nums = a => a.map(Number), steps = a => nums(a).every((v, k) => !k || Math.abs(v - nums(a)[k - 1]) === 1);
    check(ct.up.seen.length === 13 && ct.up.seen[0] === "1000" && steps(ct.up.seen) && ct.up.seen.at(-1) === "1012" && ct.up.end >= 850 && ct.up.end <= 2100 && ct.up.cls.includes("c-up") && !/counting/.test(ct.up.after),
          "the rating counts up one by one over about a second (green while it goes), ending on the new value", ct.up);
    check(ct.down.seen.at(-1) === "1004" && steps(ct.down.seen) && ct.down.cls.includes("c-down"), "the rating counts down one by one (red while it goes)", ct.down);
    check(ct.badge.seen.join() === "+1,+2,+3,+4,+5,+6,+7,+8,+9" || ct.badge.seen.join() === "+0,+1,+2,+3,+4,+5,+6,+7,+8,+9", "the badge counts +0 to +9", ct.badge.seen); }
  { const w = await page("", null, { reducedMotion: "reduce" });
    const rm = await w.p.evaluate(() => { countTo($("rating"), 1000, 1012); return $("rating").textContent; });
    await w.ctx.close();
    check(rm === "1012", "with reduced motion the rating shows the new value at once", rm); }
  // spaced repetition: the schedule (1, 3, 7, 14, 30 days; up when clean and quick, the same when slow or with a hint,
  // back to 1 day on a miss, learned and gone after the last step), when a review is due (its day, enough new puzzles
  // since, at most 1 in 5), old saves' second tries moving in, and a miss coming back in play the next day
  { const w = await page();
    const sr = await w.p.evaluate(async () => {
      const p = me(), today = dayIndex(), out = {};
      p.review = []; addReview(p, 1000, 5, 40); addReview(p, 1000, 5, 40);
      const r = p.review[0]; out.added = p.review.length === 1 && r.s === 0 && r.d === today + 1 && r.a === p.n + 3 && r.ft === 40;
      const steps = [];
      steps.push(reviewResult(p, 1000, 5, 1, 12), r.s, r.d - today);          /* clean, quick: up to 3 days */
      steps.push(reviewResult(p, 1000, 5, 1, 50), r.s, r.d - today);          /* clean but slower than the first time: same */
      steps.push(reviewResult(p, 1000, 5, 1, 35), r.s);                       /* clean, over 30 s but faster than the first 40: up */
      steps.push(reviewResult(p, 1000, 5, 0.5, 5), r.s);                      /* with a hint: same */
      steps.push(reviewResult(p, 1000, 5, 0, 5), r.s, r.d - today);           /* missed: back to 1 day */
      out.steps = steps;
      r.s = 4; out.learned = reviewResult(p, 1000, 5, 1, 5) === "learned" && p.review.length === 0;
      /* due: its day, its puzzles, one in five, the longest overdue first */
      p.review = [{ b: 1000, i: 1, s: 0, d: today, a: p.n, ft: 0 }, { b: 1000, i: 2, s: 2, d: today - 3, a: p.n, ft: 0 }, { b: 1000, i: 3, s: 0, d: today + 1, a: 0, ft: 0 }, { b: 1000, i: 4, s: 0, d: today - 9, a: p.n + 1, ft: 0 }];
      p.sinceReview = 4; out.pick = (dueReview(p) || {}).i;
      p.sinceReview = 3; out.tooSoon = dueReview(p) === null;
      /* an old save's second tries */
      const st = cleanState({ players: [{ rating: 900, n: 50, review: [{ b: 900, i: 7, due: 62, tries: 1 }] }] });
      out.migrated = JSON.stringify(st.players[0].review[0]) === JSON.stringify({ b: 900, i: 7, s: 0, d: Math.max(1, today), a: 62, ft: 0 });
      /* in play: a missed puzzle is listed for tomorrow; when it's due it comes up, a clean quick solve moves it up, the rating stays */
      p.review = []; p.sinceReview = 9;
      const nap = ms => new Promise(r => setTimeout(r, ms)), settle = async () => { for (let t = 0; t < 100 && (locked || !cur); t++) await nap(100); };
      await settle(); const first = { b: cur.band, i: cur.i }; showAnswer(); for (let t = 0; t < 100 && !done; t++) await nap(100);
      out.listed = p.review.length === 1 && p.review[0].b === first.b && p.review[0].i === first.i && p.review[0].d === today + 1;
      p.review[0].d = today; p.review[0].a = p.n; p.sinceReview = 4;
      $("nextBtn").click(); await nap(300); await settle();
      out.came = cur.review === true && cur.band === first.b && cur.i === first.i;
      const before = p.rating;
      for (let g = 0; g < 20 && !done; g++) { await settle(); if (done) break; const m = cur.pz.moves[idx]; commit(m.slice(0, 2), m.slice(2, 4), m[4] || ""); await nap(400); }
      out.state = { done, failed, review: p.review, sinceReview: p.sinceReview, rating: p.rating, before };
      out.moved = p.review.length === 1 && p.review[0].s === 1 && p.review[0].d === today + 3 && p.rating === before && p.sinceReview === 0;
      return out;
    });
    await w.ctx.close();
    check(sr.added && JSON.stringify(sr.steps) === JSON.stringify(["up", 1, 3, "same", 1, 3, "up", 2, "same", 2, "reset", 0, 1]) && sr.learned,
          "spaced repetition: listed once at 1 day; up when clean and quick (or faster than the first try), the same when slow or hinted, back to 1 day on a miss, learned after 30 days", sr);
    check(sr.pick === 2 && sr.tooSoon, "spaced repetition: a review is due on its day after enough new puzzles, the longest overdue first, at most 1 puzzle in 5", sr);
    check(sr.migrated, "spaced repetition: an old save's second tries move in at the 1-day step", sr);
    check(sr.listed && sr.came && sr.moved, "spaced repetition in play: a miss is listed for tomorrow, comes back when due, and a clean quick solve moves it to 3 days without touching the rating", sr); }
  // a puzzle's clock stops while the game is hidden
  { const w = await page();
    const ck = await w.p.evaluate(async () => {
      const nap = ms => new Promise(r => setTimeout(r, ms));
      cur.clock = null; startClock(); await nap(1200);
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true }); document.dispatchEvent(new Event("visibilitychange"));
      await nap(2500);
      Object.defineProperty(document, "hidden", { configurable: true, get: () => false }); document.dispatchEvent(new Event("visibilitychange"));
      await nap(1200); return solveSeconds();
    });
    await w.ctx.close();
    check(ck >= 2 && ck <= 3, "a puzzle's clock stops while the game is hidden (2-3 s counted of about 5)", ck); }
  // puzzles added at a band's end leave the daily as it was (it picks from the frozen DAILY_SIZES), so the website and
  // the app versions already out keep the same day's puzzle
  { const w = await page();
    const dd = await w.p.evaluate(async () => {
      const ids = async () => { const out = []; for (let n = 1; n <= 40; n++) out.push((await dailyPuzzle(n)).pz.id); return out; };
      const before = await ids(), keep = {};
      for (const b in PUZZLES) { keep[b] = PUZZLES[b].n; PUZZLES[b].n += 450; }          /* as if 450 puzzles were added to every band */
      const after = await ids(); for (const b in keep) PUZZLES[b].n = keep[b];
      return { same: before.every((id, i) => id === after[i]), before: before.slice(0, 3), after: after.slice(0, 3) };
    });
    await w.ctx.close();
    check(dd.same, "puzzles added at a band's end leave the daily puzzle as it was (40 days)", dd); }
  // the daily's answer says whether the player tried first (a move or a hint) or showed it straight away, and a daily
  // played before any other puzzle is counted: they tell a too-hard daily from one players didn't know how to start
  { const w = await page();
    const ev = await w.p.evaluate(async () => {
      const sent = [], keep = track; track = n => { sent.push(n); };
      const nap = ms => new Promise(r => setTimeout(r, ms)), ready = async () => { for (let t = 0; t < 100 && !(DAILY && cur && cur.daily && !locked); t++) await nap(100); };
      const out = {};
      me().n = 0; startDaily(); await ready(); showAnswer(); for (let t = 0; t < 100 && !done; t++) await nap(100);
      out.fresh = sent.filter(n => n.startsWith("daily/")); sent.length = 0;
      delete me().daily.days[DAILY.n]; delete me().daily.now; me().daily.streak = 0; me().n = 5; DAILY = null;
      startDaily(); await ready(); showHint(); await nap(200); showAnswer(); for (let t = 0; t < 100 && !done; t++) await nap(100);
      out.hinted = sent.filter(n => n.startsWith("daily/")); track = keep; return out;
    });
    await w.ctx.close();
    check(ev.fresh.includes("daily/start/new-player") && ev.fresh.includes("daily/missed/untried") && !ev.fresh.includes("daily/missed/tried")
          && ev.hinted.includes("daily/missed/tried") && !ev.hinted.includes("daily/start/new-player"),
          "the daily's answer is counted as tried (a move or hint first) or untried, and a daily played first is counted", ev); }
  // the daily's Answer asks first (it ends the day and the streak): Keep trying leaves the puzzle as it was, Show answer
  // shows it; a normal puzzle's Answer shows it at once. A daily played as the very first puzzle shows the how-to-move tip
  { const w = await page();
    const r = await w.p.evaluate(async () => {
      const nap = ms => new Promise(r => setTimeout(r, ms)), out = {};
      $("answerBtn").click(); await nap(300); out.normalShown = failed && !document.querySelector(".dlg"); for (let t = 0; t < 100 && !done; t++) await nap(100);
      me().n = 0; S.tip = false; startDaily(); for (let t = 0; t < 100 && !(DAILY && cur && cur.daily && !locked); t++) await nap(100);
      out.tip = !$("tip").hidden;
      $("answerBtn").click(); await nap(300);
      const dlg = document.querySelector(".dlg"); out.asked = !!dlg && !failed;
      out.title = dlg && dlg.querySelector("h2").textContent; if (!dlg) return out;
      [...dlg.querySelectorAll("button")].find(b => b.textContent === T("Keep trying")).click(); await nap(400);
      out.kept = !failed && !done && !document.querySelector(".dlg") && !me().daily.days[DAILY.n];
      $("answerBtn").click(); await nap(300);
      [...document.querySelectorAll(".dlg button")].find(b => b.textContent === T("Show answer")).click(); await nap(300);
      out.shown = failed; return out;
    });
    await w.ctx.close();
    check(r.normalShown && r.tip && r.asked && r.title === "Show the answer?" && r.kept && r.shown,
          "the daily's Answer asks first (Keep trying changes nothing), a normal one doesn't; a first daily shows the how-to-move tip", r); }
  // the iOS app from TestFlight sends its stats apart from the App Store's (testers aren't players)
  { const prefix = async ch => { const w = await page("", `window.webkit={messageHandlers:{kingwalk:{postMessage(){}}}};window.kingWalkApp={platform:"iphone"${ch ? `,channel:"${ch}"` : ""}}`);
      const v = await w.p.evaluate(() => TRACK_PREFIX); await w.ctx.close(); return v; };
    const tf = await prefix("testflight"), store = await prefix("appstore"), old = await prefix("");
    check(tf === "king-walk-testflight/" && store === "king-walk-ios/" && old === "king-walk-ios/", "the iOS app's stats: TestFlight apart, the App Store (and older apps) as before", { tf, store, old }); }
  // the week's solved and missed marks are drawn in the middle of their circles, not typed: a ✓ or × isn't in the game's
  // fonts, so each phone used its own fallback, at its own height (a player saw the ✓ sit high)
  { const w = await page();
    const mk = await w.p.evaluate(async () => {
      startDaily(); for (let t = 0; t < 60 && !(DAILY && cur && cur.daily); t++) await new Promise(r => setTimeout(r, 100));
      const p = me(), dn = DAILY.n, out = [];
      for (const [c, rec] of [["ok", { m: "g", t: 30, ok: true }], ["miss", { m: "r", t: 30, ok: false }], ["fz", { fz: true }]]) {          /* yesterday, as each */
        p.daily.days[dn - 1] = rec; renderDaily(); await new Promise(r => setTimeout(r, 700));
        const li = $("diWeek").children[5], i = li.firstChild, m = getComputedStyle(i, "::after");
        out.push({ c, dn, cls: li.className, text: i.textContent, drawn: li.classList.contains(c) && m.content !== "none" && m.content !== "normal" && parseFloat(m.width) > 8 && m.maskImage !== "none" ? 1 : 0 });
      }
      delete p.daily.days[dn - 1]; return out;
    });
    await w.ctx.close();
    const [ok, miss, fz] = mk;
    check(ok.text === "" && ok.drawn && miss.text === "" && miss.drawn && fz.text === "\u2744" && fz.cls.includes("fz") && !fz.drawn, "the daily's week draws its ✓ and × (centred, the same on every phone) and keeps the ❄", mk); }
  // every solve is celebrated: a clean one with confetti, the board's glow and the piece's bounce; with a hint, the glow
  // and the bounce; after a wrong move, the bounce
  { const w = await page();
    const cel = await w.p.evaluate(async () => {
      const nap = ms => new Promise(r => setTimeout(r, ms)), out = [];
      for (const how of ["clean", "hint", "miss"]) {
        for (let t = 0; t < 80 && (locked || done); t++) await nap(100);
        let conf = 0; const orig = window.confetti; window.confetti = sq => { conf++; };
        if (how === "hint") showHint();
        if (how === "miss") { const want = cur.pz.moves[idx]; for (const m of game.moves({ verbose: true })) if (m.from + m.to !== want.slice(0, 4) && !m.flags.includes("p")) { const g = new Chess(game.fen()); g.move(m); if (!g.in_checkmate()) { tryMove(m.from, m.to); break; } } await nap(1200); }
        while (!done) { for (let t = 0; t < 80 && locked && !done; t++) await nap(100); if (done) break; const m = cur.pz.moves[idx]; commit(m.slice(0, 2), m.slice(2, 4), m[4] || ""); await nap(50); }
        await nap(500);
        const piece = lastMove[1] && els.get(lastMove[1]);
        out.push({ how, conf, glow: frameEl.classList.contains("won"), bounce: !!(piece && piece.el.classList.contains("win")) });
        window.confetti = orig; document.querySelectorAll(".cele .go").forEach(b => b.click()); await nap(600); $("nextBtn").click();
      }
      return out;
    });
    await w.ctx.close();
    const [c, h, m] = cel;
    check(c.conf === 1 && c.glow && c.bounce && h.conf === 0 && h.glow && h.bounce && m.conf === 0 && !m.glow && m.bounce,
      "every solve is celebrated: clean with confetti, with a hint the glow and bounce, after a miss the bounce", cel); }
  // stats wait on the device while it's offline and go out, in order, once it's back online, one at a time (GoatCounter
  // takes 4 a second from a player); at most 1000 wait and none older than 7 days
  { const ctx = await b.newContext(), sp = await ctx.newPage();
    await sp.route(/zgo\.at|goatcounter/, r => r.abort());
    await sp.route("**/config.js", r => r.fulfill({ contentType: "application/javascript", body: 'window.KING_WALK_CONFIG={goatcounter:"https://example.goatcounter.com/count"};' }));
    await sp.addInitScript(() => { window.__sent = []; window.goatcounter = { count: e => window.__sent.push([e.title, performance.now()]) }; });
    await sp.goto(srv.url); await sp.waitForFunction(() => typeof cur !== "undefined" && cur && !locked, null, { timeout: 15000 });
    await sp.evaluate(() => new Promise(r => setTimeout(r, 1500))).then(() => sp.evaluate(() => { window.__sent = []; }));
    await ctx.setOffline(true);
    const off = await sp.evaluate(() => { for (let k = 0; k < 8; k++) track("test/" + k); return { sent: window.__sent.length, stored: JSON.parse(localStorage.getItem("kw-stats") || "[]").map(e => e[0]) }; });
    await ctx.setOffline(false);
    await sp.waitForFunction(() => window.__sent.some(e => e[0] === "test/7"), null, { timeout: 15000 }).catch(() => {});
    const on = await sp.evaluate(() => { const s = window.__sent.filter(e => e[0].startsWith("test/")), gaps = s.slice(1).map((e, i) => e[1] - s[i][1]);
      return { sent: s.map(e => e[0]), minGap: Math.round(Math.min(...gaps)), left: localStorage.getItem("kw-stats") }; });
    await ctx.setOffline(true);
    const lim = await sp.evaluate(() => {
      for (let k = 0; k < 1200; k++) track("test/many-" + k);
      const kept = (JSON.parse(localStorage.getItem("kw-stats")) || []).map(e => e[0]);
      trackQ.unshift(["test/stale", Date.now() - 8 * 864e5]); trackQ.push(["test/week", Date.now() - 6 * 864e5]); flushTrack();
      return { n: kept.length, first: kept[0], last: kept[kept.length - 1], stale: trackQ.some(e => e[0] === "test/stale"), week: trackQ.some(e => e[0] === "test/week") };
    });
    await ctx.close();
    check(!off.sent && off.stored.join() === "test/0,test/1,test/2,test/3,test/4,test/5,test/6,test/7", "stats: offline, events wait in the device's storage", off);
    check(on.sent.join() === off.stored.join() && on.left === null, "stats: back online, the waiting events go out in order and leave the queue", on);
    check(on.minGap >= 450, "stats: they go out one at a time, at most 2 a second (GoatCounter takes 4), never as a burst", on);
    check(lim.n === 1000 && lim.first === "test/many-200" && lim.last === "test/many-1199" && !lim.stale && lim.week, "stats: at most 1000 wait (the oldest go first) and none older than 7 days", lim); }
  // the coach is ready: once per player, a card after that puzzle; its button scrolls down to the coach (below the
  // board on a phone) and lights it up. Nothing to share on it; not shown again; kept in the save
  { const w = await page("", null, { viewport: { width: 390, height: 844 } });
    const r = await w.p.evaluate(async () => {
      const nap = ms => new Promise(r => setTimeout(r, ms));
      const q = me(); delete q.place; q.n = 40; q.coach = { pin: [10, -3], fork: [9, 2], mate: [12, 0.1], skewer: [9, -1] }; save();
      const solve = async () => { while (!done) { for (let t = 0; t < 80 && locked && !done; t++) await nap(100); if (done) break; const m = cur.pz.moves[idx]; commit(m.slice(0, 2), m.slice(2, 4), m[4] || ""); await nap(50); } };
      const coachCard = async ms => { for (let t = 0; t < ms / 100; t++) { const c = document.querySelector(".cele"); const title = c && c.querySelector(".cele-title").textContent;
          if (title === T("Your coach is ready")) return c; if (c) c.querySelector(".go").click(); await nap(100); } return null; };
      window.scrollTo(0, 0); await solve();
      const card = await coachCard(6000), out = { card: !!card, share: !!(card && card.querySelector(".sh")), met: me().coachMet === true,
        saved: JSON.parse(localStorage.getItem(LS_KEY)).players[0].coachMet === true };
      if (card) { card.querySelector(".go").click(); await nap(1600);
        const box = $("coachBox"), rc = box.getBoundingClientRect();
        Object.assign(out, { spot: box.classList.contains("spot"), inView: rc.top >= 0 && rc.top < innerHeight, scrolled: scrollY > 0 || document.scrollingElement.scrollTop > 0, ready: !!box.querySelector(".co-sub") }); }
      $("nextBtn").click(); for (let t = 0; t < 80 && (locked || done); t++) await nap(100); await solve();
      out.again = !!(await coachCard(3000));
      out.clean = cleanState({ players: [{ rating: 900, coachMet: true }] }).players[0].coachMet === true && cleanState({ players: [{ rating: 900 }] }).players[0].coachMet === undefined;
      return out; });
    await w.ctx.close();
    check(r.card && !r.share && r.met && r.saved, "the coach is ready: a card says so once, with nothing to share, and the save remembers it", r);
    check(r.spot && r.inView && r.scrolled && r.ready, "Show me scrolls down to the coach and lights it up", r);
    check(!r.again && r.clean, "the coach card isn't shown again; the save keeps coachMet", r); }
  // hints go move by move: on each of the player's moves the first hint is the piece, the second the arrow; any hint
  // makes it a hint solve
  { const w = await page();
    const h = await w.p.evaluate(async () => {
      const nap = ms => new Promise(r => setTimeout(r, ms)), wait = async () => { for (let t = 0; t < 80 && locked && !done; t++) await nap(100); };
      for (let k = 0; k < 30 && cur.pz.moves.length - idx < 3; k++) { $("answerBtn").click(); for (let t = 0; t < 120 && !done; t++) await nap(100); await nap(400);
        document.querySelectorAll(".cele .go").forEach(b => b.click()); $("nextBtn").click(); for (let t = 0; t < 80 && (locked || done); t++) await nap(100); }
      await wait(); const out = { moves: cur.pz.moves.length - idx };
      showHint(); out.first = hintSq.length; out.label = $("hintLabel").textContent;
      showHint(); out.second = hintSq.length; out.used = $("hintBtn").disabled;
      let m = cur.pz.moves[idx]; commit(m.slice(0, 2), m.slice(2, 4), m[4] || ""); await nap(100); await wait();
      out.next = { enabled: !$("hintBtn").disabled, label: $("hintLabel").textContent, sq: hintSq.length };
      showHint(); out.next.first = hintSq.length; out.next.status = $("status").textContent;
      while (!done) { await wait(); if (done) break; m = cur.pz.moves[idx]; commit(m.slice(0, 2), m.slice(2, 4), m[4] || ""); await nap(50); }
      for (let t = 0; t < 30 && !lastResult; t++) await nap(100);
      out.half = hintLevel === 2 && failed === false; return out; });
    await w.ctx.close();
    check(h.moves >= 3 && h.first === 1 && h.second === 2 && h.used, "hints: on a move, the first lights the piece and the second adds the arrow, then none", h);
    check(h.next.enabled && h.next.label === "Hint" && h.next.sq === 0 && h.next.first === 1 && h.half, "hints: the next move starts again at the piece; any hint makes it a hint solve", h); }
  // a save with a coach record loads again after a reload (the save is read before most of the page's script runs: a
  // constant the cleaning needs, defined further down, once made every reload start over)
  { const w = await page(); await w.p.evaluate(() => { const q = me(); q.n = 7; q.coach = { pin: [3, 0.5] }; save(); });
    await w.p.reload(); await w.p.waitForFunction(() => typeof cur !== "undefined" && cur, null, { timeout: 15000 });
    const back = await w.p.evaluate(() => ({ n: me().n, coach: me().coach })); await w.ctx.close();
    check(back.n === 7 && back.coach.pin && back.coach.pin[0] === 3, "progress and the coach's record are still there after a reload", back); }
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
    hide(true); const away = { spent: dailySpent(), saved: q.daily.now && q.daily.now.t, k: q.daily.now && q.daily.now.k };
    await wait(1200); away.later = dailySpent(); hide(false);
    const back = { cover: !$("dailyCover").hidden, locked, title: $("dcTitle").textContent, time: $("dcTime").textContent, sub: $("dcSub").textContent, spent: dailySpent() };
    await wait(1100); back.later = dailySpent();
    $("dcGo").click(); const going = { cover: !$("dailyCover").hidden, locked }; await wait(1100); going.ticks = dailySpent() > back.later;
    /* the player's first move, then the reply: their turn again, two moves on */
    tryMove(cur.pz.moves[1].slice(0, 2), cur.pz.moves[1].slice(2, 4)); for (let i = 0; i < 40 && locked; i++) await wait(100);
    const kAfter = idx, fen = game.fen(), saved = { ...q.daily.now };
    leaveDaily(); await wait(400); startDaily(); for (let i = 0; i < 60 && !(DAILY && DAILY.paused); i++) await wait(100);
    const again = { cover: !$("dailyCover").hidden, sub: $("dcSub").textContent, idx, fen: game.fen(), spent: DAILY.spent, marks: DAILY.marks.join("") };
    $("dcGo").click(); leaveDaily(); delete q.daily.now;
    return { away, back, going, kAfter, fen, saved, again, moves: cur && cur.pz.moves.length };
  });
  check(pz.away.later === pz.away.spent && pz.away.saved >= 35 && pz.away.k === 1, "the daily, hidden: its clock stops and it's saved with its place", pz.away);
  check(pz.back.cover && pz.back.locked && pz.back.title === "Paused" && /0:3[5-6]/.test(pz.back.time) && !pz.back.sub && pz.back.later === pz.back.spent, "back to the game: the daily waits under Paused, the clock stopped", pz.back);
  check(!pz.going.cover && !pz.going.locked && pz.going.ticks, "Continue: the cover goes, the clock runs", pz.going);
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
    const got = [...new Set(w.reqs.map(u => (u.match(/\/lang\/([\w-]+)\.js/) || [])[1]).filter(Boolean))].sort();
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
    await w.p.waitForFunction(() => !trackQ.length, null, { timeout: 10000 }).catch(() => {});          // events go out two a second
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
