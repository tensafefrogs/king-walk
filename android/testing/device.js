// Plays the real Android app on a device or emulator (adb) and checks the parts only the app has: the page talks to the
// app, progress survives the app being closed and its WebView storage being lost (the copy SaveStore keeps, which the
// Google backup takes), the back gesture closes the menu, reminders are scheduled, and the screen looks right.
// The GitHub workflow (.github/workflows/android.yml) runs it on an emulator after each build.
// usage: node android/testing/device.js <app-debug.apk> [screenshots folder]   (a debug build: its WebView can be inspected)
const { _android } = require("playwright");
const fs = require("fs"), path = require("path");

const apk = process.argv[2], out = process.argv[3] || path.join(__dirname, "out");
const PKG = process.env.ANDROID_APPLICATION_ID || "kingwalk.android.dev", ACTIVITY = PKG + "/kingwalk.android.MainActivity";
fs.mkdirSync(out, { recursive: true });
let bad = 0;
const check = (ok, what, detail = "") => { console.log((ok ? "ok   " : "FAIL ") + what + (ok || !detail ? "" : ": " + detail)); if (!ok) bad++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let page;
/** whether fn becomes true on the page within 10 seconds (the phone turning or changing theme takes a moment) */
const until = fn => page.waitForFunction(fn, null, { timeout: 10000 }).then(() => true, () => false);

(async () => {
  const [device] = await _android.devices();
  if (!device) throw new Error("no device: start an emulator or connect a phone (adb devices)");
  console.log("device:", device.model(), device.serial());
  const sh = async c => (await device.shell(c)).toString();
  await device.installApk(fs.readFileSync(apk));
  await sh(`pm clear ${PKG}`);
  // notifications allowed up front: the permission dialog is Android's, not the game's
  await sh(`pm grant ${PKG} android.permission.POST_NOTIFICATIONS`).catch(() => {});

  const open = async (how = `-n ${ACTIVITY}`) => {
    await sh(`am start -W ${how}`);
    const view = await device.webView({ pkg: PKG }, { timeout: 60000 });
    const page = await view.page();
    // a puzzle ready to play, or today's daily already played (it opens on its result)
    await page.waitForFunction(() => typeof locked !== "undefined" && typeof cur !== "undefined" && cur && (!locked || (typeof DAILY !== "undefined" && DAILY)), null, { timeout: 60000 });
    return page;
  };
  const errs = [];
  page = await open();
  page.on("pageerror", e => errs.push(e.message));
  const app = await page.evaluate(() => ({ os: APP && APP.os, platform: PLATFORM, reminders: APP && APP.reminders, help: $("helpSaved").textContent, viewport: document.querySelector("meta[name=viewport]").content }));
  check(app.os === "android" && /^android-|chromeos/.test(app.platform), "the page runs as the Android app", JSON.stringify(app));
  check(/Google/.test(app.help), "the help mentions the Google backup", app.help);
  await device.screenshot({ path: path.join(out, "1-start.png") });

  // solve one puzzle with taps on the screen, like a player
  const solve = async () => {
    while (!(await page.evaluate(() => done))) {
      await page.waitForFunction(() => done || !locked, null, { timeout: 20000 });
      if (await page.evaluate(() => done)) break;
      const m = await page.evaluate(() => cur.pz.moves[idx]);
      if (m.length > 4) await page.evaluate(m => commit(m.slice(0, 2), m.slice(2, 4), m[4]), m);
      else for (const sq of [m.slice(0, 2), m.slice(2, 4)]) {          // tap the piece, then the square
        const box = await page.evaluate(sq => { const r = sqEls[sq].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sq);
        await page.mouse.click(box.x, box.y); await sleep(80);
      }
      await sleep(300);
    }
  };
  await solve();
  await sleep(1500);
  await device.screenshot({ path: path.join(out, "2-solved.png") });
  // a celebration may be showing (the first solve): the back gesture closes it
  if (await page.evaluate(() => !!document.querySelector(".cele:not(.out)"))) {
    await sh("input keyevent KEYCODE_BACK"); await sleep(800);
    check(await page.evaluate(() => !document.querySelector(".cele:not(.out)")), "back closes the celebration");
  }
  const n1 = await page.evaluate(() => me().n);
  check(n1 >= 1, "a puzzle was played", String(n1));

  // the save reaches the app's copy (SaveStore: shared_prefs/save.xml, which the backup takes)
  await sleep(500);
  const prefs = await sh(`run-as ${PKG} cat shared_prefs/save.xml`);
  check(/chess-climb-v1/.test(prefs), "the save is copied to save.xml", prefs.slice(0, 200));

  // the menu: open it, then back closes it and the app stays open
  await page.evaluate(() => { if (!$("menu").classList.contains("open")) $("menuBtn").click(); }); await sleep(600);
  check(await page.evaluate(() => $("menu").classList.contains("open")), "the menu opens");
  await device.screenshot({ path: path.join(out, "3-menu.png") });
  await sh("input keyevent KEYCODE_BACK"); await sleep(800);
  check(await page.evaluate(() => !$("menu").classList.contains("open")), "back closes the menu");
  const top = await sh("dumpsys activity activities | grep -E 'topResumedActivity|mResumedActivity' | head -1");
  check(top.includes(PKG), "the app is still in front after back closed the menu", top.trim());

  // the daily reminder: turn it on, and alarms are set for the coming days
  await page.evaluate(() => { const s = $("remindSel"); s.value = String([...s.options].map(o => o.value).find(v => +v >= 0)); s.dispatchEvent(new Event("change", { bubbles: true })); });
  await sleep(1500);
  const alarms = await sh(`dumpsys alarm | grep -c "${PKG}"`).catch(() => "0");
  check(parseInt(alarms, 10) > 0, "reminders are scheduled", alarms.trim());

  // closed and opened again: the same progress
  await sh(`am force-stop ${PKG}`);
  page = await open();
  check(await page.evaluate(() => me().n) === n1, "progress is there after the app is closed and opened again");

  // the WebView's own storage lost (as after a restore from Google backup, which brings only save.xml): progress comes back
  await sh(`am force-stop ${PKG}`);
  await sh(`run-as ${PKG} rm -rf app_webview/Default/Local\\ Storage app_webview/Local\\ Storage`);
  page = await open();
  check(await page.evaluate(() => me().n) === n1, "progress comes back from the app's copy when the WebView's storage is empty");
  await device.screenshot({ path: path.join(out, "4-restored.png") });

  // a reminder's tap opens the daily puzzle
  await sh(`am start -W -n ${ACTIVITY} --es open daily`);
  await sleep(2500);
  check(await page.evaluate(() => typeof DAILY !== "undefined" && !!DAILY), "a reminder's tap opens the daily puzzle");
  await device.screenshot({ path: path.join(out, "5-daily.png") });

  // larger text: the page is laid out at the phone's font size
  await sh("settings put system font_scale 1.3"); await sleep(2500);
  const vp = await page.evaluate(() => document.querySelector("meta[name=viewport]").content);
  check(/initial-scale=1\.3/.test(vp), "the page follows the phone's font size", vp);
  check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "nothing runs off the side at a bigger font size");
  await device.screenshot({ path: path.join(out, "6-big-text.png") });
  await sh("settings put system font_scale 1.0");

  // the page fits: no sideways scrolling, the whole board on screen
  const fits = () => page.evaluate(() => {
    const b = document.querySelector(".board, #board").getBoundingClientRect();
    return { sideways: document.documentElement.scrollWidth > window.innerWidth + 1, board: Math.round(b.width), w: window.innerWidth, h: window.innerHeight,
      boardOn: b.left >= -1 && b.right <= window.innerWidth + 1 };
  });
  const fitCheck = async what => { const f = await fits(); check(!f.sideways && f.boardOn && f.board > 150, what, JSON.stringify(f)); };

  // sideways: the app turns with the phone (no orientation is locked) and the game lays itself out for it
  await sh("settings put system accelerometer_rotation 0"); await sh("settings put system user_rotation 1");
  check(await until(() => window.innerWidth > window.innerHeight), "the app turns sideways with the phone");
  await sleep(1000);
  await fitCheck("sideways: the board fits and nothing runs off the side");
  await device.screenshot({ path: path.join(out, "7-sideways.png") });
  await sh("settings put system user_rotation 0"); await sleep(2000);

  // (tablet sizes: testing/layout.js lays the page out at iPad and other tablet sizes in Chromium, the engine of
  // Android's WebView; changing this emulator's screen size with wm stops the emulator)
  await sh("settings put system accelerometer_rotation 1");

  // Remove animations (Settings → Accessibility; the emulator here starts with animations off): the page moves less
  // (the app tells it: the WebView doesn't pass the setting on as prefers-reduced-motion)
  const reduced = await page.evaluate(() => REDUCED && document.documentElement.classList.contains("reduce-motion"));
  const scale = (await sh("settings get global animator_duration_scale")).trim();
  check(reduced === (parseFloat(scale) === 0), "the page's reduced motion follows Remove animations", `scale ${scale}, reduce ${reduced}`);

  // the language: picked in the game, it's the phone's per-app language for the app (Settings, Apps, King Walk,
  // Language), and the app opens again in it; set there, the game follows
  await page.evaluate(() => { const s = $("langSel"); s.value = "fr"; s.dispatchEvent(new Event("change", { bubbles: true })); });
  await sleep(4000);
  const appLocale = await sh(`cmd locale get-app-locales ${PKG}`);
  check(/\bfr\b/.test(appLocale), "a language picked in the game becomes the app's language on the phone", appLocale.trim());
  await sh(`am force-stop ${PKG}`); page = await open(); page.on("pageerror", e => errs.push(e.message));
  check(await page.evaluate(() => LANG === "fr" && $("langSel").value === "fr"), "the game opens in it", await page.evaluate(() => LANG + " " + $("langSel").value));
  await sh(`cmd locale set-app-locales ${PKG} --locales de-DE`); await sleep(2000);
  await sh(`am force-stop ${PKG}`); page = await open(); page.on("pageerror", e => errs.push(e.message));
  check(await page.evaluate(() => LANG === "de" && $("langSel").value === "de"), "a language set in the phone's settings is the game's", await page.evaluate(() => LANG + " " + $("langSel").value));
  await device.screenshot({ path: path.join(out, "11-german.png") });
  await sh(`cmd locale set-app-locales ${PKG} --locales ""`); await sleep(2000);
  await sh(`am force-stop ${PKG}`); page = await open(); page.on("pageerror", e => errs.push(e.message));
  check(await page.evaluate(() => LANG === "en" && $("langSel").value === ""), "and back to the phone's own", await page.evaluate(() => LANG + " " + $("langSel").value));

  // the Quick Settings tile is there to add
  const tile = await sh(`dumpsys package ${PKG} | grep -c "android.service.quicksettings.action.QS_TILE"`).catch(() => "0");
  check(parseInt(tile, 10) > 0, "the Today's puzzle Quick Settings tile is offered", tile.trim());

  // the app shortcut (touch and hold the icon): Today's puzzle
  const shortcuts = await sh(`dumpsys shortcut | grep -A3 "Package: ${PKG}" | head -20; dumpsys shortcut | grep -c "id=daily"`);
  check(/[1-9]\s*$/.test(shortcuts), "the Today's puzzle shortcut is published", shortcuts.trim().slice(-300));
  // (from a closed app, which opens on the ordinary puzzles)
  await sh(`am force-stop ${PKG}`);
  page = await open(`-a kingwalk.android.OPEN --es open daily -p ${PKG}`);
  page.on("pageerror", e => errs.push(e.message));
  await sleep(2500);
  check(await page.evaluate(() => typeof DAILY !== "undefined" && !!DAILY), "the shortcut opens the daily puzzle");

  // a shared daily puzzle's link (the website's address, #daily) opens the app on it (App Links; on a phone Android
  // sends such links to the app once the site's assetlinks.json names it, here the test names the app itself)
  if (process.env.SITE_URL) {
    await sh(`am force-stop ${PKG}`);
    page = await open(`-a android.intent.action.VIEW -c android.intent.category.BROWSABLE -d "${process.env.SITE_URL.replace(/\/?$/, "/")}#daily" -p ${PKG}`);
    page.on("pageerror", e => errs.push(e.message));
    await sleep(2500);
    check(await page.evaluate(() => typeof DAILY !== "undefined" && !!DAILY), "a link to the daily puzzle opens it in the app");
  }

  check(!errs.length, "no page errors", errs.join(" | "));

  // last, as the emulator on GitHub's machines sometimes stops while it redraws for a theme change (it has stopped
  // during wm size too): if the emulator itself is gone, that's reported, not counted against the app
  try {
    // dark mode, switched while the game is open: the page and the colour behind the bars follow it, the game goes on
    const nBefore = await page.evaluate(() => me().n);
    await sh("cmd uimode night yes");
    check(await until(() => matchMedia("(prefers-color-scheme: dark)").matches), "the page turns dark with the phone");
    await sleep(1000);
    check(await page.evaluate(() => me().n) === nBefore, "the game goes on through the switch");
    await device.screenshot({ path: path.join(out, "10-dark.png") });
    await sh("cmd uimode night no");
    check(await until(() => !matchMedia("(prefers-color-scheme: dark)").matches), "and light again");
  } catch (e) {
    const alive = await device.shell("echo ok").then(() => true, () => false);
    if (alive) throw e;
    console.log("note dark mode switch not checked: the emulator stopped while redrawing for it (" + e.message.split("\n")[0] + ")");
    console.log(bad ? bad + " failed" : "all passed");
    process.exit(bad ? 1 : 0);
  }
  await device.close();
  console.log(bad ? bad + " failed" : "all passed");
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
