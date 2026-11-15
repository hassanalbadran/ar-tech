'use strict';
/* Playwright e2e of the desktop renderer through dev/http-bridge.js --demo (usage: node test/ui.test.js [port] [shotDir]) */
const { chromium } = require('playwright');
const port = process.argv[2] || 5177, shots = process.argv[3] || '';
let fails = 0;
const ok = function (c, m) { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
(async function () {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1360, height: 820 } });
  const errs = []; p.on('pageerror', function (e) { errs.push(e.message); }); p.on('console', function (m) { if (m.type() === 'error' && !/404/.test(m.text())) errs.push(m.text()); });
  const shot = function (n) { return shots ? p.screenshot({ path: shots + '/' + n + '.png' }) : null; };
  await p.goto('http://localhost:' + port + '/index.html');
  await p.waitForSelector('#splash', { timeout: 3000 }); ok(true, 'splash shown'); await p.waitForTimeout(1200); await shot('01-splash');
  await p.waitForSelector('#welcome:not([hidden])', { timeout: 15000 }); ok(true, 'welcome shown'); await shot('02-welcome');
  await p.waitForSelector('#app:not([hidden])', { timeout: 15000 }); ok(true, 'app shown');
  await p.waitForSelector('#view .kpis, #view .wiz', { timeout: 8000 });
  const wiz = await p.$('.wiz'); ok(true, 'view rendered' + (wiz ? ' (wizard)' : ''));
  if (wiz) { await shot('03-wizard'); await p.click('#wb #ws, #wb #wg').catch(function () {}); }
  for (let i = 0; i < 3 && await p.$('.wiz'); i++) { const s = await p.$('#ws'); if (s) await s.click(); else { await p.click('#wg'); } await p.waitForTimeout(400); }
  await p.waitForSelector('#view .kpis', { timeout: 8000 }); await shot('04-reviewers');
  ok(await p.$('#side') !== null, 'sidebar present');
  ok((await p.$$('#side .nav .nv')).length >= 8, 'sidebar has nav + action items');
  const w0 = await p.$eval('#side', function (e) { return e.getBoundingClientRect().width; }); ok(w0 < 100, 'sidebar collapsed (' + w0 + 'px)');
  await p.click('#stog'); await p.waitForTimeout(400); ok(await p.$eval('#side', function (e) { return e.getBoundingClientRect().width; }) > 200, 'sidebar expands'); await shot('05-side-open'); await p.click('#stog');
  for (const v of ['bookings', 'calendar', 'reviewers']) { await p.click('[data-go="' + v + '"]'); await p.waitForTimeout(500); await shot('06-' + v); ok(await p.$('#top h1') !== null, 'view ' + v + ' renders'); }
  await p.click('[data-go="a:income"]'); await p.waitForSelector('dialog[open]'); await p.waitForTimeout(500); await shot('07-income'); ok(await p.$('dialog[open] svg, dialog[open] canvas') !== null, 'income dialog opens'); await p.keyboard.press('Escape');
  await p.click('[data-go="a:booking"]'); await p.waitForSelector('dialog[open]'); await p.waitForTimeout(400); await shot('08-addbooking'); await p.keyboard.press('Escape');
  await p.click('[data-go="a:role"]'); await p.waitForTimeout(700); await shot('09-doctor'); ok(/عيادة الطبيب/.test(await p.textContent('#top h1')), 'doctor view');
  await p.click('[data-go="a:role"]'); await p.waitForTimeout(400);
  await p.click('[data-go="a:settings"]'); await p.waitForSelector('dialog[open] .stg'); await p.waitForTimeout(300); await shot('10-settings-look');
  for (const t of ['clinic', 'print', 'sec', 'sync', 'upd', 'lic', 'about']) { await p.click('.stg nav [data-t="' + t + '"]'); await p.waitForTimeout(400); await shot('11-settings-' + t); ok(await p.$eval('#sp', function (e) { return e.textContent.length > 20; }), 'settings tab ' + t); }
  await p.click('.stg nav [data-t="look"]'); await p.click('#sw [data-p="2"]'); await p.click('#smode [data-m="dark"]'); await p.waitForTimeout(300);
  ok(await p.evaluate(function () { return document.documentElement.dataset.palette === '2' && document.documentElement.dataset.mode === 'dark'; }), 'theme switch applies'); await shot('12-dark');
  ok(errs.length === 0, 'no console/page errors' + (errs.length ? ': ' + errs.slice(0, 5).join(' | ') : ''));
  await b.close(); console.log(fails ? fails + ' FAILED' : 'ALL OK'); process.exit(fails ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(2); });
