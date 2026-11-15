'use strict';
/* Firewall / no-backdoor tests: the public surface, the access code, rate limits, size caps, lockouts, the security log. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path');
const { createGas } = require('../../tools/gas-emulator');

function fresh() {
  const g = createGas({ now: '2026-11-12T16:05:00+03:00' });
  g.props.set('ADMIN_PIN', '9999'); g.props.set('FINANCE_PIN', '4321');
  g.call('setupSheets'); return g;
}
const code = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');

test('public surface: only doGet, doPost, setupSheets and siteCall are callable from the internet', () => {
  const pub = [...code.matchAll(/^function ([A-Za-z0-9]+)\(/gm)].map(m => m[1]).sort();
  assert.deepStrictEqual(pub, ['doGet', 'doPost', 'setupSheets', 'siteCall']);
  assert.ok(!/\beval\s*\(|new Function\s*\(|UrlFetchApp|ScriptApp\.newTrigger/.test(code), 'no eval / outbound fetch / triggers');
});

test('door: only the allow-list; prototype and private names are refused', () => {
  const g = fresh();
  for (const bad of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'cmAuth_', 'cmSetConfig_', 'withLock_', 'doPost', 'setupSheets', '', 'getTodayQueueSnapshot_'])
    assert.throws(() => g.run('siteCall')(bad, [], ''), /غير مسموحة/, 'refused: ' + bad);
  assert.ok(g.call('getTodayQueueSnapshot').success !== false);
});

test('site access code (optional): locks the website, brute force is blocked, then it unlocks', () => {
  const g = fresh();
  assert.ok(g.call('getChangeRev') >= 0, 'open by default');
  g.props.set('SITE_ACCESS_CODE', 'sesame-77');
  g.setSiteCode('');
  assert.throws(() => g.call('getChangeRev'), /SITE_LOCKED/);
  g.setSiteCode('nope');
  assert.throws(() => g.call('getChangeRev'), /SITE_BADCODE/);
  for (let i = 0; i < 8; i++) { try { g.call('getChangeRev'); } catch (e) { /* counting */ } }
  g.setSiteCode('sesame-77');
  assert.throws(() => g.call('getChangeRev'), /SITE_TEMP_LOCK/, 'even the right code is refused while locked');
  g.advance(11 * 60 * 1000);
  assert.ok(g.call('getChangeRev') >= 0, 'unlocked after the lock window');
});

test('rate limit: the website cannot flood the sheet', () => {
  const g = fresh(); let blocked = 0;
  for (let i = 0; i < 420; i++) { try { g.call('getChangeRev'); } catch (e) { if (/حد الطلبات/.test(e.message)) blocked++; } }
  assert.ok(blocked >= 15, 'blocked ' + blocked);
  g.advance(61 * 1000); assert.ok(g.call('getChangeRev') >= 0, 'recovers next minute');
});

test('size caps: huge website arguments and huge POST bodies are rejected', () => {
  const g = fresh();
  assert.throws(() => g.call('searchPatientByNameOrPhone', 'a'.repeat(500000)), /كبير/);
  assert.throws(() => g.run('siteCall')('getChangeRev', [1, 2, 3, 4, 5, 6, 7], ''), /غير صالح/);
  const r = g.api({ action: 'ping', pad: 'x'.repeat(450000) });
  assert.strictEqual(r.ok, false); assert.match(r.error, /كبير/);
  assert.strictEqual(g.api({ action: 'ping' }).ok, true);
  const out = g.run('doPost')({ postData: { contents: '[1,2]' } }); assert.ok(JSON.parse(out.getContent()).ok !== undefined, 'array body does not crash');
});

test('pairing codes cannot be brute-forced', () => {
  const g = fresh();
  const c = g.call('adminCreatePairingCode', '9999');
  for (let i = 0; i < 8; i++) assert.strictEqual(g.api({ action: 'pair', code: 'AAAA-AAA' + i }).ok, false);
  const r = g.api({ action: 'pair', code: c.code });
  assert.strictEqual(r.ok, false); assert.strictEqual(r.code, 'RATE', 'locked even for the real code');
  g.advance(11 * 60 * 1000);
  const c2 = g.call('adminCreatePairingCode', '9999');
  assert.ok(g.api({ action: 'pair', code: c2.code }).ok, 'works again after the lock window');
});

test('per-device rate limit and revoked/unknown tokens', () => {
  const g = fresh();
  const c = g.call('adminCreatePairingCode', '9999'), token = g.api({ action: 'pair', code: c.code }).data.token;
  let limited = 0; for (let i = 0; i < 320; i++) if (g.api({ action: 'rev', token }).code === 'RATE') limited++;
  assert.ok(limited >= 15, 'limited ' + limited);
  for (const t of ['__proto__', '0'.repeat(64), token.slice(0, 31), token + 'x']) assert.strictEqual(g.api({ action: 'rev', token: t }).code, t === token + 'x' ? 'AUTH' : 'AUTH');
  assert.strictEqual(g.api({ action: 'call', token, fn: '__proto__', args: [] }).ok, false);
  assert.strictEqual(g.api({ action: 'call', token, fn: 'constructor', args: [] }).ok, false);
  assert.strictEqual(g.api({ action: 'call', token, fn: 'cmSetConfig_', args: [] }).ok, false);
});

test('license endpoint: wrong keys lock, new-device rows are capped', () => {
  const g = fresh();
  for (let i = 0; i < 12; i++) g.api({ action: 'licenseActivate', deviceId: 'DEVICE-ABCD' + i, key: 'CM-AAAA-BBBB-C' + i });
  assert.strictEqual(g.api({ action: 'licenseActivate', deviceId: 'DEVICE-ABCD99', key: 'CM-AAAA-BBBB-CCCC' }).code, 'RATE');
  const h = fresh(); let cap = 0;
  for (let i = 0; i < 45; i++) if (h.api({ action: 'licenseCheck', deviceId: 'NEWDEV-' + String(i).padStart(4, '0') }).code === 'RATE') cap++;
  assert.ok(cap >= 4, 'capped ' + cap);
});

test('security log: records attacks, never records secrets; admin overview shows flags', () => {
  const g = fresh();
  g.props.set('SITE_ACCESS_CODE', 'sesame-77'); g.setSiteCode('wrong-code-xyz');
  try { g.call('getChangeRev'); } catch (e) { /* logged */ }
  g.api({ action: 'rev', token: 'secret-token-' + 'z'.repeat(40) });
  g.api({ action: 'pair', code: 'HIDD-ENCD' });
  g.api({ action: 'nope', token: 'z'.repeat(64) });
  g.setSiteCode('sesame-77');
  const o = g.call('adminOverview', '9999');
  assert.strictEqual(o.security.siteGateOn, true); assert.strictEqual(o.security.defaultFinancePin, false);
  const log = JSON.stringify(o.security.log);
  assert.ok(o.security.log.length >= 3, log);
  for (const secret of ['wrong-code-xyz', 'sesame-77', 'HIDDENCD', 'HIDD-ENCD', 'secret-token', 'zzzzzzzz', '9999', '4321']) assert.ok(log.indexOf(secret) === -1, 'log leaks ' + secret);
  const h = fresh(); h.props.delete('FINANCE_PIN');
  assert.strictEqual(h.call('adminOverview', '9999').security.defaultFinancePin, true, 'warns when the repo default finance PIN is still in use');
});

test('finance PIN lock, setupSheets throttle', () => {
  const g = fresh();
  for (let i = 0; i < 5; i++) assert.throws(() => g.call('getClinicDashboardStats', '0000'), /غير صحيح/);
  assert.throws(() => g.call('getClinicDashboardStats', '4321'), /محاولات كثيرة/);
  const h = fresh(); let threw = 0; for (let i = 0; i < 8; i++) { try { h.call('setupSheets'); } catch (e) { threw++; } }
  assert.ok(threw >= 3);
});
