// Plays the real Android app on a device or emulator (adb) and checks the parts only the app has: the page talks to the
// app, progress survives the app being closed and its WebView storage being lost (the copy SaveStore keeps, which the
// Google backup takes), the home screen widgets get the progress, the back gesture closes the menu, reminders are
// scheduled, and the screen looks right.
// The GitHub workflow (.github/workflows/android.yml) runs it on an emulator after each build.
// usage: node android/testing/device.js <app-debug.apk> [screenshots folder]   (a debug build: its WebView can be inspected)
const { _android } = require("playwright");
const fs = require("fs"), path = require("path");

const apk = process.argv[2], out = process.argv[3] || path.join(__dirname, "out");
const PKG = process.env.ANDROID_APPLICATION_ID || "kingwalk.android.dev", ACTIVITY = PKG + "/kingwalk.android.MainActivity";
fs.mkdirSync(out, { recursive: true });
let bad = 0;
/* a picture of the game: drawn by the WebView itself (Chromium's own capture), not the emulator's screen capture,
   which stopped the CI emulator more than once. It shows the page without Android's status and navigation bars. */
const shot = name => live().then(p => p.screenshot({ path: path.join(out, name) })).catch(e => console.log("note no picture " + name + ": " + e.message.split("\n")[0]));
let last = "starting";          // the last check that finished, for a run that stops answering
const check = (ok, what, detail = "") => { console.log((ok ? "ok   " : "FAIL ") + what + (ok || !detail ? "" : ": " + detail)); if (!ok) bad++; last = what; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let page, attach;
/** the page to talk to: if the WebView loaded the game again (the app does after its renderer restarts), the new one */
async function live() {
  if (page && page.isClosed()) {
    console.log("note the game's page loaded again in the WebView: carrying on with the new one");
    page = await attach();
    page.on("pageerror", e => errs.push(e.message));
  }
  return page;
}
const errs = [];
/** whether fn becomes true on the page within 10 seconds (the phone turning or changing theme takes a moment) */
const until = fn => live().then(p => p.waitForFunction(fn, null, { timeout: 10000 })).then(() => true, () => false);

let device;
// the whole run takes about 4 minutes: if it's still going after 12, something hangs (adb, the emulator, a page that
// never answers), so say where, show the phone's log and stop, rather than wait for GitHub's limit
setTimeout(async () => {
  console.log(`FAIL the run stopped answering after "${last}"`);
  await report();
  process.exit(1);
}, 12 * 60 * 1000);
/** what the phone saw: the app's crash, if any, its last log lines, and the screen (each step given 20 seconds) */
async function report() {
  if (!device) return;
  const within = p => Promise.race([p, new Promise(r => setTimeout(() => r(""), 20000))]);
  const sh = c => within(device.shell(c).then(b => b.toString(), () => ""));
  console.log("--- crash log\n" + (await sh("logcat -d -b crash")).slice(-6000));
  console.log("--- the app's log\n" + (await sh(`logcat -d -t 400 | grep -iE "${PKG}|chromium|webview|AndroidRuntime"`)).slice(-8000));
  await within(device.screenshot({ path: path.join(out, "failed.png") }).catch(() => {}));
}
(async () => {
  [device] = await _android.devices();
  if (!device) throw new Error("no device: start an emulator or connect a phone (adb devices)");
  console.log("device:", device.model(), device.serial());
  const sh = async c => (await device.shell(c)).toString();
  await device.installApk(fs.readFileSync(apk));
  await sh(`pm clear ${PKG}`);
  // notifications allowed up front: the permission dialog is Android's, not the game's
  await sh(`pm grant ${PKG} android.permission.POST_NOTIFICATIONS`).catch(() => {});

  /* start the app and attach to its page. Right after the phone's per-app language changes and the app is stopped,
     Playwright sometimes never sees the new WebView (twice in November 2026, at the German step, with nothing in the
     app's log): then stop it and start it once more. A page that does open is still checked as before */
  /* Each try has 90 seconds: sometimes (about half the runs in late November 2026, at any of the restarts) neither the
     WebView nor its page ever answers and nothing throws, so a try that hangs is given up on like one that fails */
  const OPEN_LIMIT = 90 * 1000, OPEN_TRIES = 3;
  const limit = (p, ms, what) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error(`Timeout: ${what} took over ${ms / 1000} s`)), ms))]);
  const open = async (how = `-n ${ACTIVITY}`) => {
    for (let tries = 1; ; tries++) {
      try {
        await limit(sh(`am start -W ${how}`), 30000, "starting the app");
        return await limit(attach(), OPEN_LIMIT, "the app's page getting ready");
      } catch (e) {
        if (tries >= OPEN_TRIES || !/Timeout/i.test(e.message)) throw e;
        console.log(`note: ${e.message}; stopping the app and starting it again (try ${tries + 1} of ${OPEN_TRIES})`);
        await limit(sh(`am force-stop ${PKG}`), 30000, "stopping the app").catch(() => {}); await sleep(3000);
      }
    }
  };
  /** the game's page in the app's WebView, once it's ready */
  attach = async () => {
    // the app closed a moment ago can still be listed: if the page found is that one (it closes under us), look again
    for (let tries = 1; ; tries++) {
      const view = await device.webView({ pkg: PKG }, { timeout: 40000 });
      const page = await view.page();
      try {
        // a puzzle ready to play, or today's daily already played (it opens on its result)
        await page.waitForFunction(() => typeof locked !== "undefined" && typeof cur !== "undefined" && cur && (!locked || (typeof DAILY !== "undefined" && DAILY)), null, { timeout: 40000 });
        return page;
      } catch (e) {
        if (tries >= 4 || !/closed/.test(e.message)) throw e;
        await sleep(2000);
      }
    }
  };
  page = await open();
  page.on("pageerror", e => errs.push(e.message));
  const app = await (await live()).evaluate(() => ({ os: APP && APP.os, platform: PLATFORM, reminders: APP && APP.reminders, help: $("helpSaved").textContent, viewport: document.querySelector("meta[name=viewport]").content }));
  check(app.os === "android" && /^android-|chromeos/.test(app.platform), "the page runs as the Android app", JSON.stringify(app));
  check(/Google/.test(app.help), "the help mentions the Google backup", app.help);
  await shot("1-start.png");

  // solve one puzzle with taps on the screen, like a player
  const solve = async () => {
    while (!(await (await live()).evaluate(() => done))) {
      await page.waitForFunction(() => done || !locked, null, { timeout: 20000 });
      if (await (await live()).evaluate(() => done)) break;
      const m = await (await live()).evaluate(() => cur.pz.moves[idx]);
      if (m.length > 4) await (await live()).evaluate(m => commit(m.slice(0, 2), m.slice(2, 4), m[4]), m);
      else for (const sq of [m.slice(0, 2), m.slice(2, 4)]) {          // tap the piece, then the square
        const box = await (await live()).evaluate(sq => { const r = sqEls[sq].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sq);
        await page.mouse.click(box.x, box.y); await sleep(80);
      }
      await sleep(300);
    }
  };
  await solve();
  await sleep(1500);
  await shot("2-solved.png");
  // a celebration may be showing (the first solve): the back gesture closes it
  if (await (await live()).evaluate(() => !!document.querySelector(".cele:not(.out)"))) {
    await sh("input keyevent KEYCODE_BACK"); await sleep(800);
    check(await (await live()).evaluate(() => !document.querySelector(".cele:not(.out)")), "back closes the celebration");
  }
  const n1 = await (await live()).evaluate(() => me().n);
  check(n1 >= 1, "a puzzle was played", String(n1));

  // the save reaches the app's copy (SaveStore: shared_prefs/save.xml, which the backup takes)
  await sleep(500);
  const prefs = await sh(`run-as ${PKG} cat shared_prefs/save.xml`);
  check(/chess-climb-v1/.test(prefs), "the save is copied to save.xml", prefs.slice(0, 200));

  // the home screen widgets: the progress reaches the app (Widgets.kt keeps it in widget.xml), with today's board,
  // and the phone knows both widgets (placing them on a home screen is the launcher's, not tried here)
  const rating = await (await live()).evaluate(() => me().rating);
  let widget = "";
  for (let i = 0; i < 10 && !/dailyBoards/.test(widget); i++) {          // the boards come once today's puzzles are loaded
    await sleep(500);
    widget = await sh(`run-as ${PKG} cat shared_prefs/widget.xml`).catch(() => "");
  }
  check(new RegExp(`rating&quot;:${rating}\\b|"rating":${rating}\\b`).test(widget) && /dailyBoards/.test(widget), "the widgets get the progress and today's board", widget.slice(0, 300));
  const providers = await sh("dumpsys appwidget");
  const offered = name => providers.split("\n").some(l => l.includes(PKG + "/") && l.includes(name));
  check(offered("ProgressWidget") && offered("DailyWidget"),
    "both widgets are offered", providers.split("\n").filter(l => l.includes(PKG)).slice(0, 4).join(" | "));

  // the menu: open it, then back closes it and the app stays open
  await (await live()).evaluate(() => { if (!$("menu").classList.contains("open")) $("menuBtn").click(); }); await sleep(600);
  check(await (await live()).evaluate(() => $("menu").classList.contains("open")), "the menu opens");
  await shot("3-menu.png");
  await sh("input keyevent KEYCODE_BACK"); await sleep(800);
  check(await (await live()).evaluate(() => !$("menu").classList.contains("open")), "back closes the menu");
  const top = await sh("dumpsys activity activities | grep -E 'topResumedActivity|mResumedActivity' | head -1");
  check(top.includes(PKG), "the app is still in front after back closed the menu", top.trim());

  // the daily reminder: turn it on, and alarms are set for the coming days
  await (await live()).evaluate(() => { const s = $("remindSel"); s.value = String([...s.options].map(o => o.value).find(v => +v >= 0)); s.dispatchEvent(new Event("change", { bubbles: true })); });
  await sleep(1500);
  const alarms = await sh(`dumpsys alarm | grep -c "${PKG}"`).catch(() => "0");
  check(parseInt(alarms, 10) > 0, "reminders are scheduled", alarms.trim());

  // closed and opened again: the same progress
  await sh(`am force-stop ${PKG}`);
  page = await open();
  check(await (await live()).evaluate(() => me().n) === n1, "progress is there after the app is closed and opened again");

  // the WebView's own storage lost (as after a restore from Google backup, which brings only save.xml): progress comes back
  await sh(`am force-stop ${PKG}`);
  await sh(`run-as ${PKG} rm -rf app_webview/Default/Local\\ Storage app_webview/Local\\ Storage`);
  page = await open();
  check(await (await live()).evaluate(() => me().n) === n1, "progress comes back from the app's copy when the WebView's storage is empty");
  await shot("4-restored.png");

  // a reminder's tap opens the daily puzzle
  await sh(`am start -W -n ${ACTIVITY} --es open daily`);
  await sleep(2500);
  check(await (await live()).evaluate(() => typeof DAILY !== "undefined" && !!DAILY), "a reminder's tap opens the daily puzzle");
  await shot("5-daily.png");

  // larger text: the page is laid out at the phone's font size
  await sh("settings put system font_scale 1.3"); await sleep(2500);
  const vp = await (await live()).evaluate(() => document.querySelector("meta[name=viewport]").content);
  check(/initial-scale=1\.3/.test(vp), "the page follows the phone's font size", vp);
  check(await (await live()).evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "nothing runs off the side at a bigger font size");
  await shot("6-big-text.png");
  await sh("settings put system font_scale 1.0");

  // the page fits: no sideways scrolling, the whole board on screen
  const fits = () => page.evaluate(() => {
    const b = document.querySelector(".board, #board").getBoundingClientRect();
    return { sideways: document.documentElement.scrollWidth > window.innerWidth + 1, board: Math.round(b.width), w: window.innerWidth, h: window.innerHeight,
      boardOn: b.left >= -1 && b.right <= window.innerWidth + 1 };
  });
  const fitCheck = async what => { const f = await fits(); check(!f.sideways && f.boardOn && f.board > 150, what, JSON.stringify(f)); };

  // Remove animations (Settings → Accessibility; the emulator here starts with animations off): the page moves less
  // (the app tells it: the WebView doesn't pass the setting on as prefers-reduced-motion)
  const reduced = await (await live()).evaluate(() => REDUCED && document.documentElement.classList.contains("reduce-motion"));
  const scale = (await sh("settings get global animator_duration_scale")).trim();
  check(reduced === (parseFloat(scale) === 0), "the page's reduced motion follows Remove animations", `scale ${scale}, reduce ${reduced}`);

  // the language: picked in the game, it's the phone's per-app language for the app (Settings, Apps, King Walk,
  // Language), and the app opens again in it; set there, the game follows
  await (await live()).evaluate(() => { const s = $("langSel"); s.value = "fr"; s.dispatchEvent(new Event("change", { bubbles: true })); });
  await sleep(4000);
  const appLocale = await sh(`cmd locale get-app-locales ${PKG}`);
  check(/\bfr\b/.test(appLocale), "a language picked in the game becomes the app's language on the phone", appLocale.trim());
  await sh(`am force-stop ${PKG}`); page = await open(); page.on("pageerror", e => errs.push(e.message));
  check(await (await live()).evaluate(() => LANG === "fr" && $("langSel").value === "fr"), "the game opens in it", await (await live()).evaluate(() => LANG + " " + $("langSel").value));
  await sh(`cmd locale set-app-locales ${PKG} --locales de-DE`); await sleep(2000);
  await sh(`am force-stop ${PKG}`); page = await open(); page.on("pageerror", e => errs.push(e.message));
  check(await (await live()).evaluate(() => LANG === "de" && $("langSel").value === "de"), "a language set in the phone's settings is the game's", await (await live()).evaluate(() => LANG + " " + $("langSel").value));
  await shot("11-german.png");
  await sh(`cmd locale set-app-locales ${PKG} --locales ""`); await sleep(2000);
  await sh(`am force-stop ${PKG}`); page = await open(); page.on("pageerror", e => errs.push(e.message));
  check(await (await live()).evaluate(() => LANG === "en" && $("langSel").value === ""), "and back to the phone's own", await (await live()).evaluate(() => LANG + " " + $("langSel").value));

  // the Quick Settings tile is there to add
  const tile = await sh(`dumpsys package ${PKG} | grep -c "android.service.quicksettings.action.QS_TILE"`).catch(() => "0");
  check(parseInt(tile, 10) > 0, "the Today's puzzle Quick Settings tile is offered", tile.trim());

  // no advertising ID: the app is in Google Play's Families program and says No to it in Play Console (the manifest removes
  // the permission, so no library can bring it in)
  const adId = await sh(`dumpsys package ${PKG} | grep -c "permission.AD_ID"`).catch(() => "0");
  check(parseInt(adId, 10) === 0, "the app doesn't ask for the advertising ID", adId.trim());

  // the app shortcut (touch and hold the icon): Today's puzzle
  const shortcuts = await sh(`dumpsys shortcut | grep -A3 "Package: ${PKG}" | head -20; dumpsys shortcut | grep -c "id=daily"`);
  check(/[1-9]\s*$/.test(shortcuts), "the Today's puzzle shortcut is published", shortcuts.trim().slice(-300));
  // (from a closed app, which opens on the ordinary puzzles)
  await sh(`am force-stop ${PKG}`);
  page = await open(`-a kingwalk.android.OPEN --es open daily -p ${PKG}`);
  page.on("pageerror", e => errs.push(e.message));
  await sleep(2500);
  check(await (await live()).evaluate(() => typeof DAILY !== "undefined" && !!DAILY), "the shortcut opens the daily puzzle");

  // a shared daily puzzle's link (the website's address, #daily) opens the app on it (App Links; on a phone Android
  // sends such links to the app once the site's assetlinks.json names it, here the test names the app itself)
  if (process.env.SITE_URL) {
    await sh(`am force-stop ${PKG}`);
    page = await open(`-a android.intent.action.VIEW -c android.intent.category.BROWSABLE -d "${process.env.SITE_URL.replace(/\/?$/, "/")}#daily" -p ${PKG}`);
    page.on("pageerror", e => errs.push(e.message));
    await sleep(2500);
    check(await (await live()).evaluate(() => typeof DAILY !== "undefined" && !!DAILY), "a link to the daily puzzle opens it in the app");
  }

  check(!errs.length, "no page errors", errs.join(" | "));

  // last, as the emulator on GitHub's machines sometimes stops while it redraws the screen for a change (turning,
  // dark mode, wm size): if the emulator itself is gone, that's reported, not counted against the app
  try {
    // sideways: the app turns with the phone (no orientation is locked) and the game lays itself out for it
    await sh("settings put system accelerometer_rotation 0"); await sh("settings put system user_rotation 1");
    check(await until(() => window.innerWidth > window.innerHeight), "the app turns sideways with the phone");
    await sleep(1000);
    await fitCheck("sideways: the board fits and nothing runs off the side");
    await shot("7-sideways.png");
    await sh("settings put system user_rotation 0"); await sleep(2000);

    // (tablet sizes: testing/layout.js lays the page out at iPad and other tablet sizes in Chromium, the engine of
    // Android's WebView; changing this emulator's screen size with wm stops the emulator)
    await sh("settings put system accelerometer_rotation 1");

    // dark mode, switched while the game is open: the page (its background, as seen) and the colour behind the bars
    // follow it, the game goes on
    const nBefore = await (await live()).evaluate(() => me().n);
    await sh("cmd uimode night yes");
    check(await until(() => { const c = getComputedStyle(document.body).backgroundColor.match(/\d+/g).map(Number); return c[0] + c[1] + c[2] < 300; }), "the page turns dark with the phone");
    await sleep(1000);
    check(await (await live()).evaluate(() => me().n) === nBefore, "the game goes on through the switch");
    await shot("10-dark.png");
    await sh("cmd uimode night no");
    check(await until(() => { const c = getComputedStyle(document.body).backgroundColor.match(/\d+/g).map(Number); return c[0] + c[1] + c[2] > 500; }), "and light again");
  } catch (e) {
    const alive = await device.shell("echo ok").then(() => true, () => false);
    if (alive) throw e;
    console.log("note the rest not checked: the emulator stopped while redrawing the screen (" + e.message.split("\n")[0] + ")");
    console.log(bad ? bad + " failed" : "all passed");
    process.exit(bad ? 1 : 0);
  }
  await device.close();
  console.log(bad ? bad + " failed" : "all passed");
  process.exit(bad ? 1 : 0);
})().catch(async e => {
  console.error(e);
  console.log(`(after "${last}")`);
  await report();
  process.exit(1);
});
