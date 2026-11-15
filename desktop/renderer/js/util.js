'use strict';
/* Shared helpers: DOM, formatting, icons, dialogs, toasts, context menu, PIN pad. Exposes window.U */
(function () {
  const U = {};
  const ICONS = {
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><circle cx="17.5" cy="9" r="2.5"/><path d="M17 14.3c2.3.2 3.9 1.8 4.5 4.7"/>',
    booking: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17M9 15l2 2 4-4"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17"/><circle cx="8.5" cy="14.5" r=".7"/><circle cx="12" cy="14.5" r=".7"/><circle cx="15.5" cy="14.5" r=".7"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeoff: '<path d="M3 3l18 18M10.6 5.2A9.9 9.9 0 0 1 12 5c6 0 9.5 7 9.5 7a15 15 0 0 1-3.1 3.9M6.6 6.7C3.8 8.5 2.5 12 2.5 12s3.5 7 9.5 7a9.6 9.6 0 0 0 4.2-1"/>',
    addcal: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17M12 13v5M9.5 15.5h5"/>',
    surgery: '<path d="M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7z"/>',
    wallet: '<path d="M3.5 7.5A2.5 2.5 0 0 1 6 5h12.5v3"/><rect x="3.5" y="8" width="17" height="11.5" rx="3"/><path d="M16 13.5h2.5"/>',
    sliders: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2.2"/><circle cx="8" cy="17" r="2.2"/>',
    doctor: '<path d="M6 3v6a4 4 0 0 0 8 0V3M10 13v2a4.5 4.5 0 0 0 9 0v-1"/><circle cx="19" cy="12" r="2"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>', check: '<path d="m5 12.5 5 5L20 7"/>', search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', chl: '<path d="m15 5-7 7 7 7"/>', chr: '<path d="m9 5 7 7-7 7"/>',
    phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A15 15 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
    printer: '<path d="M7 9V3.5h10V9M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"/><rect x="7" y="14" width="10" height="7" rx="1"/>',
    panel: '<rect x="3" y="4.5" width="18" height="15" rx="3"/><path d="M9 4.5v15"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="3"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
    file: '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
    trash: '<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/>', edit: '<path d="M4 20l1-4L16.5 4.5a2 2 0 0 1 3 3L8 19z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>',
    moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/>', refresh: '<path d="M20 12a8 8 0 1 1-2.4-5.7M20 4v5h-5"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1"/>',
    qr: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><path d="M14 14h2.5v2.5H14zM18 18h2.5v2.5H18zM14 18.5v2M20.5 14v2"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5M4.5 15v4.5h15V15"/>', download: '<path d="M12 4v12M7 11l5 5 5-5M4.5 15v4.5h15V15"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    userplus: '<circle cx="10" cy="8" r="3.8"/><path d="M3 20c.6-3.8 3.4-6 7-6s6.4 2.2 7 6M19 7v6M16 10h6"/>',
    palette: '<path d="M12 3.5a8.5 8.5 0 0 0 0 17c1.4 0 2-.9 2-1.8 0-1.4-1.2-1.4-1.2-2.6 0-1 .8-1.6 1.8-1.6H17a3.5 3.5 0 0 0 3.5-3.5C20.5 6.7 16.7 3.5 12 3.5z"/><circle cx="8" cy="11" r="1"/><circle cx="12" cy="7.5" r="1"/><circle cx="16" cy="10" r="1"/>',
    shield: '<path d="M12 3l7.5 3v5.5c0 4.5-3 8-7.5 9.5-4.5-1.5-7.5-5-7.5-9.5V6z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
    wifioff: '<path d="M3 3l18 18M5 10a10 10 0 0 1 4-2.3M19 10a10 10 0 0 0-6.3-3.2M8 14a6 6 0 0 1 2.2-1.3M16 14a6 6 0 0 0-1.5-1.1"/><circle cx="12" cy="18" r=".8"/>',
    star: '<path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8 6.8 19.6l1-5.8L3.5 9.7l5.9-.8z"/>',
    rx: '<text x="12" y="17.5" text-anchor="middle" font-size="15.5" font-weight="800" font-style="italic" font-family="Georgia,serif" fill="currentColor" stroke="none">Rx</text>',
    play: '<path d="M8 5.5v13l11-6.5z"/>', trend: '<path d="M3.5 17 9 11.5l4 4 7-8M15 7.5h5.5V13"/>', pin: '<path d="M12 21s-6.5-5.4-6.5-10.5a6.5 6.5 0 0 1 13 0C18.5 15.6 12 21 12 21z"/><circle cx="12" cy="10.5" r="2.3"/>',
    undo: '<path d="M4 9h11a5 5 0 0 1 0 10H8M4 9l4-4M4 9l4 4"/>', alert: '<path d="M12 4 2.8 19.5h18.4zM12 10v4.5M12 17.2v.3"/>'
  };
  U.ICONS = ICONS;
  U.ic = function (n, c) { return '<svg class="ic ' + (c || '') + '"><use href="#i-' + n + '"/></svg>'; };
  U.installSprite = function () {
    document.getElementById('sprite').innerHTML = '<svg width="0" height="0" style="position:absolute"><defs>' + Object.keys(ICONS).map(function (k) { return '<symbol id="i-' + k + '" viewBox="0 0 24 24">' + ICONS[k] + '</symbol>'; }).join('') + '</defs></svg>';
  };

  U.$ = function (s, r) { return (r || document).querySelector(s); };
  U.$$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  const EM = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  U.E = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return EM[c]; }); };
  U.money = function (n) { return Math.round(Number(n) || 0).toLocaleString('en-US'); };
  U.WD = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  U.MONTHS = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'];
  U.dObj = function (ymd) { return new Date(ymd + 'T12:00:00'); };
  U.dayName = function (ymd) { return U.WD[U.dObj(ymd).getDay()]; };
  U.dm = function (ymd) { const d = U.dObj(ymd); return d.getDate() + '/' + (d.getMonth() + 1); };
  U.longDate = function (ymd) { const d = U.dObj(ymd); return U.WD[d.getDay()] + ' ' + d.getDate() + ' ' + U.MONTHS[d.getMonth()] + ' ' + d.getFullYear(); };
  U.T12 = function (t) { const p = String(t).split(':').map(Number); return ((p[0] % 12) || 12) + ':' + String(p[1]).padStart(2, '0') + ' ' + (p[0] < 12 ? 'ص' : 'م'); };
  U.ageText = function (a) { if (a === '' || a == null) return '—'; const m = String(a).match(/^(\d+)([MD])$/i); return m ? m[1] + (m[2].toUpperCase() === 'M' ? ' شهر' : ' يوم') : a + ' سنة'; };
  U.ageParts = function (a) { const m = String(a == null ? '' : a).match(/^(\d+)([MD])?$/i); return m ? { n: m[1], u: (m[2] || 'Y').toUpperCase() } : { n: '', u: 'Y' }; };
  U.initial = function (name) { return String(name || '?').trim().charAt(0) || '?'; };
  U.debounce = function (fn, ms) { let t; return function () { const a = arguments, s = this; clearTimeout(t); t = setTimeout(function () { fn.apply(s, a); }, ms); }; };
  U.digits = function (s) { return window.ClinicCore ? ClinicCore.digits(s) : String(s == null ? '' : s); };
  U.sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  U.greeting = function () { return new Date().getHours() < 12 ? 'صباح الخير' : 'مساء الخير'; };

  /* toasts */
  U.toast = function (text, kind, ms) {
    const el = document.createElement('div'); el.className = 'toast ' + (kind || '');
    el.innerHTML = '<span>' + U.E(text) + '</span>';
    document.getElementById('toasts').append(el);
    setTimeout(function () { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; setTimeout(function () { el.remove(); }, 320); }, ms || (kind === 'err' ? 6500 : 3200));
  };
  /** Run an async action with a button locked; shows the Arabic error as a toast. */
  U.act = async function (btn, fn) {
    if (btn) btn.disabled = true;
    try { return await fn(); } catch (e) { U.toast(e.message || String(e), 'err'); return undefined; } finally { if (btn) btn.disabled = false; }
  };

  /* dialog */
  U.dlg = function (title, body, opts) {
    opts = opts || {};
    const d = document.getElementById('dlg');
    d.className = opts.size || '';
    d.innerHTML = '<div class="dh"><h3>' + (opts.icon ? U.ic(opts.icon) : '') + U.E(title) + '</h3><button class="ib" data-close aria-label="إغلاق">' + U.ic('x') + '</button></div><div class="db">' + body + '</div>';
    d.querySelector('[data-close]').onclick = function () { U.closeDlg(); };
    d.onclick = function (e) { if (e.target === d) U.closeDlg(); };
    d.oncancel = function () { if (opts.onClose) opts.onClose(); };
    U._onClose = opts.onClose || null;
    if (!d.open) d.showModal();
    return d;
  };
  U.closeDlg = function () { const d = document.getElementById('dlg'); if (d.open) d.close(); if (U._onClose) { const f = U._onClose; U._onClose = null; f(); } };
  U.isDlgOpen = function () { return document.getElementById('dlg').open; };

  /* PIN pad → Promise<string|null> */
  U.pin = function (title, hint) {
    return new Promise(function (resolve) {
      let v = '', done = false;
      const body = '<p class="mut" style="margin:12px 0 0;text-align:center">' + U.E(hint || '') + '</p><div class="dots">' + [0, 1, 2, 3].map(function () { return '<i></i>'; }).join('') + '</div><div class="pin">' +
        [1, 2, 3, 4, 5, 6, 7, 8, 9].map(function (n) { return '<button data-n="' + n + '">' + n + '</button>'; }).join('') + '<button data-n="del">' + U.ic('chl') + '</button><button data-n="0">0</button><button data-n="ok">' + U.ic('check') + '</button></div>';
      const d = U.dlg(title, body, { icon: 'lock', onClose: function () { if (!done) { done = true; window.removeEventListener('keydown', key, true); resolve(null); } } });
      const paint = function () { U.$$('.dots i', d).forEach(function (el, i) { el.classList.toggle('f', i < v.length); }); };
      const fin = function () { if (v.length !== 4 || done) return; done = true; window.removeEventListener('keydown', key, true); U._onClose = null; d.close(); resolve(v); };
      const press = function (n) { if (n === 'del') v = v.slice(0, -1); else if (n === 'ok') return fin(); else if (v.length < 4) v += n; paint(); if (v.length === 4) setTimeout(fin, 120); };
      const key = function (e) { if (!d.open) return; if (/^[0-9]$/.test(e.key)) { press(e.key); e.preventDefault(); } else if (e.key === 'Backspace') { press('del'); e.preventDefault(); } else if (e.key === 'Enter') { fin(); e.preventDefault(); } };
      window.addEventListener('keydown', key, true);
      d.querySelector('.pin').onclick = function (e) { const b = e.target.closest('button'); if (b) press(b.dataset.n); };
    });
  };
  U.confirm = function (title, text, okLabel, kind) {
    return new Promise(function (resolve) {
      let done = false;
      const d = U.dlg(title, '<p style="margin:14px 0 18px">' + U.E(text) + '</p><div class="row" style="justify-content:flex-end"><button class="btn sec" data-r="0">إلغاء</button><button class="btn ' + (kind || '') + '" data-r="1">' + U.E(okLabel || 'تأكيد') + '</button></div>',
        { onClose: function () { if (!done) { done = true; resolve(false); } } });
      d.querySelectorAll('[data-r]').forEach(function (b) { b.onclick = function () { done = true; U._onClose = null; d.close(); resolve(b.dataset.r === '1'); }; });
    });
  };

  /* context menu */
  U.ctx = function (x, y, items) {
    U.closeCtx();
    const m = document.createElement('div'); m.className = 'ctxm'; m.id = 'ctxm';
    m.innerHTML = items.map(function (it, i) { return it === '-' ? '<hr style="border:0;height:1px;background:var(--line);margin:4px 6px">' : '<button data-i="' + i + '">' + U.ic(it.icon || 'chl') + '<span>' + U.E(it.label) + '</span></button>'; }).join('');
    document.body.append(m);
    const r = m.getBoundingClientRect();
    m.style.left = Math.max(8, Math.min(x, innerWidth - r.width - 8)) + 'px'; m.style.top = Math.max(8, Math.min(y, innerHeight - r.height - 8)) + 'px';
    m.onclick = function (e) { const b = e.target.closest('button'); if (!b) return; const it = items[+b.dataset.i]; U.closeCtx(); if (it && it.run) it.run(); };
    setTimeout(function () { window.addEventListener('mousedown', U.closeCtx, { once: true, capture: true }); }, 0);
  };
  U.closeCtx = function () { const m = document.getElementById('ctxm'); if (m) m.remove(); };
  window.addEventListener('blur', function () { U.closeCtx(); });

  /* suggestions dropdown for name inputs: attach(input, onPick) */
  U.suggest = function (input, onPick) {
    const wrap = input.parentElement; wrap.classList.add('rel');
    const box = document.createElement('div'); box.className = 'sug'; box.hidden = true; wrap.append(box);
    let list = [], seq = 0;
    const run = U.debounce(async function () {
      const q = input.value.trim(), my = ++seq;
      if (q.length < 2) { box.hidden = true; return; }
      try { const r = await cm.search(q); if (my !== seq) return; list = r.slice(0, 6); } catch (e) { list = []; }
      box.hidden = !list.length;
      box.innerHTML = list.map(function (p, i) { return '<button type="button" data-i="' + i + '"><b>' + U.E(p.fullName) + '</b><small>' + U.E(p.phone || '') + '</small></button>'; }).join('');
    }, 180);
    input.addEventListener('input', run);
    box.addEventListener('click', function (e) { const b = e.target.closest('button'); if (!b) return; box.hidden = true; onPick(list[+b.dataset.i]); });
    document.addEventListener('click', function (e) { if (!wrap.contains(e.target)) box.hidden = true; });
  };

  window.U = U;
})();
