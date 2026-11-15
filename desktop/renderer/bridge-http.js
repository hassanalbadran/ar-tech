/* Defines window.cm over HTTP when the page runs outside Electron (dev bridge / Playwright). In Electron preload.js defines it first. */
(function () {
  if (window.cm) return;
  const METHODS = ['state', 'boot', 'setSettings', 'verifyPin', 'changePin', 'setFinancePin', 'quit', 'link', 'unlink', 'androidPairing', 'syncNow', 'exportData', 'importFile',
    'getDay', 'monthSummary', 'search', 'profile', 'doctorContext', 'slots', 'income', 'surgeries', 'drugs', 'events', 'feePreview',
    'addVisit', 'saveVisit', 'addRx', 'addBooking', 'setBookingStatus', 'addSurgery', 'setSurgeryStatus', 'addExpense', 'hideDay', 'unhideDay', 'saveClinicConfig',
    'printers', 'rxHtml', 'printRx', 'printTest', 'licenseStatus', 'activate', 'checkLicense', 'checkUpdate', 'installUpdate', 'openExternal'];
  const cm = {}, subs = {};
  METHODS.forEach(function (m) {
    cm[m] = function () {
      return fetch('/cm/' + m, { method: 'POST', body: JSON.stringify([].slice.call(arguments)) }).then(function (r) { return r.json(); }).then(function (j) {
        if (j.error) throw new Error(j.error); return j.result;
      });
    };
  });
  cm.on = function (name, fn) { (subs[name] = subs[name] || []).push(fn); return function () { subs[name] = (subs[name] || []).filter(function (f) { return f !== fn; }); }; };
  try {
    const es = new EventSource('/cm/events');
    es.onmessage = function (e) { try { const m = JSON.parse(e.data); (subs[m.name] || []).slice().forEach(function (f) { f(m.payload); }); } catch (x) { /* ignore */ } };
  } catch (e) { /* no SSE */ }
  window.cm = cm;
})();
