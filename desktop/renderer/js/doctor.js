'use strict';
/* Doctor workspace ("عرض كطبيب"): queue + patient panel with autosave. Exposes V.doctor */
(function () {
  const E = U.E, ic = U.ic, V = window.V = window.V || {};
  const rk = function (x) { return [x.name, x.form, x.strength, x.dose, x.timing, x.timingNote, x.hours, x.duration].map(function (s) { return String(s || '').trim().toLowerCase(); }).join('|'); };
  const S = { sel: 0, draft: null, rxK: [], tm: 0, q: Promise.resolve(), saving: 0, day: null, ctx: null };
  const STATUS = { waiting: ['بانتظار', 'warn'], closed: ['أُغلق', ''], finished: ['منتهي', 'ok'], postponed: ['مؤجل', 'br'] };

  function ss(t) { const el = document.getElementById('drst'); if (el) el.textContent = t; }
  function saveNow(action, extra) {
    return S.q = S.q.catch(function () {}).then(async function () {
      const d = S.draft; if (!d) return null;
      const pl = Object.assign({ rowNumber: d.rowNumber, patientId: d.patientId, visitDate: d.visitDate, diagnosis: d.diagnosis, notes: d.notes, tests: d.tests, prescriptions: d.rx, knownPrescriptions: S.rxK, action: action || 'save' }, extra || {});
      if (action && action !== 'save') pl.extraCharges = d.extra;
      const sent = new Set(d.rx.concat(S.rxK).map(rk)); ss('جارٍ الحفظ…'); S.saving++;
      let r; try { r = await cm.saveVisit(pl); } finally { S.saving--; }
      const p = r.result && r.result.patient;
      if (p) { S.rxK = p.prescriptions.slice(); p.prescriptions.forEach(function (x) { if (!sent.has(rk(x))) { d.rx.push(x); } }); if (p.prescriptions.length !== d.rx.length) rxList(); }
      ss(r.queued ? '✓ محفوظ محلياً (بانتظار الإنترنت)' : '✓ محفوظ');
      return r;
    });
  }
  function sched() { clearTimeout(S.tm); ss('…'); S.tm = setTimeout(function () { S.tm = 0; saveNow().catch(function (e) { ss('⚠ لم يُحفظ'); U.toast(e.message, 'err'); }); }, 900); }
  async function flush() { if (S.tm) { clearTimeout(S.tm); S.tm = 0; await saveNow(); } else await S.q.catch(function () {}); }

  function rxList() {
    const el = document.getElementById('drrx'); if (!el || !S.draft) return;
    el.innerHTML = S.draft.rx.length ? S.draft.rx.map(function (x, i) { return '<div class="ri"><span style="flex:1">' + (i + 1) + '. ' + E(D.rxLine(x)) + '</span><button class="ib" data-del="' + i + '" aria-label="حذف">' + ic('x') + '</button></div>'; }).join('') : '<p class="mut" style="font-size:.9rem">لا توجد أدوية بعد.</p>';
  }

  async function panel(v) {
    const el = document.getElementById('drpn'); if (!el) return;
    S.sel = v.rowNumber; flushDraftReset(v);
    let ctx = null; try { ctx = await cm.doctorContext(v.patientId, v.rowNumber); } catch (e) { /* optional */ }
    const cfg = A.cfg(), tests = cfg.tests || {}, extras = cfg.extraFees || {}, s = STATUS[v.visitStatus] || STATUS.waiting;
    el.innerHTML = '<div class="card"><div class="row sp wrap"><div class="row"><div class="av">' + E(U.initial(v.fullName)) + '</div><div><b style="font-size:1.1rem">' + E(v.fullName) + '</b><div class="sub mut">' + E(U.ageText(v.age)) + ' · ' + E(v.gender) + ' · ' + E(v.address || '') + '</div></div></div><div class="row" style="gap:8px"><span class="chip ' + s[1] + '">' + s[0] + '</span><span class="mut" id="drst" style="font-size:.8rem"></span></div></div>' +
      (ctx && (ctx.previousDiagnosis || ctx.lastPrescriptions) ? '<div class="prev" style="margin-top:12px">' + (ctx.previousDiagnosis ? '<div><b>تشخيص سابق (' + E(ctx.previousDiagnosis.visitDate) + '):</b> ' + E(ctx.previousDiagnosis.text) + ' <button class="btn sm sec" id="drcp1">نسخ</button></div>' : '') + (ctx.lastPrescriptions ? '<div style="margin-top:6px"><b>آخر علاج (' + E(ctx.lastPrescriptions.visitDate) + '):</b> ' + ctx.lastPrescriptions.items.length + ' أدوية <button class="btn sm sec" id="drcp2">نسخ للروشيتة</button></div>' : '') + '</div>' : '') +
      '<label class="l">التشخيص</label><textarea class="in" id="drdx" maxlength="4000" rows="3">' + E(v.diagnosis) + '</textarea>' +
      '<label class="l">فحوصات مطلوبة</label><div class="tst" id="drt">' + Object.keys(tests).map(function (k) { return '<button type="button" class="tt ' + (S.draft.tests.indexOf(k) > -1 ? 'on' : '') + '" data-k="' + E(k) + '">' + E(k) + '<small>' + E(tests[k]) + '</small></button>'; }).join('') + '</div>' +
      '<div class="row sp" style="margin-top:16px"><label class="l" style="margin:0">العلاج ' + ic('rx') + '</label><span class="row" style="gap:8px"><button class="btn sm sec" id="drpr">' + ic('printer') + ' طباعة</button><button class="btn sm" id="dradd">' + ic('plus') + ' إضافة دواء</button></span></div><div class="rxl" id="drrx" style="margin-top:8px"></div>' +
      '<label class="l">ملاحظات</label><textarea class="in" id="drnt" maxlength="4000" rows="2">' + E(v.notes) + '</textarea>' +
      '<label class="l">أجور إضافية (تُرسل للسكرتارية للتحصيل)</label><div class="chs" id="drex">' + Object.keys(extras).map(function (k) { return '<button type="button" class="cp ' + (S.draft.extra.indexOf(k) > -1 ? 'on' : '') + '" data-k="' + E(k) + '">' + E(extras[k].label) + ' · ' + U.money(extras[k].amount) + '</button>'; }).join('') + '</div>' +
      '<div class="row wrap" style="margin-top:20px;gap:10px"><button class="btn ok" id="drfin">' + ic('check') + ' إنهاء</button><button class="btn sec" id="drpost">' + ic('clock') + ' تأجيل</button><button class="btn sec" id="drcls">إغلاق</button>' + (v.visitStatus !== 'waiting' ? '<button class="btn sec" id="drre">' + ic('undo') + ' إعادة فتح</button>' : '') + (v.consultationPaid === 'نعم' ? '<span class="sp" style="flex:1"></span><button class="btn bad" id="drfree">FREE — إرجاع الكشفية</button>' : '') + '</div></div>';
    rxList();
    const $ = function (id) { return document.getElementById(id); };
    $('drdx').oninput = function (e) { S.draft.diagnosis = e.target.value; sched(); }; $('drnt').oninput = function (e) { S.draft.notes = e.target.value; sched(); };
    $('drt').onclick = function (e) { const b = e.target.closest('.tt'); if (!b) return; const t = S.draft.tests, i = t.indexOf(b.dataset.k); i > -1 ? t.splice(i, 1) : t.push(b.dataset.k); b.classList.toggle('on'); sched(); };
    $('drex').onclick = function (e) { const b = e.target.closest('.cp'); if (!b) return; const t = S.draft.extra, i = t.indexOf(b.dataset.k); i > -1 ? t.splice(i, 1) : t.push(b.dataset.k); b.classList.toggle('on'); };
    $('drrx').onclick = function (e) { const b = e.target.closest('[data-del]'); if (!b) return; S.draft.rx.splice(+b.dataset.del, 1); rxList(); sched(); };
    $('dradd').onclick = function () { D.rx('علاج — ' + v.fullName, async function (it) { S.draft.rx.push(it); rxList(); sched(); return true; }); };
    if ($('drcp1')) $('drcp1').onclick = function () { S.draft.diagnosis = ctx.previousDiagnosis.text; $('drdx').value = S.draft.diagnosis; sched(); };
    if ($('drcp2')) $('drcp2').onclick = function () { ctx.lastPrescriptions.items.forEach(function (x) { if (!S.draft.rx.some(function (y) { return rk(y) === rk(x); })) S.draft.rx.push(x); }); rxList(); sched(); };
    $('drpr').onclick = async function (e) { await flush(); const r = await U.act(e.currentTarget, function () { return cm.printRx(v.rowNumber); }); if (r) U.toast(r.printed ? 'أُرسلت الوصفة إلى الطابعة' : 'الطباعة معطّلة — فعّلها من الإعدادات', r.printed ? 'ok' : 'warn'); };
    const act = function (id, action, msg, extra) { $(id).onclick = async function (e) { const b = e.currentTarget; await U.act(b, async function () { await flush(); await saveNow(action, extra); U.toast(msg, 'ok'); A.refresh(); }); }; };
    act('drfin', 'finish', 'تم إنهاء الزيارة'); act('drcls', 'close', 'أُغلقت الزيارة'); act('drpost', 'postpone', 'أُجّل المراجع');
    if ($('drre')) act('drre', 'reopen', 'أُعيد فتح الزيارة');
    if ($('drfree')) $('drfree').onclick = async function (e) { if (!(await U.confirm('إرجاع الكشفية', 'سيُطلب من السكرتارية إرجاع الكشفية للمراجع «' + v.fullName + '». متابعة؟', 'FREE', 'bad'))) return; await U.act(e.currentTarget, async function () { await flush(); await saveNow('save', { refund: true }); U.toast('أُرسل طلب الإرجاع للسكرتارية', 'ok'); A.refresh(); }); };
  }
  function flushDraftReset(v) { S.draft = { rowNumber: v.rowNumber, patientId: v.patientId, visitDate: v.visitDate, diagnosis: v.diagnosis || '', notes: v.notes || '', tests: (v.tests || []).slice(), rx: (v.prescriptions || []).slice(), extra: (v.extraCharges || []).map(function (x) { return typeof x === 'string' ? x : x.key; }).filter(Boolean) }; S.rxK = (v.prescriptions || []).slice(); }

  V.doctor = {
    render: async function (el) {
      await flush();
      const ymd = A.ymd, day = await cm.getDay(ymd); S.day = day;
      A.setTop('عيادة الطبيب', U.longDate(ymd), '');
      if (day.hidden) { el.innerHTML = '<div class="em">هذا اليوم مخفي.</div>'; return; }
      const vs = day.visits;
      el.innerHTML = '<div class="dr"><aside><div class="card"><div class="rel" style="margin-bottom:12px"><input class="in" id="dq" placeholder="بحث عن مريض (الاسم أو الهاتف)" autocomplete="off"><div class="sug" id="drs" hidden></div></div><div class="row sp" style="margin-bottom:6px"><b>قائمة اليوم</b><span class="chip br">' + vs.length + '</span></div><div id="drq"></div></div></aside><section id="drpn"><div class="card em">اختر مراجعاً من القائمة</div></section></div>';
      const drq = document.getElementById('drq');
      drq.innerHTML = vs.length ? vs.map(function (v, i) { const s = STATUS[v.visitStatus] || STATUS.waiting; return '<div class="q ' + (v.rowNumber === S.sel ? 'on' : '') + '" data-r="' + v.rowNumber + '"><span class="n">' + (i + 1) + '</span><div style="flex:1;min-width:0"><div style="font-weight:600">' + E(v.fullName) + '</div><small class="mut">' + E(U.ageText(v.age)) + '</small></div><span class="chip ' + s[1] + '">' + s[0] + '</span></div>'; }).join('') : '<div class="em" style="padding:20px">لا مراجعون بعد.</div>';
      drq.onclick = async function (e) { const q = e.target.closest('.q'); if (!q) return; const v = vs.find(function (x) { return String(x.rowNumber) === q.dataset.r; }); if (!v) return; await flush(); U.$$('.q', drq).forEach(function (x) { x.classList.toggle('on', x === q); }); panel(v); };
      const cur = vs.find(function (v) { return v.rowNumber === S.sel; }) || vs.find(function (v) { return v.visitStatus === 'waiting'; }) || vs[0];
      if (cur) { U.$$('.q', drq).forEach(function (x) { x.classList.toggle('on', x.dataset.r === String(cur.rowNumber)); }); panel(cur); }
      // search + raise
      const box = document.getElementById('drs'); let list = [];
      document.getElementById('dq').oninput = U.debounce(async function (e) {
        const q = e.target.value.trim(); if (q.length < 2) { box.hidden = true; return; }
        try { list = (await cm.search(q)).slice(0, 8); } catch (er) { list = []; }
        box.hidden = false; box.innerHTML = list.length ? list.map(function (g, i) { return '<div style="padding:10px 12px;border-bottom:1px solid var(--line)"><div class="row sp"><b>' + E(g.fullName) + '</b><button class="ib" data-pf="' + i + '" title="الملف">' + ic('file') + '</button></div><small class="mut">' + E(g.phone) + ' · آخر زيارة ' + E(g.lastVisitDate || '—') + ' · ' + g.visitCount + ' زيارة</small><div class="row" style="margin-top:8px;gap:8px"><button class="btn sm ok" data-f="' + i + '">رفع الاسم</button><button class="btn sm acc" data-p="' + i + '">كشفية</button></div></div>'; }).join('') : '<div class="em" style="padding:16px">لا نتائج.</div>';
      }, 200);
      box.onclick = async function (e) {
        const pf = e.target.closest('[data-pf]'); if (pf) return D.profile(list[+pf.dataset.pf].patientId);
        const b = e.target.closest('[data-f],[data-p]'); if (!b) return; const g = list[+(b.dataset.f != null ? b.dataset.f : b.dataset.p)], mode = b.dataset.f != null ? 'free' : 'paid', p = g.latest || {};
        const r = await U.act(b, function () { return cm.addVisit({ patientId: g.patientId, fullName: g.fullName, age: p.age, gender: p.gender, phone: p.phone || g.phone, address: p.address || '', escortsCount: '', notes: '', mode: mode, paidConfirmation: true }); });
        if (r) { box.hidden = true; document.getElementById('dq').value = ''; U.toast(mode === 'free' ? 'رُفع الاسم — بدون كشفية' : 'رُفع الاسم مع كشفية — أُشعرت السكرتارية', 'ok'); A.refresh(); }
      };
    },
    flush: flush
  };
})();
