'use strict';
/** Demo data for the fake clinic (used by dev bridge --demo and UI tests). `gas` = tools/gas-emulator instance. Clinic "now" must be a weekday afternoon. */
function seedDemo(gas) {
  const day = n => { const d = new Date(gas.now() + 3 * 3600000 - n * 86400000); return d.toISOString().slice(0, 10); };
  gas.call('cmSetConfig_', { pin: '1234', patch: { doctorName: 'زيد سمير' } });
  const real = gas.now();
  const mk = (name, age, gender, phone, daysAgo, extra) => {
    gas.setNow(real - daysAgo * 86400000);
    return gas.call('addNewVisitOrPatient', Object.assign({ fullName: name, age: String(age), gender: gender, phone: phone, address: 'الحلة', escortsCount: '', notes: '', paidConfirmation: true }, extra || {}));
  };
  const people = [
    ['علي حسن الجبوري', 42, 'ذكر', '07701112233', 12], ['سارة كريم العبيدي', 31, 'أنثى', '07712223344', 9], ['محمد عبد الأمير', 58, 'ذكر', '07723334455', 8],
    ['زينب فاضل', 27, 'أنثى', '07734445566', 6], ['حيدر ناصر', 36, 'ذكر', '07745556677', 4]
  ];
  const first = people.map(p => mk(p[0], p[1], p[2], p[3], p[4]));
  gas.setNow(real - 2 * 86400000);
  // a free review of the 4-days-ago patient and a few visits today
  mk('حيدر ناصر', 36, 'ذكر', '07745556677', 2, { patientId: first[4].patient.patientId });
  gas.setNow(real);
  mk('علي حسن الجبوري', 42, 'ذكر', '07701112233', 0, { patientId: first[0].patient.patientId });
  mk('رنا صالح', 8, 'أنثى', '07756667788', 0);
  mk('كرار هادي', 49, 'ذكر', '07767778899', 0);
  const slot = (d, i) => (new Date(d + 'T12:00:00Z').getUTCDay() === 5 ? ['09:00', '09:30', '10:00'] : ['16:00', '16:30', '17:00'])[i];
  gas.call('addNewBooking', { patientName: 'أحمد ياسر', phone: '07778889900', date: day(-1), time: slot(day(-1), 0) });
  gas.call('addNewBooking', { patientName: 'مريم علي', phone: '07789990011', date: day(-1), time: slot(day(-1), 1) });
  gas.call('addNewBooking', { patientName: 'عباس كاظم', phone: '07790001122', date: day(-2), time: slot(day(-2), 2) });
  gas.setNow(real);
  return first;
}
module.exports = { seedDemo };
