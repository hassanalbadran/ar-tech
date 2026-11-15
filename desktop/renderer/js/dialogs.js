'use strict';
/* Modal flows shared by the views: booking, new reviewer, surgery, profile, hide-day, Android QR, prescription entry. Exposes window.D */
(function () {
  const D = {}, E = U.E, ic = U.ic, $ = U.$;

  const phoneField = function (input, msg) {
    const run = function () {
      const v = input.value.trim(); if (!v) { input.classList.remove('bad'); msg.textContent = ''; return; }
      const r = ClinicCore.normalizePhone(v);
      input.classList.toggle('bad', !r.ok); msg.textContent = r.ok ? '' : r.error; msg.style.color = 'var(--bad)';
    };
    input.addEventListener('input', run);
  };

  /* ---------------- booking: day + hour slots ---------------- */
  D.addBooking = async function (date) {
    let info;
    try { info = await cm.slots(date || undefined); } catch (e) { return U.toast(e.message, 'err'); }
    const sel = { date: info.date, time: '' }, keep = { n: '', p: '' };
    const draw = function () {
      const body = '<form id="bkf" autocomplete="off"><div class="fg"><div class="rel"><label class="l">اسم المريض</label><input class="in" id="bn" maxlength="80" required value="' + E(keep.n) + '" placeholder="اكتب الاسم — تظهر اقتراحات من المراجعين السابقين"></div>' +
        '<div><label class="l">الهاتف</label><input class="in" id="bp" inputmode="tel" maxlength="14" dir="ltr" style="text-align:end" placeholder="07XXXXXXXXX" value="' + E(keep.p) + '"><small id="bpm"></small></div></div>' +
        '<label class="l">اليوم</label><div class="dys">' + info.dates.map(function (d, i) { return '<button type="button" class="cp ' + (d === sel.date ? 'on' : '') + '" data-d="' + E(d) + '">' + (d === info.now.ymd ? 'اليوم' : U.dayName(d)) + '<small>' + U.dm(d) + '</small></button>'; }).join('') + '</div>' +
        '<label class="l">الساعة</label><div class="slg">' + (info.slots.length ? info.slots.map(function (s) {
          const off = s.full || s.past, left = Math.max(0, s.capacity - s.hourCount);
          return '<button type="button" class="sl ' + (sel.time === s.time && !off ? 'on' : '') + '" data-t="' + E(s.time) + '" ' + (off ? 'disabled' : '') + '>' + U.T12(s.time) + '<small>' + (s.past ? 'مضى' : s.full ? 'ممتلئ' : 'متاح ' + left) + '</small></button>';
        }).join('') : '<div class="em" style="grid-column:1/-1">لا مواعيد في هذا اليوم</div>') + '</div>' +
        '<div class="row" style="justify-content:flex-end;margin-top:18px"><button class="btn" id="bsv">' + ic('check') + ' حفظ الحجز</button></div></form>';
      const d = U.dlg('إضافة حجز', body, { icon: 'addcal' });
      const n = $('#bn', d), p = $('#bp', d); phoneField(p, $('#bpm', d));
      U.suggest(n, function (x) { n.value = x.fullName; p.value = x.phone || ''; p.dispatchEvent(new Event('input')); });
      d.querySelector('.dys').onclick = async function (e) {
        const b = e.target.closest('[data-d]'); if (!b) return;
        keep.n = n.value; keep.p = p.value;
        try { info = await cm.slots(b.dataset.d); sel.date = b.dataset.d; sel.time = ''; draw(); } catch (er) { U.toast(er.message, 'err'); }
      };
      d.querySelector('.slg').onclick = function (e) { const b = e.target.closest('.sl'); if (!b || b.disabled) return; sel.time = b.dataset.t; U.$$('.sl', d).forEach(function (x) { x.classList.toggle('on', x === b); }); };
      $('#bkf', d).onsubmit = async function (e) {
        e.preventDefault();
        const ph = ClinicCore.normalizePhone(p.value);
        if (!ph.ok) { p.classList.add('bad'); return U.toast(ph.error, 'warn'); }
        if (!sel.time) return U.toast('اختر الساعة من القائمة.', 'warn');
        const r = await U.act($('#bsv', d), function () { return cm.addBooking({ patientName: n.value.trim(), phone: ph.value, date: sel.date, time: sel.time }); });
        if (r) { U.closeDlg(); U.toast('تم حفظ الحجز — ' + U.dayName(sel.date) + ' ' + U.dm(sel.date) + ' · ' + U.T12(sel.time) + (r.queued ? ' (بانتظار الإنترنت)' : ''), 'ok'); A.refresh(); }
        else { try { info = await cm.slots(sel.date); sel.time = ''; keep.n = n.value; keep.p = p.value; draw(); } catch (x) { /* keep dialog */ } }
      };
      setTimeout(function () { (keep.n ? p : n).focus(); }, 60);
    };
    draw();
  };

  /* ---------------- new reviewer (visit) ---------------- */
  D.addVisit = function (pre) {
    pre = pre || {};
    const st = { patientId: pre.patientId || '', fee: null };
    const d = U.dlg('مراجع جديد', '<form id="vf" autocomplete="off"><div class="fg"><div class="rel"><label class="l">الاسم الكامل</label><input class="in" id="vn" required maxlength="80" value="' + E(pre.fullName || '') + '"></div>' +
      '<div><label class="l">الهاتف</label><input class="in" id="vp" inputmode="tel" dir="ltr" style="text-align:end" maxlength="14" value="' + E(pre.phone || '') + '"><small id="vpm"></small></div>' +
      '<div><label class="l">العمر</label><div class="row"><input class="in" id="va" inputmode="numeric" maxlength="3" style="flex:1" value="' + E(U.ageParts(pre.age).n) + '"><select class="in" id="vu" style="width:96px"><option value="Y">سنة</option><option value="M">شهر</option><option value="D">يوم</option></select></div></div>' +
      '<div><label class="l">الجنس</label><div class="seg" id="vg"><button type="button" data-g="ذكر" class="on">ذكر</button><button type="button" data-g="أنثى">أنثى</button></div></div>' +
      '<div><label class="l">العنوان</label><input class="in" id="vd" maxlength="80" value="' + E(pre.address || '') + '"></div>' +
      '<div><label class="l">عدد المرافقين</label><input class="in" id="ve" inputmode="numeric" maxlength="2"></div></div>' +
      '<div id="vfee" class="banner" style="margin:16px 0 0" hidden></div><div class="row" style="justify-content:flex-end;margin-top:18px"><button class="btn" id="vsv">' + ic('check') + ' <span>حفظ</span></button></div></form>', { icon: 'userplus' });
    const n = $('#vn', d), p = $('#vp', d); phoneField(p, $('#vpm', d));
    let gender = pre.gender === 'أنثى' ? 'أنثى' : 'ذكر';
    const setG = function () { U.$$('#vg button', d).forEach(function (b) { b.classList.toggle('on', b.dataset.g === gender); }); };
    setG(); $('#vu', d).value = U.ageParts(pre.age).u;
    $('#vg', d).onclick = function (e) { const b = e.target.closest('button'); if (b) { gender = b.dataset.g; setG(); } };
    const fee = async function () {
      const box = $('#vfee', d); if (!st.patientId) { box.hidden = true; $('#vsv span', d).textContent = 'حفظ وتأكيد الكشفية'; return; }
      try {
        const r = await cm.feePreview(st.patientId); box.hidden = false;
        box.className = 'banner' + (r.free ? '' : ' warn'); box.innerHTML = ic(r.free ? 'check' : 'wallet') + '<span>' + (r.free ? 'مراجعة مجانية — ' + E(r.reason || '') : 'كشفية: ' + U.money(r.fee) + ' د.ع' + (r.reason ? ' — ' + E(r.reason) : '')) + '</span>';
        $('#vsv span', d).textContent = r.free ? 'حفظ (مجاني)' : 'حفظ وتأكيد استلام الكشفية';
      } catch (e) { box.hidden = true; }
    };
    U.suggest(n, function (x) {
      const v = x.latest || {}; st.patientId = x.patientId; n.value = x.fullName; picked = x.fullName; p.value = x.phone || ''; p.dispatchEvent(new Event('input'));
      const ap = U.ageParts(v.age != null ? v.age : x.age); $('#va', d).value = ap.n; $('#vu', d).value = ap.u; gender = v.gender === 'أنثى' ? 'أنثى' : 'ذكر'; setG(); $('#vd', d).value = v.address || ''; fee();
    });
    let picked = pre.fullName || '';
    n.addEventListener('input', function () { if (st.patientId && n.value !== picked) { st.patientId = ''; fee(); } });
    fee();
    $('#vf', d).onsubmit = async function (e) {
      e.preventDefault();
      const ph = ClinicCore.normalizePhone(p.value);
      if (p.value.trim() && !ph.ok) { p.classList.add('bad'); return U.toast(ph.error, 'warn'); }
      const age = $('#va', d).value.trim(), u = $('#vu', d).value, ageStr = age ? (u === 'Y' ? age : age + u) : '';
      const r = await U.act($('#vsv', d), function () {
        return cm.addVisit({ patientId: st.patientId, fullName: n.value.trim(), age: ageStr, gender: gender, phone: ph.ok ? ph.value : p.value.trim(), address: $('#vd', d).value.trim(), escortsCount: $('#ve', d).value.trim(), notes: '', paidConfirmation: true });
      });
      if (r) { U.closeDlg(); const res = r.result || {}; U.toast(res.duplicate ? (res.message || 'المراجع موجود في قائمة اليوم.') : 'أُضيف المراجع إلى قائمة اليوم' + (r.queued ? ' (بانتظار الإنترنت)' : ''), res.duplicate ? 'warn' : 'ok'); A.refresh(); }
    };
    setTimeout(function () { n.focus(); }, 60);
  };

  /* ---------------- surgery ---------------- */
  D.addSurgery = function () {
    const st = { v: null };
    const d = U.dlg('إضافة عملية', '<form id="sf" autocomplete="off"><div class="rel"><label class="l">المريض</label><input class="in" id="sn" required placeholder="ابحث باسم المريض أو هاتفه"></div><div id="sinfo" class="mut" style="margin-top:6px;font-size:.85rem"></div>' +
      '<div class="fg"><div><label class="l">نوع العملية</label><input class="in" id="st" required maxlength="150"></div><div><label class="l">المكان</label><input class="in" id="sl" required maxlength="150"></div>' +
      '<div><label class="l">التاريخ</label><input class="in" type="date" id="sd" required></div><div><label class="l">الوقت</label><input class="in" type="time" id="sti"></div>' +
      '<div><label class="l">المبلغ (د.ع)</label><input class="in" id="sa" inputmode="numeric"></div><div><label class="l">الدفع</label><select class="in" id="sp"><option value="غير مدفوع">غير مدفوع</option><option value="مدفوع">مدفوع</option></select></div></div>' +
      '<label class="l">تفاصيل</label><textarea class="in" id="sx" maxlength="2000"></textarea><div class="row" style="justify-content:flex-end;margin-top:18px"><button class="btn" id="ssv">' + ic('check') + ' حفظ العملية</button></div></form>', { icon: 'surgery' });
    $('#sd', d).value = (A.st && A.st.todayYmd) || '';
    U.suggest($('#sn', d), async function (x) {
      $('#sn', d).value = x.fullName;
      try { const pr = await cm.profile(x.patientId); st.v = pr.patient; $('#sinfo', d).textContent = 'آخر زيارة: ' + pr.patient.visitDate + ' · ' + pr.totalVisits + ' زيارة'; } catch (e) { U.toast(e.message, 'err'); }
    });
    $('#sf', d).onsubmit = async function (e) {
      e.preventDefault();
      if (!st.v) return U.toast('اختر المريض من الاقتراحات.', 'warn');
      const r = await U.act($('#ssv', d), function () {
        return cm.addSurgery({ rowNumber: st.v.rowNumber, patientId: st.v.patientId, visitDate: st.v.visitDate, operationType: $('#st', d).value.trim(), operationDate: $('#sd', d).value, operationTime: $('#sti', d).value, location: $('#sl', d).value.trim(), amount: U.digits($('#sa', d).value), paymentStatus: $('#sp', d).value, details: $('#sx', d).value.trim() });
      });
      if (r) { U.closeDlg(); U.toast('أُضيفت العملية' + (r.queued ? ' (بانتظار الإنترنت)' : ''), 'ok'); A.refresh(); }
    };
    setTimeout(function () { $('#sn', d).focus(); }, 60);
  };

  /* ---------------- patient profile ---------------- */
  D.profile = async function (patientId) {
    let pr; try { pr = await cm.profile(patientId); } catch (e) { return U.toast(e.message, 'err'); }
    const p = pr.patient;
    const hist = pr.history.map(function (v) {
      const rx = (v.prescriptions || []).map(function (x) { return '<div class="ri" style="direction:ltr;text-align:left;font-size:.84rem">' + E(D.rxLine(x)) + '</div>'; }).join('');
      return '<div class="card" style="margin-top:10px;padding:14px"><div class="row sp"><b>' + U.longDate(v.visitDate) + '</b><span class="row" style="gap:6px">' + (v.isFreeVisit === 'نعم' ? '<span class="chip ok">مجانية</span>' : v.consultationPaid === 'مسترد' ? '<span class="chip warn">مُرجَعة</span>' : '<span class="chip br">كشفية</span>') + '</span></div>' +
        (v.diagnosis ? '<p style="margin-top:8px"><span class="mut">التشخيص:</span> ' + E(v.diagnosis) + '</p>' : '') + (v.testsRequested ? '<p class="mut" style="font-size:.85rem">فحوصات: ' + E(v.testsRequested) + '</p>' : '') + (v.notes ? '<p class="mut" style="font-size:.85rem">' + E(v.notes) + '</p>' : '') + (rx ? '<div style="margin-top:8px">' + rx + '</div>' : '') + '</div>';
    }).join('');
    U.dlg(p.fullName, '<div class="row wrap" style="gap:14px;margin:12px 0"><span class="chip br">' + E(U.ageText(p.age)) + ' · ' + E(p.gender) + '</span><span class="ph">' + ic('phone') + E(p.phone) + '</span><span class="chip">' + pr.totalVisits + ' زيارة</span>' + (p.address ? '<span class="chip">' + E(p.address) + '</span>' : '') + '</div>' +
      (pr.operations.length ? '<p class="chip warn">' + pr.operations.length + ' عملية سابقة</p>' : '') + hist, { icon: 'file', size: 'mid' });
  };

  /* ---------------- prescription line ---------------- */
  const DUR = function (c) { const m = /^d(\d+)$/.exec(c || ''); return m ? m[1] + (m[1] === '1' ? ' يوم' : ' أيام') : c === 'prn' ? 'عند اللزوم' : c === 'until_review' ? 'حتى المراجعة' : (c || ''); };
  D.DUR = DUR;
  D.rxLine = function (x) {
    const u = x.unit || '', tm = x.timing === 'other' ? (x.timingNote || '') : x.timing === 'every' ? 'كل ' + (x.hours || '?') + ' ساعة' : ((A.cfg().rxTimings || {})[x.timing] || '') + (x.timingNote ? ' (' + x.timingNote + ')' : '');
    return [[x.name, x.strength ? x.strength + u : '', x.form].filter(Boolean).join(' '), x.dose, tm, DUR(x.duration)].filter(Boolean).join(' · ');
  };
  D.unitOf = function (form) { const f = (A.cfg().rxForms || []).find(function (r) { return r[0] === form; }); return f ? f[2] : ''; };

  /* ---------------- prescription entry (clean grid; sections can be switched off) ---------------- */
  D.rxSections = [['dose', 'عدد المرات'], ['timing', 'الوقت'], ['duration', 'المدة']];
  D.rxOn = function () { const s = A.st && A.st.settings && A.st.settings.rxSections; return Array.isArray(s) ? s : D.rxSections.map(function (x) { return x[0]; }); };
  /** onAdd(item) → Promise. Dialog stays open for adding several medicines. */
  D.rx = async function (title, onAdd) {
    const cfg = A.cfg(), on = D.rxOn(), forms = cfg.rxForms || [], tims = cfg.rxTimings || {}, groups = {};
    forms.forEach(function (f) { (groups[f[3]] = groups[f[3]] || []).push(f); });
    let drugs = []; try { drugs = await cm.drugs(); } catch (e) { /* optional */ }
    const r = { form: 'Tab', dose: '1x1', timing: 'after_meal', duration: 'd5' }, added = [];
    const chips = function (g, arr, cur) { return '<div class="chs" style="margin-bottom:8px">' + arr.map(function (v) { return '<button type="button" class="cp ' + (String(cur) === String(v[0]) ? 'on' : '') + '" data-g="' + g + '" data-v="' + E(v[0]) + '">' + E(v[1]) + '</button>'; }).join('') + '</div>'; };
    const sec = function (k, label, html) { return '<div class="c12 rxs" data-s="' + k + '" ' + (on.indexOf(k) > -1 ? '' : 'hidden') + '><label class="l">' + label + '</label>' + html + '</div>'; };
    const body = '<form id="rxf" autocomplete="off"><div class="rxgr"><div class="c12 rel"><label class="l">اسم الدواء</label><input class="in" data-k="name" maxlength="120" required style="direction:ltr;text-align:left" placeholder="Drug name"></div>' +
      '<div class="c6"><label class="l">الشكل الدوائي</label><select class="in" data-k="form">' + Object.keys(groups).map(function (g) { return '<optgroup label="' + E(g) + '">' + groups[g].map(function (f) { return '<option value="' + E(f[0]) + '"' + (f[0] === 'Tab' ? ' selected' : '') + '>' + E(f[0]) + ' — ' + E(f[1]) + '</option>'; }).join('') + '</optgroup>'; }).join('') + '</select></div>' +
      '<div class="c4"><label class="l">التركيز</label><input class="in" data-k="strength" inputmode="decimal" maxlength="20" placeholder="500" style="direction:ltr"></div><div class="c2"><label class="l">الوحدة</label><div class="rxun" id="un">' + E(D.unitOf('Tab') || '—') + '</div></div>' +
      sec('dose', 'عدد المرات', chips('dose', [['1x1', '1×1'], ['1x2', '1×2'], ['1x3', '1×3'], ['2x1', '2×1'], ['2x2', '2×2'], ['½x1', '½×1']], r.dose) + '<input class="in" data-k="dose" value="1x1" maxlength="30" style="direction:ltr" placeholder="أو اكتب نمطاً آخر">') +
      sec('timing', 'الوقت', '<select class="in" data-k="timing">' + Object.keys(tims).filter(function (k) { return k !== 'every_4h'; }).map(function (k) { return '<option value="' + k + '"' + (k === 'after_meal' ? ' selected' : '') + '>' + E(tims[k]) + '</option>'; }).join('') + '</select><input class="in" data-k="hours" maxlength="6" inputmode="numeric" placeholder="عدد الساعات" style="margin-top:8px" hidden><input class="in" data-k="timingNote" maxlength="120" placeholder="اكتب موعد التناول" style="margin-top:8px" hidden>') +
      sec('duration', 'المدة', '<select class="in" data-k="duration">' + ['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8', 'd9', 'd10', 'd14', 'd21', 'd30', 'prn', 'until_review'].map(function (c) { return '<option value="' + c + '"' + (c === 'd5' ? ' selected' : '') + '>' + E(DUR(c)) + '</option>'; }).join('') + '</select>') +
      '</div><div class="row wrap" style="margin-top:14px;font-size:.8rem" class="mut"><span class="mut">إظهار الحقول:</span>' + D.rxSections.map(function (s) { return '<button type="button" class="cp ' + (on.indexOf(s[0]) > -1 ? 'on' : '') + '" data-sec="' + s[0] + '" style="padding:2px 12px;font-size:.8rem">' + s[1] + '</button>'; }).join('') + '</div>' +
      '<div id="rxadded" class="rxl" style="margin-top:14px"></div><div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn" id="rxadd">' + ic('plus') + ' إضافة إلى الروشيتة</button></div></form>';
    const d = U.dlg(title || 'إضافة دواء', body, { icon: 'rx' });
    const get = function (k) { return $('[data-k=' + k + ']', d); };
    const sug = document.createElement('div'); sug.className = 'sug'; sug.hidden = true; get('name').parentElement.append(sug);
    get('name').addEventListener('input', function () {
      const q = get('name').value.trim().toLowerCase(); if (q.length < 1) { sug.hidden = true; return; }
      const hit = drugs.filter(function (x) { return x.name.toLowerCase().indexOf(q) === 0; }).slice(0, 6);
      sug.hidden = !hit.length; sug.innerHTML = hit.map(function (x, i) { return '<button type="button" data-i="' + i + '" style="direction:ltr"><b>' + E(x.name) + '</b><small>' + E([x.form, x.strength && x.strength + (x.unit || '')].filter(Boolean).join(' ')) + '</small></button>'; }).join(''); sug._hit = hit;
    });
    sug.onclick = function (e) { const b = e.target.closest('button'); if (!b) return; const x = sug._hit[+b.dataset.i]; get('name').value = x.name; if (x.form) { get('form').value = x.form; get('form').dispatchEvent(new Event('change')); } if (x.strength) get('strength').value = x.strength; sug.hidden = true; };
    get('form').addEventListener('change', function () { $('#un', d).textContent = D.unitOf(get('form').value) || '—'; });
    get('timing').addEventListener('change', function () { const v = get('timing').value; get('hours').hidden = v !== 'every'; get('timingNote').hidden = v !== 'other'; });
    d.onclick = function (e) {
      const c = e.target.closest('.cp[data-g]'); if (c) { get('dose').value = c.dataset.v; U.$$('.cp[data-g]', d).forEach(function (x) { x.classList.toggle('on', x === c); }); return; }
      const s = e.target.closest('[data-sec]'); if (s) { const on2 = D.rxOn().slice(), i = on2.indexOf(s.dataset.sec); i > -1 ? on2.splice(i, 1) : on2.push(s.dataset.sec); s.classList.toggle('on'); const box = $('.rxs[data-s=' + s.dataset.sec + ']', d); if (box) box.hidden = i > -1; cm.setSettings({ rxSections: on2 }).then(function (st) { A.st.settings = st; }).catch(function () {}); }
    };
    $('#rxf', d).onsubmit = async function (e) {
      e.preventDefault();
      const name = get('name').value.trim(); if (!name) return;
      const t = get('timing').value; if (t === 'every' && !get('hours').value.trim()) return U.toast('اكتب عدد الساعات.', 'warn');
      const it = { name: name, form: get('form').value, strength: U.digits(get('strength').value).trim(), unit: D.unitOf(get('form').value), dose: get('dose').value.trim(), timing: t, timingNote: t === 'other' ? get('timingNote').value.trim() : '', hours: t === 'every' ? U.digits(get('hours').value).trim() : '', duration: get('duration').value };
      const ok = await U.act($('#rxadd', d), function () { return onAdd(it); });
      if (ok !== undefined) { added.push(it); $('#rxadded', d).insertAdjacentHTML('beforeend', '<div class="ri">' + ic('check') + '<span>' + E(D.rxLine(it)) + '</span></div>'); get('name').value = ''; get('strength').value = ''; get('name').focus(); }
    };
    setTimeout(function () { get('name').focus(); }, 60);
  };

  /* ---------------- hide day ---------------- */
  D.hideDay = async function (ymd) {
    const pin = await U.pin('إخفاء اليوم', 'أدخل رمز الإخفاء — يُخفى ' + U.longDate(ymd) + ' من التطبيق فقط ولا يُحذف من قاعدة البيانات.'); if (!pin) return;
    try { await cm.hideDay(ymd, pin); U.toast('أُخفي اليوم من التطبيق', 'ok'); A.refresh(); } catch (e) { U.toast(e.message, 'err'); }
  };
  D.unhideDay = async function (ymd) {
    const pin = await U.pin('إظهار اليوم', 'أدخل رمز الإخفاء'); if (!pin) return;
    try { await cm.unhideDay(ymd, pin); U.toast('أُظهر اليوم', 'ok'); A.refresh(); } catch (e) { U.toast(e.message, 'err'); }
  };

  /* ---------------- Android pairing QR ---------------- */
  D.androidQr = async function () {
    let p; try { p = await cm.androidPairing(); } catch (e) { return U.toast(e.message, 'err'); }
    const d = U.dlg('ربط تطبيق الأندرويد', '<div style="text-align:center;padding:10px 0"><canvas id="qrc" style="border-radius:16px;background:#fff;padding:6px;max-width:100%"></canvas><p style="margin-top:12px">افتح تطبيق العيادة على الهاتف ← «ربط» ← امسح الرمز.</p><p class="mut" style="font-size:.85rem">أو اكتب هذا الرمز يدوياً:</p><b dir="ltr" style="font-size:1.6rem;letter-spacing:.12em">' + E(p.code) + '</b><p class="mut" style="font-size:.8rem;margin-top:8px">صالح 10 دقائق.</p></div>', { icon: 'qr' });
    QR.draw($('#qrc', d), p.qrText, 300, 3);
  };

  window.D = D;
})();
