'use strict';
/**
 * Local SQLite mirror of the server sheets.
 *
 * Every sheet table keeps the sheet row number as `r INTEGER PRIMARY KEY` and one column per sheet header
 * (named exactly like the header). Extra columns (all prefixed `x_`):
 *   x_pending  1 = provisional row created by a still-queued write (negative `r`, see applyLocal.js)
 *   x_overlay  JSON {Header: value} of optimistic patches that a queued write applied to a REAL row
 *   x_*        derived search keys (name key, phone keys, normalised dates)
 * Invariant: real rows (r > 0, x_overlay NULL) = last server snapshot. Everything optimistic is removed by
 * clearPending() and re-applied from the outbox after every snapshot/delta (applyLocal.rebuild).
 */
const sqlite = require('./sqlite');
const K = require('./serverConsts');
const M = require('./mappers');

const LOCAL = { Patient_Records: 'patient_records', Financials: 'financials', Bookings: 'bookings', Surgeries: 'surgeries', Drugs: 'drugs' };
const TYPES = { Age: '', Escorts_Count: '', Amount: 'REAL', Use_Count: 'REAL' }; // '' = no affinity (keeps numbers and '6M' as given)
const DERIVED = {
  Patient_Records: ['x_name_key', 'x_phones', 'x_visit_date'],
  Financials: ['x_date'], Bookings: ['x_call_date'], Surgeries: ['x_date'], Drugs: []
};
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const q = function (n) { return '"' + n + '"'; };

function derive(sheet, o) {
  const s = function (h) { return o[h] === undefined || o[h] === null ? '' : o[h]; };
  switch (sheet) {
    case 'Patient_Records':
      return {
        x_name_key: M.normalizeArabic(s('Full_Name')),
        x_phones: [M.phoneDigits(s('Phone')), M.phoneDigits(s('Secondary_Phone')), M.phoneKey(s('Phone')), M.phoneKey(s('Secondary_Phone'))].filter(Boolean).join(' '),
        x_visit_date: M.toYmd(s('Visit_Date'))
      };
    case 'Financials': return { x_date: M.toYmd(s('Date')) };
    case 'Bookings': return { x_call_date: M.toYmd(M.toDateTimeString(s('Call_Time'))) };
    case 'Surgeries': return { x_date: M.toYmd(s('Operation_Date')) };
    default: return {};
  }
}

function createTableSql(sheet, headers) {
  const cols = headers.filter(function (h) { return IDENT.test(h); }).map(function (h) { return q(h) + ' ' + (TYPES[h] !== undefined ? TYPES[h] : 'TEXT'); });
  DERIVED[sheet].forEach(function (c) { cols.push(c + ' TEXT'); });
  cols.push('x_pending INTEGER NOT NULL DEFAULT 0', 'x_overlay TEXT');
  return 'CREATE TABLE IF NOT EXISTS ' + LOCAL[sheet] + ' (r INTEGER PRIMARY KEY, ' + cols.join(', ') + ')';
}

const MIGRATIONS = [
  function v1(db) {
    Object.keys(LOCAL).forEach(function (sheet) { db.exec(createTableSql(sheet, K.HEADERS[sheet])); });
    db.exec('CREATE INDEX IF NOT EXISTS ix_pr_date ON patient_records (x_visit_date)');
    db.exec('CREATE INDEX IF NOT EXISTS ix_pr_pid ON patient_records (Patient_ID)');
    db.exec('CREATE INDEX IF NOT EXISTS ix_pr_name ON patient_records (x_name_key)');
    db.exec('CREATE INDEX IF NOT EXISTS ix_fin_date ON financials (x_date)');
    db.exec('CREATE INDEX IF NOT EXISTS ix_bk_date ON bookings (x_call_date)');
    db.exec('CREATE INDEX IF NOT EXISTS ix_sg_status ON surgeries (Status)');
    db.exec('CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT)');
    db.exec('CREATE TABLE IF NOT EXISTS events_cache (id INTEGER PRIMARY KEY, date TEXT, json TEXT NOT NULL)');
    db.exec('CREATE TABLE IF NOT EXISTS outbox (id INTEGER PRIMARY KEY AUTOINCREMENT, cid TEXT NOT NULL UNIQUE, fn TEXT NOT NULL, args TEXT NOT NULL, ' +
      "created_at INTEGER NOT NULL, tries INTEGER NOT NULL DEFAULT 0, last_error TEXT, state TEXT NOT NULL DEFAULT 'pending')");
    db.exec('CREATE INDEX IF NOT EXISTS ix_outbox_state ON outbox (state, id)');
  }
];
const SCHEMA_VERSION = MIGRATIONS.length;

function migrate(db) {
  const cur = db.get('PRAGMA user_version').user_version;
  if (cur > SCHEMA_VERSION) throw new Error('قاعدة البيانات المحلية أحدث من هذا الإصدار من التطبيق. حدّث التطبيق.');
  for (let v = cur; v < SCHEMA_VERSION; v++) {
    db.transaction(function () { MIGRATIONS[v](db); });
    db.exec('PRAGMA user_version = ' + (v + 1));
  }
}

function openDatabase(file, opts) {
  const db = sqlite.open(file, opts);
  migrate(db);
  return db;
}

function createKv(db) {
  return {
    get: function (key, def) { const r = db.get('SELECT value FROM kv WHERE key = ?', key); return r ? r.value : (def === undefined ? null : def); },
    set: function (key, val) {
      if (val === null || val === undefined) db.run('DELETE FROM kv WHERE key = ?', key);
      else db.run('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, String(val));
    },
    del: function (key) { db.run('DELETE FROM kv WHERE key = ?', key); },
    getJson: function (key, def) {
      const r = db.get('SELECT value FROM kv WHERE key = ?', key);
      if (!r) return def === undefined ? null : def;
      try { return JSON.parse(r.value); } catch (e) { return def === undefined ? null : def; }
    },
    setJson: function (key, val) { this.set(key, val === null || val === undefined ? null : JSON.stringify(val)); },
    clear: function () { db.run('DELETE FROM kv'); }
  };
}

/**
 * Row access by sheet name. getHeaders(sheet) must return the header list of the cached server config
 * (or the defaults). Rows crossing this API are `{ r, pending, cells }` where cells follow the header order and
 * already include optimistic overlays.
 */
function createTables(db, getHeaders) {
  const t = {
    LOCAL: LOCAL,
    /** ALTER TABLE ADD COLUMN for any header the server added since the table was created. */
    ensureColumns: function () {
      Object.keys(LOCAL).forEach(function (sheet) {
        const have = {};
        db.all('PRAGMA table_info(' + LOCAL[sheet] + ')').forEach(function (c) { have[c.name] = 1; });
        getHeaders(sheet).forEach(function (h) {
          if (IDENT.test(h) && !have[h]) db.exec('ALTER TABLE ' + LOCAL[sheet] + ' ADD COLUMN ' + q(h) + ' ' + (TYPES[h] !== undefined ? TYPES[h] : 'TEXT'));
        });
      });
    },
    _headers: function (sheet) { return getHeaders(sheet).filter(function (h) { return IDENT.test(h); }); },
    _toRow: function (sheet, dbRow) {
      let ov = null;
      if (dbRow.x_overlay) { try { ov = JSON.parse(dbRow.x_overlay); } catch (e) { ov = null; } }
      const cells = t._headers(sheet).map(function (h) {
        if (ov && Object.prototype.hasOwnProperty.call(ov, h)) return ov[h];
        const v = dbRow[h]; return v === undefined || v === null ? '' : v;
      });
      return { r: dbRow.r, pending: dbRow.x_pending === 1, cells: cells };
    },
    select: function (sheet, where, params, order) {
      const rows = db.all('SELECT * FROM ' + LOCAL[sheet] + (where ? ' WHERE ' + where : '') + (order ? ' ORDER BY ' + order : ''), ...(params || []));
      const out = [];
      rows.forEach(function (row) { try { out.push(t._toRow(sheet, row)); } catch (e) { /* a corrupt row must never break a list */ } });
      return out;
    },
    get: function (sheet, r) { const x = t.select(sheet, 'r = ?', [r]); return x[0] || null; },
    count: function (sheet) { return db.get('SELECT COUNT(*) AS n FROM ' + LOCAL[sheet]).n; },
    _insert: function (sheet, r, obj, pending) {
      const headers = t._headers(sheet), dv = derive(sheet, obj), dcols = DERIVED[sheet];
      const names = ['r'].concat(headers.map(q), dcols, ['x_pending', 'x_overlay']);
      const vals = [r].concat(headers.map(function (h) { return obj[h] === undefined ? '' : obj[h]; }), dcols.map(function (c) { return dv[c]; }), [pending ? 1 : 0, null]);
      db.run('INSERT OR REPLACE INTO ' + LOCAL[sheet] + ' (' + names.join(',') + ') VALUES (' + names.map(function () { return '?'; }).join(',') + ')', ...vals);
    },
    _objFromArray: function (sheet, row) {
      const o = {}; t._headers(sheet).forEach(function (h, i) { o[h] = row[i + 1]; }); return o;
    },
    /** Server rows [r, c1..cN] -> upsert by row number. */
    upsert: function (sheet, rows) {
      (rows || []).forEach(function (row) {
        const r = Number(row[0]);
        if (!isFinite(r) || r < 1) return;
        try { t._insert(sheet, r, t._objFromArray(sheet, row), false); } catch (e) { /* skip unusable row */ }
      });
    },
    /** Replace a whole table (snapshot, or Bookings which is always replaced wholesale). Removes pending rows too. */
    replace: function (sheet, rows) { db.run('DELETE FROM ' + LOCAL[sheet]); t.upsert(sheet, rows); },
    /** Provisional row for a queued write. `values` = object keyed by header name. */
    insertPending: function (sheet, r, values) { t._insert(sheet, r, values, true); },
    /** Merge optimistic column overrides {Header: value} into a (real or pending) row. */
    setOverlay: function (sheet, r, patch) {
      const row = db.get('SELECT x_overlay FROM ' + LOCAL[sheet] + ' WHERE r = ?', r);
      if (!row) return false;
      let cur = {}; try { cur = row.x_overlay ? JSON.parse(row.x_overlay) : {}; } catch (e) { cur = {}; }
      db.run('UPDATE ' + LOCAL[sheet] + ' SET x_overlay = ? WHERE r = ?', JSON.stringify(Object.assign(cur, patch)), r);
      return true;
    },
    /** Drop every optimistic effect (provisional rows + overlays). */
    clearPending: function () {
      Object.keys(LOCAL).forEach(function (sheet) {
        db.run('DELETE FROM ' + LOCAL[sheet] + ' WHERE x_pending = 1');
        db.run('UPDATE ' + LOCAL[sheet] + ' SET x_overlay = NULL WHERE x_overlay IS NOT NULL');
      });
    },
    /** Raw server rows (no pending rows, no overlays) as [r, ...cells]; used by exportData. */
    dump: function (sheet) {
      const headers = t._headers(sheet);
      return db.all('SELECT * FROM ' + LOCAL[sheet] + ' WHERE x_pending = 0 AND r > 0 ORDER BY r').map(function (row) {
        return [row.r].concat(headers.map(function (h) { return row[h] === undefined ? '' : row[h]; }));
      });
    },
    wipe: function () {
      Object.keys(LOCAL).forEach(function (sheet) { db.run('DELETE FROM ' + LOCAL[sheet]); });
      db.run('DELETE FROM events_cache'); db.run('DELETE FROM outbox');
    }
  };
  return t;
}

module.exports = { openDatabase, migrate, createKv, createTables, derive, LOCAL, SCHEMA_VERSION, DERIVED };
