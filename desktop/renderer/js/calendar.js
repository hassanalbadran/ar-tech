'use strict';
/* التقويم — month grid. Left click opens the day (like "today"); right click shows the context menu. Exposes V.calendar */
(function () {
  const E = U.E, ic = U.ic, V = window.V = window.V || {};
  const st = { ym: null };
  const ymOf = function (ymd) { return ymd.slice(0, 7); };
  const addMonth = function (ym, n) { const p = ym.split('-').map(Number), d = new Date(Date.UTC(p[0], p[1] - 1 + n, 1)); return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0'); };

  V.calendar = {
    render: async function (el) {
      if (!st.ym) st.ym = ymOf(A.ymd);
      const ym = st.ym, p = ym.split('-').map(Number), first = new Date(Date.UTC(p[0], p[1] - 1, 1)), startDow = first.getUTCDay(), dim = new Date(Date.UTC(p[0], p[1], 0)).getUTCDate();
      const sum = await cm.monthSummary(ym), hidden = A.st.settings.hiddenDays || [];
      A.setTop('التقويم', U.MONTHS[p[1] - 1] + ' ' + p[0], '<div class="row" style="gap:8px"><button class="ib" id="cprev" aria-label="الشهر السابق">' + ic('chr') + '</button><button class="btn sm sec" id="ctoday">اليوم</button><button class="ib" id="cnext" aria-label="الشهر التالي">' + ic('chl') + '</button></div>');
      let h = '<div class="cal">' + U.WD.map(function (n) { return '<div class="hd">' + n + '</div>'; }).join('');
      for (let i = 0; i < startDow; i++) h += '<div></div>';
      for (let day = 1; day <= dim; day++) {
        const ymd = ym + '-' + String(day).padStart(2, '0'), s = sum[ymd], hid = hidden.indexOf(ymd) > -1;
        h += '<button class="cd ' + (ymd === A.st.todayYmd ? 'td ' : '') + (hid ? 'hid' : '') + '" data-d="' + E(ymd) + '"><b>' + day + '</b>' + (hid ? '<span class="lk">' + ic('lock') + '</span>' : '') +
          (s && !hid ? '<span class="m"><i>' + s.visits + '</i> مراجع</span>' + (s.bookings ? '<span class="m"><i>' + s.bookings + '</i> حجز</span>' : '') + (s.income ? '<span class="m"><i>' + U.money(s.income) + '</i></span>' : '') : '') + '</button>';
      }
      el.innerHTML = h + '</div>';
      document.getElementById('cprev').onclick = function () { st.ym = addMonth(ym, -1); A.refresh(); };
      document.getElementById('cnext').onclick = function () { st.ym = addMonth(ym, 1); A.refresh(); };
      document.getElementById('ctoday').onclick = function () { st.ym = ymOf(A.st.todayYmd); A.refresh(); };
      const cal = el.querySelector('.cal');
      cal.onclick = function (e) { const b = e.target.closest('.cd'); if (b) A.openDay(b.dataset.d); };
      cal.oncontextmenu = function (e) {
        const b = e.target.closest('.cd'); if (!b) return; e.preventDefault(); const ymd = b.dataset.d, hid = hidden.indexOf(ymd) > -1;
        U.ctx(e.clientX, e.clientY, [
          { icon: 'eye', label: 'فتح اليوم', run: function () { A.openDay(ymd); } },
          { icon: 'addcal', label: 'إضافة حجز في هذا اليوم', run: function () { D.addBooking(ymd); } },
          { icon: 'wallet', label: 'استعراض مدخول اليوم', run: function () { V.income.open(ymd); } },
          '-', hid ? { icon: 'eye', label: 'إظهار اليوم', run: function () { D.unhideDay(ymd); } } : { icon: 'eyeoff', label: 'إخفاء اليوم', run: function () { D.hideDay(ymd); } }
        ]);
      };
    }
  };
})();
