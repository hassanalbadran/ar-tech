'use strict';
/* Dev/test server for the Android web UI: serves app/ and emulates the native side.
 *   POST /__native/http  {url, body, method}  → the real Code.gs (Apps Script emulator, seeded demo clinic)
 *   GET  /__demo/pair    → {url, code}  (a fresh one-time pairing code)
 *   GET  /__demo/offline?on=1|0
 * usage: node dev/server.js [port]    (Node ≥ 22)
 */
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', 'app', 'src', 'main', 'assets', 'app');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };

function start(port) {
  const { createWorld } = require('../../desktop/test/helpers'), { seedDemo } = require('../../desktop/test/seed');
  const w = createWorld(); seedDemo(w.gas);
  const srv = http.createServer(function (req, res) {
    const u = new URL(req.url, 'http://x');
    const json = function (o, code) { res.writeHead(code || 200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (u.pathname === '/__demo/pair') return json({ url: w.URL, code: w.pairingCode() });
    if (u.pathname === '/__demo/offline') { w.net.online = u.searchParams.get('on') !== '1'; return json({ online: w.net.online }); }
    if (req.method === 'POST' && u.pathname === '/__native/http') {
      let b = ''; req.on('data', function (c) { b += c; });
      req.on('end', async function () {
        try {
          const r = JSON.parse(b);
          if (r.url !== w.URL) { res.writeHead(502); return res.end('blocked in dev'); }
          const out = await w.fetch(r.url, { method: 'POST', body: r.body });
          res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end(await out.text());
        } catch (e) { res.writeHead(502); res.end(String(e.message || e)); }
      });
      return;
    }
    let p = path.normalize(path.join(ROOT, u.pathname === '/' ? 'index.html' : decodeURIComponent(u.pathname)));
    if (p.indexOf(ROOT) !== 0 || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(p).pipe(res);
  });
  return new Promise(function (resolve) { srv.listen(port, '127.0.0.1', function () { resolve({ srv: srv, world: w, url: 'http://127.0.0.1:' + port }); }); });
}
module.exports = { start };
if (require.main === module) start(Number(process.argv[2] || 5188)).then(function (s) { console.log('android dev server →', s.url); });
