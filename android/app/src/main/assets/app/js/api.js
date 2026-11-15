'use strict';
/* window.Api — talks to the clinic's Apps Script (docs/API.md) through N.http; window.Lic — license client (docs/LICENSING.md). */
(function () {
  const N = window.N, C = window.CM_CONFIG || {};
  const uuid = function () { return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10); };
  const URL_RE = /^https:\/\/script\.google\.com\/(a\/[^/]+\/)?macros\/s\/[A-Za-z0-9_-]+\/exec/;
  const netErr = function (m) { const e = new Error(m || 'لا يوجد اتصال بالإنترنت أو الخادم لا يستجيب.'); e.net = true; return e; };

  async function post(url, body) {
    let txt; try { txt = await N.http(url, JSON.stringify(body)); } catch (e) { throw netErr(); }
    let j; try { j = JSON.parse(txt); } catch (e) { throw netErr('ردّ غير متوقع من الخادم. تأكد من رابط العيادة.'); }
    if (!j || j.ok !== true) { const er = new Error((j && j.error) || 'خطأ في الخادم.'); er.code = j && j.code; throw er; }
    return j.data;
  }

  const Api = window.Api = {
    URL_RE: URL_RE,
    url: function () { return N.kvGet('cm.url') || ''; },
    token: function () { return N.kvGet('cm.token') || ''; },
    linked: function () { return !!(Api.url() && Api.token()); },
    /** pair with the 8-char code (from the website admin panel or the PC app's QR) */
    pair: async function (url, code) {
      url = String(url || '').trim(); code = String(code || '').trim().toUpperCase();
      if (!URL_RE.test(url)) throw new Error('رابط العيادة غير صحيح. يجب أن ينتهي بـ /exec.');
      if (!code) throw new Error('اكتب رمز الربط.');
      const d = await post(url, { action: 'pair', code: code, deviceName: 'Android', platform: 'android' });
      N.kvSet('cm.url', url); N.kvSet('cm.token', d.token); if (d.config) N.setJson('cm.config', d.config);
      N.setBackground(true); return d;
    },
    /** QR text from the PC app: cm1|<url>|<code> */
    pairFromQr: function (text) {
      const p = String(text || '').trim().split('|');
      if (p[0] !== 'cm1' || p.length < 3) throw new Error('هذا الرمز ليس رمز ربط للعيادة.');
      return Api.pair(p[1], p[2]);
    },
    unlink: function () { ['cm.url', 'cm.token', 'cm.config'].forEach(N.kvDel); N.secSet('pin', ''); N.setBackground(false); ['c.home', 'c.fin', 'c.surg', 'summary'].forEach(N.kvDel); N.refreshWidgets(); },
    req: async function (action, extra) {
      try { return await post(Api.url(), Object.assign({ action: action, token: Api.token() }, extra || {})); }
      catch (e) { if (e.code === 'AUTH') { Api.unlink(); e.revoked = true; } throw e; }
    },
    call: function (fn, args) { return Api.req('call', { fn: fn, args: args || [], cid: uuid() }); },
    config: async function () { const c = await Api.req('config'); N.setJson('cm.config', c); return c; },
    cfg: function () { return N.json('cm.config', {}); },
    /** stale-while-revalidate: paint the cached copy at once, then the fresh one. Resolves the fresh data (or the cache if offline). */
    swr: async function (key, loader, paint) {
      const ck = 'c.' + key, cached = N.json(ck, null);
      if (cached && paint) paint(cached, true);
      try { const fresh = await loader(); N.setJson(ck, fresh); if (Api.netState) Api.netState(false); if (paint) paint(fresh, false); return fresh; }
      catch (e) { if (e.net) { if (Api.netState) Api.netState(true); if (cached) { e.cached = cached; return cached; } } throw e; }
    },
    postRaw: post
  };

  /* ---------------- license ---------------- */
  const DAY = 86400000, TRIAL = 30, OFFLINE = 14;
  const enforced = function () { return !!C.LICENSE_SERVER_URL; };
  const st = function () { let d = N.json('lic', null); if (!d || typeof d !== 'object') d = {}; if (!d.deviceId) d.deviceId = 'AND-' + uuid().replace(/-/g, '').slice(0, 16); if (!d.firstRun) d.firstRun = Date.now(); N.setJson('lic', d); return d; };
  const ymd = function (t) { return new Date(t + 3 * 3600000).toISOString().slice(0, 10); };
  const msg = { active: 'النسخة مفعّلة.', expired: 'انتهت الفترة التجريبية. تواصل مع المطوّر للحصول على مفتاح تفعيل.', revoked: 'تم إيقاف هذا التفعيل. تواصل مع المطوّر.', trial: function (d) { return 'نسخة تجريبية — بقي ' + d + (d === 1 ? ' يوم' : ' يوماً') + '.'; } };

  window.Lic = {
    enforced: enforced,
    status: function () {
      if (!enforced()) return { status: 'active', daysLeft: null, enforced: false, message: 'نسخة مفتوحة المصدر — بلا قيد ترخيص.' };
      const d = st(), t = Date.now(), c = d.cache, base = { enforced: true }, localLeft = TRIAL - Math.floor((t - d.firstRun) / DAY);
      if (c && c.status === 'revoked') return Object.assign(base, { status: 'revoked', daysLeft: 0, message: msg.revoked });
      if (c && c.status === 'active' && (t - c.at) / DAY <= OFFLINE) {
        if (c.expiresAt && ymd(t) > c.expiresAt) return Object.assign(base, { status: 'expired', daysLeft: 0, message: 'انتهت صلاحية المفتاح. تواصل مع المطوّر.' });
        return Object.assign(base, { status: 'active', daysLeft: c.daysLeft, message: msg.active });
      }
      let left = c && c.status === 'trial' ? Math.min(localLeft, c.daysLeft - Math.floor((t - c.at) / DAY)) : localLeft;
      if (c && c.status === 'expired') left = 0;
      return left > 0 ? Object.assign(base, { status: 'trial', daysLeft: left, message: msg.trial(left) }) : Object.assign(base, { status: 'expired', daysLeft: 0, message: msg.expired });
    },
    store: function (r) { const d = st(); d.cache = { status: r.status, daysLeft: r.daysLeft, expiresAt: r.expiresAt || '', at: Date.now() }; N.setJson('lic', d); },
    check: async function (force) {
      if (!enforced()) return window.Lic.status();
      const d = st();
      if (!force && d.cache && d.cache.status !== 'expired' && d.cache.status !== 'revoked' && Date.now() - d.cache.at < 12 * 3600000) return window.Lic.status(); // at most twice a day
      try { window.Lic.store(await post(C.LICENSE_SERVER_URL, { action: 'licenseCheck', deviceId: d.deviceId, platform: 'android', appVersion: N.version(), label: 'Android', key: d.key || undefined })); }
      catch (e) { if (e.code === 'LICENSE') { d.cache = { status: 'revoked', daysLeft: 0, expiresAt: '', at: Date.now() }; N.setJson('lic', d); } }
      return window.Lic.status();
    },
    activate: async function (key) {
      if (!enforced()) return window.Lic.status();
      const k = String(key || '').trim(); if (!k) throw new Error('أدخل مفتاح التفعيل.');
      const d = st(), r = await post(C.LICENSE_SERVER_URL, { action: 'licenseActivate', deviceId: d.deviceId, key: k, platform: 'android', appVersion: N.version(), label: 'Android' });
      d.key = k.toUpperCase(); N.setJson('lic', d); window.Lic.store(r); return window.Lic.status();
    }
  };
})();
