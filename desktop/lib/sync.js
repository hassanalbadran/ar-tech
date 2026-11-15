'use strict';
/**
 * Sync engine: pairing, full snapshot, delta polling, outbox flushing (docs/API.md "Sync algorithm").
 * One serialized loop (`run`) so a flush, a delta and a full sync never interleave.
 */
const { NetworkError, ServerError } = require('./transport');
const core = require('./core');

const TABLES = ['Patient_Records', 'Financials', 'Surgeries', 'Drugs'];
const FULL_EVERY_MS = 6 * 3600 * 1000;
const POLL_MS = 10000;

function createSync(ctx) {
  const db = ctx.db, kv = ctx.kv, tables = ctx.tables, cc = ctx.clinicConfig, tr = ctx.transport, ob = ctx.outbox,
    fx = ctx.effects, store = ctx.store;
  const now = function () { return ctx.now ? ctx.now() : Date.now(); };
  const emit = ctx.emit || function () {};
  const log = ctx.log || function () {};
  const st = { online: true, state: 'idle', lastSyncAt: 0, error: '' };
  let fails = 0, stopped = true, base = POLL_MS;
  let chain = Promise.resolve(), timer = null, running = 0, lastEv = 0, progress = null;


  /** true from 2 h before opening until 3 h after closing (entries after closing still belong to the next clinic day) */
  function inHours() {
    try {
      const p = core.partsInTz(new Date(now())), w = core.dayWindow(p.ymd, cc.coreCfg()), m = core.hmToMin(p.hm);
      return m >= core.hmToMin(w.first) - 120 && m <= core.hmToMin(w.close) + 180;
    } catch (e) { return true; }
  }
  function nextDelay() {
    let d = base;
    if (ctx.hint && ctx.hint() === 'background') d = Math.max(d, 45000);
    if (fails) d = Math.max(d, Math.min(120000, 15000 * Math.pow(2, fails - 1)));
    if (!inHours()) d = Math.max(d, 120000);
    return d;
  }

  const api = {
    isLinked: function () { return !!(kv.get('url') && kv.get('token')); },
    url: function () { return kv.get('url') || ''; },
    token: function () { return kv.get('token') || ''; },
    state: function () { return { online: st.online, state: st.state, lastSyncAt: st.lastSyncAt, pending: ob.count(), error: st.error }; },
    _set: function (patch) { Object.assign(st, patch); emit('state', null); },

    /** Serialize any async job. */
    run: function (job) {
      const p = chain.then(job, job);
      chain = p.catch(function () {});
      return p;
    },

    link: function (o) {
      return api.run(async function () {
        const url = String(o.url || '').trim();
        if (!/^https:\/\/script\.google\.com\/(a\/[^/]+\/)?macros\/s\/[A-Za-z0-9_-]+\/exec/.test(url)) throw new Error('رابط العيادة غير صحيح. الصق رابط التطبيق المنتهي بـ /exec.');
        const code = String(o.code || '').trim();
        if (!code) throw new Error('اكتب رمز الربط.');
        emit('state', { phase: 'pairing', done: 0, total: 1 });
        const data = await tr.post(url, { action: 'pair', code: code, deviceName: o.deviceName || 'Windows PC', platform: 'desktop' });
        kv.set('url', url); kv.set('token', data.token); kv.set('deviceId', data.deviceId);
        cc.set(data.config); tables.ensureColumns();
        await api._full();
        return true;
      });
    },

    unlink: function () {
      return api.run(async function () {
        db.transaction(function () { tables.wipe(); ['url', 'token', 'deviceId', 'rev', 'lastFullAt', 'pendingConfig', 'refmap'].forEach(function (k) { kv.del(k); }); });
        cc.clear(); lastEv = 0;
        api._set({ state: 'idle', error: '', lastSyncAt: 0 });
        emit('data', null);
      });
    },

    /** Full snapshot of every table. */
    _full: async function () {
      api._set({ state: 'syncing' });
      const rev0 = (await tr.action('rev')).rev;
      const cfg = await tr.action('config');
      cc.set(cfg); tables.ensureColumns();
      const got = {}, all = TABLES.concat(['Bookings']);
      let done = 0;
      for (const t of all) {
        let from = 2, rows = [];
        for (let guard = 0; guard < 500; guard++) {
          const r = await tr.action('snapshot', { table: t, from: from, limit: 1000 }, 90000);
          rows = rows.concat(r.rows || []);
          if (!r.next) break;
          from = r.next;
        }
        got[t] = rows; done++;
        emit('state', { phase: 'downloading', done: done, total: all.length });
      }
      db.transaction(function () {
        all.forEach(function (t) { tables.replace(t, got[t]); });
        kv.set('rev', rev0); kv.set('lastFullAt', now());
      });
      fx.rebuild();
      st.lastSyncAt = now();
      emit('data', null);
    },

    _applyEvents: function (events) {
      const today = store.today();
      db.transaction(function () {
        db.run('DELETE FROM events_cache');
        (events || []).forEach(function (e) { db.run('INSERT OR REPLACE INTO events_cache (id, date, json) VALUES (?,?,?)', Number(e.id) || 0, today, JSON.stringify(e)); });
      });
      const fresh = (events || []).filter(function (e) { return (Number(e.id) || 0) > lastEv; });
      if (lastEv) fresh.forEach(function (e) { emit('event', e); });
      (events || []).forEach(function (e) { if ((Number(e.id) || 0) > lastEv) lastEv = Number(e.id) || 0; });
    },

    _delta: async function () {
      const since = Number(kv.get('rev')) || 0;
      const r = await tr.action('delta', { since: since });
      if (r.resync) return api._full();
      db.transaction(function () {
        Object.keys(r.tables || {}).forEach(function (t) { tables.upsert(t, r.tables[t]); });
        if (r.bookings) tables.replace('Bookings', r.bookings);
        kv.set('rev', r.rev);
      });
      api._applyEvents(r.events);
      const changed = Object.keys(r.tables || {}).length || r.bookings;
      if (changed) { fx.rebuild(); emit('data', null); }
      st.lastSyncAt = now();
    },

    /** Send queued writes in order. Stops at the first network/busy problem. */
    _flush: async function () {
      for (let guard = 0; guard < 500; guard++) {
        const item = ob.next();
        if (!item) return true;
        const res = ob.resolveArgs(item.args);
        if (res.unresolved) {
          ob.fail(item.id, 'تعذّر إتمام عملية سابقة يعتمد عليها هذا الإجراء.');
          fx.rebuild(); ob.settle(item.id, { state: 'failed', error: 'تعذّر إتمام عملية سابقة يعتمد عليها هذا الإجراء.' });
          continue;
        }
        try {
          const args = ctx.prepareArgs ? ctx.prepareArgs(item.fn, res.args) : res.args;
          const out = await tr.call(item.fn, args, item.cid);
          ob.complete(item, out);
          ob.settle(item.id, { state: 'done', result: out });
          st.online = true;
        } catch (e) {
          if (e instanceof NetworkError || (e instanceof ServerError && e.code === 'BUSY')) {
            ob.bump(item.id, e.message); st.online = !(e instanceof NetworkError); st.error = e.message; return false;
          }
          if (e instanceof ServerError && e.code === 'AUTH') { st.error = e.message; kv.del('token'); emit('toast', { text: e.message, kind: 'err' }); return false; }
          ob.fail(item.id, e.message);
          fx.rebuild();
          ob.settle(item.id, { state: 'failed', error: e.message });
          emit('toast', { text: e.message, kind: 'err' });
        }
      }
      return true;
    },

    _flushConfig: async function () {
      const p = kv.getJson('pendingConfig', null);
      if (!p) return;
      const out = await tr.action('setConfig', { pin: ctx.settings.getFinancePin(), patch: p });
      kv.del('pendingConfig'); cc.set(out); emit('data', null);
    },

    /** One full cycle. `forceFull` = "جلب البيانات". */
    tick: function (forceFull) {
      if (!api.isLinked()) return Promise.resolve(false);
      return api.run(async function () {
        running++;
        api._set({ state: 'syncing' });
        try {
          const okFlush = await api._flush();
          try { await api._flushConfig(); } catch (e) { if (!(e instanceof NetworkError)) { kv.del('pendingConfig'); emit('toast', { text: e.message, kind: 'err' }); } else throw e; }
          const fullDue = forceFull || !kv.get('rev') || (now() - (Number(kv.get('lastFullAt')) || 0) > FULL_EVERY_MS);
          if (fullDue) await api._full();
          else {
            const revNow = (await tr.action('rev')).rev;
            if (okFlush === false || revNow !== Number(kv.get('rev'))) await api._delta();
            else st.lastSyncAt = now();
          }
          st.online = true; st.error = ''; fails = 0;
          api._set({ state: 'idle' });
          return true;
        } catch (e) {
          if (e instanceof NetworkError) { st.online = false; fails++; }
          else if (e instanceof ServerError && e.code === 'AUTH') { kv.del('token'); }
          st.error = e.message || String(e);
          api._set({ state: 'error' });
          log('sync: ' + st.error);
          if (forceFull) throw e;
          return false;
        } finally { running--; }
      });
    },

    /** Queue a write: optimistic local effect first, then try to send. */
    write: async function (fn, args, waitMs) {
      let item;
      db.transaction(function () { item = ob.add(fn, args); fx.applyItem(item); });
      emit('data', null); emit('state', null);
      if (api.isLinked()) api.tick().catch(function () {});
      const out = await ob.waitFor(item.id, waitMs === undefined ? 4000 : waitMs);
      if (out.state === 'done') return { ok: true, queued: false, result: out.result };
      if (out.state === 'failed') throw new Error(out.error);
      return { ok: true, queued: true, result: fx.provisionalResult(item) };
    },

    /** Adaptive polling (light on data and on the Apps Script quota): 10 s while the window is in use during clinic hours,
     *  45 s when it is in the background, 2 min outside clinic hours, exponential back-off (to 2 min) while offline. */
    start: function (ms) {
      api.stop(); base = ms || POLL_MS; stopped = false;
      const loop = function () {
        if (stopped) return;
        (running ? Promise.resolve() : api.tick()).catch(function () {}).then(function () {
          if (stopped) return;
          timer = setTimeout(loop, nextDelay()); if (timer.unref) timer.unref();
        });
      };
      timer = setTimeout(loop, base); if (timer.unref) timer.unref();
    },
    stop: function () { stopped = true; if (timer) { clearTimeout(timer); timer = null; } }
  };
  return api;
}

module.exports = { createSync, POLL_MS, FULL_EVERY_MS };
