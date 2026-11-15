/**
 * ============================================================================
 *  Clinical Management System  |  Code.gs  (Backend)
 *  Dr. Zaid Samir Naji - Neurosurgery Clinic
 * ============================================================================
 *  - الملف الجديد (NEW_SHEET_ID) هو المصدر الأساسي لكل البيانات.
 *  - الملف القديم (LEGACY) يُحدَّث تلقائياً بخمسة حقول فقط:
 *    Name, Age, Booking Date, The Diagnosis, Phone Number
 *    ولا يُمسّ أي عمود آخر ولا أي صف قديم. فشل المزامنة لا يوقف العمل أبداً؛
 *    تدخل العملية في طابور وتُعاد تلقائياً.
 *
 *  ملاحظات تقنية مهمة (أسباب مشاكل النسخة السابقة):
 *  1) Google Sheets يحوّل النصوص التي تشبه التواريخ إلى Date تلقائياً، فكان
 *     Call_Time في الحجوزات يُقرأ كـ Date ويفشل فلتر "اليوم" ثم يحذفه التنظيف.
 *     الآن تُكتب هذه الأعمدة كنص صريح، وتُقرأ بمحوّل تواريخ يقبل Date ونص ورقم.
 *  2) أرقام الهاتف كانت تتحول إلى أرقام وتفقد الصفر الأول فتفشل مطابقة المريض
 *     ("مراجعة مجانية خلال 5 أيام"). الآن تُكتب نصاً وتُقارن بمفتاح موحّد.
 *  3) كل صف كان يفتح الملف من جديد لمعرفة المنطقة الزمنية (بطء شديد). الآن
 *     تُخزَّن مرة واحدة لكل استدعاء.
 * ============================================================================
 */

// ▼▼ ضع هنا رابط صورة الموقع المصغّرة (PNG، رابط مباشر https) لتظهر بدل أيقونة Apps Script ▼▼
const SITE_ICON_URL = 'https://drive.google.com/file/d/1pDWhB14GCfzBW8_0WPYp3FVax1wfKwWz/view?usp=sharing';

const CONFIG = Object.freeze({
  VERSION: '2026.11.12.1',
  APP_TITLE: 'عيادة الدكتور زيد سمير ناجي - جراحة الجملة العصبية',
  NEW_SHEET_ID: '1-7EGYxBPSDlBgp7dBdTKqc27K1t52AuH7L93aTx4sSA',
  DEFAULT_TZ: 'Asia/Baghdad',
  // رابط مباشر (https) لصورة اللوكو ليظهر كأيقونة في تبويب المتصفح — اتركه فارغاً لتعطيله
  FAVICON_URL: SITE_ICON_URL,

  LEGACY: Object.freeze({
    ENABLED: true,
    SHEET_ID: '1gguALgYLtjlp43VlA9xf7SgVzkNQQpleRekSCELW_2k',
    TAB_CANDIDATES: ['26', '٢٦', '2026'],
    HEADERS: ['Name', 'Age', 'Booking Date', 'The Diagnosis', 'Phone Number', 'Notes'],
    SCAN_ROWS: 400
  }),

  CONSULTATION_FEE_IQD: 15000,
  FREE_VISIT_DAYS: 5,
  DOCTOR_NAME: 'زيد سمير',
  TRIAL_DAYS: 30,
  CONFIG_PROPERTY: 'CM_CONFIG',
  REV_PROPERTY: 'CM_REV',
  CHANGES_PROPERTY: 'CM_CHANGES',
  DEVICES_PROPERTY: 'CM_DEVICES',
  // الأجور الإضافية التي يحددها الطبيب عند إكمال المريض
  EXTRA_FEES: Object.freeze({
    consultation: Object.freeze({ label: 'كشفية', amount: 15000 }),
    stitches: Object.freeze({ label: 'رفع خيوط', amount: 15000 })
  }),

  // يمكن تغيير الرمز من Project Settings > Script properties (المفتاح FINANCE_PIN)
  FINANCE_PIN: '1234',
  PIN_MAX_FAILS: 5,
  PIN_LOCK_SECONDS: 300,

  LOCK_TIMEOUT_MS: 30000,
  PRESENCE_TTL_SECONDS: 75,
  TODAY_SCAN_ROWS: 500,
  SEARCH_MAX_RESULTS: 25,

  SYSTEM_ACTIVE_PROPERTY: 'SYSTEM_ACTIVE',
  ID_COUNTER_PROPERTY: 'PATIENT_ID_COUNTER',
  TRANSACTION_COUNTER_PROPERTY: 'TRANSACTION_ID_COUNTER',
  BOOKING_COUNTER_PROPERTY: 'BOOKING_ID_COUNTER',
  OPERATION_COUNTER_PROPERTY: 'OPERATION_ID_COUNTER',
  EVENTS_PROPERTY: 'CLINIC_EVENTS',
  LEGACY_QUEUE_PROPERTY: 'LEGACY_SYNC_QUEUE',
  BOOKINGS_ARCHIVED_ON_PROPERTY: 'BOOKINGS_ARCHIVED_ON',
  PRESENCE_CACHE_PREFIX: 'CLINIC_PRESENCE_'
});

// ---- shared business rules: DO NOT EDIT HERE. Source of truth: shared/core.js (tools/sync-shared.js) ----
// <<RULES-BEGIN>>
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
// <<RULES-END>>

/** الأعمدة الأساسية (1-18) يجب أن تطابق الملف؛ الأعمدة 19-21 تُضاف تلقائياً إن لم توجد. */
const HEADERS = Object.freeze({
  Patient_Records: [
    'Patient_ID', 'Full_Name', 'Age', 'Gender', 'Address', 'Phone',
    'Secondary_Phone', 'Escorts_Count', 'Visit_Date', 'Last_Visit_Date',
    'Diagnosis', 'Prescriptions_JSON', 'Tests_Requested', 'Has_Ready_Tests',
    'Consultation_Paid', 'Is_Free_Visit', 'Surgery_Info_JSON', 'Notes',
    'Visit_Status', 'Extra_Charges_JSON', 'Status_Info_JSON'
  ],
  Financials: [
    'Transaction_ID', 'Date', 'Type', 'Item_Name', 'Amount',
    'Payment_Status', 'Notes'
  ],
  Bookings: [
    'Booking_ID', 'Patient_Name', 'Call_Time', 'Phone',
    'Requested_Slot', 'Status'
  ],
  Surgeries: [
    'Surgery_ID', 'Patient_ID', 'Patient_Name', 'Phone', 'Operation_Type',
    'Operation_Date', 'Operation_Time', 'Location', 'Details', 'Amount',
    'Payment_Status', 'Status', 'Source_Row', 'Created_At', 'Updated_At'
  ],
  Drugs: [
    'Drug_Name', 'Form', 'Strength', 'Unit', 'Use_Count', 'Last_Used', 'Created_At'
  ],
  Licenses: [
    'License_Key', 'Label', 'Type', 'Max_Devices', 'Expires_At', 'Status', 'Usage', 'Created_At', 'Notes'
  ],
  LicenseDevices: [
    'Device_ID', 'License_Key', 'Platform', 'Label', 'First_Seen', 'Last_Seen', 'App_Version', 'Checks', 'Status'
  ]
});
const CORE_COLUMNS = Object.freeze({ Patient_Records: 18, Financials: 7, Bookings: 6, Surgeries: 15, Drugs: 7, Licenses: 9, LicenseDevices: 9 });
/** كل الأعمدة نصية عدا هذه (حتى لا يحوّلها Sheets إلى تواريخ/أرقام). */
const NUMERIC_COLUMNS = Object.freeze({ Patient_Records: [3, 8], Financials: [5], Bookings: [], Surgeries: [10], Drugs: [5], Licenses: [4], LicenseDevices: [8] });

const VISIT_STATUSES = ['waiting', 'closed', 'finished', 'postponed'];
const TEST_LABELS = Object.freeze({
  'MRI': 'رنين مغناطيسي',
  'CT': 'مفراس',
  'X-Ray': 'أشعة',
  'EMG': 'تخطيط أعصاب',
  'Lab': 'فحوصات مختبرية'
});
const TEST_ALIASES = Object.freeze({
  'mri': 'MRI', 'رنين': 'MRI', 'رنين مغناطيسي': 'MRI',
  'ct': 'CT', 'مفراس': 'CT', 'سي تي': 'CT',
  'x-ray': 'X-Ray', 'xray': 'X-Ray', 'x ray': 'X-Ray', 'اشعة': 'X-Ray', 'أشعة': 'X-Ray',
  'emg': 'EMG', 'تخطيط اعصاب': 'EMG', 'تخطيط أعصاب': 'EMG', 'nerve': 'EMG',
  'lab': 'Lab', 'تحاليل دم': 'Lab', 'تحاليل': 'Lab', 'مختبر': 'Lab', 'فحوصات مختبرية': 'Lab'
});
const RX_TIMING_LABELS = Object.freeze({
  morning: 'صباحاً',
  noon: 'ظهراً',
  evening: 'مساءً',
  after_meal: 'بعد الأكل',
  before_meal: 'قبل الأكل',
  after_breakfast: 'بعد الفطور',
  after_lunch: 'بعد الغداء',
  after_dinner: 'بعد العشاء',
  before_breakfast: 'قبل الفطور',
  before_lunch: 'قبل الغداء',
  before_dinner: 'قبل العشاء',
  every: 'مرة كل (ساعات)',
  every_4h: 'كل 4 ساعات',
  other: 'أخرى'
});
/** نفس المفاتيح بالإنكليزية — هذا ما يُخزَّن ويُعرض في سجل المريض. */
const RX_TIMING_EN = Object.freeze({
  morning: 'Morning', noon: 'Noon', evening: 'Evening', after_meal: 'After meal', before_meal: 'Before meal',
  after_breakfast: 'After breakfast', after_lunch: 'After lunch', after_dinner: 'After dinner',
  before_breakfast: 'Before breakfast', before_lunch: 'Before lunch', before_dinner: 'Before dinner', every_4h: 'Every 4 h'
});
/** [الرمز المخزَّن، الاسم العربي، وحدة الجرعة، المجموعة] — أضف أي شكل جديد هنا فقط. */
const RX_FORMS = Object.freeze([
  ['Tab', 'قرص', 'mg', 'فموي صلب'], ['Cap', 'كبسولة', 'mg', 'فموي صلب'], ['ODT', 'قرص يذوب بالفم', 'mg', 'فموي صلب'],
  ['Chew Tab', 'قرص للمضغ', 'mg', 'فموي صلب'], ['SR Tab', 'قرص ممتد المفعول', 'mg', 'فموي صلب'], ['EC Tab', 'قرص معوي', 'mg', 'فموي صلب'],
  ['SL Tab', 'قرص تحت اللسان', 'mg', 'فموي صلب'], ['Eff Tab', 'قرص فوار', 'mg', 'فموي صلب'], ['Lozenge', 'أقراص مص', 'mg', 'فموي صلب'],
  ['Sachet', 'كيس / ظرف', 'g', 'فموي صلب'], ['Powder', 'بودرة', 'g', 'فموي صلب'],
  ['Syr', 'شراب', 'ml', 'فموي سائل'], ['Susp', 'معلّق', 'ml', 'فموي سائل'], ['Soln', 'محلول فموي', 'ml', 'فموي سائل'],
  ['Elixir', 'إكسير', 'ml', 'فموي سائل'], ['Oral Drops', 'قطرات فموية', 'ml', 'فموي سائل'], ['Emulsion', 'مستحلب', 'ml', 'فموي سائل'],
  ['Amp', 'أمبولة', 'mg', 'حقن ومحاليل'], ['Vial', 'فيال', 'mg', 'حقن ومحاليل'], ['Inj IM', 'حقنة عضلية', 'mg', 'حقن ومحاليل'],
  ['Inj IV', 'حقنة وريدية', 'mg', 'حقن ومحاليل'], ['Inj SC', 'حقنة تحت الجلد', 'mg', 'حقن ومحاليل'], ['PFS', 'حقنة جاهزة', 'mg', 'حقن ومحاليل'],
  ['IV Inf', 'مصل / محلول وريدي', 'ml', 'حقن ومحاليل'],
  ['Oint', 'مرهم', 'g', 'موضعي'], ['Cream', 'كريم', 'g', 'موضعي'], ['Gel', 'جل', 'g', 'موضعي'], ['Paste', 'معجون', 'g', 'موضعي'],
  ['Lotion', 'لوشن', 'ml', 'موضعي'], ['Topical Soln', 'محلول موضعي', 'ml', 'موضعي'], ['Spray', 'بخاخ موضعي', 'puff', 'موضعي'],
  ['Patch', 'لصقة', 'mg', 'موضعي'], ['Shampoo', 'شامبو', 'ml', 'موضعي'],
  ['Eye Drops', 'قطرة عين', 'drops', 'عين / أذن / أنف'], ['Eye Oint', 'مرهم عين', 'g', 'عين / أذن / أنف'],
  ['Ear Drops', 'قطرة أذن', 'drops', 'عين / أذن / أنف'], ['Nasal Drops', 'قطرة أنف', 'drops', 'عين / أذن / أنف'],
  ['Nasal Spray', 'بخاخ أنف', 'puff', 'عين / أذن / أنف'],
  ['Inhaler', 'بخاخ استنشاق', 'mcg', 'تنفسي'], ['Neb Soln', 'محلول بخار (نيبولايزر)', 'ml', 'تنفسي'],
  ['Supp', 'تحميلة', 'mg', 'شرجي / مهبلي / فموي'], ['Enema', 'حقنة شرجية', 'ml', 'شرجي / مهبلي / فموي'],
  ['Pessary', 'تحميلة مهبلية', 'mg', 'شرجي / مهبلي / فموي'], ['Vag Cream', 'كريم مهبلي', 'g', 'شرجي / مهبلي / فموي'],
  ['Mouthwash', 'غسول فم', 'ml', 'شرجي / مهبلي / فموي'], ['Oral Gel', 'جل فموي', 'g', 'شرجي / مهبلي / فموي'],
  ['Other', 'أخرى', '', 'أخرى']
]);
/** أدوية مبدئية لقائمة الاقتراحات (تُضاف عند تشغيل setupSheets). [الاسم، الشكل، التركيز] */
const SEED_DRUGS = Object.freeze([
  ['Topamax', 'Tab', '25'], ['Dologan', 'Tab', ''], ['Dolipran (Doliprane)', 'Tab', ''],
  ['Lansocort', 'Tab', '20'], ['Lansocort', 'Tab', '40'], ['Preganor', 'Cap', '50'], ['Norgesic', 'Tab', ''],
  ['Neurobion', 'Tab', ''], ['Acetalopram (Escitalopram)', 'Tab', '10'], ['Cloflam', 'Tab', ''],
  ['Paracetamol', 'IV Inf', ''], ['Gabapentin', 'Cap', '100'], ['Zomitan (Zolmitriptan / Zomig)', 'Tab', '5'],
  ['Amoxil', 'Syr', ''], ['Adol', 'Oral Drops', ''], ['Fucidin', 'Oint', '']
]);

// ---------------------------------------------------------------------------
// Web app entry
// ---------------------------------------------------------------------------

function doGet() {
  const out = HtmlService
    .createHtmlOutputFromFile('Index')
    .setTitle(CONFIG.APP_TITLE)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
  if (CONFIG.FAVICON_URL) {
    try { out.setFaviconUrl(CONFIG.FAVICON_URL); } catch (e) { /* رابط غير صالح: نتجاهله */ }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Preflight: فحص الملفات والوظائف قبل فتح التطبيق
// ---------------------------------------------------------------------------

/**
 * يُستدعى عند فتح التطبيق. يعيد قائمة فحوصات (checks) لتعرضها الواجهة على شاشة
 * التحميل، وإذا نجحت الفحوصات الحرجة يعيد أيضاً لقطة اليوم كاملة.
 * level = 'critical' يمنع الفتح عند الفشل، و 'warning' ينبّه فقط.
 */
function systemInitialCheck_() {
  const checks = [];
  const startedAt = Date.now();

  function step(id, label, level, fn) {
    const s = Date.now();
    try {
      const detail = fn();
      checks.push({ id: id, label: label, level: level, ok: true, detail: detail == null ? '' : String(detail), ms: Date.now() - s });
      return true;
    } catch (e) {
      checks.push({ id: id, label: label, level: level, ok: false, detail: errMsg_(e), ms: Date.now() - s });
      return false;
    }
  }

  let ss = null;

  step('runtime', 'تشغيل الخادم وفحص المنطق الداخلي', 'critical', function () {
    selfTest_();
    return 'الإصدار ' + CONFIG.VERSION;
  });

  step('storage', 'الذاكرة المؤقتة والإعدادات', 'critical', function () {
    const cache = CacheService.getScriptCache();
    const key = 'CLINIC_PING';
    const stamp = String(Date.now());
    cache.put(key, stamp, 30);
    if (cache.get(key) !== stamp) throw new Error('تعذر القراءة من الذاكرة المؤقتة.');
    PropertiesService.getScriptProperties().getProperty(CONFIG.SYSTEM_ACTIVE_PROPERTY);
    return 'سليمة';
  });

  step('lock', 'قفل العمليات المتزامنة', 'critical', function () {
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(5000)) throw new Error('القفل مشغول بعملية أخرى.');
    lock.releaseLock();
    return 'يعمل';
  });

  const ssOk = step('spreadsheet', 'فتح ملف العيادة الجديد', 'critical', function () {
    ss = getSpreadsheet_();
    return ss.getName() + ' · ' + getTz_();
  });

  if (ssOk) {
    step('patients', 'جدول المراجعين وترويسته', 'critical', function () {
      const sheet = getSheetAndValidate_(ss, 'Patient_Records');
      return Math.max(0, sheet.getLastRow() - 1) + ' صف';
    });
    step('financials', 'جدول الحسابات وترويسته', 'critical', function () {
      const sheet = getSheetAndValidate_(ss, 'Financials');
      return Math.max(0, sheet.getLastRow() - 1) + ' معاملة';
    });
    step('bookings', 'جدول الحجوزات وترويسته', 'critical', function () {
      const sheet = getSheetAndValidate_(ss, 'Bookings');
      return Math.max(0, sheet.getLastRow() - 1) + ' حجز';
    });
    step('surgeries', 'جدول العمليات المحجوزة', 'warning', function () {
      const sheet = getSheetAndValidate_(ss, 'Surgeries');
      return Math.max(0, sheet.getLastRow() - 1) + ' عملية';
    });
  }

  step('legacy', 'الملف القديم (مزامنة الدكتور)', 'warning', function () {
    if (!CONFIG.LEGACY.ENABLED) return 'معطّل';
    const tab = getLegacyTab_();
    let note = tab.getParent().getName() + ' / ' + tab.getName();
    const pending = withLock_(function () { return drainLegacyQueue_(); });
    if (pending.attempted) note += ' · أُعيدت مزامنة ' + pending.done + ' من ' + pending.attempted + ' معلّقة';
    return note;
  });

  const criticalFailed = checks.filter(function (c) { return !c.ok && c.level === 'critical'; });
  const warnings = checks.filter(function (c) { return !c.ok && c.level !== 'critical'; });
  const active = getSystemActive_();

  const result = {
    success: criticalFailed.length === 0,
    ready: criticalFailed.length === 0 && active,
    active: active,
    version: CONFIG.VERSION,
    checks: checks,
    warnings: warnings.map(function (w) { return w.label + ': ' + w.detail; }),
    durationMs: Date.now() - startedAt,
    config: clientConfig_()
  };

  if (criticalFailed.length) {
    result.error = criticalFailed.map(function (c) { return c.label + ': ' + c.detail; }).join(' | ');
    return plain_(result);
  }

  try {
    const snap = buildSnapshot_();
    result.today = snap.today;
    result.timezone = getTz_();
    result.todayPatients = active ? snap.patients : [];
    result.todayBookings = active ? snap.bookings : [];
    result.todayUpcoming = active ? snap.upcoming : [];
    result.presence = snap.presence;
    result.events = snap.events;
  } catch (e) {
    result.success = false;
    result.ready = false;
    result.error = 'تعذر تحميل قائمة اليوم: ' + errMsg_(e);
  }
  return plain_(result);
}

function clientConfig_() {
  return {
    appTitle: liveCfg_().clinicName,
    doctorName: liveCfg_().doctorName,
    consultationFee: liveCfg_().consultationFee,
    freeVisitDays: liveCfg_().freeReviewDays,
    rules: liveCfg_().rules,
    extraFees: CONFIG.EXTRA_FEES,
    tests: TEST_LABELS,
    rxTimings: RX_TIMING_LABELS,
    rxForms: RX_FORMS,
    presenceTtlSeconds: CONFIG.PRESENCE_TTL_SECONDS
  };
}

/** لقطة خفيفة تستعملها الواجهة للتحديث الدوري (كل بضع ثوانٍ). */
function getTodayQueueSnapshot_() {
  const snap = buildSnapshot_();
  return plain_({
    success: true,
    today: snap.today,
    patients: snap.patients,
    bookings: snap.bookings,
    upcoming: snap.upcoming,
    presence: snap.presence,
    events: snap.events,
    serverTime: snap.serverTime
  });
}

function buildSnapshot_() {
  const ss = getSpreadsheet_();
  const patientSheet = getSheetAndValidate_(ss, 'Patient_Records');
  ensureBookingsArchived_(ss);
  return {
    today: todayYmd_(),
    patients: readTodayPatients_(patientSheet),
    bookings: splitBookings_(readAllBookings_(ss)).bookings,
    upcoming: splitBookings_(readAllBookings_(ss)).upcoming,
    presence: getClinicPresence_(),
    events: getTodayEvents_(),
    serverTime: nowDateTime_()
  };
}

/** اختبار ذاتي للدوال الحرجة (تواريخ/هواتف/عربي) لاكتشاف أي خلل قبل فتح التطبيق. */
function selfTest_() {
  const cases = [
    [toYmd_('2026-09-29'), '2026-09-29'],
    [toYmd_('29/9/2026'), '2026-09-29'],
    [toYmd_('٢٠٢٦-٠٩-٢٩'), '2026-09-29'],
    [toYmd_('2026-09-29 14:03:00'), '2026-09-29'],
    [toYmd_(46294), '2026-09-29'],
    [phoneKey_('07701234567'), phoneKey_('+964 770 123 4567')],
    [phoneKey_(7701234567), phoneKey_('0770-123-4567')],
    [normalizeArabic_('أحمد  عَلي'), normalizeArabic_('احمد علي')],
    [durationLabel_('d2'), 'لمدة يومين']
  ];
  cases.forEach(function (c, i) {
    if (c[0] !== c[1]) throw new Error('فشل الاختبار الذاتي رقم ' + (i + 1) + ': [' + c[0] + '] ≠ [' + c[1] + ']');
  });
  return true;
}

// ---------------------------------------------------------------------------
// Patients: قراءة / بحث / ملف المريض
// ---------------------------------------------------------------------------

function getTodayPatients_() {
  return plain_(readTodayPatients_(getSheetAndValidate_(getSpreadsheet_(), 'Patient_Records')));
}

/**
 * زيارات اليوم تُضاف في آخر الشيت دائماً، لذلك نقرأ النافذة الأخيرة فقط
 * (500 صف) ونوسّعها إذا كانت كلها لليوم. هذا يبقي التحديث سريعاً مهما كبر الملف.
 */
function readTodayPatients_(sheet) {
  const today = todayYmd_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const width = HEADERS.Patient_Records.length;
  const total = lastRow - 1;
  let count = Math.min(CONFIG.TODAY_SCAN_ROWS, total);
  let rows, start;

  for (;;) {
    start = lastRow - count + 1;
    rows = sheet.getRange(start, 1, count, width).getValues();
    const probe = rows.slice(0, Math.min(30, rows.length));
    const olderFound = probe.some(function (r) { const d = toYmd_(r[8]); return d && d < today; });
    if (start <= 2 || olderFound || count >= total) break;
    count = Math.min(count * 2, total);
  }

  const out = [];
  rows.forEach(function (row, i) {
    try {
      if (!cleanString_(row[0]) || !cleanString_(row[1])) return;
      if (toYmd_(row[8]) !== today) return;
      out.push(patientRowToObject_(row, start + i));
    } catch (e) { /* صف تالف لا يجوز أن يُسقط القائمة كلها */ }
  });
  out.sort(function (a, b) { return a.rowNumber - b.rowNumber; });
  return out;
}

function getPatientFullProfile_(patientId) {
  const id = cleanString_(patientId);
  if (!id) throw new Error('رقم المريض مطلوب.');

  const sheet = getSheetAndValidate_(getSpreadsheet_(), 'Patient_Records');
  const history = readPatientVisits_(sheet, id);
  if (!history.length) throw new Error('لم يتم العثور على المريض.');

  return plain_({
    success: true,
    patientId: id,
    patient: history[0],
    history: history,
    totalVisits: history.length,
    firstVisitDate: history[history.length - 1].visitDate,
    operations: history.reduce(function (all, visit) {
      return all.concat(normalizeOperations_(visit.surgeryInfoJson));
    }, [])
  });
}

/**
 * سياق الطبيب: التشخيص السابق (للعرض فقط)، آخر وصفة، وملخص الزيارات.
 * payload: { patientId, rowNumber }  (rowNumber = زيارة اليوم الحالية لاستبعادها)
 */
function getDoctorPatientContext_(payload) {
  const data = payload || {};
  const id = cleanString_(data.patientId);
  if (!id) throw new Error('رقم المريض مطلوب.');
  const currentRow = Number(data.rowNumber) || 0;

  const sheet = getSheetAndValidate_(getSpreadsheet_(), 'Patient_Records');
  const visits = readPatientVisits_(sheet, id).filter(function (v) { return v.rowNumber !== currentRow; });
  const previous = visits.length ? visits[0] : null;
  const withDiagnosis = visits.filter(function (v) { return !!v.diagnosis; })[0] || null;
  const withRx = visits.filter(function (v) { return v.prescriptions.length; })[0] || null;

  return plain_({
    success: true,
    patientId: id,
    visitsCount: visits.length + 1,
    previous: previous ? {
      visitDate: previous.visitDate,
      diagnosis: previous.diagnosis,
      notes: previous.notes,
      testsRequested: previous.testsRequested
    } : null,
    previousDiagnosis: withDiagnosis ? { visitDate: withDiagnosis.visitDate, text: withDiagnosis.diagnosis } : null,
    lastPrescriptions: withRx ? { visitDate: withRx.visitDate, items: withRx.prescriptions } : null,
    recent: visits.slice(0, 5).map(function (v) {
      return { visitDate: v.visitDate, diagnosis: v.diagnosis, status: v.visitStatus };
    })
  });
}

/** كل زيارات مريض واحد (الأحدث أولاً) بالاعتماد على TextFinder على عمود Patient_ID. */
function readPatientVisits_(sheet, patientId) {
  const rows = findRowNumbers_(sheet, 1, patientId, true);
  const width = HEADERS.Patient_Records.length;
  const out = [];
  rows.slice(-120).forEach(function (rowNumber) {
    if (rowNumber < 2) return;
    const values = sheet.getRange(rowNumber, 1, 1, width).getValues()[0];
    if (cleanString_(values[0]) !== patientId) return;
    out.push(patientRowToObject_(values, rowNumber));
  });
  out.sort(function (a, b) {
    return compareYmd_(b.visitDate, a.visitDate) || (b.rowNumber - a.rowNumber);
  });
  return out;
}

function searchPatientByNameOrPhone_(query) {
  const raw = normalizeDigits_(query);
  const nameQ = normalizeArabic_(raw);
  const phoneQ = raw.replace(/\D/g, '');
  if (nameQ.length < 2) return [];

  const sheet = getSheetAndValidate_(getSpreadsheet_(), 'Patient_Records');
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const rows = sheet.getRange(2, 1, lastRow - 1, HEADERS.Patient_Records.length).getValues();
  const groups = {};

  rows.forEach(function (row, index) {
    const id = cleanString_(row[0]);
    const name = cleanString_(row[1]);
    if (!id && !name) return;

    const nameKey = normalizeArabic_(name);
    const phone1 = phoneDigits_(row[5]);
    const phone2 = phoneDigits_(row[6]);
    const hit = nameKey.indexOf(nameQ) !== -1 ||
      id.toLowerCase().indexOf(nameQ) !== -1 ||
      (phoneQ.length >= 3 && (phone1.indexOf(phoneQ) !== -1 || phone2.indexOf(phoneQ) !== -1 ||
        phoneKey_(row[5]).indexOf(phoneQ.replace(/^0+/, '')) !== -1));
    if (!hit) return;

    let record;
    try { record = patientRowToObject_(row, index + 2); } catch (e) { return; }
    const groupKey = record.patientId || phoneKey_(record.phone) || nameKey || ('ROW_' + record.rowNumber);

    if (!groups[groupKey]) {
      groups[groupKey] = {
        patientId: record.patientId,
        fullName: record.fullName,
        phone: record.phone,
        secondaryPhone: record.secondaryPhone,
        latestVisitDate: record.visitDate,
        latestRecord: record,
        history: []
      };
    }
    const g = groups[groupKey];
    g.history.push(record);
    if (compareYmd_(record.visitDate, g.latestVisitDate) >= 0) {
      g.latestVisitDate = record.visitDate;
      g.latestRecord = record;
      g.fullName = record.fullName || g.fullName;
      g.phone = record.phone || g.phone;
      g.secondaryPhone = record.secondaryPhone || g.secondaryPhone;
    }
  });

  const list = Object.keys(groups).map(function (key) {
    const g = groups[key];
    g.history.sort(function (a, b) { return compareYmd_(b.visitDate, a.visitDate) || (b.rowNumber - a.rowNumber); });
    g.latestRecord = g.history[0] || g.latestRecord;
    g.visitsCount = g.history.length;
    g.history = g.history.slice(0, 5); // الواجهة تحتاج الأحدث فقط؛ الملف الكامل يُجلب عند الفتح
    return g;
  }).sort(function (a, b) {
    return compareYmd_(b.latestVisitDate, a.latestVisitDate);
  }).slice(0, CONFIG.SEARCH_MAX_RESULTS);

  return plain_(list);
}

// ---------------------------------------------------------------------------
// إضافة مراجع / مراجعة جديدة (السكرتير)
// ---------------------------------------------------------------------------

function addNewVisitOrPatient_(payload) {
  const data = payload || {};
  validatePatientPayload_(data);

  return withLock_(function () {
    const ss = getSpreadsheet_();
    const sheet = getSheetAndValidate_(ss, 'Patient_Records');
    const today = todayYmd_();

    const existing = findExistingPatient_(sheet, data);
    const latest = existing ? existing.latest : null;
    const lastVisitDate = latest ? latest.visitDate : '';
    const daysSince = lastVisitDate ? daysBetweenYmd_(lastVisitDate, today) : null;
    // قاعدة المراجعة: مراجعة مجانية واحدة خلال المدة بعد آخر كشفية مدفوعة، ثم تعود الكشفية
    const feeRule = ClinicCore.reviewFee(existing ? existing.visits : [], today, cmCoreRules_());
    const mode = cleanString_(data.mode);
    let isFreeVisit = !!(existing && feeRule.free);
    if (existing && mode === 'free') isFreeVisit = true;      // الطبيب رفع الاسم بدون كشفية
    if (mode === 'paid') isFreeVisit = false;                  // الطبيب طلب تحصيل كشفية
    const consultationPaid = !isFreeVisit;

    // منع التكرار العرضي (نقرتان متتاليتان) — يمكن تجاوزه صراحةً بـ allowDuplicate
    if (existing && !isAffirmative_(data.allowDuplicate)) {
      const sameDay = existing.visits.filter(function (v) { return v.visitDate === today; })[0];
      if (sameDay) {
        return plain_({
          success: true,
          duplicate: true,
          patient: sameDay,
          patientId: sameDay.patientId,
          isNewPatient: false,
          message: 'هذا المراجع مسجّل في قائمة اليوم أصلاً.',
          todayPatients: readTodayPatients_(sheet)
        });
      }
    }

    if (consultationPaid && mode !== 'paid' && !isAffirmative_(data.paidConfirmation || data.confirmPaid || data.confirmation)) {
      return plain_({
        success: false,
        confirmationRequired: true,
        consultationFee: liveCfg_().consultationFee,
        isFreeVisit: false,
        consultationPaid: false,
        daysSinceLastVisit: daysSince,
        lastVisitDate: lastVisitDate || null,
        patientId: existing ? existing.patientId : null,
        patientName: cleanString_(data.fullName),
        message: 'يلزم تأكيد استلام الكشفية قبل حفظ الزيارة.'
      });
    }

    const patientId = existing && existing.patientId ? existing.patientId : nextId_(CONFIG.ID_COUNTER_PROPERTY, 'P');
    const record = {
      patientId: patientId,
      fullName: limitText_(data.fullName, 120),
      age: normalizeAge_(data.age),
      gender: limitText_(data.gender, 20),
      address: limitText_(data.address, 250),
      phone: normalizePhoneInput_(data.phone),
      secondaryPhone: normalizePhoneInput_(data.secondaryPhone),
      escortsCount: normalizeNonNegativeInteger_(data.escortsCount, 0),
      visitDate: today,
      lastVisitDate: lastVisitDate,
      diagnosis: '',
      prescriptions: [],
      testsRequested: '',
      hasReadyTests: normalizeYesNo_(data.hasReadyTests, 'لا'),
      consultationPaid: consultationPaid ? 'نعم' : 'لا',
      isFreeVisit: isFreeVisit ? 'نعم' : 'لا',
      surgeryInfoJson: serializeJsonField_(data.surgeryInfoJson !== undefined ? data.surgeryInfoJson : data.surgeryInfo),
      notes: limitText_(data.notes, 2000),
      visitStatus: 'waiting',
      extraCharges: [],
      statusInfo: {}
    };

    const rowNumber = appendRow_(sheet, 'Patient_Records', patientObjectToRow_(record));

    let transaction = null;
    if (consultationPaid) {
      transaction = recordFinancialTransactionInternal_({
        type: 'Consultation',
        itemName: 'Consultation - ' + record.fullName,
        amount: liveCfg_().consultationFee,
        paymentStatus: 'Paid',
        notes: buildVisitFinanceNote_(record.patientId, today, rowNumber)
      });
      if (mode === 'paid') {
        addEvent_({ type: 'charge', severity: 'info', patientName: record.fullName, message: 'الطبيب طلب تحصيل كشفية من: ' + record.fullName });
      }
    }

    const legacy = syncLegacyVisit_({
      name: record.fullName, age: record.age, date: today, phone: record.phone, diagnosis: ''
    });

    const todayList = readTodayPatients_(sheet);
    return plain_({
      success: true,
      confirmationRequired: false,
      patient: patientRowToObject_(patientObjectToRow_(record), rowNumber),
      patientId: patientId,
      isNewPatient: !existing,
      isFreeVisit: isFreeVisit,
      consultationPaid: consultationPaid,
      consultationFee: consultationPaid ? liveCfg_().consultationFee : 0,
      daysSinceLastVisit: daysSince,
      reviewReason: feeRule.reason,
      lastVisitDate: lastVisitDate || null,
      transaction: transaction,
      legacy: legacy,
      todayPatients: todayList,
      todayCount: todayList.length
    });
  });
}

/** مطابقة المريض: بالرقم الداخلي، أو (الاسم + الهاتف)، أو الاسم فقط إذا غاب الهاتف عن أحد الطرفين. */
function findExistingPatient_(sheet, payload) {
  const width = HEADERS.Patient_Records.length;
  const patientId = cleanString_(payload.patientId);
  let visits = [];

  if (patientId) {
    visits = readPatientVisits_(sheet, patientId);
  }

  if (!visits.length) {
    const nameKey = normalizeArabic_(payload.fullName);
    const phones = [phoneKey_(payload.phone), phoneKey_(payload.secondaryPhone)].filter(Boolean);
    const lastRow = sheet.getLastRow();
    if (nameKey && lastRow >= 2) {
      const rows = sheet.getRange(2, 1, lastRow - 1, width).getValues();
      rows.forEach(function (row, index) {
        if (normalizeArabic_(row[1]) !== nameKey || !cleanString_(row[0])) return;
        const rowPhones = [phoneKey_(row[5]), phoneKey_(row[6])].filter(Boolean);
        const phoneOk = !phones.length || !rowPhones.length ||
          phones.some(function (p) { return rowPhones.indexOf(p) !== -1; });
        if (phoneOk) visits.push(patientRowToObject_(row, index + 2));
      });
      // إذا تعددت هويات بنفس الاسم نأخذ أحدثها
      visits.sort(function (a, b) { return compareYmd_(b.visitDate, a.visitDate) || (b.rowNumber - a.rowNumber); });
      if (visits.length) {
        const chosenId = visits[0].patientId;
        visits = visits.filter(function (v) { return v.patientId === chosenId; });
      }
    }
  }

  if (!visits.length) return null;
  visits.sort(function (a, b) { return compareYmd_(b.visitDate, a.visitDate) || (b.rowNumber - a.rowNumber); });
  return { patientId: visits[0].patientId, latest: visits[0], visits: visits };
}

function validatePatientPayload_(data) {
  if (!cleanString_(data.fullName)) throw new Error('اسم المراجع مطلوب.');
  if (!cleanString_(data.phone) && !cleanString_(data.secondaryPhone)) throw new Error('رقم هاتف واحد على الأقل مطلوب.');
  normalizeAge_(data.age);
}

function patientRowToObject_(row, rowNumber) {
  const prescriptions = parsePrescriptions_(row[11]);
  const extra = parseJsonSafe_(row[19], []);
  const info = parseJsonSafe_(row[20], {});
  const consultationPaid = cleanString_(row[14]);
  const testsRaw = cleanString_(row[12]);
  return {
    rowNumber: rowNumber || null,
    patientId: cleanString_(row[0]),
    fullName: cleanString_(row[1]),
    age: parseAgeLoose_(row[2]),
    gender: cleanString_(row[3]),
    address: cleanString_(row[4]),
    phone: restorePhone_(row[5]),
    secondaryPhone: restorePhone_(row[6]),
    escortsCount: parseAgeLoose_(row[7]) || 0,
    visitDate: toYmd_(row[8]),
    lastVisitDate: toYmd_(row[9]),
    diagnosis: cleanString_(row[10]),
    prescriptions: prescriptions,
    prescriptionsJson: prescriptions,
    testsRequested: testsRaw,
    tests: normalizeTests_(testsRaw),
    hasReadyTests: normalizeYesNo_(row[13], 'لا'),
    consultationPaid: consultationPaid,
    isFreeVisit: cleanString_(row[15]),
    refunded: consultationPaid === 'مسترد',
    surgeryInfoJson: parseStoredJsonField_(row[16]),
    notes: cleanString_(row[17]),
    visitStatus: normalizeVisitStatus_(row[18]),
    extraCharges: Array.isArray(extra) ? extra.filter(function (k) { return !!CONFIG.EXTRA_FEES[k]; }) : [],
    statusInfo: (info && typeof info === 'object' && !Array.isArray(info)) ? info : {}
  };
}

/** يحوّل كائن المريض إلى صف من 21 عموداً بالترتيب المعتمد في الشيت. */
function patientObjectToRow_(record) {
  const rx = Array.isArray(record.prescriptions) ? record.prescriptions
    : (Array.isArray(record.prescriptionsJson) ? record.prescriptionsJson : []);
  return [
    record.patientId || '',
    record.fullName || '',
    record.age === null || record.age === undefined ? '' : record.age,
    record.gender || '',
    record.address || '',
    record.phone || '',
    record.secondaryPhone || '',
    record.escortsCount === null || record.escortsCount === undefined ? 0 : record.escortsCount,
    record.visitDate || '',
    record.lastVisitDate || '',
    record.diagnosis || '',
    rx.length ? JSON.stringify(rx) : '',
    Array.isArray(record.tests) ? record.tests.join(', ') : (record.testsRequested || ''),
    record.hasReadyTests || 'لا',
    record.consultationPaid || 'لا',
    record.isFreeVisit || 'لا',
    typeof record.surgeryInfoJson === 'string' ? record.surgeryInfoJson : serializeJsonField_(record.surgeryInfoJson),
    record.notes || '',
    normalizeVisitStatus_(record.visitStatus),
    (record.extraCharges && record.extraCharges.length) ? JSON.stringify(record.extraCharges) : '',
    (record.statusInfo && Object.keys(record.statusInfo).length) ? JSON.stringify(record.statusInfo) : ''
  ];
}

function locatePatientVisit_(sheet, payload) {
  const width = HEADERS.Patient_Records.length;
  const patientId = cleanString_(payload.patientId);
  const visitDate = toYmd_(payload.visitDate);
  const rowNumber = Number(payload.rowNumber);

  if (Number.isInteger(rowNumber) && rowNumber >= 2 && rowNumber <= sheet.getLastRow()) {
    const values = sheet.getRange(rowNumber, 1, 1, width).getValues()[0];
    const record = patientRowToObject_(values, rowNumber);
    // حماية من أرقام صفوف قديمة (إذا حُذف/أُدرج صف يدوياً في الشيت)
    if (!patientId || record.patientId === patientId) return { rowNumber: rowNumber, record: record };
  }
  if (!patientId) return null;

  const visits = readPatientVisits_(sheet, patientId).filter(function (v) {
    return !visitDate || v.visitDate === visitDate;
  });
  return visits.length ? { rowNumber: visits[0].rowNumber, record: visits[0] } : null;
}

// ---------------------------------------------------------------------------
// Doctor workspace: حفظ الزيارة + الإجراء (إغلاق / انتهاء / تأجيل) + FREE + الأجور
// ---------------------------------------------------------------------------

/**
 * نقطة الدخول الرئيسية لواجهة الطبيب. عملية واحدة ذرّية:
 *   payload = {
 *     rowNumber, patientId, visitDate,          // تحديد الزيارة
 *     diagnosis, notes, hasReadyTests,          // نصوص (اختيارية)
 *     tests: ['MRI','CT','X-Ray','EMG','Lab'],  // أو testsRequested كنص
 *     prescriptions: [{name,dose,timing,timingNote,duration}],
 *     action: 'save' | 'close' | 'finish' | 'postpone' | 'reopen',
 *     refund: true,                             // زر FREE (إرجاع الكشفية)
 *     extraCharges: ['consultation','stitches'],// الأجور الإضافية (المجموعة الكاملة)
 *     postponeNote: 'نص اختياري'
 *   }
 *  - 'save'     حفظ صامت (يُستعمل للحفظ التلقائي).
 *  - 'close'    حفظ وإغلاق دون أي إشعار للسكرتير.
 *  - 'finish'   حفظ + المريض يصبح رمادياً/معطّلاً مع قلم للعودة إليه.
 *  - 'postpone' حفظ + إشعار للسكرتير بأن المريض أُرسل إلى الفحوصات المختارة.
 *  - 'reopen'   يعيد المريض إلى حالة الانتظار (زر القلم).
 */
function saveDoctorVisit_(payload) {
  const data = payload || {};
  const action = (cleanString_(data.action) || 'save').toLowerCase();
  if (['save', 'close', 'finish', 'postpone', 'reopen'].indexOf(action) === -1) {
    throw new Error('إجراء غير معروف: ' + action);
  }
  const has = function (key) { return Object.prototype.hasOwnProperty.call(data, key); };

  return withLock_(function () {
    const ss = getSpreadsheet_();
    const sheet = getSheetAndValidate_(ss, 'Patient_Records');
    const target = locatePatientVisit_(sheet, data);
    if (!target) throw new Error('تعذر العثور على زيارة المريض. حدّث القائمة ثم حاول مجدداً.');

    const current = target.record;
    const rowNumber = target.rowNumber;
    const updated = Object.assign({}, current);
    const pendingEvents = [];

    // --- حقول الاستشارة
    if (has('diagnosis')) updated.diagnosis = limitText_(data.diagnosis, 4000);
    if (has('notes')) updated.notes = limitText_(data.notes, 4000);
    if (has('hasReadyTests')) updated.hasReadyTests = normalizeYesNo_(data.hasReadyTests, current.hasReadyTests || 'لا');
    let freshRx = [];
    if (has('prescriptions') || has('prescriptionsJson')) {
      const incoming = normalizePrescriptions_(has('prescriptions') ? data.prescriptions : data.prescriptionsJson);
      if (has('knownPrescriptions')) {
        // دمج ثلاثي: ما أُضيف من مكان آخر (السكرتير) ولم تعرفه الواجهة يبقى ولا يُمحى
        const known = {}, have = {};
        normalizePrescriptions_(data.knownPrescriptions).forEach(function (x) { known[rxKey_(x)] = 1; });
        incoming.forEach(function (x) { have[rxKey_(x)] = 1; });
        current.prescriptions.forEach(function (x) {
          const k = rxKey_(x);
          if (!known[k] && !have[k]) { incoming.push(x); have[k] = 1; }
        });
      }
      const before = {};
      current.prescriptions.forEach(function (x) { before[rxKey_(x)] = 1; });
      freshRx = incoming.filter(function (x) { return !before[rxKey_(x)]; });
      updated.prescriptions = incoming;
    }
    if (has('tests') || has('testsRequested')) {
      updated.tests = normalizeTests_(has('tests') ? data.tests : data.testsRequested);
      updated.testsRequested = updated.tests.join(', ');
    }

    // --- FREE: إرجاع الكشفية
    let refund = null;
    if (isAffirmative_(data.refund) || isAffirmative_(data.refundRequested)) {
      refund = applyConsultationRefund_(ss, current, rowNumber);
      updated.consultationPaid = 'مسترد';
      if (!refund.alreadyRefunded) {
        pendingEvents.push({
          type: 'refund', severity: 'danger', amount: refund.amount,
          message: 'أرجِع ' + fmtMoney_(refund.amount) + ' للمراجع «' + current.fullName + '» (الكشفية مُرجَعة)'
        });
      }
    }

    // --- الأجور الإضافية
    let charges = { added: [], removed: [], all: current.extraCharges || [], amountDue: 0, amountBack: 0 };
    if (has('extraCharges')) {
      charges = applyExtraCharges_(ss, current, rowNumber, data.extraCharges);
      updated.extraCharges = charges.all;
      if (charges.added.length) {
        pendingEvents.push({
          type: 'charge', severity: 'info', amount: charges.amountDue,
          message: 'حصّل من المراجع «' + current.fullName + '»: ' +
            charges.added.map(function (k) { return CONFIG.EXTRA_FEES[k].label; }).join(' + ') +
            ' = ' + fmtMoney_(charges.amountDue)
        });
      }
      if (charges.removed.length) {
        pendingEvents.push({
          type: 'refund', severity: 'danger', amount: charges.amountBack,
          message: 'أرجِع ' + fmtMoney_(charges.amountBack) + ' للمراجع «' + current.fullName + '» (إلغاء: ' +
            charges.removed.map(function (k) { return CONFIG.EXTRA_FEES[k].label; }).join(' + ') + ')'
        });
      }
    }

    // --- الحالة
    const info = Object.assign({}, current.statusInfo);
    const now = nowDateTime_();
    if (action === 'finish') { updated.visitStatus = 'finished'; info.finishedAt = now; }
    else if (action === 'close') { updated.visitStatus = 'closed'; info.closedAt = now; }
    else if (action === 'reopen') { updated.visitStatus = 'waiting'; info.reopenedAt = now; }
    else if (action === 'postpone') {
      updated.visitStatus = 'postponed';
      const tests = updated.tests && updated.tests.length ? updated.tests : normalizeTests_(updated.testsRequested);
      info.postponedAt = now;
      info.postponeTo = tests.map(testLabel_);
      info.postponeNote = limitText_(data.postponeNote, 300);
      pendingEvents.push({
        type: 'postpone', severity: 'warning',
        message: 'تأجيل المراجع «' + current.fullName + '»' +
          (info.postponeTo.length ? ' — أُرسل إلى: ' + info.postponeTo.join('، ') : '') +
          (info.postponeNote ? ' (' + info.postponeNote + ')' : '')
      });
    }
    updated.statusInfo = info;

    // --- كتابة الأعمدة 11..21 دفعة واحدة (لا نلمس بيانات الاستقبال)
    const row = patientObjectToRow_(updated);
    writeRow_(sheet, 'Patient_Records', rowNumber, 11, row.slice(10));
    if (freshRx.length) { try { rememberDrugs_(ss, freshRx); } catch (e) { /* مكتبة الأدوية اختيارية */ } }

    // --- مزامنة الملف القديم عند تغيّر التشخيص
    let legacy = null;
    if (updated.diagnosis !== current.diagnosis) {
      legacy = syncLegacyVisit_({
        name: current.fullName, age: current.age, date: current.visitDate,
        phone: current.phone, diagnosis: updated.diagnosis
      });
    }

    const events = pendingEvents.map(function (evt) {
      evt.patientName = current.fullName;
      evt.patientId = current.patientId;
      evt.rowNumber = rowNumber;
      return addEvent_(evt);
    });

    const fresh = sheet.getRange(rowNumber, 1, 1, HEADERS.Patient_Records.length).getValues()[0];
    return plain_({
      success: true,
      action: action,
      patient: patientRowToObject_(fresh, rowNumber),
      refund: refund,
      charges: charges,
      events: events,
      legacy: legacy
    });
  });
}

/** توافق مع النسخة القديمة من الواجهة. */
function updatePatientByDoctor_(payload) {
  const data = Object.assign({}, payload || {});
  if (data.refundRequested !== undefined && data.refund === undefined) data.refund = data.refundRequested;
  return saveDoctorVisit_(data);
}

/** إرجاع الكشفية: يقرأ المبلغ الفعلي المدفوع من دفتر الحسابات، ويكتب سطراً سالباً. */
function applyConsultationRefund_(ss, current, rowNumber) {
  if (current.consultationPaid === 'مسترد') return { alreadyRefunded: true, amount: 0, transaction: null };
  if (current.consultationPaid !== 'نعم') {
    throw new Error('هذه الزيارة مجانية أو غير مدفوعة، لا توجد كشفية لإرجاعها.');
  }
  const financials = getSheetAndValidate_(ss, 'Financials');
  const refundNote = buildRefundFinanceNote_(current.patientId, current.visitDate, rowNumber);

  // إن وُجد سطر الإرجاع سابقاً (فشل جزئي سابق) لا نكرره
  if (findRowNumbers_(financials, 7, refundNote, true).length) {
    return { alreadyRefunded: true, amount: 0, transaction: null };
  }

  let amount = liveCfg_().consultationFee;
  const paidRows = findRowNumbers_(financials, 7, buildVisitFinanceNote_(current.patientId, current.visitDate, rowNumber), true);
  if (paidRows.length) {
    const paid = Number(financials.getRange(paidRows[paidRows.length - 1], 5).getValue());
    if (isFinite(paid) && paid > 0) amount = paid;
  }

  const tx = recordFinancialTransactionInternal_({
    type: 'Refund',
    itemName: 'Consultation Refund - ' + current.fullName,
    amount: -amount,
    paymentStatus: 'Refunded',
    notes: refundNote
  });
  return { alreadyRefunded: false, amount: amount, transaction: tx };
}

/**
 * الأجور الإضافية. المجموعة المرسلة هي "المطلوب النهائي": ما أُضيف يُسجَّل دخلاً،
 * وما أُزيل يُسجَّل إرجاعاً. الحالة تُشتق من دفتر الحسابات نفسه فلا يحدث تكرار.
 */
function applyExtraCharges_(ss, current, rowNumber, desiredInput) {
  const desired = uniqueList_((Array.isArray(desiredInput) ? desiredInput : String(desiredInput || '').split(','))
    .map(function (k) { return cleanString_(k); })
    .filter(function (k) { return !!CONFIG.EXTRA_FEES[k]; }));
  const stored = current.extraCharges || [];
  const result = { added: [], removed: [], all: [], amountDue: 0, amountBack: 0 };
  const financials = getSheetAndValidate_(ss, 'Financials');

  Object.keys(CONFIG.EXTRA_FEES).forEach(function (kind) {
    const wants = desired.indexOf(kind) !== -1;
    const had = stored.indexOf(kind) !== -1;
    if (wants === had) { if (wants) result.all.push(kind); return; }

    const fee = CONFIG.EXTRA_FEES[kind];
    const chargeTag = buildExtraNote_('EXTRA', kind, current, rowNumber);
    const reverseTag = buildExtraNote_('EXTRA-REVERSE', kind, current, rowNumber);
    const charged = findRowNumbers_(financials, 7, chargeTag, false).length;
    const reversed = findRowNumbers_(financials, 7, reverseTag, false).length;
    const netCharged = charged - reversed > 0;

    if (wants) {
      if (!netCharged) {
        recordFinancialTransactionInternal_({
          type: 'ExtraFee', itemName: fee.label + ' - ' + current.fullName,
          amount: fee.amount, paymentStatus: 'Paid', notes: chargeTag
        });
        result.amountDue += fee.amount;
      }
      result.added.push(kind);
      result.all.push(kind);
    } else {
      if (netCharged) {
        recordFinancialTransactionInternal_({
          type: 'Refund', itemName: 'Reverse ' + fee.label + ' - ' + current.fullName,
          amount: -fee.amount, paymentStatus: 'Refunded', notes: reverseTag
        });
        result.amountBack += fee.amount;
      }
      result.removed.push(kind);
    }
  });
  return result;
}

function buildExtraNote_(prefix, kind, current, rowNumber) {
  return '[' + prefix + '][' + kind + '][' + current.patientId + '][' + current.visitDate + '][ROW=' + rowNumber + ']';
}

/**
 * عملية جراحية ضمن سجل زيارة المريض (Surgery_Info_JSON).
 * إذا كانت مدفوعة ومبلغها > 0 تُسجَّل أيضاً كدخل.
 */
function addSurgery_(payload) {
  const data = payload || {};
  if (!cleanString_(data.operationType)) throw new Error('نوع العملية مطلوب.');
  if (!cleanString_(data.operationDate)) throw new Error('تاريخ العملية مطلوب.');
  if (!cleanString_(data.location)) throw new Error('مكان العملية مطلوب.');

  return withLock_(function () {
    const ss = getSpreadsheet_();
    const sheet = getSheetAndValidate_(ss, 'Patient_Records');
    const target = locatePatientVisit_(sheet, data);
    if (!target) throw new Error('تعذر العثور على زيارة المريض.');

    const current = target.record;
    const operations = normalizeOperations_(current.surgeryInfoJson);
    const amountRaw = parseAmount_(data.amount);
    const operation = {
      operationId: nextId_(CONFIG.OPERATION_COUNTER_PROPERTY, 'OP'),
      patientId: current.patientId,
      patientName: current.fullName,
      operationType: limitText_(data.operationType, 150),
      details: limitText_(data.details, 2000),
      operationDate: toYmd_(data.operationDate) || cleanString_(data.operationDate),
      operationTime: cleanString_(data.operationTime),
      location: limitText_(data.location, 150),
      amount: isFinite(amountRaw) && amountRaw > 0 ? amountRaw : 0,
      paymentStatus: cleanString_(data.paymentStatus) || 'غير مدفوع',
      createdAt: nowDateTime_()
    };
    appendSurgeryRow_(ss, operation, current, target.rowNumber);
    operations.push(operation);
    current.surgeryInfoJson = JSON.stringify(operations);
    writeRow_(sheet, 'Patient_Records', target.rowNumber, 17, [current.surgeryInfoJson]);

    let transaction = null;
    if (operation.amount > 0 && isPaidStatus_(operation.paymentStatus)) {
      transaction = recordFinancialTransactionInternal_({
        type: 'Surgery',
        itemName: operation.operationType + ' - ' + current.fullName,
        amount: operation.amount,
        paymentStatus: 'Paid',
        notes: '[SURGERY][' + current.patientId + '][' + operation.operationId + ']'
      });
    }
    const fresh = sheet.getRange(target.rowNumber, 1, 1, HEADERS.Patient_Records.length).getValues()[0];
    return plain_({
      success: true,
      patient: patientRowToObject_(fresh, target.rowNumber),
      operation: operation,
      transaction: transaction
    });
  });
}

// ---------------------------------------------------------------------------
// Events: إشعارات السكرتير (إرجاع مال، تأجيل، تحصيل أجور)
// ---------------------------------------------------------------------------

function addEvent_(evt) {
  const props = PropertiesService.getScriptProperties();
  const state = parseJsonSafe_(props.getProperty(CONFIG.EVENTS_PROPERTY), null) || { seq: 0, list: [] };
  if (!Array.isArray(state.list)) state.list = [];
  state.seq = (Number(state.seq) || 0) + 1;

  const event = Object.assign({ id: state.seq, ts: nowDateTime_(), date: todayYmd_() }, evt);
  event.message = limitText_(event.message, 220);
  state.list.push(event);
  CM_PENDING_.push('E0');

  const cutoff = addDaysYmd_(todayYmd_(), -1);
  state.list = state.list.filter(function (e) { return e.date >= cutoff; }).slice(-25);
  // حد الخاصية 9KB — نقلّص من الأقدم عند الحاجة
  while (JSON.stringify(state).length > 8000 && state.list.length > 1) state.list.shift();
  props.setProperty(CONFIG.EVENTS_PROPERTY, JSON.stringify(state));
  return event;
}

function getTodayEvents_() {
  const state = parseJsonSafe_(PropertiesService.getScriptProperties().getProperty(CONFIG.EVENTS_PROPERTY), null);
  if (!state || !Array.isArray(state.list)) return [];
  const today = todayYmd_();
  return state.list.filter(function (e) { return e.date === today; });
}

// ---------------------------------------------------------------------------
// Prescriptions & tests normalization
// ---------------------------------------------------------------------------

function normalizePrescriptions_(value) {
  let list = value;
  if (typeof list === 'string') list = parseJsonSafe_(list, []);
  if (!Array.isArray(list)) return [];
  return list.slice(0, 100).map(normalizeRxItem_).filter(function (x) { return !!x.name; });
}

function parsePrescriptions_(stored) {
  const raw = cleanString_(stored);
  if (!raw) return [];
  const parsed = parseJsonSafe_(raw, raw);
  if (Array.isArray(parsed)) return parsed.map(normalizeRxItem_).filter(function (x) { return !!x.name; });
  if (typeof parsed === 'string') return [normalizeRxItem_({ name: parsed })];
  return [];
}

function normalizeRxItem_(item) {
  const src = item && typeof item === 'object' ? item : { name: item };
  const name = limitText_(src.name || src.drug || '', 120);
  const form = limitText_(src.form || '', 30);
  const strength = limitText_(normalizeDigits_(src.strength || ''), 20);
  const unit = strength ? (rxUnitFor_(form) || limitText_(src.unit || '', 10)) : '';
  const hours = limitText_(normalizeDigits_(src.hours || ''), 6);

  let timing = cleanString_(src.timing || src.when || '');
  let timingNote = limitText_(src.timingNote || src.whenNote || '', 120);
  if (timing && !RX_TIMING_LABELS[timing]) {
    const byLabel = Object.keys(RX_TIMING_LABELS).filter(function (k) { return RX_TIMING_LABELS[k] === timing; })[0];
    if (byLabel) timing = byLabel;
    else { if (!timingNote) timingNote = timing; timing = 'other'; }
  }
  if (!timing && cleanString_(src.frequency)) { timing = 'other'; if (!timingNote) timingNote = limitText_(src.frequency, 120); }

  const dose = limitText_(src.dose || '', 30);
  const duration = limitText_(src.duration || '', 40);
  const timingText = !timing ? '' :
    timing === 'other' ? (timingNote || 'Other') :
    timing === 'every' ? ('Every ' + (hours || '?') + ' h') :
    ((RX_TIMING_EN[timing] || '') + (timingNote ? ' (' + timingNote + ')' : ''));
  const drugLine = [name, strength ? strength + (unit.length > 3 ? ' ' : '') + unit : '', form].filter(Boolean).join(' ');

  return {
    name: name, form: form, strength: strength, unit: unit,
    dose: dose, timing: timing, timingNote: timingNote, hours: hours, duration: duration,
    frequency: timingText,
    text: [drugLine, dose, timingText, durationEn_(duration)].filter(Boolean).join(' · ')
  };
}

function durationEn_(code) {
  const c = cleanString_(code);
  if (!c) return '';
  if (c === 'prn') return 'PRN (as needed)';
  if (c === 'until_review') return 'Until review';
  const m = c.match(/^d(\d+)$/);
  if (!m) return c;
  const n = Number(m[1]);
  return n === 30 ? 'for 1 month' : n === 1 ? 'for 1 day' : 'for ' + n + ' days';
}

function rxKey_(x) {
  return [x.name, x.form, x.strength, x.dose, x.timing, x.timingNote, x.hours, x.duration]
    .map(function (v) { return cleanString_(v); }).join('|').toLowerCase();
}

function rxUnitFor_(form) {
  const f = RX_FORMS.filter(function (r) { return r[0] === form; })[0];
  return f ? f[2] : '';
}

/** d1..d30 / prn / until_review  →  نص عربي. */
function durationLabel_(code) {
  const c = cleanString_(code);
  if (!c) return '';
  if (c === 'prn') return 'عند الحاجة';
  if (c === 'until_review') return 'لحين المراجعة';
  const m = c.match(/^d(\d+)$/);
  if (!m) return c;
  const n = Number(m[1]);
  if (n === 1) return 'لمدة يوم';
  if (n === 2) return 'لمدة يومين';
  if (n === 30) return 'لمدة شهر';
  if (n >= 3 && n <= 10) return 'لمدة ' + n + ' أيام';
  return 'لمدة ' + n + ' يوماً';
}

function normalizeTests_(value) {
  let list = value;
  if (typeof list === 'string') list = list.split(/[,،;\n]+/);
  if (!Array.isArray(list)) return [];
  const out = [];
  list.forEach(function (t) {
    const raw = cleanString_(t);
    if (!raw) return;
    const key = raw.toLowerCase();
    const code = TEST_LABELS[raw] ? raw : (TEST_ALIASES[key] || TEST_ALIASES[normalizeArabic_(raw)] || raw);
    if (out.indexOf(code) === -1) out.push(code);
  });
  return out.slice(0, 20);
}

function testLabel_(code) { return TEST_LABELS[code] || code; }

function normalizeVisitStatus_(value) {
  const v = cleanString_(value).toLowerCase();
  return VISIT_STATUSES.indexOf(v) !== -1 ? v : 'waiting';
}

// ---------------------------------------------------------------------------
// Bookings (الحجوزات الهاتفية)
// ---------------------------------------------------------------------------

function getTodayBookings_() {
  const ss = getSpreadsheet_();
  ensureBookingsArchived_(ss);
  return plain_(readTodayBookings_(ss));
}

function readTodayBookings_(ss) {
  return splitBookings_(readAllBookings_(ss)).bookings;
}

function bookingRowToObject_(row, rowNumber) {
  const callTime = toDateTimeString_(row[2]);
  return {
    rowNumber: rowNumber || null,
    bookingId: cleanString_(row[0]),
    patientName: cleanString_(row[1]),
    callTime: callTime,
    callDate: toYmd_(callTime),
    phone: restorePhone_(row[3]),
    requestedSlot: cleanString_(row[4]),
    status: cleanString_(row[5]) || 'Pending'
  };
}

function updateBookingStatus_(payload) {
  const data = payload || {};
  const bookingId = cleanString_(data.bookingId);
  const status = cleanString_(data.status);
  const allowed = ['Pending', 'حضر', 'لم يحضر', 'تم الحجز', 'ملغى'];
  if (!bookingId) throw new Error('رقم الحجز مطلوب.');
  if (allowed.indexOf(status) === -1) throw new Error('حالة الحجز غير صالحة.');

  return withLock_(function () {
    const ss = getSpreadsheet_();
    const sheet = getSheetAndValidate_(ss, 'Bookings');
    const found = findRowNumbers_(sheet, 1, bookingId, true);
    if (!found.length) throw new Error('لم يتم العثور على الحجز.');
    const rowNumber = found[0];
    writeRow_(sheet, 'Bookings', rowNumber, 6, [status]);
    const values = sheet.getRange(rowNumber, 1, 1, 6).getValues()[0];
    return plain_(Object.assign({ success: true, booking: bookingRowToObject_(values, rowNumber) }, splitBookings_(readAllBookings_(ss))));
  });
}

/** مرة واحدة يومياً: تنقل حجوزات الأيام السابقة إلى Bookings_Archive (لا حذف نهائي). */
function ensureBookingsArchived_(ss) {
  const props = PropertiesService.getScriptProperties();
  const today = todayYmd_();
  if (props.getProperty(CONFIG.BOOKINGS_ARCHIVED_ON_PROPERTY) === today) return;
  withLock_(function () {
    if (props.getProperty(CONFIG.BOOKINGS_ARCHIVED_ON_PROPERTY) === today) return;
    archiveOldBookings_(ss, getSheetAndValidate_(ss, 'Bookings'));
    props.setProperty(CONFIG.BOOKINGS_ARCHIVED_ON_PROPERTY, today);
  });
}

function archiveOldBookings_(ss, sheet) {
  const today = todayYmd_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  const rows = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
  const oldIdx = [];
  rows.forEach(function (row, i) {
    const d = toYmd_(row[2]);
    // نؤرشف فقط ما تاريخه مفهوم وأقدم من اليوم؛ أي صف غامض يبقى في مكانه
    if (d && d < today) oldIdx.push(i);
  });
  if (!oldIdx.length) return 0;

  let archive = ss.getSheetByName('Bookings_Archive');
  if (!archive) {
    archive = ss.insertSheet('Bookings_Archive');
    archive.getRange(1, 1, 1, 6).setValues([HEADERS.Bookings]);
    archive.setFrozenRows(1);
  }
  oldIdx.forEach(function (i) {
    const values = rows[i].map(function (v, c) { return c === 2 ? toDateTimeString_(v) : (v == null ? '' : String(v)); });
    appendRow_(archive, 'Bookings', values);
  });

  // حذف الكتل المتجاورة من الأسفل إلى الأعلى بأقل عدد من الاستدعاءات
  let end = oldIdx.length - 1;
  while (end >= 0) {
    let begin = end;
    while (begin > 0 && oldIdx[begin - 1] === oldIdx[begin] - 1) begin--;
    sheet.deleteRows(oldIdx[begin] + 2, end - begin + 1);
    end = begin - 1;
  }
  return oldIdx.length;
}

function normalizeCallTime_(value) {
  if (!value) return nowDateTime_();
  const s = toDateTimeString_(value);
  return s || nowDateTime_();
}

// ---------------------------------------------------------------------------
// Finance
// ---------------------------------------------------------------------------

function recordFinancialTransaction_(trans) {
  const data = trans || {};
  requireFinancePin_(data.pin);
  return withLock_(function () {
    return plain_({ success: true, transaction: recordFinancialTransactionInternal_(data) });
  });
}

function recordClinicExpense_(expense) {
  const data = expense || {};
  requireFinancePin_(data.pin);
  if (!cleanString_(data.itemName)) throw new Error('بند المصروف مطلوب.');

  const quantity = normalizePositiveNumber_(data.quantity, 1);
  const unitPrice = parseAmount_(data.unitPrice);
  if (!isFinite(unitPrice) || unitPrice < 0) throw new Error('سعر المصروف يجب أن يكون رقماً غير سالب.');

  return withLock_(function () {
    const transaction = recordFinancialTransactionInternal_({
      type: 'Expense',
      itemName: limitText_(data.itemName, 150),
      quantity: quantity,
      unitPrice: unitPrice,
      deductFromClinic: data.deductFromClinic === undefined ? true : isAffirmative_(data.deductFromClinic),
      paymentStatus: cleanString_(data.paymentStatus) || 'Paid',
      date: data.date || todayYmd_(),
      notes: limitText_(data.notes, 300)
    });
    return plain_({ success: true, transaction: transaction });
  });
}

function recordFinancialTransactionInternal_(trans) {
  const data = trans || {};
  let type = cleanString_(data.type) || 'Other';
  const itemName = cleanString_(data.itemName);
  let amount = parseAmount_(data.amount);
  const paymentStatus = cleanString_(data.paymentStatus) || 'Paid';
  let notes = cleanString_(data.notes);

  if (type === 'Expense' || type === 'مصروف') {
    const quantity = normalizePositiveNumber_(data.quantity, 1);
    const unitPrice = data.unitPrice !== undefined && data.unitPrice !== '' ? parseAmount_(data.unitPrice) : amount;
    if (!isFinite(unitPrice) || unitPrice < 0) throw new Error('سعر المصروف يجب أن يكون رقماً غير سالب.');
    amount = quantity * unitPrice;
    notes = JSON.stringify({
      kind: 'expense',
      quantity: quantity,
      unitPrice: unitPrice,
      deductFromClinic: data.deductFromClinic === undefined ? true : isAffirmative_(data.deductFromClinic),
      note: cleanString_(data.notes)
    });
    type = 'Expense';
  }

  if (!itemName) throw new Error('اسم البند مطلوب للمعاملة المالية.');
  if (!isFinite(amount)) throw new Error('مبلغ المعاملة يجب أن يكون رقماً.');
  if (amount < 0 && type !== 'Refund') throw new Error('المبلغ السالب مسموح للإرجاع فقط.');

  const sheet = getSheetAndValidate_(getSpreadsheet_(), 'Financials');
  const transactionId = nextId_(CONFIG.TRANSACTION_COUNTER_PROPERTY, 'TX');
  const requestedDate = data.date !== undefined ? data.date : data.transactionDate;
  const date = requestedDate ? toYmd_(requestedDate) : todayYmd_();
  if (!date) throw new Error('تاريخ المعاملة غير صالح.');

  const rowNumber = appendRow_(sheet, 'Financials', [transactionId, date, type, itemName, amount, paymentStatus, notes]);
  return {
    transactionId: transactionId, date: date, type: type, itemName: itemName,
    amount: amount, paymentStatus: paymentStatus, notes: notes, rowNumber: rowNumber
  };
}

function parseExpenseMeta_(notes) {
  const parsed = parseJsonSafe_(notes, null);
  return parsed && typeof parsed === 'object' && parsed.kind === 'expense' ? parsed : null;
}

function financialRowToObject_(row, rowNumber) {
  return {
    rowNumber: rowNumber || null,
    transactionId: cleanString_(row[0]),
    date: toYmd_(row[1]),
    type: cleanString_(row[2]),
    itemName: cleanString_(row[3]),
    amount: Number(row[4]) || 0,
    paymentStatus: cleanString_(row[5]),
    notes: cleanString_(row[6])
  };
}

/** لوحة الإحصائيات (محمية بالرمز). الصافي = الدخل − الإرجاعات − المصروفات المخصومة. */
function getClinicDashboardStats_(pin) {
  requireFinancePin_(pin);
  const sheet = getSheetAndValidate_(getSpreadsheet_(), 'Financials');
  const today = todayYmd_();
  const s = {
    totalIncome: 0, todayIncome: 0, totalRefunds: 0, todayRefunds: 0,
    totalExpenses: 0, todayExpenses: 0, externalExpenses: 0, todayExternalExpenses: 0
  };
  let transactionCount = 0;
  const byType = {};
  const daily = {};
  const all = [];

  function bucket(date) { return daily[date] || (daily[date] = { date: date, income: 0, refunds: 0, expenses: 0 }); }

  getDataRows_(sheet, 'Financials').forEach(function (row) {
    const t = financialRowToObject_(row);
    if (!t.transactionId && !t.itemName && !t.date) return;
    transactionCount++;
    const amount = t.amount;
    const type = t.type || 'Other';
    byType[type] = (byType[type] || 0) + amount;
    const isToday = t.date === today;
    const b = t.date ? bucket(t.date) : { income: 0, refunds: 0, expenses: 0 };

    if (type === 'Expense' || type === 'مصروف') {
      const meta = parseExpenseMeta_(t.notes);
      const deduct = meta ? meta.deductFromClinic !== false : true;
      const v = Math.abs(amount);
      if (deduct) { s.totalExpenses += v; b.expenses += v; if (isToday) s.todayExpenses += v; }
      else { s.externalExpenses += v; if (isToday) s.todayExternalExpenses += v; }
    } else if (type === 'Refund' || type === 'استرجاع') {
      const v = Math.abs(amount);
      s.totalRefunds += v; b.refunds += v; if (isToday) s.todayRefunds += v;
    } else if (amount > 0) {
      s.totalIncome += amount; b.income += amount; if (isToday) s.todayIncome += amount;
    }
    all.push(t);
  });

  all.sort(function (a, b) {
    return String(b.date).localeCompare(String(a.date)) || String(b.transactionId).localeCompare(String(a.transactionId));
  });

  const series = [];
  for (let i = 13; i >= 0; i--) {
    const d = addDaysYmd_(today, -i);
    const b = daily[d] || { income: 0, refunds: 0, expenses: 0 };
    series.push({ date: d, income: b.income, refunds: b.refunds, expenses: b.expenses, net: b.income - b.refunds - b.expenses });
  }

  return plain_({
    success: true,
    today: today,
    currency: 'IQD',
    consultationFee: liveCfg_().consultationFee,
    transactionCount: transactionCount,
    totalIncome: s.totalIncome, todayIncome: s.todayIncome,
    totalRefunds: s.totalRefunds, todayRefunds: s.todayRefunds,
    totalExpenses: s.totalExpenses, todayExpenses: s.todayExpenses,
    externalExpenses: s.externalExpenses, todayExternalExpenses: s.todayExternalExpenses,
    netIncome: s.totalIncome - s.totalRefunds - s.totalExpenses,
    todayNet: s.todayIncome - s.todayRefunds - s.todayExpenses,
    byType: byType,
    dailySeries: series,
    recentTransactions: all.slice(0, 50)
  });
}

function requireFinancePin_(pin) {
  const cache = CacheService.getScriptCache();
  const failKey = 'CLINIC_PIN_FAILS';
  const fails = Number(cache.get(failKey) || 0);
  if (fails >= CONFIG.PIN_MAX_FAILS) {
    throw new Error('محاولات كثيرة خاطئة. انتظر ' + Math.round(CONFIG.PIN_LOCK_SECONDS / 60) + ' دقائق ثم أعد المحاولة.');
  }
  const expected = PropertiesService.getScriptProperties().getProperty('FINANCE_PIN') || CONFIG.FINANCE_PIN;
  const given = normalizeDigits_(pin).trim();
  if (given !== String(expected)) {
    cache.put(failKey, String(fails + 1), CONFIG.PIN_LOCK_SECONDS);
    throw new Error('رمز المالية غير صحيح.');
  }
  if (fails) cache.remove(failKey);
}

// ---------------------------------------------------------------------------
// Presence: حالة اتصال الطبيب/السكرتير (تخزين مؤقت بمدة صلاحية)
// ---------------------------------------------------------------------------

function heartbeatPresence_(role) {
  const normalized = normalizeRole_(role);
  if (!normalized) throw new Error('دور غير صالح.');
  CacheService.getScriptCache().put(CONFIG.PRESENCE_CACHE_PREFIX + normalized, String(Date.now()), CONFIG.PRESENCE_TTL_SECONDS);
  return getClinicPresence_();
}

/** Cheap change counter for the website's poll (one Property read). The site re-fetches the snapshot only when it moves. */
function getChangeRev_() { return cmRev_(); }

function setPresenceOffline_(role) {
  const normalized = normalizeRole_(role);
  if (normalized) CacheService.getScriptCache().remove(CONFIG.PRESENCE_CACHE_PREFIX + normalized);
  return getClinicPresence_();
}

function getClinicPresence_() {
  const found = CacheService.getScriptCache().getAll([
    CONFIG.PRESENCE_CACHE_PREFIX + 'secretary',
    CONFIG.PRESENCE_CACHE_PREFIX + 'doctor'
  ]);
  const now = Date.now();
  const ttl = CONFIG.PRESENCE_TTL_SECONDS * 1000;
  function active(role) {
    const stamp = Number(found[CONFIG.PRESENCE_CACHE_PREFIX + role] || 0);
    return stamp > 0 && (now - stamp) <= ttl;
  }
  return { secretaryActive: active('secretary'), doctorActive: active('doctor'), ttlSeconds: CONFIG.PRESENCE_TTL_SECONDS };
}

function setSystemStatus_(active, pin) {
  requireFinancePin_(pin);
  const value = isAffirmative_(active) ? 'true' : 'false';
  PropertiesService.getScriptProperties().setProperty(CONFIG.SYSTEM_ACTIVE_PROPERTY, value);
  return { success: true, active: value === 'true' };
}

function normalizeRole_(role) {
  const value = cleanString_(role).toLowerCase();
  if (value === 'doctor' || value === 'طبيب') return 'doctor';
  if (value === 'secretary' || value === 'secretary_view' || value === 'سكرتير') return 'secretary';
  return '';
}

function getSystemActive_() {
  const value = PropertiesService.getScriptProperties().getProperty(CONFIG.SYSTEM_ACTIVE_PROPERTY);
  return value === null || value === '' ? true : value === 'true';
}

// ---------------------------------------------------------------------------
// Legacy workbook mirror (الملف القديم — 5 حقول فقط)
// ---------------------------------------------------------------------------

/** يفتح تبويب السنة الحالية ("26") في الملف القديم ويتحقق من ترويسته. */
function getLegacyTab_() {
  const L = CONFIG.LEGACY;
  const book = SpreadsheetApp.openById(L.SHEET_ID);
  let tab = null;
  for (let i = 0; i < L.TAB_CANDIDATES.length && !tab; i++) tab = book.getSheetByName(L.TAB_CANDIDATES[i]);
  if (!tab) throw new Error('لم يُعثر على تبويب "' + L.TAB_CANDIDATES[0] + '" في الملف القديم.');

  const actual = tab.getRange(1, 1, 1, L.HEADERS.length).getDisplayValues()[0].map(normalizeHeader_);
  const expected = L.HEADERS.map(normalizeHeader_);
  const okHeaders = expected.every(function (h, i) { return actual[i] === h; });
  if (!okHeaders) throw new Error('ترويسة تبويب الملف القديم لا تطابق (Name, Age, Booking Date, The Diagnosis, Phone Number, Notes).');
  return tab;
}

/**
 * upsert: إن وُجد صف لنفس (الاسم + التاريخ) في آخر الصفوف يُحدَّث التشخيص فقط،
 * وإلا يُضاف صف جديد. لا يفشل أبداً؛ عند الخطأ يضع العملية في طابور للإعادة.
 */
function syncLegacyVisit_(rec) {
  if (!CONFIG.LEGACY.ENABLED) return { ok: true, skipped: true };
  try {
    const result = upsertLegacyVisit_(rec);
    try { drainLegacyQueue_(); } catch (e) { /* الطابور يُعاد لاحقاً */ }
    return result;
  } catch (e) {
    queueLegacy_(rec);
    return { ok: false, queued: true, error: errMsg_(e) };
  }
}

function upsertLegacyVisit_(rec) {
  const tab = getLegacyTab_();
  const tz = getTz_();
  const nameKey = normalizeArabic_(rec.name);
  const dateYmd = toYmd_(rec.date);
  const phoneK = phoneKey_(rec.phone);

  // بحث في آخر N صف عن نفس الزيارة
  const lastData = getLastFilledRowInColumn_(tab, 1);
  if (lastData >= 2) {
    const count = Math.min(CONFIG.LEGACY.SCAN_ROWS, lastData - 1);
    const start = lastData - count + 1;
    const vals = tab.getRange(start, 1, count, 5).getValues();
    for (let i = vals.length - 1; i >= 0; i--) {
      const r = vals[i];
      if (normalizeArabic_(r[0]) !== nameKey || toYmd_(r[2]) !== dateYmd) continue;
      const rp = phoneKey_(r[4]);
      if (phoneK && rp && rp !== phoneK) continue;
      const rowNumber = start + i;
      if (cleanString_(r[3]) !== cleanString_(rec.diagnosis)) {
        tab.getRange(rowNumber, 4).setValue(cleanString_(rec.diagnosis));
      }
      return { ok: true, mode: 'updated', row: rowNumber };
    }
  }

  // إضافة صف جديد أسفل آخر اسم موجود
  const rowNumber = lastData + 1;
  if (rowNumber > tab.getMaxRows()) tab.insertRowsAfter(tab.getMaxRows(), rowNumber - tab.getMaxRows());
  const style = detectLegacyDateStyle_(tab, lastData);
  if (lastData >= 2) {
    try { tab.getRange(lastData, 1, 1, 6).copyTo(tab.getRange(rowNumber, 1, 1, 6), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false); } catch (e) { /* التنسيق اختياري */ }
  }

  const dateCell = tab.getRange(rowNumber, 3);
  if (style.kind === 'text') {
    dateCell.setNumberFormat('@');
    dateCell.setValue(style.format(dateYmd));
  } else {
    dateCell.setValue(Utilities.parseDate(dateYmd, tz, 'yyyy-MM-dd'));
    if (style.kind === 'unknown') dateCell.setNumberFormat('yyyy-mm-dd');
  }
  const phoneCell = tab.getRange(rowNumber, 5);
  phoneCell.setNumberFormat('@');
  phoneCell.setValue(cleanString_(rec.phone));
  tab.getRange(rowNumber, 1).setValue(cleanString_(rec.name));
  tab.getRange(rowNumber, 2).setValue(rec.age === '' || rec.age == null ? '' : rec.age);
  tab.getRange(rowNumber, 4).setValue(cleanString_(rec.diagnosis));
  return { ok: true, mode: 'appended', row: rowNumber };
}

/** يستنتج شكل التاريخ المستعمل في الملف القديم (Date حقيقي أو نص بنمط معين). */
function detectLegacyDateStyle_(tab, lastData) {
  if (lastData < 2) return { kind: 'unknown' };
  const v = tab.getRange(lastData, 3).getValue();
  if (Object.prototype.toString.call(v) === '[object Date]') return { kind: 'date' };
  const s = normalizeDigits_(v).trim();
  let m = s.match(/^(\d{4})([-\/.])(\d{1,2})\2(\d{1,2})$/);
  if (m) return { kind: 'text', format: function (ymd) { const p = ymd.split('-'); return p[0] + m[2] + (m[3].length === 2 ? p[1] : String(Number(p[1]))) + m[2] + (m[4].length === 2 ? p[2] : String(Number(p[2]))); } };
  m = s.match(/^(\d{1,2})([-\/.])(\d{1,2})\2(\d{4})$/);
  if (m) return { kind: 'text', format: function (ymd) { const p = ymd.split('-'); return (m[1].length === 2 ? p[2] : String(Number(p[2]))) + m[2] + (m[3].length === 2 ? p[1] : String(Number(p[1]))) + m[2] + p[0]; } };
  return { kind: 'unknown' };
}

function getLastFilledRowInColumn_(sheet, col) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 1) return 1;
  const values = sheet.getRange(1, col, lastRow, 1).getValues();
  for (let i = values.length - 1; i >= 1; i--) {
    if (cleanString_(values[i][0]) !== '') return i + 1;
  }
  return 1;
}

function queueLegacy_(rec) {
  try {
    const props = PropertiesService.getScriptProperties();
    const list = parseJsonSafe_(props.getProperty(CONFIG.LEGACY_QUEUE_PROPERTY), []);
    const q = Array.isArray(list) ? list : [];
    // آخر حالة لنفس الزيارة تحل محل السابقة
    const key = normalizeArabic_(rec.name) + '|' + toYmd_(rec.date);
    const next = q.filter(function (x) { return (normalizeArabic_(x.name) + '|' + toYmd_(x.date)) !== key; });
    next.push({ name: rec.name, age: rec.age, date: rec.date, phone: rec.phone, diagnosis: rec.diagnosis });
    props.setProperty(CONFIG.LEGACY_QUEUE_PROPERTY, JSON.stringify(next.slice(-15)));
  } catch (e) { /* لا شيء أسوأ من فشل الطابور نفسه */ }
}

/** يعيد محاولة العمليات المعلّقة. يجب أن يُستدعى والقفل ممسوك. */
function drainLegacyQueue_() {
  const props = PropertiesService.getScriptProperties();
  const list = parseJsonSafe_(props.getProperty(CONFIG.LEGACY_QUEUE_PROPERTY), []);
  if (!Array.isArray(list) || !list.length) return { attempted: 0, done: 0 };
  let done = 0;
  let failedAt = -1;
  for (let i = 0; i < list.length; i++) {
    try { upsertLegacyVisit_(list[i]); done++; }
    catch (e) { failedAt = i; break; } // الملف القديم غير متاح الآن: نبقي الباقي كما هو
  }
  if (failedAt === -1) props.deleteProperty(CONFIG.LEGACY_QUEUE_PROPERTY);
  else props.setProperty(CONFIG.LEGACY_QUEUE_PROPERTY, JSON.stringify(list.slice(failedAt)));
  return { attempted: list.length, done: done };
}

// ---------------------------------------------------------------------------
// Spreadsheet helpers
// ---------------------------------------------------------------------------

let SS_MEMO_ = null;
let TZ_MEMO_ = null;
const SHEET_MEMO_ = {};

function getSpreadsheet_() {
  if (!SS_MEMO_) SS_MEMO_ = SpreadsheetApp.openById(CONFIG.NEW_SHEET_ID);
  return SS_MEMO_;
}

function getTz_() {
  if (!TZ_MEMO_) {
    try { TZ_MEMO_ = getSpreadsheet_().getSpreadsheetTimeZone() || CONFIG.DEFAULT_TZ; }
    catch (e) { TZ_MEMO_ = CONFIG.DEFAULT_TZ; }
  }
  return TZ_MEMO_;
}

/** تعمل الدالة تحت قفل السكربت مع رسالة عربية واضحة عند الانشغال. */
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  try { lock.waitLock(CONFIG.LOCK_TIMEOUT_MS); }
  catch (e) { throw new Error('النظام مشغول بعملية أخرى، أعد المحاولة بعد لحظات.'); }
  try { return fn(); }
  finally {
    try { SpreadsheetApp.flush(); } catch (e) { /* ignore */ }
    try { flushChanges_(); } catch (e) { /* ignore */ }
    lock.releaseLock();
  }
}

/**
 * ترويسة الجدول تُقارن بعد إزالة الأحرف غير المرئية (U+2060 وأخواتها).
 * الأعمدة الأساسية يجب أن تطابق؛ الأعمدة الإضافية تُنشأ تلقائياً إن غابت.
 */
function normalizeHeader_(value) {
  return String(value === null || value === undefined ? '' : value)
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .replace(/[\u00A0]/g, ' ')
    .replace(/[\s_\-\/?:]+/g, '')
    .toLowerCase()
    .trim();
}

function getSheetAndValidate_(ss, sheetName) {
  if (SHEET_MEMO_[sheetName]) return SHEET_MEMO_[sheetName];
  const expected = HEADERS[sheetName];
  if (!expected) throw new Error('تعريف جدول غير معروف: ' + sheetName);
  const core = CORE_COLUMNS[sheetName];

  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.getRange(1, 1, 1, expected.length).setValues([expected]);
    sheet.setFrozenRows(1);
    SHEET_MEMO_[sheetName] = sheet;
    return sheet;
  }

  if (sheet.getMaxColumns() < expected.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), expected.length - sheet.getMaxColumns());
  }

  const actual = sheet.getRange(1, 1, 1, expected.length).getDisplayValues()[0];
  const actualNormalized = actual.map(normalizeHeader_);
  const mismatches = [];
  for (let i = 0; i < core; i++) {
    if (actualNormalized[i] !== normalizeHeader_(expected[i])) {
      mismatches.push('العمود ' + (i + 1) + ': وُجد [' + actual[i] + '] والمتوقع [' + expected[i] + ']');
    }
  }
  if (mismatches.length) {
    throw new Error('ترويسة الجدول "' + sheetName + '" غير مطابقة. ' + mismatches.join(' | '));
  }

  // أعمدة إضافية (19-21 للمراجعين): تُكتب ترويستها إن كانت فارغة
  for (let i = core; i < expected.length; i++) {
    if (cleanString_(actual[i]) === '') sheet.getRange(1, i + 1).setValue(expected[i]);
  }
  SHEET_MEMO_[sheetName] = sheet;
  return sheet;
}

function getDataRows_(sheet, sheetName) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const name = sheetName || sheet.getName();
  return sheet.getRange(2, 1, lastRow - 1, HEADERS[name].length).getValues();
}

/** أرقام الصفوف التي تحتوي النص في عمود معين (TextFinder = سريع حتى مع آلاف الصفوف). */
function findRowNumbers_(sheet, col, text, entireCell) {
  const lastRow = sheet.getLastRow();
  const needle = cleanString_(text);
  if (lastRow < 2 || !needle) return [];
  const finder = sheet.getRange(2, col, lastRow - 1, 1).createTextFinder(needle).matchCase(true);
  finder.matchEntireCell(!!entireCell);
  return finder.findAll().map(function (r) { return r.getRow(); }).sort(function (a, b) { return a - b; });
}

/**
 * يكتب صفاً كاملاً أو جزءاً منه مع فرض تنسيق "نص عادي" (@) على كل الأعمدة غير الرقمية،
 * فلا تتحول التواريخ/الهواتف/المعرّفات إلى Date أو أرقام.
 */
function writeRow_(sheet, sheetName, rowNumber, startCol, values) {
  const numeric = NUMERIC_COLUMNS[sheetName] || [];
  const range = sheet.getRange(rowNumber, startCol, 1, values.length);
  const formats = range.getNumberFormats();
  const out = values.map(function (v, i) {
    const col = startCol + i;
    if (numeric.indexOf(col) === -1) {
      formats[0][i] = '@';
      return v === null || v === undefined ? '' : String(v);
    }
    return v === null || v === undefined ? '' : v;
  });
  range.setNumberFormats(formats);
  range.setValues([out]);
  trackChange_(sheetName, rowNumber);
}

function appendRow_(sheet, sheetName, values) {
  const target = sheet.getLastRow() + 1;
  if (target > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), target - sheet.getMaxRows());
  writeRow_(sheet, sheetName, target, 1, values);
  return target;
}

// ---------------------------------------------------------------------------
// ID / date / text helpers
// ---------------------------------------------------------------------------

function nextId_(propertyName, prefix) {
  const properties = PropertiesService.getScriptProperties();
  const current = Number(properties.getProperty(propertyName) || 0) + 1;
  properties.setProperty(propertyName, String(current));
  const stamp = Utilities.formatDate(new Date(), getTz_(), 'yyyyMMdd');
  return prefix + '-' + stamp + '-' + String(current).padStart(6, '0');
}

function todayYmd_() { return Utilities.formatDate(new Date(), getTz_(), 'yyyy-MM-dd'); }
function nowDateTime_() { return Utilities.formatDate(new Date(), getTz_(), 'yyyy-MM-dd HH:mm:ss'); }

function isDate_(v) { return Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime()); }

/** يحوّل أي قيمة تاريخ (Date / رقم تسلسلي / نص عربي أو لاتيني) إلى yyyy-MM-dd، أو '' إن لم يُفهم. */
function toYmd_(value) {
  if (value === null || value === undefined || value === '') return '';
  if (isDate_(value)) return Utilities.formatDate(value, getTz_(), 'yyyy-MM-dd');
  if (typeof value === 'number') {
    if (value > 20000 && value < 90000) {
      const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000);
      return d.getUTCFullYear() + '-' + pad2_(d.getUTCMonth() + 1) + '-' + pad2_(d.getUTCDate());
    }
    return '';
  }
  const s = normalizeDigits_(value).trim();
  if (!s) return '';
  let m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})(?:[ T].*)?$/);
  if (m) return m[1] + '-' + pad2_(m[2]) + '-' + pad2_(m[3]);
  m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})(?:[ T].*)?$/);
  if (m) return m[3] + '-' + pad2_(m[2]) + '-' + pad2_(m[1]);
  const parsed = new Date(s);
  return isNaN(parsed.getTime()) ? '' : Utilities.formatDate(parsed, getTz_(), 'yyyy-MM-dd');
}

/** يعيد 'yyyy-MM-dd HH:mm:ss' من Date أو نص؛ النصوص تُترك كما هي بعد توحيد الأرقام. */
function toDateTimeString_(value) {
  if (value === null || value === undefined || value === '') return '';
  if (isDate_(value)) return Utilities.formatDate(value, getTz_(), 'yyyy-MM-dd HH:mm:ss');
  if (typeof value === 'number') return toYmd_(value);
  const s = normalizeDigits_(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s;
  const ymd = toYmd_(s);
  if (!ymd) return s;
  const time = s.match(/(\d{1,2}:\d{2}(?::\d{2})?)/);
  return ymd + (time ? ' ' + (time[1].length <= 5 ? time[1] + ':00' : time[1]) : '');
}

function pad2_(n) { return String(n).padStart(2, '0'); }

function ymdToUtcMs_(ymd) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ymd || ''))) return null;
  const p = String(ymd).split('-').map(Number);
  return Date.UTC(p[0], p[1] - 1, p[2]);
}
function daysBetweenYmd_(olderYmd, newerYmd) {
  const a = ymdToUtcMs_(olderYmd), b = ymdToUtcMs_(newerYmd);
  return a === null || b === null ? null : Math.floor((b - a) / 86400000);
}
function addDaysYmd_(ymd, days) {
  const ms = ymdToUtcMs_(ymd);
  if (ms === null) return ymd;
  const d = new Date(ms + days * 86400000);
  return d.getUTCFullYear() + '-' + pad2_(d.getUTCMonth() + 1) + '-' + pad2_(d.getUTCDate());
}
function compareYmd_(a, b) {
  const aa = String(a || ''), bb = String(b || '');
  return aa === bb ? 0 : (aa > bb ? 1 : -1);
}

function normalizeDigits_(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/[\u0660-\u0669]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); })
    .replace(/[\u06F0-\u06F9]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); });
}

/** توحيد الحروف العربية للبحث والمطابقة (أ/إ/آ→ا، ى→ي، ة→ه، حذف التشكيل). */
function normalizeArabic_(value) {
  return normalizeDigits_(value)
    .normalize('NFKC')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** يعيد الصفر الأول لأرقام الموبايل العراقية التي حوّلها Sheets إلى أرقام (7701234567). */
function restorePhone_(value) {
  if (value === null || value === undefined || value === '') return '';
  let s = typeof value === 'number' ? String(Math.round(value)) : normalizeDigits_(value).trim();
  if (/^7\d{9}$/.test(s)) s = '0' + s;
  return s;
}
function phoneDigits_(value) { return restorePhone_(value).replace(/\D/g, ''); }

/** مفتاح مقارنة موحّد: آخر 10 خانات بعد حذف 00/964/0 البادئة. */
function phoneKey_(value) {
  let d = phoneDigits_(value);
  if (!d) return '';
  d = d.replace(/^00/, '');
  if (d.indexOf('964') === 0 && d.length >= 12) d = d.slice(3);
  d = d.replace(/^0+/, '');
  return d.length > 10 ? d.slice(-10) : d;
}

function normalizePhoneInput_(value) {
  const s = normalizeDigits_(value).trim().replace(/[^\d+]/g, '');
  return s.length > 20 ? s.slice(0, 20) : s;
}

function normalizeSearch_(value) {
  return String(value === null || value === undefined ? '' : value).trim().toLowerCase().replace(/\s+/g, ' ');
}

function cleanString_(value) { return value === null || value === undefined ? '' : String(value).trim(); }
function limitText_(value, max) {
  const s = cleanString_(value);
  return s.length > max ? s.slice(0, max) : s;
}
function uniqueList_(list) { return list.filter(function (v, i) { return list.indexOf(v) === i; }); }

function normalizeAge_(value) {
  if (value === null || value === undefined || value === '') return '';
  const m = normalizeDigits_(value).trim().toUpperCase().match(/^(\d{1,3})(?:[.,]\d+)?\s*([YMD])?$/);
  if (!m) throw new Error('العمر غير صالح. اكتب رقماً واختر الوحدة (سنة / شهر / يوم).');
  const n = Number(m[1]);
  const unit = m[2] || 'Y';
  if (unit === 'Y') {
    if (n > 130) throw new Error('العمر يجب أن يكون بين 0 و 130 سنة.');
    return n;
  }
  if (unit === 'M') {
    if (n > 60) throw new Error('العمر بالأشهر يجب ألا يتجاوز 60 (استعمل السنوات).');
    return n + 'M';
  }
  if (n > 365) throw new Error('العمر بالأيام يجب ألا يتجاوز 365 (استعمل الأشهر أو السنوات).');
  return n + 'D';
}
/** قراءة متسامحة للأعمار في البيانات القديمة (لا ترمي أخطاء). */
function parseAgeLoose_(value) {
  if (value === null || value === undefined || value === '') return '';
  const n = Number(normalizeDigits_(value));
  return isFinite(n) && n >= 0 ? Math.floor(n) : cleanString_(value);
}
function normalizeNonNegativeInteger_(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(normalizeDigits_(value));
  if (!isFinite(n) || n < 0) throw new Error('القيمة يجب أن تكون عدداً صحيحاً غير سالب.');
  return Math.floor(n);
}
function normalizePositiveNumber_(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(normalizeDigits_(value));
  if (!isFinite(n) || n <= 0) throw new Error('القيمة يجب أن تكون رقماً موجباً.');
  return n;
}
function normalizeYesNo_(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  if (isAffirmative_(value)) return 'نعم';
  if (['لا', 'no', 'false', '0', 'not ready'].indexOf(String(value).trim().toLowerCase()) !== -1) return 'لا';
  return cleanString_(value);
}
function isAffirmative_(value) {
  const v = String(value === null || value === undefined ? '' : value).trim().toLowerCase();
  return ['true', '1', 'yes', 'y', 'نعم', 'ن'].indexOf(v) !== -1;
}
function isPaidStatus_(status) {
  return ['paid', 'مدفوع', 'نعم'].indexOf(cleanString_(status).toLowerCase()) !== -1;
}
function parseAmount_(value) {
  if (typeof value === 'number') return value;
  const s = normalizeDigits_(value).replace(/[,،\s]/g, '');
  if (!s) return NaN;
  return Number(s);
}
function fmtMoney_(n) {
  return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' د.ع';
}

function serializeJsonField_(value) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'string') {
    const t = value.trim();
    if (!t) return '';
    try { JSON.parse(t); return t; } catch (e) { return t; }
  }
  return JSON.stringify(value);
}
function parseJsonSafe_(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(String(value)); } catch (e) { return fallback; }
}
function parseStoredJsonField_(value) {
  const raw = cleanString_(value);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return raw; }
}
function normalizeOperations_(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'object') return [value];
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
  } catch (e) { return []; }
}

function buildVisitFinanceNote_(patientId, visitDate, rowNumber) {
  return '[VISIT][' + patientId + '][' + visitDate + '][ROW=' + rowNumber + ']';
}
function buildRefundFinanceNote_(patientId, visitDate, rowNumber) {
  return '[REFUND][' + patientId + '][' + visitDate + '][ROW=' + rowNumber + ']';
}

/** يضمن أن كل ما يعود للواجهة JSON نظيف (لا Date ولا undefined ولا دوال) وإلا تعيد google.script.run قيمة null. */
function plain_(value) {
  return JSON.parse(JSON.stringify(value, function (k, v) { return v === undefined ? null : v; }));
}
function errMsg_(e) { return e && e.message ? e.message : String(e); }


// ---------------------------------------------------------------------------
// استيراد السجل القديم (CSV) — يُستدعى على دفعات من الواجهة
// ---------------------------------------------------------------------------

/**
 * payload = { pin, rows: [{ line, name, age, date(yyyy-MM-dd), diagnosis, phone, notes }] }
 * - يجمع زيارات نفس الشخص تحت Patient_ID واحد (الاسم + الهاتف)، ويتعرّف على من هم في الملف مسبقاً.
 * - آمن للإعادة: أي زيارة (مريض + تاريخ) موجودة تُتخطّى.
 * - لا يكتب في الملف القديم ولا ينشئ أي قيد مالي.
 */
function importLegacyRows_(payload) {
  const data = payload || {};
  requireFinancePin_(data.pin);
  const rows = Array.isArray(data.rows) ? data.rows.slice(0, 400) : [];

  return withLock_(function () {
    const sheet = getSheetAndValidate_(getSpreadsheet_(), 'Patient_Records');
    const props = PropertiesService.getScriptProperties();
    let counter = Number(props.getProperty(CONFIG.ID_COUNTER_PROPERTY) || 0);
    const byName = {};
    const seen = {};
    const last = sheet.getLastRow();

    function entryFor_(list, id) {
      let e = list.filter(function (x) { return x.id === id; })[0];
      if (!e) { e = { id: id, phones: [], last: '' }; list.push(e); }
      return e;
    }
    if (last >= 2) {
      sheet.getRange(2, 1, last - 1, 10).getValues().forEach(function (r) {
        const id = cleanString_(r[0]);
        const nk = normalizeArabic_(r[1]);
        if (!id || !nk) return;
        const e = entryFor_(byName[nk] || (byName[nk] = []), id);
        [phoneKey_(r[5]), phoneKey_(r[6])].forEach(function (p) { if (p && e.phones.indexOf(p) === -1) e.phones.push(p); });
        const d = toYmd_(r[8]);
        if (d) { seen[id + '|' + d] = 1; if (d > e.last) e.last = d; }
      });
    }

    const stamp = Utilities.formatDate(new Date(), getTz_(), 'yyyyMMdd');
    const out = [];
    const res = { imported: 0, skipped: 0, newPatients: 0, errors: [] };

    rows.forEach(function (r, i) {
      const name = limitText_(r.name, 120);
      const date = toYmd_(r.date);
      if (!name || !date) { res.errors.push('سطر ' + (r.line || i + 1) + ': ' + (name ? 'تاريخ غير مفهوم' : 'بدون اسم')); return; }

      const found = normalizeDigits_(r.phone).match(/\d{7,}/g) || [];
      const p1 = found.length ? restorePhone_(found[0]) : limitText_(normalizeDigits_(r.phone), 20);
      const p2 = found[1] ? restorePhone_(found[1]) : '';
      const keys = [phoneKey_(p1), phoneKey_(p2)].filter(Boolean);
      const nk = normalizeArabic_(name);
      const list = byName[nk] || (byName[nk] = []);

      let e = list.filter(function (x) {
        return !keys.length || !x.phones.length || keys.some(function (k) { return x.phones.indexOf(k) !== -1; });
      })[0];
      if (e && seen[e.id + '|' + date]) { res.skipped++; return; }

      let prev = '';
      if (!e) {
        counter++;
        e = { id: 'P-' + stamp + '-' + String(counter).padStart(6, '0'), phones: [], last: '' };
        list.push(e);
        res.newPatients++;
      } else { prev = e.last; }
      keys.forEach(function (k) { if (e.phones.indexOf(k) === -1) e.phones.push(k); });

      out.push(patientObjectToRow_({
        patientId: e.id, fullName: name, age: parseAgeLoose_(r.age), gender: '', address: '',
        phone: p1, secondaryPhone: p2, escortsCount: 0, visitDate: date,
        lastVisitDate: prev && prev < date ? prev : '',
        diagnosis: limitText_(r.diagnosis, 4000), prescriptions: [], testsRequested: '',
        hasReadyTests: 'لا', consultationPaid: 'مستورد', isFreeVisit: 'لا', surgeryInfoJson: '',
        notes: limitText_(r.notes, 4000), visitStatus: 'closed', extraCharges: [], statusInfo: { imported: true }
      }));
      seen[e.id + '|' + date] = 1;
      if (date > e.last) e.last = date;
      res.imported++;
    });

    if (out.length) {
      const start = sheet.getLastRow() + 1;
      const end = start + out.length - 1;
      if (end > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), end - sheet.getMaxRows());
      const numeric = NUMERIC_COLUMNS.Patient_Records;
      const width = HEADERS.Patient_Records.length;
      const range = sheet.getRange(start, 1, out.length, width);
      range.setNumberFormats(out.map(function () {
        return out[0].map(function (v, c) { return numeric.indexOf(c + 1) === -1 ? '@' : 'General'; });
      }));
      range.setValues(out.map(function (row) {
        return row.map(function (v, c) { return numeric.indexOf(c + 1) === -1 ? (v === null || v === undefined ? '' : String(v)) : v; });
      }));
      props.setProperty(CONFIG.ID_COUNTER_PROPERTY, String(counter));
    }
    return plain_(res);
  });
}


// ---------------------------------------------------------------------------
// العمليات المحجوزة (شيت Surgeries)
// ---------------------------------------------------------------------------

/**
 * شغّلها مرة واحدة من المحرر قبل تشغيل النظام الجديد:
 * تنشئ/تتحقق من كل الشيتات بما فيها Surgeries، وتنقل العمليات المسجّلة سابقاً
 * (المخزّنة داخل ملف الزيارات) إلى قائمة العمليات المحجوزة. آمنة للتكرار.
 */
function setupSheets() {
  if (fwCount_('fw_setup', 60) > 4) throw new Error('تم تشغيل الإعداد عدة مرات قبل لحظات. انتظر دقيقة.');
  return withLock_(function () {
    const ss = getSpreadsheet_();
    ['Patient_Records', 'Financials', 'Bookings', 'Surgeries', 'Drugs', 'Licenses', 'LicenseDevices'].forEach(function (name) { getSheetAndValidate_(ss, name); });

    const surgeries = getSheetAndValidate_(ss, 'Surgeries');
    const known = {};
    getDataRows_(surgeries, 'Surgeries').forEach(function (r) { known[cleanString_(r[0])] = 1; });

    const ps = getSheetAndValidate_(ss, 'Patient_Records');
    const last = ps.getLastRow();
    let added = 0;
    if (last >= 2) {
      ps.getRange(2, 1, last - 1, 17).getValues().forEach(function (row, i) {
        const raw = cleanString_(row[16]);
        if (!raw) return;
        normalizeOperations_(raw).forEach(function (op) {
          if (!op || !op.operationId || known[op.operationId]) return;
          appendSurgeryRow_(ss, op, { patientId: cleanString_(row[0]), fullName: cleanString_(row[1]), phone: restorePhone_(row[5]) }, i + 2);
          known[op.operationId] = 1;
          added++;
        });
      });
    }
    const drugs = getSheetAndValidate_(ss, 'Drugs');
    const haveDrug = {};
    getDataRows_(drugs, 'Drugs').forEach(function (r) { haveDrug[drugKey_(r[0], r[1], r[2])] = 1; });
    let seeded = 0;
    SEED_DRUGS.forEach(function (d) {
      if (haveDrug[drugKey_(d[0], d[1], d[2])]) return;
      appendRow_(drugs, 'Drugs', [d[0], d[1], d[2], d[2] ? rxUnitFor_(d[1]) : '', 0, '', nowDateTime_()]);
      seeded++;
    });
    const msg = 'الشيتات جاهزة. عمليات نُقلت: ' + added + ' · أدوية أُضيفت لقائمة الاقتراحات: ' + seeded;
    Logger.log(msg);
    return { success: true, backfilled: added, message: msg };
  });
}

function appendSurgeryRow_(ss, op, patient, sourceRow) {
  const sheet = getSheetAndValidate_(ss, 'Surgeries');
  const now = nowDateTime_();
  return appendRow_(sheet, 'Surgeries', [
    op.operationId, patient.patientId, patient.fullName, patient.phone || '',
    op.operationType, op.operationDate, op.operationTime || '', op.location || '',
    op.details || '', op.amount || 0, op.paymentStatus || '', op.status || 'Booked',
    sourceRow || '', op.createdAt || now, now
  ]);
}

function surgeryRowToObject_(row, rowNumber) {
  const date = toYmd_(row[5]);
  const status = cleanString_(row[11]) || 'Booked';
  const time = isDate_(row[6]) ? Utilities.formatDate(row[6], getTz_(), 'HH:mm') : cleanString_(row[6]);
  return {
    rowNumber: rowNumber || null,
    surgeryId: cleanString_(row[0]),
    patientId: cleanString_(row[1]),
    patientName: cleanString_(row[2]),
    phone: restorePhone_(row[3]),
    operationType: cleanString_(row[4]),
    operationDate: date,
    operationTime: time,
    location: cleanString_(row[7]),
    details: cleanString_(row[8]),
    amount: Number(row[9]) || 0,
    paymentStatus: cleanString_(row[10]),
    status: status,
    sourceRow: cleanString_(row[12]),
    overdue: status === 'Booked' && !!date && date < todayYmd_()
  };
}

function readSurgeryItems_(ss) {
  const items = [];
  getDataRows_(getSheetAndValidate_(ss, 'Surgeries'), 'Surgeries').forEach(function (row, i) {
    try {
      const s = surgeryRowToObject_(row, i + 2);
      if (s.surgeryId && s.status === 'Booked') items.push(s);
    } catch (e) { /* صف تالف لا يوقف القائمة */ }
  });
  items.sort(function (a, b) {
    return compareYmd_(a.operationDate, b.operationDate) || String(a.operationTime).localeCompare(String(b.operationTime));
  });
  return items;
}

/** قائمة العمليات المحجوزة (الأقرب أولاً؛ المتأخرة تحمل overdue=true). */
function getSurgeryList_() {
  return plain_({ success: true, today: todayYmd_(), items: readSurgeryItems_(getSpreadsheet_()) });
}

/** payload = { surgeryId, status: 'Booked'|'Done'|'Cancelled', operationDate? }  (التأجيل = Booked + تاريخ جديد) */
function updateSurgeryStatus_(payload) {
  const data = payload || {};
  const id = cleanString_(data.surgeryId);
  const status = cleanString_(data.status);
  if (!id) throw new Error('رقم العملية مطلوب.');
  if (['Booked', 'Done', 'Cancelled'].indexOf(status) === -1) throw new Error('حالة العملية غير صالحة.');
  const newDate = data.operationDate ? toYmd_(data.operationDate) : '';
  if (data.operationDate && !newDate) throw new Error('التاريخ الجديد غير صالح.');

  return withLock_(function () {
    const ss = getSpreadsheet_();
    const sheet = getSheetAndValidate_(ss, 'Surgeries');
    const found = findRowNumbers_(sheet, 1, id, true);
    if (!found.length) throw new Error('لم يتم العثور على العملية.');
    const rowNumber = found[0];
    const current = surgeryRowToObject_(sheet.getRange(rowNumber, 1, 1, 15).getValues()[0], rowNumber);

    if (newDate) writeRow_(sheet, 'Surgeries', rowNumber, 6, [newDate]);
    writeRow_(sheet, 'Surgeries', rowNumber, 12, [status]);
    writeRow_(sheet, 'Surgeries', rowNumber, 15, [nowDateTime_()]);

    // مزامنة نسخة العملية داخل سجل الزيارة (يظهر في ملف المريض)
    try {
      const ps = getSheetAndValidate_(ss, 'Patient_Records');
      const src = Number(current.sourceRow);
      if (src >= 2 && src <= ps.getLastRow() && cleanString_(ps.getRange(src, 1).getValue()) === current.patientId) {
        const ops = normalizeOperations_(ps.getRange(src, 17).getValue());
        ops.forEach(function (o) {
          if (o && o.operationId === id) { o.status = status; if (newDate) o.operationDate = newDate; }
        });
        writeRow_(ps, 'Patient_Records', src, 17, [JSON.stringify(ops)]);
      }
    } catch (e) { /* المزامنة اختيارية؛ الشيت الأساسي تم تحديثه */ }

    return plain_({ success: true, items: readSurgeryItems_(ss) });
  });
}


// ---------------------------------------------------------------------------
// مكتبة الأدوية (اقتراحات الإدخال) + إضافة علاج سريعة من السكرتير
// ---------------------------------------------------------------------------

function drugKey_(name, form, strength) {
  return [normalizeArabic_(name), cleanString_(form).toLowerCase(), cleanString_(strength)].join('|');
}

/** تُستدعى عند فتح نافذة إضافة دواء؛ مرتبة بالأكثر استعمالاً. */
function getDrugLibrary_() {
  const sheet = getSheetAndValidate_(getSpreadsheet_(), 'Drugs');
  const out = getDataRows_(sheet, 'Drugs').map(function (r) {
    return { name: cleanString_(r[0]), form: cleanString_(r[1]), strength: cleanString_(r[2]), unit: cleanString_(r[3]), uses: Number(r[4]) || 0 };
  }).filter(function (d) { return !!d.name; });
  out.sort(function (a, b) { return (b.uses - a.uses) || a.name.localeCompare(b.name); });
  return plain_(out);
}

/** يحفظ (الاسم + الشكل + التركيز) فقط، ويزيد عدّاد الاستعمال. يُستدعى والقفل ممسوك. */
function rememberDrugs_(ss, items) {
  const sheet = getSheetAndValidate_(ss, 'Drugs');
  const last = sheet.getLastRow();
  const index = {};
  if (last >= 2) {
    sheet.getRange(2, 1, last - 1, 3).getValues().forEach(function (r, i) { index[drugKey_(r[0], r[1], r[2])] = i + 2; });
  }
  const now = nowDateTime_();
  (items || []).forEach(function (x) {
    if (!x || !cleanString_(x.name)) return;
    const k = drugKey_(x.name, x.form, x.strength);
    if (index[k]) {
      const uses = Number(sheet.getRange(index[k], 5).getValue()) || 0;
      writeRow_(sheet, 'Drugs', index[k], 5, [uses + 1, now]);
    } else {
      index[k] = appendRow_(sheet, 'Drugs', [x.name, x.form || '', x.strength || '', x.unit || '', 1, now, now]);
    }
  });
}

/** إضافة علاج/علاجات إلى زيارة موجودة دون المساس ببقية حقولها (تستعملها صفحة السكرتير). */
function addPrescriptionToVisit_(payload) {
  const data = payload || {};
  const items = normalizePrescriptions_(data.items);
  if (!items.length) throw new Error('أدخل علاجاً واحداً على الأقل.');

  return withLock_(function () {
    const ss = getSpreadsheet_();
    const sheet = getSheetAndValidate_(ss, 'Patient_Records');
    const target = locatePatientVisit_(sheet, data);
    if (!target) throw new Error('تعذر العثور على زيارة المريض.');

    const current = target.record;
    const have = {};
    current.prescriptions.forEach(function (x) { have[rxKey_(x)] = 1; });
    const merged = current.prescriptions.slice();
    const fresh = [];
    items.forEach(function (x) {
      const k = rxKey_(x);
      if (!have[k]) { merged.push(x); fresh.push(x); have[k] = 1; }
    });
    writeRow_(sheet, 'Patient_Records', target.rowNumber, 12, [JSON.stringify(merged)]);
    try { rememberDrugs_(ss, fresh); } catch (e) { /* اختياري */ }

    const row = sheet.getRange(target.rowNumber, 1, 1, HEADERS.Patient_Records.length).getValues()[0];
    return plain_({ success: true, patient: patientRowToObject_(row, target.rowNumber) });
  });
}

// ===========================================================================
// Clinic Manager — live configuration, booking slots, change log, device API,
// licensing and developer admin.  (Added for the desktop / Android apps.)
// ===========================================================================

const CM_API_VERSION = 1;
const CM_TABLES = ['Patient_Records', 'Financials', 'Surgeries', 'Drugs'];
const CM_TABLE_CODE = { Patient_Records: 'P', Financials: 'F', Surgeries: 'S', Drugs: 'D', Bookings: 'B' };
const CM_CODE_TABLE = { P: 'Patient_Records', F: 'Financials', S: 'Surgeries', D: 'Drugs', B: 'Bookings' };
const CM_DATE_COLS = { Patient_Records: [8, 9], Financials: [1], Surgeries: [5], Bookings: [2] };
const CM_PHONE_COLS = { Patient_Records: [5, 6], Surgeries: [3], Bookings: [3] };
const CM_MUTATING = { addNewVisitOrPatient: 1, saveDoctorVisit: 1, addPrescriptionToVisit: 1, addSurgery: 1, updateSurgeryStatus: 1, addNewBooking: 1, updateBookingStatus: 1, recordClinicExpense: 1 };
var CM_PENDING_ = [];
var CM_LIVE_CFG_ = null;

// ---------- live configuration (script property overrides the CONFIG defaults) ----------

function liveCfg_() {
  if (CM_LIVE_CFG_) return CM_LIVE_CFG_;
  const o = parseJsonSafe_(PropertiesService.getScriptProperties().getProperty(CONFIG.CONFIG_PROPERTY), null) || {};
  const fee = Number(o.consultationFee);
  const days = Number(o.freeReviewDays);
  CM_LIVE_CFG_ = {
    clinicName: cleanString_(o.clinicName) || CONFIG.APP_TITLE,
    doctorName: cleanString_(o.doctorName) || CONFIG.DOCTOR_NAME,
    consultationFee: fee > 0 ? Math.round(fee) : CONFIG.CONSULTATION_FEE_IQD,
    freeReviewDays: o.freeReviewDays !== undefined && days >= 0 && days <= 60 ? Math.floor(days) : CONFIG.FREE_VISIT_DAYS,
    rules: ClinicCore.rulesOf(o.rules || null)
  };
  return CM_LIVE_CFG_;
}

function cmCoreRules_() {
  const c = liveCfg_();
  const r = {};
  for (const k in c.rules) r[k] = c.rules[k];
  r.freeReviewDays = c.freeReviewDays;
  r.consultationFee = c.consultationFee;
  return r;
}

function clinicNow_() {
  return { ymd: todayYmd_(), hm: Utilities.formatDate(new Date(), getTz_(), 'HH:mm') };
}

function cmConfig_() {
  const c = liveCfg_(), headers = {};
  ['Patient_Records', 'Financials', 'Bookings', 'Surgeries', 'Drugs'].forEach(function (n) { headers[n] = HEADERS[n]; });
  return plain_({
    version: CONFIG.VERSION, apiVersion: CM_API_VERSION,
    clinicName: c.clinicName, doctorName: c.doctorName,
    consultationFee: c.consultationFee, freeReviewDays: c.freeReviewDays,
    extraFees: CONFIG.EXTRA_FEES, rules: c.rules,
    tests: TEST_LABELS, rxForms: RX_FORMS, rxTimings: RX_TIMING_LABELS, headers: headers
  });
}

function cmValidHm_(s) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(s || '')); }

function cmSetConfig_(req) {
  requireFinancePin_(req.pin);
  const p = req.patch || {};
  const o = parseJsonSafe_(PropertiesService.getScriptProperties().getProperty(CONFIG.CONFIG_PROPERTY), null) || {};
  if (p.clinicName !== undefined) o.clinicName = limitText_(p.clinicName, 120);
  if (p.doctorName !== undefined) o.doctorName = limitText_(p.doctorName, 80);
  if (p.consultationFee !== undefined) {
    const f = Math.round(Number(p.consultationFee));
    if (!(f > 0 && f <= 10000000)) throw new Error('مبلغ الكشفية غير صالح.');
    o.consultationFee = f;
  }
  if (p.freeReviewDays !== undefined) {
    const d = Math.floor(Number(p.freeReviewDays));
    if (!(d >= 0 && d <= 60)) throw new Error('عدد أيام المراجعة المجانية يجب أن يكون بين 0 و 60.');
    o.freeReviewDays = d;
  }
  if (p.rules && typeof p.rules === 'object') {
    const r = o.rules || {}, x = p.rules;
    ['weekday', 'friday'].forEach(function (k) {
      if (!x[k]) return;
      if (!cmValidHm_(x[k].first) || !cmValidHm_(x[k].close) || ClinicCore.hmToMin(x[k].first) >= ClinicCore.hmToMin(x[k].close)) throw new Error('ساعات الدوام غير صالحة.');
      r[k] = { first: x[k].first, close: x[k].close };
    });
    if (x.stepMin !== undefined) { const s = Number(x.stepMin); if ([15, 20, 30, 60].indexOf(s) === -1) throw new Error('مدة الموعد غير صالحة.'); r.stepMin = s; }
    if (x.perHour !== undefined) { const s = Math.floor(Number(x.perHour)); if (!(s >= 1 && s <= 20)) throw new Error('عدد الحجوزات في الساعة غير صالح.'); r.perHour = s; }
    if (x.capacityMode !== undefined) { if (['hour', 'slot'].indexOf(x.capacityMode) === -1) throw new Error('نمط السعة غير صالح.'); r.capacityMode = x.capacityMode; }
    if (x.maxDaysAhead !== undefined) { const s = Math.floor(Number(x.maxDaysAhead)); if (!(s >= 0 && s <= 14)) throw new Error('عدد الأيام المسموح حجزها غير صالح.'); r.maxDaysAhead = s; }
    o.rules = r;
  }
  PropertiesService.getScriptProperties().setProperty(CONFIG.CONFIG_PROPERTY, JSON.stringify(o));
  CM_LIVE_CFG_ = null;
  return cmConfig_();
}

// ---------- bookings: slots, capacity, upcoming days ----------

function readAllBookings_(ss) {
  const sheet = getSheetAndValidate_(ss, 'Bookings');
  const out = [];
  getDataRows_(sheet, 'Bookings').forEach(function (row, index) {
    try {
      const b = bookingRowToObject_(row, index + 2);
      if (b.bookingId && b.callDate) out.push(b);
    } catch (e) { /* a damaged row must not stop the list */ }
  });
  out.sort(function (a, b) { return String(a.callTime).localeCompare(String(b.callTime)); });
  return out;
}

function cmSlotLabel_(hm) {
  const m = ClinicCore.hmToMin(hm), h = Math.floor(m / 60), mm = m % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return h12 + ':' + (mm < 10 ? '0' : '') + mm + ' ' + (h < 12 ? 'ص' : 'م');
}

/** Slots + availability for one date (or the first bookable date when omitted). */
function getBookingSlots_(payload) {
  const ss = getSpreadsheet_();
  ensureBookingsArchived_(ss);
  const rules = cmCoreRules_(), now = clinicNow_();
  const dates = ClinicCore.bookableDates(now, rules);
  const date = cleanString_(payload && payload.date) || dates[0];
  const bookings = readAllBookings_(ss);
  return plain_({
    date: date, dates: dates, now: now,
    slots: ClinicCore.slotAvailability(date, bookings, rules, now)
  });
}

function addNewBooking_(booking) {
  const data = booking || {};
  const name = cleanString_(data.patientName);
  if (!name) throw new Error('اسم المريض مطلوب للحجز.');
  const ph = ClinicCore.normalizePhone(data.phone);
  if (!ph.ok) throw new Error(ph.error);
  const date = cleanString_(data.date), time = cleanString_(data.time);
  if (!date || !time) throw new Error('اختر اليوم والوقت من القائمة.');

  return withLock_(function () {
    const ss = getSpreadsheet_();
    const sheet = getSheetAndValidate_(ss, 'Bookings');
    archiveOldBookings_(ss, sheet);

    const rules = cmCoreRules_();
    const chk = ClinicCore.canBook(date, time, readAllBookings_(ss), rules, clinicNow_());
    if (!chk.ok) throw new Error(chk.error);

    const row = [
      nextId_(CONFIG.BOOKING_COUNTER_PROPERTY, 'B'),
      limitText_(name, 120),
      date + ' ' + time + ':00',
      ph.value,
      cmSlotLabel_(time),
      'Pending'
    ];
    const rowNumber = appendRow_(sheet, 'Bookings', row);
    const all = readAllBookings_(ss);
    return plain_(Object.assign({ success: true, booking: bookingRowToObject_(row, rowNumber) }, splitBookings_(all)));
  });
}

/** today's list + the following days (what the secretary screen shows). */
function splitBookings_(all) {
  const today = todayYmd_(), rules = cmCoreRules_(), last = ClinicCore.addDays(today, rules.maxDaysAhead + 1);
  return {
    bookings: all.filter(function (b) { return b.callDate === today; }),
    upcoming: all.filter(function (b) { return b.callDate > today && b.callDate <= last; })
  };
}

// ---------- change log (rev counter) for delta sync ----------

function trackChange_(sheetName, rowNumber) {
  if (CM_TABLE_CODE[sheetName]) CM_PENDING_.push(CM_TABLE_CODE[sheetName] + rowNumber);
}

function flushChanges_() {
  if (!CM_PENDING_.length) return;
  const items = CM_PENDING_.splice(0, CM_PENDING_.length);
  try {
    const props = PropertiesService.getScriptProperties();
    const rev = (Number(props.getProperty(CONFIG.REV_PROPERTY)) || 0) + 1;
    const uniq = {};
    items.forEach(function (i) { uniq[i] = 1; });
    const keys = Object.keys(uniq);
    let entry = rev + '>' + (keys.length > 250 ? '*' : keys.join(','));
    if (entry.length > 3000) entry = rev + '>*';
    let log = String(props.getProperty(CONFIG.CHANGES_PROPERTY) || '');
    log = log ? log + ';' + entry : entry;
    while (log.length > 7500) { const k = log.indexOf(';'); if (k === -1) break; log = log.slice(k + 1); }
    const upd = {};
    upd[CONFIG.REV_PROPERTY] = String(rev);
    upd[CONFIG.CHANGES_PROPERTY] = log;
    props.setProperties(upd);
  } catch (e) { /* the change log must never break a write */ }
}

function cmRev_() { return Number(PropertiesService.getScriptProperties().getProperty(CONFIG.REV_PROPERTY)) || 0; }

function wireRow_(table, rowNumber, values) {
  const width = HEADERS[table].length, out = [rowNumber];
  const dc = CM_DATE_COLS[table] || [], pc = CM_PHONE_COLS[table] || [];
  for (let i = 0; i < width; i++) {
    let v = i < values.length ? values[i] : '';
    if (v === null || v === undefined) v = '';
    if (dc.indexOf(i) !== -1) v = table === 'Bookings' ? toDateTimeString_(v) : toYmd_(v);
    else if (pc.indexOf(i) !== -1) v = restorePhone_(v);
    else if (v instanceof Date) v = toDateTimeString_(v);
    out.push(v);
  }
  return out;
}

function cmReadRows_(sheet, table, from, count) {
  const width = HEADERS[table].length, out = [];
  if (count <= 0) return out;
  const values = sheet.getRange(from, 1, count, width).getValues();
  values.forEach(function (row, i) {
    if (cleanString_(row[0]) === '') return;
    try { out.push(wireRow_(table, from + i, row)); } catch (e) { /* skip damaged row */ }
  });
  return out;
}

function cmSnapshot_(req) {
  const table = cleanString_(req.table);
  if (table !== 'Bookings' && CM_TABLES.indexOf(table) === -1) throw new Error('جدول غير معروف.');
  const ss = getSpreadsheet_();
  if (table === 'Bookings') ensureBookingsArchived_(ss);
  const rev = cmRev_();
  const sheet = getSheetAndValidate_(ss, table);
  const lastRow = sheet.getLastRow();
  if (table === 'Bookings') {
    return { rev: rev, table: table, rows: cmReadRows_(sheet, table, 2, lastRow - 1), next: null };
  }
  const from = Math.max(2, Math.floor(Number(req.from) || 2));
  const limit = Math.min(2000, Math.max(1, Math.floor(Number(req.limit) || 1000)));
  const count = Math.max(0, Math.min(limit, lastRow - from + 1));
  const next = from + count <= lastRow ? from + count : null;
  return { rev: rev, table: table, rows: cmReadRows_(sheet, table, from, count), next: next };
}

function cmDelta_(req) {
  const since = Math.floor(Number(req.since)) || 0;
  const props = PropertiesService.getScriptProperties();
  const rev = cmRev_();
  const events = getTodayEvents_();
  if (since >= rev) return { rev: rev, resync: false, tables: {}, events: events };
  const entries = String(props.getProperty(CONFIG.CHANGES_PROPERTY) || '').split(';').filter(Boolean).map(function (s) {
    const k = s.indexOf('>');
    return { rev: Number(s.slice(0, k)), items: s.slice(k + 1) };
  });
  const need = entries.filter(function (e) { return e.rev > since; });
  if (!entries.length || entries[0].rev > since + 1 || !need.length) return { rev: rev, resync: true };
  const rows = { Patient_Records: {}, Financials: {}, Surgeries: {}, Drugs: {} };
  let bookingsChanged = false, total = 0;
  for (let i = 0; i < need.length; i++) {
    if (need[i].items === '*') return { rev: rev, resync: true };
    const parts = need[i].items.split(',');
    for (let j = 0; j < parts.length; j++) {
      const code = parts[j].charAt(0), n = Number(parts[j].slice(1));
      if (code === 'B') bookingsChanged = true;
      else if (CM_CODE_TABLE[code] && n >= 2) { rows[CM_CODE_TABLE[code]][n] = 1; total++; }
    }
  }
  if (total > 200) return { rev: rev, resync: true };
  const ss = getSpreadsheet_();
  const tables = {};
  CM_TABLES.forEach(function (t) {
    const nums = Object.keys(rows[t]).map(Number).sort(function (a, b) { return a - b; });
    if (!nums.length) return;
    const sheet = getSheetAndValidate_(ss, t);
    tables[t] = [];
    nums.forEach(function (n) { tables[t] = tables[t].concat(cmReadRows_(sheet, t, n, 1)); });
  });
  const out = { rev: rev, resync: false, tables: tables, events: events };
  if (bookingsChanged) {
    ensureBookingsArchived_(ss);
    const sheet = getSheetAndValidate_(ss, 'Bookings');
    out.bookings = cmReadRows_(sheet, 'Bookings', 2, sheet.getLastRow() - 1);
  }
  return out;
}

// ---------- devices, pairing, auth ----------

function cmSha256_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8)
    .map(function (b) { return ((b < 0 ? b + 256 : b).toString(16)).padStart(2, '0'); }).join('');
}

function cmFail_(code, message) {
  const e = new Error(message);
  e.cmCode = code;
  return e;
}

function cmDevices_() {
  return parseJsonSafe_(PropertiesService.getScriptProperties().getProperty(CONFIG.DEVICES_PROPERTY), null) || {};
}
function cmSaveDevices_(map) {
  PropertiesService.getScriptProperties().setProperty(CONFIG.DEVICES_PROPERTY, JSON.stringify(map));
}

function cmAuth_(token) {
  const t = cleanString_(token);
  if (t.length < 32) { fwLog_('bad-token', 'short'); throw cmFail_('AUTH', 'الجهاز غير مرتبط بالعيادة. اربطه من جديد.'); }
  const h = cmSha256_(t), map = cmDevices_();
  for (const id in map) {
    if (map[id].h === h) {
      if (map[id].revoked) throw cmFail_('AUTH', 'تم إلغاء ربط هذا الجهاز. اربطه من جديد.');
      try {
        const cache = CacheService.getScriptCache();
        if (!cache.get('cm_seen_' + id)) {
          cache.put('cm_seen_' + id, '1', 600);
          map[id].seen = nowDateTime_();
          cmSaveDevices_(map);
        }
      } catch (e) { /* last-seen is best effort */ }
      return { id: id, device: map[id] };
    }
  }
  fwLog_('bad-token', 'api');
  throw cmFail_('AUTH', 'الجهاز غير مرتبط بالعيادة. اربطه من جديد.');
}

function cmNewPairCode_(by) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const hex = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  let code = '';
  for (let i = 0; i < 8; i++) code += alphabet.charAt(parseInt(hex.substr(i * 2, 2), 16) % alphabet.length);
  CacheService.getScriptCache().put('cm_pair_' + code, JSON.stringify({ by: by, at: nowDateTime_() }), 600);
  return { code: code.slice(0, 4) + '-' + code.slice(4), expiresAt: Utilities.formatDate(new Date(Date.now() + 600000), getTz_(), 'yyyy-MM-dd HH:mm:ss') };
}

function cmPair_(req) {
  const code = cleanString_(req.code).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const cache = CacheService.getScriptCache();
  if ((Number(cache.get('fw_pair_fails')) || 0) >= FW_.PAIR_MAX_FAILS) throw cmFail_('RATE', 'محاولات ربط كثيرة خاطئة. انتظر عشر دقائق ثم أنشئ رمزاً جديداً.');
  const hit = code ? cache.get('cm_pair_' + code) : null;
  if (!hit) { fwCount_('fw_pair_fails', FW_.PAIR_LOCK_S); fwLog_('bad-pair', 'code'); }
  if (!hit) throw cmFail_('AUTH', 'رمز الربط غير صحيح أو انتهت صلاحيته (10 دقائق). أنشئ رمزاً جديداً.');
  cache.remove('cm_pair_' + code); cache.remove('fw_pair_fails');
  const platform = req.platform === 'android' ? 'android' : 'desktop';
  return withLock_(function () {
    const map = cmDevices_();
    if (Object.keys(map).length >= 20) throw new Error('وصلت إلى الحد الأقصى من الأجهزة المرتبطة (20). ألغِ ربط جهاز قديم أولاً.');
    const token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
    const id = 'D' + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
    map[id] = { h: cmSha256_(token), name: limitText_(req.deviceName, 60) || platform, platform: platform, created: nowDateTime_(), seen: nowDateTime_() };
    cmSaveDevices_(map);
    return { token: token, deviceId: id, config: cmConfig_() };
  });
}

// ---------- whitelisted function calls ----------

function cmFunctions_() {
  return {
    getTodayQueueSnapshot: getTodayQueueSnapshot_, addNewVisitOrPatient: addNewVisitOrPatient_, saveDoctorVisit: saveDoctorVisit_,
    addPrescriptionToVisit: addPrescriptionToVisit_, addSurgery: addSurgery_, updateSurgeryStatus: updateSurgeryStatus_,
    getSurgeryList: getSurgeryList_, addNewBooking: addNewBooking_, updateBookingStatus: updateBookingStatus_,
    getBookingSlots: getBookingSlots_, recordClinicExpense: recordClinicExpense_, getClinicDashboardStats: getClinicDashboardStats_,
    searchPatientByNameOrPhone: searchPatientByNameOrPhone_, getPatientFullProfile: getPatientFullProfile_,
    getDoctorPatientContext: getDoctorPatientContext_, getDrugLibrary: getDrugLibrary_, heartbeatPresence: heartbeatPresence_
  };
}

function cmCall_(req) {
  const fn = cleanString_(req.fn), table = cmFunctions_();
  if (!Object.prototype.hasOwnProperty.call(table, fn)) throw new Error('عملية غير مسموحة: ' + fn);
  const args = Array.isArray(req.args) ? req.args : [];
  const cid = cleanString_(req.cid).slice(0, 80);
  const cache = CacheService.getScriptCache();
  if (CM_MUTATING[fn] && cid && cache.get('cm_cid_' + cid)) return { success: true, replayed: true };
  const result = table[fn].apply(null, args);
  if (CM_MUTATING[fn] && cid) { try { cache.put('cm_cid_' + cid, '1', 21600); } catch (e) { /* ignore */ } }
  return result;
}

// ===========================================================================
// Firewall — ONE public door for the website, plus guards for the JSON API.
// Apps Script lets any visitor call every top-level function whose name does not end in "_".
// So the only public functions are doGet, doPost, setupSheets and siteCall; everything else is private
// and reachable only through the allow-list below. No client IPs exist in Apps Script, so limits are global/per-device.
// ===========================================================================

const FW_ = {
  SITE_PER_MIN: 400,        // website calls per minute (all visitors together)
  DEVICE_PER_MIN: 300,      // JSON API calls per minute per paired device
  MAX_BODY: 400000,         // bytes of a doPost body
  MAX_ARGS: 400000,         // characters of the arguments of one website call
  MAX_IMPORT: 1500000,      // legacy CSV import batches are bigger
  PAIR_MAX_FAILS: 8, PAIR_LOCK_S: 600,
  CODE_MAX_FAILS: 8, CODE_LOCK_S: 600,   // optional site access code
  LIC_FAILS: 12, LIC_LOCK_S: 600,        // wrong activation keys
  LIC_NEW_PER_HOUR: 40,                  // new device rows the license endpoint may create per hour
  LOG_MAX: 60
};

/** The allow-list of what the website may call (name -> private implementation). */
function siteApi_() {
  return {
    systemInitialCheck: systemInitialCheck_, getTodayQueueSnapshot: getTodayQueueSnapshot_, getTodayPatients: getTodayPatients_,
    getPatientFullProfile: getPatientFullProfile_, getDoctorPatientContext: getDoctorPatientContext_, searchPatientByNameOrPhone: searchPatientByNameOrPhone_,
    addNewVisitOrPatient: addNewVisitOrPatient_, saveDoctorVisit: saveDoctorVisit_, updatePatientByDoctor: updatePatientByDoctor_,
    addSurgery: addSurgery_, getTodayBookings: getTodayBookings_, updateBookingStatus: updateBookingStatus_,
    recordFinancialTransaction: recordFinancialTransaction_, recordClinicExpense: recordClinicExpense_, getClinicDashboardStats: getClinicDashboardStats_,
    heartbeatPresence: heartbeatPresence_, getChangeRev: getChangeRev_, setPresenceOffline: setPresenceOffline_, getClinicPresence: getClinicPresence_,
    setSystemStatus: setSystemStatus_, importLegacyRows: importLegacyRows_, getSurgeryList: getSurgeryList_, updateSurgeryStatus: updateSurgeryStatus_,
    getDrugLibrary: getDrugLibrary_, addPrescriptionToVisit: addPrescriptionToVisit_, getBookingSlots: getBookingSlots_, addNewBooking: addNewBooking_,
    adminOverview: adminOverview_, adminCreateLicense: adminCreateLicense_, adminUpdateLicense: adminUpdateLicense_, adminBlockDevice: adminBlockDevice_,
    adminCreatePairingCode: adminCreatePairingCode_, adminRevokePairedDevice: adminRevokePairedDevice_
  };
}

/** counter in the script cache: returns the new value (approximate under races, which is fine for limits) */
function fwCount_(key, ttl) {
  const cache = CacheService.getScriptCache(), n = (Number(cache.get(key)) || 0) + 1;
  try { cache.put(key, String(n), ttl); } catch (e) { /* ignore */ }
  return n;
}

/** Security log: last events in a script property. Never put tokens, PINs, codes or patient data in `detail`. */
function fwLog_(kind, detail) {
  try {
    if (fwCount_('fw_lograte_' + Math.floor(Date.now() / 60000), 120) > 20) return; // a flood must not flood the log
    const props = PropertiesService.getScriptProperties();
    const list = parseJsonSafe_(props.getProperty('SEC_LOG'), null) || [];
    list.push([nowDateTime_(), String(kind).slice(0, 30), String(detail || '').replace(/[^\w:.\- ؀-ۿ]/g, '').slice(0, 60)]);
    props.setProperty('SEC_LOG', JSON.stringify(list.slice(-FW_.LOG_MAX)));
  } catch (e) { /* logging must never break a request */ }
}

function fwRate_(bucket, limit, label) {
  const n = fwCount_('fw_rl_' + bucket + '_' + Math.floor(Date.now() / 60000), 120);
  if (n > limit) {
    if (n === limit + 1) fwLog_('rate', label);
    throw cmFail_('RATE', 'تم تجاوز حد الطلبات مؤقتاً. انتظر دقيقة ثم أعد المحاولة.');
  }
}

/** Optional site access code (script property SITE_ACCESS_CODE). Empty = open site, exactly as before. */
function fwSiteGate_(code, fn) {
  const real = PropertiesService.getScriptProperties().getProperty('SITE_ACCESS_CODE');
  if (!real) return;
  const cache = CacheService.getScriptCache();
  if ((Number(cache.get('fw_code_fails')) || 0) >= FW_.CODE_MAX_FAILS) throw new Error('SITE_TEMP_LOCK');
  const given = cleanString_(code);
  if (!given) throw new Error('SITE_LOCKED');
  if (given !== real) {
    fwCount_('fw_code_fails', FW_.CODE_LOCK_S);
    fwLog_('site-code', fn);
    throw new Error('SITE_BADCODE');
  }
}

/** The single public door of the website: allow-list -> optional access code -> rate limit -> size cap -> call. */
function siteCall(name, args, code) {
  const key = cleanString_(name), table = siteApi_();
  if (!Object.prototype.hasOwnProperty.call(table, key)) { fwLog_('unknown-fn', key.slice(0, 40)); throw new Error('عملية غير مسموحة.'); }
  fwSiteGate_(code, key);
  fwRate_('site', FW_.SITE_PER_MIN, 'site');
  const list = Array.isArray(args) ? args : [];
  if (list.length > 6) throw new Error('طلب غير صالح.');
  let size = 0;
  try { size = JSON.stringify(list).length; } catch (e) { throw new Error('طلب غير صالح.'); }
  if (size > (key === 'importLegacyRows' ? FW_.MAX_IMPORT : FW_.MAX_ARGS)) { fwLog_('too-big', key); throw new Error('حجم الطلب كبير جداً.'); }
  return table[key].apply(null, list);
}

// ---------- doPost router ----------

function doPost(e) {
  let req = {}, res;
  const raw = (e && e.postData && e.postData.contents) || '{}';
  if (raw.length > FW_.MAX_BODY) { fwLog_('too-big', 'doPost'); return cmOut_({ ok: false, error: 'حجم الطلب كبير جداً.', code: 'BAD_REQUEST' }); }
  try { req = JSON.parse(raw) || {}; if (typeof req !== 'object' || Array.isArray(req)) req = {}; }
  catch (err) { return cmOut_({ ok: false, error: 'طلب غير صالح.', code: 'BAD_REQUEST' }); }
  try { res = { ok: true, data: cmRoute_(req) }; }
  catch (err) {
    const msg = errMsg_(err);
    res = { ok: false, error: msg, code: err && err.cmCode ? err.cmCode : (msg.indexOf('مشغول') !== -1 ? 'BUSY' : 'BAD_REQUEST') };
  }
  try { flushChanges_(); } catch (x) { /* ignore */ }
  return cmOut_(res);
}

function cmOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function cmRoute_(req) {
  const action = cleanString_(req.action);
  switch (action) {
    case 'ping': return { version: CONFIG.VERSION, clinicName: liveCfg_().clinicName, apiVersion: CM_API_VERSION, ymd: todayYmd_(), hm: clinicNow_().hm };
    case 'pair': return cmPair_(req);
    case 'licenseCheck': return licenseCheck_(req);
    case 'licenseActivate': return licenseActivate_(req);
  }
  const auth = cmAuth_(req.token);
  fwRate_('dev_' + auth.id, FW_.DEVICE_PER_MIN, 'device');
  switch (action) {
    case 'config': return cmConfig_();
    case 'setConfig': return cmSetConfig_(req);
    case 'rev': return { rev: cmRev_() };
    case 'snapshot': return cmSnapshot_(req);
    case 'delta': return cmDelta_(req);
    case 'call': return cmCall_(req);
    case 'pairingCode': {
      const c = cmNewPairCode_(auth.id);
      c.url = cleanString_(req.url);
      return c;
    }
  }
  fwLog_('unknown-action', action.slice(0, 30));
  throw new Error('عملية غير معروفة.');
}

// ===========================================================================
// Licensing (30-day trial, then activation key) — see docs/LICENSING.md
// ===========================================================================

function cmKeyNorm_(s) { return cleanString_(s).toUpperCase().replace(/[^A-Z0-9]/g, ''); }

function cmLicenseMessage_(status, days) {
  if (status === 'trial') return 'نسخة تجريبية — بقي ' + days + ' يوماً.';
  if (status === 'active') return 'النسخة مفعّلة.';
  if (status === 'revoked') return 'تم إيقاف هذا التفعيل. تواصل مع المطوّر.';
  return 'انتهت الفترة التجريبية. تواصل مع المطوّر للحصول على مفتاح تفعيل.';
}

function cmFindDevice_(sheet, deviceId) {
  const rows = getDataRows_(sheet, 'LicenseDevices');
  for (let i = 0; i < rows.length; i++) if (cleanString_(rows[i][0]) === deviceId) return { row: i + 2, v: rows[i] };
  return null;
}

function cmFindKey_(sheet, key) {
  const n = cmKeyNorm_(key);
  if (!n) return null;
  const rows = getDataRows_(sheet, 'Licenses');
  for (let i = 0; i < rows.length; i++) if (cmKeyNorm_(rows[i][0]) === n) return { row: i + 2, v: rows[i] };
  return null;
}

function cmLicenseState_(dev, keyRow) {
  const today = todayYmd_();
  if (cleanString_(dev[8]) === 'blocked') return { status: 'revoked', type: 'blocked', daysLeft: 0, expiresAt: '' };
  if (cleanString_(dev[1])) {
    if (!keyRow || cleanString_(keyRow.v[5]) === 'revoked') return { status: 'revoked', type: 'full', daysLeft: 0, expiresAt: '' };
    const exp = toYmd_(keyRow.v[4]);
    if (exp && today > exp) return { status: 'expired', type: 'full', daysLeft: 0, expiresAt: exp };
    return { status: 'active', type: cleanString_(keyRow.v[2]) || 'full', daysLeft: exp ? daysBetweenYmd_(today, exp) : null, expiresAt: exp };
  }
  const first = toYmd_(dev[4]) || today;
  const left = CONFIG.TRIAL_DAYS - daysBetweenYmd_(first, today);
  if (left > 0) return { status: 'trial', type: 'trial', daysLeft: left, expiresAt: ClinicCore.addDays(first, CONFIG.TRIAL_DAYS) };
  return { status: 'expired', type: 'trial', daysLeft: 0, expiresAt: ClinicCore.addDays(first, CONFIG.TRIAL_DAYS) };
}

function cmLicenseReply_(st) {
  return { status: st.status, type: st.type, daysLeft: st.daysLeft, expiresAt: st.expiresAt, message: cmLicenseMessage_(st.status, st.daysLeft) };
}

function cmCheckDeviceId_(id) {
  const d = cleanString_(id);
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(d)) throw new Error('معرّف الجهاز غير صالح.');
  return d;
}

function licenseCheck_(req) {
  const deviceId = cmCheckDeviceId_(req.deviceId);
  if (cleanString_(req.key)) return licenseActivate_(req);
  return withLock_(function () {
    const ss = getSpreadsheet_();
    const dsheet = getSheetAndValidate_(ss, 'LicenseDevices');
    const ksheet = getSheetAndValidate_(ss, 'Licenses');
    const now = nowDateTime_();
    let found = cmFindDevice_(dsheet, deviceId);
    if (!found) {
      if (fwCount_('fw_licnew_' + Math.floor(Date.now() / 3600000), 7200) > FW_.LIC_NEW_PER_HOUR) { fwLog_('rate', 'license-new'); throw cmFail_('RATE', 'الخادم مشغول مؤقتاً. حاول لاحقاً.'); }
      const row = [deviceId, '', limitText_(req.platform, 20), limitText_(req.label, 60), now, now, limitText_(req.appVersion, 20), 1, 'trial'];
      const n = appendRow_(dsheet, 'LicenseDevices', row);
      found = { row: n, v: row };
    } else {
      writeRow_(dsheet, 'LicenseDevices', found.row, 6, [now, limitText_(req.appVersion, 20), (Number(found.v[7]) || 0) + 1]);
      found.v[5] = now;
    }
    const keyRow = cleanString_(found.v[1]) ? cmFindKey_(ksheet, found.v[1]) : null;
    return cmLicenseReply_(cmLicenseState_(found.v, keyRow));
  });
}

function licenseActivate_(req) {
  const deviceId = cmCheckDeviceId_(req.deviceId);
  const keyN = cmKeyNorm_(req.key);
  if (!keyN) throw new Error('أدخل مفتاح التفعيل.');
  return withLock_(function () {
    const ss = getSpreadsheet_();
    const dsheet = getSheetAndValidate_(ss, 'LicenseDevices');
    const ksheet = getSheetAndValidate_(ss, 'Licenses');
    if ((Number(CacheService.getScriptCache().get('fw_lic_fails')) || 0) >= FW_.LIC_FAILS) throw cmFail_('RATE', 'محاولات تفعيل خاطئة كثيرة. انتظر عشر دقائق.');
    const keyRow = cmFindKey_(ksheet, keyN);
    if (!keyRow) { fwCount_('fw_lic_fails', FW_.LIC_LOCK_S); fwLog_('bad-key', 'license'); throw cmFail_('LICENSE', 'مفتاح التفعيل غير صحيح.'); }
    if (cleanString_(keyRow.v[5]) === 'revoked') throw cmFail_('LICENSE', 'هذا المفتاح ملغى.');
    const exp = toYmd_(keyRow.v[4]);
    if (exp && todayYmd_() > exp) throw cmFail_('LICENSE', 'انتهت صلاحية هذا المفتاح.');
    const rows = getDataRows_(dsheet, 'LicenseDevices');
    const max = Math.max(1, Number(keyRow.v[3]) || 1);
    let used = 0, mine = null;
    rows.forEach(function (r, i) {
      if (cleanString_(r[0]) === deviceId) mine = { row: i + 2, v: r };
      else if (cmKeyNorm_(r[1]) === keyN && cleanString_(r[8]) !== 'blocked') used++;
    });
    if (used >= max) throw cmFail_('LICENSE', 'وصل هذا المفتاح إلى الحد الأقصى من الأجهزة (' + max + ').');
    const now = nowDateTime_();
    if (!mine) {
      const row = [deviceId, cleanString_(keyRow.v[0]), limitText_(req.platform, 20), limitText_(req.label, 60), now, now, limitText_(req.appVersion, 20), 1, 'active'];
      mine = { row: appendRow_(dsheet, 'LicenseDevices', row), v: row };
    } else {
      writeRow_(dsheet, 'LicenseDevices', mine.row, 2, [cleanString_(keyRow.v[0])]);
      writeRow_(dsheet, 'LicenseDevices', mine.row, 6, [now, limitText_(req.appVersion, 20), (Number(mine.v[7]) || 0) + 1, 'active']);
      mine.v[1] = cleanString_(keyRow.v[0]);
      mine.v[8] = 'active';
    }
    return cmLicenseReply_(cmLicenseState_(mine.v, keyRow));
  });
}

// ---------- developer admin (google.script.run from the website) ----------

function adminCheck_(pin) {
  const real = PropertiesService.getScriptProperties().getProperty('ADMIN_PIN');
  if (!real) throw new Error('لم يُضبط رمز المطوّر بعد. أضف الخاصية ADMIN_PIN من Project Settings ← Script properties.');
  const cache = CacheService.getScriptCache();
  const fails = Number(cache.get('cm_admin_fails') || 0);
  if (fails >= CONFIG.PIN_MAX_FAILS) throw new Error('تم قفل لوحة المطوّر مؤقتاً بسبب محاولات خاطئة. انتظر بضع دقائق.');
  if (cleanString_(pin) !== real) {
    cache.put('cm_admin_fails', String(fails + 1), CONFIG.PIN_LOCK_SECONDS);
    throw new Error('رمز المطوّر غير صحيح.');
  }
  cache.remove('cm_admin_fails');
}

function adminOverview_(pin) {
  adminCheck_(pin);
  const ss = getSpreadsheet_();
  const keys = getDataRows_(getSheetAndValidate_(ss, 'Licenses'), 'Licenses');
  const devs = getDataRows_(getSheetAndValidate_(ss, 'LicenseDevices'), 'LicenseDevices');
  const count = {}, last = {};
  devs.forEach(function (d) {
    const k = cmKeyNorm_(d[1]);
    if (!k) return;
    count[k] = (count[k] || 0) + 1;
    const seen = cleanString_(d[5]);
    if (!last[k] || seen > last[k]) last[k] = seen;
  });
  const paired = cmDevices_(), props = PropertiesService.getScriptProperties();
  return plain_({
    success: true, trialDays: CONFIG.TRIAL_DAYS,
    security: {
      siteGateOn: !!props.getProperty('SITE_ACCESS_CODE'),
      defaultFinancePin: !props.getProperty('FINANCE_PIN'),
      log: (parseJsonSafe_(props.getProperty('SEC_LOG'), null) || []).slice(-30).reverse()
    },
    licenses: keys.filter(function (r) { return cleanString_(r[0]); }).map(function (r) {
      const k = cmKeyNorm_(r[0]);
      return { key: cleanString_(r[0]), label: cleanString_(r[1]), type: cleanString_(r[2]), maxDevices: Number(r[3]) || 1, expiresAt: toYmd_(r[4]), status: cleanString_(r[5]) || 'active', usage: cleanString_(r[6]), createdAt: cleanString_(r[7]), notes: cleanString_(r[8]), devices: count[k] || 0, lastSeen: last[k] || '' };
    }),
    devices: devs.filter(function (r) { return cleanString_(r[0]); }).slice(-300).reverse().map(function (r) {
      const first = toYmd_(r[4]);
      return { deviceId: cleanString_(r[0]), key: cleanString_(r[1]), platform: cleanString_(r[2]), label: cleanString_(r[3]), firstSeen: cleanString_(r[4]), lastSeen: cleanString_(r[5]), appVersion: cleanString_(r[6]), checks: Number(r[7]) || 0, status: cleanString_(r[8]), trialDaysLeft: cleanString_(r[1]) ? null : Math.max(0, CONFIG.TRIAL_DAYS - daysBetweenYmd_(first || todayYmd_(), todayYmd_())) };
    }),
    paired: Object.keys(paired).map(function (id) { return { id: id, name: paired[id].name, platform: paired[id].platform, created: paired[id].created, seen: paired[id].seen, revoked: !!paired[id].revoked }; })
  });
}

function adminCreateLicense_(pin, data) {
  adminCheck_(pin);
  const d = data || {};
  return withLock_(function () {
    const sheet = getSheetAndValidate_(getSpreadsheet_(), 'Licenses');
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const hex = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
    let raw = '';
    for (let i = 0; i < 12; i++) raw += alphabet.charAt(parseInt(hex.substr(i * 2, 2), 16) % alphabet.length);
    const key = 'CM-' + raw.slice(0, 4) + '-' + raw.slice(4, 8) + '-' + raw.slice(8, 12);
    const exp = cleanString_(d.expiresAt);
    if (exp && !/^\d{4}-\d{2}-\d{2}$/.test(exp)) throw new Error('تاريخ الانتهاء يجب أن يكون بصيغة YYYY-MM-DD.');
    const usage = ['غير مصنّف', 'غير تجاري', 'تجاري'].indexOf(cleanString_(d.usage)) !== -1 ? cleanString_(d.usage) : 'غير مصنّف';
    appendRow_(sheet, 'Licenses', [key, limitText_(d.label, 80), 'full', Math.max(1, Math.min(50, Math.floor(Number(d.maxDevices) || 1))), exp, 'active', usage, nowDateTime_(), limitText_(d.notes, 300)]);
    return plain_({ success: true, key: key });
  });
}

function adminUpdateLicense_(pin, data) {
  adminCheck_(pin);
  const d = data || {};
  return withLock_(function () {
    const sheet = getSheetAndValidate_(getSpreadsheet_(), 'Licenses');
    const f = cmFindKey_(sheet, d.key);
    if (!f) throw new Error('المفتاح غير موجود.');
    const v = f.v.slice();
    if (d.status !== undefined) { if (['active', 'revoked'].indexOf(d.status) === -1) throw new Error('حالة غير صالحة.'); v[5] = d.status; }
    if (d.usage !== undefined) { if (['غير مصنّف', 'غير تجاري', 'تجاري'].indexOf(d.usage) === -1) throw new Error('تصنيف غير صالح.'); v[6] = d.usage; }
    if (d.maxDevices !== undefined) v[3] = Math.max(1, Math.min(50, Math.floor(Number(d.maxDevices) || 1)));
    if (d.expiresAt !== undefined) { const e = cleanString_(d.expiresAt); if (e && !/^\d{4}-\d{2}-\d{2}$/.test(e)) throw new Error('تاريخ غير صالح.'); v[4] = e; }
    if (d.notes !== undefined) v[8] = limitText_(d.notes, 300);
    if (d.label !== undefined) v[1] = limitText_(d.label, 80);
    writeRow_(sheet, 'Licenses', f.row, 1, v);
    return plain_({ success: true });
  });
}

function adminBlockDevice_(pin, deviceId, blocked) {
  adminCheck_(pin);
  return withLock_(function () {
    const sheet = getSheetAndValidate_(getSpreadsheet_(), 'LicenseDevices');
    const f = cmFindDevice_(sheet, cleanString_(deviceId));
    if (!f) throw new Error('الجهاز غير موجود.');
    writeRow_(sheet, 'LicenseDevices', f.row, 9, [blocked ? 'blocked' : (cleanString_(f.v[1]) ? 'active' : 'trial')]);
    return plain_({ success: true });
  });
}

function adminCreatePairingCode_(pin) {
  adminCheck_(pin);
  return plain_(Object.assign({ success: true, url: ScriptApp.getService().getUrl() }, cmNewPairCode_('admin')));
}

function adminRevokePairedDevice_(pin, id) {
  adminCheck_(pin);
  return withLock_(function () {
    const map = cmDevices_();
    if (!map[id]) throw new Error('الجهاز غير موجود.');
    delete map[id];
    cmSaveDevices_(map);
    return plain_({ success: true });
  });
}
