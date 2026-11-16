// Offline support. The page and rules load from the network when possible and fall back to the saved copy.
// Puzzle chunks, fonts and the player's language table (lang/) are saved the first time they are used.
const CACHE = "king-walk-v4";          // the website build replaces this with a hash of the fonts and icons (pages.yml)
// Puzzle chunks live in a cache of their own that outlasts new versions of the game: the page asks for
// p/<band>/<k>.txt?v=<hash of that chunk>, so a chunk is downloaded again only when that chunk changes.
const PUZZLES = "king-walk-puzzles";
const SHELL = ["./", "index.html", "chess.js", "config.js", "manifest.webmanifest", "icons/icon-192.png", "icons/favicon.svg", "fonts/fredoka-latin-500-normal.woff2", "fonts/fredoka-latin-600-normal.woff2", "fonts/fredoka-latin-700-normal.woff2", "fonts/nunito-latin-400-normal.woff2", "fonts/nunito-latin-600-normal.woff2", "fonts/nunito-latin-700-normal.woff2", "fonts/nunito-latin-800-normal.woff2"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== PUZZLES).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  const keep = res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return res; };
  if (/\/p\/\d+\/\d+\.txt$/.test(url.pathname)) {          /* a puzzle chunk: this version from the cache, else download it and drop older versions */
    e.respondWith(caches.open(PUZZLES).then(c => c.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      if (res.ok) {
        const copy = res.clone();
        c.keys().then(reqs => Promise.all(reqs.filter(r => new URL(r.url).pathname === url.pathname && r.url !== e.request.url).map(r => c.delete(r)))).then(() => c.put(e.request, copy));
      }
      return res;
    }))));
  } else if (/\/(fonts|icons)\//.test(url.pathname)) {
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(keep)));
  } else {
    e.respondWith(fetch(e.request).then(keep).catch(() => caches.match(e.request, { ignoreSearch: true }).then(hit => hit || caches.match("index.html"))));
  }
});
