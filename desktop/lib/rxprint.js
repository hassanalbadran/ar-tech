'use strict';
/**
 * Prescription page HTML. The printed page contains ONLY the medicines (inside the calibrated safe area) and the notes
 * (inside the optional notes area), positioned in millimetres over the pre-printed paper. `preview:true` additionally draws
 * the uploaded template image behind the text and outlines the areas (never printed).
 */
const M = require('./mappers');

const PAPER = { A5: [148, 210], A4: [210, 297] };
const esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

function pageSize(p) {
  if (p.paperSize === 'custom') return [Math.max(50, Number(p.customWmm) || 148), Math.max(50, Number(p.customHmm) || 210)];
  return PAPER[p.paperSize] || PAPER.A5;
}
function area(a, size, def) {
  const v = a && typeof a === 'object' ? a : def;
  if (!v) return null;
  return { x: v.x * size[0], y: v.y * size[1], w: v.w * size[0], h: v.h * size[1] };
}
/** Largest font (pt) in [8,16] so that the estimated number of wrapped lines fits the area height. */
function fitFont(lines, wMm, hMm) {
  for (let pt = 16; pt >= 8; pt -= 0.5) {
    const cpl = Math.max(8, Math.floor(wMm / (pt * 0.3528 * 0.52)));
    let n = 0; lines.forEach(function (l) { n += Math.max(1, Math.ceil(l.length / cpl)); });
    if (n * pt * 0.3528 * 1.55 + lines.length * pt * 0.3528 * 0.35 <= hMm) return pt;
  }
  return 8;
}

function rxHtml(visit, printer, opts) {
  opts = opts || {};
  const p = printer || {}, tpl = p.template || {};
  const size = p.paperSize === 'custom' ? pageSize(p) : (tpl.widthMm && tpl.heightMm && opts.preview ? [tpl.widthMm, tpl.heightMm] : pageSize(p));
  const W = size[0], H = size[1];
  const safe = area(tpl.safeArea, size, { x: 0.1, y: 0.2, w: 0.8, h: 0.6 }), notes = area(tpl.notesArea, size, null);
  const items = (visit && visit.prescriptions || []).map(function (x, i) { return (i + 1) + '. ' + M.rxText(x); });
  const pt = fitFont(items, safe.w, safe.h);
  const box = function (a, cls) { return 'left:' + a.x.toFixed(2) + 'mm;top:' + a.y.toFixed(2) + 'mm;width:' + a.w.toFixed(2) + 'mm;height:' + a.h.toFixed(2) + 'mm'; };
  const note = visit && visit.notes ? String(visit.notes) : '';
  const ntFont = notes ? fitFont([note], notes.w, notes.h) : 10;
  return '<!doctype html><html lang="en" dir="ltr"><head><meta charset="utf-8"><title>Rx</title><style>' +
    '@page{size:' + W + 'mm ' + H + 'mm;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff}' +
    '.pg{position:relative;width:' + W + 'mm;height:' + H + 'mm;overflow:hidden;font-family:"Segoe UI",Arial,sans-serif;color:#000}' +
    '.bg{position:absolute;inset:0;width:100%;height:100%;object-fit:fill}' +
    '.a{position:absolute;overflow:hidden;line-height:1.55}' +
    '.rx div{margin:0 0 ' + (pt * 0.35 * 0.3528).toFixed(2) + 'mm;font-size:' + pt + 'pt;direction:ltr;text-align:left}' +
    '.nt{font-size:' + ntFont + 'pt;direction:auto;white-space:pre-wrap}' +
    (opts.preview ? '.o{outline:1px dashed #d33}.o2{outline:1px dashed #36c}' : '') +
    '</style></head><body><div class="pg">' +
    (opts.preview && tpl.image ? '<img class="bg" src="' + esc(tpl.image) + '" alt="">' : '') +
    '<div class="a rx' + (opts.preview ? ' o' : '') + '" style="' + box(safe) + '">' + items.map(function (l) { return '<div>' + esc(l) + '</div>'; }).join('') + '</div>' +
    (notes ? '<div class="a nt' + (opts.preview ? ' o2' : '') + '" style="' + box(notes) + '">' + esc(note) + '</div>' : '') +
    '</div></body></html>';
}

/** Test page: sample medicines + the safe-area outline. */
function testHtml(printer) {
  const demo = { prescriptions: [
    { name: 'Paracetamol', form: 'Tab', strength: '500', unit: 'mg', dose: '1x3', timing: 'after_meal', duration: 'd5' },
    { name: 'Omeprazole', form: 'Cap', strength: '20', unit: 'mg', dose: '1x1', timing: 'before_breakfast', duration: 'd14' },
    { name: 'Vitamin B12', form: 'Amp', strength: '1000', unit: 'mcg', dose: '1x1', timing: 'morning', duration: 'd30' }
  ], notes: 'Test page' };
  return rxHtml(demo, printer, { preview: false }).replace('</style>', '.a{outline:0.3mm dashed #000}</style>');
}

module.exports = { rxHtml, testHtml, pageSize, fitFont };
