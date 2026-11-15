'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { createGas } = require('../../tools/gas-emulator');
const { createApi } = require('../lib/api');

const URL_ = 'https://script.google.com/macros/s/TESTDEPLOY123/exec';

/** Fake network: every POST goes to the REAL Code.gs running in the emulator. `net.online=false` simulates no internet. */
function createWorld(opts) {
  opts = opts || {};
  const gas = createGas({ now: opts.now || '2026-11-12T16:05:00+03:00' });
  gas.props.set('ADMIN_PIN', '4321');
  gas.call('setupSheets');
  const net = { online: true, calls: [], dropReplies: 0 };
  const fetch = async function (url, o) {
    if (!net.online) throw new TypeError('fetch failed');
    const body = JSON.parse(o.body); net.calls.push(body.action + (body.fn ? ':' + body.fn : ''));
    const out = gas.api(body);
    if (net.dropReplies > 0) { net.dropReplies--; throw new TypeError('reply lost'); } // the server DID process it
    return { status: 200, text: async function () { return JSON.stringify(out); }, json: async function () { return out; } };
  };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-desk-'));
  const hooksLog = { printed: [], saved: [], external: [] };
  const mk = function (over) {
    return createApi(Object.assign({
      dataDir: dir, appVersion: '1.0.0', config: { LICENSE_SERVER_URL: '', DEVELOPER_URL: 'https://t.me/hasn2mr', GITHUB_OWNER: '', GITHUB_REPO: '', APP_NAME: 'Clinic Manager' },
      fetch: fetch, now: function () { return gas.now(); }, engine: 'node:sqlite',
      hooks: {
        printHtml: async function (h, o) { hooksLog.printed.push({ h: h, o: o }); },
        saveFile: async function (n, t) { hooksLog.saved.push({ n: n, t: t }); return '/tmp/' + n; },
        openExternal: function (u) { hooksLog.external.push(u); }, printers: async function () { return [{ name: 'HP', isDefault: true }]; }
      }
    }, over || {}));
  };
  const pairingCode = function () { return gas.call('adminCreatePairingCode', '4321').code; };
  return { gas: gas, net: net, dir: dir, mk: mk, fetch: fetch, hooks: hooksLog, pairingCode: pairingCode, URL: URL_ };
}
module.exports = { createWorld, URL_ };
