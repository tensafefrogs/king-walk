// The website, the iOS app and the Android app kept in step. Fast (no browser); GitHub runs it on every push (test.yml).
// It checks what a person would otherwise have to remember:
//   - every message the page sends an app (APP.post({op})) is handled by both apps, and the messages the apps' own
//     scripts send (the save, the clipboard) too; PLATFORM_ONLY lists the few that only one app needs
//   - the home screen widgets read the same fields on both (ios/Shared/Progress.swift, android/.../Progress.kt), and
//     the page sends each of them (reportProgress, dailyBoards in index.html)
//   - the Android app's own words are the iOS app's translations, as android/scripts/strings.py makes them
//   - the Android app offers the game's languages in the phone's settings (res/xml/locales_config.xml)
//   - every achievement the game awards is in Game Center's list (ios/store/gamecenter.json), which Google Play Games'
//     list is made from (android/store/playgames.py), and the other way round
//   - the iOS and Android apps carry the same version number (ios/release.json, android/release.json)
//   - nothing local or big is committed (videos go on the media branch)
//   - release.json and beta.json are as App Store Connect takes them
//   - the store scripts read App Store Connect's lists past their first page
//   - two devices sharing a save through iCloud lose no progress (testing/sync-model.js)
//   - release.py's TestFlight and submission steps hold up against a pretend App Store Connect
//   - the puzzle bands are unchanged (testing/puzzles.lock.json), as the daily and saves depend on them
//   - every stat the game sends is documented; the coach's kinds have names, descriptions and real themes
//   - no workflow pushes to main (main takes only commits whose tests passed first)
// usage: node testing/parity.js
const fs = require("fs"), path = require("path"), vm = require("vm"), { execFileSync } = require("child_process");
const ROOT = path.join(__dirname, "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
let good = 0, bad = 0;
const check = (ok, what, detail) => { if (ok) good++; else { bad++; console.log("FAIL", what, detail === undefined ? "" : JSON.stringify(detail)); } };
const diff = (a, b) => [...a].filter(x => !b.has(x));

const html = read("index.html");
const ios = read("ios/KingWalk/GameViewController.swift");
const android = read("android/app/src/main/java/kingwalk/android/MainActivity.kt");

// messages
const PLATFORM_ONLY = { lang: "android" };          // the phone's per-app language (Languages.kt); iOS has no page picker tie-in
// no workflow decides what to do from github.event.commits: commits reach main after their branch's Test run, so GitHub
// already has them and the push lists none (the Android release never ran on ec60285). Compare before and after instead
{ const uses = fs.readdirSync(path.join(ROOT, ".github/workflows")).filter(f => /event\.commits/.test(read(".github/workflows/" + f)));
  check(!uses.length, "no workflow reads github.event.commits (empty for commits already pushed to a branch)", uses); }
// the Android app's links (App Links) claim the game and its language pages only: the press kit, the policies and the
// site's other pages open in the browser. Android's pathPattern: "." is any one character
{ const man = read("android/app/src/main/AndroidManifest.xml"), f = man.slice(man.indexOf('autoVerify="true"'), man.indexOf("</intent-filter>", man.indexOf('autoVerify="true"')));
  const pats = [...f.matchAll(/android:path="([^"]+)"/g)].map(m => "^" + m[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$")
    .concat([...f.matchAll(/android:pathPattern="([^"]+)"/g)].map(m => "^" + m[1] + "$")).map(r => new RegExp(r));
  const claims = p => pats.some(r => r.test(p));
  const page = read("index.html"), langs = JSON.parse(page.match(/var LANGS = (\[[^\]]+\])/)[1]).filter(t => t !== "en");
  const variants = JSON.parse(read("scripts/langpages.py").match(/^VARIANTS = (\[[^\]]*\])/m)[1].replace(/'/g, '"'));
  const game = ["/"].concat(langs.concat(variants).map(t => `/${t}/`)), missed = game.filter(p => !claims(p));
  const other = ["/press/", "/privacy.html", "/terms.html", "/support.html", "/404.html", "/index.html"].concat(fs.readdirSync(ROOT).filter(d => !d.startsWith(".") && fs.statSync(path.join(ROOT, d)).isDirectory()).map(d => `/${d}/`)), taken = other.filter(claims);
  check(!missed.length && !taken.length, "the Android app opens the game's and language pages' links, and no other page's", { missed, taken }); }
// the website publishes its hidden files: .well-known/assetlinks.json (links that open the Android app) and .nojekyll;
// the Pages upload action drops anything starting with a dot unless include-hidden-files is on
check(/upload-pages-artifact@[\s\S]*?include-hidden-files:\s*true/.test(read(".github/workflows/pages.yml")), "the website build publishes .well-known (assetlinks.json)");
// the Android app never asks for the advertising ID (no ads; Google Play's Families program): its manifest removes the
// permission any library might add, and Play Console's answer is No. device.js checks the installed app too
{ const man = fs.readFileSync(path.join(ROOT, "android/app/src/main/AndroidManifest.xml"), "utf8");
  check(/<uses-permission android:name="com\.google\.android\.gms\.permission\.AD_ID" tools:node="remove" \/>/.test(man) && /xmlns:tools=/.test(man), "the Android app removes the advertising ID permission"); }
const NATIVE = ["set", "remove", "clear", "copy"];          // sent by the apps' own scripts (the save's copy, the clipboard)
const pageOps = new Set([...html.matchAll(/op: *"([a-z_]+)"/g)].map(m => m[1]));
const iosOps = new Set([...ios.matchAll(/case "([a-z_]+)"/g)].map(m => m[1]));
const androidOps = new Set([...android.matchAll(/^\s+"([a-z_]+)" ->/gm)].map(m => m[1]));
const want = new Set([...pageOps, ...NATIVE]);
check(!diff(want, iosOps).filter(o => PLATFORM_ONLY[o] !== "android").length, "the iOS app handles every message", diff(want, iosOps));
check(!diff(want, androidOps).filter(o => PLATFORM_ONLY[o] !== "ios").length, "the Android app handles every message", diff(want, androidOps));
check(!diff(iosOps, want).length && !diff(androidOps, want).length, "neither app waits for a message nothing sends",
  { ios: diff(iosOps, want), android: diff(androidOps, want) });

// the widgets' data
const block = (src, start, end) => { const a = src.indexOf(start); return a < 0 ? "" : src.slice(a, src.indexOf(end, a)); };
const swiftFields = body => new Set([...body.matchAll(/^\s+var (\w+):[^{\n]*$/gm)].map(m => m[1]));          // stored, not worked out
const kotlinFields = body => new Set([...body.matchAll(/^\s+val (\w+):/gm)].map(m => m[1]));
const swift = read("ios/Shared/Progress.swift"), kotlin = read("android/app/src/main/java/kingwalk/android/Progress.kt");
for (const [name, swiftEnd, kotlinEnd] of [["Progress", "static let key", ") {"], ["DailyBoard", "///", ") {"]]) {
  const s = swiftFields(block(swift, "struct " + name + ":", swiftEnd)), k = kotlinFields(block(kotlin, "data class " + name + "(", kotlinEnd));
  check(s.size > 3 && diff(s, k).length === 0 && diff(k, s).length === 0, `the widgets read the same ${name} fields on iOS and Android`,
    { onlyIOS: diff(s, k), onlyAndroid: diff(k, s) });
  const sent = block(html, "function reportProgress", "/* ---------- ") ;
  const missing = [...s].filter(f => !new RegExp("\\b" + f + "\\b\\s*[:,}=]").test(sent));
  check(!missing.length, `the page sends every ${name} field the widgets read`, missing);
}

// the Android app's own words, from the iOS app's translations
try {
  execFileSync("python3", [path.join(ROOT, "android/scripts/strings.py")], { stdio: "pipe" });
  const changed = execFileSync("git", ["status", "--porcelain", "--", "android/app/src/main/res"], { cwd: ROOT }).toString().trim();
  check(!changed, "the Android app's strings are the iOS app's translations (python3 android/scripts/strings.py, then commit)", changed.split("\n").slice(0, 5));
} catch (e) { check(false, "android/scripts/strings.py runs", e.message.split("\n")[0]); }

// the phone's language list for the Android app
const names = Object.keys(vm.runInNewContext("(" + html.match(/const LANG_NAMES = (\{[\s\S]*?\});/)[1] + ")"));
const phone = { es: "es-419", pt: "pt-BR", zh: "zh-Hans" };
const inConfig = [...read("android/app/src/main/res/xml/locales_config.xml").matchAll(/<locale android:name="([^"]+)"/g)].map(m => m[1]);
check(names.map(t => phone[t] || t).join() === inConfig.join(), "the Android app offers the game's languages in the phone's settings", { names, inConfig });

// achievements: the game's, Game Center's and (made from it) Google Play Games'
const gc = JSON.parse(read("ios/store/gamecenter.json"));
const gcIds = new Set(gc.achievements.map(a => a.id));
const ranks = vm.runInNewContext("(" + html.match(/const RANKS = (\[[\s\S]*?\]);/)[1] + ")");
const awardSrc = block(html, "const AWARDS = {", "\n}") + block(html, "const AWARDS = {", "function ");
const CELEBRATION_ONLY = ["freeze_used"];          // a celebration screen, not something earned
const gameIds = new Set([...awardSrc.matchAll(/^\s+(\w+): \[/gm)].map(m => m[1]).filter(id => !CELEBRATION_ONLY.includes(id)));
ranks.forEach((r, i) => { if (i) gameIds.add("rank_" + r[1].toLowerCase()); gameIds.add("clear_" + r[1].toLowerCase()); });
check(gameIds.size > 10 && !diff(gameIds, gcIds).length && !diff(gcIds, gameIds).length, "every award is a Game Center and Play Games achievement, and the other way round",
  { onlyGame: diff(gameIds, gcIds), onlyGameCenter: diff(gcIds, gameIds) });
const boards = new Set([...html.matchAll(/board: "(\w+)"/g)].map(m => m[1]).filter(b => !b.endsWith("_")));
html.includes('board: "streak_" + rk[2]') && "pnbrqk".split("").forEach(p => boards.add("streak_" + p));
const gcBoards = new Set(gc.leaderboards.map(l => l.id));
check(!diff(boards, gcBoards).length, "every leaderboard the game reports to is in Game Center's list", diff(boards, gcBoards));
check(fs.readdirSync(path.join(ROOT, "ios/store/gamecenter")).length >= gcIds.size + gcBoards.size, "every achievement and leaderboard has its picture (ios/store/gamecenter/, for both stores)");

// the videos aren't in main (scripts/media.py): a workflow that uploads store material or builds the site fetches them
for (const f of fs.readdirSync(path.join(ROOT, ".github/workflows"))) {
  const wf = read(".github/workflows/" + f);
  if (/upload_listing|release\.py release|creative\.py|cp -R[^\n]*\bpress\b/.test(wf))
    check(/scripts\/media\.py fetch/.test(wf), `${f} fetches the videos before it uses them (python3 scripts/media.py fetch)`);
}

// main takes only commits whose tests passed on another branch first (the repository's rules), which a workflow's own
// commit can't do: a workflow pushes only to its own branch (status, media, android-screenshots), named in the push
for (const f of fs.readdirSync(path.join(ROOT, ".github/workflows"))) {
  const pushes = [...read(".github/workflows/" + f).matchAll(/git push[^\n]*/g)].map(m => m[0]);
  const bad = pushes.filter(l => !/\S+:(refs\/heads\/)?([\w.-]+)/.test(l) || /:(refs\/heads\/)?main\b/.test(l));
  check(!bad.length, `${f} pushes only to its own branch, never main (push to HEAD:<branch>, as scripts/status.py does; main refuses commits whose tests haven't passed)`, bad);
}

// what git holds: nothing local (agent worktrees, Python caches) and nothing big. The videos live on the media branch
// (scripts/media.py); a large file in main stays in every clone for good (main's history once reached 1 GB of them)
const MAX_MB = 5;          // the biggest legitimate files are the store header art, about 4.4 MB
const tracked = execFileSync("git", ["ls-files", "-s", "-z"], { cwd: ROOT }).toString().split("\0").filter(Boolean)
  .map(l => { const [meta, file] = l.split("\t"); return { mode: meta.split(" ")[0], file }; });
const local = tracked.filter(t => t.mode === "160000" || /(^|\/)(\.claude|__pycache__|node_modules|\.gradle)\/|\.pyc$|\.DS_Store$/.test(t.file)).map(t => t.file);
check(!local.length, "nothing local is committed (git rm --cached it and add it to .gitignore)", local);
const videos = tracked.filter(t => /\.(mp4|mov|m4v|webm)$/i.test(t.file)).map(t => t.file);
check(!videos.length, "no videos in main: they go on the media branch (python3 scripts/media.py publish; add the path to its FILES)", videos);
const big = tracked.filter(t => t.mode !== "160000" && fs.existsSync(path.join(ROOT, t.file)) && fs.statSync(path.join(ROOT, t.file)).size > MAX_MB * 1048576).map(t => t.file);
check(!big.length, `no file in main is over ${MAX_MB} MB (make it smaller, or put it on the media branch with scripts/media.py)`, big);

// ios/release.json and beta.json as App Store Connect will take them (ios/store/release_config.py, which release.py
// reads them through): no emoji in the notes, no unknown settings, What's New for every language
try { execFileSync("python3", ["-I", path.join(ROOT, "ios/store/release_config.py")], { stdio: "pipe" }); check(true); }
catch (e) { check(false, "ios/release.json and ios/beta.json are as App Store Connect takes them (python3 ios/store/release_config.py)", e.stdout.toString().trim().split("\n")); }

// App Store Connect lists read past their first page (asc.all_pages), as ios/store/check_pages.py checks
try { execFileSync("python3", ["-I", path.join(ROOT, "ios/store/check_pages.py")], { stdio: "pipe" }); check(true); }
catch (e) { check(false, "the store scripts read App Store Connect's lists to the end (python3 ios/store/check_pages.py)", e.stdout.toString().trim().split("\n")); }

// two devices sharing a save through iCloud, as a model (testing/sync-model.js): no progress lost, under a second
try { execFileSync("node", [path.join(ROOT, "testing/sync-model.js")], { stdio: "pipe" }); check(true); }
catch (e) { check(false, "two devices' saves: no progress lost through iCloud (node testing/sync-model.js)", e.stdout.toString().trim().split("\n")); }

// release.py against a pretend App Store Connect (ios/store/release_model.py): queued versions keep a build, and a
// submission waits for screenshots to process; a request the model doesn't know fails it, so it moves with release.py
try { execFileSync("python3", ["-I", path.join(ROOT, "ios/store/release_model.py")], { stdio: "pipe" }); check(true); }
catch (e) { check(false, "release.py keeps every queued version's build and waits for processing (python3 ios/store/release_model.py)", (e.stdout.toString() + e.stderr.toString()).trim().split("\n").slice(-4)); }

// the puzzles: the daily puzzle and saves find a puzzle by its band, its place in the band and the band's size, and the
// app versions already out pick the daily from their own copy of p/. Any change to a band (order, count, a puzzle's
// moves) makes the website and those apps disagree on the day's puzzle, so each band's content is locked here
const LOCK = path.join(ROOT, "testing/puzzles.lock.json");
const bandsNow = {};
for (const b of fs.readdirSync(path.join(ROOT, "p")).filter(d => /^\d+$/.test(d)).sort((a, b) => a - b)) {
  const files = fs.readdirSync(path.join(ROOT, "p", b)).filter(f => /^\d+\.txt$/.test(f)).sort((x, y) => parseInt(x) - parseInt(y));
  const lines = files.map(f => read(`p/${b}/${f}`)).join("").split("\n").filter(Boolean);
  bandsNow[b] = { n: lines.length, sha256: require("crypto").createHash("sha256").update(lines.join("\n")).digest("hex").slice(0, 16) };
}
if (process.argv.includes("--lock-puzzles")) { fs.writeFileSync(LOCK, JSON.stringify(bandsNow, null, 1) + "\n"); console.log("puzzles locked:", LOCK); }
const locked = fs.existsSync(LOCK) ? JSON.parse(fs.readFileSync(LOCK, "utf8")) : {};
const moved = Object.keys({ ...locked, ...bandsNow }).filter(b => JSON.stringify(locked[b]) !== JSON.stringify(bandsNow[b]));
check(!moved.length, "the puzzle bands are as the apps already out have them: a changed band (order, count or a puzzle) gives the website a " +
  "different daily puzzle from those apps, and moves saves and second tries to other puzzles. If the change is meant (with a plan for the " +
  "apps), run node testing/parity.js --lock-puzzles and say so in the commit", moved.map(b => ({ band: b, locked: locked[b], now: bandsNow[b] })));

// every stat the game sends is documented: each track() event name (or its fixed start, before a value is added) is in
// testing/STATS.md and in README.md's list, as CLAUDE.md asks. The names: the string at the start of a track() call
// and at each branch of a ?: inside it
const events = new Set();
for (const m of html.matchAll(/\btrack\(([^;\n]*?)\)(?:;|\s*[,}])/g)) {
  const arg = m[1];
  for (const lit of arg.matchAll(/(?:^|\?\s*|:\s*)"([^"]+)"/g)) events.add(lit[1]);
}
const statsDoc = read("testing/STATS.md"), readme = read("README.md");
const undocumented = [...events].filter(e => !statsDoc.includes("`" + e.replace(/\/$/, "/")) && !statsDoc.includes("`" + e));
const notInReadme = [...events].filter(e => !readme.includes("`" + e));
check(events.size > 30 && !undocumented.length, "every stat the game sends is described in testing/STATS.md (add a row for it)", undocumented);
check(!notInReadme.length, "every stat the game sends is in README.md's list of events", notInReadme);

// the coach's kinds of puzzle: each has a name and a description for the player, and every Lichess theme it maps is
// one the puzzles really carry (a misspelt theme would map nothing, silently)
const areasSrc = block(html, "const AREAS = {", "};");
const areaIds = [...areasSrc.matchAll(/^\s*(?:,\s*)?(\w+): \[|,\s*(\w+): \[/gm)].map(m => m[1] || m[2]).filter(Boolean);
const areaTags = [...areasSrc.matchAll(/"(\w+)"/g)].map(m => m[1]);
const named = new Set([...block(html, "const AREA_NAME = {", "};").matchAll(/(\w+): \(\) => T\(/g)].map(m => m[1]));
const described = new Set([...block(html, "const AREA_DESC = {", "};").matchAll(/(\w+): \(\) => T\(/g)].map(m => m[1]));
check(areaIds.length === 15 && areaIds.every(a => named.has(a) && described.has(a)) && named.size === areaIds.length && described.size === areaIds.length,
  "every kind of puzzle the coach knows has a name and a description, and nothing else does", { areaIds, named: [...named], described: [...described] });
const themesSeen = new Set();
for (const b of fs.readdirSync(path.join(ROOT, "p")).filter(d => /^\d+$/.test(d)))
  for (const f of fs.readdirSync(path.join(ROOT, "p", b))) for (const line of read(`p/${b}/${f}`).split("\n")) { const t = line.split("\t")[4]; if (t) for (const x of t.split(" ")) themesSeen.add(x); }
const unknownTags = areaTags.filter(t => !themesSeen.has(t));
check(!unknownTags.length, "every Lichess theme the coach maps is one the puzzles carry", unknownTags);

// the Android app's release notes never name other apps either (as release_config.py checks the iOS ones)
{ const notes = String(JSON.parse(read("android/release.json")).notes || ""), named = ["Duolingo", "Wordle", "Lichess", "Chess.com", "Chessable", "ChessKid"].filter(a => notes.toLowerCase().includes(a.toLowerCase()));
  check(!named.length, "android/release.json's notes don't name other apps or sites", named); }

// one version number for both apps
const iv = JSON.parse(read("ios/release.json")).version, av = JSON.parse(read("android/release.json")).version;
check(iv === av, "the iOS and Android apps have the same version number (ios/release.json, android/release.json)", { ios: iv, android: av });

console.log(`${good} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
