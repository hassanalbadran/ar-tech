'use strict';
/**
 * Ports of the server's text/date helpers and row mappers (server/Code.gs) so that local reads
 * return EXACTLY the shapes patientRowToObject_, bookingRowToObject_, financialRowToObject_, surgeryRowToObject_ return.
 * Pure functions, no I/O. Rows are arrays in config.headers order (without the leading row number).
 */
const K = require('./serverConsts');

const pad2 = function (n) { return String(n).padStart(2, '0'); };
function normalizeDigits(v) {
  return String(v === null || v === undefined ? '' : v)
    .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); })
    .replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); });
}
/** Same as normalizeArabic_ on the server (used for name keys / search). */
function normalizeArabic(v) {
  return normalizeDigits(v).normalize('NFKC')
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}
const cleanString = function (v) { return v === null || v === undefined ? '' : String(v).trim(); };
const limitText = function (v, max) { const s = cleanString(v); return s.length > max ? s.slice(0, max) : s; };

/** Any date-ish value -> yyyy-MM-dd or ''. (Strings and Excel serial numbers only; JSON has no Date objects.) */
function toYmd(value) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number') {
    if (value > 20000 && value < 90000) {
      const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000);
      return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
    }
    return '';
  }
  const s = normalizeDigits(value).trim();
  if (!s) return '';
  let m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})(?:[ T].*)?$/);
  if (m) return m[1] + '-' + pad2(m[2]) + '-' + pad2(m[3]);
  m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})(?:[ T].*)?$/);
  if (m) return m[3] + '-' + pad2(m[2]) + '-' + pad2(m[1]);
  return '';
}
function toDateTimeString(value) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number') return toYmd(value);
  const s = normalizeDigits(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s;
  const ymd = toYmd(s);
  if (!ymd) return s;
  const time = s.match(/(\d{1,2}:\d{2}(?::\d{2})?)/);
  return ymd + (time ? ' ' + (time[1].length <= 5 ? time[1] + ':00' : time[1]) : '');
}
function restorePhone(value) {
  if (value === null || value === undefined || value === '') return '';
  let s = typeof value === 'number' ? String(Math.round(value)) : normalizeDigits(value).trim();
  if (/^7\d{9}$/.test(s)) s = '0' + s;
  return s;
}
const phoneDigits = function (v) { return restorePhone(v).replace(/\D/g, ''); };
function phoneKey(value) {
  let d = phoneDigits(value);
  if (!d) return '';
  d = d.replace(/^00/, '');
  if (d.indexOf('964') === 0 && d.length >= 12) d = d.slice(3);
  d = d.replace(/^0+/, '');
  return d.length > 10 ? d.slice(-10) : d;
}
function normalizePhoneInput(value) {
  const s = normalizeDigits(value).trim().replace(/[^\d+]/g, '');
  return s.length > 20 ? s.slice(0, 20) : s;
}
function parseAgeLoose(value) {
  if (value === null || value === undefined || value === '') return '';
  const n = Number(normalizeDigits(value));
  return isFinite(n) && n >= 0 ? Math.floor(n) : cleanString(value);
}
/** Strict age for new visits (throws Arabic message like the server). */
function normalizeAge(value) {
  if (value === null || value === undefined || value === '') return '';
  const m = normalizeDigits(value).trim().toUpperCase().match(/^(\d{1,3})(?:[.,]\d+)?\s*([YMD])?$/);
  if (!m) throw new Error('العمر غير صالح. اكتب رقماً واختر الوحدة (سنة / شهر / يوم).');
  const n = Number(m[1]), unit = m[2] || 'Y';
  if (unit === 'Y') { if (n > 130) throw new Error('العمر يجب أن يكون بين 0 و 130 سنة.'); return n; }
  if (unit === 'M') { if (n > 60) throw new Error('العمر بالأشهر يجب ألا يتجاوز 60 (استعمل السنوات).'); return n + 'M'; }
  if (n > 365) throw new Error('العمر بالأيام يجب ألا يتجاوز 365 (استعمل الأشهر أو السنوات).');
  return n + 'D';
}
function isAffirmative(value) {
  return ['true', '1', 'yes', 'y', 'نعم', 'ن'].indexOf(String(value === null || value === undefined ? '' : value).trim().toLowerCase()) !== -1;
}
function normalizeYesNo(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  if (isAffirmative(value)) return 'نعم';
  if (['لا', 'no', 'false', '0', 'not ready'].indexOf(String(value).trim().toLowerCase()) !== -1) return 'لا';
  return cleanString(value);
}
function parseAmount(value) {
  if (typeof value === 'number') return value;
  const s = normalizeDigits(value).replace(/[,،\s]/g, '');
  return s ? Number(s) : NaN;
}
function parseJsonSafe(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(String(value)); } catch (e) { return fallback; }
}
function parseStoredJsonField(value) {
  const raw = cleanString(value);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return raw; }
}
function serializeJsonField(value) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'string') return value.trim();
  return JSON.stringify(value);
}
function normalizeOperations(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'object') return [value];
  try { const p = JSON.parse(String(value)); return Array.isArray(p) ? p : (p ? [p] : []); } catch (e) { return []; }
}
function durationEn(code) {
  const c = cleanString(code);
  if (!c) return '';
  if (c === 'prn') return 'PRN (as needed)';
  if (c === 'until_review') return 'Until review';
  const m = c.match(/^d(\d+)$/);
  if (!m) return c;
  const n = Number(m[1]);
  return n === 30 ? 'for 1 month' : n === 1 ? 'for 1 day' : 'for ' + n + ' days';
}
function buildVisitFinanceNote(pid, date, row) { return '[VISIT][' + pid + '][' + date + '][ROW=' + row + ']'; }
function buildRefundFinanceNote(pid, date, row) { return '[REFUND][' + pid + '][' + date + '][ROW=' + row + ']'; }
function buildExtraNote(prefix, kind, pid, date, row) { return '[' + prefix + '][' + kind + '][' + pid + '][' + date + '][ROW=' + row + ']'; }

/**
 * The codec depends on the clinic config (extraFees, rxForms, tests, rxTimings): build one per config.
 */
function createCodec(config) {
  config = config || {};
  const extraFees = config.extraFees || K.EXTRA_FEES;
  const rxForms = Array.isArray(config.rxForms) && config.rxForms.length ? config.rxForms : K.RX_FORMS;
  const timingLabels = config.rxTimings || K.RX_TIMING_LABELS;
  const testLabels = config.tests || K.TEST_LABELS;

  function rxUnitFor(form) { const f = rxForms.filter(function (r) { return r[0] === form; })[0]; return f ? f[2] : ''; }

  function normalizeRxItem(item) {
    const src = item && typeof item === 'object' ? item : { name: item };
    const name = limitText(src.name || src.drug || '', 120);
    const form = limitText(src.form || '', 30);
    const strength = limitText(normalizeDigits(src.strength || ''), 20);
    const unit = strength ? (rxUnitFor(form) || limitText(src.unit || '', 10)) : '';
    const hours = limitText(normalizeDigits(src.hours || ''), 6);
    let timing = cleanString(src.timing || src.when || '');
    let timingNote = limitText(src.timingNote || src.whenNote || '', 120);
    if (timing && !timingLabels[timing]) {
      const byLabel = Object.keys(timingLabels).filter(function (k) { return timingLabels[k] === timing; })[0];
      if (byLabel) timing = byLabel; else { if (!timingNote) timingNote = timing; timing = 'other'; }
    }
    if (!timing && cleanString(src.frequency)) { timing = 'other'; if (!timingNote) timingNote = limitText(src.frequency, 120); }
    const dose = limitText(src.dose || '', 30);
    const duration = limitText(src.duration || '', 40);
    const timingText = !timing ? '' : timing === 'other' ? (timingNote || 'Other') : timing === 'every' ? ('Every ' + (hours || '?') + ' h')
      : ((K.RX_TIMING_EN[timing] || '') + (timingNote ? ' (' + timingNote + ')' : ''));
    const drugLine = [name, strength ? strength + (unit.length > 3 ? ' ' : '') + unit : '', form].filter(Boolean).join(' ');
    return {
      name: name, form: form, strength: strength, unit: unit, dose: dose, timing: timing, timingNote: timingNote, hours: hours,
      duration: duration, frequency: timingText, text: [drugLine, dose, timingText, durationEn(duration)].filter(Boolean).join(' · ')
    };
  }
  function normalizePrescriptions(value) {
    let list = value;
    if (typeof list === 'string') list = parseJsonSafe(list, []);
    if (!Array.isArray(list)) return [];
    return list.slice(0, 100).map(normalizeRxItem).filter(function (x) { return !!x.name; });
  }
  function parsePrescriptions(stored) {
    const raw = cleanString(stored);
    if (!raw) return [];
    const parsed = parseJsonSafe(raw, raw);
    if (Array.isArray(parsed)) return parsed.map(normalizeRxItem).filter(function (x) { return !!x.name; });
    if (typeof parsed === 'string') return [normalizeRxItem({ name: parsed })];
    return [];
  }
  function rxKey(x) {
    return [x.name, x.form, x.strength, x.dose, x.timing, x.timingNote, x.hours, x.duration].map(cleanString).join('|').toLowerCase();
  }
  function normalizeTests(value) {
    let list = value;
    if (typeof list === 'string') list = list.split(/[,،;\n]+/);
    if (!Array.isArray(list)) return [];
    const out = [];
    list.forEach(function (t) {
      const raw = cleanString(t);
      if (!raw) return;
      const key = raw.toLowerCase();
      const code = testLabels[raw] ? raw : (K.TEST_ALIASES[key] || K.TEST_ALIASES[normalizeArabic(raw)] || raw);
      if (out.indexOf(code) === -1) out.push(code);
    });
    return out.slice(0, 20);
  }
  function normalizeVisitStatus(v) {
    const s = cleanString(v).toLowerCase();
    return K.VISIT_STATUSES.indexOf(s) !== -1 ? s : 'waiting';
  }

  /** patientRowToObject_ */
  function visit(row, rowNumber) {
    const prescriptions = parsePrescriptions(row[11]);
    const extra = parseJsonSafe(row[19], []);
    const info = parseJsonSafe(row[20], {});
    const paid = cleanString(row[14]);
    const testsRaw = cleanString(row[12]);
    return {
      rowNumber: rowNumber || null,
      patientId: cleanString(row[0]),
      fullName: cleanString(row[1]),
      age: parseAgeLoose(row[2]),
      gender: cleanString(row[3]),
      address: cleanString(row[4]),
      phone: restorePhone(row[5]),
      secondaryPhone: restorePhone(row[6]),
      escortsCount: parseAgeLoose(row[7]) || 0,
      visitDate: toYmd(row[8]),
      lastVisitDate: toYmd(row[9]),
      diagnosis: cleanString(row[10]),
      prescriptions: prescriptions,
      prescriptionsJson: prescriptions,
      testsRequested: testsRaw,
      tests: normalizeTests(testsRaw),
      hasReadyTests: normalizeYesNo(row[13], 'لا'),
      consultationPaid: paid,
      isFreeVisit: cleanString(row[15]),
      refunded: paid === 'مسترد',
      surgeryInfoJson: parseStoredJsonField(row[16]),
      notes: cleanString(row[17]),
      visitStatus: normalizeVisitStatus(row[18]),
      extraCharges: Array.isArray(extra) ? extra.filter(function (k) { return !!extraFees[k]; }) : [],
      statusInfo: (info && typeof info === 'object' && !Array.isArray(info)) ? info : {}
    };
  }
  /** bookingRowToObject_ */
  function booking(row, rowNumber) {
    const callTime = toDateTimeString(row[2]);
    return {
      rowNumber: rowNumber || null, bookingId: cleanString(row[0]), patientName: cleanString(row[1]), callTime: callTime,
      callDate: toYmd(callTime), phone: restorePhone(row[3]), requestedSlot: cleanString(row[4]), status: cleanString(row[5]) || 'Pending'
    };
  }
  /** financialRowToObject_ */
  function finance(row, rowNumber) {
    return {
      rowNumber: rowNumber || null, transactionId: cleanString(row[0]), date: toYmd(row[1]), type: cleanString(row[2]),
      itemName: cleanString(row[3]), amount: Number(row[4]) || 0, paymentStatus: cleanString(row[5]), notes: cleanString(row[6])
    };
  }
  /** surgeryRowToObject_ ; `today` = clinic today (for `overdue`). */
  function surgery(row, rowNumber, today) {
    const date = toYmd(row[5]);
    const status = cleanString(row[11]) || 'Booked';
    return {
      rowNumber: rowNumber || null, surgeryId: cleanString(row[0]), patientId: cleanString(row[1]), patientName: cleanString(row[2]),
      phone: restorePhone(row[3]), operationType: cleanString(row[4]), operationDate: date, operationTime: cleanString(row[6]),
      location: cleanString(row[7]), details: cleanString(row[8]), amount: Number(row[9]) || 0, paymentStatus: cleanString(row[10]),
      status: status, sourceRow: cleanString(row[12]), overdue: status === 'Booked' && !!date && !!today && date < today
    };
  }
  return {
    extraFees: extraFees, normalizeRxItem: normalizeRxItem, normalizePrescriptions: normalizePrescriptions, parsePrescriptions: parsePrescriptions,
    rxKey: rxKey, normalizeTests: normalizeTests, normalizeVisitStatus: normalizeVisitStatus,
    visit: visit, booking: booking, finance: finance, surgery: surgery
  };
}

/** rxT of server/Index.html: the one-line English text of a prescription item. */
function rxText(x) {
  const u = x.unit || '';
  const tm = x.timing === 'other' ? (x.timingNote || 'Other') : x.timing === 'every' ? 'Every ' + (x.hours || '?') + ' h'
    : (K.RX_TIMING_EN[x.timing] || '') + (x.timingNote ? ' (' + x.timingNote + ')' : '');
  return [[x.name, x.strength ? x.strength + (u.length > 3 ? ' ' : '') + u : '', x.form].filter(Boolean).join(' '), x.dose, tm, durationEn(x.duration)]
    .filter(Boolean).join(' · ');
}

module.exports = {
  normalizeDigits, normalizeArabic, cleanString, limitText, toYmd, toDateTimeString, restorePhone, phoneDigits, phoneKey, normalizePhoneInput,
  parseAgeLoose, normalizeAge, isAffirmative, normalizeYesNo, parseAmount, parseJsonSafe, parseStoredJsonField, serializeJsonField,
  normalizeOperations, durationEn, buildVisitFinanceNote, buildRefundFinanceNote, buildExtraNote, createCodec, rxText
};
