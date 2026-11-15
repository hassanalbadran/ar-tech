'use strict';
/**
 * Optimistic local effects of queued writes.
 *
 * Model: the local tables always equal "last server snapshot + effects of the still-pending outbox items".
 *  - Effects that CREATE data insert provisional rows (x_pending=1, negative row number provRow(itemId, seq)).
 *  - Effects that CHANGE an existing row store column overrides in x_overlay (the real columns stay untouched).
 *  - rebuild() = clearPending() + re-apply every pending item in order. It runs after every snapshot/delta apply and
 *    after a write fails (that is how a failed write's effect "rolls back").
 *
 * Known limitations (the server stays authoritative; the next delta corrects everything):
 *  - Events (secretary notifications), the Drugs library counters and legacy-sheet sync are not simulated.
 *  - updateSurgeryStatus does not mirror the change into the source visit's Surgery_Info_JSON.
 *  - Provisional visit date is the clinic calendar day (as server todayYmd_).
 */
const C = require('./core');
const M = require('./mappers');
const { provRow, provId } = require('./outbox');
const { cmpNewest } = require('./store');

function fmtSlot(time) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(time || ''));
  if (!m) return String(time || '');
  const h = +m[1];
  return ((h % 12) || 12) + ':' + m[2] + ' ' + (h < 12 ? 'ص' : 'م');
}

function createEffects(ctx) {
  const db = ctx.db, tables = ctx.tables, cc = ctx.clinicConfig, store = ctx.store, outbox = ctx.outbox;
  const log = ctx.log || function () {};
  const has = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  const asObj = function (sheet, cells) { const o = {}; tables._headers(sheet).forEach(function (h, i) { o[h] = cells[i]; }); return o; };

  /** locatePatientVisit_ : by row number (if it matches the patient id), else newest visit of the patient (optionally on visitDate). */
  function locateVisit(p) {
    const pid = M.cleanString(p.patientId), rn = Number(p.rowNumber);
    if (Number.isInteger(rn) && rn !== 0) {
      const row = tables.get('Patient_Records', rn);
      if (row) {
        const v = cc.codec().visit(row.cells, row.r);
        if (!pid || v.patientId === pid) return { row: row, visit: v };
      }
    }
    if (!pid) return null;
    const date = M.toYmd(p.visitDate);
    const list = store.visitsOfPatient(pid).filter(function (v) { return !date || v.visitDate === date; });
    if (!list.length) return null;
    const row = tables.get('Patient_Records', list[0].rowNumber);
    return row ? { row: row, visit: list[0] } : null;
  }

  /** findExistingPatient_ */
  function findExisting(p) {
    let visits = [];
    const pid = M.cleanString(p.patientId);
    if (pid) visits = store.visitsOfPatient(pid);
    if (!visits.length) {
      const nk = M.normalizeArabic(p.fullName);
      const phones = [M.phoneKey(p.phone), M.phoneKey(p.secondaryPhone)].filter(Boolean);
      if (nk) {
        visits = store._visits("x_name_key = ? AND TRIM(Patient_ID) != ''", [nk]).filter(function (v) {
          const rp = [M.phoneKey(v.phone), M.phoneKey(v.secondaryPhone)].filter(Boolean);
          return !phones.length || !rp.length || phones.some(function (x) { return rp.indexOf(x) !== -1; });
        });
        visits.sort(cmpNewest);
        if (visits.length) { const id = visits[0].patientId; visits = visits.filter(function (v) { return v.patientId === id; }); }
      }
    }
    if (!visits.length) return null;
    visits.sort(cmpNewest);
    return { patientId: visits[0].patientId, latest: visits[0], visits: visits };
  }

  function addFinance(item, seq, o) {
    tables.insertPending('Financials', provRow(item.id, seq), Object.assign({ Transaction_ID: provId(item.id) + '-' + seq }, o, { Payment_Status: o.Payment_Status || 'Paid' }));
  }

  const effects = {
    addNewVisitOrPatient: function (item, args) {
      const p = args[0] || {}, today = store.today(), cfg = cc.coreCfg();
      const existing = findExisting(p);
      if (existing && !M.isAffirmative(p.allowDuplicate) && existing.visits.some(function (v) { return v.visitDate === today; })) return; // server answers "duplicate"
      let paid, free;
      if (p.mode === 'free') { paid = false; free = true; }
      else if (p.mode === 'paid') { paid = true; free = false; }
      else {
        const r = C.reviewFee(existing ? existing.visits.map(function (v) { return { visitDate: v.visitDate, isFreeVisit: v.isFreeVisit }; }) : [], today, cfg);
        free = r.free; paid = !r.free;
      }
      const pid = existing && existing.patientId ? existing.patientId : provId(item.id);
      const row = provRow(item.id), name = M.limitText(p.fullName, 120);
      let age = ''; try { age = M.normalizeAge(p.age); } catch (e) { age = ''; }
      tables.insertPending('Patient_Records', row, {
        Patient_ID: pid, Full_Name: name, Age: age, Gender: M.limitText(p.gender, 20), Address: M.limitText(p.address, 250),
        Phone: M.normalizePhoneInput(p.phone), Secondary_Phone: M.normalizePhoneInput(p.secondaryPhone),
        Escorts_Count: Math.max(0, Math.floor(Number(M.normalizeDigits(p.escortsCount)) || 0)),
        Visit_Date: today, Last_Visit_Date: existing ? existing.latest.visitDate : '', Diagnosis: '', Prescriptions_JSON: '', Tests_Requested: '',
        Has_Ready_Tests: M.normalizeYesNo(p.hasReadyTests, 'لا'), Consultation_Paid: paid ? 'نعم' : 'لا', Is_Free_Visit: free ? 'نعم' : 'لا',
        Surgery_Info_JSON: M.serializeJsonField(p.surgeryInfoJson !== undefined ? p.surgeryInfoJson : p.surgeryInfo),
        Notes: M.limitText(p.notes, 2000), Visit_Status: 'waiting', Extra_Charges_JSON: '', Status_Info_JSON: ''
      });
      if (paid) {
        addFinance(item, 0, { Date: today, Type: 'Consultation', Item_Name: 'Consultation - ' + name, Amount: cc.fee(), Notes: M.buildVisitFinanceNote(pid, today, row) });
      }
    },

    saveDoctorVisit: function (item, args) {
      const data = args[0] || {}, codec = cc.codec(), t = locateVisit(data);
      if (!t) return;
      const cur = t.visit, patch = {}, today = store.today();
      let seq = 1;
      if (has(data, 'diagnosis')) patch.Diagnosis = M.limitText(data.diagnosis, 4000);
      if (has(data, 'notes')) patch.Notes = M.limitText(data.notes, 4000);
      if (has(data, 'hasReadyTests')) patch.Has_Ready_Tests = M.normalizeYesNo(data.hasReadyTests, cur.hasReadyTests || 'لا');
      if (has(data, 'prescriptions') || has(data, 'prescriptionsJson')) {
        const incoming = codec.normalizePrescriptions(has(data, 'prescriptions') ? data.prescriptions : data.prescriptionsJson);
        if (has(data, 'knownPrescriptions')) {
          const known = {}, have = {};
          codec.normalizePrescriptions(data.knownPrescriptions).forEach(function (x) { known[codec.rxKey(x)] = 1; });
          incoming.forEach(function (x) { have[codec.rxKey(x)] = 1; });
          cur.prescriptions.forEach(function (x) { const k = codec.rxKey(x); if (!known[k] && !have[k]) { incoming.push(x); have[k] = 1; } });
        }
        patch.Prescriptions_JSON = incoming.length ? JSON.stringify(incoming) : '';
      }
      if (has(data, 'tests') || has(data, 'testsRequested')) patch.Tests_Requested = codec.normalizeTests(has(data, 'tests') ? data.tests : data.testsRequested).join(', ');

      if (M.isAffirmative(data.refund) || M.isAffirmative(data.refundRequested)) {
        if (cur.consultationPaid === 'نعم') {
          const vnote = M.buildVisitFinanceNote(cur.patientId, cur.visitDate, t.row.r);
          const paidRows = tables.select('Financials', 'Notes = ?', [vnote], 'r');
          let amount = cc.fee();
          if (paidRows.length) { const a = Number(paidRows[paidRows.length - 1].cells[4]); if (isFinite(a) && a > 0) amount = a; }
          patch.Consultation_Paid = 'مسترد';
          addFinance(item, seq++, { Date: today, Type: 'Refund', Item_Name: 'Consultation Refund - ' + cur.fullName, Amount: -amount, Payment_Status: 'Refunded',
            Notes: M.buildRefundFinanceNote(cur.patientId, cur.visitDate, t.row.r) });
        }
      }

      if (has(data, 'extraCharges')) {
        const fees = codec.extraFees;
        const desired = (Array.isArray(data.extraCharges) ? data.extraCharges : String(data.extraCharges || '').split(',')).map(M.cleanString)
          .filter(function (k, i, a) { return !!fees[k] && a.indexOf(k) === i; });
        const all = [];
        Object.keys(fees).forEach(function (kind) {
          const wants = desired.indexOf(kind) !== -1, had = cur.extraCharges.indexOf(kind) !== -1;
          if (wants === had) { if (wants) all.push(kind); return; }
          const chargeTag = M.buildExtraNote('EXTRA', kind, cur.patientId, cur.visitDate, t.row.r);
          const reverseTag = M.buildExtraNote('EXTRA-REVERSE', kind, cur.patientId, cur.visitDate, t.row.r);
          const n = function (tag) { return tables.select('Financials', 'Notes LIKE ?', ['%' + tag + '%']).length; };
          const netCharged = n(chargeTag) - n(reverseTag) > 0;
          if (wants) {
            if (!netCharged) addFinance(item, seq++, { Date: today, Type: 'ExtraFee', Item_Name: fees[kind].label + ' - ' + cur.fullName, Amount: fees[kind].amount, Notes: chargeTag });
            all.push(kind);
          } else if (netCharged) {
            addFinance(item, seq++, { Date: today, Type: 'Refund', Item_Name: 'Reverse ' + fees[kind].label + ' - ' + cur.fullName, Amount: -fees[kind].amount, Payment_Status: 'Refunded', Notes: reverseTag });
          }
        });
        patch.Extra_Charges_JSON = all.length ? JSON.stringify(all) : '';
      }

      const action = (M.cleanString(data.action) || 'save').toLowerCase();
      const info = Object.assign({}, cur.statusInfo), nowStr = store.clinicNow();
      const stamp = nowStr.ymd + ' ' + nowStr.hm + ':00';
      let status = cur.visitStatus;
      if (action === 'finish') { status = 'finished'; info.finishedAt = stamp; }
      else if (action === 'close') { status = 'closed'; info.closedAt = stamp; }
      else if (action === 'reopen') { status = 'waiting'; info.reopenedAt = stamp; }
      else if (action === 'postpone') {
        status = 'postponed';
        const tests = patch.Tests_Requested !== undefined ? codec.normalizeTests(patch.Tests_Requested) : cur.tests;
        info.postponedAt = stamp; info.postponeTo = tests.map(function (c) { return (cc.get().tests || {})[c] || c; });
        info.postponeNote = M.limitText(data.postponeNote, 300);
      }
      if (status !== cur.visitStatus) patch.Visit_Status = status;
      if (action !== 'save') patch.Status_Info_JSON = Object.keys(info).length ? JSON.stringify(info) : '';
      tables.setOverlay('Patient_Records', t.row.r, patch);
    },

    addPrescriptionToVisit: function (item, args) {
      const data = args[0] || {}, codec = cc.codec(), t = locateVisit(data);
      if (!t) return;
      const items = codec.normalizePrescriptions(data.items);
      const have = {}, merged = t.visit.prescriptions.slice();
      t.visit.prescriptions.forEach(function (x) { have[codec.rxKey(x)] = 1; });
      items.forEach(function (x) { const k = codec.rxKey(x); if (!have[k]) { merged.push(x); have[k] = 1; } });
      tables.setOverlay('Patient_Records', t.row.r, { Prescriptions_JSON: JSON.stringify(merged) });
    },

    addNewBooking: function (item, args) {
      const b = args[0] || {};
      tables.insertPending('Bookings', provRow(item.id), {
        Booking_ID: provId(item.id), Patient_Name: M.limitText(b.patientName, 120), Call_Time: b.date + ' ' + b.time + ':00',
        Phone: M.normalizePhoneInput(b.phone), Requested_Slot: fmtSlot(b.time), Status: 'Pending'
      });
    },

    updateBookingStatus: function (item, args) {
      const p = args[0] || {}, id = M.cleanString(p.bookingId);
      tables.select('Bookings', 'TRIM(Booking_ID) = ?', [id]).forEach(function (row) { tables.setOverlay('Bookings', row.r, { Status: M.cleanString(p.status) }); });
    },

    addSurgery: function (item, args) {
      const d = args[0] || {}, t = locateVisit(d);
      if (!t) return;
      const v = t.visit, today = store.today(), amountRaw = M.parseAmount(d.amount), amount = isFinite(amountRaw) && amountRaw > 0 ? amountRaw : 0;
      const opId = provId(item.id), pay = M.cleanString(d.paymentStatus) || 'غير مدفوع', date = M.toYmd(d.operationDate) || M.cleanString(d.operationDate);
      const op = {
        operationId: opId, patientId: v.patientId, patientName: v.fullName, operationType: M.limitText(d.operationType, 150), details: M.limitText(d.details, 2000),
        operationDate: date, operationTime: M.cleanString(d.operationTime), location: M.limitText(d.location, 150), amount: amount, paymentStatus: pay,
        createdAt: today + ' 00:00:00'
      };
      const stamp = store.clinicNow(), ts = stamp.ymd + ' ' + stamp.hm + ':00';
      tables.insertPending('Surgeries', provRow(item.id), {
        Surgery_ID: opId, Patient_ID: v.patientId, Patient_Name: v.fullName, Phone: v.phone, Operation_Type: op.operationType, Operation_Date: date,
        Operation_Time: op.operationTime, Location: op.location, Details: op.details, Amount: amount, Payment_Status: pay, Status: 'Booked',
        Source_Row: t.row.r, Created_At: ts, Updated_At: ts
      });
      const ops = M.normalizeOperations(v.surgeryInfoJson).concat([op]);
      tables.setOverlay('Patient_Records', t.row.r, { Surgery_Info_JSON: JSON.stringify(ops) });
      if (amount > 0 && ['paid', 'مدفوع', 'نعم'].indexOf(pay.toLowerCase()) !== -1) {
        addFinance(item, 1, { Date: today, Type: 'Surgery', Item_Name: op.operationType + ' - ' + v.fullName, Amount: amount, Notes: '[SURGERY][' + v.patientId + '][' + opId + ']' });
      }
    },

    updateSurgeryStatus: function (item, args) {
      const p = args[0] || {}, id = M.cleanString(p.surgeryId), nd = p.operationDate ? M.toYmd(p.operationDate) : '';
      tables.select('Surgeries', 'TRIM(Surgery_ID) = ?', [id]).forEach(function (row) {
        const patch = { Status: M.cleanString(p.status) };
        if (nd) patch.Operation_Date = nd;
        tables.setOverlay('Surgeries', row.r, patch);
      });
    },

    recordClinicExpense: function (item, args) {
      const e = args[0] || {}, qty = Number(M.normalizeDigits(e.quantity)) > 0 ? Number(M.normalizeDigits(e.quantity)) : 1, unit = M.parseAmount(e.unitPrice);
      if (!isFinite(unit) || unit < 0 || !M.cleanString(e.itemName)) return;
      addFinance(item, 0, {
        Date: M.toYmd(e.date) || store.today(), Type: 'Expense', Item_Name: M.limitText(e.itemName, 150), Amount: qty * unit,
        Notes: JSON.stringify({ kind: 'expense', quantity: qty, unitPrice: unit, deductFromClinic: e.deductFromClinic === undefined ? true : M.isAffirmative(e.deductFromClinic), note: M.cleanString(e.notes) })
      });
    }
  };

  const api = {
    applyItem: function (item) {
      const fn = effects[item.fn];
      if (!fn) return;
      const res = outbox.resolveArgs(item.args);
      try { fn(item, res.args || item.args); } catch (e) { log('applyLocal ' + item.fn + ': ' + (e && e.message)); }
    },
    /** clearPending + re-apply every pending item (caller may wrap in its own transaction). */
    rebuild: function () {
      db.transaction(function () {
        tables.clearPending();
        outbox.pending().forEach(api.applyItem);
      });
    },
    /** What a queued (not yet confirmed) write returns to the UI. */
    provisionalResult: function (item) {
      if (item.fn === 'addNewVisitOrPatient') {
        const row = tables.get('Patient_Records', provRow(item.id));
        if (row) {
          const v = cc.codec().visit(row.cells, row.r);
          return { success: true, provisional: true, patient: v, patientId: v.patientId, isNewPatient: v.patientId === provId(item.id), isFreeVisit: v.isFreeVisit === 'نعم',
            consultationPaid: v.consultationPaid === 'نعم', consultationFee: v.consultationPaid === 'نعم' ? cc.fee() : 0 };
        }
        return { success: true, provisional: true, duplicate: true };
      }
      return { success: true, provisional: true };
    }
  };
  return api;
}

module.exports = { createEffects, fmtSlot };
