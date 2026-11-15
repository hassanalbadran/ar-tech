# Desktop bridge contract — `window.cm`

The desktop app has two halves that are built independently and meet at this contract:

* **Data layer (main process, Node)** — `desktop/lib/*`, `desktop/main.js`, `desktop/preload.js`. Local SQLite mirror, sync engine + outbox, license client, printing, settings, auto-update.
* **Renderer (UI)** — `desktop/renderer/*`. Plain HTML/CSS/JS (no framework, no build step, no npm dependency), RTL Arabic, talks **only** to `window.cm`.

`preload.js` exposes `window.cm` via `contextBridge`; every method returns a Promise and is routed by `ipcRenderer.invoke('cm:<method>', ...args)`. For browser testing there is `desktop/dev/http-bridge.js` (Node http server serving the renderer and `POST /cm/<method>` + Server-Sent-Events `/cm/events`) and `desktop/renderer/bridge-http.js` (defines `window.cm` over fetch when `window.cm` is not already defined). Same methods, same shapes.

All errors reject with `Error` whose `message` is a user-ready **Arabic** sentence.

## Shapes

The shapes `Visit`, `Booking`, `Finance`, `Surgery` are exactly what the server mappers return: `patientRowToObject_`, `bookingRowToObject_`, `financialRowToObject_`, `surgeryRowToObject_` in `server/Code.gs`. Read them. Extra computed fields on `Visit`: `refunded:boolean`.

## Events (main → renderer)

`cm.on(name, fn) → unsubscribe`. Names: `state` (state object changed), `data` (local data changed: re-query what you show), `toast` (`{text, kind:'ok'|'warn'|'err'}`), `event` (a secretary event: `{id,type,severity:'danger'|'warning'|'info',message,patientName}`).

## Methods

### App / settings
| method | returns |
|---|---|
| `state()` | `{ version, linked:boolean, clinicName, doctorName, settings, config, license:{status:'trial'\|'active'\|'expired'\|'revoked'\|'unknown', daysLeft, message}, sync:{online, state:'idle'\|'syncing'\|'error', lastSyncAt, pending, error} }` |
| `setSettings(patch)` | new `settings` (deep merge) |
| `verifyPin(kind, pin)` | `boolean` (`kind` = `hide` \| `finance`) |
| `changePin(kind, oldPin, newPin)` | `true` or rejects |
| `quit()` | – |

`settings` keys: `role` (`secretary`\|`doctor`), `doctorName`, `clinicName`, `logo` (data URL), `theme:{palette:1..4, mode:'light'\|'dark'\|'system', fontScale:0.9..1.4, contrast:'normal'\|'high'}`, `printer:{enabled, printerName, paperType, paperSize:'A5'\|'A4'\|'custom', customWmm, customHmm, template:{image:dataURL, widthMm, heightMm, safeArea:{x,y,w,h}, notesArea:{x,y,w,h}} }` (areas are **fractions 0..1 of the template image**), `hiddenDays:[ymd]`, `firstRunDone:boolean`. PIN values are never returned to the renderer.

### Link / first run
| `link({url, code})` | pairs with a clinic backend: calls `pair`, stores token, downloads config + first full sync (emits `state` progress `{phase:'pairing'\|'downloading', done, total}`) |
| `unlink()` | wipes token + local data (keeps settings) |
| `androidPairing()` | `{ qrText, code, expiresAt }` where `qrText = 'cm1\|<url>\|<code>'` |
| `syncNow({full})` | forces delta (or full snapshot when `full:true`) |
| `exportData()` | opens a save dialog and writes a JSON export of the local DB; returns `{path}` |
| `importFile()` | opens a dialog for a JSON export or the legacy CSV; returns summary |

### Read (always local, instant, work offline)
| `getDay(ymd)` | `{ ymd, hidden:boolean, visits:Visit[], bookings:Booking[] }` — `hidden` days return empty lists unless `{includeHidden:true}` is passed as 2nd arg |
| `monthSummary(ym)` | `{ 'YYYY-MM-DD': {visits, bookings, income} … }` (days with data only; hidden days excluded) |
| `search(q)` | `[{ patientId, fullName, age, phone, lastVisitDate, visitCount, latest:Visit }]` max 25; matches name (nameKey), phone digits, patient id |
| `profile(patientId)` | `{ patient:Visit, history:Visit[] (newest first), operations:[], totalVisits }` |
| `doctorContext(patientId, rowNumber)` | `{ previousDiagnosis:{text,visitDate}\|null, lastPrescriptions:{visitDate,items}\|null }` |
| `slots(ymd)` | `{ date, dates:[bookable ymd…], now:{ymd,hm}, slots:[{time,hour,count,hourCount,capacity,full,past}] }` computed locally with `shared/core.js` over local bookings |
| `income(ymd)` | see below |
| `surgeries()` | `Surgery[]` (open ones first) |
| `drugs()` | `[{name,form,strength,unit,useCount}]` |
| `events()` | today's secretary events `[{id,type,severity,message,…}]` |
| `feePreview(patientId)` | `{free, daysSince, anchorDate, reason, fee}` using `ClinicCore.reviewFee` |

`income(ymd)` returns:
```
{ ymd,
  totals:{ income, refunds, expensesClinic, expensesOwn, net },
  groups:[ { key:'consult'|'extra'|'surgery'|'refund'|'expenseClinic'|'expenseOwn',
             label, total, count,
             items:[ { label, amount, struck:boolean, tag:null|'free'|'review', note } ] } ],
  donut:[ { key, label, value } ]   // income, refunds/free, expenses… for the ring chart
}
```
Consultation group items: one per visit of the day — paid ones `{label:name, amount:15000}`; free reviews `{label:name, amount:15000, struck:true, tag:'free'}` (amount shown struck with the word free above it); refunded (FREE button) `struck:true, tag:'free'`; plain review visits that are not charged `struck:true, tag:'review'`.

### Write (optimistic; queued when offline; return `{ ok:true, queued:boolean, result }`)
| `addVisit(payload)` | `addNewVisitOrPatient` payload (+ `mode:'free'\|'paid'`). `result` is the server answer or, when queued, a provisional `{patient}` |
| `saveVisit(payload)` | `saveDoctorVisit` payload |
| `addRx(payload)` | `addPrescriptionToVisit` payload |
| `addBooking({patientName, phone, date, time})` | validates locally with `ClinicCore` (phone, hours, capacity) before queueing |
| `setBookingStatus(bookingId, status)` | |
| `addSurgery(payload)` / `setSurgeryStatus(payload)` | |
| `addExpense({date, itemName, quantity, unitPrice, fromClinicIncome})` | `fromClinicIncome:false` = paid from the doctor's own pocket |
| `hideDay(ymd, pin)` / `unhideDay(ymd, pin)` | local only, never touches Sheets |

### Printing / license
| `printers()` | `[{name, isDefault}]` |
| `rxHtml(rowNumber)` | HTML string of the prescription page exactly as it will print (also used for the preview) |
| `printRx(rowNumber)` | prints if `settings.printer.enabled`; resolves `{printed:boolean}` |
| `printTest()` | prints a test page with the safe-area outline |
| `licenseStatus()` / `activate(key)` / `checkLicense()` | license object |
| `checkUpdate()` | `{ available, version, notes }` — GitHub Releases |
| `installUpdate()` | downloads/installs/restarts |
| `openExternal(url)` | opens in browser (only https + an allow-list) |

## Additions (boot, clinic config)

| method | returns |
|---|---|
| `boot()` | Resolves when the data layer is ready to render: settings loaded, DB open, license checked (cached answer is fine, never wait more than 4 s for the network), and — when linked — local data loaded (a quick `delta` is attempted but must not block more than 4 s). While running it emits `boot` events `{ phase:'settings'\|'database'\|'license'\|'data'\|'done', pct:0..100 }`. Resolves with the same object as `state()`. |
| `saveClinicConfig(patch)` | `patch` keys `clinicName, doctorName, consultationFee, freeReviewDays, rules`. Saves to local settings **and** to the server (`setConfig`, using the stored finance PIN); queued when offline. Returns the new config. |
| `setFinancePin(pin)` | stores the finance PIN used for server finance calls (first run / when changed on the server). Never returned by `state()`. |

Event `boot` is added to the list of events.

## File layout (desktop)

```
desktop/
  package.json  electron-builder.yml  config.js  main.js  preload.js
  build/icon.png                 generic app icon
  lib/   core.js (copy of shared/core.js)  sqlite.js db.js store.js sync.js outbox.js applyLocal.js income.js
         license.js settings.js rxprint.js updater.js api.js (the method registry used by IPC *and* the dev bridge)
  dev/http-bridge.js             browser testing server
  test/                          node --test files (+ a fake Apps Script server)
  renderer/ index.html  css/  js/  core.js (copy)  qr.js  bridge-http.js  dev/fake-bridge.js  fonts/
```
