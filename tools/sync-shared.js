#!/usr/bin/env node
/* Copies shared/core.js (the single source of truth for business rules) into every place that needs it.
 *   node tools/sync-shared.js          -> write copies
 *   node tools/sync-shared.js --check  -> exit 1 if any copy differs (used by CI)
 */
'use strict';
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'shared/core.js'), 'utf8');
const copies = ['desktop/lib/core.js', 'desktop/renderer/core.js', 'android/app/src/main/assets/app/core.js'];
const check = process.argv.includes('--check');
let bad = 0;

copies.forEach(rel => {
  const p = path.join(root, rel);
  const cur = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
  if (cur === src) return;
  if (check) { console.error('OUT OF SYNC: ' + rel); bad++; return; }
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, src);
  console.log('wrote ' + rel);
});

// UI building blocks shared by the desktop and Android web UIs (design tokens, components, helpers, splash animation)
const uiCopies = [['desktop/renderer/css/theme.css', 'android/app/src/main/assets/app/css/theme.css'], ['desktop/renderer/css/app.css', 'android/app/src/main/assets/app/css/app.css'],
  ['desktop/renderer/js/util.js', 'android/app/src/main/assets/app/js/util.js'], ['desktop/renderer/js/splash.js', 'android/app/src/main/assets/app/js/splash.js']];
uiCopies.forEach(([from, to]) => {
  const a = fs.readFileSync(path.join(root, from), 'utf8'), p = path.join(root, to);
  const cur = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
  if (cur === a) return;
  if (check) { console.error('OUT OF SYNC: ' + to); bad++; return; }
  fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, a); console.log('wrote ' + to);
});

// Apps Script: the same text lives between two markers inside server/Code.gs
const gs = path.join(root, 'server/Code.gs');
const B = '// <<RULES-BEGIN>>', E = '// <<RULES-END>>';
let code = fs.readFileSync(gs, 'utf8');
const i = code.indexOf(B), j = code.indexOf(E);
if (i === -1 || j === -1) {
  console.log('server/Code.gs has no RULES markers yet (skipped)');
} else {
  const body = src.replace(/^\/\*![\s\S]*?\*\/\n/, '').replace(/\nif \(typeof module[\s\S]*$/, '\n');
  const next = code.slice(0, i + B.length) + '\n' + body + code.slice(j);
  if (next !== code) {
    if (check) { console.error('OUT OF SYNC: server/Code.gs rules block'); bad++; }
    else { fs.writeFileSync(gs, next); console.log('updated rules block in server/Code.gs'); }
  }
}
if (check && bad) process.exit(1);
if (check) console.log('all copies in sync');
