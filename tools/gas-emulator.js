'use strict';
/*
 * Minimal Google Apps Script emulator used to run the REAL server/Code.gs in Node for tests
 * (and as a local development server, see tools/dev-server.js).
 *
 * Emulated: SpreadsheetApp (in-memory, incl. the "@ text format" behaviour and Sheets' habit of turning
 * date-like / numeric-looking strings into Date / Number in cells that are NOT text-formatted),
 * PropertiesService, CacheService (TTL), LockService, Utilities, ContentService, HtmlService, Logger, ScriptApp.
 * Time is fake and controllable: gas.setNow('2026-11-11T16:05:00+03:00').
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const TZ_OFFSET_MS = 3 * 3600 * 1000; // Asia/Baghdad

function pad(n, w) { return String(n).padStart(w || 2, '0'); }

function createGas(opts) {
  opts = opts || {};
  const codePath = opts.codePath || path.join(__dirname, '..', 'server', 'Code.gs');
  let nowMs = opts.now ? new Date(opts.now).getTime() : Date.now();
  const FakeDate = class extends Date {
    constructor(...a) { if (a.length === 0) super(nowMs); else super(...a); }
    static now() { return nowMs; }
  };

  // ---------------- sheets ----------------
  const colorless = () => undefined;
  function looksLikeDate(s) { return /^\d{4}-\d{2}-\d{2}(\s|T|$)/.test(s) || /^\d{1,2}[\/.-]\d{1,2}[\/.-]\d{4}/.test(s); }
  function coerce(v, fmt) {
    if (fmt === '@') return v === null || v === undefined ? '' : String(v);
    if (typeof v === 'string') {
      if (looksLikeDate(v)) { const d = new Date(v.length <= 10 ? v + 'T00:00:00Z' : v.replace(' ', 'T') + 'Z'); if (!isNaN(d)) return new FakeDate(d.getTime() - TZ_OFFSET_MS); }
      if (/^\d+(\.\d+)?$/.test(v) && v.length < 16) return Number(v);
    }
    return v;
  }

  class Range {
    constructor(sheet, r, c, nr, nc) { this.sheet = sheet; this.r = r; this.c = c; this.nr = nr; this.nc = nc; }
    getRow() { return this.r; }
    getValues() {
      const out = [];
      for (let i = 0; i < this.nr; i++) { const row = []; for (let j = 0; j < this.nc; j++) { const cell = this.sheet._cell(this.r + i, this.c + j); row.push(cell ? cell.v : ''); } out.push(row); }
      return out;
    }
    getDisplayValues() { return this.getValues().map(r => r.map(v => (v === null || v === undefined ? '' : v instanceof Date ? v.toISOString() : String(v)))); }
    getValue() { return this.getValues()[0][0]; }
    setValues(vals) {
      for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) {
        const cell = this.sheet._ensure(this.r + i, this.c + j);
        cell.v = coerce(vals[i][j], cell.fmt);
      }
      return this;
    }
    setValue(v) { return this.setValues([[v]]); }
    getNumberFormats() { const out = []; for (let i = 0; i < this.nr; i++) { const row = []; for (let j = 0; j < this.nc; j++) { const cell = this.sheet._cell(this.r + i, this.c + j); row.push(cell ? cell.fmt : 'General'); } out.push(row); } return out; }
    setNumberFormats(f) { for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.sheet._ensure(this.r + i, this.c + j).fmt = f[i][j]; return this; }
    setNumberFormat(f) { for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.sheet._ensure(this.r + i, this.c + j).fmt = f; return this; }
    copyTo() { return this; }
    createTextFinder(text) {
      const self = this; let whole = false, matchCase = false;
      const f = {
        matchCase(b) { matchCase = !!b; return f; }, matchEntireCell(b) { whole = !!b; return f; },
        findAll() {
          const hits = [];
          for (let i = 0; i < self.nr; i++) for (let j = 0; j < self.nc; j++) {
            const cell = self.sheet._cell(self.r + i, self.c + j); if (!cell) continue;
            let v = cell.v instanceof Date ? cell.v.toISOString() : String(cell.v), t = text;
            if (!matchCase) { v = v.toLowerCase(); t = t.toLowerCase(); }
            if (whole ? v === t : v.indexOf(t) !== -1) hits.push(new Range(self.sheet, self.r + i, self.c + j, 1, 1));
          }
          return hits;
        }
      };
      return f;
    }
  }

  class Sheet {
    constructor(ss, name) { this.ss = ss; this.name = name; this.cells = new Map(); this.maxRows = 1000; this.maxCols = 26; this.frozen = 0; }
    _key(r, c) { return r + ',' + c; }
    _cell(r, c) { return this.cells.get(this._key(r, c)); }
    _ensure(r, c) { const k = this._key(r, c); let x = this.cells.get(k); if (!x) { x = { v: '', fmt: 'General' }; this.cells.set(k, x); } return x; }
    getName() { return this.name; }
    getLastRow() { let m = 0; this.cells.forEach((cell, k) => { if (cell.v !== '' && cell.v !== null && cell.v !== undefined) m = Math.max(m, +k.split(',')[0]); }); return m; }
    getMaxRows() { return this.maxRows; }
    getMaxColumns() { return this.maxCols; }
    insertRowsAfter(after, n) { this.maxRows += n; }
    insertColumnsAfter(after, n) { this.maxCols += n; }
    setFrozenRows(n) { this.frozen = n; }
    getRange(r, c, nr, nc) { return new Range(this, r, c, nr || 1, nc || 1); }
    deleteRows(from, n) {
      const next = new Map();
      this.cells.forEach((cell, k) => {
        const [r, c] = k.split(',').map(Number);
        if (r >= from && r < from + n) return;
        next.set(this._key(r >= from + n ? r - n : r, c), cell);
      });
      this.cells = next;
    }
  }

  class Spreadsheet {
    constructor(id) { this.id = id; this.sheets = new Map(); }
    getName() { return 'Spreadsheet ' + this.id; }
    getSheetByName(n) { return this.sheets.get(n) || null; }
    insertSheet(n) { const s = new Sheet(this, n); this.sheets.set(n, s); return s; }
  }
  const books = new Map();
  const SpreadsheetApp = {
    openById(id) { if (!books.has(id)) books.set(id, new Spreadsheet(id)); return books.get(id); },
    flush() {},
    CopyPasteType: { PASTE_FORMAT: 'PASTE_FORMAT' }
  };

  // ---------------- properties / cache / lock ----------------
  const props = new Map();
  const PropertiesService = {
    getScriptProperties() {
      return {
        getProperty: k => (props.has(k) ? props.get(k) : null),
        setProperty(k, v) { props.set(k, String(v)); return this; },
        setProperties(o) { Object.keys(o).forEach(k => props.set(k, String(o[k]))); return this; },
        deleteProperty(k) { props.delete(k); return this; },
        getProperties() { const o = {}; props.forEach((v, k) => (o[k] = v)); return o; }
      };
    }
  };
  const cacheMap = new Map();
  const CacheService = {
    getScriptCache() {
      return {
        get(k) { const e = cacheMap.get(k); if (!e) return null; if (e.exp <= nowMs) { cacheMap.delete(k); return null; } return e.v; },
        put(k, v, ttl) { if (String(v).length > 100000) throw new Error('cache value too large'); cacheMap.set(k, { v: String(v), exp: nowMs + (ttl || 600) * 1000 }); },
        getAll(keys) { const o = {}; keys.forEach(k => { const v = this.get(k); if (v !== null) o[k] = v; }); return o; },
        putAll(o, ttl) { Object.keys(o).forEach(k => this.put(k, o[k], ttl)); },
        remove(k) { cacheMap.delete(k); },
        removeAll(keys) { keys.forEach(k => cacheMap.delete(k)); }
      };
    }
  };
  let lockHeld = false;
  const LockService = {
    getScriptLock() {
      return {
        waitLock() { if (lockHeld) throw new Error('Could not obtain lock (not re-entrant)'); lockHeld = true; },
        tryLock() { if (lockHeld) return false; lockHeld = true; return true; },
        hasLock() { return lockHeld; },
        releaseLock() { lockHeld = false; }
      };
    }
  };

  // ---------------- Utilities ----------------
  function fmtDate(d, tz, f) {
    const t = new Date(d.getTime() + TZ_OFFSET_MS);
    const map = { yyyy: t.getUTCFullYear(), MM: pad(t.getUTCMonth() + 1), dd: pad(t.getUTCDate()), HH: pad(t.getUTCHours()), mm: pad(t.getUTCMinutes()), ss: pad(t.getUTCSeconds()) };
    return f.replace(/yyyy|MM|dd|HH|mm|ss/g, m => map[m]);
  }
  const Utilities = {
    formatDate: fmtDate,
    parseDate(s, tz, f) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); return new FakeDate(Date.UTC(+m[1], +m[2] - 1, +m[3]) - TZ_OFFSET_MS); },
    getUuid: () => crypto.randomUUID(),
    computeDigest(alg, s) { return Array.from(crypto.createHash('sha256').update(String(s)).digest()).map(b => (b > 127 ? b - 256 : b)); },
    DigestAlgorithm: { SHA_256: 'SHA_256' }, Charset: { UTF_8: 'UTF_8' }
  };
  const ContentService = {
    MimeType: { JSON: 'JSON' },
    createTextOutput(s) { return { getContent: () => s, setMimeType() { return this; } }; }
  };
  const HtmlService = {
    createHtmlOutputFromFile(name) {
      const f = path.join(path.dirname(codePath), name + '.html');
      const o = { getContent: () => fs.readFileSync(f, 'utf8') };
      o.setTitle = () => o; o.addMetaTag = () => o; o.setFaviconUrl = () => o; o.setXFrameOptionsMode = () => o;
      return o;
    }
  };

  const sandbox = {
    SpreadsheetApp, PropertiesService, CacheService, LockService, Utilities, ContentService, HtmlService,
    Logger: { log() {} }, ScriptApp: { getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/TEST/exec' }) },
    Date: FakeDate, console, JSON, Math, Object, Array, String, Number, Boolean, RegExp, Error, Map, Set, parseInt, parseFloat, isNaN
  };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(codePath, 'utf8'), ctx, { filename: 'Code.gs' });
  // top-level `const`/`function` declarations live in the script scope: expose them through eval
  const run = code => vm.runInContext(code, ctx);

  ctx.__code = '';
  const gas = {
    ctx, run, props, books,
    setNow(v) { nowMs = new Date(v).getTime(); },
    advance(ms) { nowMs += ms; },
    now() { return nowMs; },
    /** call any global function: gas.call('addNewBooking', {...}) */
    call(fn, ...args) {
      // website functions go through the real door (allow-list, rate limit, size cap), exactly like google.script.run.siteCall
      if (run('Object.prototype.hasOwnProperty.call(siteApi_(), ' + JSON.stringify(fn) + ')')) { ctx.__fn = fn; ctx.__args = args; return run('siteCall(__fn, __args, __code)'); }
      ctx.__args = args; return run(fn + '(...__args)');
    },
    /** site access code sent by the page (only matters when SITE_ACCESS_CODE is set) */
    setSiteCode(c) { ctx.__code = c; },
    /** HTTP-style API call: returns parsed JSON */
    api(req) {
      const out = run('doPost')({ postData: { contents: JSON.stringify(req) } });
      return JSON.parse(out.getContent());
    },
    sheet(name, id) { const ss = SpreadsheetApp.openById(id || run('CONFIG').NEW_SHEET_ID); return ss.getSheetByName(name); },
    /** all data rows of a sheet as arrays */
    rows(name) { const s = gas.sheet(name); if (!s) return []; const n = s.getLastRow(); return n < 2 ? [] : s.getRange(2, 1, n - 1, run('HEADERS')[name].length).getValues(); }
  };
  return gas;
}

module.exports = { createGas };
