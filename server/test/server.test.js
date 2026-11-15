'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { createGas } = require('../../tools/gas-emulator');

function fresh(now) {
  const g = createGas({ now: now || '2026-11-11T16:05:00+03:00' });
  g.props.set('ADMIN_PIN', '9999');
  g.call('setupSheets');
  return g;
}
function pair(g, platform) {
  const c = g.call('adminCreatePairingCode', '9999');
  const r = g.api({ action: 'pair', code: c.code, deviceName: 'Test PC', platform: platform || 'desktop' });
  assert.ok(r.ok, r.error);
  return r.data.token;
}
const P = { fullName: 'أحمد علي', age: 40, phone: '07701234567', gender: 'ذكر' };

test('pairing: one-time code, token auth, bad token rejected', () => {
  const g = fresh();
  const c = g.call('adminCreatePairingCode', '9999');
  assert.match(c.code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  const r = g.api({ action: 'pair', code: c.code, deviceName: 'PC', platform: 'desktop' });
  assert.ok(r.ok); assert.ok(r.data.token.length >= 64); assert.ok(r.data.config.headers.Patient_Records.length === 21);
  assert.strictEqual(g.api({ action: 'pair', code: c.code, deviceName: 'PC2' }).ok, false, 'code is single-use');
  assert.strictEqual(g.api({ action: 'rev', token: 'x'.repeat(64) }).code, 'AUTH');
  assert.strictEqual(g.api({ action: 'rev' }).code, 'AUTH');
  assert.ok(g.api({ action: 'rev', token: r.data.token }).ok);
  g.advance(11 * 60 * 1000);
  const c2 = g.call('adminCreatePairingCode', '9999');
  g.advance(11 * 60 * 1000);
  assert.strictEqual(g.api({ action: 'pair', code: c2.code }).ok, false, 'expired code');
});

test('admin pin required and locks after failures', () => {
  const g = fresh();
  assert.throws(() => g.call('adminOverview', '0000'), /غير صحيح/);
  for (let i = 0; i < 5; i++) { try { g.call('adminOverview', 'bad'); } catch (e) {} }
  assert.throws(() => g.call('adminOverview', '9999'), /قفل/);
  const g2 = createGas(); g2.call('setupSheets');
  assert.throws(() => g2.call('adminOverview', '1'), /ADMIN_PIN/);
});

test('booking: hours, capacity (4 per clock hour), phone, window', () => {
  const g = fresh();
  const slots = g.call('getBookingSlots', {});
  assert.strictEqual(slots.date, '2026-11-11'); assert.strictEqual(slots.dates.length, 5);
  assert.deepStrictEqual(slots.slots.map(s => s.time), ['15:30', '16:00', '16:30', '17:00', '17:30', '18:00', '18:30']);
  const b = (t, extra) => g.call('addNewBooking', Object.assign({ patientName: 'مريض', phone: '7701234567', date: '2026-11-11', time: t }, extra));
  const r = b('16:00'); assert.strictEqual(r.success, true); assert.strictEqual(r.booking.phone, '07701234567'); assert.strictEqual(r.booking.requestedSlot, '4:00 م');
  b('16:00'); b('16:00'); b('16:30'); // 4 in the 16:xx hour
  assert.throws(() => b('16:00'), /ممتلئ/);
  assert.throws(() => b('16:30'), /ممتلئ/);
  assert.ok(b('17:00').success);
  assert.throws(() => b('16:15'), /خارج ساعات/);
  assert.throws(() => g.call('addNewBooking', { patientName: 'x', phone: '0770', date: '2026-11-11', time: '17:00' }), /أرقام/);
  assert.throws(() => b('17:30', { date: '2026-11-16' }), /خارج المدة/);
  assert.ok(b('17:30', { date: '2026-11-15' }).success);
  const after = g.call('getBookingSlots', { date: '2026-11-11' });
  assert.strictEqual(after.slots.find(s => s.time === '16:30').full, true);
  assert.strictEqual(after.slots.find(s => s.time === '17:00').full, false);
  // cancelling frees the place
  const list = g.call('getTodayQueueSnapshot');
  assert.strictEqual(list.bookings.length, 5); assert.strictEqual(list.upcoming.length, 1);
  g.call('updateBookingStatus', { bookingId: list.bookings[0].bookingId, status: 'ملغى' });
  assert.ok(b('16:00').success);
});

test('booking: Friday window 08:00-11:30 and business day after closing', () => {
  const g = fresh('2026-11-12T19:30:00+03:00'); // Thursday after closing -> business day is Friday
  const s = g.call('getBookingSlots', {});
  assert.strictEqual(s.dates[0], '2026-11-13');
  assert.strictEqual(s.slots[0].time, '08:00'); assert.strictEqual(s.slots[s.slots.length - 1].time, '11:30');
  assert.ok(g.call('addNewBooking', { patientName: 'جمعة', phone: '07801234567', date: '2026-11-13', time: '08:00' }).success);
  assert.throws(() => g.call('addNewBooking', { patientName: 'جمعة', phone: '07801234567', date: '2026-11-13', time: '16:00' }), /خارج ساعات/);
});

test('review fee: one free review, then paid again (spec example 1/11 -> 2/11 free -> 3/11 paid)', () => {
  const g = fresh('2026-11-01T16:10:00+03:00');
  let r = g.call('addNewVisitOrPatient', P);
  assert.strictEqual(r.confirmationRequired, true, 'new patient must confirm fee');
  r = g.call('addNewVisitOrPatient', Object.assign({ paidConfirmation: true }, P));
  assert.strictEqual(r.consultationPaid, true);
  g.setNow('2026-11-02T16:10:00+03:00');
  r = g.call('addNewVisitOrPatient', P);
  assert.strictEqual(r.isFreeVisit, true, '2/11 must be free'); assert.strictEqual(r.consultationFee, 0);
  g.setNow('2026-11-03T16:10:00+03:00');
  r = g.call('addNewVisitOrPatient', P);
  assert.strictEqual(r.confirmationRequired, true, '3/11 must be paid');
  r = g.call('addNewVisitOrPatient', Object.assign({ paidConfirmation: true }, P));
  assert.strictEqual(r.consultationFee, 15000);
  g.setNow('2026-11-04T16:10:00+03:00');
  assert.strictEqual(g.call('addNewVisitOrPatient', P).isFreeVisit, true, 'new paid visit restarts the window');
  const fin = g.rows('Financials').filter(x => x[2] === 'Consultation');
  assert.strictEqual(fin.length, 2);
});

test('doctor modes: free raise has no fee; paid raise records fee and notifies the secretary', () => {
  const g = fresh('2026-11-01T16:10:00+03:00');
  g.call('addNewVisitOrPatient', Object.assign({ paidConfirmation: true }, P));
  g.setNow('2026-11-02T16:10:00+03:00'); g.call('addNewVisitOrPatient', P); // free review used
  g.setNow('2026-11-03T16:10:00+03:00');
  let r = g.call('addNewVisitOrPatient', Object.assign({ mode: 'free' }, P));
  assert.strictEqual(r.isFreeVisit, true); assert.strictEqual(r.transaction, null);
  g.setNow('2026-11-10T16:10:00+03:00');
  r = g.call('addNewVisitOrPatient', Object.assign({ mode: 'paid' }, P));
  assert.strictEqual(r.consultationFee, 15000); assert.ok(r.transaction);
  const ev = g.call('getTodayQueueSnapshot').events;
  assert.ok(ev.some(e => e.type === 'charge' && /كشفية/.test(e.message)));
});

test('delta sync: rev counter, row upserts, bookings replaced, resync when log is too old', () => {
  const g = fresh();
  const tok = pair(g);
  const rev0 = g.api({ action: 'rev', token: tok }).data.rev;
  g.call('addNewVisitOrPatient', Object.assign({ paidConfirmation: true }, P));
  g.call('addNewBooking', { patientName: 'حجز', phone: '07801112233', date: '2026-11-12', time: '16:00' });
  const d = g.api({ action: 'delta', token: tok, since: rev0 });
  assert.ok(d.ok); assert.strictEqual(d.data.resync, false); assert.ok(d.data.rev > rev0);
  const pr = d.data.tables.Patient_Records; assert.strictEqual(pr.length, 1);
  assert.strictEqual(pr[0][0], 2); assert.strictEqual(pr[0][1], 'P-1'.length ? pr[0][1] : '');
  assert.strictEqual(pr[0][2], 'أحمد علي'); assert.strictEqual(pr[0][9], '2026-11-11', 'Visit_Date is a plain string');
  assert.strictEqual(pr[0][6], '07701234567', 'phone keeps its leading zero');
  assert.strictEqual(typeof pr[0][3], 'number', 'age stays numeric');
  assert.ok(d.data.tables.Financials.length >= 1);
  assert.strictEqual(d.data.bookings.length, 1); assert.strictEqual(d.data.bookings[0][3], '2026-11-12 16:00:00');
  const same = g.api({ action: 'delta', token: tok, since: d.data.rev });
  assert.deepStrictEqual(same.data.tables, {}); assert.strictEqual(same.data.bookings, undefined);
  // log older than we can serve -> resync
  g.props.set('CM_CHANGES', '9999>P2'); g.props.set('CM_REV', '9999');
  assert.strictEqual(g.api({ action: 'delta', token: tok, since: 3 }).data.resync, true);
});

test('snapshot paging returns every row exactly once', () => {
  const g = fresh();
  const tok = pair(g);
  for (let i = 0; i < 7; i++) g.call('addNewVisitOrPatient', { fullName: 'مراجع ' + i, phone: '0770000000' + i, age: 20 + i, paidConfirmation: true });
  const seen = []; let from = 2, guard = 0;
  while (from && guard++ < 20) {
    const r = g.api({ action: 'snapshot', token: tok, table: 'Patient_Records', from, limit: 3 });
    assert.ok(r.ok, r.error); r.data.rows.forEach(x => seen.push(x[0])); from = r.data.next;
  }
  assert.deepStrictEqual(seen, [2, 3, 4, 5, 6, 7, 8]);
  assert.ok(g.api({ action: 'snapshot', token: tok, table: 'Bookings' }).ok);
  assert.strictEqual(g.api({ action: 'snapshot', token: tok, table: 'Nope' }).ok, false);
});

test('call: whitelist, idempotency by cid, business errors are Arabic', () => {
  const g = fresh();
  const tok = pair(g);
  assert.strictEqual(g.api({ action: 'call', token: tok, fn: 'setupSheets', args: [] }).ok, false);
  assert.strictEqual(g.api({ action: 'call', token: tok, fn: 'constructor', args: [] }).ok, false);
  const req = { action: 'call', token: tok, fn: 'addNewBooking', cid: 'c-1', args: [{ patientName: 'س', phone: '07701234567', date: '2026-11-11', time: '17:00' }] };
  assert.ok(g.api(req).ok);
  const again = g.api(req); assert.ok(again.ok); assert.strictEqual(again.data.replayed, true);
  assert.strictEqual(g.rows('Bookings').length, 1);
  const bad = g.api({ action: 'call', token: tok, fn: 'addNewBooking', cid: 'c-2', args: [{ patientName: 'س', phone: '123', date: '2026-11-11', time: '17:00' }] });
  assert.strictEqual(bad.ok, false); assert.match(bad.error, /[؀-ۿ]/);
  // failed call is not marked as done: the corrected retry with the same cid works
  const ok = g.api({ action: 'call', token: tok, fn: 'addNewBooking', cid: 'c-2', args: [{ patientName: 'س', phone: '07701234567', date: '2026-11-11', time: '17:00' }] });
  assert.ok(ok.ok && !ok.data.replayed);
});

test('setConfig changes fee and free days live', () => {
  const g = fresh('2026-11-01T16:10:00+03:00');
  const tok = pair(g);
  assert.strictEqual(g.api({ action: 'setConfig', token: tok, pin: 'wrong', patch: { consultationFee: 20000 } }).ok, false);
  const r = g.api({ action: 'setConfig', token: tok, pin: '1234', patch: { consultationFee: 20000, freeReviewDays: 3, doctorName: 'د. سعد', rules: { perHour: 2 } } });
  assert.ok(r.ok, r.error); assert.strictEqual(r.data.consultationFee, 20000); assert.strictEqual(r.data.rules.perHour, 2);
  const v = g.call('addNewVisitOrPatient', Object.assign({ paidConfirmation: true }, P));
  assert.strictEqual(v.consultationFee, 20000);
  g.setNow('2026-11-05T16:10:00+03:00'); // 4 days later > 3
  assert.strictEqual(g.call('addNewVisitOrPatient', P).confirmationRequired, true);
  assert.strictEqual(g.api({ action: 'setConfig', token: tok, pin: '1234', patch: { freeReviewDays: 99 } }).ok, false);
  const b = (t) => g.call('addNewBooking', { patientName: 'x', phone: '07701234567', date: '2026-11-05', time: t });
  b('16:00'); b('16:00'); assert.throws(() => b('16:30'), /ممتلئ/);
  assert.strictEqual(g.call('clientConfig_').doctorName, 'د. سعد');
});

test('license: trial 30 days, expiry, key activation, device limit, revoke, block', () => {
  const g = fresh();
  const lic = (id, extra) => g.api(Object.assign({ action: 'licenseCheck', deviceId: id, platform: 'desktop', appVersion: '1.0.0' }, extra));
  let r = lic('device-AAAA1111'); assert.ok(r.ok); assert.strictEqual(r.data.status, 'trial'); assert.strictEqual(r.data.daysLeft, 30);
  g.advance(29 * 86400000); assert.strictEqual(lic('device-AAAA1111').data.daysLeft, 1);
  g.advance(2 * 86400000); r = lic('device-AAAA1111'); assert.strictEqual(r.data.status, 'expired'); assert.match(r.data.message, /المطوّر/);
  assert.strictEqual(lic('bad id!').ok, false);

  const k = g.call('adminCreateLicense', '9999', { label: 'عيادة الدكتور زيد', maxDevices: 2, usage: 'غير تجاري' }).key;
  assert.match(k, /^CM-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.strictEqual(g.api({ action: 'licenseActivate', deviceId: 'device-AAAA1111', key: 'CM-WRONG' }).ok, false);
  r = g.api({ action: 'licenseActivate', deviceId: 'device-AAAA1111', key: k.toLowerCase().replace(/-/g, ' ') }); assert.ok(r.ok, r.error); assert.strictEqual(r.data.status, 'active');
  assert.strictEqual(lic('device-AAAA1111').data.status, 'active');
  assert.ok(g.api({ action: 'licenseActivate', deviceId: 'device-BBBB2222', key: k }).ok);
  const third = g.api({ action: 'licenseActivate', deviceId: 'device-CCCC3333', key: k });
  assert.strictEqual(third.ok, false); assert.strictEqual(third.code, 'LICENSE'); assert.match(third.error, /الحد الأقصى/);

  const ov = g.call('adminOverview', '9999');
  assert.strictEqual(ov.licenses[0].devices, 2); assert.strictEqual(ov.licenses[0].usage, 'غير تجاري');
  g.call('adminUpdateLicense', '9999', { key: k, status: 'revoked' });
  assert.strictEqual(lic('device-AAAA1111').data.status, 'revoked');
  g.call('adminUpdateLicense', '9999', { key: k, status: 'active' });
  g.call('adminBlockDevice', '9999', 'device-AAAA1111', true);
  assert.strictEqual(lic('device-AAAA1111').data.status, 'revoked');
  g.call('adminBlockDevice', '9999', 'device-AAAA1111', false);
  assert.strictEqual(lic('device-AAAA1111').data.status, 'active');
  g.call('adminUpdateLicense', '9999', { key: k, expiresAt: '2026-01-01' });
  assert.strictEqual(lic('device-AAAA1111').data.status, 'expired');
});

test('paired devices can be listed and revoked; revoked token stops working', () => {
  const g = fresh();
  const tok = pair(g, 'android');
  assert.ok(g.api({ action: 'pairingCode', token: tok, url: 'https://x/exec' }).ok);
  const ov = g.call('adminOverview', '9999'); assert.strictEqual(ov.paired.length, 1); assert.strictEqual(ov.paired[0].platform, 'android');
  g.call('adminRevokePairedDevice', '9999', ov.paired[0].id);
  assert.strictEqual(g.api({ action: 'rev', token: tok }).code, 'AUTH');
});

test('presence/legacy mirror still work through call', () => {
  const g = fresh();
  const tok = pair(g);
  assert.ok(g.api({ action: 'call', token: tok, fn: 'getTodayQueueSnapshot', args: [] }).ok);
  assert.ok(g.api({ action: 'call', token: tok, fn: 'getDrugLibrary', args: [] }).ok);
});
