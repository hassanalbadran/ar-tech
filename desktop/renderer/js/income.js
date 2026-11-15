'use strict';
/* "استعراض مدخول اليوم": donut + groups with hover popovers + add invoice. Exposes V.income */
(function () {
  const E = U.E, ic = U.ic, $ = U.$;
  const COLORS = { consult: 'var(--brand)', extra: 'var(--accent)', surgery: '#7b61d1', refund: 'var(--bad)', expenseClinic: '#d98a12', expenseOwn: '#8a97a1' };
  const V = window.V = window.V || {};

  function itemRow(it, pop) {
    const amt = it.struck ? '<span class="amt">' + (it.tag === 'free' ? '<span class="tg">FREE</span>' : it.tag === 'review' ? '<span class="tg" style="color:var(--mut)">مراجعة</span>' : '') + '<s>' + U.money(it.amount) + '</s></span>' : '<span class="amt">' + U.money(it.amount) + '</span>';
    if (pop) return '<div class="it"><span>' + E(it.label) + '</span>' + (it.struck ? '<span style="position:relative;padding-top:.9em">' + (it.tag === 'free' ? '<span class="tg" style="position:absolute;top:0;inset-inline:0;text-align:center">FREE</span>' : it.tag === 'review' ? '<span class="tg" style="position:absolute;top:0;inset-inline:0;text-align:center;color:#c5d0d8">مراجعة</span>' : '') + '<s>' + U.money(it.amount) + '</s></span>' : '<span>' + U.money(it.amount) + '</span>') + '</div>';
    return '<div class="it ' + (it.struck ? 'st' : '') + '"><span>' + E(it.label) + (it.note ? ' <small class="mut">· ' + E(it.note) + '</small>' : '') + '</span>' + amt + '</div>';
  }

  V.income = {
    open: async function (ymd) {
      ymd = ymd || A.st.todayYmd;
      let inc; try { inc = await cm.income(ymd); } catch (e) { return U.toast(e.message, 'err'); }
      if (inc.hidden) {
        const d = U.dlg('مدخول ' + U.longDate(ymd), '<div class="em">' + ic('lock', '') + '<p>هذا اليوم مخفي من التطبيق.</p><button class="btn sec" id="ish">إظهار اليوم</button></div>', { icon: 'wallet' });
        $('#ish', d).onclick = function () { U.closeDlg(); D.unhideDay(ymd); }; return;
      }
      const t = inc.totals, tot = inc.donut.reduce(function (a, b) { return a + b.value; }, 0);
      const R = 90, C = 2 * Math.PI * R; let off = 0;
      const segs = inc.donut.map(function (s) { const len = tot ? s.value / tot * C : 0, el = '<circle data-k="' + E(s.key) + '" cx="110" cy="110" r="' + R + '" stroke="' + COLORS[s.key] + '" stroke-dasharray="' + Math.max(0, len - 3) + ' ' + (C - Math.max(0, len - 3)) + '" stroke-dashoffset="' + (-off) + '"/>'; off += len; return el; }).join('');
      const body = '<div class="inc"><div><div class="donut"><svg viewBox="0 0 220 220">' + (tot ? segs : '<circle cx="110" cy="110" r="' + R + '" stroke="var(--line)"/>') + '</svg><div class="mid"><small>الصافي</small><b>' + U.money(t.net) + '</b><small>د.ع</small></div></div>' +
        '<div class="lg2">' + inc.donut.map(function (s) { return '<button data-k="' + E(s.key) + '"><i style="background:' + COLORS[s.key] + '"></i><span>' + E(s.label) + '</span><b>' + U.money(s.value) + '</b></button>'; }).join('') + '</div>' +
        '<div class="row" style="margin-top:14px;gap:8px"><button class="btn sm" id="iadd" style="flex:1">' + ic('plus') + ' إضافة فاتورة</button></div></div>' +
        '<div id="igr">' + (inc.groups.filter(function (g) { return g.count; }).map(function (g) { return '<div class="gr" data-k="' + E(g.key) + '"><div class="row sp"><b>' + E(g.label) + '</b><span class="chip br">' + g.count + ' · ' + U.money(g.total) + ' د.ع</span></div>' + g.items.map(function (it) { return itemRow(it); }).join('') + '</div>'; }).join('') || '<div class="em">لا توجد حركات في هذا اليوم.</div>') + '</div></div>' +
        '<div class="row wrap" style="margin-top:14px;gap:10px"><span class="chip ok">الدخل ' + U.money(t.income) + '</span><span class="chip bad">إرجاعات ' + U.money(t.refunds) + '</span><span class="chip warn">مصاريف العيادة ' + U.money(t.expensesClinic) + '</span><span class="chip">من جيب الطبيب ' + U.money(t.expensesOwn) + '</span></div>';
      const d = U.dlg('مدخول ' + U.longDate(ymd), body, { icon: 'wallet', size: 'wide' });
      // hover popovers (segments + legend + group headers)
      const grp = function (k) { return inc.groups.find(function (g) { return g.key === k; }); };
      const show = function (k, ev) {
        hide(); const g = grp(k); if (!g || !g.items.length) return;
        const p = document.createElement('div'); p.className = 'pop'; p.id = 'pop';
        p.innerHTML = '<h5>' + E(g.label) + ' — ' + U.money(g.total) + '</h5>' + g.items.slice(0, 14).map(function (it) { return itemRow(it, true); }).join('') + (g.items.length > 14 ? '<div class="it"><span>…و ' + (g.items.length - 14) + ' أخرى</span></div>' : '');
        document.body.append(p);
        const r = p.getBoundingClientRect(); p.style.left = Math.max(8, Math.min(ev.clientX + 16, innerWidth - r.width - 8)) + 'px'; p.style.top = Math.max(8, Math.min(ev.clientY + 12, innerHeight - r.height - 8)) + 'px';
        U.$$('[data-k="' + k + '"]', d).forEach(function (x) { x.classList.add('hov'); });
      };
      const hide = function () { const p = document.getElementById('pop'); if (p) p.remove(); U.$$('.hov', d).forEach(function (x) { x.classList.remove('hov'); }); };
      d.addEventListener('mousemove', function (e) { const el = e.target.closest('circle[data-k],.lg2 button[data-k],.gr[data-k] > .row'); if (!el) return hide(); const k = el.dataset.k || el.parentElement.dataset.k; if (document.getElementById('pop') && d._k === k) { const p = document.getElementById('pop'), r = p.getBoundingClientRect(); p.style.left = Math.max(8, Math.min(e.clientX + 16, innerWidth - r.width - 8)) + 'px'; p.style.top = Math.max(8, Math.min(e.clientY + 12, innerHeight - r.height - 8)) + 'px'; return; } d._k = k; show(k, e); });
      d.addEventListener('mouseleave', hide); d.addEventListener('close', hide);
      $('#iadd', d).onclick = function () { V.income.addInvoice(ymd); };
    },
    addInvoice: function (ymd) {
      const d = U.dlg('إضافة فاتورة', '<form id="invf" autocomplete="off"><label class="l">البند</label><input class="in" id="in1" required maxlength="120" placeholder="مثال: أوراق طباعة">' +
        '<div class="fg"><div><label class="l">العدد</label><input class="in" id="in2" inputmode="numeric" value="1"></div><div><label class="l">سعر الوحدة (د.ع)</label><input class="in" id="in3" inputmode="numeric" required></div></div>' +
        '<label class="l">مصدر الدفع</label><div class="seg" id="insrc"><button type="button" class="on" data-v="1">من دخل العيادة</button><button type="button" data-v="0">من جيب الطبيب</button></div>' +
        '<div class="row sp" style="margin-top:16px"><b>المجموع: <span id="intot">0</span> د.ع</b><button class="btn" id="insv">' + ic('check') + ' حفظ</button></div></form>', { icon: 'wallet' });
      let src = 1; const tot = function () { $('#intot', d).textContent = U.money((+U.digits($('#in2', d).value) || 0) * (+U.digits($('#in3', d).value) || 0)); };
      d.addEventListener('input', tot);
      $('#insrc', d).onclick = function (e) { const b = e.target.closest('button'); if (!b) return; src = +b.dataset.v; U.$$('#insrc button', d).forEach(function (x) { x.classList.toggle('on', x === b); }); };
      $('#invf', d).onsubmit = async function (e) {
        e.preventDefault();
        const r = await U.act($('#insv', d), function () { return cm.addExpense({ date: ymd, itemName: $('#in1', d).value.trim(), quantity: +U.digits($('#in2', d).value) || 1, unitPrice: +U.digits($('#in3', d).value) || 0, fromClinicIncome: src === 1 }); });
        if (r) { U.closeDlg(); U.toast('سُجّلت الفاتورة' + (r.queued ? ' (بانتظار الإنترنت)' : ''), 'ok'); setTimeout(function () { V.income.open(ymd); }, 150); }
      };
      setTimeout(function () { $('#in1', d).focus(); }, 60);
    }
  };
})();
