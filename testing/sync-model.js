// Two devices sharing a save through iCloud, as a model: random interleavings of play, the app writing its save to
// iCloud (SaveStore.persist), iCloud delivering changes late, twice or an older one after a newer one, and the app
// coming back to the foreground (SaveStore.offerCloud, the page's kingWalkCloud). The rule deciding which save to keep
// is the page's own betterSave, read from index.html (SaveRank in Swift is held to it by testing/save-cases.json).
// What must hold: once nothing is left in flight and each device has heard the latest copy, both devices hold the same
// save, with as much progress as any device ever reached. Before fe15eb9 the newest write won, and a device with
// less progress could overwrite one with more (MODEL_RULE=newest shows the trace).
// usage: node testing/sync-model.js [runs, default 2000] [steps, default 40]      (under a second; parity.js runs it)
const fs = require("fs"), path = require("path"), vm = require("vm");
const RUNS = +process.argv[2] || 2000, STEPS = +process.argv[3] || 40;

/* the page's rule, from index.html */
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const grab = name => { const a = html.indexOf("function " + name + "("); if (a < 0) throw new Error(name + " not found in index.html"); let d = 0, i = html.indexOf("{", a); for (; i < html.length; i++) { if (html[i] === "{") d++; else if (html[i] === "}" && !--d) break; } return html.slice(a, i + 1); };
const page = vm.runInNewContext(grab("saveRank") + "\n" + grab("betterSave") + "\n({ betterSave })");
const RULES = { page: page.betterSave, newest: (a, b) => !b || (a && a.updatedAt > b.updatedAt) };
const better = RULES[process.env.MODEL_RULE || "page"];
if (!better) { console.log("MODEL_RULE is page or newest"); process.exit(2); }

function rng(seed) { return () => { seed |= 0; seed = seed + 0x6d2b79f5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const progress = s => s ? (s.players[0].n | 0) + Object.keys(s.players[0].daily.days).length : 0;
const copy = s => s && JSON.parse(JSON.stringify(s));

function run(seed) {
  const r = rng(seed), trail = [];
  let clock = 1000;
  const start = { v: 2, updatedAt: clock, players: [{ n: 3, since: 500, daily: { days: {} } }] };
  /* each device: the page's save (S), and its iCloud copy as iOS last gave it (cache); iCloud: the copy it holds, the
     writes on their way up, and the copies on their way down to each device */
  const dev = [0, 1].map(() => ({ S: copy(start), cache: copy(start) }));
  let cloud = copy(start), best = progress(start);
  const up = [], down = [[], []];
  const persist = d => {          /* SaveStore.persist: iCloud has a better save, give it to the page; else write */
    const me = dev[d];
    if (me.cache && better(me.cache, me.S)) { adopt(d, me.cache); return; }
    me.cache = copy(me.S); up.push({ from: d, save: copy(me.S) });
  };
  const adopt = (d, s) => {          /* the page's kingWalkCloud: keep it if better, which saves (and persists) again */
    const me = dev[d];
    if (s && better(s, me.S)) { me.S = copy(s); me.S.updatedAt = ++clock; persist(d); }
  };
  const ACTS = {
    play(d) { const me = dev[d]; me.S.players[0].n++; me.S.updatedAt = ++clock; best = Math.max(best, progress(me.S)); persist(d); },
    daily(d) { const me = dev[d], k = Object.keys(me.S.players[0].daily.days).length + 1; me.S.players[0].daily.days[k] = { m: "g", t: 30, ok: true }; me.S.updatedAt = ++clock; best = Math.max(best, progress(me.S)); persist(d); },
    upload() {          /* a write reaches iCloud (in any order); iCloud keeps the last to arrive, and tells the other device */
      if (!up.length) return; const w = up.splice(Math.floor(r() * up.length), 1)[0];
      cloud = copy(w.save); down[1 - w.from].push(copy(cloud));
    },
    deliver(d) {          /* iCloud's copy reaches a device: one of those on the way, maybe an older one, maybe twice */
      const q = down[d]; if (!q.length) return;
      const i = Math.floor(r() * q.length), s = r() < 0.2 ? q[i] : q.splice(i, 1)[0];
      dev[d].cache = copy(s); adopt(d, s);
    },
    foreground(d) { dev[d].cache = copy(cloud); adopt(d, cloud); },          /* back to the app: offerCloud */
  };
  const NAMES = ["play", "play", "play", "daily", "upload", "upload", "deliver", "deliver", "foreground"];
  for (let s = 0; s < STEPS; s++) {
    const a = NAMES[Math.floor(r() * NAMES.length)], d = r() < 0.5 ? 0 : 1;
    trail.push(a + (a === "upload" ? "" : d)); ACTS[a](d);
  }
  /* settle: everything in flight arrives, then each device comes back to the app until nothing changes */
  for (let k = 0; k < 20 && (up.length || down[0].length || down[1].length); k++) {
    while (up.length) ACTS.upload(); for (const d of [0, 1]) while (down[d].length) { const s = down[d].shift(); dev[d].cache = copy(s); adopt(d, s); }
  }
  for (let k = 0; k < 6; k++) { for (const d of [0, 1]) ACTS.foreground(d); while (up.length) ACTS.upload(); for (const d of [0, 1]) down[d].length = 0; }
  const p0 = progress(dev[0].S), p1 = progress(dev[1].S);
  if (p0 !== p1 || p0 < best) return { seed, best, devices: [p0, p1], icloud: progress(cloud), trail };
  return null;
}

let bad = null;
for (let i = 1; i <= RUNS && !bad; i++) bad = run(i);
if (bad) {
  console.log(`FAIL progress lost or the devices disagree (seed ${bad.seed}): the most any device reached ${bad.best}, the devices end with ${bad.devices.join(" and ")}, iCloud ${bad.icloud}`);
  console.log("  steps: " + bad.trail.join(" "));
}
console.log(`${RUNS} runs of ${STEPS} steps (rule: ${process.env.MODEL_RULE || "page"}): ${bad ? "a rule broke" : "every rule held"}`);
process.exit(bad ? 1 : 0);
