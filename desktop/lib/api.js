'use strict';
/**
 * The method registry behind `window.cm` (docs/BRIDGE.md). Used by Electron IPC (main.js) and by the dev HTTP bridge.
 * createApi(opts) → { methods, on, emit, dispose }
 *   opts.dataDir, opts.appVersion, opts.config (config.js), opts.fetch, opts.now, opts.engine
 *   opts.hooks = { openExternal(url), printHtml(html,{deviceName,pageSize:[w,h]mm}) → Promise, printers() → Promise<[{name,isDefault}]>,
 *                  saveFile(name,text) → Promise<path|null>, openFile() → Promise<{name,content}|null>, quit() }
 *   opts.autoUpdater (electron-updater instance, optional)
 */
const path = require('path');
const C = require('./core');
const M = require('./mappers');
const D = require('./db');
const { createSettings } = require('./settings');
const { createClinicConfig } = require('./clinicConfig');
const { createTransport } = require('./transport');
const { createOutbox } = require('./outbox');
const { createStore } = require('./store');
const { createEffects } = require('./applyLocal');
const { createSync } = require('./sync');
const { createLicense } = require('./license');
const { createUpdater } = require('./updater');
const R = require('./rxprint');

const withTimeout = function (p, ms) { return Promise.race([p, new Promise(function (ok) { const t = setTimeout(ok, ms); if (t.unref) t.unref(); })]); };

function createApi(opts) {
  const hooks = opts.hooks || {}, config = opts.config || {};
  const now = opts.now || Date.now;
  const listeners = {};
  const emit = function (name, payload) { (listeners[name] || []).slice().forEach(function (f) { try { f(payload); } catch (e) { /* listener errors never break the engine */ } }); };
  const on = function (name, fn) { (listeners[name] = listeners[name] || []).push(fn); return function () { listeners[name] = (listeners[name] || []).filter(function (f) { return f !== fn; }); }; };

  const settings = createSettings({ dataDir: opts.dataDir, now: now });
  settings.load();
  const db = D.openDatabase(path.join(opts.dataDir, 'clinic.db'), { engine: opts.engine });
  const kv = D.createKv(db);
  const cc = createClinicConfig(kv);
  const tables = D.createTables(db, function (s) { return cc.headers(s); });
  tables.ensureColumns();
  const tr = createTransport({ fetch: opts.fetch, getUrl: function () { return kv.get('url') || ''; }, getToken: function () { return kv.get('token') || ''; } });
  const outbox = createOutbox({ db: db, kv: kv, now: now });
  outbox.resetSending();
  const ctx = { db: db, kv: kv, tables: tables, clinicConfig: cc, settings: settings, now: now, outbox: outbox, log: opts.log, hint: opts.hint };
  const store = createStore(ctx); ctx.store = store;
  const effects = createEffects(ctx); ctx.effects = effects;
  const sync = createSync(Object.assign({}, ctx, {
    transport: tr, emit: emit, effects: effects,
    prepareArgs: function (fn, args) {
      if (fn !== 'recordClinicExpense') return args;
      return [Object.assign({}, args[0], { pin: settings.getFinancePin() })].concat(args.slice(1));
    }
  }));
  const license = createLicense({ dataDir: opts.dataDir, config: config, transport: tr, appVersion: opts.appVersion, now: now, label: opts.deviceLabel });
  const updater = createUpdater({ fetch: opts.fetch, config: config, version: opts.appVersion, autoUpdater: opts.autoUpdater, openExternal: hooks.openExternal });

  const usable = function () { license.assertUsable(); };
  const cfgNow = function () { return cc.get(); };
  const stateObj = function () {
    const s = settings.get(), c = cfgNow();
    return { version: opts.appVersion || '', linked: sync.isLinked(), clinicName: s.clinicName || c.clinicName || '', doctorName: s.doctorName || c.doctorName || '',
      settings: s, config: cc.publicView(), license: license.status(), sync: sync.state(), todayYmd: store.today(), appName: config.APP_NAME || 'Clinic Manager', developerUrl: config.DEVELOPER_URL || '' };
  };
  const write = function (fn, args) { usable(); return sync.write(fn, args); };
  const needVisit = function (rowNumber) {
    const v = store.visitByRow(Number(rowNumber));
    if (!v) throw new Error('لم يتم العثور على الوصفة/الزيارة.');
    return v;
  };
  const allowedHost = function (h) {
    const dev = (function () { try { return new URL(config.DEVELOPER_URL).hostname; } catch (e) { return ''; } })();
    return /(^|\.)github\.com$/.test(h) || h === 't.me' || /(^|\.)script\.google\.com$/.test(h) || (dev && h === dev);
  };

  const methods = {
    // ---- app / settings
    state: async function () { return stateObj(); },
    boot: async function () {
      emit('boot', { phase: 'settings', pct: 10 });
      settings.get();
      emit('boot', { phase: 'database', pct: 30 });
      tables.ensureColumns();
      emit('boot', { phase: 'license', pct: 50 });
      await withTimeout(license.check(), 4000);
      emit('boot', { phase: 'data', pct: 75 });
      if (sync.isLinked()) await withTimeout(sync.tick().catch(function () {}), 4000);
      sync.start();
      emit('boot', { phase: 'done', pct: 100 });
      return stateObj();
    },
    setSettings: async function (patch) { const s = settings.set(patch); emit('state', null); return s; },
    verifyPin: async function (kind, pin) { return settings.verifyPin(kind, pin); },
    changePin: async function (kind, oldPin, newPin) { return settings.changePin(kind, oldPin, newPin); },
    setFinancePin: async function (pin) { return settings.setFinancePin(pin); },
    quit: async function () { if (hooks.quit) hooks.quit(); },

    // ---- link / first run / data
    link: async function (o) { const r = await sync.link(o || {}); sync.start(); emit('state', null); return r; },
    unlink: async function () { await sync.unlink(); emit('state', null); return true; },
    androidPairing: async function () {
      if (!sync.isLinked()) throw new Error('اربط التطبيق بالعيادة أولاً.');
      const r = await tr.action('pairingCode', {}, 20000);
      return { qrText: 'cm1|' + (r.url || sync.url()) + '|' + r.code, code: r.code, expiresAt: r.expiresAt };
    },
    syncNow: async function (o) { const ok = await sync.tick(!!(o && o.full)); return { ok: ok, sync: sync.state() }; },
    exportData: async function () {
      const out = { format: 'clinic-manager-export', version: 1, exportedAt: new Date(now()).toISOString(), app: opts.appVersion || '', config: cc.raw(), tables: {} };
      Object.keys(D.LOCAL).forEach(function (s) { out.tables[s] = tables.dump(s); });
      const name = 'clinic-export-' + store.today() + '.json';
      const p = hooks.saveFile ? await hooks.saveFile(name, JSON.stringify(out)) : null;
      return { path: p || null };
    },
    importFile: async function () {
      if (!hooks.openFile) throw new Error('الاستيراد غير متاح هنا.');
      const f = await hooks.openFile();
      if (!f) return { imported: false };
      let j; try { j = JSON.parse(f.content); } catch (e) { throw new Error('الملف ليس تصدير تطبيق العيادة. لاستيراد السجل القديم (CSV) استخدم الموقع.'); }
      if (!j || j.format !== 'clinic-manager-export' || !j.tables) throw new Error('الملف ليس تصدير تطبيق العيادة.');
      if (sync.isLinked()) throw new Error('التطبيق مرتبط بالعيادة؛ بياناته تأتي من الخادم. افصل الربط أولاً لاستعادة نسخة محلية.');
      const counts = {};
      db.transaction(function () {
        if (j.config) cc.set(j.config);
        tables.ensureColumns();
        Object.keys(D.LOCAL).forEach(function (s) { if (Array.isArray(j.tables[s])) { tables.replace(s, j.tables[s]); counts[s] = j.tables[s].length; } });
      });
      emit('data', null);
      return { imported: true, counts: counts };
    },

    // ---- reads (local)
    getDay: async function (ymd, o) { return store.getDay(ymd, o); },
    monthSummary: async function (ym) { return store.monthSummary(ym); },
    search: async function (q) { return store.search(q); },
    profile: async function (id) { return store.profile(id); },
    doctorContext: async function (id, row) { return store.doctorContext(id, row); },
    slots: async function (ymd) { return store.slots(ymd); },
    income: async function (ymd, o) { return store.income(ymd, o); },
    surgeries: async function () { return store.surgeries(); },
    drugs: async function () { return store.drugs(); },
    events: async function () { return store.events(); },
    feePreview: async function (id) { return store.feePreview(id); },

    // ---- writes (optimistic)
    addVisit: async function (p) { return write('addNewVisitOrPatient', [p || {}]); },
    saveVisit: async function (p) { return write('saveDoctorVisit', [p || {}]); },
    addRx: async function (p) { return write('addPrescriptionToVisit', [p || {}]); },
    addBooking: async function (b) {
      b = b || {};
      const name = M.cleanString(b.patientName);
      if (!name) throw new Error('اسم المريض مطلوب للحجز.');
      const ph = C.normalizePhone(b.phone);
      if (!ph.ok) throw new Error(ph.error);
      const chk = C.canBook(M.cleanString(b.date), M.cleanString(b.time), store.allBookings(), cc.coreCfg(), store.clinicNow());
      if (!chk.ok) throw new Error(chk.error);
      return write('addNewBooking', [{ patientName: name, phone: ph.value, date: M.cleanString(b.date), time: M.cleanString(b.time) }]);
    },
    setBookingStatus: async function (bookingId, status) { return write('updateBookingStatus', [{ bookingId: bookingId, status: status }]); },
    addSurgery: async function (p) { return write('addSurgery', [p || {}]); },
    setSurgeryStatus: async function (p) { return write('updateSurgeryStatus', [p || {}]); },
    addExpense: async function (e) {
      e = e || {};
      return write('recordClinicExpense', [{ date: e.date, itemName: e.itemName, quantity: e.quantity, unitPrice: e.unitPrice, deductFromClinic: e.fromClinicIncome !== false, paymentStatus: 'Paid' }]);
    },
    hideDay: async function (ymd, pin) {
      if (!C.parseYmd(ymd)) throw new Error('تاريخ غير صالح.');
      if (!settings.verifyPin('hide', pin)) throw new Error('الرمز غير صحيح.');
      settings.setHiddenDays(settings.get().hiddenDays.concat([ymd])); emit('data', null); return true;
    },
    unhideDay: async function (ymd, pin) {
      if (!settings.verifyPin('hide', pin)) throw new Error('الرمز غير صحيح.');
      settings.setHiddenDays(settings.get().hiddenDays.filter(function (d) { return d !== ymd; })); emit('data', null); return true;
    },
    saveClinicConfig: async function (patch) {
      patch = patch || {};
      const keys = ['clinicName', 'doctorName', 'consultationFee', 'freeReviewDays', 'rules'], p = {};
      keys.forEach(function (k) { if (patch[k] !== undefined) p[k] = patch[k]; });
      const cur = JSON.parse(JSON.stringify(cfgNow()));
      const merged = Object.assign(cur, p); if (p.rules) merged.rules = Object.assign({}, cur.rules, p.rules);
      cc.set(merged);
      settings.set({ doctorName: p.doctorName !== undefined ? p.doctorName : undefined, clinicName: p.clinicName !== undefined ? p.clinicName : undefined });
      if (sync.isLinked()) {
        try { const out = await tr.action('setConfig', { pin: settings.getFinancePin(), patch: p }, 20000); cc.set(out); }
        catch (e) {
          if (e && e.name === 'NetworkError') kv.setJson('pendingConfig', Object.assign(kv.getJson('pendingConfig', {}), p));
          else throw e;
        }
      }
      emit('data', null); emit('state', null);
      return cc.publicView();
    },

    // ---- printing / license / update
    printers: async function () { return hooks.printers ? hooks.printers() : []; },
    rxHtml: async function (row, o) { return R.rxHtml(needVisit(row), settings.get().printer, { preview: !!(o && o.preview) }); },
    printRx: async function (row) {
      const pr = settings.get().printer;
      if (!pr.enabled) return { printed: false };
      if (!hooks.printHtml) throw new Error('الطباعة غير متاحة هنا.');
      await hooks.printHtml(R.rxHtml(needVisit(row), pr, { preview: false }), { deviceName: pr.printerName, pageSize: R.pageSize(pr) });
      return { printed: true };
    },
    printTest: async function () {
      if (!hooks.printHtml) throw new Error('الطباعة غير متاحة هنا.');
      const pr = settings.get().printer;
      await hooks.printHtml(R.testHtml(pr), { deviceName: pr.printerName, pageSize: R.pageSize(pr) });
      return { printed: true };
    },
    licenseStatus: async function () { return license.status(); },
    activate: async function (key) { const s = await license.activate(key); emit('state', null); return s; },
    checkLicense: async function () { const s = await license.check(); emit('state', null); return s; },
    checkUpdate: async function () { return updater.check(); },
    installUpdate: async function () { return updater.install(); },
    openExternal: async function (url) {
      let u; try { u = new URL(url); } catch (e) { throw new Error('رابط غير صالح.'); }
      if (u.protocol !== 'https:' || !allowedHost(u.hostname)) throw new Error('هذا الرابط غير مسموح.');
      if (hooks.openExternal) hooks.openExternal(u.href);
      return true;
    }
  };

  return {
    methods: methods, on: on, emit: emit,
    internals: { db: db, kv: kv, tables: tables, store: store, sync: sync, outbox: outbox, settings: settings, clinicConfig: cc, license: license },
    dispose: function () { sync.stop(); try { db.close(); } catch (e) { /* already closed */ } }
  };
}

module.exports = { createApi };
