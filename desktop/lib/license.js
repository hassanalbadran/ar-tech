'use strict';
/**
 * License client (docs/LICENSING.md). Official builds: 30-day trial counted by the license server from the first time this
 * device was seen, then an activation key. Open builds (config.LICENSE_SERVER_URL empty) are always "active".
 * State lives in license.json (not in the clinic database) so it survives "unlink".
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { NetworkError, ServerError } = require('./transport');

const TRIAL_DAYS = 30, OFFLINE_ACTIVE_DAYS = 14, DAY = 86400000;

function createLicense(opts) {
  const file = path.join(opts.dataDir, 'license.json');
  const cfg = opts.config || {}, tr = opts.transport, now = function () { return opts.now ? opts.now() : Date.now(); };
  let data = null;

  function load() {
    if (data) return data;
    try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { data = null; }
    if (!data || typeof data !== 'object') data = {};
    if (!data.deviceId) data.deviceId = 'PC-' + crypto.randomBytes(8).toString('hex');
    if (!data.firstRun) data.firstRun = now();
    return data;
  }
  function save() {
    fs.mkdirSync(opts.dataDir, { recursive: true });
    const tmp = file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(data)); fs.renameSync(tmp, file);
  }
  const enforced = function () { return !!cfg.LICENSE_SERVER_URL; };
  const msg = {
    trial: function (d) { return 'نسخة تجريبية — بقي ' + d + (d === 1 ? ' يوم' : ' يوماً') + '.'; },
    active: 'النسخة مفعّلة.',
    expired: 'انتهت الفترة التجريبية. تواصل مع المطوّر للحصول على مفتاح تفعيل.',
    revoked: 'تم إيقاف هذا التفعيل. تواصل مع المطوّر.'
  };

  const api = {
    deviceId: function () { load(); save(); return data.deviceId; },
    enforced: enforced,
    status: function () {
      const d = load(), t = now();
      if (!enforced()) return { status: 'active', daysLeft: null, message: 'نسخة مفتوحة المصدر — بلا قيد ترخيص.', enforced: false, contactUrl: cfg.DEVELOPER_URL || '', hasKey: false };
      const base = { enforced: true, contactUrl: cfg.DEVELOPER_URL || '', hasKey: !!d.key, key: d.key ? d.key.slice(0, 7) + '…' : '' };
      const c = d.cache, localLeft = TRIAL_DAYS - Math.floor((t - d.firstRun) / DAY);
      if (c && c.status === 'revoked') return Object.assign(base, { status: 'revoked', daysLeft: 0, message: msg.revoked });
      if (c && c.status === 'active') {
        const age = (t - c.at) / DAY;
        if (age <= OFFLINE_ACTIVE_DAYS) {
          if (c.expiresAt && api._ymd(t) > c.expiresAt) return Object.assign(base, { status: 'expired', daysLeft: 0, message: 'انتهت صلاحية المفتاح. تواصل مع المطوّر.' });
          return Object.assign(base, { status: 'active', daysLeft: c.daysLeft, message: msg.active });
        }
        // too long without contact: fall back to the local trial clock (it is certainly over for a long-time user)
      }
      let left = c && c.status === 'trial' ? Math.min(localLeft, c.daysLeft - Math.floor((t - c.at) / DAY)) : localLeft;
      if (c && c.status === 'expired') left = 0;
      if (left > 0) return Object.assign(base, { status: 'trial', daysLeft: left, message: msg.trial(left) });
      return Object.assign(base, { status: 'expired', daysLeft: 0, message: msg.expired });
    },
    _ymd: function (t) { const d = new Date(t + 3 * 3600000); return d.toISOString().slice(0, 10); },
    _store: function (r) {
      const d = load();
      d.cache = { status: r.status, daysLeft: r.daysLeft, expiresAt: r.expiresAt || '', at: now() };
      save();
    },
    /** Contact the license server (never throws on network problems: the cached answer keeps working). */
    check: async function (force) {
      const d = load(); save();
      if (!enforced()) return api.status();
      if (!force && d.cache && d.cache.status !== 'expired' && d.cache.status !== 'revoked' && now() - d.cache.at < 12 * 3600000) return api.status(); // at most twice a day
      try {
        const r = await tr.post(cfg.LICENSE_SERVER_URL, { action: 'licenseCheck', deviceId: d.deviceId, platform: 'desktop', appVersion: opts.appVersion || '', label: opts.label || 'Windows PC', key: d.key || undefined }, 15000);
        api._store(r);
      } catch (e) {
        if (e instanceof ServerError && e.code === 'LICENSE') { d.cache = { status: 'revoked', daysLeft: 0, expiresAt: '', at: now() }; save(); }
        else if (!(e instanceof NetworkError)) { /* keep cache */ }
      }
      return api.status();
    },
    activate: async function (key) {
      const d = load();
      if (!enforced()) return api.status();
      const k = String(key || '').trim();
      if (!k) throw new Error('أدخل مفتاح التفعيل.');
      const r = await tr.post(cfg.LICENSE_SERVER_URL, { action: 'licenseActivate', deviceId: d.deviceId, key: k, platform: 'desktop', appVersion: opts.appVersion || '', label: opts.label || 'Windows PC' }, 20000);
      d.key = k.toUpperCase(); api._store(r);
      return api.status();
    },
    /** Throws the Arabic block message when the build is enforced and the license is expired/revoked. */
    assertUsable: function () {
      const s = api.status();
      if (s.status === 'expired' || s.status === 'revoked') throw new Error(s.message);
      return s;
    }
  };
  return api;
}

module.exports = { createLicense, TRIAL_DAYS };
