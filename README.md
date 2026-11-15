<div align="center">

<img src="docs/clinic-logo.png" width="96" alt="logo" />

# Clinic Manager · إدارة العيادة

**موقع + تطبيق حاسبة (Windows) + تطبيق أندرويد — كلها تتزامن مع Google Sheets**
Website + Windows desktop app + Android app — one Google Sheet, always in sync.

![license](https://img.shields.io/badge/code-MIT-2ea043)
![official builds](https://img.shields.io/badge/official%20builds-30--day%20trial-0a7ea4)
![platform](https://img.shields.io/badge/platform-Web%20·%20Windows%20·%20Android-6e56cf)
![backend](https://img.shields.io/badge/backend-Google%20Apps%20Script-4285f4)
![made by](https://img.shields.io/badge/made%20by-Hasn-111827)

</div>

> **Made by Hasn** · [`@hasn2mr`](https://github.com/hasn2mr) — الكود مفتوح، يمكنك عمل Fork وتعديله بشرط الإبقاء على الاعتماد (الاسم أعلاه وملف `LICENSE`).
> Open source: fork it, change it, keep the credit.

---

## المحتويات / Contents
1. [نظرة عامة](#نظرة-عامة--overview)
2. [التركيب بخمس خطوات](#التركيب-بخمس-خطوات--setup)
3. [ربط التطبيقات (رمز لمرة واحدة)](#ربط-التطبيقات--pairing)
4. [قواعد الحجز والكشفيات](#قواعد-الحجز-والكشفيات--clinic-rules)
5. [الترخيص](#الترخيص--licensing)
6. [الأمان والخفّة](#الأمان-والخفة--security--efficiency)
7. [البناء من المصدر](#البناء-من-المصدر--building)
8. [بنية المشروع](#بنية-المشروع--layout)
9. [الاختبارات](#الاختبارات--tests)
10. [حدود صريحة](#حدود-صريحة--honest-limits)

## نظرة عامة / Overview

| | الموقع | تطبيق الحاسبة | تطبيق أندرويد |
|---|---|---|---|
| الدور | استقبال + الطبيب من أي جهاز | السكرتير (الافتراضي) مع «عرض كطبيب» | الطبيب: إحصائيات، مراجعة السجلات والحجوزات |
| البيانات | Google Sheets مباشرة | SQLite محلي + طابور عمل دون اتصال | عميل خفيف مع تخزين مؤقت |
| التزامن | `rev` رخيص ثم `delta` فقط عند التغيير | نفس الشيء | نفس الشيء + مزامنة خلفية كل ١٥ دقيقة |

الميزات: حجز بمواعيد ثابتة (من ٣:٣٠ م كل ٣٠ د، السعة ٤ لكل ساعة، ٤ أيام للأمام)، «رفع الاسم» مجاناً، «كشفية» مع إشعار للسكرتير، قاعدة مراجعة مجانية واحدة خلال ٥ أيام، وصفة Rx بشبكة نظيفة، إخفاء اليوم برقم سري، طباعة على قالب معايَر، لوحة مطوّر للتراخيص.

## التركيب بخمس خطوات / Setup

1. **Sheet + Script:** أنشئ Google Sheet، ثم *Extensions → Apps Script*، والصق `server/Code.gs` و`server/Index.html`.
2. **Script properties** (*Project settings → Script properties*): أضف
   - `ADMIN_PIN` — رقم لوحة المطوّر
   - `FINANCE_PIN` — رقم المالية (إن لم تضعه يبقى الافتراضي `1234` وتحذّرك اللوحة)
   - `SITE_ACCESS_CODE` — **اختياري**: رمز يُطلب لفتح الموقع
3. شغّل الدالة `setupSheets` **مرة واحدة** (تنشئ الجداول وجداول التراخيص).
4. **Deploy → New deployment → Web app**: *Execute as: Me*, *Who has access: Anyone*. انسخ رابط `/exec`.
5. افتح الرابط: هذا هو الموقع. من الإعدادات اضبط اسم العيادة والكشفية والقواعد.

> رقم إخفاء اليوم الافتراضي `1289` ويتغير من الإعدادات.

## ربط التطبيقات / Pairing

لا يوجد رقم تنزيل ثابت. الربط **برمز لمرة واحدة صالح ١٠ دقائق**:
1. من الموقع (أو من تطبيق مرتبط سلفاً) اطلب **رمز ربط**.
2. في التطبيق الجديد: امسح QR (أندرويد) أو الصق الرابط والرمز (الحاسبة).
3. يُمنح الجهاز توكن عشوائي يُخزَّن مُجزَّأً (hash) في السيرفر ويمكن إلغاؤه.

## قواعد الحجز والكشفيات / Clinic rules

- ساعات العمل ٤–٧ م، الجمعة ٨–١٢ ظهراً؛ بعد الإغلاق تُحسب الحجوزات لليوم التالي.
- السعة ٤ لكل ساعة (يتحول الزر إلى رمادي عند الامتلاء)، اليوم الافتراضي هو اليوم الحالي وحتى ٤ أيام.
- **مراجعة مجانية واحدة** خلال ٥ أيام من آخر زيارة مدفوعة؛ بعدها تُحسب الكشفية.
- **رفع الاسم**: يضيف الزيارة بدون رسوم. **كشفية**: تضيف الرسم وتنبّه السكرتير.
- كل القيم قابلة للضبط من `config` (السعة، الأيام، الرسوم).

## الترخيص / Licensing

الكود: **MIT**. النسخ الرسمية (Releases) تخضع لـ [`TERMS.md`](TERMS.md): **تجربة ٣٠ يوماً ثم مفتاح تفعيل** (غير تجاري). يُنشأ المفتاح من لوحة المطوّر داخل الموقع (`?admin=1`)، وتُصنَّف التراخيص تجاري/غير تجاري ويمكن إلغاؤها ومشاهدة الاستخدام. التفاصيل: [`docs/LICENSING.md`](docs/LICENSING.md).

## الأمان والخفة / Security & efficiency

- **باب عام واحد**: `doGet, doPost, setupSheets, siteCall` فقط (يتحقق منه اختبار)، قائمة سماح، حدود معدل وحجم، أقفال على الأرقام السرية، سجل أمني بلا أسرار.
- **خفيف**: استطلاع `rev` ببضعة بايتات، `delta` بدل التحميل الكامل، تباطؤ تلقائي عند الخمول/انقطاع الشبكة، وتخزين مؤقت للأندرويد.
- تفاصيل وما يجب عليك فعله: [`docs/SECURITY.md`](docs/SECURITY.md) و[`docs/API.md`](docs/API.md).

## البناء من المصدر / Building

يُبنى كل شيء عبر **GitHub Actions** (لا يحتاج جهازك أي أدوات):

| Workflow | يفعل |
|---|---|
| `ci.yml` | فحص المزامنة، اختبارات السيرفر والجدار الناري والحاسبة، اختبارات واجهات Playwright |
| `desktop.yml` | مثبّت Windows + نسخة محمولة (يحمّل خط Readex Pro OFL) |
| `android.yml` | ملف APK، موقّع إن وُجدت الأسرار `ANDROID_KEYSTORE_B64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` |

**إصدار رسمي:** املأ `desktop/config.js` و`android/app/src/main/assets/app/config.js` (`LICENSE_SERVER_URL`, `DEVELOPER_URL`, `GITHUB_OWNER`, `GITHUB_REPO`) ثم أنشئ وسم: `git tag v1.0.0 && git push --tags`. تُرفع الملفات تلقائياً إلى Releases، ومنها يعمل فحص التحديث داخل التطبيقين.

محلياً: `cd desktop && npm i && npm start` · الأندرويد: `cd android && ./gradlew assembleDebug` (JDK 17).

## بنية المشروع / Layout

```
server/     Code.gs + Index.html (الموقع + API) + اختبارات
shared/     core.js — منطق مشترك واحد (يُنسخ بـ tools/sync-shared.js)
desktop/    Electron + SQLite + واجهة الحاسبة
android/    Kotlin WebView shell + واجهة ويب + Widget + WorkManager
tools/      gas-emulator.js, dev-server.js, sync-shared.js
docs/       API.md, BRIDGE.md, LICENSING.md, SECURITY.md
```

## الاختبارات / Tests

```bash
node tools/sync-shared.js --check
node --test server/test/server.test.js server/test/firewall.test.js
(cd desktop && node --test test/api.test.js && npm run test:ui)
(cd server && node test/ui.test.js)
(cd android && node test/ui.e2e.js)
```

## حدود صريحة / Honest limits

- أجزاء Electron الأصلية (الطباعة، النوافذ، المحدّث) وكود Kotlin/Gradle لم تُجمَّع ولم تُختبر على جهاز حقيقي بعد؛ شغّل CI وجرّب النسخة قبل الاعتماد.
- فحص الترخيص يمكن إزالته في Fork (بالتصميم). تُعاد التجربة إن حُذف معرّف الجهاز.
- الموقع مفتوح لمن يملك الرابط ما لم تضع `SITE_ACCESS_CODE`.
- نعومة التمرير مضبوطة بخصائص CSS مناسبة لكنها لم تُقَس على جهاز فعلي.

---

<div align="center">Made with care by <b>Hasn</b> · MIT · Fork it, keep the credit.</div>
