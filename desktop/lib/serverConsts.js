'use strict';
/** Constants mirrored from server/Code.gs. Used as defaults when the server `config` action has not been fetched yet. */
const HEADERS = {
  Patient_Records: ['Patient_ID', 'Full_Name', 'Age', 'Gender', 'Address', 'Phone', 'Secondary_Phone', 'Escorts_Count', 'Visit_Date', 'Last_Visit_Date',
    'Diagnosis', 'Prescriptions_JSON', 'Tests_Requested', 'Has_Ready_Tests', 'Consultation_Paid', 'Is_Free_Visit', 'Surgery_Info_JSON', 'Notes',
    'Visit_Status', 'Extra_Charges_JSON', 'Status_Info_JSON'],
  Financials: ['Transaction_ID', 'Date', 'Type', 'Item_Name', 'Amount', 'Payment_Status', 'Notes'],
  Bookings: ['Booking_ID', 'Patient_Name', 'Call_Time', 'Phone', 'Requested_Slot', 'Status'],
  Surgeries: ['Surgery_ID', 'Patient_ID', 'Patient_Name', 'Phone', 'Operation_Type', 'Operation_Date', 'Operation_Time', 'Location', 'Details', 'Amount',
    'Payment_Status', 'Status', 'Source_Row', 'Created_At', 'Updated_At'],
  Drugs: ['Drug_Name', 'Form', 'Strength', 'Unit', 'Use_Count', 'Last_Used', 'Created_At']
};
const SHEETS = ['Patient_Records', 'Financials', 'Surgeries', 'Drugs', 'Bookings'];
const VISIT_STATUSES = ['waiting', 'closed', 'finished', 'postponed'];
const TEST_LABELS = { MRI: 'رنين مغناطيسي', CT: 'مفراس', 'X-Ray': 'أشعة', EMG: 'تخطيط أعصاب', Lab: 'فحوصات مختبرية' };
const TEST_ALIASES = {
  mri: 'MRI', 'رنين': 'MRI', 'رنين مغناطيسي': 'MRI', ct: 'CT', 'مفراس': 'CT', 'سي تي': 'CT',
  'x-ray': 'X-Ray', xray: 'X-Ray', 'x ray': 'X-Ray', 'اشعة': 'X-Ray', 'أشعة': 'X-Ray',
  emg: 'EMG', 'تخطيط اعصاب': 'EMG', 'تخطيط أعصاب': 'EMG', nerve: 'EMG',
  lab: 'Lab', 'تحاليل دم': 'Lab', 'تحاليل': 'Lab', 'مختبر': 'Lab', 'فحوصات مختبرية': 'Lab'
};
const RX_TIMING_LABELS = {
  morning: 'صباحاً', noon: 'ظهراً', evening: 'مساءً', after_meal: 'بعد الأكل', before_meal: 'قبل الأكل', after_breakfast: 'بعد الفطور',
  after_lunch: 'بعد الغداء', after_dinner: 'بعد العشاء', before_breakfast: 'قبل الفطور', before_lunch: 'قبل الغداء', before_dinner: 'قبل العشاء',
  every: 'مرة كل (ساعات)', every_4h: 'كل 4 ساعات', other: 'أخرى'
};
/** Same keys in English: what is stored in the record and printed on prescriptions (Index.html RXE). */
const RX_TIMING_EN = {
  morning: 'Morning', noon: 'Noon', evening: 'Evening', after_meal: 'After meal', before_meal: 'Before meal', after_breakfast: 'After breakfast',
  after_lunch: 'After lunch', after_dinner: 'After dinner', before_breakfast: 'Before breakfast', before_lunch: 'Before lunch',
  before_dinner: 'Before dinner', every_4h: 'Every 4 h'
};
const RX_FORMS = [
  ['Tab', 'قرص', 'mg', 'فموي صلب'], ['Cap', 'كبسولة', 'mg', 'فموي صلب'], ['ODT', 'قرص يذوب بالفم', 'mg', 'فموي صلب'], ['Chew Tab', 'قرص للمضغ', 'mg', 'فموي صلب'],
  ['SR Tab', 'قرص ممتد المفعول', 'mg', 'فموي صلب'], ['EC Tab', 'قرص معوي', 'mg', 'فموي صلب'], ['SL Tab', 'قرص تحت اللسان', 'mg', 'فموي صلب'],
  ['Eff Tab', 'قرص فوار', 'mg', 'فموي صلب'], ['Lozenge', 'أقراص مص', 'mg', 'فموي صلب'], ['Sachet', 'كيس / ظرف', 'g', 'فموي صلب'], ['Powder', 'بودرة', 'g', 'فموي صلب'],
  ['Syr', 'شراب', 'ml', 'فموي سائل'], ['Susp', 'معلّق', 'ml', 'فموي سائل'], ['Soln', 'محلول فموي', 'ml', 'فموي سائل'], ['Elixir', 'إكسير', 'ml', 'فموي سائل'],
  ['Oral Drops', 'قطرات فموية', 'ml', 'فموي سائل'], ['Emulsion', 'مستحلب', 'ml', 'فموي سائل'],
  ['Amp', 'أمبولة', 'mg', 'حقن ومحاليل'], ['Vial', 'فيال', 'mg', 'حقن ومحاليل'], ['Inj IM', 'حقنة عضلية', 'mg', 'حقن ومحاليل'], ['Inj IV', 'حقنة وريدية', 'mg', 'حقن ومحاليل'],
  ['Inj SC', 'حقنة تحت الجلد', 'mg', 'حقن ومحاليل'], ['PFS', 'حقنة جاهزة', 'mg', 'حقن ومحاليل'], ['IV Inf', 'مصل / محلول وريدي', 'ml', 'حقن ومحاليل'],
  ['Oint', 'مرهم', 'g', 'موضعي'], ['Cream', 'كريم', 'g', 'موضعي'], ['Gel', 'جل', 'g', 'موضعي'], ['Paste', 'معجون', 'g', 'موضعي'], ['Lotion', 'لوشن', 'ml', 'موضعي'],
  ['Topical Soln', 'محلول موضعي', 'ml', 'موضعي'], ['Spray', 'بخاخ موضعي', 'puff', 'موضعي'], ['Patch', 'لصقة', 'mg', 'موضعي'], ['Shampoo', 'شامبو', 'ml', 'موضعي'],
  ['Eye Drops', 'قطرة عين', 'drops', 'عين / أذن / أنف'], ['Eye Oint', 'مرهم عين', 'g', 'عين / أذن / أنف'], ['Ear Drops', 'قطرة أذن', 'drops', 'عين / أذن / أنف'],
  ['Nasal Drops', 'قطرة أنف', 'drops', 'عين / أذن / أنف'], ['Nasal Spray', 'بخاخ أنف', 'puff', 'عين / أذن / أنف'],
  ['Inhaler', 'بخاخ استنشاق', 'mcg', 'تنفسي'], ['Neb Soln', 'محلول بخار (نيبولايزر)', 'ml', 'تنفسي'],
  ['Supp', 'تحميلة', 'mg', 'شرجي / مهبلي / فموي'], ['Enema', 'حقنة شرجية', 'ml', 'شرجي / مهبلي / فموي'], ['Pessary', 'تحميلة مهبلية', 'mg', 'شرجي / مهبلي / فموي'],
  ['Vag Cream', 'كريم مهبلي', 'g', 'شرجي / مهبلي / فموي'], ['Mouthwash', 'غسول فم', 'ml', 'شرجي / مهبلي / فموي'], ['Oral Gel', 'جل فموي', 'g', 'شرجي / مهبلي / فموي'],
  ['Other', 'أخرى', '', 'أخرى']
];
const EXTRA_FEES = { consultation: { label: 'كشفية', amount: 15000 }, stitches: { label: 'رفع خيوط', amount: 15000 } };
const BOOKING_STATUSES = ['Pending', 'حضر', 'لم يحضر', 'تم الحجز', 'ملغى'];

module.exports = { HEADERS, SHEETS, VISIT_STATUSES, TEST_LABELS, TEST_ALIASES, RX_TIMING_LABELS, RX_TIMING_EN, RX_FORMS, EXTRA_FEES, BOOKING_STATUSES };
