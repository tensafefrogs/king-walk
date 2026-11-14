// Records the gameplay videos: a saved player partway up the ranks solves a few puzzles, tapping the piece and then
// the square as a person would, cut into short shots with a caption each, framed in a game window on the brand's
// teal, joined with crossfades. A title card opens it and an end card closes it.
// Filming is frame by frame on a stepped clock (see CLOCK below), so the motion is even however slowly the machine
// draws: every frame of the video is one thirtieth of a second of the game. The puzzles dealt are fixed by seeding
// Math.random (SEEDS below), so every run plays the same puzzles.
// usage: node scripts/trailer.js [--vertical | --preview]     Needs Playwright and ffmpeg.
// Output: press/king-walk-trailer.mp4 (1920x1080) or press/king-walk-trailer-vertical.mp4 (1080x1920), and a poster .jpg.
// --preview makes the App Store app preview instead: ios/store/previews/iphone-1.mp4 (886x1920, 20 to 29 seconds,
// a silent stereo track, no URL or price on screen).
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), os = require("os"), { execFileSync } = require("child_process");
const server = require("../testing/server");
const ROOT = path.join(__dirname, "..");
const preview = process.argv.includes("--preview");
const vertical = preview || process.argv.includes("--vertical");
// page size in CSS pixels and scale; the game plays in a window of game size, scaled by s, at (x, top)
const F = preview ? { w: 443, h: 960, dpr: 2, gw: 390, gh: 760, s: 1, top: 150, name: "iphone-1" }
  : vertical ? { w: 540, h: 960, dpr: 2, gw: 390, gh: 760, s: 1, top: 150, name: "king-walk-trailer-vertical" }
  : { w: 1280, h: 720, dpr: 1.5, gw: 870, gh: 716, s: 0.855, top: 24, name: "king-walk-trailer" };
F.x = Math.round((F.w - F.gw * F.s) / 2);
const OUT = preview ? path.join(ROOT, "ios", "store", "previews") : path.join(ROOT, "press");
fs.mkdirSync(OUT, { recursive: true });
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "king-walk-trailer-"));
const FPS = 30, FADE = 0.6;
// Math.random seeds for the puzzles: found by trying a few for a full board with a short, clear solution
// (the preview skips the second puzzle, so its hint puzzle is dealt from a different save); the hint puzzles are
// rated a little above the player, so solving one with a hint still gains a point or two
const SEEDS = { solve: 10, next: 30, hint: preview ? 36 : 38, rank: 12 };

// CLOCK runs in the page and in the game's frame before anything else (copied from Spark's trailer). It replaces
// the clock, timers and requestAnimationFrame with ones that follow real time as usual, until __vt.enter(): from
// then the time only moves when __vt.tick(ms) says so, which also runs the timers and frame callbacks that are due
// and moves CSS animations and transitions to the same time. __vt.leave() hands everything back to real time.
const CLOCK = `(()=>{let C;const isTop=window.top===window;
  try{C=isTop?(window.__clock=window.__clock||{virtual:false,v:0,off:0,dv:0,doff:0,wins:[],rpn:performance.now.bind(performance),rdn:Date.now.bind(Date)}):window.top.__clock;}catch(e){return;}
  if(!C)return;
  const now=()=>C.virtual?C.v:C.rpn()+C.off;
  const rRAF=window.requestAnimationFrame.bind(window),rCAF=window.cancelAnimationFrame.bind(window),rSI=window.setInterval.bind(window);
  performance.now=now;Date.now=()=>Math.round(C.virtual?C.dv:C.rdn()+C.doff);
  let rid=0;const rafq=new Map(),real=new Map();
  window.requestAnimationFrame=cb=>{const id=++rid;if(C.virtual)rafq.set(id,cb);else real.set(id,rRAF(()=>{real.delete(id);cb(now());}));return id;};
  window.cancelAnimationFrame=id=>{rafq.delete(id);if(real.has(id)){rCAF(real.get(id));real.delete(id);}};
  let tid=0;const timers=new Map();
  const add=(fn,d,args,every)=>{const id=++tid;d=Math.max(0,+d||0);timers.set(id,{fn,due:now()+d,d:Math.max(1,d),args,every});return id;};
  window.setTimeout=(fn,d,...a)=>add(fn,d,a,false);window.setInterval=(fn,d,...a)=>add(fn,d,a,true);
  window.clearTimeout=window.clearInterval=id=>{timers.delete(id);};
  const due=()=>{const n=now();for(let i=0;i<500;i++){let best=null,bid=0;for(const [id,t] of timers)if(t.due<=n&&(!best||t.due<best.due)){best=t;bid=id;}
    if(!best)return;if(best.every)best.due=Math.max(best.due+best.d,n-best.d);else timers.delete(bid);
    try{if(typeof best.fn==='function')best.fn(...best.args);}catch(e){console.error(e);}}};
  rSI(()=>{if(!C.virtual)due();},4);
  const anims=()=>{for(const a of document.getAnimations()){
    if(a.__t0===undefined){a.__t0=C.v-(Number(a.currentTime)||0);try{a.pause();}catch(e){}}
    const t=C.v-a.__t0,end=a.effect?a.effect.getComputedTiming().endTime:Infinity;
    try{if(t>=end)a.finish();else a.currentTime=t;}catch(e){}}};
  C.wins.push({doc:document,
    run(){due();const q=[...rafq.values()];rafq.clear();for(const cb of q)try{cb(C.v);}catch(e){console.error(e);}anims();},
    leave(){for(const a of document.getAnimations())if(a.__t0!==undefined){delete a.__t0;try{if(a.playState==='paused')a.play();}catch(e){}}
      const q=[...rafq.values()];rafq.clear();for(const cb of q)window.requestAnimationFrame(cb);}});
  if(isTop)window.__vt={
    enter(){C.v=now();C.dv=Date.now();C.virtual=true;},
    leave(){C.off=C.v-C.rpn();C.doff=C.dv-C.rdn();C.virtual=false;for(const w of C.wins)if(w.doc.defaultView)w.leave();},
    tick(ms){C.v+=ms;C.dv+=ms;C.wins=C.wins.filter(w=>w.doc.defaultView);for(const w of C.wins)w.run();}};
})();`;

// SEED gives the game's frame a seeded Math.random (the same one as ios/store/screenshots.js), starting from the
// seed the stage set; __reseed(n) starts it over, so the next puzzle dealt depends only on n and the save.
const SEED = `(()=>{if(window.top===window)return;
  window.__reseed=s=>{let a=s;Math.random=()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};};
  window.__reseed(window.top.__seed||1);})();`;

// A player partway up: Bishop rank, a climb in the chart, a streak going (as in ios/store/screenshots.js).
// to: the rating the climb ends at.
function savedPlayer(to) {
  let a = 7, rnd = () => (a = (a * 16807) % 2147483647) / 2147483647;
  const hist = [600]; let r = 600;
  for (let i = 0; i < 180; i++) { r += Math.round((rnd() - 0.36) * 34 * (i < 30 ? 1.6 : 1)); r = Math.max(560, r); hist.push(r); }
  const shift = to - hist[hist.length - 1];
  const h = hist.map((v, i) => Math.max(560, Math.round(v + shift * i / (hist.length - 1))));
  return { v: 2, updatedAt: Date.now(), cur: 0, sound: false, haptics: true, rateAsked: Date.now(), players: [{
    name: "Player 1", rating: h[h.length - 1], n: 180, solved: 117, streak: 4, best: 13, peak: Math.max(...h), hist: h,
    last: [1, 1, 0, 1, 1, 0.5, 1, 1, 1, 0, 1, 1, 1, 0.5, 1, 1, 0, 1, 1, 1], seen: {}, review: [], mode: "normal", since: Date.now() - 40 * 864e5, back: 7 }] };
}

// fonts and logo, embedded so the stage needs no network
const font = (name, w) => `@font-face{font-family:${name};font-weight:${w};src:url(data:font/woff2;base64,${fs.readFileSync(path.join(ROOT, "fonts", name.toLowerCase() + "-latin-" + w + "-normal.woff2")).toString("base64")})}`;
const svg = f => "data:image/svg+xml;base64," + fs.readFileSync(path.join(ROOT, "brand", f)).toString("base64");
// the logo: icon beside the name in the wide video, icon above the name in the tall ones
const LOGO = vertical ? `<img class="mark" src="${svg("mark.svg")}" alt=""><img class="word" src="${svg("wordmark-on-dark.svg")}" alt="">`
  : `<img class="logo" src="${svg("logo-on-dark.svg")}" alt="">`;
const TAG = "Chess puzzles that grow with you.";

const STAGE = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>${font("Fredoka", 600)}${font("Fredoka", 700)}${font("Nunito", 700)}${font("Nunito", 800)}
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#143f38;color:#fdfbf2;font-family:Nunito,system-ui,sans-serif}
#bg{position:fixed;inset:0;background:radial-gradient(120% 75% at 50% ${vertical ? 8 : 0}%,#1c7868,#143f38 58%,#0f322c)}
#win{position:absolute;left:${F.x}px;top:${F.top}px;width:${F.gw * F.s}px;height:${F.gh * F.s}px;border-radius:${vertical ? 26 : 16}px;overflow:hidden;
  box-shadow:0 0 0 1px rgba(253,251,242,.16),0 22px 70px rgba(0,0,0,.45);opacity:0;transition:opacity .7s ease}
#win.on{opacity:1}
#scale{position:relative;width:${F.gw}px;height:${F.gh}px;transform:scale(${F.s});transform-origin:0 0}
iframe{width:${F.gw}px;height:${F.gh}px;border:0;display:block;background:#edf1ef}
#taps{position:absolute;inset:0;pointer-events:none}
.ring{position:absolute;width:54px;height:54px;margin:-27px 0 0 -27px;border-radius:50%;border:4px solid #f2c230;box-sizing:border-box;
  background:rgba(242,194,48,.22);box-shadow:0 0 0 2px rgba(22,48,44,.4),0 0 16px rgba(242,194,48,.6);animation:ring .7s ease-out forwards}
@keyframes ring{0%{transform:scale(.45);opacity:1}40%{opacity:.95}100%{transform:scale(1.3);opacity:0}}
#cap{position:absolute;left:0;right:0;text-align:center;font-weight:800;color:#fdfbf2;text-wrap:balance;
  ${vertical ? `top:0;height:${F.top}px;font-size:${preview ? 25 : 27}px;padding:0 ${preview ? 26 : 34}px;` : `bottom:0;height:${F.h - F.top - F.gh * F.s}px;font-size:30px;`}
  display:flex;align-items:center;justify-content:center;box-sizing:border-box;line-height:1.25;
  opacity:0;transform:translateY(8px);transition:opacity .6s ease,transform .8s cubic-bezier(.2,.7,.2,1)}
#cap.on{opacity:1;transform:none}
#cap b{color:#f2c230;font-weight:800}
.card{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;opacity:0;transition:opacity .8s ease}
.card.on{opacity:1}
.card .art{display:flex;flex-direction:column;align-items:center;transform:translateY(14px) scale(.96);transition:transform 1.6s cubic-bezier(.2,.7,.2,1)}
.card.on .art{transform:none}
.logo{width:660px;display:block}
.mark{width:${preview ? 150 : 170}px;display:block;margin-bottom:30px;border-radius:24%;box-shadow:0 14px 40px rgba(0,0,0,.3)}
.word{width:${preview ? 330 : 370}px;display:block}
.card h2{margin:${vertical ? 34 : 40}px ${vertical ? 30 : 0}px 0;font:600 ${vertical ? 30 : 40}px/1.2 Fredoka,sans-serif;color:#f2c230;letter-spacing:-.005em;
  opacity:0;transform:translateY(8px);transition:opacity .8s ease .5s,transform 1.2s cubic-bezier(.2,.7,.2,1) .5s}
.card.on h2{opacity:1;transform:none}
.card p{margin:${vertical ? 34 : 34}px 0 0;font:700 ${vertical ? 22 : 26}px/1.3 Nunito,sans-serif;opacity:0;transition:opacity .8s ease 1.1s}
.card.on p{opacity:.92}
.card p.url{margin-top:12px;font:800 ${vertical ? 21 : 24}px/1.3 Nunito,sans-serif;color:#fdfbf2;letter-spacing:.01em}
.card.on p.url{opacity:.75}
</style></head><body>
<div id="bg"></div>
<div id="win"><div id="scale"><iframe id="game"></iframe><div id="taps"></div></div></div>
<div id="cap"></div>
<div class="card" id="title"><div class="art">${LOGO}</div><h2>${TAG}</h2></div>
<div class="card" id="end"><div class="art">${LOGO}</div><h2>${TAG}</h2>${preview ? "" : '<p>On iPhone, iPad and the web</p><p class="url">geoffstearns.com/king-walk</p>'}</div>
<script>
const $=s=>document.querySelector(s);
const T=window.T={
  win:()=>$('#game').contentWindow,
  doc:()=>$('#game').contentDocument,
  // open the game with this save and Math.random seed (the frame shares this page's localStorage); the old
  // game's window is marked, to tell when the new one has replaced it
  load(url,save,seed){try{T.win().__old=1;}catch(e){}$('#game').src='about:blank';localStorage.clear();localStorage.setItem('chess-climb-v1',save);window.__seed=seed;$('#game').src=url;},
  show(id,on){$(id).classList.toggle('on',on);},
  caption(t){const c=$('#cap');if(!t){c.classList.remove('on');return;}c.innerHTML='<span>'+t+'</span>';c.classList.add('on');},
  ring(x,y){const r=document.createElement('div');r.className='ring';r.style.left=x+'px';r.style.top=y+'px';$('#taps').appendChild(r);setTimeout(()=>r.remove(),800);},
  // the game's state, read from its frame (top-level let/const of a classic script live in the frame's global scope)
  g:f=>T.win().eval(f),
  center(el){const b=el.getBoundingClientRect();return {x:b.left+b.width/2,y:b.top+b.height/2};},
  // a tap on the board at a square's center: a ring there, and pointerdown + pointerup as the game listens for them
  tapSq(sq){const w=T.win(),board=T.doc().querySelector('#board'),c=T.center(w.eval('sqEls')[sq]);T.ring(c.x,c.y);
    const o={bubbles:true,cancelable:true,pointerId:1,isPrimary:true,pointerType:'${vertical ? "touch" : "mouse"}',button:0,buttons:1,clientX:c.x,clientY:c.y};
    board.dispatchEvent(new w.PointerEvent('pointerdown',o));board.dispatchEvent(new w.PointerEvent('pointerup',{...o,buttons:0}));},
  press(sel){const el=T.doc().querySelector(sel),c=T.center(el);T.ring(c.x,c.y);el.click();},
  // scroll the game's page to y over ms, on the game's own (stepped) frame clock
  scroll(y,ms){const w=T.win(),d=T.doc().scrollingElement,y0=d.scrollTop,t0=w.performance.now();
    const step=()=>{const u=Math.min(1,(w.performance.now()-t0)/ms),e=u<.5?2*u*u:1-Math.pow(-2*u+2,2)/2;d.scrollTop=y0+(y-y0)*e;if(u<1)w.requestAnimationFrame(step);};w.requestAnimationFrame(step);},
};
</script></body></html>`;

(async () => {
  const srv = await server.start(), URL = srv.url + "index.html";
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: F.w, height: F.h }, deviceScaleFactor: F.dpr, hasTouch: vertical, isMobile: vertical, colorScheme: "light", reducedMotion: "no-preference" });
  const p = await ctx.newPage(), errs = [];
  p.on("pageerror", e => errs.push(e.message));
  await p.route(/zgo\.at|goatcounter/, r => r.abort());
  await p.route("**/__trailer.html", r => r.fulfill({ contentType: "text/html", body: STAGE }));
  await ctx.addInitScript(CLOCK); await ctx.addInitScript(SEED);
  await p.goto(srv.url + "__trailer.html");
  await p.evaluate(() => document.fonts.ready);
  const E = (f, a) => p.evaluate(f, a), G = f => E(f => T.g(f), f);
  const cdp = await ctx.newCDPSession(p);

  // while filming, time passes one frame at a time and each frame is kept
  let filming = null, owed = 0;
  const shoot = async () => {
    await E(ms => __vt.tick(ms), 1000 / FPS);
    const { data } = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 92 });
    fs.writeFileSync(path.join(filming.dir, `f${String(filming.n++).padStart(5, "0")}.jpg`), Buffer.from(data, "base64"));
  };
  const wait = async ms => { owed += ms; while (owed >= 1000 / FPS) { owed -= 1000 / FPS; await shoot(); } };
  // film until the game's state says so (f is evaluated in the game's frame)
  const until = async (f, max = 8000) => { for (let t = 0; !(await G(f)); t += 1000 / FPS) { if (t > max) throw new Error("timed out waiting for " + f); await wait(1000 / FPS); } };

  const segs = [];
  const rec = async () => { const dir = path.join(TMP, "s" + segs.length); fs.mkdirSync(dir); await E(() => __vt.enter()); filming = { dir, n: 0 }; owed = 0; };
  const stop = async () => {
    const f = filming; filming = null; await E(() => __vt.leave());
    const mp4 = path.join(TMP, `seg${segs.length}.mp4`);
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", path.join(f.dir, "f%05d.jpg"), "-vf", `scale=${F.w * F.dpr}:${F.h * F.dpr},format=yuv420p`, "-c:v", "libx264", "-crf", "14", "-preset", "medium", mp4]);
    fs.rmSync(f.dir, { recursive: true, force: true });
    console.log(`shot ${segs.length}: ${(f.n / FPS).toFixed(1)}s`);
    segs.push({ mp4, dur: f.n / FPS });
  };

  // a fresh game from a save; loaded on the stepped clock, so the shot can start as the pieces are dealt
  // (frames before the puzzle is ready are not kept)
  const open = async (to, seed) => {
    await E(() => T.show("#win", false)); await p.waitForTimeout(800);
    await E(() => __vt.enter());
    await E(([u, s, n]) => T.load(u, s, n), [URL, JSON.stringify(savedPlayer(to)), seed]);
    for (let i = 0; !(await E(() => { try { return !T.win().__old&&!!T.g("typeof cur!=='undefined'&&cur"); } catch (e) { return false; } })); i++) {
      if (i > 600) throw new Error("the game did not load");
      await E(ms => __vt.tick(ms), 1000 / FPS); await p.waitForTimeout(20);
    }
    await E(() => __vt.leave());
    await E(() => T.show("#win", true));
  };
  // a deterministic "thinking" pause, 0.6 to 1.2 seconds
  let th = 3; const think = () => 600 + ((th = (th * 16807) % 2147483647) % 600);
  const puzzle = async label => console.log(label, await G("cur.pz.id+' rated '+cur.pz.r+', '+cur.pz.th.join(' ')+', moves '+cur.pz.moves.join(' ')+', player '+me().rating"));
  // play the puzzle's moves as a person would: wait for the turn, think, tap the piece, tap the square
  const solve = async (o = {}) => {
    for (;;) {
      await until("done||!locked", 10000);
      if (await G("done")) break;
      await wait(o.firstThink && !(await G("idx>1")) ? o.firstThink : think());
      const m = await G("cur.pz.moves[idx]");
      await E(sq => T.tapSq(sq), m.slice(0, 2)); await wait(380);
      await E(sq => T.tapSq(sq), m.slice(2, 4)); await wait(100);
    }
  };
  const end = async () => { await E(() => T.caption("")); await wait(400); await stop(); };

  // 1. title card
  await rec(); await wait(400);
  await E(() => T.show("#title", true)); await wait(preview ? 2200 : 3200);
  await E(() => T.show("#title", false)); await wait(500); await stop();

  // 2. the other side moves first, then the player answers: a mate in 2, confetti, the rating goes up
  await open(1112, SEEDS.solve); await puzzle("solve:");
  await rec(); await E(() => T.caption("Each puzzle starts with the <b>other side's move</b>."));
  await solve(); await wait(preview ? 1600 : 2600); await end();

  // 3. the next puzzle, a little harder (not in the preview)
  if (!preview) {
    await rec(); await E(() => T.caption("Solve one and the <b>next gets harder</b>."));
    await wait(700); await E(s => T.win().__reseed(s), SEEDS.next); await E(() => T.press("#nextBtn"));
    await until("cur&&!locked&&!done"); await puzzle("next:");
    await solve(); await wait(2200); await end();
  }

  // 4. a hint: the first circles the piece, the second where it goes
  if (preview) { await E(s => T.win().__reseed(s), SEEDS.hint); await G("nextPuzzle()"); await p.waitForTimeout(1500); }
  await rec(); await E(() => T.caption("Stuck? Take a <b>hint</b>."));
  if (!preview) { await wait(600); await E(s => T.win().__reseed(s), SEEDS.hint); await E(() => T.press("#nextBtn")); }
  await until("cur&&!locked&&!done"); await puzzle("hint:");
  await wait(900); await E(() => T.press("#hintBtn")); await wait(1300); await E(() => T.press("#hintBtn")); await wait(1100);
  await solve({ firstThink: 400 }); await wait(preview ? 1500 : 2000); await end();

  // 5. a rank up: a player just below Rook (1300) solves one; on a phone the page then scrolls down to show the
  // progress card down to its chart
  await open(1295, SEEDS.rank); await puzzle("rank:");
  await rec(); await E(() => T.caption("Walk up from <b>Pawn to King</b>."));
  await solve(); await wait(1400);
  if (vertical) {
    const y = await G("(()=>{const r=document.querySelector('.chart-cap').getBoundingClientRect();return Math.max(0,Math.round(r.bottom+scrollY-innerHeight+20));})()");
    await E(y => T.scroll(y, 1100), y); await wait(1300);
  }
  await wait(preview ? 1300 : 2400); await end();

  // 6. end card
  await rec(); await E(() => T.show("#win", false)); await wait(700);
  await E(() => T.show("#end", true)); await wait(preview ? 2800 : 4200); await stop();

  if (errs.length) console.log("page errors", errs);
  await b.close(); srv.close();

  // join the shots with crossfades, then scale to the output size
  const inputs = segs.flatMap(s => ["-i", s.mp4]); let fc = "", last = "[0:v]", off = 0;
  for (let i = 1; i < segs.length; i++) { off += segs[i - 1].dur - FADE; fc += `${last}[${i}:v]xfade=transition=fade:duration=${FADE}:offset=${off.toFixed(3)}[v${i}];`; last = `[v${i}]`; }
  const W = preview ? 886 : vertical ? 1080 : 1920, H = vertical ? 1920 : 1080;
  fc += `${last}scale=${W}:${H}:flags=lanczos,format=yuv420p[out]`;
  const mp4 = path.join(OUT, F.name + ".mp4");
  // the App Store wants a stereo AAC track (silent here) and 10-12 Mbps H.264: held at 11 Mbps (constant bitrate),
  // since this mostly still picture would otherwise come out well under 10
  const audio = preview ? ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo"] : [];
  const enc = preview ? ["-map", `${segs.length}:a`, "-shortest", "-c:a", "aac", "-b:a", "256k", "-b:v", "11M", "-minrate", "11M", "-maxrate", "11M", "-bufsize", "22M", "-x264-params", "nal-hrd=cbr"] : ["-crf", "21"];
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...inputs, ...audio, "-filter_complex", fc, "-map", "[out]", ...enc, "-r", String(FPS), "-c:v", "libx264", "-preset", "slow", "-profile:v", "high", "-movflags", "+faststart", mp4]);
  const len = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", mp4]).toString());
  if (preview) console.log("preview length", len.toFixed(1) + "s", len < 15 || len > 30 ? "(outside the 15-30 seconds the App Store accepts)" : "");
  // poster: a frame from the first solve, after the confetti
  else {
    const at = segs[0].dur - FADE + segs[1].dur - 1.2;
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", at.toFixed(2), "-i", mp4, "-frames:v", "1", "-q:v", "3", path.join(OUT, F.name + "-poster.jpg")]);
  }
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log("saved", mp4, (fs.statSync(mp4).size / 1e6).toFixed(1) + " MB,", len.toFixed(1) + "s");
})().catch(e => { console.error(e); process.exit(1); });
