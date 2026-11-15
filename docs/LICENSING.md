# Licensing & activation

Source code: MIT (see `LICENSE`) — fork it, change it, ship your own build; keep the copyright notice (that is the credit).

Official builds (the ones published on this repository's *Releases*) are governed by `TERMS.md`:
**30-day free trial, then an activation key is required.** The key is created by the developer from the web admin panel.

## Flow

1. First start: the app generates a random `deviceId` (stored locally) and calls `licenseCheck` on the license server (`LICENSE_SERVER_URL`, a build constant in `desktop/config.js` and `android/app/src/main/assets/app/config.js`).
2. The server registers the device with `FirstSeen = now` → `{ status:'trial', daysLeft:30 }`.
3. Offline start: the app uses the cached answer (trial: counts from the locally stored first-run date; active: valid for 14 days without contact).
4. `expired` → the app shows "انتهت الفترة التجريبية" with **تواصل مع المطوّر** (link to the developer site) and **لدي مفتاح تفعيل**.
5. `licenseActivate { deviceId, key }` binds the device to the key (limit = key's `MaxDevices`).

## Sheets (created by `setupSheets`)

`Licenses`: `Key, Label, Type(full), MaxDevices, ExpiresAt, Status(active|revoked), Usage(غير مصنّف|غير تجاري|تجاري), CreatedAt, Notes`
`LicenseDevices`: `DeviceId, Key, Platform, Label, FirstSeen, LastSeen, AppVersion, Checks, Status`

## Admin panel

Inside the website: hidden "المطوّر" button (long-press the logo / `?admin=1`) → PIN (`ADMIN_PIN` script property) → create key, list keys with device counts and last use, revoke, set usage classification, link new devices (pairing code), list paired devices.

## Honest limits

A client-side check can be removed by anyone who forks the code. That is accepted by design (forks are allowed). The check only controls *official* builds.

Recommended: deploy the license server as a **separate** Apps Script project (same `Code.gs`, an empty sheet), so that other people's devices never touch the clinic's patient data deployment.
