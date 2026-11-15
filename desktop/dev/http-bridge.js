'use strict';
/**
 * Browser-testing bridge: serves renderer/ and exposes lib/api.js over HTTP so the UI can be driven by Playwright / a normal browser.
 *   POST /cm/<method>   body = JSON array of arguments → {result} | {error}
 *   GET  /cm/events     Server-Sent Events {name,payload}
 * CLI:  node dev/http-bridge.js --port 5177 --data ./.devdata         (real network)
 *       node dev/http-bridge.js --demo                                 (fake clinic: Code.gs in the Apps Script emulator, already linked)
 */
const http = require('http'), fs = require('fs'), path = require('path');
const { createApi } = require('../lib/api');

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.json': 'application/json' };
const ROOT = path.join(__dirname, '..', 'renderer');

function start(o) {
  o = o || {};
  const api = createApi(Object.assign({ appVersion: '1.0.0', config: require('../config'), engine: 'node:sqlite', hooks: {} }, o.api || {}, { dataDir: o.dataDir }));
  const clients = new Set();
  ['state', 'data', 'toast', 'event', 'boot'].forEach(function (ev) {
    api.on(ev, function (payload) { const line = 'data: ' + JSON.stringify({ name: ev, payload: payload === undefined ? null : payload }) + '\n\n'; clients.forEach(function (r) { r.write(line); }); });
  });
  const srv = http.createServer(function (req, res) {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/cm/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' }); res.write(': ok\n\n');
      clients.add(res); req.on('close', function () { clients.delete(res); }); return;
    }
    if (req.method === 'POST' && u.pathname.indexOf('/cm/') === 0) {
      const name = u.pathname.slice(4);
      let b = ''; req.on('data', function (c) { b += c; });
      req.on('end', async function () {
        res.setHeader('Content-Type', 'application/json');
        try {
          if (!Object.prototype.hasOwnProperty.call(api.methods, name)) throw new Error('method not found: ' + name);
          const args = b ? JSON.parse(b) : [];
          const out = await api.methods[name].apply(null, args);
          res.end(JSON.stringify({ result: out === undefined ? null : out }));
        } catch (e) { res.end(JSON.stringify({ error: e && e.message || String(e) })); }
      });
      return;
    }
    let p = decodeURIComponent(u.pathname); if (p === '/') p = '/index.html';
    const f = path.normalize(path.join(ROOT, p));
    if (f.indexOf(ROOT) !== 0 || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(f).pipe(res);
  });
  return new Promise(function (ok) {
    srv.listen(o.port || 0, '127.0.0.1', function () {
      ok({ url: 'http://127.0.0.1:' + srv.address().port, api: api, close: function () { clients.forEach(function (r) { r.end(); }); api.dispose(); srv.close(); } });
    });
  });
}

module.exports = { start };

if (require.main === module) {
  const arg = function (n, d) { const i = process.argv.indexOf('--' + n); return i > -1 ? process.argv[i + 1] : d; };
  const demo = process.argv.includes('--demo');
  (async function () {
    let dataDir = arg('data', ''), extra = {};
    if (demo) {
      // fake clinic: the real Code.gs inside the Apps Script emulator, pre-seeded and already linked
      const { createWorld } = require('../test/helpers');
      const { seedDemo } = require('../test/seed');
      const w = createWorld();
      seedDemo(w.gas);
      dataDir = dataDir || fs.mkdtempSync(require('os').tmpdir() + '/cm-demo-');
      extra = { fetch: w.fetch, now: function () { return w.gas.now(); } };
      const s = await start({ port: Number(arg('port', 5177)), dataDir: path.resolve(dataDir), api: extra });
      await s.api.methods.link({ url: w.URL, code: w.pairingCode() });
      console.log('cm dev bridge (demo clinic, linked) →', s.url);
      return;
    }
    const s = await start({ port: Number(arg('port', 5177)), dataDir: path.resolve(dataDir || './.devdata') });
    console.log('cm dev bridge →', s.url);
  })();
}
