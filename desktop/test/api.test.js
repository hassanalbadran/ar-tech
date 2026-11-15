'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { createWorld } = require('./helpers');

async function linked(w) {
  const app = w.mk(); const m = app.methods;
  await m.link({ url: w.URL, code: w.pairingCode() });
  return { app, m };
}
const seedVisit = (w, name, phone, date) => { if (date) w.gas.setNow(date); return w.gas.call('addNewVisitOrPatient', { fullName: name, age: '30', gender: 'ذكر', phone: phone || '07700000001', address: 'الحلة', escortsCount: '', notes: '', paidConfirmation: true }); };

test('link downloads config + data; state; reads work', async () => {
  const w = createWorld();
  seedVisit(w, 'علي حسن');
  const { app, m } = await linked(w);
  const s = await m.state();
  assert.strictEqual(s.linked, true);
  assert.strictEqual(s.config.consultationFee, 15000);
  const day = await m.getDay('2026-11-12');
  assert.strictEqual(day.visits.length, 1);
  assert.strictEqual(day.visits[0].fullName, 'علي حسن');
  const found = await m.search('علي');
  assert.strictEqual(found.length, 1);
  const inc = await m.income('2026-11-12');
  assert.strictEqual(inc.totals.income, 15000);
  app.dispose();
});

test('addVisit works online, then delta picks up server-side changes', async () => {
  const w = createWorld();
  const { app, m } = await linked(w);
  const r = await m.addVisit({ fullName: 'سارة كريم', age: '25', gender: 'أنثى', phone: '07712345678', address: 'x', escortsCount: '', notes: '', paidConfirmation: true });
  assert.strictEqual(r.ok, true); assert.strictEqual(r.queued, false);
  assert.strictEqual((await m.getDay('2026-11-12')).visits.length, 1);
  seedVisit(w, 'من الموقع', '07711111111');
  await m.syncNow({});
  assert.strictEqual((await m.getDay('2026-11-12')).visits.length, 2);
  assert.ok(w.net.calls.includes('delta'));
  app.dispose();
});

test('offline write is queued with an optimistic row, then flushed once online (no duplicates)', async () => {
  const w = createWorld();
  const { app, m } = await linked(w);
  w.net.online = false;
  const r = await m.addVisit({ fullName: 'مريض اوفلاين', age: '40', gender: 'ذكر', phone: '07733333333', address: 'x', escortsCount: '', notes: '', paidConfirmation: true });
  assert.strictEqual(r.queued, true);
  const day = await m.getDay('2026-11-12');
  assert.strictEqual(day.visits.length, 1, 'visible locally while offline');
  assert.strictEqual((await m.state()).sync.pending, 1);
  // a second queued write that depends on the first (rowNumber of the provisional row)
  const row = day.visits[0].rowNumber; assert.ok(row < 0);
  const rx = await m.addRx({ rowNumber: row, patientId: day.visits[0].patientId, visitDate: '2026-11-12', items: [{ name: 'Paracetamol', form: 'Tab', strength: '500', unit: 'mg', dose: '1x3', timing: 'after_meal', duration: 'd5' }] });
  assert.strictEqual(rx.queued, true);
  w.net.online = true;
  await m.syncNow({});
  const st = await m.state();
  assert.strictEqual(st.sync.pending, 0);
  const rows = w.gas.rows('Patient_Records');
  assert.strictEqual(rows.filter(r => String(r[1]).includes('مريض اوفلاين')).length, 1, 'exactly one server row');
  assert.ok(String(rows[rows.length - 1][11]).includes('Paracetamol'), 'the dependent Rx reached the same row');
  const d2 = await m.getDay('2026-11-12');
  assert.ok(d2.visits[0].rowNumber > 0, 'provisional row replaced by the real one');
  app.dispose();
});

test('lost reply → retry with the same cid does not double-write', async () => {
  const w = createWorld();
  const { app, m } = await linked(w);
  w.net.dropReplies = 1;
  const r = await m.addVisit({ fullName: 'تكرار', age: '40', gender: 'ذكر', phone: '07744444444', address: 'x', escortsCount: '', notes: '', paidConfirmation: true });
  assert.strictEqual(r.queued, true);
  await m.syncNow({});
  assert.strictEqual(w.gas.rows('Patient_Records').filter(r => String(r[1]) === 'تكرار').length, 1);
  assert.strictEqual((await m.state()).sync.pending, 0);
  app.dispose();
});

test('booking validated locally with shared rules, then synced', async () => {
  const w = createWorld();
  const { app, m } = await linked(w);
  await assert.rejects(m.addBooking({ patientName: 'x', phone: '123', date: '2026-11-12', time: '17:00' }), /الهاتف|رقم/);
  await assert.rejects(m.addBooking({ patientName: 'x', phone: '07701234567', date: '2026-11-12', time: '20:00' }), /.+/);
  const ok = await m.addBooking({ patientName: 'حجز', phone: '7701234567', date: '2026-11-13', time: '09:00' });
  assert.strictEqual(ok.queued, false);
  const slots = await m.slots('2026-11-13');
  assert.strictEqual(slots.slots.find(s => s.time === '09:00').count, 1);
  assert.ok(w.gas.rows('Bookings').some(r => String(r[3]) === '07701234567'));
  app.dispose();
});

test('expense uses the finance PIN only at send time (never stored in the outbox)', async () => {
  const w = createWorld();
  const { app, m } = await linked(w);
  w.net.online = false;
  const r = await m.addExpense({ date: '2026-11-12', itemName: 'ورق', quantity: 2, unitPrice: 5000, fromClinicIncome: false });
  assert.strictEqual(r.queued, true);
  const stored = app.internals.outbox.pending()[0];
  assert.ok(!JSON.stringify(stored.args).includes('1234'), 'no PIN in the queue');
  w.net.online = true; await m.syncNow({});
  const inc = await m.income('2026-11-12');
  assert.strictEqual(inc.totals.expensesOwn, 10000);
  app.dispose();
});

test('hide day needs the PIN (default 1289) and hides locally only', async () => {
  const w = createWorld();
  seedVisit(w, 'مخفي');
  const { app, m } = await linked(w);
  await assert.rejects(m.hideDay('2026-11-12', '0000'), /الرمز/);
  await m.hideDay('2026-11-12', '1289');
  assert.strictEqual((await m.getDay('2026-11-12')).hidden, true);
  assert.strictEqual((await m.getDay('2026-11-12')).visits.length, 0);
  assert.strictEqual((await m.getDay('2026-11-12', { includeHidden: true })).visits.length, 1);
  assert.strictEqual(w.gas.rows('Patient_Records').length, 1, 'sheet untouched');
  await m.changePin('hide', '1289', '5555');
  await m.unhideDay('2026-11-12', '5555');
  assert.strictEqual((await m.getDay('2026-11-12')).hidden, false);
  app.dispose();
});

test('review rule preview + free raise via addVisit mode', async () => {
  const w = createWorld();
  const first = seedVisit(w, 'مراجع', '07755555555', '2026-11-01T16:00:00+03:00');
  w.gas.setNow('2026-11-02T16:00:00+03:00');
  const { app, m } = await linked(w);
  const pid = first.patient.patientId;
  assert.strictEqual((await m.feePreview(pid)).free, true);
  const r = await m.addVisit({ patientId: pid, fullName: 'مراجع', age: '30', gender: 'ذكر', phone: '07755555555', address: '', escortsCount: '', notes: '', paidConfirmation: true });
  assert.strictEqual(r.result.isFreeVisit, true);
  w.gas.setNow('2026-11-03T16:00:00+03:00');
  await m.syncNow({});
  assert.strictEqual((await m.feePreview(pid)).free, false, 'free review used → next is paid');
  app.dispose();
});

test('saveClinicConfig round-trips to the server; rules reach slots', async () => {
  const w = createWorld();
  const { app, m } = await linked(w);
  await m.saveClinicConfig({ doctorName: 'زيد سمير', consultationFee: 20000, freeReviewDays: 7 });
  assert.strictEqual((await m.state()).config.consultationFee, 20000);
  assert.strictEqual(w.gas.call('clientConfig_').consultationFee, 20000);
  app.dispose();
});

test('print: rxHtml contains only medicines; printRx honours the enabled switch', async () => {
  const w = createWorld();
  seedVisit(w, 'طباعة');
  const { app, m } = await linked(w);
  const v = (await m.getDay('2026-11-12')).visits[0];
  await m.addRx({ rowNumber: v.rowNumber, patientId: v.patientId, visitDate: v.visitDate, items: [{ name: 'Amoxicillin', form: 'Cap', strength: '500', unit: 'mg', dose: '1x3', timing: 'after_meal', duration: 'd7' }] });
  const html = await m.rxHtml(v.rowNumber);
  assert.ok(html.includes('Amoxicillin') && html.includes('@page'));
  assert.ok(!html.includes('طباعة'), 'patient name is not printed (pre-printed paper)');
  assert.deepStrictEqual(await m.printRx(v.rowNumber), { printed: false });
  await m.setSettings({ printer: { enabled: true, printerName: 'HP', paperSize: 'A5' } });
  assert.deepStrictEqual(await m.printRx(v.rowNumber), { printed: true });
  assert.strictEqual(w.hooks.printed.length, 1);
  app.dispose();
});

test('license: open build always active; official build trial → expired → key activates', async () => {
  const w = createWorld();
  const cfg = { LICENSE_SERVER_URL: w.URL, DEVELOPER_URL: 'https://t.me/hasn2mr', APP_NAME: 'x' };
  const app = w.mk({ config: cfg }); const m = app.methods;
  let s = await m.checkLicense();
  assert.strictEqual(s.status, 'trial'); assert.strictEqual(s.daysLeft, 30);
  w.gas.advance(31 * 86400000);
  s = await m.checkLicense();
  assert.strictEqual(s.status, 'expired');
  await assert.rejects(m.addVisit({ fullName: 'x', phone: '07700000000' }), /الفترة التجريبية/);
  const key = w.gas.call('adminCreateLicense', '4321', { label: 't', maxDevices: 1, usage: 'غير تجاري' }).key;
  await assert.rejects(m.activate('CM-WRONG-WRONG-WRONG'), /غير صحيح/);
  s = await m.activate(key);
  assert.strictEqual(s.status, 'active');
  app.dispose();
  const open = w.mk(); assert.strictEqual((await open.methods.licenseStatus()).status, 'active'); open.dispose();
});

test('export writes a JSON; openExternal is allow-listed', async () => {
  const w = createWorld();
  seedVisit(w, 'تصدير');
  const { app, m } = await linked(w);
  const r = await m.exportData();
  assert.ok(r.path.endsWith('.json'));
  const j = JSON.parse(w.hooks.saved[0].t);
  assert.strictEqual(j.tables.Patient_Records.length, 1);
  await assert.rejects(m.openExternal('http://evil.example'), /غير مسموح/);
  await m.openExternal('https://t.me/hasn2mr');
  assert.deepStrictEqual(w.hooks.external, ['https://t.me/hasn2mr']);
  app.dispose();
});

test('android pairing QR text', async () => {
  const w = createWorld();
  const { app, m } = await linked(w);
  const p = await m.androidPairing();
  assert.ok(/^cm1\|https:\/\/script\.google\.com\/.+\|[A-Z0-9]{4}-?[A-Z0-9]{4}$/.test(p.qrText), p.qrText);
  app.dispose();
});
