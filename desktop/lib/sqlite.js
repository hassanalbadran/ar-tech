'use strict';
/**
 * One tiny SQLite adapter for two engines:
 *   - Electron (production):  better-sqlite3   (native module, rebuilt by electron-builder)
 *   - plain Node (tests, dev bridge): node:sqlite DatabaseSync (Node >= 22, no npm packages)
 * Interface: exec(sql) | run(sql,...params) -> {changes,lastInsertRowid} | get | all | transaction(fn) | close()
 * Only positional `?` params and plain SQL. All calls are synchronous.
 */
function pickEngine(requested) {
  if (requested && requested !== 'auto') return requested;
  if (process.versions && process.versions.electron) return 'better-sqlite3';
  return 'node:sqlite';
}

function normParams(params) {
  return params.map(function (v) {
    if (v === undefined) return null;
    if (v === true) return 1;
    if (v === false) return 0;
    return v;
  });
}

function open(file, opts) {
  opts = opts || {};
  let engine = pickEngine(opts.engine);
  let raw;
  function openWith(name) {
    if (name === 'better-sqlite3') { const D = require('better-sqlite3'); return new D(file); }
    const { DatabaseSync } = require('node:sqlite');
    return new DatabaseSync(file);
  }
  try { raw = openWith(engine); }
  catch (e) {
    if (opts.engine && opts.engine !== 'auto') throw e;
    engine = engine === 'better-sqlite3' ? 'node:sqlite' : 'better-sqlite3';
    raw = openWith(engine);
  }

  const cache = new Map();
  function stmt(sql) {
    let s = cache.get(sql);
    if (!s) {
      if (cache.size > 300) cache.clear();
      s = raw.prepare(sql); cache.set(sql, s);
    }
    return s;
  }
  const plain = function (row) { return row ? Object.assign({}, row) : undefined; };

  let depth = 0, closed = false;
  const db = {
    engine: engine,
    file: file,
    exec: function (sql) { raw.exec(sql); },
    run: function (sql) {
      const r = stmt(sql).run.apply(stmt(sql), normParams([].slice.call(arguments, 1)));
      return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) };
    },
    get: function (sql) { const s = stmt(sql); return plain(s.get.apply(s, normParams([].slice.call(arguments, 1)))); },
    all: function (sql) { const s = stmt(sql); return s.all.apply(s, normParams([].slice.call(arguments, 1))).map(plain); },
    /** Synchronous transaction; nested calls use SAVEPOINTs. fn must not return a promise. */
    transaction: function (fn) {
      const name = 'sp' + depth;
      if (depth === 0) raw.exec('BEGIN'); else raw.exec('SAVEPOINT ' + name);
      depth++;
      let res;
      try {
        res = fn();
        if (res && typeof res.then === 'function') throw new Error('transaction() callback must be synchronous');
      } catch (e) {
        depth--;
        try {
          if (depth === 0) raw.exec('ROLLBACK'); else { raw.exec('ROLLBACK TO ' + name); raw.exec('RELEASE ' + name); }
        } catch (_) { /* connection already broken */ }
        throw e;
      }
      depth--;
      if (depth === 0) raw.exec('COMMIT'); else raw.exec('RELEASE ' + name);
      return res;
    },
    close: function () { if (closed) return; closed = true; cache.clear(); raw.close(); }
  };
  if (file !== ':memory:') raw.exec('PRAGMA journal_mode = WAL');
  raw.exec('PRAGMA foreign_keys = ON');
  raw.exec('PRAGMA synchronous = NORMAL');
  return db;
}

module.exports = { open };
