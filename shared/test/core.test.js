'use strict';
const assert = require('assert');
const C = require('../core.js');
let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok  ' + name); };

t('phone: 07 + 9 digits', () => assert.deepStrictEqual(C.normalizePhone('07701234567'), { ok: true, value: '07701234567', error: '' }));
t('phone: 7 + 9 digits adds zero', () => assert.strictEqual(C.normalizePhone('7701234567').value, '07701234567'));
t('phone: arabic digits', () => assert.strictEqual(C.normalizePhone('٠٧٧٠١٢٣٤٥٦٧').value, '07701234567'));
t('phone: +964', () => assert.strictEqual(C.normalizePhone('+964 770 123 4567').value, '07701234567'));
t('phone: too short with 0', () => assert.strictEqual(C.normalizePhone('0770123456').ok, false));
t('phone: too long', () => assert.strictEqual(C.normalizePhone('077012345678').ok, false));
t('phone: empty', () => assert.strictEqual(C.normalizePhone('').ok, false));
t('phone: junk', () => assert.strictEqual(C.normalizePhone('abc').ok, false));
t('phone: spaces and dashes', () => assert.strictEqual(C.normalizePhone('0770-123 4567').value, '07701234567'));

t('weekday: 2026-11-13 is Friday', () => assert.strictEqual(C.isFriday('2026-11-13'), true));
t('weekday: 2026-11-12 is Thursday', () => assert.strictEqual(C.weekday('2026-11-12'), 4));
t('addDays crosses month', () => assert.strictEqual(C.addDays('2026-11-30', 2), '2026-12-02'));
t('partsInTz Baghdad', () => assert.deepStrictEqual(C.partsInTz(new Date('2026-11-11T22:30:00Z')), { ymd: '2026-11-12', hm: '01:30' }));

t('slots weekday 15:30..18:30', () => {
  const s = C.slotTimes('2026-11-11');
  assert.strictEqual(s[0], '15:30'); assert.strictEqual(s[s.length - 1], '18:30'); assert.strictEqual(s.length, 7);
});
t('slots friday 08:00..11:30', () => {
  const s = C.slotTimes('2026-11-13');
  assert.strictEqual(s[0], '08:00'); assert.strictEqual(s[s.length - 1], '11:30'); assert.strictEqual(s.length, 8);
});

t('businessDay: Wed 17:00 -> Wed', () => assert.strictEqual(C.businessDay({ ymd: '2026-11-11', hm: '17:00' }), '2026-11-11'));
t('businessDay: Wed 19:00 -> Thu', () => assert.strictEqual(C.businessDay({ ymd: '2026-11-11', hm: '19:00' }), '2026-11-12'));
t('businessDay: Thu 19:30 -> Fri', () => assert.strictEqual(C.businessDay({ ymd: '2026-11-12', hm: '19:30' }), '2026-11-13'));
t('businessDay: Fri 11:59 -> Fri', () => assert.strictEqual(C.businessDay({ ymd: '2026-11-13', hm: '11:59' }), '2026-11-13'));
t('businessDay: Fri 12:00 -> Sat', () => assert.strictEqual(C.businessDay({ ymd: '2026-11-13', hm: '12:00' }), '2026-11-14'));
t('businessDay: early morning Mon 01:30 -> Mon', () => assert.strictEqual(C.businessDay({ ymd: '2026-11-16', hm: '01:30' }), '2026-11-16'));

t('bookable: today + 4 days', () => {
  const d = C.bookableDates({ ymd: '2026-11-11', hm: '16:00' });
  assert.deepStrictEqual(d, ['2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15']);
});

const mk = (time, status) => ({ callDate: '2026-11-11', slotTime: time, status: status || 'Pending' });
t('4 at 16:00 -> hour full, 16:30 also full (hour mode), 17:00 open', () => {
  const b = [mk('16:00'), mk('16:00'), mk('16:00'), mk('16:00')];
  const a = C.slotAvailability('2026-11-11', b);
  const by = {}; a.forEach(x => by[x.time] = x);
  assert.strictEqual(by['16:00'].full, true); assert.strictEqual(by['16:30'].full, true); assert.strictEqual(by['17:00'].full, false);
});
t('spec example: 3 at 16:00 + 1 at 16:30 -> next must be 17:00', () => {
  const b = [mk('16:00'), mk('16:00'), mk('16:00'), mk('16:30')];
  const a = C.slotAvailability('2026-11-11', b);
  assert.strictEqual(C.firstOpenSlot('2026-11-11', b), '15:30');
  assert.ok(a.find(x => x.time === '16:00').full && a.find(x => x.time === '16:30').full);
  assert.strictEqual(C.canBook('2026-11-11', '16:30', b).ok, false);
  assert.strictEqual(C.canBook('2026-11-11', '17:00', b).ok, true);
});
t('slot mode: 4 at 16:00 -> 16:30 still open', () => {
  const b = [mk('16:00'), mk('16:00'), mk('16:00'), mk('16:00')];
  const a = C.slotAvailability('2026-11-11', b, { capacityMode: 'slot' });
  assert.strictEqual(a.find(x => x.time === '16:00').full, true); assert.strictEqual(a.find(x => x.time === '16:30').full, false);
});
t('cancelled bookings free the place', () => {
  const b = [mk('16:00'), mk('16:00'), mk('16:00'), mk('16:00', 'ملغى')];
  assert.strictEqual(C.canBook('2026-11-11', '16:00', b).ok, true);
});
t('bookings of other dates ignored', () => {
  const b = [1, 2, 3, 4].map(() => ({ callDate: '2026-11-12', slotTime: '16:00', status: 'Pending' }));
  assert.strictEqual(C.canBook('2026-11-11', '16:00', b).ok, true);
});
t('canBook rejects 5 days ahead and non-slot time', () => {
  const now = { ymd: '2026-11-11', hm: '16:00' };
  assert.strictEqual(C.canBook('2026-11-16', '16:00', [], null, now).ok, false);
  assert.strictEqual(C.canBook('2026-11-15', '16:00', [], null, now).ok, true);
  assert.strictEqual(C.canBook('2026-11-11', '16:15', []).ok, false);
});
t('past slots flagged on current day', () => {
  const a = C.slotAvailability('2026-11-11', [], null, { ymd: '2026-11-11', hm: '16:40' });
  assert.strictEqual(a.find(x => x.time === '16:00').past, true); assert.strictEqual(a.find(x => x.time === '16:30').past, false); assert.strictEqual(a.find(x => x.time === '17:00').past, false);
});

const V = (d, free) => ({ visitDate: d, isFreeVisit: free ? 'نعم' : 'لا' });
t('fee: new patient pays', () => assert.strictEqual(C.reviewFee([], '2026-11-01').free, false));
t('fee spec: paid 1/11, 2/11 free', () => assert.strictEqual(C.reviewFee([V('2026-11-01')], '2026-11-02').free, true));
t('fee spec: then 3/11 paid (free already used)', () => assert.strictEqual(C.reviewFee([V('2026-11-01'), V('2026-11-02', true)], '2026-11-03').free, false));
t('fee: day 5 still free', () => assert.strictEqual(C.reviewFee([V('2026-11-01')], '2026-11-06').free, true));
t('fee: day 6 paid', () => assert.strictEqual(C.reviewFee([V('2026-11-01')], '2026-11-07').free, false));
t('fee: new paid visit restarts window', () => assert.strictEqual(C.reviewFee([V('2026-11-01'), V('2026-11-02', true), V('2026-11-03')], '2026-11-04').free, true));
t('fee: order of visits irrelevant', () => assert.strictEqual(C.reviewFee([V('2026-11-02', true), V('2026-11-01')], '2026-11-03').free, false));

t('greeting', () => { assert.strictEqual(C.greeting(7), 'صباح الخير'); assert.strictEqual(C.greeting(16), 'مساء الخير'); });
t('money', () => assert.strictEqual(C.money(1234567), '1,234,567 د.ع'));
t('nameKey unifies alef/yaa', () => assert.strictEqual(C.nameKey('أحمد  عَلي'), C.nameKey('احمد علي')));
console.log('\n' + n + ' tests passed');
