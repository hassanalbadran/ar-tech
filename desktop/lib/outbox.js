'use strict';
/**
 * Durable queue of writes (table `outbox`). FIFO, strictly ordered. Each item carries a uuid `cid`; a retry after a
 * network failure re-sends the SAME cid, and the server (idempotent by cid for 6 h) returns the first answer instead
 * of writing twice.
 *
 * Provisional ids: an optimistic row created for item N uses row number provRow(N) (negative) and the id 'TMP-N'.
 * Later queued items may reference them; when item N succeeds the server's real row number / id is stored in the
 * "refmap" (kv) and substituted into the args of later items right before they are sent.
 */
const crypto = require('crypto');

const provRow = function (id, seq) { return -(id * 100 + (seq || 0)); };
const provId = function (id) { return 'TMP-' + id; };
const REF_TTL_MS = 48 * 3600 * 1000;
const KEEP_FAILED = 30;

function createOutbox(ctx) {
  const db = ctx.db, kv = ctx.kv, now = function () { return ctx.now ? ctx.now() : Date.now(); };
  const waiters = new Map(); // id -> [resolve]

  const parse = function (r) { return r ? { id: r.id, cid: r.cid, fn: r.fn, args: JSON.parse(r.args), createdAt: r.created_at, tries: r.tries, lastError: r.last_error, state: r.state } : null; };

  function refs() { return kv.getJson('refmap', { rows: {}, ids: {} }); }
  function saveRefs(m) {
    const t = now();
    ['rows', 'ids'].forEach(function (k) { Object.keys(m[k]).forEach(function (key) { if (t - m[k][key].at > REF_TTL_MS) delete m[k][key]; }); });
    kv.setJson('refmap', m);
  }

  const ob = {
    provRow: provRow, provId: provId,
    add: function (fn, args) {
      const cid = crypto.randomUUID();
      const r = db.run('INSERT INTO outbox (cid, fn, args, created_at, tries, state) VALUES (?, ?, ?, ?, 0, ?)', cid, fn, JSON.stringify(args), now(), 'pending');
      return { id: r.lastInsertRowid, cid: cid, fn: fn, args: args, createdAt: now(), tries: 0, lastError: null, state: 'pending' };
    },
    get: function (id) { return parse(db.get('SELECT * FROM outbox WHERE id = ?', id)); },
    pending: function () { return db.all("SELECT * FROM outbox WHERE state = 'pending' ORDER BY id").map(parse); },
    failed: function () { return db.all("SELECT * FROM outbox WHERE state = 'failed' ORDER BY id").map(parse); },
    next: function () { return parse(db.get("SELECT * FROM outbox WHERE state = 'pending' ORDER BY id LIMIT 1")); },
    count: function () { return db.get("SELECT COUNT(*) AS n FROM outbox WHERE state = 'pending'").n; },
    bump: function (id, err) { db.run('UPDATE outbox SET tries = tries + 1, last_error = ? WHERE id = ?', String(err || ''), id); },
    /** Success: remember id mappings, delete the row. */
    complete: function (item, result) {
      ob.recordRefs(item, result);
      db.run('DELETE FROM outbox WHERE id = ?', item.id);
    },
    /** Business failure: keep the row (state failed) for diagnostics; its optimistic effect disappears on the next rebuild. */
    fail: function (id, err) {
      db.run("UPDATE outbox SET state = 'failed', last_error = ? WHERE id = ?", String(err || ''), id);
      db.run("DELETE FROM outbox WHERE state = 'failed' AND id NOT IN (SELECT id FROM outbox WHERE state = 'failed' ORDER BY id DESC LIMIT " + KEEP_FAILED + ')');
    },
    clear: function () { db.run('DELETE FROM outbox'); kv.del('refmap'); },

    recordRefs: function (item, result) {
      if (!result || typeof result !== 'object') return;
      const m = refs(), at = now();
      const setRow = function (real) { if (real) m.rows[String(provRow(item.id))] = { to: real, at: at }; };
      const setId = function (real) { if (real) m.ids[provId(item.id)] = { to: real, at: at }; };
      if (item.fn === 'addNewVisitOrPatient' && result.patient) { setRow(result.patient.rowNumber); setId(result.patient.patientId); }
      else if (item.fn === 'addNewBooking' && result.booking) { setRow(result.booking.rowNumber); setId(result.booking.bookingId); }
      else if (item.fn === 'addSurgery' && result.operation) { setId(result.operation.operationId); }
      else return;
      saveRefs(m);
    },
    /** Replace provisional row numbers / ids in the args by the real ones. Returns {args} or {unresolved:key}. */
    resolveArgs: function (args) {
      const m = refs();
      let unresolved = null;
      const fix = function (o) {
        if (!o || typeof o !== 'object' || Array.isArray(o)) return o;
        const c = Object.assign({}, o);
        if (typeof c.rowNumber === 'number' && c.rowNumber < 0) {
          const e = m.rows[String(c.rowNumber)]; if (e) c.rowNumber = e.to; else unresolved = 'rowNumber';
        }
        ['patientId', 'bookingId', 'surgeryId'].forEach(function (k) {
          if (typeof c[k] === 'string' && /^TMP-\d+$/.test(c[k])) { const e = m.ids[c[k]]; if (e) c[k] = e.to; else unresolved = k; }
        });
        return c;
      };
      const out = (args || []).map(fix);
      return unresolved ? { unresolved: unresolved } : { args: out };
    },

    /** Resolves when the item settles ({state:'done',result} | {state:'failed',error}) or after ms with {state:'pending'}. */
    waitFor: function (id, ms) {
      return new Promise(function (resolve) {
        const list = waiters.get(id) || []; waiters.set(id, list);
        let timer = null, done = false;
        const fin = function (v) { if (done) return; done = true; if (timer) clearTimeout(timer); resolve(v); };
        list.push(fin);
        timer = setTimeout(function () { fin({ state: 'pending' }); }, ms);
      });
    },
    settle: function (id, outcome) {
      const list = waiters.get(id); waiters.delete(id);
      if (list) list.forEach(function (f) { f(outcome); });
    },
    /** App crashed while sending: such items are simply pending again (same cid). */
    resetSending: function () { db.run("UPDATE outbox SET state = 'pending' WHERE state = 'sending'"); }
  };
  return ob;
}

module.exports = { createOutbox, provRow, provId };
