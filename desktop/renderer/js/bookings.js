'use strict';
/* الحجوزات — today and the next bookable days, grouped by day. Exposes V.bookings */
(function () {
  const E = U.E, ic = U.ic, V = window.V = window.V || {};
  const ST = { Pending: ['بانتظار', 'warn'], 'تم الحجز': ['محجوز', 'br'], 'حضر': ['حضر', 'ok'], 'لم يحضر': ['لم يحضر', 'bad'], 'ملغى': ['ملغى', ''] };

  V.bookings = {
    render: async function (el) {
      const info = await cm.slots();
      const days = await Promise.all(info.dates.map(function (d) { return cm.getDay(d).then(function (x) { return { d: d, bks: x.bookings, hidden: x.hidden }; }); }));
      A.setTop('الحجوزات', 'اليوم والأيام القادمة', '<button class="btn" id="bkadd">' + ic('addcal') + ' إضافة حجز</button>');
      el.innerHTML = days.map(function (g) {
        const list = g.bks.filter(function (b) { return b.status !== 'ملغى'; });
        return '<h2 class="sh">' + ic('calendar') + (g.d === info.now.ymd ? 'اليوم' : U.dayName(g.d)) + ' <small class="mut" style="font-weight:400">' + U.dm(g.d) + '</small><span class="chip br">' + list.length + '</span></h2>' +
          (list.length ? '<div class="grid">' + list.map(function (b, i) {
            const s = ST[b.status] || ST.Pending;
            return '<div class="pc" style="--i:' + Math.min(i, 12) + '" data-id="' + E(b.bookingId) + '"><div class="row"><div class="av">' + E(U.initial(b.patientName)) + '</div><div style="flex:1;min-width:0"><div class="nm">' + E(b.patientName) + '</div><div class="sub"><span class="ph">' + ic('phone') + E(b.phone) + '</span></div></div><span class="chip ' + s[1] + '">' + s[0] + '</span></div>' +
              '<div class="row sp"><span class="chip br">' + ic('clock') + ' ' + E(b.requestedSlot || String(b.callTime).slice(11, 16)) + '</span></div>' +
              '<div class="acts"><button class="btn sm ok" data-s="حضر">حضر</button><button class="btn sm sec" data-s="لم يحضر">لم يحضر</button><button class="ib" data-s="ملغى" title="إلغاء الحجز" aria-label="إلغاء الحجز">' + ic('trash') + '</button></div></div>';
          }).join('') + '</div>' : '<div class="em" style="padding:18px">' + (g.hidden ? 'مخفي' : 'لا حجوزات') + '</div>');
      }).join('');
      document.getElementById('bkadd').onclick = function () { D.addBooking(); };
      el.onclick = async function (e) {
        const b = e.target.closest('[data-s]'); if (!b) return; const id = b.closest('.pc').dataset.id;
        if (b.dataset.s === 'ملغى' && !(await U.confirm('إلغاء الحجز', 'هل تريد إلغاء هذا الحجز؟', 'إلغاء الحجز', 'bad'))) return;
        const r = await U.act(b, function () { return cm.setBookingStatus(id, b.dataset.s); });
        if (r) { if (b.dataset.s === 'حضر') U.toast('سُجّل الحضور — أضِف المراجع من «مراجع جديد»', 'ok'); A.refresh(); }
      };
    }
  };
})();
