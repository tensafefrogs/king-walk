// A small static file server for the test and store scripts: serves the repo root on a free port.
const http = require("http"), fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".txt": "text/plain; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".mp4": "video/mp4" };
exports.start = () => new Promise(resolve => {
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p.endsWith("/")) p += "index.html";
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    fs.readFile(f, (err, data) => {
      if (err) { res.writeHead(404); return res.end("not found"); }
      res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream" }); res.end(data);
    });
  });
  srv.listen(0, "127.0.0.1", () => resolve({ url: "http://127.0.0.1:" + srv.address().port + "/", close: () => srv.close() }));
});
