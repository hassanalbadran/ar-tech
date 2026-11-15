'use strict';
/**
 * settings.json (+ secrets.json, secret.key) in the app data directory.
 *  - settings.json: everything in docs/BRIDGE.md `settings`. Never contains a PIN. Written atomically (tmp file + rename).
 *  - Hide PIN: stored only as a scrypt hash with a random salt (cannot be recovered).
 *  - Finance PIN: must be recoverable because it is SENT to the server (finance calls check it there).
 *    It is encrypted at rest with AES-256-GCM using a random key kept in `secret.key` (mode 0600) next to it.
 *    This only protects against casual reading / copying of the settings folder; someone with access to both
 *    files can decrypt it. That is the best a desktop app can do without an OS keystore.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const C = require('./core');

const DEFAULT_HIDE_PIN = '1289';
const DEFAULT_FINANCE_PIN = '1234'; // = server default (CONFIG.FINANCE_PIN); the clinic changes it on the server and calls setFinancePin

function defaults() {
  return {
    role: 'secretary', doctorName: '', clinicName: '', logo: '',
    theme: { palette: 1, mode: 'system', fontScale: 1, contrast: 'normal' },
    printer: {
      enabled: false, printerName: '', paperType: '', paperSize: 'A5', customWmm: 148, customHmm: 210,
      template: { image: '', widthMm: 148, heightMm: 210, safeArea: { x: 0.1, y: 0.2, w: 0.8, h: 0.6 }, notesArea: null }
    },
    hiddenDays: [], firstRunDone: false
  };
}

const isObj = function (v) { return v && typeof v === 'object' && !Array.isArray(v); };
function deepMerge(base, patch) {
  if (!isObj(base) || !isObj(patch)) return patch;
  const out = Object.assign({}, base);
  Object.keys(patch).forEach(function (k) {
    out[k] = isObj(patch[k]) && isObj(base[k]) ? deepMerge(base[k], patch[k]) : (isObj(patch[k]) ? deepMerge({}, patch[k]) : patch[k]);
  });
  return out;
}
function atomicWrite(file, text, mode) {
  const tmp = file + '.' + process.pid + '.' + crypto.randomBytes(4).toString('hex') + '.tmp';
  const fd = fs.openSync(tmp, 'w', mode || 0o644);
  try { fs.writeSync(fd, text); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(tmp, file);
}

const num = function (v, lo, hi, def) { const n = Number(v); return isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def; };
const oneOf = function (v, list, def) { return list.indexOf(v) !== -1 ? v : def; };
const dataImage = function (v, maxBytes) { return v === '' || (typeof v === 'string' && /^data:image\/(png|jpe?g|webp|gif|svg\+xml);base64,/.test(v) && v.length <= maxBytes) ? v : undefined; };
function area(v, def) {
  if (v === null) return null;
  if (!isObj(v)) return def;
  const x = num(v.x, 0, 1, 0), y = num(v.y, 0, 1, 0);
  const w = num(v.w, 0.01, 1 - x, Math.min(0.5, 1 - x)), h = num(v.h, 0.01, 1 - y, Math.min(0.5, 1 - y));
  return { x: x, y: y, w: w, h: h };
}

/** Keep only known keys with sane values (the renderer is trusted, but a typo must not corrupt printing). */
function sanitizePatch(p) {
  const o = {};
  if (!isObj(p)) return o;
  if (p.role !== undefined && ['secretary', 'doctor'].indexOf(p.role) !== -1) o.role = p.role;
  ['doctorName', 'clinicName'].forEach(function (k) { if (typeof p[k] === 'string') o[k] = p[k].trim().slice(0, 150); });
  if (p.logo !== undefined) { const v = dataImage(p.logo, 3 * 1024 * 1024); if (v !== undefined) o.logo = v; }
  if (typeof p.firstRunDone === 'boolean') o.firstRunDone = p.firstRunDone;
  if (isObj(p.theme)) {
    const t = {};
    if (p.theme.palette !== undefined) t.palette = Math.round(num(p.theme.palette, 1, 4, 1));
    if (p.theme.mode !== undefined) t.mode = oneOf(p.theme.mode, ['light', 'dark', 'system'], 'system');
    if (p.theme.fontScale !== undefined) t.fontScale = num(p.theme.fontScale, 0.9, 1.4, 1);
    if (p.theme.contrast !== undefined) t.contrast = oneOf(p.theme.contrast, ['normal', 'high'], 'normal');
    o.theme = t;
  }
  if (isObj(p.printer)) {
    const s = p.printer, pr = {};
    if (typeof s.enabled === 'boolean') pr.enabled = s.enabled;
    if (typeof s.printerName === 'string') pr.printerName = s.printerName.slice(0, 200);
    if (typeof s.paperType === 'string') pr.paperType = s.paperType.slice(0, 60);
    if (s.paperSize !== undefined) pr.paperSize = oneOf(s.paperSize, ['A5', 'A4', 'custom'], 'A5');
    if (s.customWmm !== undefined) pr.customWmm = num(s.customWmm, 50, 450, 148);
    if (s.customHmm !== undefined) pr.customHmm = num(s.customHmm, 50, 650, 210);
    if (isObj(s.template)) {
      const tp = {}, st = s.template;
      if (st.image !== undefined) { const v = dataImage(st.image, 12 * 1024 * 1024); if (v !== undefined) tp.image = v; }
      if (st.widthMm !== undefined) tp.widthMm = num(st.widthMm, 20, 1000, 148);
      if (st.heightMm !== undefined) tp.heightMm = num(st.heightMm, 20, 1000, 210);
      if (st.safeArea !== undefined && st.safeArea !== null) tp.safeArea = area(st.safeArea, undefined);
      if (st.notesArea !== undefined) tp.notesArea = area(st.notesArea, null);
      pr.template = tp;
    }
    o.printer = pr;
  }
  return o; // hiddenDays / PINs are deliberately NOT accepted here (hideDay/unhideDay/changePin own them)
}

function createSettings(opts) {
  const dir = opts.dataDir;
  const now = opts.now || Date.now;
  const fSettings = path.join(dir, 'settings.json'), fSecrets = path.join(dir, 'secrets.json'), fKey = path.join(dir, 'secret.key');
  let data = null, secrets = null, key = null;
  const fails = { hide: { n: 0, until: 0 }, finance: { n: 0, until: 0 } };

  function readJson(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return null; } }
  function getKey() {
    if (key) return key;
    try { key = fs.readFileSync(fKey); if (key.length !== 32) key = null; } catch (e) { key = null; }
    if (!key) { key = crypto.randomBytes(32); atomicWrite(fKey, key, 0o600); }
    return key;
  }
  function hashPin(pin, saltHex) {
    const salt = saltHex ? Buffer.from(saltHex, 'hex') : crypto.randomBytes(16);
    return { salt: salt.toString('hex'), hash: crypto.scryptSync(pin, salt, 32).toString('hex') };
  }
  function encrypt(text) {
    const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
    const enc = Buffer.concat([c.update(text, 'utf8'), c.final()]);
    return { iv: iv.toString('hex'), tag: c.getAuthTag().toString('hex'), data: enc.toString('hex') };
  }
  function decrypt(o) {
    const d = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(o.iv, 'hex'));
    d.setAuthTag(Buffer.from(o.tag, 'hex'));
    return Buffer.concat([d.update(Buffer.from(o.data, 'hex')), d.final()]).toString('utf8');
  }
  function saveSecrets() { atomicWrite(fSecrets, JSON.stringify(secrets), 0o600); }
  function normPin(p) { const s = C.digits(p).trim(); return /^\d{4}$/.test(s) ? s : null; }

  const api = {
    DEFAULT_HIDE_PIN: DEFAULT_HIDE_PIN,
    load: function () {
      fs.mkdirSync(dir, { recursive: true });
      const saved = readJson(fSettings);
      data = deepMerge(defaults(), isObj(saved) ? saved : {});
      data.hiddenDays = Array.isArray(data.hiddenDays) ? data.hiddenDays.filter(function (d) { return C.parseYmd(d); }).sort() : [];
      secrets = readJson(fSecrets);
      if (!isObj(secrets)) secrets = {};
      let dirty = false;
      if (!secrets.hide) { secrets.hide = hashPin(DEFAULT_HIDE_PIN); dirty = true; }
      if (!secrets.finance) { secrets.finance = encrypt(DEFAULT_FINANCE_PIN); dirty = true; }
      if (dirty) saveSecrets();
      return api.get();
    },
    /** Copy of the settings for the renderer (no secrets are inside by construction). */
    get: function () { if (!data) api.load(); return JSON.parse(JSON.stringify(data)); },
    set: function (patch) {
      if (!data) api.load();
      data = deepMerge(data, sanitizePatch(patch));
      atomicWrite(fSettings, JSON.stringify(data, null, 1));
      return api.get();
    },
    /** Internal: hidden days are changed only by hideDay/unhideDay after a PIN check. */
    setHiddenDays: function (list) {
      if (!data) api.load();
      data.hiddenDays = Array.from(new Set(list.filter(function (d) { return C.parseYmd(d); }))).sort();
      atomicWrite(fSettings, JSON.stringify(data, null, 1));
      return data.hiddenDays.slice();
    },
    verifyPin: function (kind, pin) {
      if (!data) api.load();
      if (kind !== 'hide' && kind !== 'finance') throw new Error('نوع الرمز غير معروف.');
      const f = fails[kind];
      if (f.until > now()) throw new Error('محاولات كثيرة خاطئة. حاول بعد دقيقة.');
      const p = normPin(pin);
      let ok = false;
      if (p) {
        if (kind === 'hide') {
          const h = hashPin(p, secrets.hide.salt).hash;
          ok = crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(secrets.hide.hash, 'hex'));
        } else {
          const cur = Buffer.from(api.getFinancePin()), given = Buffer.from(p);
          ok = cur.length === given.length && crypto.timingSafeEqual(cur, given);
        }
      }
      if (ok) { f.n = 0; return true; }
      if (++f.n >= 5) { f.n = 0; f.until = now() + 60000; }
      return false;
    },
    changePin: function (kind, oldPin, newPin) {
      if (!api.verifyPin(kind, oldPin)) throw new Error('الرمز الحالي غير صحيح.');
      const n = normPin(newPin);
      if (!n) throw new Error('الرمز الجديد يجب أن يتكوّن من 4 أرقام.');
      if (kind === 'hide') secrets.hide = hashPin(n); else secrets.finance = encrypt(n);
      saveSecrets();
      return true;
    },
    /** The finance PIN as sent to the server. Never exposed to the renderer. */
    getFinancePin: function () { if (!data) api.load(); return decrypt(secrets.finance); },
    setFinancePin: function (pin) {
      if (!data) api.load();
      const n = normPin(pin);
      if (!n) throw new Error('رمز المالية يجب أن يتكوّن من 4 أرقام.');
      secrets.finance = encrypt(n); saveSecrets(); return true;
    }
  };
  return api;
}

module.exports = { createSettings, defaults, deepMerge, atomicWrite, sanitizePatch };
