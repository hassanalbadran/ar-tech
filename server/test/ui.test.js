'use strict';
/* End-to-end check of server/Index.html in headless Chromium against the real Code.gs (emulated).  node server/test/ui.test.js */
const assert = require('assert');
const path = require('path');
const { chromium } = require('playwright');
const { start } = require('../../tools/dev-server');
const SHOT = process.env.SHOT_DIR || '/tmp';

(async () => {
  const { gas, srv, url } = await start({ now: '2026-11-12T16:05:00+03:00' });
  gas.props.set('ADMIN_PIN', '4321');
  const br = await chromium.launch();
  const pg = await br.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  const ok = n => console.log('  ✓ ' + n);

  await pg.goto(url); await pg.waitForSelector('#mn:not([hidden])', { timeout: 15000 }); ok('page boots');

  // --- booking dialog
  await pg.click('[data-a=nb]'); await pg.waitForSelector('.slg .sl');
  const days = await pg.$$eval('.dys .cp', a => a.length); assert.strictEqual(days, 5); ok('5 day chips (today + 4)');
  assert.strictEqual(await pg.$eval('.dys .cp.on', e => e.textContent.includes('اليوم')), true); ok('today selected by default');
  const first = await pg.$eval('.slg .sl', e => ({ d: e.disabled, t: e.textContent })); assert.strictEqual(first.d, true); ok('15:30 is past → disabled');
  await pg.fill('#bn', 'مريض تجريبي'); await pg.fill('#bp', '7701234567');
  await pg.click('.sl[data-t="17:00"]'); await pg.click('#bsv');
  await pg.waitForFunction(() => document.querySelector('#bc').textContent === '1'); ok('booking saved, counter 1');
  assert.ok(gas.rows('Bookings').some(r => String(r[3]) === '07701234567')); ok('phone normalised to 07… in the sheet');

  // fill the 17:00 hour (3 more) → hour grey
  for (const [t, n] of [['17:00', 'a'], ['17:30', 'b'], ['17:30', 'c']]) gas.call('addNewBooking', { patientName: 'x' + n, phone: '07801111111', date: '2026-11-12', time: t });
  await pg.click('[data-a=nb]'); await pg.waitForSelector('.slg .sl');
  const full = await pg.$$eval('.sl[data-t="17:00"],.sl[data-t="17:30"]', a => a.map(e => e.disabled)); assert.deepStrictEqual(full, [true, true]); ok('hour with 4 bookings → both slots grey');
  const ok18 = await pg.$eval('.sl[data-t="18:00"]', e => e.disabled); assert.strictEqual(ok18, false); ok('next hour still open');
  await pg.screenshot({ path: path.join(SHOT, 'ui-booking.png') });

  // another day + bad phone
  await pg.click('.dys .cp:nth-child(2)'); await pg.waitForSelector('.dys .cp:nth-child(2).on');
  await pg.fill('#bn', 'مريض الغد'); await pg.fill('#bp', '123');
  const fri = await pg.$$eval('.sl', a => a.map(e => e.dataset.t)); assert.strictEqual(fri[0], '08:00'); assert.strictEqual(fri[fri.length - 1], '11:30'); await pg.click('.sl[data-t="09:00"]'); await pg.click('#bsv');
  await pg.waitForFunction(() => [...document.querySelectorAll('#ts .t')].some(e => e.textContent.includes('رقم الهاتف غير صحيح'))); ok('bad phone rejected client-side');
  await pg.fill('#bp', '0770 555 6677'); await pg.click('#bsv');
  await pg.waitForFunction(() => document.querySelector('#uc').textContent === '1'); ok('next-day booking shows in "الأيام القادمة"');
  await pg.screenshot({ path: path.join(SHOT, 'ui-secretary.png') });

  // --- doctor search: free vs paid raise
  gas.setNow('2026-11-05T16:00:00+03:00');
  const first1 = gas.call('addNewVisitOrPatient', { fullName: 'علي حسن', age: '40', gender: 'ذكر', phone: '07712345678', address: 'الحلة', escortsCount: '', notes: '', paidConfirmation: true });
  const pid = first1.patient.patientId;
  gas.setNow('2026-11-12T16:10:00+03:00');
  await pg.click('.tab[data-v=doc]'); await pg.fill('#dq', 'علي'); await pg.waitForSelector('#drs .rr');
  await pg.click('#drs [data-a=dvf]'); await pg.waitForFunction(() => document.querySelector('#qc').textContent === '1');
  const rows = gas.rows('Patient_Records'); const last = rows[rows.length - 1];
  assert.ok(String(last.join('|')).includes('علي حسن')); ok('"رفع الاسم" adds today\'s visit');
  assert.ok(gas.rows('Financials').filter(r => String(r[2]).indexOf('Consultation') > -1).length === 1); ok('free raise → no new consultation fee (only the old one)');
  // paid raise for a second patient
  gas.call('addNewVisitOrPatient', { fullName: 'سارة كريم', age: '30', gender: 'أنثى', phone: '07722223333', address: 'x', escortsCount: '', notes: '', paidConfirmation: true });
  await pg.fill('#dq', 'سارة'); await pg.waitForSelector('#drs .rr');
  assert.ok((await pg.$$eval('#drs [data-a=dvp]', a => a.length)) === 1); ok('"كشفية" button present');

  await pg.fill('#dq', ''); await pg.waitForFunction(() => !document.querySelector('#drs').innerHTML);
  // --- Rx dialog grid
  await pg.click('#qu .q'); await pg.waitForSelector('[data-a=rxn]'); await pg.click('[data-a=rxn]'); await pg.waitForSelector('.rxgr');
  const box = async s => pg.$eval(s, e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  const st = await box('[data-rf=strength]'), un = await box('#un'), fm = await box('[data-rf=form]');
  assert.ok(un.w > 20 && un.h > 20); assert.ok(Math.abs(un.y - st.y) < 12, 'unit on the same row as strength'); assert.ok(un.x + un.w <= st.x + 1 || st.x + st.w <= un.x + 1, 'unit does not overlap strength'); ok('unit is its own cell beside the strength box (no overlap)');
  const dose = await box('.cp[data-g=dose]'); assert.ok(dose.w > 0 && dose.y > st.y); ok('dose chips visible below');
  await pg.screenshot({ path: path.join(SHOT, 'ui-rx.png') });
  assert.ok((await pg.$$eval('svg use[href="#i-rx"]', a => a.length)) >= 1); ok('Rx icon used');
  await pg.keyboard.press('Escape');

  // --- admin panel
  await pg.click('.tab[data-v=sec]');
  await pg.evaluate(() => A.adm()); await pg.fill('#apin', '9999'); await pg.click('[data-a=adk]');
  await pg.waitForFunction(() => document.querySelector('#ape') && document.querySelector('#ape').textContent.length > 0); ok('wrong admin PIN rejected');
  await pg.fill('#apin', '4321'); await pg.click('[data-a=adk]'); await pg.waitForSelector('form[data-f2=ak]');
  await pg.fill('[name=label]', 'اختبار'); await pg.selectOption('[name=usage]', 'غير تجاري'); await pg.click('form[data-f2=ak] .btn');
  await pg.waitForSelector('#nk code'); const key = await pg.$eval('#nk code', e => e.textContent); assert.ok(/^CM-/.test(key)); ok('license key created: ' + key);
  await pg.screenshot({ path: path.join(SHOT, 'ui-admin.png') });

  assert.deepStrictEqual(errs, [], 'console/page errors: ' + errs.join(' | '));
  await br.close(); srv.close(); console.log('UI OK'); process.exit(0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
