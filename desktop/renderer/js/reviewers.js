'use strict';
/* المراجعين — secretary view of one day: KPI cards + patient cards. Exposes V.reviewers */
(function () {
  const E = U.E, ic = U.ic, V = window.V = window.V || {};
  const STATUS = { waiting: ['بانتظار الطبيب', 'warn'], closed: ['أُغلق', ''], finished: ['منتهي', 'ok'], postponed: ['مؤجل', 'br'] };

  const payChip = function (v) {
    if (v.consultationPaid === 'مسترد') return '<span class="chip bad">كشفية مُرجَعة</span>';
    if (v.isFreeVisit === 'نعم') return '<span class="chip ok">مراجعة مجانية</span>';
    if (v.consultationPaid === 'مستورد') return '<span class="chip">مستورد</span>';
    return '<span class="chip br">كشفية</span>';
  };

  V.reviewers = {
    filter: '',
    render: async function (el) {
      const ymd = A.ymd, isToday = ymd === A.st.todayYmd;
      const day = await cm.getDay(ymd);
      A.setTop(isToday ? 'مراجعو اليوم' : 'مراجعو ' + U.dayName(ymd), U.longDate(ymd), '<button class="btn" id="rvnew">' + ic('userplus') + ' مراجع جديد</button>');
      el.innerHTML = '';
      if (!isToday) A.banner('rvday', ic('calendar') + '<span>تعرض الآن يوم ' + U.longDate(ymd) + '</span><span class="sp"></span><button class="btn sm sec" id="rvback">العودة لليوم</button>'); else A.banner('rvday', '');
      const back = document.getElementById('rvback'); if (back) back.onclick = function () { A.openDay(A.st.todayYmd); };
      document.getElementById('rvnew').onclick = function () { D.addVisit(); };
      if (day.hidden) {
        el.innerHTML = '<div class="em">' + ic('lock', '') + '<h2 style="margin:10px 0">هذا اليوم مخفي</h2><p class="mut">يُخفى من التطبيق فقط، والبيانات محفوظة في قاعدة البيانات.</p><button class="btn sec" id="rvun" style="margin-top:14px">' + ic('eye') + ' إظهار اليوم</button></div>';
        document.getElementById('rvun').onclick = function () { D.unhideDay(ymd); }; return;
      }
      const vs = day.visits, wait = vs.filter(function (v) { return v.visitStatus === 'waiting'; }).length, done = vs.filter(function (v) { return v.visitStatus === 'finished' || v.visitStatus === 'closed'; }).length;
      const bk = day.bookings.filter(function (b) { return b.status !== 'ملغى' && b.status !== 'لم يحضر'; }).length;
      let net = null; try { net = (await cm.income(ymd)).totals.net; } catch (e) { /* optional */ }
      el.innerHTML = '<div class="kpis">' +
        '<div class="kpi k1">' + ic('users') + '<small>مراجعو اليوم</small><b>' + vs.length + '</b></div>' +
        '<div class="kpi k2">' + ic('clock') + '<small>بانتظار الطبيب</small><b>' + wait + '</b></div>' +
        '<div class="kpi k3">' + ic('check') + '<small>منتهية</small><b>' + done + '</b></div>' +
        '<div class="kpi k4">' + ic('booking') + '<small>حجوزات اليوم</small><b>' + bk + '</b></div>' +
        (net == null ? '' : '<button class="kpi k5" id="rvinc">' + ic('wallet') + '<small>صافي المدخول (د.ع)</small><b>' + U.money(net) + '</b></button>') + '</div>' +
        '<div class="row sp" style="margin:18px 0 6px"><h2 class="sh" style="margin:0">قائمة المراجعين</h2><input class="in" id="rvq" placeholder="بحث في قائمة اليوم…" style="max-width:300px" value="' + E(V.reviewers.filter) + '"></div><div class="grid" id="rvg"></div>';
      const inc = document.getElementById('rvinc'); if (inc) inc.onclick = function () { V.income.open(ymd); };
      const draw = function () {
        const q = V.reviewers.filter.trim().toLowerCase(), g = document.getElementById('rvg');
        const list = vs.filter(function (v) { return !q || v.fullName.toLowerCase().indexOf(q) > -1 || String(v.phone).indexOf(q) > -1; });
        g.innerHTML = list.length ? list.map(function (v, i) {
          const s = STATUS[v.visitStatus] || STATUS.waiting, n = vs.indexOf(v) + 1;
          return '<div class="pc ' + (v.visitStatus === 'finished' ? 'fin' : '') + '" style="--i:' + Math.min(i, 14) + '" data-r="' + v.rowNumber + '"><div class="row"><div class="av">' + E(U.initial(v.fullName)) + '</div><div style="flex:1;min-width:0"><div class="nm">' + E(v.fullName) + '</div><div class="sub">' + E(U.ageText(v.age)) + ' · ' + E(v.gender) + ' · رقم ' + n + '</div></div><span class="chip ' + s[1] + '">' + s[0] + '</span></div>' +
            '<div class="row wrap" style="gap:8px">' + payChip(v) + (v.extraCharges && v.extraCharges.length ? '<span class="chip acc" style="background:var(--accent);color:var(--accent-ink)">أجور إضافية ' + v.extraCharges.length + '</span>' : '') + (v.prescriptions.length ? '<span class="chip">' + ic('rx') + ' ' + v.prescriptions.length + '</span>' : '') + '</div>' +
            '<div class="row sp"><span class="ph">' + ic('phone') + E(v.phone || '—') + '</span></div>' +
            '<div class="acts"><button class="btn sm" data-a="rx">' + ic('rx') + ' علاج</button><button class="btn sm sec" data-a="pf">' + ic('file') + ' الملف</button>' + (v.prescriptions.length ? '<button class="ib" data-a="pr" title="طباعة الوصفة" aria-label="طباعة الوصفة">' + ic('printer') + '</button>' : '') + '</div></div>';
        }).join('') : '<div class="em" style="grid-column:1/-1">' + (vs.length ? 'لا نتائج مطابقة.' : 'لا يوجد مراجعون في هذا اليوم بعد.') + '</div>';
      };
      draw();
      document.getElementById('rvq').oninput = function (e) { V.reviewers.filter = e.target.value; draw(); };
      document.getElementById('rvg').onclick = async function (e) {
        const b = e.target.closest('[data-a]'); if (!b) return; const card = b.closest('.pc'), v = vs.find(function (x) { return String(x.rowNumber) === card.dataset.r; }); if (!v) return;
        if (b.dataset.a === 'pf') D.profile(v.patientId);
        else if (b.dataset.a === 'rx') D.rx('علاج — ' + v.fullName, function (it) { return cm.addRx({ rowNumber: v.rowNumber, patientId: v.patientId, visitDate: v.visitDate, items: [it] }).then(function () { return true; }); });
        else if (b.dataset.a === 'pr') { const r = await U.act(b, function () { return cm.printRx(v.rowNumber); }); if (r) U.toast(r.printed ? 'أُرسلت الوصفة إلى الطابعة' : 'الطباعة معطّلة — فعّلها من الإعدادات', r.printed ? 'ok' : 'warn'); }
      };
    }
  };
})();
