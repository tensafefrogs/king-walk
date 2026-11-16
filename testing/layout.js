// Layout check: every screen size we support (phones upright and sideways, iPad full, split and Slide Over,
// desktop, iPhone Duo propped up and held like a book) x a few languages (long words: de, ru; tall script: ja)
// x every overlay (menu, the daily, its done card, celebrations, the paste dialog, the promotion picker, rank streaks,
// help). It reports the page scrolling sideways, text spilling out of buttons and labels, a card or dialog (or one of
// its buttons) that doesn't fit the screen, and the board not fully on screen. Screenshots of each problem go to
// testing/out/.
// usage: node testing/layout.js [languages, default en-US,de-DE,ru-RU,ja-JP] [size names, default all]
//   e.g. node testing/layout.js en-US,de-DE phone-390-land,duo-book      About 15 minutes for everything.
const server = require('./server'); const { chromium } = require('playwright'); const path = require('path'), fs = require('fs');
const OUT = path.join(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });
const VP = [
  ['phone-320', 320, 568, 1], ['phone-375', 375, 667, 1], ['phone-390', 390, 844, 1], ['phone-430', 430, 932, 1],
  ['phone-375-land', 667, 375, 1], ['phone-390-land', 844, 390, 1], ['phone-430-land', 932, 430, 1],
  ['ipad-mini', 744, 1133, 1], ['ipad-mini-land', 1133, 744, 1], ['ipad', 820, 1180, 1], ['ipad-land', 1180, 820, 1],
  ['ipad-split-half', 507, 1024, 1], ['ipad-slideover', 320, 1024, 1], ['ipad-pro-land', 1366, 1024, 1],
  ['laptop', 1280, 720, 0], ['desktop', 1920, 1080, 0], ['short-desktop', 1280, 600, 0],
  ['duo-table', 951, 669, 1, '?fold=h'], ['duo-book', 1338, 951, 1, '?fold=v'],
];
const LANGS = (process.argv[2] || 'en-US,de-DE,ru-RU,ja-JP').split(',');
const ONLY = process.argv[3] ? process.argv[3].split(',') : null;
const STATES = ['base', 'menu', 'daily', 'done-card', 'rank-card', 'award-card', 'dialog', 'promote', 'runs', 'help'];
(async () => {
  const srv = await server.start(), b = await chromium.launch(), issues = [];
  for (const [name, w, h, mobile, q = ''] of VP.filter(v => !ONLY || ONLY.includes(v[0]))) for (const lang of LANGS) {
    /* touch sizes play as Chrome on an iPhone or iPad, with the app on sale and a puzzle finished, so the App Store
       suggestions (the bar, the settings rows, the cards' lines) show and get checked too */
    const ua = !mobile ? undefined : 'Mozilla/5.0 (' + (/ipad/.test(name) ? 'iPad; CPU OS 26_1' : 'iPhone; CPU iPhone OS 26_1') + ' like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0 Mobile/15E148 Safari/604.1';
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: !!mobile, hasTouch: !!mobile, locale: lang, reducedMotion: 'reduce', userAgent: ua });
    await ctx.route('**/config.js', r => r.fulfill({ contentType: 'application/javascript', body: 'window.KING_WALK_CONFIG={goatcounter:"",site:"",appStoreId:"123",appLive:true};' }));
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(srv.url + 'index.html' + q); await p.waitForTimeout(800);
    await p.evaluate(() => { try { const s = JSON.parse(localStorage.getItem('chess-climb-v1')); s.players[0].n = 3; localStorage.setItem('chess-climb-v1', JSON.stringify(s)); } catch (e) {} });
    await p.goto(srv.url + 'index.html' + q); await p.waitForFunction(() => typeof cur !== 'undefined' && cur && !locked, null, { timeout: 20000 }).catch(() => {});
    await p.waitForTimeout(500);
    for (const st of STATES) {
      const r = await p.evaluate(async st => {
        const sleep = ms => new Promise(r => setTimeout(r, ms));
        const closeAll = async () => { for (let i = 0; i < 3; i++) { const g = document.querySelector('.cele .go, .cele .sh'); const go = document.querySelector('.cele .go'); if (go) go.click(); else if (g) g.click(); await sleep(350); } if (typeof closePromo === 'function') closePromo(); };
        await closeAll(); window.scrollTo(0, 0);
        if ($('menu').classList.contains('open')) toggleSection($('menuBtn'), $('menu'));
        if (DAILY && typeof leaveDaily === 'function') { try { leaveDaily(); } catch (e) {} }
        await sleep(300);
        if (st === 'menu') { toggleSection($('menuBtn'), $('menu')); document.querySelectorAll('#menu details').forEach(d => d.open = true); await sleep(500); }
        if (st === 'daily') { startDaily(); await sleep(1500); }
        try { localStorage.removeItem('kw-promo'); } catch (e) {}          /* each card gets its App Store line, whatever the weekly limit */
        if (st === 'done-card') { const D = me().daily, n = dayNumber(); if (!D.days[n]) recordDaily(D, n, 'gyg', 83, true); showDailyDone(); await sleep(700); }
        if (st === 'rank-card') { celebrate(['rank_queen']); await sleep(700); }
        if (st === 'award-card') { celebrate(['solved_1000']); await sleep(700); }
        if (st === 'dialog') { $('pasteCode').click(); await sleep(500); }
        if (st === 'promote') { askPromotion(() => {}, () => {}); await sleep(400); }
        if (st === 'runs') { const d = document.querySelector('.runs'); if (d) d.open = true; await sleep(400); }
        if (st === 'help') { const hb = $('helpBtn'); if (hb) hb.click(); await sleep(500); }
        const vw = innerWidth, vh = innerHeight, out = [];
        if (document.documentElement.scrollWidth > vw + 1) out.push('page scrolls sideways (' + document.documentElement.scrollWidth + ' > ' + vw + ')');
        const vis = el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && !el.closest('[hidden],[inert]'); };
        const desc = el => (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '') + ' "' + (el.textContent || '').trim().slice(0, 30) + '"';
        for (const el of document.querySelectorAll('.appbar div, .cele-app, button, .btn, .chip, .label, h1, h2, .st-main, .st-sub, summary, .setrow > span, .cele-title, .cele-kind, .stat, .lad-name, .run-btn span, select, a.app-only')) {
          if (!vis(el)) continue;
          if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflowX !== 'auto') out.push('text spills: ' + desc(el) + ' (' + el.scrollWidth + '>' + el.clientWidth + ')');
          const r = el.getBoundingClientRect(); if (r.right > vw + 1 || r.left < -1) out.push('off the side: ' + desc(el));
        }
        for (const sel of ['.cele-card', '.promo-box']) { const el = document.querySelector(sel); if (el && vis(el)) { const r = el.getBoundingClientRect(); if (r.top < -1 || r.bottom > vh + 1 || r.left < -1 || r.right > vw + 1) out.push(sel + ' does not fit (' + Math.round(r.top) + '..' + Math.round(r.bottom) + ' of ' + vh + ', ' + Math.round(r.left) + '..' + Math.round(r.right) + ' of ' + vw + ')');
          for (const btn of el.querySelectorAll('button')) { const br = btn.getBoundingClientRect(); if (br.bottom > vh + 1 || br.top < -1) out.push(sel + ' button off screen: ' + desc(btn)); } } }
        const bar = document.querySelector('.appbar'); if (bar && vis(bar)) { const r = bar.getBoundingClientRect(); if (r.right > vw + 1) out.push('App Store bar wider than the screen'); }
        if (st === 'base' || st === 'daily') { const f = $('frame').getBoundingClientRect(); if (f.bottom > vh + 1 || f.top < -1) out.push('board not fully on screen (' + Math.round(f.top) + '..' + Math.round(f.bottom) + ' of ' + vh + ')'); }
        return out;
      }, st).catch(e => ['error: ' + e.message.slice(0, 120)]);
      if (r.length) { issues.push({ vp: name, lang, st, r }); await p.screenshot({ path: `${OUT}/x-${name}-${lang}-${st}.png` }); }
    }
    if (errs.length) issues.push({ vp: name, lang, st: 'pageerror', r: [...new Set(errs)].slice(0, 3) });
    await ctx.close();
  }
  fs.writeFileSync(OUT + '/issues.json', JSON.stringify(issues, null, 1));
  console.log(issues.length ? 'problems in ' + issues.length + ' views (screenshots in testing/out/):' : 'no layout problems found');
  const tally = {}; for (const i of issues) for (const m of i.r) { const k = m.replace(/\(.*\)/, '').replace(/"[^"]*"/, '""').slice(0, 90); (tally[k] = tally[k] || []).push(i.vp + '/' + i.lang.slice(0, 2) + '/' + i.st); }
  for (const [k, v] of Object.entries(tally).sort((a, b) => b[1].length - a[1].length)) console.log(v.length, '|', k, '|', v.slice(0, 6).join(' '));
  await b.close(); srv.close();
  process.exitCode = issues.length ? 1 : 0;
})();
