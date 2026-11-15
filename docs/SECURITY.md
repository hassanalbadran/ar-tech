# Security notes / ملاحظات الأمان

## What is protected
- **One public door.** Only `doGet`, `doPost`, `setupSheets`, `siteCall` are public (enforced by a test). No hidden functions, no debug endpoints, no remote-code paths, no analytics, no telemetry; the apps talk only to your Apps Script URL (Android: host allow-list `script.google.com`, `script.googleusercontent.com`, `api.github.com`).
- **Allow-list + rate limits + size caps + lockouts** on every entry (see `docs/API.md`).
- **Device tokens** are random, stored hashed on the server, revocable; the pairing code is one-time and expires in 10 minutes.
- **Sheet formula injection:** non-numeric columns are written as text (`@` format), so `=HYPERLINK(...)` typed by a visitor stays text.
- **XSS:** every dynamic value put into HTML goes through `U.E()` / `E()` (escape of `& < > " '`), including attribute values.
- **Android:** secure prefs (EncryptedSharedPreferences) for tokens/PIN, no cleartext traffic, `allowBackup=false`.
- **Light on data:** `rev` polling (a few bytes), `delta` instead of full snapshots, adaptive back-off when idle/offline, 12-hour license re-check, Android background sync every 15 minutes and only fetches when `rev` changed.

## What you must do (5 minutes)
1. Apps Script → Project settings → Script properties: set `ADMIN_PIN` and `FINANCE_PIN` (do not keep defaults). Optional: `SITE_ACCESS_CODE` to require a code on the website.
2. Run `setupSheets` once, deploy as a web app (execute as you, access: anyone).
3. Prefer a **separate** Apps Script project for the license server.
4. Never commit real URLs/keys to a public fork; the build constants are in `desktop/config.js` and `android/.../config.js`.

## Honest limits
- Whoever has the website URL can use the website (like the reception desk) unless you set `SITE_ACCESS_CODE`.
- A wrong-PIN lockout is global, so a hostile visitor can lock the owner out for 10 minutes (preferred over letting a brute force run).
- The license check in official builds can be removed in a fork (by design; MIT).
- Apps Script itself has quotas; the limits above keep abuse from exhausting them quickly but cannot replace a real server.

Report problems privately to the developer (see README).
