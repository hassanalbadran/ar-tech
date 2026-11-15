/*!
 * Clinic Manager — shared business rules (single source of truth)
 * ---------------------------------------------------------------
 * Plain JavaScript, no dependencies, no DOM, no Node-only APIs.
 * The very same text is used in:
 *   - server/Code.gs   (between the RULES-BEGIN / RULES-END markers; see tools/sync-rules.js)
 *   - desktop app      (main + renderer)
 *   - android app      (WebView)
 * All dates are plain strings: 'YYYY-MM-DD' and 'HH:MM'. No time-zone maths here —
 * the caller supplies "now" already converted to clinic time (see partsInTz).
 *
 * Copyright (c) Hasn (t.me/hasn2mr). MIT License. See LICENSE.
 */
var ClinicCore = (function () {
  'use strict';

  var CLINIC_TZ_OFFSET_MIN = 180; // Asia/Baghdad (UTC+3, no DST)

  var DEFAULT_RULES = {
    weekday: { first: '15:30', close: '19:00' }, // booking slots start 15:30, doctor works 16:00-19:00
    friday: { first: '08:00', close: '12:00' },
    stepMin: 30,
    perHour: 4,            // max bookings per clock hour (see capacityMode)
    capacityMode: 'hour',  // 'hour' = 4 per clock hour | 'slot' = 4 per half-hour slot
    maxDaysAhead: 4,
    freeReviewDays: 5,
    consultationFee: 15000
  };

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /** Arabic-Indic / Persian digits -> ASCII digits. */
  function digits(s) {
    return String(s == null ? '' : s)
      .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 1632); })
      .replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 1776); });
  }

  /**
   * Iraqi mobile numbers. Accepts 07XXXXXXXXX (11 digits) or 7XXXXXXXXX (10 digits),
   * also +964 / 00964 prefixes. Returns { ok, value, error } where value is always 07XXXXXXXXX.
   */
  function normalizePhone(input) {
    var d = digits(input).replace(/[^\d+]/g, '');
    if (!d) return { ok: false, value: '', error: 'رقم الهاتف مطلوب' };
    d = d.replace(/^\+/, '');
    if (d.indexOf('00964') === 0) d = d.slice(5);
    else if (d.indexOf('964') === 0 && d.length >= 12) d = d.slice(3);
    if (d.charAt(0) === '7' && d.length === 10) d = '0' + d;
    if (/^07\d{9}$/.test(d)) return { ok: true, value: d, error: '' };
    if (d.charAt(0) === '0' || d.charAt(0) === '7') {
      var need = d.charAt(0) === '0' ? 11 : 10;
      return { ok: false, value: d, error: 'الرقم يجب أن يكون ' + need + ' أرقام' + (need === 11 ? ' (07xxxxxxxxx)' : ' (7xxxxxxxxx)') };
    }
    return { ok: false, value: d, error: 'رقم الهاتف غير صحيح (يبدأ بـ 07 أو 7)' };
  }

  // ---------------- dates (strings only) ----------------

  function parseYmd(ymd) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ''));
    return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
  }
  function ymdToUtcMs(ymd) { var p = parseYmd(ymd); return p ? Date.UTC(p.y, p.m - 1, p.d) : NaN; }
  function addDays(ymd, n) {
    var t = new Date(ymdToUtcMs(ymd) + n * 86400000);
    return t.getUTCFullYear() + '-' + pad2(t.getUTCMonth() + 1) + '-' + pad2(t.getUTCDate());
  }
  function daysBetween(olderYmd, newerYmd) { return Math.round((ymdToUtcMs(newerYmd) - ymdToUtcMs(olderYmd)) / 86400000); }
  /** 0 = Sunday ... 5 = Friday ... 6 = Saturday */
  function weekday(ymd) { return new Date(ymdToUtcMs(ymd)).getUTCDay(); }
  function isFriday(ymd) { return weekday(ymd) === 5; }

  /** Date object -> { ymd, hm } in clinic time (default UTC+3). */
  function partsInTz(dateObj, offsetMin) {
    var off = offsetMin == null ? CLINIC_TZ_OFFSET_MIN : offsetMin;
    var t = new Date(dateObj.getTime() + off * 60000);
    return {
      ymd: t.getUTCFullYear() + '-' + pad2(t.getUTCMonth() + 1) + '-' + pad2(t.getUTCDate()),
      hm: pad2(t.getUTCHours()) + ':' + pad2(t.getUTCMinutes())
    };
  }

  function hmToMin(hm) { var m = /^(\d{1,2}):(\d{2})/.exec(String(hm || '')); return m ? (+m[1]) * 60 + (+m[2]) : NaN; }
  function minToHm(min) { return pad2(Math.floor(min / 60)) + ':' + pad2(min % 60); }

  function rulesOf(cfg) {
    var r = {}, k;
    for (k in DEFAULT_RULES) r[k] = DEFAULT_RULES[k];
    if (cfg) for (k in cfg) if (cfg[k] !== undefined && cfg[k] !== null) r[k] = cfg[k];
    r.weekday = { first: (cfg && cfg.weekday && cfg.weekday.first) || DEFAULT_RULES.weekday.first, close: (cfg && cfg.weekday && cfg.weekday.close) || DEFAULT_RULES.weekday.close };
    r.friday = { first: (cfg && cfg.friday && cfg.friday.first) || DEFAULT_RULES.friday.first, close: (cfg && cfg.friday && cfg.friday.close) || DEFAULT_RULES.friday.close };
    return r;
  }

  /** Opening window for a calendar date. */
  function dayWindow(ymd, cfg) {
    var r = rulesOf(cfg);
    return isFriday(ymd) ? r.friday : r.weekday;
  }

  /**
   * The "clinic day" a moment belongs to. After closing time, new entries belong to the next day
   * (until that day's own closing time). Friday closes at 12:00, so Thursday evening -> Friday.
   * now = { ymd, hm }.
   */
  function businessDay(now, cfg) {
    var win = dayWindow(now.ymd, cfg);
    return hmToMin(now.hm) >= hmToMin(win.close) ? addDays(now.ymd, 1) : now.ymd;
  }

  /** Dates that can be booked: from the current clinic day up to maxDaysAhead days later. */
  function bookableDates(now, cfg) {
    var r = rulesOf(cfg), start = businessDay(now, cfg), out = [];
    for (var i = 0; i <= r.maxDaysAhead; i++) out.push(addDays(start, i));
    return out;
  }

  /** All slot start times for a date, e.g. ['15:30','16:00',...,'18:30'] (Friday: 08:00..11:30). */
  function slotTimes(ymd, cfg) {
    var r = rulesOf(cfg), w = dayWindow(ymd, cfg), out = [];
    for (var t = hmToMin(w.first); t + r.stepMin <= hmToMin(w.close); t += r.stepMin) out.push(minToHm(t));
    return out;
  }

  function isCancelled(status) {
    var s = String(status == null ? '' : status).trim();
    return s === 'ملغى' || s === 'لم يحضر' || s.toLowerCase() === 'cancelled' || s.toLowerCase() === 'canceled';
  }

  /** Booking row -> 'HH:MM' of its slot (from slot text or callTime). */
  function bookingTime(b) {
    var src = b && (b.slotTime || b.requestedSlotTime);
    if (src && /^\d{1,2}:\d{2}$/.test(src)) return pad2(+src.split(':')[0]) + ':' + src.split(':')[1];
    var ct = String((b && b.callTime) || '');
    var m = /(\d{2}):(\d{2})/.exec(ct.slice(11));
    return m ? m[1] + ':' + m[2] : '';
  }

  /**
   * Availability for each slot of a date.
   * bookings = array of { callDate|date, slotTime|callTime, status } (any dates; filtered here).
   * Returns [{ time, hour, count, hourCount, capacity, full, past }].
   * `now` (optional) marks slots already past on the current clinic day.
   */
  function slotAvailability(ymd, bookings, cfg, now) {
    var r = rulesOf(cfg), times = slotTimes(ymd, cfg), perSlot = {}, perHour = {};
    (bookings || []).forEach(function (b) {
      var d = b.callDate || b.date || String(b.callTime || '').slice(0, 10);
      if (d !== ymd || isCancelled(b.status)) return;
      var t = bookingTime(b);
      if (!t) return;
      perSlot[t] = (perSlot[t] || 0) + 1;
      var h = t.slice(0, 2);
      perHour[h] = (perHour[h] || 0) + 1;
    });
    return times.map(function (t) {
      var h = t.slice(0, 2), count = perSlot[t] || 0, hourCount = perHour[h] || 0;
      var used = r.capacityMode === 'slot' ? count : hourCount;
      var past = !!(now && now.ymd === ymd && hmToMin(t) + r.stepMin <= hmToMin(now.hm));
      return { time: t, hour: h, count: count, hourCount: hourCount, capacity: r.perHour, full: used >= r.perHour, past: past };
    });
  }

  /** Server-side guard. Returns { ok, error }. */
  function canBook(ymd, time, bookings, cfg, now) {
    var r = rulesOf(cfg), dates = now ? bookableDates(now, cfg) : null;
    if (dates && dates.indexOf(ymd) === -1) return { ok: false, error: 'التاريخ خارج المدة المسموحة (اليوم وحتى ' + r.maxDaysAhead + ' أيام قادمة).' };
    var s = slotAvailability(ymd, bookings, cfg, now).filter(function (x) { return x.time === time; })[0];
    if (!s) return { ok: false, error: 'هذا الوقت خارج ساعات الدوام.' };
    if (s.full) return { ok: false, error: 'هذا الوقت ممتلئ، اختر وقتاً آخر.' };
    return { ok: true, error: '' };
  }

  /** First open slot on a date (or '' if none). */
  function firstOpenSlot(ymd, bookings, cfg, now) {
    var a = slotAvailability(ymd, bookings, cfg, now).filter(function (x) { return !x.full && !x.past; })[0];
    return a ? a.time : '';
  }

  // ---------------- consultation fee rule ----------------

  /**
   * One free review within `freeReviewDays` of the last paid visit. Once the free review is used,
   * the next visit is paid again (and starts a new window).
   * visits = patient's previous visits, any order: { visitDate, isFreeVisit: 'نعم'|'لا' }.
   * Returns { free, daysSince, anchorDate, reason }.
   */
  function reviewFee(visits, today, cfg) {
    var r = rulesOf(cfg), list = (visits || []).filter(function (v) { return v && v.visitDate; });
    if (!list.length) return { free: false, daysSince: null, anchorDate: '', reason: 'new' };
    list.sort(function (a, b) { return a.visitDate < b.visitDate ? 1 : a.visitDate > b.visitDate ? -1 : 0; });
    var latest = list[0], days = daysBetween(latest.visitDate, today);
    if (days < 0) return { free: false, daysSince: days, anchorDate: latest.visitDate, reason: 'future' };
    if (latest.isFreeVisit === 'نعم') return { free: false, daysSince: days, anchorDate: latest.visitDate, reason: 'free-used' };
    if (days <= r.freeReviewDays) return { free: true, daysSince: days, anchorDate: latest.visitDate, reason: 'within-window' };
    return { free: false, daysSince: days, anchorDate: latest.visitDate, reason: 'expired' };
  }

  // ---------------- small helpers ----------------

  function greeting(hour) { return hour < 12 ? 'صباح الخير' : 'مساء الخير'; }
  function money(n) { return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' د.ع'; }

  /** Name search key: lowercase, strip tashkeel, unify alef/yaa/taa-marbuta. */
  function nameKey(s) {
    return digits(s).toLowerCase()
      .replace(/[ً-ْـ]/g, '')
      .replace(/[آأإ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/\s+/g, ' ').trim();
  }

  return {
    CLINIC_TZ_OFFSET_MIN: CLINIC_TZ_OFFSET_MIN, DEFAULT_RULES: DEFAULT_RULES,
    digits: digits, normalizePhone: normalizePhone,
    parseYmd: parseYmd, addDays: addDays, daysBetween: daysBetween, weekday: weekday, isFriday: isFriday,
    partsInTz: partsInTz, hmToMin: hmToMin, minToHm: minToHm, rulesOf: rulesOf,
    dayWindow: dayWindow, businessDay: businessDay, bookableDates: bookableDates, slotTimes: slotTimes,
    isCancelled: isCancelled, bookingTime: bookingTime, slotAvailability: slotAvailability,
    canBook: canBook, firstOpenSlot: firstOpenSlot, reviewFee: reviewFee,
    greeting: greeting, money: money, nameKey: nameKey
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = ClinicCore;
