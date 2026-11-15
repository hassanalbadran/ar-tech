'use strict';
/** Exposes window.cm (docs/BRIDGE.md). Every method is a Promise routed through ipcRenderer.invoke('cm:<method>'). */
const { contextBridge, ipcRenderer } = require('electron');

const METHODS = ['state', 'boot', 'setSettings', 'verifyPin', 'changePin', 'setFinancePin', 'quit', 'link', 'unlink', 'androidPairing', 'syncNow', 'exportData', 'importFile',
  'getDay', 'monthSummary', 'search', 'profile', 'doctorContext', 'slots', 'income', 'surgeries', 'drugs', 'events', 'feePreview',
  'addVisit', 'saveVisit', 'addRx', 'addBooking', 'setBookingStatus', 'addSurgery', 'setSurgeryStatus', 'addExpense', 'hideDay', 'unhideDay', 'saveClinicConfig',
  'printers', 'rxHtml', 'printRx', 'printTest', 'licenseStatus', 'activate', 'checkLicense', 'checkUpdate', 'installUpdate', 'openExternal'];
const EVENTS = ['state', 'data', 'toast', 'event', 'boot'];

const cm = {};
METHODS.forEach(function (m) {
  cm[m] = function () {
    return ipcRenderer.invoke.apply(ipcRenderer, ['cm:' + m].concat([].slice.call(arguments))).catch(function (e) {
      // Electron wraps errors: "Error invoking remote method 'cm:x': Error: <message>" → keep only our Arabic message
      const msg = String(e && e.message || e).replace(/^Error invoking remote method '[^']*': (Error: )?/, '');
      throw new Error(msg);
    });
  };
});
cm.on = function (name, fn) {
  if (EVENTS.indexOf(name) === -1) return function () {};
  const h = function (_e, payload) { fn(payload); };
  ipcRenderer.on('cm-event:' + name, h);
  return function () { ipcRenderer.removeListener('cm-event:' + name, h); };
};
contextBridge.exposeInMainWorld('cm', cm);
