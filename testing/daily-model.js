// The daily puzzle, driven through random sequences of what a player does across days: open it (the button, a link,
// the app's widget), play, miss, show the answer, pause and come back, reload, leave it, let minutes, midnight and whole
// days pass. After every step it checks what must always hold. Each rule is a bug that once shipped or nearly did:
//   - a link (followed in the open game, or opened fresh) or the app opening the daily, with today's done, shows today's solved board, not a regular puzzle (cb08c29)
//   - opening the daily with today's not done opens today's, even with yesterday's finished on the board (fe15eb9)
//   - no streak freeze is spent while a daily is being played, even past midnight (fe15eb9)
//   - the daily's clock doesn't run while it's paused or the game is hidden (fe15eb9), nor when the game is hidden
//     right after the daily is opened, before its first move (found by this model, fixed in 08322ae)
//   - a link or the app opening a finished daily shows its card, not a share sheet (fe15eb9)
//   - an achievement the daily earns comes after the day's card, never before it (99c1408)
//   - a practice set or a rank streak keeps the normal game's waiting puzzle (the coach's practice sets reuse the streak's
//     machinery, and the normal game's puzzle stays in the save while one runs)
//   - the day's result is kept: a solved day stays solved, and the streak counts the days in a row solved (an oracle
//     kept by this test, from the rules in recordDaily's comment)
// The page runs on Playwright's fake clock, so days pass in milliseconds and every run is the same for its seed.
// usage: node testing/daily-model.js [runs, default 12] [steps, default 30] [first seed, default 1]
//        a failure prints the seed and the steps that led to it: run that seed alone to see it again.
const { chromium } = require("playwright");
const server = require("./server");
const RUNS = +process.argv[2] || 12, STEPS = +process.argv[3] || 30, SEED = +process.argv[4] || 1;
const START = new Date("2026-11-20T09:00:00Z");          /* a Friday, a week after Daily #1 */
const MIN = 60e3, HOUR = 60 * MIN, DAY = 24 * HOUR;

function rng(seed) { return () => { seed |= 0; seed = seed + 0x6d2b79f5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/* what the page shows and holds, read in one go */
const look = p => p.evaluate(() => {
  const D = me().daily, n = dayNumber();
  return { n, daily: DAILY && { n: DAILY.n, mode: DAILY.mode, paused: !!DAILY.paused }, done, locked, onDaily: !!(cur && cur.daily),
    curDaily: cur && cur.daily, spent: DAILY && typeof dailySpent === "function" && DAILY.mode === "play" ? dailySpent() : null,
    freezes: D.freezes || 0, streak: D.streak, last: D.last, days: Object.fromEntries(Object.entries(D.days).filter(([, v]) => !v.fz).map(([k, v]) => [k, !!v.ok])),
    cards: window.__cards.slice(), shares: window.__shares, hidden: document.hidden,
    waiting: me().now ? me().now.b + "/" + me().now.i : null, run: typeof RUN !== "undefined" && RUN ? (RUN.practice || RUN.area ? "practice" : "streak") : null };
});

/* animations and the computer's replies, on the fake clock; an error in the page's timers surfaces here */
async function settle(p, ms = 3000) { try { await p.clock.runFor(ms); } catch (e) { (p.__errs || []).push(e.message.split("\n").slice(0, 3).join(" ")); } }
async function closeCards(p) {
  for (let i = 0; i < 6; i++) {
    const any = await p.evaluate(() => { const go = document.querySelector(".cele:not(.out) .go"); if (go) { go.click(); return true; } return false; });
    if (!any) break; await settle(p, 800);
  }
}

/* the player's moves */
const ACTIONS = {
  async button(p) { await p.evaluate(() => $("dailyBtn").click()); await settle(p); },
  async link(p) { await p.evaluate(() => { location.hash = "#daily"; }); await settle(p); },
  async visit(p) {          /* a shared result's link, opened fresh: kingwalk.app/#daily */
    await p.goto(p.__url + "index.html#daily"); await p.waitForFunction(() => typeof cur !== "undefined" && cur, null, { timeout: 20000 }); await settle(p);
  },
  async app(p) { await p.evaluate(() => window.kingWalkOpen && window.kingWalkOpen("daily")); await settle(p); },
  async good(p) {          /* the next right move */
    await p.evaluate(() => { if (!(DAILY || RUN) || done || locked || !cur) return; const m = cur.pz.moves[idx]; if (m) commit(m.slice(0, 2), m.slice(2, 4), m[4] || ""); });
    await settle(p);
  },
  async solve(p) { for (let i = 0; i < 6; i++) await ACTIONS.good(p); },
  async wrong(p) {          /* a legal move that isn't the answer and doesn't mate */
    await p.evaluate(() => {
      if (!(DAILY || RUN) || done || locked || !cur) return;
      const want = cur.pz.moves[idx];
      for (const m of game.moves({ verbose: true })) if (m.from + m.to !== want.slice(0, 4) && !m.flags.includes("p")) {
        const g = new Chess(game.fen()); g.move(m); if (!g.in_checkmate()) { tryMove(m.from, m.to); return; } }
    });
    await settle(p);
  },
  async hint(p) { await p.evaluate(() => { if ((DAILY || RUN) && !done && !locked) showHint(); }); await settle(p, 500); },
  async answer(p) { await p.evaluate(() => { if ((DAILY || RUN) && !done && !locked && cur) showAnswer(); }); await settle(p, 8000); },
  async away(p) {          /* open the daily and switch apps at once, before its first move has played */
    await p.evaluate(() => $("dailyBtn").click()); await p.clock.runFor(100);
    await p.evaluate(() => { window.__hidden = true; document.dispatchEvent(new Event("visibilitychange")); }); await settle(p, 500);
  },
  async hide(p) { await p.evaluate(() => { window.__hidden = true; document.dispatchEvent(new Event("visibilitychange")); }); await settle(p, 500); },
  async show(p) { await p.evaluate(() => { window.__hidden = false; document.dispatchEvent(new Event("visibilitychange")); }); await settle(p, 500); },
  async resume(p) { await p.evaluate(() => { const b = document.getElementById("dcGo"); if (b && !document.getElementById("dailyCover").hidden) b.click(); }); await settle(p, 500); },
  async leave(p) { await p.evaluate(() => { if (typeof leaveDaily === "function" && DAILY) leaveDaily(); else if (typeof leaveRun === "function" && RUN) leaveRun(); }); await settle(p); },
  async practise(p) { await p.evaluate(() => { if (typeof startPractice !== "function") return; startPractice(); }); await settle(p); },          /* a practice set (the coach) */
  async streak(p) { await p.evaluate(() => typeof startRun === "function" && startRun(0)); await settle(p); },          /* a Pawn rank streak */
  async close(p) { await closeCards(p); },
  async reload(p) { await p.reload(); await p.waitForFunction(() => typeof cur !== "undefined" && cur, null, { timeout: 20000 }); await settle(p); },
  async minutes(p) { await p.clock.fastForward(7 * MIN); await settle(p, 500); },
  async midnight(p, r) {          /* to just past the next midnight (in the page's time zone, UTC here) */
    const now = await p.evaluate(() => Date.now()), next = Math.ceil((now + 1) / DAY) * DAY;
    await p.clock.fastForward(next - now + Math.floor(r() * 90) * MIN + 2 * MIN); await settle(p, 61e3);          /* the minute check for a new day */
  },
  async days(p, r) { await p.clock.fastForward((2 + Math.floor(r() * 2)) * DAY); await settle(p, 61e3); },
};
/* more playing than anything else, as players do */
const WEIGHTS = { away: 2, practise: 2, streak: 1, button: 5, link: 2, visit: 2, app: 2, good: 8, solve: 5, wrong: 3, hint: 1, answer: 1, hide: 2, show: 2, resume: 3, leave: 1, close: 4, reload: 1, minutes: 2, midnight: 4, days: 1 };
const BAG = Object.entries(WEIGHTS).flatMap(([k, w]) => Array(w).fill(k));

/* the oracle: the days solved, from what the test did */
function oracleStreak(solved, n) {          /* days in a row solved, up to n or n - 1, freezes aside */
  let k = solved.has(n) ? n : n - 1, s = 0;
  while (solved.has(k)) { s++; k--; }
  return s;
}

async function run(b, url, seed) {
  const r = rng(seed), ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "UTC", reducedMotion: "reduce" });
  const p = await ctx.newPage(), errs = [], trail = [], problems = [];
  await p.clock.install({ time: START });
  await p.addInitScript(() => {
    /* visibility, which a test can't switch otherwise; cards in the order they open; share sheets asked for */
    Object.defineProperty(document, "hidden", { get: () => !!window.__hidden, configurable: true });
    Object.defineProperty(document, "visibilityState", { get: () => window.__hidden ? "hidden" : "visible", configurable: true });
    window.__cards = []; window.__shares = 0;
    navigator.share = () => { window.__shares++; return Promise.resolve(); };
    const watch = () => new MutationObserver(ms => { for (const m of ms) for (const el of m.addedNodes) if (el.classList && el.classList.contains("cele")) {
      const k = el.querySelector(".cele-kind"); window.__cards.push((k ? k.textContent : "") + "|" + (el.querySelector(".cele-title") || {}).textContent); } })
      .observe(document.documentElement, { childList: true, subtree: true });
    if (document.documentElement) watch(); else document.addEventListener("readystatechange", watch, { once: true });
  });
  p.__errs = errs; p.on("pageerror", e => errs.push(e.message));
  await p.route(/zgo\.at|goatcounter/, x => x.abort());
  p.__url = url; await p.goto(url + "index.html");
  await p.waitForFunction(() => typeof cur !== "undefined" && cur, null, { timeout: 20000 });
  await settle(p);
  const fail = (what, detail) => problems.push({ seed, step: trail.length, what, detail, trail: trail.slice() });
  const solvedDays = new Set();
  /* a player whose coach is ready, so Practise has kinds to offer (an older page without the coach ignores it) */
  await p.evaluate(() => { const q = me(); delete q.place; q.n = Math.max(q.n, 40); q.coach = { pin: [10, -3], skewer: [9, -1], fork: [9, 2], mate: [12, 1] }; save(); });
  let heldWaiting;          /* the normal game's puzzle when a practice set or streak began */
  let before = await look(p);
  for (let s = 0; s < STEPS && !problems.length; s++) {
    let a = BAG[Math.floor(r() * BAG.length)];
    /* a hidden game gets no taps: while hidden, only coming back, time passing or a reload */
    if (before.hidden && !["show", "minutes", "midnight", "days", "reload", "hide", "away"].includes(a)) a = "show";
    if (before.hidden && a === "away") a = "minutes";
    trail.push(a);
    const ts = Date.now(); await ACTIONS[a](p, r);
    if (process.env.MODEL_DEBUG) console.log(seed, s, a, Date.now() - ts, "ms");
    const now = await look(p);
    const opened = a === "button" || a === "link" || a === "visit" || a === "app";
    /* opening: today's daily, solved board when done */
    if (opened && now.daily && now.daily.n !== now.n && !(before.daily && before.daily.mode === "play" && !before.done && before.daily.n === now.daily.n))
      fail("opening the daily opened another day's", { today: now.n, daily: now.daily });
    if ((a === "link" || a === "visit" || a === "app") && before.days[now.n] !== undefined && !(now.daily && now.daily.n === now.n && now.done && now.onDaily))
      fail("with today's done, a link or the app shows today's solved board", { today: now.n, daily: now.daily, done: now.done, onDaily: now.onDaily });
    if ((a === "link" || a === "visit" || a === "app") && before.days[now.n] !== undefined && now.shares > before.shares) fail("opening a finished daily opened a share sheet", {});
    /* freezes: none spent while a daily is being played */
    if (before.daily && before.daily.mode === "play" && !before.done && now.daily && now.daily.mode === "play" && !now.done && now.freezes < before.freezes)
      fail("a streak freeze was spent while the daily was being played", { before: before.freezes, now: now.freezes, a });
    /* the clock: still while paused or hidden */
    if ((a === "minutes" || a === "midnight") && before.daily && now.daily && before.spent !== null && now.spent !== null && (before.daily.paused || before.hidden) && now.spent > before.spent + 1)
      fail("the daily's clock ran while it was paused or hidden", { before: before.spent, now: now.spent, paused: before.daily.paused, hidden: before.hidden });
    /* results: a solved day stays solved; the day's card before any achievement */
    for (const [k, ok] of Object.entries(before.days)) if (ok && now.days[k] !== true) fail("a solved day lost its result", { day: k, now: now.days[k] });
    for (const [k, ok] of Object.entries(now.days)) if (ok && before.days[k] === undefined) solvedDays.add(+k);
    const newCards = now.cards.slice(before.cards.length);
    const finished = Object.keys(now.days).some(k => before.days[k] === undefined);
    if (finished && newCards.length && !/Daily puzzle #/.test(newCards[0]) && !/Paused/.test(newCards[0]))
      fail("a card came before the day's card", newCards);
    if (finished && now.days[now.daily ? now.daily.n : now.n] === true) {
      const n = now.daily ? now.daily.n : now.n, want = oracleStreak(solvedDays, n);
      if (now.streak !== want && !(now.freezes < before.freezes || before.freezes > 0)) fail("the streak isn't the days in a row solved", { day: n, streak: now.streak, want, solved: [...solvedDays].sort() });
    }
    /* a practice set or a rank streak keeps the normal game's puzzle waiting, untouched until it ends */
    if (!before.run && now.run) heldWaiting = before.waiting;
    if (before.run && now.run && heldWaiting && now.waiting !== heldWaiting)
      fail("a practice set or rank streak lost the normal game's waiting puzzle", { was: heldWaiting, now: now.waiting, run: now.run });
    if (errs.length) fail("the page threw", errs.slice(0, 3));
    before = now;
  }
  await ctx.close();
  return problems;
}

(async () => {
  const srv = await server.start(process.env.KW_ROOT || undefined), b = await chromium.launch(), t0 = Date.now();
  let bad = [];
  for (let i = 0; i < RUNS && !bad.length; i++) bad = bad.concat(await run(b, srv.url, SEED + i));
  await b.close(); srv.close();
  if (bad.length) {
    const x = bad[0];
    console.log(`FAIL ${x.what} (seed ${x.seed}, after step ${x.step}): ${JSON.stringify(x.detail)}`);
    console.log("  steps: " + x.trail.join(" "));
    console.log(`  again: node testing/daily-model.js 1 ${STEPS} ${x.seed}`);
  }
  console.log(`${RUNS} runs of ${STEPS} steps: ${bad.length ? "a rule broke" : "every rule held"} (${Math.round((Date.now() - t0) / 1000)} s)`);
  process.exit(bad.length ? 1 : 0);
})();
