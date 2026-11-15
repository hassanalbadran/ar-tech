'use strict';
/**
 * Build-time constants. The repository owner fills these in before publishing an official build.
 *
 *  LICENSE_SERVER_URL  /exec URL of the (separate) Apps Script project that answers licenseCheck /
 *                      licenseActivate. Empty = open build: no license check, the app is always "active".
 *  GITHUB_OWNER/REPO   GitHub repository whose Releases feed the auto-updater (electron-updater).
 *                      Empty = rely on the app-update.yml that electron-builder generates at build time.
 *  DEVELOPER_URL       "Contact the developer" link (also allowed by openExternal), e.g. https://t.me/hasn2mr
 *  APP_NAME            Product name shown in window titles.
 */
module.exports = {
  LICENSE_SERVER_URL: 'https://script.google.com/macros/s/AKfycbyFYO236qrVZcS6a6g85jfbkc_up2agnFq-AXlZbBHk0sKedxMLnEEYyprpNCHvfoFaQg/exec',
  GITHUB_OWNER: 'https://github.com/hassanalbadran',
  GITHUB_REPO: 'https://github.com/hassanalbadran/ar-tech',
  DEVELOPER_URL: 'https://hasn2mr.pages.dev/',
  APP_NAME: 'Clinic Manager'
};
