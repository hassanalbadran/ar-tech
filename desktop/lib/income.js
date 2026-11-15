'use strict';
/**
 * income(ymd): derived from the day's Financials rows + the day's visits (see docs/BRIDGE.md for the shape).
 *
 * Linking finance rows to visits uses the tags the server writes in Financials.Notes:
 *   [VISIT][pid][date][ROW=n]            paid consultation of visit row n
 *   [REFUND][pid][date][ROW=n]           consultation refund (FREE button)
 *   [EXTRA][kind][pid][date][ROW=n]      extra fee (ExtraFee)        [EXTRA-REVERSE]... = its reversal (Type Refund)
 *   [SURGERY][pid][opId]                 surgery payment
 *   JSON {"kind":"expense","deductFromClinic":bool,...}   expenses
 *
 * Conventions (documented because the UI relies on them):
 *  - A consultation that was refunded on the SAME day with the same amount is shown struck/'free' in the consult
 *    group and its refund row is "absorbed" (not repeated in the refund group), so net = income - refunds - expensesClinic
 *    still equals the ledger sum. Struck items never count towards totals.
 *  - group.count = number of listed items (struck ones included); group.total = sum of non-struck amounts.
 *  - Refund amounts are shown as positive magnitudes. Imported legacy visits (consultationPaid 'مستورد') are not listed.
 *  - All six groups are always present (possibly empty) in a fixed order.
 */
const M = require('./mappers');

const LABELS = {
  consult: 'الكشفيات', extra: 'أجور إضافية', surgery: 'العمليات', refund: 'المُرجَعات',
  expenseClinic: 'مصروفات العيادة', expenseOwn: 'مصروفات من جيب الطبيب'
};
const ORDER = ['consult', 'extra', 'surgery', 'refund', 'expenseClinic', 'expenseOwn'];

function noteInfo(notes) {
  const s = String(notes || '');
  const tags = []; s.replace(/\[([^\]]*)\]/g, function (_, t) { tags.push(t); return ''; });
  const m = /ROW=(-?\d+)/.exec(s);
  return { tag: tags[0] || '', row: m ? Number(m[1]) : null, tags: tags };
}
const isExpense = function (t) { return t.type === 'Expense' || t.type === 'مصروف'; };
const isRefund = function (t) { return t.type === 'Refund' || t.type === 'استرجاع'; };

/**
 * @param ymd       the day
 * @param finances  Finance objects (financialRowToObject_ shape) dated ymd
 * @param visits    Visit objects of that day
 * @param opts      { consultationFee }
 */
function buildIncome(ymd, finances, visits, opts) {
  const fee = Number(opts && opts.consultationFee) || 0;
  const groups = {};
  ORDER.forEach(function (k) { groups[k] = { key: k, label: LABELS[k], total: 0, count: 0, items: [] }; });
  const add = function (key, item) {
    const g = groups[key];
    item.struck = !!item.struck; item.tag = item.tag || null; item.note = item.note || '';
    g.items.push(item); g.count++;
    if (!item.struck) g.total += item.amount;
  };

  const consultByRow = new Map(), refundByRow = new Map(), usedConsult = new Set(), absorbed = new Set();
  const others = [];
  (finances || []).forEach(function (t) {
    const ni = noteInfo(t.notes);
    if (isExpense(t)) { others.push({ t: t, kind: 'expense' }); return; }
    if (isRefund(t)) {
      if (ni.tag === 'REFUND' && ni.row !== null) refundByRow.set(ni.row, t);
      others.push({ t: t, kind: ni.tag === 'REFUND' ? 'refund-consult' : ni.tag === 'EXTRA-REVERSE' ? 'refund-extra' : 'refund' });
      return;
    }
    if (t.type === 'Consultation' || ni.tag === 'VISIT') {
      if (ni.row !== null) consultByRow.set(ni.row, t);
      others.push({ t: t, kind: 'consult', row: ni.row });
      return;
    }
    if (t.type === 'Surgery' || ni.tag === 'SURGERY') { others.push({ t: t, kind: 'surgery' }); return; }
    if (t.amount > 0) others.push({ t: t, kind: 'extra' });
  });

  // 1) consultation group: one item per visit of the day
  (visits || []).forEach(function (v) {
    if (v.consultationPaid === 'مستورد') return;
    const cr = consultByRow.get(v.rowNumber), rf = refundByRow.get(v.rowNumber);
    if (cr) {
      usedConsult.add(cr);
      if (rf && Math.abs(rf.amount) === cr.amount) {
        absorbed.add(rf);
        add('consult', { label: v.fullName, amount: cr.amount, struck: true, tag: 'free', note: 'مُرجَعة' });
      } else {
        add('consult', { label: v.fullName, amount: cr.amount, note: v.consultationPaid === 'مسترد' ? 'أُرجعت في يوم آخر' : '' });
      }
    } else if (v.consultationPaid === 'مسترد' || v.isFreeVisit === 'نعم') {
      add('consult', { label: v.fullName, amount: fee, struck: true, tag: 'free' });
    } else if (v.consultationPaid === 'نعم') {
      add('consult', { label: v.fullName, amount: fee, struck: true, tag: 'review', note: 'لا يوجد قيد مالي' });
    } else {
      add('consult', { label: v.fullName, amount: fee, struck: true, tag: 'review' });
    }
  });
  // 2) every other finance row
  others.forEach(function (o) {
    const t = o.t;
    if (o.kind === 'consult') {
      if (!usedConsult.has(t)) add('consult', { label: t.itemName.replace(/^Consultation\s*-\s*/, ''), amount: t.amount });
    } else if (o.kind === 'extra') {
      add('extra', { label: t.itemName, amount: t.amount });
    } else if (o.kind === 'surgery') {
      add('surgery', { label: t.itemName, amount: t.amount });
    } else if (o.kind === 'expense') {
      const meta = M.parseJsonSafe(t.notes, null), isMeta = meta && typeof meta === 'object' && meta.kind === 'expense';
      const own = isMeta && meta.deductFromClinic === false;
      const qty = isMeta ? Number(meta.quantity) : 1;
      const note = isMeta ? (meta.note || (qty > 1 ? qty + ' × ' + Number(meta.unitPrice) : '')) : '';
      add(own ? 'expenseOwn' : 'expenseClinic', { label: t.itemName, amount: Math.abs(t.amount), note: note });
    } else if (!absorbed.has(t)) { // refunds
      add('refund', {
        label: t.itemName.replace(/^Consultation Refund\s*-\s*/, '').replace(/^Reverse\s+/, ''), amount: Math.abs(t.amount),
        note: o.kind === 'refund-consult' ? 'إرجاع كشفية' : o.kind === 'refund-extra' ? 'إلغاء أجر إضافي' : ''
      });
    }
  });

  const inc = groups.consult.total + groups.extra.total + groups.surgery.total;
  const totals = {
    income: inc, refunds: groups.refund.total, expensesClinic: groups.expenseClinic.total, expensesOwn: groups.expenseOwn.total,
    net: inc - groups.refund.total - groups.expenseClinic.total
  };
  const donut = ORDER.filter(function (k) { return groups[k].total > 0; }).map(function (k) { return { key: k, label: LABELS[k], value: groups[k].total }; });
  return { ymd: ymd, hidden: false, totals: totals, groups: ORDER.map(function (k) { return groups[k]; }), donut: donut };
}

function emptyIncome(ymd, hidden) { return Object.assign(buildIncome(ymd, [], [], {}), { hidden: !!hidden }); }

module.exports = { buildIncome, emptyIncome, noteInfo, LABELS, ORDER };
