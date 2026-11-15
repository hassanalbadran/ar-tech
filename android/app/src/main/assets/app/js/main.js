'use strict';
/* Android UI controller: boot → splash → welcome → tabs (الرئيسية / المراجعين / الحجوزات / المالية / المزيد), pairing, license gate. */
(function () {
  const E = U.E, ic = U.ic, $ = U.$, N = window.N, Api = window.Api, Lic = window.Lic, C = window.CM_CONFIG || {};
  const DEF = { palette: 1, mode: 'system', fontScale: 1, contrast: 'normal', notify: true };
  const TABS = [['home', 'trend', 'الرئيسية'], ['patients', 'users', 'المراجعين'], ['bookings', 'booking', 'الحجوزات'], ['finance', 'wallet', 'المالية'], ['more', 'sliders', 'المزيد']];
  const VST = { waiting: ['بانتظار', 'warn'], closed: ['أُغلق', ''], finished: ['منتهي', 'ok'], postponed: ['مؤجل', 'br'] };
  const TYPE = { Consultation: 'كشفيات', ExtraFee: 'رسوم إضافية', Surgery: 'عمليات', Expense: 'مصاريف', Refund: 'إرجاعات', Other: 'أخرى' };
  const COLORS = ['var(--brand)', 'var(--accent)', '#7b61d1', 'var(--bad)', '#d98a12', '#8a97a1'];
  const S = { tab: 'home', set: Object.assign({}, DEF, N.json('cm.settings', {})), today: '', snap: null, q: '' };
  const A = window.A = S;
  const todayLocal = function () { return new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10); };
  const cfg = function () { return Api.cfg() || {}; };
  const pin = function () { return N.secGet('pin') || ''; };
  const money = function (n) { return U.money(Number(n) || 0); };
  const hm12 = function (t) { const p = String(t).split(':'), h = +p[0]; return ((h % 12) || 12) + ':' + p[1] + ' ' + (h >= 12 ? 'م' : 'ص'); };

  /* ---------- theme ---------- */
  function applyTheme() {
    const t = S.set, h = document.documentElement, dark = t.mode === 'system' ? matchMedia('(prefers-color-scheme: dark)').matches : t.mode === 'dark';
    h.dataset.palette = t.palette; h.dataset.mode = dark ? 'dark' : 'light'; h.dataset.contrast = t.contrast; h.style.setProperty('--fs', t.fontScale);
    const bg = getComputedStyle(h).getPropertyValue('--bg').trim() || '#e8eef1'; N.setBars(bg, !dark);
  }
  function saveSet(patch) { Object.assign(S.set, patch); N.setJson('cm.settings', S.set); applyTheme(); }

  /* ---------- helpers ---------- */
  function countUp(root) {
    U.$$('[data-n]', root || document).forEach(function (el) {
      const to = Number(el.dataset.n) || 0, t0 = performance.now(), dur = 700; if (!to) { el.textContent = el.dataset.f ? money(0) : '0'; return; }
      (function step(t) { const k = Math.min(1, (t - t0) / dur), v = Math.round(to * (1 - Math.pow(1 - k, 3))); el.textContent = el.dataset.f ? money(v) : String(v); if (k < 1) requestAnimationFrame(step); })(t0);
    });
  }
  const kpi = function (cls, icon, label, val, fmt) { return '<div class="kpi ' + cls + '">' + ic(icon) + '<small>' + E(label) + '</small><b data-n="' + (Number(val) || 0) + '"' + (fmt ? ' data-f="1"' : '') + '>0</b></div>'; };
  const empty = function (icon, text) { return '<div class="em">' + ic(icon) + '<p>' + E(text) + '</p></div>'; };
  const skeleton = function (n) { return new Array(n || 3).fill('<div class="sk" style="margin-bottom:12px"></div>').join(''); };
  const offlineChip = function (on) { const c = $('#conn'); if (c) { c.className = 'chip ' + (on ? 'warn' : 'ok'); c.innerHTML = on ? ic('wifioff') + ' بلا اتصال' : ''; c.hidden = !on; } };
  Api.netState = function (off) { offlineChip(off); };
  const vchip = function (s) { const v = VST[s] || VST.waiting; return '<span class="chip ' + v[1] + '">' + v[0] + '</span>'; };

  function bars(series, key) {
    const max = Math.max.apply(null, series.map(function (d) { return Math.max(0, d[key]); }).concat([1]));
    return '<div class="bars">' + series.map(function (d, i) { const h = Math.max(3, Math.round(Math.max(0, d[key]) / max * 100)); return '<button class="bar" data-i="' + i + '" style="--h:' + h + '%;--d:' + (i * 30) + 'ms"><i></i><small>' + Number(d.date.slice(8)) + '</small></button>'; }).join('') + '</div><p class="mut" id="bartip" style="text-align:center;font-size:.82rem;min-height:1.4em;margin-top:6px">اضغط على عمود لعرض اليوم</p>';
  }
  function wireBars(root, series) {
    const w = $('.bars', root); if (!w) return;
    requestAnimationFrame(function () { requestAnimationFrame(function () { w.classList.add('go'); }); });
    w.onclick = function (e) { const b = e.target.closest('.bar'); if (!b) return; const d = series[+b.dataset.i]; U.$$('.bar', w).forEach(function (x) { x.classList.toggle('on', x === b); }); $('#bartip', root).innerHTML = '<b>' + U.longDate(d.date) + '</b> — دخل ' + money(d.income) + ' · مصاريف ' + money(d.expenses) + (d.refunds ? ' · إرجاع ' + money(d.refunds) : '') + ' · صافي <b>' + money(d.net) + '</b>'; };
  }
  function donut(map) {
    const keys = Object.keys(map).filter(function (k) { return map[k] > 0; }), tot = keys.reduce(function (a, k) { return a + map[k]; }, 0), R = 90, Cc = 2 * Math.PI * R; let off = 0;
    const segs = keys.map(function (k, i) { const len = tot ? map[k] / tot * Cc : 0, el = '<circle cx="110" cy="110" r="' + R + '" stroke="' + COLORS[i % COLORS.length] + '" stroke-dasharray="' + Math.max(0, len - 3) + ' ' + (Cc - Math.max(0, len - 3)) + '" stroke-dashoffset="' + (-off) + '"/>'; off += len; return el; }).join('');
    return '<div class="donut" style="width:210px;height:210px"><svg viewBox="0 0 220 220">' + (tot ? segs : '<circle cx="110" cy="110" r="' + R + '" stroke="var(--line)"/>') + '</svg><div class="mid"><small>الإجمالي</small><b>' + money(tot) + '</b></div></div>' +
      '<div class="lg2">' + keys.map(function (k, i) { return '<div class="row" style="padding:6px 12px"><i style="width:12px;height:12px;border-radius:4px;background:' + COLORS[i % COLORS.length] + '"></i><span style="margin-inline-start:10px">' + E(TYPE[k] || k) + '</span><b style="margin-inline-start:auto">' + money(map[k]) + '</b></div>'; }).join('') + '</div>';
  }

  /* ---------- shell ---------- */
  function setTop(title, sub) {
    const t = $('#top'), name = cfg().doctorName || '';
    t.innerHTML = '<div class="mt-t"><small>' + E(sub || (S.tab === 'home' ? U.greeting() : '')) + '</small><b>' + E(title || (name ? 'د. ' + name.replace(/^د\.?\s*/, '') : C.APP_NAME)) + '</b></div><span class="sp"></span><span id="conn" class="chip" hidden></span><button class="ib" id="rf" aria-label="تحديث">' + ic('refresh') + '</button>';
    $('#rf').onclick = function (e) { e.currentTarget.classList.add('spin'); refresh().finally(function () { const b = $('#rf'); if (b) b.classList.remove('spin'); }); };
  }
  function renderTabs() {
    $('#tabs').innerHTML = TABS.map(function (t) { return '<button data-t="' + t[0] + '" class="' + (S.tab === t[0] ? 'on' : '') + '"><span class="pill">' + ic(t[1]) + '</span><small>' + t[2] + '</small></button>'; }).join('');
  }
  function go(tab) { if (tab === S.tab) { $('#view').scrollTo({ top: 0, behavior: 'smooth' }); return; } S.tab = tab; N.haptic(); renderTabs(); refresh(); }
  let busy = false;
  async function refresh() {
    if (!Api.linked() || busy) return; busy = true;
    const el = $('#view'); el.className = 'pg'; void el.offsetWidth;
    try { await SCREENS[S.tab](el); } catch (e) { if (e.revoked) return boot2(e.message); U.toast(e.message || String(e), e.net ? 'warn' : 'err'); } finally { busy = false; }
  }
  function banner(html, kind) { $('#banners').innerHTML = html ? '<div class="banner ' + (kind || '') + '">' + html + '</div>' : ''; }

  /* ---------- data ---------- */
  async function loadSnap(paint) {
    return Api.swr('home', function () { return Api.call('getTodayQueueSnapshot'); }, function (d, stale) { S.today = d.today || S.today || todayLocal(); S.snap = d; if (paint) paint(d, stale); });
  }
  async function loadFin(paint) {
    const p = pin(); if (!p) return null;
    try { return await Api.swr('fin', function () { return Api.call('getClinicDashboardStats', [p]); }, paint); }
    catch (e) { if (!e.net && /رمز|PIN|محاولات/.test(e.message)) { if (!/محاولات/.test(e.message)) N.secSet('pin', ''); U.toast(e.message, 'err'); return null; } if (e.net && e.cached) return e.cached; throw e; }
  }
  function mirrorSummary(snap, fin) {
    try { const ps = (snap && snap.patients) || [], bk = (snap && snap.bookings) || [];
      N.setJson('summary', { at: Date.now(), total: ps.length, waiting: ps.filter(function (p) { return p.visitStatus === 'waiting'; }).length, bookings: bk.filter(function (b) { return b.status !== 'ملغى'; }).length, income: fin ? fin.todayIncome : null, net: fin ? fin.todayNet : null });
      N.refreshWidgets(); } catch (e) { /* widget is best effort */ }
  }

  /* ---------- screens ---------- */
  const SCREENS = {
    home: async function (el) {
      setTop(); el.innerHTML = skeleton(4);
      let snap = null, fin = null;
      const paint = function () {
        if (!snap) return; const ps = snap.patients || [], bk = (snap.bookings || []).filter(function (b) { return b.status !== 'ملغى'; }), up = (snap.upcoming || []).filter(function (b) { return b.status !== 'ملغى'; });
        const waiting = ps.filter(function (p) { return p.visitStatus === 'waiting'; }), done = ps.filter(function (p) { return p.visitStatus === 'finished' || p.visitStatus === 'closed'; });
        const next = bk.filter(function (b) { return b.status === 'Pending' || b.status === 'تم الحجز'; }).concat(up).slice(0, 4);
        el.innerHTML = '<div class="kpis">' + kpi('k1', 'users', 'مراجعو اليوم', ps.length) + kpi('k2', 'clock', 'بانتظار الطبيب', waiting.length) + kpi('k3', 'check', 'منتهية', done.length) + kpi('k4', 'booking', 'حجوزات اليوم', bk.length) +
          (fin ? kpi('k5 wide', 'wallet', 'صافي مدخول اليوم (د.ع)', fin.todayNet, 1) : '<button class="kpi k5 wide" id="hpin">' + ic('lock') + '<small>المالية</small><b style="font-size:1.1rem">أدخل رمز المالية لعرض المدخول</b></button>') + '</div>' +
          (fin ? '<div class="card" style="margin-top:14px"><div class="row sp"><b>آخر 14 يوماً</b><span class="chip br">' + money(fin.dailySeries.reduce(function (a, d) { return a + d.net; }, 0)) + ' د.ع</span></div>' + bars(fin.dailySeries, 'net') + '</div>' : '') +
          '<h2 class="sh">أقرب الحجوزات</h2><div class="card list">' + (next.length ? next.map(bookingRow).join('') : empty('booking', 'لا توجد حجوزات قادمة')) + '</div>' +
          '<h2 class="sh">مراجعو اليوم</h2><div class="card list">' + (ps.length ? ps.slice(0, 6).map(patientRow).join('') : empty('users', 'لا يوجد مراجعون اليوم بعد')) + '</div>' + (ps.length > 6 ? '<button class="btn sec w" id="hall" style="margin-top:12px">عرض الكل (' + ps.length + ')</button>' : '');
        countUp(el); if (fin) wireBars(el, fin.dailySeries);
        const b = $('#hall'); if (b) b.onclick = function () { go('patients'); };
        const hp = $('#hpin'); if (hp) hp.onclick = function () { askPin().then(function (ok) { if (ok) refresh(); }); };
        wirePatients(el);
      };
      const pf = loadFin(function (d) { fin = d; paint(); });
      try { snap = await loadSnap(function () { snap = S.snap; paint(); }); } catch (e) { if (e.net) { offlineChip(true); snap = e.cached || S.snap; if (!snap) throw e; } else throw e; }
      fin = await pf.catch(function () { return fin; }); paint(); mirrorSummary(snap, fin);
    },

    patients: async function (el) {
      setTop('المراجعون', 'اليوم والبحث');
      el.innerHTML = '<div class="seg" id="pseg"><button data-m="today" class="' + (S.pm !== 'search' ? 'on' : '') + '">اليوم</button><button data-m="search" class="' + (S.pm === 'search' ? 'on' : '') + '">بحث في السجل</button></div><div id="pbody" style="margin-top:14px"></div>';
      const body = $('#pbody', el);
      $('#pseg', el).onclick = function (e) { const b = e.target.closest('button'); if (!b) return; S.pm = b.dataset.m; U.$$('#pseg button', el).forEach(function (x) { x.classList.toggle('on', x === b); }); mode(); };
      async function mode() {
        if (S.pm === 'search') {
          body.innerHTML = '<div class="rel"><input class="in" id="psq" placeholder="اسم المراجع أو رقم هاتفه" autocomplete="off" style="padding-inline-start:42px" value="' + E(S.q) + '"><span class="sic">' + ic('search') + '</span></div><div id="pres" style="margin-top:12px"></div>';
          const run = U.debounce(async function () {
            const q = $('#psq').value.trim(); S.q = q; const out = $('#pres'); if (q.length < 2) { out.innerHTML = empty('search', 'اكتب حرفين على الأقل'); return; }
            out.innerHTML = skeleton(2);
            try { const r = await Api.call('searchPatientByNameOrPhone', [q]); if ($('#psq').value.trim() !== q) return;
              out.innerHTML = r.length ? '<div class="card list">' + r.map(function (p) { return '<button class="li" data-pid="' + E(p.patientId) + '"><span class="av">' + E(U.initial(p.fullName)) + '</span><span class="mid1"><b>' + E(p.fullName) + '</b><small class="ph">' + E(p.phone || '') + '</small></span><span class="chip br">' + (p.visitsCount || 1) + ' زيارة</span></button>'; }).join('') + '</div>' : empty('search', 'لا توجد نتائج');
              wirePatients(out); } catch (e) { out.innerHTML = empty('wifioff', e.message); }
          }, 300);
          $('#psq').oninput = run; if (S.q) run(); else $('#pres').innerHTML = empty('search', 'ابحث بالاسم أو الهاتف لعرض سجل المراجع'); return;
        }
        body.innerHTML = skeleton(3);
        const paint = function (snap) { const ps = snap.patients || []; body.innerHTML = ps.length ? '<div class="card list">' + ps.map(patientRow).join('') + '</div>' : empty('users', 'لا يوجد مراجعون اليوم بعد'); wirePatients(body); };
        try { await loadSnap(paint); } catch (e) { if (e.net) { offlineChip(true); if (e.cached) paint(e.cached); else body.innerHTML = empty('wifioff', e.message); } else throw e; }
      }
      await mode();
    },

    bookings: async function (el) {
      setTop('الحجوزات', 'اليوم والأيام القادمة'); el.innerHTML = skeleton(3);
      const paint = function (snap) {
        const all = (snap.bookings || []).concat(snap.upcoming || []), days = {};
        all.forEach(function (b) { (days[b.callDate] = days[b.callDate] || []).push(b); });
        const keys = Object.keys(days).sort(); if (keys.indexOf(snap.today) === -1) keys.unshift(snap.today);
        el.innerHTML = keys.map(function (d) {
          const list = (days[d] || []).filter(function (b) { return b.status !== 'ملغى'; }).sort(function (a, b) { return String(a.callTime).localeCompare(String(b.callTime)); });
          return '<h2 class="sh row sp"><span>' + (d === snap.today ? 'اليوم' : U.dayName(d)) + ' <small class="mut">' + U.dm(d) + '</small></span><span class="chip br">' + list.length + '</span></h2><div class="card list">' + (list.length ? list.map(function (b) { return bookingRow(b, true); }).join('') : empty('booking', 'لا حجوزات')) + '</div>';
        }).join('') + '<button class="fab" id="bkadd" aria-label="إضافة حجز">' + ic('plus') + '</button>';
        $('#bkadd').onclick = function () { addBooking(); };
        el.onclick = async function (e) { const b = e.target.closest('[data-bs]'); if (!b) return; N.haptic();
          const r = await U.act(b, function () { return Api.call('updateBookingStatus', [{ bookingId: b.dataset.id, status: b.dataset.bs }]); });
          if (r) { U.toast('تم تحديث الحجز', 'ok'); loadSnap().then(paint); } };
      };
      try { await loadSnap(paint); } catch (e) { if (e.net) { offlineChip(true); if (e.cached) paint(e.cached); else el.innerHTML = empty('wifioff', e.message); } else throw e; }
    },

    finance: async function (el) {
      setTop('المالية', 'الدخل والمصاريف');
      if (!pin()) { el.innerHTML = '<div class="card" style="text-align:center;padding:28px">' + ic('lock', 'big') + '<h2 style="margin:10px 0">رمز المالية</h2><p class="mut">أدخل رمز المالية المحدد في موقع العيادة لعرض الإحصائيات. يُحفظ مشفّراً على هذا الهاتف.</p><button class="btn" id="fpin" style="margin-top:14px">إدخال الرمز</button></div>'; $('#fpin').onclick = function () { askPin().then(function (ok) { if (ok) refresh(); }); }; return; }
      el.innerHTML = skeleton(3);
      const paint = function (f) {
        el.innerHTML = '<div class="kpis"><div class="kpi k1">' + ic('wallet') + '<small>صافي اليوم</small><b data-n="' + f.todayNet + '" data-f="1">0</b></div><div class="kpi k2">' + ic('trend') + '<small>صافي الإجمالي</small><b data-n="' + f.netIncome + '" data-f="1">0</b></div></div>' +
          '<div class="row wrap" style="gap:8px;margin:12px 0"><span class="chip ok">دخل اليوم ' + money(f.todayIncome) + '</span><span class="chip bad">إرجاعات ' + money(f.todayRefunds) + '</span><span class="chip warn">مصاريف العيادة ' + money(f.todayExpenses) + '</span><span class="chip">من جيب الطبيب ' + money(f.todayExternalExpenses) + '</span></div>' +
          '<div class="card"><b>آخر 14 يوماً (الصافي)</b>' + bars(f.dailySeries, 'net') + '</div>' +
          '<div class="card" style="margin-top:14px"><b>توزيع الحركات</b>' + donut(f.byType || {}) + '</div>' +
          '<h2 class="sh">آخر الحركات</h2><div class="card list">' + (f.recentTransactions || []).slice(0, 30).map(function (t) { const neg = /Refund|Expense/.test(t.type); return '<div class="li"><span class="mid1"><b>' + E(t.itemName || TYPE[t.type] || t.type) + '</b><small class="mut">' + U.dm(t.date) + ' · ' + E(TYPE[t.type] || t.type) + '</small></span><b style="color:var(--' + (neg ? 'bad' : 'ok') + ')">' + (neg ? '−' : '+') + money(Math.abs(t.amount)) + '</b></div>'; }).join('') + '</div>' +
          '<button class="fab" id="fadd" aria-label="إضافة فاتورة">' + ic('plus') + '</button>';
        countUp(el); wireBars(el, f.dailySeries); $('#fadd').onclick = function () { addExpense(); };
      };
      try { const f = await loadFin(paint); if (f) { paint(f); mirrorSummary(S.snap, f); } else refresh(); } catch (e) { if (e.net) offlineChip(true); else throw e; }
    },

    more: async function (el) { setTop('المزيد', 'الإعدادات والعيادة'); renderMore(el); }
  };

  /* ---------- list rows ---------- */
  function patientRow(p) { return '<button class="li" data-pid="' + E(p.patientId) + '"><span class="av">' + E(U.initial(p.fullName)) + '</span><span class="mid1"><b>' + E(p.fullName) + '</b><small class="mut">' + E(U.ageText ? U.ageText(p.age) : p.age || '') + (p.diagnosis ? ' · ' + E(p.diagnosis.slice(0, 40)) : '') + '</small></span>' + vchip(p.visitStatus) + '</button>'; }
  function bookingRow(b, act) {
    const time = (b.callTime || '').slice(11, 16), done = b.status === 'حضر' || b.status === 'لم يحضر';
    return '<div class="li bk"><span class="av">' + E(U.initial(b.patientName)) + '</span><span class="mid1"><b>' + E(b.patientName) + '</b><small class="ph">' + E(b.phone || '') + (b.requestedSlot ? ' · ' + E(b.requestedSlot) : '') + '</small></span>' +
      (done ? '<span class="chip ' + (b.status === 'حضر' ? 'ok' : 'bad') + '">' + E(b.status) + '</span>' : act ? '<span class="acts"><button class="btn sm ok" data-bs="حضر" data-id="' + E(b.bookingId) + '">حضر</button><button class="btn sm sec" data-bs="لم يحضر" data-id="' + E(b.bookingId) + '">لم يحضر</button><button class="ib sm" data-bs="ملغى" data-id="' + E(b.bookingId) + '" aria-label="إلغاء">' + ic('x') + '</button></span>' : '<span class="chip br">' + E(time || b.callDate || '') + '</span>') + '</div>';
  }
  function wirePatients(root) { root.onclick = (function (prev) { return function (e) { const b = e.target.closest('[data-pid]'); if (b) return profile(b.dataset.pid); if (prev) prev(e); }; })(root.onclick); }

  /* ---------- sheets ---------- */
  async function profile(id) {
    const d = U.dlg('ملف المراجع', '<div id="pf">' + skeleton(2) + '</div>', { icon: 'users', size: 'wide' });
    let r; try { r = await Api.call('getPatientFullProfile', [id]); } catch (e) { $('#pf', d).innerHTML = empty('wifioff', e.message); return; }
    const p = r.patient, ops = r.operations || [];
    $('#pf', d).innerHTML = '<div class="row" style="gap:14px;margin:8px 0 14px"><span class="av" style="width:56px;height:56px;font-size:1.4rem">' + E(U.initial(p.fullName)) + '</span><div><b style="font-size:1.1rem">' + E(p.fullName) + '</b><div class="mut" style="font-size:.86rem">' + E(U.ageText ? U.ageText(p.age) : p.age || '') + (p.gender ? ' · ' + E(p.gender) : '') + (p.address ? ' · ' + E(p.address) : '') + '</div></div></div>' +
      '<div class="row wrap" style="gap:8px;margin-bottom:12px">' + (p.phone ? '<button class="btn sm sec" data-tel="' + E(p.phone) + '">' + ic('phone') + ' ' + E(p.phone) + '</button>' : '') + '<span class="chip br">' + r.totalVisits + ' زيارة</span><span class="chip">أول زيارة ' + U.dm(r.firstVisitDate) + '</span>' + (ops.length ? '<span class="chip warn">' + ops.length + ' عملية</span>' : '') + '</div>' +
      r.history.map(function (v, i) { return '<div class="card tl" style="margin-bottom:10px;animation:cardin .4s both;animation-delay:' + i * 40 + 'ms"><div class="row sp"><b>' + U.longDate(v.visitDate) + '</b><span class="row" style="gap:6px">' + (v.isFreeVisit === 'نعم' ? '<span class="chip ok">مجانية</span>' : v.refunded ? '<span class="chip bad">مستردة</span>' : '<span class="chip">' + E(v.consultationPaid || '') + '</span>') + vchip(v.visitStatus) + '</span></div>' +
        (v.diagnosis ? '<p style="margin:8px 0 2px"><span class="mut">التشخيص:</span> ' + E(v.diagnosis) + '</p>' : '') + (v.notes ? '<p class="mut" style="font-size:.9rem">' + E(v.notes) + '</p>' : '') +
        (v.prescriptions && v.prescriptions.length ? '<div class="rxbox">' + ic('rx') + '<div>' + v.prescriptions.map(function (x) { return '<div>' + E([x.name, x.strength ? x.strength + (x.unit || '') : '', x.form, x.dose].filter(Boolean).join(' ')) + '</div>'; }).join('') + '</div></div>' : '') +
        (v.testsRequested ? '<p class="mut" style="font-size:.85rem">فحوصات: ' + E(v.testsRequested) + '</p>' : '') + '</div>'; }).join('');
    const t = $('[data-tel]', d); if (t) t.onclick = function () { N.openExternal('tel:' + t.dataset.tel); };
  }

  async function askPin(msg) {
    return new Promise(function (resolve) {
      let done = false;
      const d = U.dlg('رمز المالية', '<p class="mut" style="margin:12px 0">' + E(msg || 'أدخل رمز المالية (نفس الرمز المستخدم في موقع العيادة).') + '</p><input class="in" id="pnv" type="password" inputmode="numeric" maxlength="8" autocomplete="off" style="text-align:center;font-size:1.4rem;letter-spacing:.4em"><button class="btn w" id="pnk" style="margin-top:14px">' + ic('check') + ' حفظ</button>', { icon: 'lock', onClose: function () { if (!done) { done = true; resolve(false); } } });
      const ok = function () { const v = U.digits($('#pnv', d).value); if (v.length < 4) return U.toast('الرمز 4 أرقام على الأقل', 'warn'); N.secSet('pin', v); done = true; U._onClose = null; d.close(); resolve(true); };
      $('#pnk', d).onclick = ok; $('#pnv', d).onkeydown = function (e) { if (e.key === 'Enter') ok(); }; setTimeout(function () { $('#pnv', d).focus(); }, 80);
    });
  }

  async function addBooking(date) {
    let info; try { info = await Api.call('getBookingSlots', [{ date: date || undefined }]); } catch (e) { return U.toast(e.message, 'err'); }
    let day = info.date, time = '';
    const d = U.dlg('إضافة حجز', '<form id="bkf" autocomplete="off"><label class="l">اسم المريض</label><input class="in" id="bn" required maxlength="80"><label class="l">الهاتف</label><input class="in" id="bp" inputmode="tel" dir="ltr" placeholder="07XXXXXXXXX" style="text-align:start"><label class="l">اليوم</label><div class="dys" id="bd"></div><label class="l">الوقت</label><div class="slg" id="bs"></div><button class="btn w" id="bsv" style="margin-top:16px" disabled>' + ic('check') + ' حفظ الحجز</button></form>', { icon: 'addcal' });
    const drawDays = function () { $('#bd', d).innerHTML = info.dates.map(function (x) { return '<button type="button" data-d="' + E(x) + '" class="' + (x === day ? 'on' : '') + '"><b>' + (x === info.now.ymd ? 'اليوم' : U.dayName(x)) + '</b><small>' + U.dm(x) + '</small></button>'; }).join(''); };
    const drawSlots = function () { $('#bs', d).innerHTML = info.slots.map(function (s) { const off = s.full || s.past; return '<button type="button" class="sl ' + (s.time === time ? 'on' : '') + '" data-t="' + E(s.time) + '" ' + (off ? 'disabled' : '') + '><b>' + E(hm12(s.time)) + '</b><small>' + (s.past ? 'مضى' : s.full ? 'ممتلئ' : 'متاح ' + (s.capacity - s.hourCount)) + '</small></button>'; }).join('') || empty('clock', 'لا أوقات متاحة'); };
    const ready = function () { $('#bsv', d).disabled = !(time && $('#bn', d).value.trim()); };
    drawDays(); drawSlots();
    $('#bd', d).onclick = async function (e) { const b = e.target.closest('button'); if (!b) return; day = b.dataset.d; time = ''; try { info = await Api.call('getBookingSlots', [{ date: day }]); } catch (er) { return U.toast(er.message, 'err'); } drawDays(); drawSlots(); ready(); };
    $('#bs', d).onclick = function (e) { const b = e.target.closest('button'); if (!b || b.disabled) return; time = b.dataset.t; drawSlots(); ready(); };
    $('#bn', d).oninput = ready;
    $('#bkf', d).onsubmit = async function (e) {
      e.preventDefault(); const ph = ClinicCore.normalizePhone($('#bp', d).value); if (!ph.ok) return U.toast(ph.error, 'warn');
      const r = await U.act($('#bsv', d), function () { return Api.call('addNewBooking', [{ patientName: $('#bn', d).value.trim(), phone: ph.value, date: day, time: time }]); });
      if (r) { U.closeDlg(); U.toast('تم حفظ الحجز', 'ok'); refresh(); }
    };
  }

  function addExpense() {
    let own = false;
    const d = U.dlg('إضافة فاتورة', '<form id="exf" autocomplete="off"><label class="l">البند</label><input class="in" id="e1" required maxlength="120"><div class="fg"><div><label class="l">العدد</label><input class="in" id="e2" inputmode="numeric" value="1"></div><div><label class="l">سعر الوحدة (د.ع)</label><input class="in" id="e3" inputmode="numeric" required></div></div><label class="l">مصدر الدفع</label><div class="seg" id="esrc"><button type="button" class="on" data-v="0">من دخل العيادة</button><button type="button" data-v="1">من جيب الطبيب</button></div><div class="row sp" style="margin-top:16px"><b>المجموع: <span id="etot">0</span> د.ع</b><button class="btn" id="esv">' + ic('check') + ' حفظ</button></div></form>', { icon: 'wallet' });
    const tot = function () { $('#etot', d).textContent = money((+U.digits($('#e2', d).value) || 0) * (+U.digits($('#e3', d).value) || 0)); };
    d.addEventListener('input', tot);
    $('#esrc', d).onclick = function (e) { const b = e.target.closest('button'); if (!b) return; own = b.dataset.v === '1'; U.$$('#esrc button', d).forEach(function (x) { x.classList.toggle('on', x === b); }); };
    $('#exf', d).onsubmit = async function (e) {
      e.preventDefault();
      const r = await U.act($('#esv', d), function () { return Api.call('recordClinicExpense', [{ pin: pin(), date: S.today || todayLocal(), itemName: $('#e1', d).value.trim(), quantity: +U.digits($('#e2', d).value) || 1, unitPrice: +U.digits($('#e3', d).value) || 0, deductFromClinic: !own }]); });
      if (r) { U.closeDlg(); U.toast('سُجّلت الفاتورة', 'ok'); refresh(); }
    };
  }

  async function surgeries() {
    const d = U.dlg('العمليات القادمة', '<div id="sg">' + skeleton(2) + '</div>', { icon: 'surgery' });
    try { const r = await Api.call('getSurgeryList'); $('#sg', d).innerHTML = r.items.length ? '<div class="list">' + r.items.map(function (s) { return '<div class="li"><span class="mid1"><b>' + E(s.patientName) + '</b><small class="mut">' + E(s.operationType) + ' · ' + U.longDate(s.operationDate) + (s.operationTime ? ' ' + E(s.operationTime) : '') + (s.location ? ' · ' + E(s.location) : '') + '</small></span>' + (s.overdue ? '<span class="chip bad">متأخرة</span>' : '<span class="chip br">' + money(s.amount) + '</span>') + '</div>'; }).join('') + '</div>' : empty('surgery', 'لا توجد عمليات محجوزة'); } catch (e) { $('#sg', d).innerHTML = empty('wifioff', e.message); }
  }

  /* ---------- more / settings ---------- */
  function sec(icon, title, inner) { return '<section class="card sc"><h3>' + ic(icon) + E(title) + '</h3>' + inner + '</section>'; }
  function renderMore(el) {
    const t = S.set, c = cfg(), l = Lic.status();
    const sw = function (n) { const col = { 1: ['#0c4a5b', '#f2ae48'], 2: ['#262b52', '#ff8a65'], 3: ['#1f3d2b', '#e3b85a'], 4: ['#3a2243', '#f08aa6'] }[n]; return '<button data-p="' + n + '" class="' + (t.palette === n ? 'on' : '') + '" aria-label="لوحة ' + n + '"><i style="background:' + col[0] + '"></i><i style="background:' + col[1] + '"></i></button>'; };
    el.innerHTML = '<button class="card li big" id="msurg">' + ic('surgery') + '<span class="mid1"><b>العمليات القادمة</b><small class="mut">قائمة العمليات المحجوزة</small></span>' + ic('chl') + '</button>' +
      sec('doctor', 'العيادة', '<p><b>' + E(c.clinicName || '') + '</b></p><p class="mut">' + E(c.doctorName ? 'د. ' + c.doctorName : '') + ' · الكشفية ' + money(c.consultationFee || 0) + ' · مراجعة مجانية خلال ' + (c.freeReviewDays || 5) + ' أيام</p><div class="row wrap" style="gap:8px;margin-top:10px"><button class="btn sm sec" id="mcfg">' + ic('refresh') + ' تحديث بيانات العيادة</button><button class="btn sm bad" id="munl">فصل الربط</button></div>') +
      sec('palette', 'المظهر', '<label class="l">لوحة الألوان</label><div class="sw" id="sw">' + [1, 2, 3, 4].map(sw).join('') + '</div><label class="l">النمط</label><div class="seg" id="smode">' + [['light', 'فاتح'], ['dark', 'داكن'], ['system', 'تلقائي']].map(function (m) { return '<button data-m="' + m[0] + '" class="' + (t.mode === m[0] ? 'on' : '') + '">' + m[1] + '</button>'; }).join('') + '</div><label class="l">حجم الخط: <b id="fsv">' + Math.round(t.fontScale * 100) + '%</b></label><input type="range" id="sfs" min="90" max="140" step="5" value="' + Math.round(t.fontScale * 100) + '" style="width:100%"><div style="margin-top:14px"><label class="tgl"><input type="checkbox" id="shc" ' + (t.contrast === 'high' ? 'checked' : '') + '><span>تباين عالٍ</span></label></div>') +
      sec('shield', 'الإشعارات والأمان', '<label class="tgl"><input type="checkbox" id="mnt" ' + (t.notify ? 'checked' : '') + '><span>إشعارات الحجوزات الجديدة والمراجعين</span></label><p class="mut" style="font-size:.82rem;margin:8px 0 14px">تُفحص البيانات في الخلفية كل 15 دقيقة تقريباً. الويدجت يُحدَّث معها.</p><div class="row wrap" style="gap:8px"><button class="btn sm sec" id="mpin">' + ic('lock') + (pin() ? ' تغيير رمز المالية' : ' إدخال رمز المالية') + '</button>' + (pin() ? '<button class="btn sm sec" id="mpinx">مسح الرمز</button>' : '') + '</div>') +
      sec('download', 'البيانات', '<div class="row wrap" style="gap:8px"><button class="btn sm sec" id="mexd">' + ic('download') + ' تصدير بيانات العيادة</button><button class="btn sm sec" id="mexs">' + ic('download') + ' تصدير الإعدادات</button><button class="btn sm sec" id="mimp">' + ic('upload') + ' استيراد إعدادات</button></div><p class="mut" style="font-size:.8rem;margin-top:8px">التصدير ينسخ بيانات الموقع كما هي (للاحتفاظ بنسخة). الاستيراد هنا يعيد إعدادات التطبيق فقط.</p>') +
      sec('refresh', 'التحديثات', '<p>الإصدار الحالي: <b dir="ltr">v' + E(N.version()) + '</b></p><button class="btn sm" id="mup">' + ic('refresh') + ' البحث عن تحديث (GitHub)</button><div id="mupr" style="margin-top:10px"></div>') +
      sec('shield', 'الترخيص', '<div class="row sp"><b>' + ({ trial: 'نسخة تجريبية', active: 'مفعّلة', expired: 'منتهية', revoked: 'موقوفة' }[l.status] || '') + '</b><span class="chip ' + (l.status === 'active' ? 'ok' : l.status === 'trial' ? 'warn' : 'bad') + '">' + E(l.message) + '</span></div>' + (l.enforced ? '<div class="row" style="margin-top:12px"><input class="in" id="lk" dir="ltr" placeholder="CM-XXXX-XXXX-XXXX" style="text-align:start"><button class="btn" id="lka">تفعيل</button></div>' : '')) +
      sec('info', 'حول', '<p>' + E(C.APP_NAME || 'Clinic Manager') + ' <b dir="ltr">v' + E(N.version()) + '</b></p><div class="mut" style="font-size:.88rem;line-height:1.8"><p>• الشيفرة مفتوحة المصدر (MIT) — يمكنك بناء نسختك مع ذكر المطوّر.</p><p>• النسخ الرسمية تعمل مجاناً 30 يوماً ثم تحتاج مفتاح تفعيل، والاستخدام التجاري يتطلب ترخيصاً.</p></div><button class="btn sm sec" id="mdev" style="margin-top:8px">' + ic('link') + ' تواصل مع المطوّر</button>');
    U.$$('.sc', el).forEach(function (s, i) { s.style.animationDelay = i * 50 + 'ms'; });
    $('#msurg', el).onclick = surgeries;
    $('#mcfg', el).onclick = function (e) { U.act(e.currentTarget, async function () { await Api.config(); U.toast('تم تحديث بيانات العيادة', 'ok'); renderMore(el); setTop('المزيد', 'الإعدادات والعيادة'); }); };
    $('#munl', el).onclick = async function () { if (await U.confirm('فصل الربط', 'سيُمسح رمز الدخول من هذا الهاتف. تبقى بيانات العيادة في الموقع. متابعة؟', 'فصل', 'bad')) { Api.unlink(); boot2(); } };
    $('#sw', el).onclick = function (e) { const b = e.target.closest('button'); if (!b) return; saveSet({ palette: +b.dataset.p }); U.$$('#sw button', el).forEach(function (x) { x.classList.toggle('on', x === b); }); };
    $('#smode', el).onclick = function (e) { const b = e.target.closest('button'); if (!b) return; saveSet({ mode: b.dataset.m }); U.$$('#smode button', el).forEach(function (x) { x.classList.toggle('on', x === b); }); };
    $('#sfs', el).oninput = function (e) { $('#fsv', el).textContent = e.target.value + '%'; }; $('#sfs', el).onchange = function (e) { saveSet({ fontScale: +e.target.value / 100 }); };
    $('#shc', el).onchange = function (e) { saveSet({ contrast: e.target.checked ? 'high' : 'normal' }); };
    $('#mnt', el).onchange = async function (e) { if (e.target.checked && !(await N.askNotifications())) { e.target.checked = false; return U.toast('لم يُمنح إذن الإشعارات. فعّله من إعدادات الهاتف.', 'warn'); } saveSet({ notify: e.target.checked }); N.kvSet('cm.notify', e.target.checked ? '1' : '0'); };
    $('#mpin', el).onclick = function () { askPin().then(function (ok) { if (ok) renderMore(el); }); };
    const px = $('#mpinx', el); if (px) px.onclick = function () { N.secSet('pin', ''); renderMore(el); };
    $('#mexs', el).onclick = function () { N.saveFile('clinic-android-settings.json', JSON.stringify({ format: 'clinic-manager-android-settings', version: 1, settings: S.set })).then(function (p) { if (p) U.toast('حُفظ الملف', 'ok'); }); };
    $('#mimp', el).onclick = async function () { const t = await N.pickFile(); if (!t) return; try { const j = JSON.parse(t); if (j.format !== 'clinic-manager-android-settings') throw 0; saveSet(Object.assign({}, DEF, j.settings)); U.toast('تم استيراد الإعدادات', 'ok'); renderMore(el); } catch (er) { U.toast('هذا الملف ليس ملف إعدادات صالحاً.', 'err'); } };
    $('#mexd', el).onclick = function (e) { U.act(e.currentTarget, async function () {
      const out = { format: 'clinic-manager-android-export', version: 1, exportedAt: new Date().toISOString(), app: N.version(), config: cfg(), tables: {} };
      for (const tb of ['Patient_Records', 'Financials', 'Surgeries', 'Drugs', 'Bookings']) { let from = 2, rows = []; for (let k = 0; k < 200; k++) { const r = await Api.req('snapshot', { table: tb, from: from, limit: 1000 }); rows = rows.concat(r.rows); if (r.next == null) break; from = r.next; } out.tables[tb] = rows; }
      const p = await N.saveFile('clinic-export-' + (S.today || todayLocal()) + '.json', JSON.stringify(out)); if (p) U.toast('حُفظ الملف', 'ok'); }); };
    $('#mup', el).onclick = function (e) { U.act(e.currentTarget, checkUpdate); };
    const la = $('#lka', el); if (la) la.onclick = function (e) { U.act(e.currentTarget, async function () { await Lic.activate($('#lk', el).value); U.toast('تم التفعيل', 'ok'); licGate(); renderMore(el); }); };
    $('#mdev', el).onclick = function () { N.openExternal(C.DEVELOPER_URL || 'https://t.me/hasn2mr'); };
  }
  async function checkUpdate() {
    const o = $('#mupr'); if (!C.GITHUB_OWNER || !C.GITHUB_REPO) { o.innerHTML = '<p class="mut">لم يُضبط مستودع التحديثات في هذه النسخة.</p>'; return; }
    let r; try { r = JSON.parse(await N.http('https://api.github.com/repos/' + C.GITHUB_OWNER + '/' + C.GITHUB_REPO + '/releases/latest', '', 'GET')); } catch (e) { throw new Error('تعذّر الوصول إلى GitHub.'); }
    const ver = String(r.tag_name || '').replace(/^v/, ''), cur = N.version(), num = function (v) { return v.split('.').map(function (x) { return parseInt(x, 10) || 0; }); };
    const a = num(ver), b = num(cur); let newer = false; for (let i = 0; i < 3; i++) { if ((a[i] || 0) !== (b[i] || 0)) { newer = (a[i] || 0) > (b[i] || 0); break; } }
    if (!newer) { o.innerHTML = '<p class="chip ok">أنت على آخر إصدار.</p>'; return; }
    const apk = (r.assets || []).find(function (x) { return /\.apk$/i.test(x.name); });
    o.innerHTML = '<div class="card" style="box-shadow:inset 0 0 0 1.5px var(--brand)"><b>إصدار جديد ' + E(ver) + '</b><pre style="white-space:pre-wrap;font-family:inherit;color:var(--mut);margin:8px 0">' + E((r.body || '').slice(0, 600)) + '</pre><button class="btn" id="mdl">' + ic('download') + ' تنزيل التحديث</button></div>';
    $('#mdl').onclick = function () { N.openExternal(apk ? apk.browser_download_url : r.html_url); };
  }

  /* ---------- pairing ---------- */
  function pairing(msg) {
    $('#top').innerHTML = ''; $('#tabs').innerHTML = ''; banner('');
    const el = $('#view'); el.className = 'pg';
    el.innerHTML = '<div class="wiz card" style="padding:26px 20px">' + ic('qr', 'big') + '<h1 style="font-size:1.5rem;margin:6px 0">ربط الهاتف بالعيادة</h1>' + (msg ? '<p class="chip bad" style="white-space:normal">' + E(msg) + '</p>' : '<p class="mut">امسح رمز QR من تطبيق الكمبيوتر (الإعدادات ← المزامنة ← ربط تطبيق الأندرويد) أو من لوحة المطوّر في الموقع.</p>') +
      '<button class="btn w" id="pqr" style="margin:16px 0 6px">' + ic('qr') + ' مسح رمز QR</button><div class="or"><span>أو يدوياً</span></div><div style="text-align:start"><label class="l">رابط تطبيق العيادة</label><input class="in" id="pu" dir="ltr" placeholder="https://script.google.com/macros/s/…/exec" style="text-align:start"><label class="l">رمز الربط</label><input class="in" id="pc" dir="ltr" maxlength="9" placeholder="XXXX-XXXX" style="text-align:start;letter-spacing:.15em"></div><button class="btn sec w" id="pgo" style="margin-top:14px">ربط</button></div>';
    const fin = function (p) { return U.act(null, async function () { await p(); await Api.config().catch(function () {}); U.toast('تم الربط بالعيادة', 'ok'); start(); }); };
    $('#pqr').onclick = function (e) { U.act(e.currentTarget, async function () { const t = await N.scanQr(); if (t) await fin(function () { return Api.pairFromQr(t); }); }); };
    $('#pgo').onclick = function (e) { U.act(e.currentTarget, async function () { await fin(function () { return Api.pair($('#pu').value, $('#pc').value); }); }); };
  }

  /* ---------- license gate ---------- */
  function licGate() {
    const l = Lic.status(), box = $('#lic');
    if (l.status !== 'expired' && l.status !== 'revoked') { box.hidden = true; box.innerHTML = ''; banner(l.status === 'trial' && l.daysLeft <= 7 ? ic('clock') + '<span>' + E(l.message) + '</span>' : '', 'warn'); return; }
    box.hidden = false;
    box.innerHTML = '<div class="card">' + ic('shield', 'big') + '<h2>' + (l.status === 'revoked' ? 'تم إيقاف الترخيص' : 'انتهت الفترة التجريبية') + '</h2><p class="mut">' + E(l.message) + '</p><button class="btn" id="lcd">' + ic('link') + ' تواصل مع المطوّر</button><div class="row" style="gap:8px"><input class="in" id="lck" dir="ltr" placeholder="CM-XXXX-XXXX-XXXX" style="text-align:start"><button class="btn sec" id="lca">لدي مفتاح تفعيل</button></div></div>';
    $('#lcd', box).onclick = function () { N.openExternal(C.DEVELOPER_URL || 'https://t.me/hasn2mr'); };
    $('#lca', box).onclick = function (e) { U.act(e.currentTarget, async function () { await Lic.activate($('#lck', box).value); U.toast('تم التفعيل — شكراً لك', 'ok'); licGate(); }); };
  }

  /* ---------- boot ---------- */
  async function welcome() {
    const w = $('#welcome'), name = cfg().doctorName ? 'د. ' + cfg().doctorName.replace(/^د\.?\s*/, '') : (C.APP_NAME || 'Clinic Manager');
    $('#w-greet').textContent = U.greeting(); $('#w-name').innerHTML = '<b>' + E(name) + '</b>'; $('#w-sub').textContent = cfg().clinicName || '';
    w.hidden = false; await U.sleep(1500); w.classList.add('out'); await U.sleep(520); w.remove();
  }
  function start() {
    $('#app').hidden = false; renderTabs(); licGate();
    if (!Api.linked()) return pairing();
    const h = (location.hash || '').slice(1); S.tab = TABS.some(function (t) { return t[0] === h; }) ? h : 'home'; renderTabs(); refresh();
  }
  function boot2(msg) { $('#app').hidden = false; pairing(msg || ''); }
  async function boot() {
    U.installSprite(); applyTheme();
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
    const splash = Splash.start($('#brain')); let pct = 5; const tick = setInterval(function () { pct = Math.min(92, pct + 9); splash.setProgress(pct); $('#splash-bar').style.width = pct + '%'; }, 140);
    $('#splash-msg').textContent = 'جارٍ التحميل…';
    await Promise.race([Lic.check().catch(function () {}), U.sleep(3500)]);
    if (Api.linked()) await Promise.race([Api.config().catch(function () {}), U.sleep(3000)]);
    clearInterval(tick); splash.setProgress(100); $('#splash-bar').style.width = '100%';
    await splash.finish(); const sp = $('#splash'); sp.classList.add('out');
    if (Api.linked()) await welcome(); else $('#welcome').remove();
    setTimeout(function () { sp.remove(); splash.stop(); }, 700);
    $('#tabs').onclick = function (e) { const b = e.target.closest('button'); if (b) go(b.dataset.t); };
    window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && U.isDlgOpen()) U.closeDlg(); });
    document.addEventListener('visibilitychange', function () { if (!document.hidden && Api.linked() && S.tab !== 'more') refresh(); });
    // light polling: one tiny `rev` request every 30 s while the app is visible (every 2 min when untouched); the screen reloads only if something changed
    let lastTouch = Date.now(), n = 0; ['pointerdown', 'keydown'].forEach(function (e) { addEventListener(e, function () { lastTouch = Date.now(); }, { passive: true }); });
    setInterval(async function () {
      if (document.hidden || !Api.linked() || busy || U.isDlgOpen() || S.tab === 'more') return;
      if (Date.now() - lastTouch > 180000 && (++n % 4)) return;
      try { const r = (await Api.req('rev')).rev; if (S.rev === undefined) S.rev = r; else if (r !== S.rev) { S.rev = r; refresh(); } offlineChip(false); }
      catch (e) { if (e.revoked) boot2(e.message); else if (e.net) offlineChip(true); }
    }, 30000);
    start();
  }
  /* called by MainActivity (notification tap / back button) */
  window.__go = function (t) { if (Api.linked() && TABS.some(function (x) { return x[0] === t; })) { S.tab = t; renderTabs(); refresh(); } };
  window.__back = function () { if (U.isDlgOpen()) { U.closeDlg(); return true; } if (Api.linked() && S.tab !== 'home') { go('home'); return true; } return false; };
  document.addEventListener('DOMContentLoaded', boot);
})();
