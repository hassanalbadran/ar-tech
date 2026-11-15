'use strict';
/* window.N — one wrapper for everything native. Inside the Android WebView `window.Native` (Kotlin @JavascriptInterface) does the work;
 * in a normal browser (dev / Playwright) it falls back to fetch('/__native/http'), localStorage, prompt() and downloads. */
(function () {
  const nat = window.Native || null, cbs = {}; let seq = 0;
  window.__natCb = function (id, status, text) { const f = cbs[id]; if (f) { delete cbs[id]; f(status, text); } };
  const wait = function (start) { return new Promise(function (res) { const id = 'n' + (++seq); cbs[id] = function (s, t) { res({ status: s, text: t }); }; start(id); }); };
  const ls = {
    get: function (k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* full / blocked */ } },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  };
  const N = window.N = {
    isNative: !!nat,
    /** HTTP via the native side (no CORS). Resolves the response text for any HTTP 200, rejects otherwise. */
    http: function (url, body, method) {
      method = method || 'POST';
      if (nat) return wait(function (id) { nat.http(id, method, url, body || ''); }).then(function (r) { if (r.status !== 200) throw new Error('HTTP ' + r.status); return r.text; });
      return fetch('/__native/http', { method: 'POST', body: JSON.stringify({ url: url, body: body || '', method: method }) }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); });
    },
    kvGet: function (k) { return nat ? nat.kvGet(k) : ls.get('kv.' + k); },
    kvSet: function (k, v) { if (nat) nat.kvSet(k, String(v)); else ls.set('kv.' + k, String(v)); },
    kvDel: function (k) { if (nat) nat.kvDel(k); else ls.del('kv.' + k); },
    secGet: function (k) { return nat ? nat.secGet(k) : ls.get('sec.' + k); },
    secSet: function (k, v) { if (nat) nat.secSet(k, String(v)); else ls.set('sec.' + k, String(v)); },
    json: function (k, d) { try { const v = N.kvGet(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    setJson: function (k, v) { N.kvSet(k, JSON.stringify(v)); },
    scanQr: function () {
      if (nat) return wait(function (id) { nat.scanQr(id); }).then(function (r) { if (r.status === 500) throw new Error(r.text); return r.status === 200 ? r.text : null; });
      return Promise.resolve(window.prompt('الصق نص رمز QR (cm1|…)') || null);
    },
    openExternal: function (url) { if (nat) nat.openExternal(url); else window.open(url, '_blank', 'noopener'); },
    saveFile: function (name, text) {
      if (nat) return wait(function (id) { nat.saveFile(id, name, text); }).then(function (r) { return r.status === 200 ? (r.text || name) : null; });
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = name; a.click(); return Promise.resolve(name);
    },
    pickFile: function () {
      if (nat) return wait(function (id) { nat.pickFile(id); }).then(function (r) { return r.status === 200 ? r.text : null; });
      return new Promise(function (res) { const i = document.createElement('input'); i.type = 'file'; i.onchange = function () { const f = i.files[0]; if (!f) return res(null); f.text().then(res); }; i.click(); });
    },
    askNotifications: function () { return nat ? wait(function (id) { nat.askNotifications(id); }).then(function (r) { return r.text === 'granted'; }) : Promise.resolve(true); },
    setBackground: function (on) { if (nat) nat.setBackground(!!on); },
    refreshWidgets: function () { if (nat) nat.refreshWidgets(); },
    setBars: function (hex, darkIcons) { if (nat) nat.setBars(hex, !!darkIcons); },
    haptic: function () { if (nat) nat.haptic(); else if (navigator.vibrate) navigator.vibrate(8); },
    version: function () { return nat ? nat.appVersion() : '1.0.0'; }
  };
})();
