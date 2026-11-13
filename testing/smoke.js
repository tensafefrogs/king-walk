// Plays a few puzzles in a browser and checks the game works on the web and inside the iOS app.
// The app is simulated: window.webkit.messageHandlers.kingwalk records what the page sends to it.
// usage: node testing/smoke.js            Needs Playwright (npm i -g playwright, or the one in this environment).
const { chromium } = require("playwright");
const server = require("./server");

async function solve(p) {          // play the listed solution for the player's moves
  await p.waitForFunction(() => typeof locked !== "undefined" && !locked && !done, null, { timeout: 15000 });
  while (await p.evaluate(() => !done)) {
    await p.waitForFunction(() => done || !locked, null, { timeout: 15000 });
    if (await p.evaluate(() => done)) break;
    const m = await p.evaluate(() => cur.pz.moves[idx]);
    if (m.length > 4) await p.evaluate(m => commit(m.slice(0, 2), m.slice(2, 4), m[4]), m);
    else for (const sq of [m.slice(0, 2), m.slice(2, 4)]) {          // tap the piece, then the square, like a player
      const box = await p.evaluate(sq => { const r = sqEls[sq].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sq);
      await p.mouse.click(box.x, box.y); await p.waitForTimeout(60);
    }
    await p.waitForTimeout(150);
  }
}

async function run(b, url, app) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage(), errs = [];
  p.on("pageerror", e => errs.push(e.message)); p.on("console", m => { if (m.type() === "error" && !/ERR_FAILED/.test(m.text())) errs.push(m.text()); });   // ERR_FAILED: the stats script, blocked here
  await p.route(/zgo\.at|goatcounter/, r => r.abort());
  if (app) await p.addInitScript(() => {
    window.sent = [];
    window.webkit = { messageHandlers: { kingwalk: { postMessage: m => window.sent.push(JSON.parse(JSON.stringify(m))) } } };
    window.kingWalkApp = { platform: "iphone", gameCenter: true, widget: true };
  });
  await p.goto(url);
  for (let i = 0; i < 3; i++) { await solve(p); await p.evaluate(() => $("nextBtn").click()); }
  const r = await p.evaluate(() => ({ n: me().n, solved: me().solved, rating: me().rating, haptics: !$("hapticsRow").hidden, gc: !$("gcRow").hidden,
    sent: window.sent ? window.sent.map(m => m.op + (m.kind ? ":" + m.kind : m.id ? ":" + m.id : m.board ? ":" + m.board : "")) : null, help: $("helpSaved").textContent }));
  // a wrong move, a hint and the answer
  await p.waitForFunction(() => !locked && !done, null, { timeout: 15000 });
  await p.evaluate(() => {
    const want = cur.pz.moves[idx];
    for (const f of "abcdefgh") for (let k = 1; k <= 8; k++) { const sq = f + k, pc = game.get(sq);
      if (pc && pc.color === orient) for (const m of game.moves({ square: sq, verbose: true })) if (m.from + m.to !== want.slice(0, 4) && !m.flags.includes("p")) {
        const g = new Chess(game.fen()); g.move(m); if (!g.in_checkmate()) { tryMove(m.from, m.to); return; } } }
  });
  await p.waitForTimeout(1200);
  await p.evaluate(() => showHint()); await p.evaluate(() => showAnswer());
  await p.waitForFunction(() => done, null, { timeout: 20000 });
  const after = await p.evaluate(() => ({ n: me().n, streak: me().streak, review: me().review.length, sent: window.sent ? window.sent.map(m => m.op + (m.kind ? ":" + m.kind : "")) : null }));
  await ctx.close();
  return { r, after, errs };
}

(async () => {
  const srv = await server.start(), b = await chromium.launch();
  let bad = 0;
  for (const app of [false, true]) {
    const { r, after, errs } = await run(b, srv.url, app);
    const name = app ? "iOS app (simulated)" : "web";
    const check = (ok, what) => { if (!ok) { bad++; console.log("FAIL", name, what); } };
    check(r.n === 3 && r.solved === 3, "three puzzles solved: " + JSON.stringify(r));
    check(r.rating > 600, "rating went up");
    check(after.n === 4 && after.streak === 0 && after.review === 1, "a missed puzzle counts as a miss and comes back: " + JSON.stringify(after));
    check(!errs.length, "no page errors: " + errs.join(" | "));
    if (app) {
      for (const op of ["haptic:pick", "haptic:move", "haptic:opp", "haptic:solve", "score:rating", "score:streak", "achieve:first_solve", "widget"]) check(r.sent.includes(op), "sent " + op);
      for (const op of ["haptic:wrong", "haptic:hint"]) check(after.sent.includes(op), "sent " + op);
      check(r.haptics && r.gc, "Haptics and Game Center rows shown");
      check(/iCloud/.test(r.help), "the help text mentions iCloud");
    } else {
      check(!r.gc, "no Game Center row on the web");
    }
    console.log(name, "rating", r.rating, app ? "messages " + [...new Set(r.sent)].join(", ") : "");
  }
  await b.close(); srv.close();
  console.log(bad ? bad + " failed" : "all passed");
  process.exit(bad ? 1 : 0);
})();
