'use strict';
/** Update check against GitHub Releases (public API, no token). Install is delegated to electron-updater when running in Electron. */
function cmp(a, b) {
  const pa = String(a).replace(/^v/i, '').split(/[.-]/).map(Number), pb = String(b).replace(/^v/i, '').split(/[.-]/).map(Number);
  for (let i = 0; i < 3; i++) { const x = pa[i] || 0, y = pb[i] || 0; if (x !== y) return x > y ? 1 : -1; }
  return 0;
}
function createUpdater(opts) {
  const f = opts.fetch || (typeof fetch === 'function' ? fetch : null), cfg = opts.config || {};
  let last = null;
  return {
    cmp: cmp,
    check: async function () {
      if (!cfg.GITHUB_OWNER || !cfg.GITHUB_REPO) return { available: false, version: opts.version, notes: '', configured: false };
      if (!f) throw new Error('لا يتوفر اتصال بالشبكة.');
      let res;
      try { res = await f('https://api.github.com/repos/' + cfg.GITHUB_OWNER + '/' + cfg.GITHUB_REPO + '/releases/latest', { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'clinic-manager' } }); }
      catch (e) { throw new Error('تعذّر الاتصال بـ GitHub. تحقق من الإنترنت.'); }
      if (res.status === 404) return { available: false, version: opts.version, notes: '', configured: true };
      if (res.status !== 200) throw new Error('تعذّر فحص التحديثات (' + res.status + ').');
      const j = await res.json();
      const v = String(j.tag_name || '').replace(/^v/i, '');
      last = { available: cmp(v, opts.version) > 0, version: v || opts.version, notes: String(j.body || '').slice(0, 2000), url: j.html_url || '', configured: true };
      return last;
    },
    install: async function () {
      if (opts.autoUpdater) { await opts.autoUpdater.checkForUpdates(); await opts.autoUpdater.downloadUpdate(); opts.autoUpdater.quitAndInstall(); return { started: true }; }
      if (last && last.url && opts.openExternal) { opts.openExternal(last.url); return { started: false, opened: true }; }
      throw new Error('لا يوجد تحديث لتثبيته.');
    }
  };
}
module.exports = { createUpdater, cmp };
