'use strict';
/** All READ methods of docs/BRIDGE.md. Always local (SQLite), synchronous, work offline. */
const C = require('./core');
const M = require('./mappers');
const I = require('./income');

const DAY_ORDER = 'CASE WHEN r > 0 THEN 0 ELSE 1 END, ABS(r)';
const VALID_VISIT = "TRIM(Patient_ID) != '' AND TRIM(Full_Name) != ''";
/** Sort key so that provisional (negative r) rows count as the newest. */
const rankR = function (r) { return r < 0 ? 1e12 + Math.abs(r) : r; };
const cmpNewest = function (a, b) { return (a.visitDate < b.visitDate ? 1 : a.visitDate > b.visitDate ? -1 : 0) || (rankR(b.rowNumber) - rankR(a.rowNumber)); };
const esc = function (s) { return s.replace(/[\\%_]/g, function (c) { return '\\' + c; }); };

function createStore(ctx) {
  const db = ctx.db, tables = ctx.tables, cc = ctx.clinicConfig;
  const nowMs = function () { const n = ctx.now ? ctx.now() : Date.now(); return n instanceof Date ? n.getTime() : n; };
  const store = {
    /** Clinic "now" {ymd,hm}. NOTE: the server stamps new visits with the calendar day (todayYmd_), so does this. */
    clinicNow: function () { return C.partsInTz(new Date(nowMs())); },
    today: function () { return store.clinicNow().ymd; },
    isHidden: function (ymd) { return ctx.settings.get().hiddenDays.indexOf(ymd) !== -1; },

    _visits: function (where, params, order) {
      const codec = cc.codec(), out = [];
      tables.select('Patient_Records', where, params, order).forEach(function (row) { try { out.push(codec.visit(row.cells, row.r)); } catch (e) { /* skip corrupt row */ } });
      return out;
    },
    _bookings: function (where, params) {
      const codec = cc.codec(), out = [];
      tables.select('Bookings', where, params, DAY_ORDER).forEach(function (row) { try { out.push(codec.booking(row.cells, row.r)); } catch (e) { /* skip */ } });
      return out;
    },
    visitByRow: function (r) {
      const row = tables.get('Patient_Records', Number(r));
      return row ? cc.codec().visit(row.cells, row.r) : null;
    },
    visitsOfPatient: function (patientId) {
      return store._visits('TRIM(Patient_ID) = ?', [M.cleanString(patientId)]).sort(cmpNewest);
    },
    allBookings: function () { return store._bookings(''); },

    getDay: function (ymd, opts) {
      const hidden = store.isHidden(ymd);
      if (hidden && !(opts && opts.includeHidden)) return { ymd: ymd, hidden: true, visits: [], bookings: [] };
      const bookings = store._bookings("x_call_date = ? AND TRIM(Booking_ID) != ''", [ymd]);
      bookings.sort(function (a, b) { return String(a.callTime).localeCompare(String(b.callTime)); });
      return { ymd: ymd, hidden: hidden, visits: store._visits('x_visit_date = ? AND ' + VALID_VISIT, [ymd], DAY_ORDER), bookings: bookings };
    },

    monthSummary: function (ym) {
      if (!/^\d{4}-\d{2}$/.test(String(ym))) return {};
      const like = ym + '-%', out = {}, hiddenDays = ctx.settings.get().hiddenDays;
      const day = function (d) { return out[d] || (out[d] = { visits: 0, bookings: 0, income: 0, _fin: 0 }); };
      db.all('SELECT x_visit_date AS d, COUNT(*) AS n FROM patient_records WHERE x_visit_date LIKE ? AND ' + VALID_VISIT + ' GROUP BY x_visit_date', like)
        .forEach(function (r) { day(r.d).visits = r.n; });
      db.all("SELECT x_call_date AS d, Status AS s, COUNT(*) AS n FROM bookings WHERE x_call_date LIKE ? AND TRIM(Booking_ID) != '' GROUP BY x_call_date, Status", like)
        .forEach(function (r) { if (!C.isCancelled(r.s)) day(r.d).bookings += r.n; });
      // income of a day = income - refunds (expenses are not subtracted here); see income() for the full breakdown
      db.all("SELECT x_date AS d, COUNT(*) AS c, SUM(Amount) AS s FROM financials WHERE x_date LIKE ? AND Type NOT IN ('Expense','مصروف') GROUP BY x_date", like)
        .forEach(function (r) { const o = day(r.d); o.income = Number(r.s) || 0; o._fin += r.c; });
      db.all("SELECT x_date AS d, COUNT(*) AS c FROM financials WHERE x_date LIKE ? AND Type IN ('Expense','مصروف') GROUP BY x_date", like)
        .forEach(function (r) { day(r.d)._fin += r.c; });
      Object.keys(out).forEach(function (d) {
        const o = out[d];
        if (hiddenDays.indexOf(d) !== -1 || !(o.visits || o.bookings || o._fin)) { delete out[d]; return; }
        delete o._fin;
      });
      return out;
    },

    search: function (q) {
      const raw = M.normalizeDigits(q), nameQ = M.normalizeArabic(raw), phoneQ = raw.replace(/\D/g, '');
      if (nameQ.length < 2) return [];
      const conds = ["x_name_key LIKE ? ESCAPE '\\'", "LOWER(Patient_ID) LIKE ? ESCAPE '\\'"], params = ['%' + esc(nameQ) + '%', '%' + esc(nameQ) + '%'];
      if (phoneQ.length >= 3) {
        conds.push("x_phones LIKE ? ESCAPE '\\'"); params.push('%' + esc(phoneQ) + '%');
        const stripped = phoneQ.replace(/^0+/, '');
        if (stripped) { conds.push("x_phones LIKE ? ESCAPE '\\'"); params.push('%' + esc(stripped) + '%'); }
      }
      const rows = db.all('SELECT r, Patient_ID AS pid, x_name_key AS nk, Phone AS ph, x_visit_date AS d FROM patient_records WHERE (' + conds.join(' OR ') +
        ") AND (TRIM(Patient_ID) != '' OR TRIM(Full_Name) != '')", ...params);
      const groups = new Map();
      rows.forEach(function (r) {
        const pid = M.cleanString(r.pid);
        const key = pid || M.phoneKey(r.ph) || r.nk || ('ROW_' + r.r);
        let g = groups.get(key);
        if (!g) { g = { n: 0, latest: null }; groups.set(key, g); }
        g.n++;
        const rec = { r: r.r, d: r.d || '' };
        if (!g.latest || (rec.d > g.latest.d) || (rec.d === g.latest.d && rankR(rec.r) > rankR(g.latest.r))) g.latest = rec;
      });
      return Array.from(groups.values())
        .sort(function (a, b) { return (a.latest.d < b.latest.d ? 1 : a.latest.d > b.latest.d ? -1 : 0) || (rankR(b.latest.r) - rankR(a.latest.r)); })
        .slice(0, 25)
        .map(function (g) {
          const latest = store.visitByRow(g.latest.r);
          if (!latest) return null;
          return { patientId: latest.patientId, fullName: latest.fullName, age: latest.age, phone: latest.phone, lastVisitDate: latest.visitDate, visitCount: g.n, latest: latest };
        }).filter(Boolean);
    },

    profile: function (patientId) {
      const id = M.cleanString(patientId);
      if (!id) throw new Error('رقم المريض مطلوب.');
      const history = store.visitsOfPatient(id).slice(0, 120);
      if (!history.length) throw new Error('لم يتم العثور على المريض.');
      return {
        success: true, patientId: id, patient: history[0], history: history, totalVisits: history.length,
        firstVisitDate: history[history.length - 1].visitDate,
        operations: history.reduce(function (all, v) { return all.concat(M.normalizeOperations(v.surgeryInfoJson)); }, [])
      };
    },

    doctorContext: function (patientId, rowNumber) {
      const id = M.cleanString(patientId);
      if (!id) throw new Error('رقم المريض مطلوب.');
      const cur = Number(rowNumber) || 0;
      const visits = store.visitsOfPatient(id).filter(function (v) { return v.rowNumber !== cur; });
      const previous = visits[0] || null;
      const withDx = visits.filter(function (v) { return !!v.diagnosis; })[0] || null;
      const withRx = visits.filter(function (v) { return v.prescriptions.length; })[0] || null;
      return {
        patientId: id, visitsCount: visits.length + 1,
        previous: previous ? { visitDate: previous.visitDate, diagnosis: previous.diagnosis, notes: previous.notes, testsRequested: previous.testsRequested } : null,
        previousDiagnosis: withDx ? { visitDate: withDx.visitDate, text: withDx.diagnosis } : null,
        lastPrescriptions: withRx ? { visitDate: withRx.visitDate, items: withRx.prescriptions } : null,
        recent: visits.slice(0, 5).map(function (v) { return { visitDate: v.visitDate, diagnosis: v.diagnosis, status: v.visitStatus }; })
      };
    },

    slots: function (ymd) {
      const now = store.clinicNow(), cfg = cc.coreCfg();
      const date = ymd || C.businessDay(now, cfg);
      const bookings = store.allBookings();
      return { date: date, dates: C.bookableDates(now, cfg), now: now, slots: C.slotAvailability(date, bookings, cfg, now) };
    },

    feePreview: function (patientId) {
      const visits = patientId ? store.visitsOfPatient(patientId) : [];
      const r = C.reviewFee(visits.map(function (v) { return { visitDate: v.visitDate, isFreeVisit: v.isFreeVisit }; }), store.today(), cc.coreCfg());
      return { free: r.free, daysSince: r.daysSince, anchorDate: r.anchorDate, reason: r.reason, fee: r.free ? 0 : cc.fee() };
    },

    income: function (ymd, opts) {
      if (store.isHidden(ymd) && !(opts && opts.includeHidden)) return I.emptyIncome(ymd, true);
      const codec = cc.codec(), fin = [];
      tables.select('Financials', 'x_date = ?', [ymd], DAY_ORDER).forEach(function (row) { try { fin.push(codec.finance(row.cells, row.r)); } catch (e) { /* skip */ } });
      const visits = store._visits('x_visit_date = ? AND ' + VALID_VISIT, [ymd], DAY_ORDER);
      return I.buildIncome(ymd, fin, visits, { consultationFee: cc.fee() });
    },

    surgeries: function () {
      const codec = cc.codec(), today = store.today(), out = [];
      tables.select('Surgeries', '', [], DAY_ORDER).forEach(function (row) { try { out.push(codec.surgery(row.cells, row.r, today)); } catch (e) { /* skip */ } });
      const list = out.filter(function (s) { return s.surgeryId; });
      const open = list.filter(function (s) { return s.status === 'Booked'; }).sort(function (a, b) {
        return (a.operationDate < b.operationDate ? -1 : a.operationDate > b.operationDate ? 1 : 0) || String(a.operationTime).localeCompare(String(b.operationTime));
      });
      const rest = list.filter(function (s) { return s.status !== 'Booked'; }).sort(function (a, b) { return a.operationDate < b.operationDate ? 1 : a.operationDate > b.operationDate ? -1 : 0; });
      return open.concat(rest);
    },

    drugs: function () {
      return tables.select('Drugs').map(function (row) {
        const c = row.cells, n = Number(c[4]) || 0;
        return { name: M.cleanString(c[0]), form: M.cleanString(c[1]), strength: M.cleanString(c[2]), unit: M.cleanString(c[3]), useCount: n, uses: n };
      }).filter(function (d) { return !!d.name; }).sort(function (a, b) { return (b.useCount - a.useCount) || a.name.localeCompare(b.name); });
    },

    events: function () {
      const today = store.today(), out = [];
      db.all('SELECT json FROM events_cache WHERE date = ? ORDER BY id', today).forEach(function (r) { try { out.push(JSON.parse(r.json)); } catch (e) { /* skip */ } });
      return out;
    }
  };
  return store;
}

module.exports = { createStore, cmpNewest, rankR };
