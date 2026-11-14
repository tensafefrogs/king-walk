// Shared by the store screenshots, the header art and the trailers: a player partway up the ranks, and seeded
// random numbers so re-running on an unchanged game deals the same puzzles.

// Bishop rank, a climb in the chart, a streak going, two rank streaks cleared and one at 9; `to` is the rating it
// ends on. Deterministic.
function savedPlayer(to = 1112) {
  let a = 7; const rnd = () => (a = (a * 16807) % 2147483647) / 2147483647;
  const hist = [600]; let r = 600;
  for (let i = 0; i < 180; i++) { r += Math.round((rnd() - 0.36) * 34 * (i < 30 ? 1.6 : 1)); r = Math.max(560, r); hist.push(r); }
  const shift = to - hist[hist.length - 1];
  const h = hist.map((v, i) => Math.max(560, Math.round(v + shift * i / (hist.length - 1))));
  return { v: 2, updatedAt: Date.now(), cur: 0, sound: false, haptics: true, rateAsked: Date.now(), players: [{
    name: "Player 1", rating: h[h.length - 1], n: 180, solved: 117, streak: 4, best: 13, peak: Math.max(...h), hist: h,
    last: [1, 1, 0, 1, 1, 0.5, 1, 1, 1, 0, 1, 1, 1, 0.5, 1, 1, 0, 1, 1, 1], seen: {}, review: [], mode: "normal",
    since: Date.now() - 40 * 864e5, back: 7, runs: { p: 15, n: 15, b: 9 }, daily: dailyWeek() }] };
}
// six daily puzzles solved in a row up to the day before SHOT_DATE
function dailyWeek() {
  const n = dayNumber(SHOT_DATE), days = {}, marks = ["gg", "gyg", "g", "rg", "gg", "gyg"];
  for (let k = 1; k <= 6; k++) days[n - 7 + k] = { m: marks[k - 1], t: 40 + k * 17, ok: true };
  return { streak: 6, best: 6, last: n - 1, days };
}

// The date the store screenshots and trailers are set on (the page's clock is fixed to it), so the daily puzzle and its
// week are the same whenever they're made: Saturday 21 November 2026, Daily #8
const SHOT_DATE = new Date(2026, 10, 21, 10, 0);
const DAY = 864e5, dayNumber = d => Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(2026, 10, 14)) / DAY) + 1;

// An init script (page.addInitScript(seedRandom, seed)): Math.random becomes mulberry32 from this seed
function seedRandom(seed) {
  let a = seed;
  Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

module.exports = { savedPlayer, seedRandom, SHOT_DATE };
