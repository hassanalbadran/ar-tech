'use strict';
/**
 * POST JSON to the Apps Script web app (docs/API.md "Transport"). Native fetch (Electron main / Node 22), no CORS problem.
 * Throws NetworkError (retryable: offline, timeout, HTML error page, HTTP != 200) or ServerError (ok:false answer with .code).
 */
class NetworkError extends Error {
  constructor(msg, cause) { super(msg || 'تعذر الاتصال بالخادم. تحقق من الإنترنت.'); this.name = 'NetworkError'; this.code = 'NETWORK'; this.cause = cause; }
}
class ServerError extends Error {
  constructor(msg, code) { super(msg || 'حدث خطأ في الخادم.'); this.name = 'ServerError'; this.code = code || 'SERVER'; }
}

function createTransport(opts) {
  const doFetch = opts.fetch || (typeof fetch === 'function' ? fetch : null);
  const timeoutMs = opts.timeoutMs || 45000;

  /** low level: url + body object -> data. */
  async function post(url, body, ms) {
    if (!doFetch) throw new NetworkError('لا يتوفر اتصال بالشبكة في هذا الجهاز.');
    if (!url) throw new NetworkError('لم يتم ربط التطبيق بعيادة بعد.');
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctl ? setTimeout(function () { ctl.abort(); }, ms || timeoutMs) : null;
    let text;
    try {
      const res = await doFetch(url, {
        method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(body), signal: ctl ? ctl.signal : undefined
      });
      if (res.status !== undefined && (res.status < 200 || res.status >= 300)) throw new NetworkError('الخادم لا يستجيب حالياً (' + res.status + ').');
      text = typeof res.text === 'function' ? await res.text() : JSON.stringify(await res.json());
    } catch (e) {
      if (e instanceof NetworkError) throw e;
      throw new NetworkError(e && e.name === 'AbortError' ? 'انتهت مهلة الاتصال بالخادم.' : undefined, e);
    } finally { if (timer) clearTimeout(timer); }
    let json;
    try { json = JSON.parse(text); } catch (e) { throw new NetworkError('استجابة غير متوقعة من الخادم. تأكد من رابط العيادة.'); }
    if (!json || typeof json !== 'object') throw new NetworkError('استجابة غير متوقعة من الخادم.');
    if (json.ok === true) return json.data;
    throw new ServerError(json.error, json.code);
  }

  return {
    post: post,
    /** Authenticated action against the linked clinic. */
    action: function (action, body, ms) {
      return post(opts.getUrl(), Object.assign({ action: action, token: opts.getToken() }, body || {}), ms);
    },
    /** Whitelisted server function through `call` (idempotent by cid). */
    call: function (fn, args, cid, ms) {
      return post(opts.getUrl(), { action: 'call', token: opts.getToken(), fn: fn, args: args, cid: cid }, ms);
    }
  };
}

module.exports = { createTransport, NetworkError, ServerError };
