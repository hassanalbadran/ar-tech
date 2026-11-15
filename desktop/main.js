'use strict';
/**
 * Electron main process: window, IPC → lib/api.js, printing, dialogs, auto-update.
 * Everything business-related lives in lib/ (tested in plain Node); this file is only the thin Electron glue.
 */
const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const config = require('./config');
const { createApi } = require('./lib/api');

if (!app.requestSingleInstanceLock()) { app.quit(); }

let win = null, api = null;

function createHooks() {
  return {
    quit: function () { app.quit(); },
    openExternal: function (url) { shell.openExternal(url); },
    printers: async function () {
      const list = win ? await win.webContents.getPrintersAsync() : [];
      return list.map(function (p) { return { name: p.name, isDefault: !!p.isDefault }; });
    },
    printHtml: function (html, o) {
      return new Promise(function (resolve, reject) {
        const pw = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, javascript: false } });
        const done = function (err) { try { pw.destroy(); } catch (e) { /* closed */ } err ? reject(err) : resolve(); };
        pw.webContents.on('did-fail-load', function (_e, code, desc) { done(new Error('تعذّر تجهيز صفحة الطباعة: ' + desc)); });
        pw.webContents.on('did-finish-load', function () {
          const size = o && o.pageSize ? o.pageSize : [148, 210];
          pw.webContents.print({
            silent: !!(o && o.deviceName), deviceName: (o && o.deviceName) || undefined, printBackground: false,
            margins: { marginType: 'none' }, pageSize: { width: Math.round(size[0] * 1000), height: Math.round(size[1] * 1000) }
          }, function (ok, reason) { ok ? done() : done(new Error(reason === 'cancelled' ? 'أُلغيت الطباعة.' : 'فشلت الطباعة (' + reason + ').')); });
        });
        pw.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
      });
    },
    saveFile: async function (name, text) {
      const r = await dialog.showSaveDialog(win, { defaultPath: name, filters: [{ name: 'JSON', extensions: ['json'] }] });
      if (r.canceled || !r.filePath) return null;
      fs.writeFileSync(r.filePath, text, 'utf8'); return r.filePath;
    },
    openFile: async function () {
      const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] });
      if (r.canceled || !r.filePaths[0]) return null;
      return { name: path.basename(r.filePaths[0]), content: fs.readFileSync(r.filePaths[0], 'utf8') };
    }
  };
}

function makeAutoUpdater() {
  try {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoDownload = false; autoUpdater.autoInstallOnAppQuit = true;
    return autoUpdater;
  } catch (e) { return null; }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1360, height: 860, minWidth: 980, minHeight: 640, show: false, backgroundColor: '#0b1210', title: config.APP_NAME,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false }
  });
  win.once('ready-to-show', function () { win.show(); });
  win.on('focus', function () { if (api) api.internals.sync.tick().catch(function () {}); }); // catch up at once when the secretary comes back
  // the renderer is a local page: never navigate away, never open new windows
  win.webContents.on('will-navigate', function (e) { e.preventDefault(); });
  win.webContents.setWindowOpenHandler(function () { return { action: 'deny' }; });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.on('closed', function () { win = null; });
}

app.whenReady().then(function () {
  Menu.setApplicationMenu(null);
  api = createApi({
    dataDir: app.getPath('userData'), appVersion: app.getVersion(), config: config, hooks: createHooks(), autoUpdater: makeAutoUpdater(),
    deviceLabel: require('os').hostname(),
    hint: function () { return win && !win.isDestroyed() && win.isFocused() && !win.isMinimized() ? 'active' : 'background'; }, log: function (m) { console.log('[cm]', m); }
  });
  Object.keys(api.methods).forEach(function (name) {
    ipcMain.handle('cm:' + name, function (_e, ...args) { return api.methods[name](...args); });
  });
  ['state', 'data', 'toast', 'event', 'boot'].forEach(function (ev) {
    api.on(ev, function (payload) { if (win && !win.isDestroyed()) win.webContents.send('cm-event:' + ev, ev === 'state' && payload === null ? undefined : payload); });
  });
  createWindow();
  app.on('activate', function () { if (!win) createWindow(); });
});
app.on('second-instance', function () { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('window-all-closed', function () { if (api) api.dispose(); app.quit(); });
