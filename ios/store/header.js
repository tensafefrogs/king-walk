// Makes the App Store header and search results art (creative assets, iOS 27 and later), also the press kit's key art:
// a real puzzle board from the game, tilted, beside the King Walk icon, name and tagline, on the brand's deep teal.
// usage: node ios/store/header.js     Needs Playwright.
// Output in ios/store/header/: universal-16x9.png (5244x2950, fills both placements), header-21x9.png (3840x1646)
// and search-3x2.png (3840x2560), both cut from the middle. Everything that matters stays inside the area both cuts
// keep (the middle 2212x1124 of the 2622x1475 page). Flattened to RGB (Apple rejects alpha).
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");
const server = require("../../testing/server");
const ROOT = path.join(__dirname, "..", "..");
const out = path.join(__dirname, "header"); fs.mkdirSync(out, { recursive: true });
const b64 = f => fs.readFileSync(path.join(ROOT, f)).toString("base64");
const font = (name, w) => `@font-face{font-family:${name};font-weight:${w};src:url(data:font/woff2;base64,${b64("fonts/" + name.toLowerCase() + "-latin-" + w + "-normal.woff2")})}`;

(async () => {
  const srv = await server.start(), b = await chromium.launch();
  // 1. the board: a puzzle mid-solve, with the move's target circled, captured large
  const g = await b.newContext({ viewport: { width: 900, height: 1000 }, deviceScaleFactor: 3 });
  const gp = await g.newPage();
  await gp.route(/zgo\.at|goatcounter/, r => r.abort());
  await gp.addInitScript(() => { let a = 5; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; });
  await gp.goto(srv.url);
  await gp.waitForFunction(() => typeof locked !== "undefined" && !locked && !done && cur, null, { timeout: 20000 });
  await gp.evaluate(() => { const m = cur.pz.moves[idx]; sel = m.slice(0, 2); paint(); });
  await gp.waitForTimeout(600);
  const board = await (await gp.$("#frame")).screenshot({ omitBackground: true });
  await g.close();

  // 2. the picture
  const p = await (await b.newContext({ viewport: { width: 2622, height: 1475 }, deviceScaleFactor: 2 })).newPage();
  const mark = fs.readFileSync(path.join(ROOT, "brand/mark.svg"), "utf8").trim();
  const word = fs.readFileSync(path.join(ROOT, "brand/wordmark-on-dark.svg"), "utf8").trim();
  await p.setContent(`<!doctype html><html><head><style>${font("Fredoka", 600)}${font("Nunito", 700)}
    html,body{margin:0;width:2622px;height:1475px;overflow:hidden}
    body{background:radial-gradient(70% 90% at 30% 45%,#1f8572 0%,#165547 45%,#0e2f29 100%);position:relative}
    .grid{position:absolute;inset:0;background-image:linear-gradient(45deg,rgba(255,255,255,.035) 25%,transparent 25%,transparent 75%,rgba(255,255,255,.035) 75%),linear-gradient(45deg,rgba(255,255,255,.035) 25%,transparent 25%,transparent 75%,rgba(255,255,255,.035) 75%);
      background-size:184px 184px;background-position:0 0,92px 92px;mask-image:radial-gradient(80% 80% at 50% 50%,#000,transparent)}
    .board{position:absolute;left:470px;top:300px;width:870px;transform:perspective(2600px) rotateY(16deg) rotateX(4deg) rotate(-2deg);transform-origin:50% 50%;
      filter:drop-shadow(0 50px 90px rgba(0,0,0,.5)) drop-shadow(0 8px 20px rgba(0,0,0,.3))}
    .board img{display:block;width:100%}
    .side{position:absolute;left:1480px;top:0;bottom:0;width:800px;display:flex;flex-direction:column;justify-content:center;gap:44px}
    .mark{width:250px;height:250px;filter:drop-shadow(0 20px 40px rgba(0,0,0,.35))}.mark svg{width:100%;height:100%}
    .word svg{width:760px;height:auto;display:block}
    .tag{font:600 74px/1.12 Fredoka,sans-serif;color:#fdfbf2;margin:0;letter-spacing:-.01em}.tag b{color:#f2c230;font-weight:600}
    </style></head><body><div class="grid"></div>
    <div class="board"><img src="data:image/png;base64,${board.toString("base64")}"></div>
    <div class="side"><div class="mark">${mark}</div><div class="word">${word}</div><p class="tag">Chess puzzles that<br><b>grow with you.</b></p></div>
    </body></html>`);
  await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(500);
  await p.screenshot({ path: path.join(out, "raw-16x9.png") });
  await b.close(); srv.close();
  execFileSync("python3", ["-c", `
from PIL import Image
d='${out}'
im=Image.open(d+'/raw-16x9.png').convert('RGB').resize((5244,2950),Image.LANCZOS)
im.save(d+'/universal-16x9.png')
W,H=im.size
def cut(w,h,size,name):
    x,y=(W-w)//2,(H-h)//2
    im.crop((x,y,x+w,y+h)).resize(size,Image.LANCZOS).save(d+'/'+name)
cut(W,round(W*9/21),(3840,1646),'header-21x9.png')
cut(round(H*3/2),H,(3840,2560),'search-3x2.png')
`]);
  fs.unlinkSync(path.join(out, "raw-16x9.png"));
  console.log("saved to", out);
})();
