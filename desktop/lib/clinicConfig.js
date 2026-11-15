'use strict';
/** Server `config` object cached in kv('config'), merged over built-in defaults taken from server/Code.gs. */
const C = require('./core');
const K = require('./serverConsts');
const M = require('./mappers');

function defaultConfig() {
  const r = C.rulesOf(null);
  return {
    version: '', apiVersion: 1, clinicName: '', doctorName: '', consultationFee: 15000, freeReviewDays: 5,
    extraFees: K.EXTRA_FEES,
    rules: { weekday: r.weekday, friday: r.friday, stepMin: r.stepMin, perHour: r.perHour, capacityMode: r.capacityMode, maxDaysAhead: r.maxDaysAhead },
    tests: K.TEST_LABELS, rxForms: K.RX_FORMS, rxTimings: K.RX_TIMING_LABELS, headers: K.HEADERS
  };
}
function merge(server) {
  const d = defaultConfig(), s = server && typeof server === 'object' ? server : {};
  const out = Object.assign({}, d, s);
  out.rules = Object.assign({}, d.rules, s.rules || {});
  out.headers = Object.assign({}, d.headers, s.headers || {});
  return out;
}

function createClinicConfig(kv) {
  let cache = null, codec = null;
  const self = {
    get: function () { return cache || (cache = merge(kv.getJson('config', null))); },
    /** Store the server's answer (also used for optimistic setConfig). */
    set: function (cfg) { kv.setJson('config', cfg); cache = null; codec = null; return self.get(); },
    clear: function () { kv.del('config'); cache = null; codec = null; },
    raw: function () { return kv.getJson('config', null); },
    headers: function (sheet) { const h = self.get().headers[sheet]; return Array.isArray(h) && h.length ? h : K.HEADERS[sheet]; },
    codec: function () { return codec || (codec = M.createCodec(self.get())); },
    /** Options for ClinicCore (rules + fee window). */
    coreCfg: function () {
      const c = self.get(), o = Object.assign({}, c.rules);
      if (c.freeReviewDays !== undefined) o.freeReviewDays = Number(c.freeReviewDays);
      if (c.consultationFee !== undefined) o.consultationFee = Number(c.consultationFee);
      return o;
    },
    fee: function () { const n = Number(self.get().consultationFee); return isFinite(n) ? n : 15000; },
    /** config without the (large, internal) headers map: what state().config returns */
    publicView: function () { const c = Object.assign({}, self.get()); delete c.headers; return c; }
  };
  return self;
}
module.exports = { createClinicConfig, defaultConfig };
