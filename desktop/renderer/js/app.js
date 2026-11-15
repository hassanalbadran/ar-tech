'use strict';
/* App controller (window.A): boot → splash → welcome → shell; sidebar, routing, top bar, banners, wizard, license gate. */
(function () {
  const E = U.E, ic = U.ic, $ = U.$;
  const SEC = [['reviewers', 'users', 'المراجعين'], ['bookings', 'booking', 'الحجوزات'], ['calendar', 'calendar', 'التقويم']];
  const DOC = [['doctor', 'rx', 'عيادة الطبيب']].concat(SEC);

  const A = window.A = {
    st: null, view: 'reviewers', ymd: null, _banners: {}, _open: false,

    cfg: function () { return (A.st && A.st.config) || {}; },

    /* ---------- theme ---------- */
    applyTheme: function () {
      const t = (A.st && A.st.settings.theme) || { palette: 1, mode: 'system', fontScale: 1, contrast: 'normal' }, h = document.documentElement;
      const mode = t.mode === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : t.mode;
      h.dataset.palette = t.palette; h.dataset.mode = mode; h.dataset.contrast = t.contrast; h.style.setProperty('--fs', t.fontScale);
      h.style.fontSize = (16 * t.fontScale) + 'px';
    },

    /* ---------- state ---------- */
    reloadState: async function () {
      A.st = await cm.state();
      if (!A.ymd || A.view !== 'reviewers' && A.view !== 'doctor') A.ymd = A.ymd || A.st.todayYmd;
      A.applyTheme(); A.renderSide(); A.licenseGate(); return A.st;
    },

    /* ---------- top bar + banners ---------- */
    setTop: function (title, sub, actions) {
      const t = $('#top');
      t.innerHTML = '<h1>' + E(title) + (sub ? '<small>' + E(sub) + '</small>' : '') + '</h1><span class="sp"></span><div class="rel" id="gs" style="min-width:240px"><input class="in" id="gsq" placeholder="بحث عن مراجع (اسم / هاتف)" autocomplete="off" style="padding-inline-start:40px"><span style="position:absolute;inset-inline-start:12px;top:50%;transform:translateY(-50%);color:var(--mut);pointer-events:none">' + ic('search') + '</span></div>' + (actions || '');
      U.suggest($('#gsq'), function (p) { $('#gsq').value = ''; D.profile(p.patientId); });
    },
    banner: function (id, html, kind) {
      A._banners[id] = html ? { html: html, kind: kind || '' } : null;
      $('#banners').innerHTML = Object.keys(A._banners).filter(function (k) { return A._banners[k]; }).map(function (k) { return '<div class="banner ' + A._banners[k].kind + '" data-b="' + k + '">' + A._banners[k].html + '</div>'; }).join('');
    },

    /* ---------- sidebar ---------- */
    renderSide: function () {
      const s = A.st, side = $('#side'); if (!s || !side) return;
      const role = s.settings.role, items = role === 'doctor' ? DOC : SEC, sy = s.sync || {};
      const syncCls = !sy.online ? 'off' : sy.state === 'error' ? 'err' : sy.state === 'syncing' ? 'busy' : '';
      const syncTxt = !s.linked ? 'غير مربوط' : !sy.online ? 'بلا إنترنت' : sy.state === 'error' ? 'خطأ مزامنة' : sy.state === 'syncing' ? 'جارٍ المزامنة…' : sy.pending ? 'بانتظار الإرسال: ' + sy.pending : 'متزامن';
      const nv = function (id, icon, label, on, extra) { return '<button class="nv ' + (on ? 'on' : '') + '" data-go="' + id + '" title="' + E(label) + '">' + ic(icon) + '<span>' + E(label) + '</span>' + (extra || '') + '</button>'; };
      side.className = 'side' + (A._open ? ' open' : '');
      side.innerHTML = '<div class="brand">' + (s.settings.logo ? '<img src="' + s.settings.logo + '" alt="">' : '<img alt="" src="data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="none" stroke="#fff" stroke-width="1.6" d="M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7z"/></svg>') + '">') + '<div><b>' + E(s.clinicName || s.appName) + '</b><small>' + E(s.doctorName || '') + '</small></div></div>' +
        '<button class="ib tog" id="stog" aria-label="توسيع القائمة" style="background:rgba(255,255,255,.1);color:inherit">' + ic('panel') + '</button>' +
        '<nav class="nav">' + items.map(function (i) { return nv(i[0], i[1], i[2], A.view === i[0]); }).join('') + '</nav>' +
        '<div class="sec">إجراءات سريعة</div><nav class="nav">' +
        nv('a:today', 'users', 'عرض مراجعي اليوم') + nv('a:booking', 'addcal', 'إضافة حجز') + nv('a:surgery', 'surgery', 'إضافة عملية') + nv('a:income', 'wallet', 'استعراض مدخول اليوم') + nv('a:hide', 'eyeoff', 'تفريغ اليوم') + '</nav>' +
        '<div class="sp"></div><hr>' +
        '<div class="sync ' + syncCls + '" id="ssync" title="' + E(sy.error || '') + '"><i></i><span>' + E(syncTxt) + '</span></div>' +
        '<nav class="nav">' + nv('a:role', role === 'doctor' ? 'users' : 'doctor', role === 'doctor' ? 'العودة لواجهة السكرتير' : 'عرض كطبيب') + nv('a:settings', 'sliders', 'الإعدادات', A.view === 'settings') + '</nav>';
      $('#stog').onclick = function () { A._open = !A._open; side.classList.toggle('open', A._open); };
      side.onclick = function (e) { const b = e.target.closest('[data-go]'); if (b) A.act(b.dataset.go); };
    },

    act: async function (k) {
      if (k.indexOf('a:') !== 0) return A.nav(k);
      switch (k) {
        case 'a:today': A.ymd = A.st.todayYmd; return A.nav(A.st.settings.role === 'doctor' ? 'doctor' : 'reviewers');
        case 'a:booking': return D.addBooking();
        case 'a:surgery': return D.addSurgery();
        case 'a:income': return V.income.open(A.st.todayYmd);
        case 'a:hide': return D.hideDay(A.ymd || A.st.todayYmd);
        case 'a:settings': return V.settings.open();
        case 'a:role': {
          const r = A.st.settings.role === 'doctor' ? 'secretary' : 'doctor';
          A.st.settings = await cm.setSettings({ role: r }); A.view = r === 'doctor' ? 'doctor' : 'reviewers'; A.renderSide(); return A.refresh();
        }
      }
    },

    /* ---------- routing ---------- */
    nav: function (view) { A.view = view; A.renderSide(); return A.refresh(); },
    openDay: function (ymd) { A.ymd = ymd; A.view = A.st.settings.role === 'doctor' ? 'doctor' : 'reviewers'; A.renderSide(); return A.refresh(); },
    _busy: false, _again: false,
    refresh: async function () {
      if (!A.st || !A.st.linked) return;
      if (A._busy) { A._again = true; return; }
      A._busy = true;
      try {
        if (U.isDlgOpen() && A.view !== 'x') { /* dialogs keep their own state; the view behind is re-rendered */ }
        const el = $('#view'), v = V[A.view] || V.reviewers; if (A.st.settings.role !== 'doctor' && A.view === 'doctor') A.view = 'reviewers';
        const keep = el.scrollTop; await (V[A.view] || v).render(el); el.scrollTop = keep;
        A.statusBanners();
      } catch (e) { U.toast(e.message || String(e), 'err'); } finally { A._busy = false; if (A._again) { A._again = false; A.refresh(); } }
    },
    statusBanners: function () {
      const l = A.st.license, sy = A.st.sync || {};
      A.banner('lic', l.status === 'trial' && l.daysLeft <= 7 ? ic('clock') + '<span>' + E(l.message) + '</span><span class="sp"></span><button class="btn sm sec" data-lic>تفعيل</button>' : '', 'warn');
      A.banner('net', !sy.online && A.st.linked ? ic('wifioff') + '<span>لا يوجد اتصال — تعمل على البيانات المحلية وتُرسل التغييرات عند عودة الإنترنت' + (sy.pending ? ' (' + sy.pending + ' بانتظار الإرسال)' : '') + '.</span>' : '', 'warn');
      const b = $('#banners'); const lb = b.querySelector('[data-lic]'); if (lb) lb.onclick = function () { V.settings.open('lic'); };
    },

    /* ---------- license gate ---------- */
    licenseGate: function () {
      const l = A.st && A.st.license, box = $('#lic'); if (!box) return;
      const blocked = l && (l.status === 'expired' || l.status === 'revoked');
      if (!blocked) { box.hidden = true; box.innerHTML = ''; return; }
      box.hidden = false;
      box.innerHTML = '<div class="card">' + ic('shield', 'big') + '<h2>' + (l.status === 'revoked' ? 'تم إيقاف الترخيص' : 'انتهت الفترة التجريبية') + '</h2><p class="mut">' + E(l.message) + '</p><button class="btn" id="lcd">' + ic('link') + ' تواصل مع المطوّر</button><div class="row" style="gap:8px"><input class="in" id="lck" dir="ltr" placeholder="CM-XXXX-XXXX-XXXX" style="text-align:start"><button class="btn sec" id="lca">لدي مفتاح تفعيل</button></div></div>';
      $('#lcd', box).onclick = function () { cm.openExternal(A.st.developerUrl).catch(function (e) { U.toast(e.message, 'err'); }); };
      $('#lca', box).onclick = function (e) { U.act(e.currentTarget, async function () { await cm.activate($('#lck', box).value); await A.reloadState(); U.toast('تم التفعيل — شكراً لك', 'ok'); A.refresh(); }); };
    },

    /* ---------- first-run wizard ---------- */
    wizard: function () {
      return new Promise(function (resolve) {
        const v = $('#view'); $('#top').innerHTML = ''; $('#banners').innerHTML = '';
        const steps = [
          function (box) { box.innerHTML = '<h1>مرحباً بك</h1><p class="mut">لنربط التطبيق بموقع العيادة خلال دقيقة.</p><div style="text-align:start;margin-top:18px" id="wl"></div>'; V.settings.linkForm($('#wl', box), function () { A.reloadState().then(function () { go(1); }); }); },
          function (box) {
            const c = A.cfg();
            box.innerHTML = '<h1>بيانات العيادة</h1><div class="fg" style="text-align:start;margin-top:18px"><div><label class="l">اسم الطبيب</label><input class="in" id="wd" value="' + E(A.st.doctorName || '') + '"></div><div><label class="l">اسم العيادة</label><input class="in" id="wc" value="' + E(A.st.clinicName || '') + '"></div><div><label class="l">الكشفية (د.ع)</label><input class="in" id="wf" inputmode="numeric" value="' + (c.consultationFee || 15000) + '"></div><div><label class="l">أيام المراجعة المجانية</label><input class="in" id="wr" inputmode="numeric" value="' + (c.freeReviewDays || 5) + '"></div></div><label class="l" style="text-align:start">رمز المالية في الموقع (لحفظ هذه القيم)</label><input class="in" id="wp" type="password" inputmode="numeric" maxlength="8"><button class="btn w" id="wn" style="margin-top:18px">متابعة</button><button class="btn sec w" id="ws" style="margin-top:8px">تخطي الآن</button>';
            $('#ws', box).onclick = function () { go(2); };
            $('#wn', box).onclick = function (e) {
              U.act(e.currentTarget, async function () {
                const pin = $('#wp', box).value; if (pin) await cm.setFinancePin(pin);
                await cm.setSettings({ doctorName: $('#wd', box).value.trim(), clinicName: $('#wc', box).value.trim() });
                if (pin) await cm.saveClinicConfig({ doctorName: $('#wd', box).value.trim(), clinicName: $('#wc', box).value.trim(), consultationFee: +U.digits($('#wf', box).value) || 15000, freeReviewDays: +U.digits($('#wr', box).value) || 5 });
                go(2);
              });
            };
          },
          function (box) {
            box.innerHTML = '<h1>اللمسات الأخيرة</h1><p class="mut">اختر لوحة الألوان والنمط — يمكنك تغييرها لاحقاً من الإعدادات.</p><div style="text-align:start" id="wt"></div><button class="btn w" id="wg" style="margin-top:22px">ابدأ</button>';
            $('#wg', box).onclick = function () { U.act($('#wg', box), async function () { await cm.setSettings({ firstRunDone: true }); await A.reloadState(); resolve(); }); };
            const t = $('#wt', box); t.innerHTML = '<div class="sw" id="sw">' + [1, 2, 3, 4].map(function (n) { const c = { 1: ['#0c4a5b', '#f2ae48'], 2: ['#262b52', '#ff8a65'], 3: ['#1f3d2b', '#e3b85a'], 4: ['#3a2243', '#f08aa6'] }[n]; return '<button data-p="' + n + '" class="' + (A.st.settings.theme.palette === n ? 'on' : '') + '"><i style="background:' + c[0] + '"></i><i style="background:' + c[1] + '"></i></button>'; }).join('') + '</div><div class="seg" id="smode" style="margin-top:12px">' + [['light', 'فاتح'], ['dark', 'داكن'], ['system', 'تلقائي']].map(function (m) { return '<button data-m="' + m[0] + '" class="' + (A.st.settings.theme.mode === m[0] ? 'on' : '') + '">' + m[1] + '</button>'; }).join('') + '</div>';
            const set = function (patch) { return cm.setSettings({ theme: patch }).then(function (s) { A.st.settings = s; A.applyTheme(); }); };
            $('#sw', box).onclick = function (e) { const b = e.target.closest('button'); if (b) set({ palette: +b.dataset.p }).then(function () { U.$$('#sw button', box).forEach(function (x) { x.classList.toggle('on', x === b); }); }); };
            $('#smode', box).onclick = function (e) { const b = e.target.closest('button'); if (b) set({ mode: b.dataset.m }).then(function () { U.$$('#smode button', box).forEach(function (x) { x.classList.toggle('on', x === b); }); }); };
          }
        ];
        const go = function (i) { v.innerHTML = '<div class="wiz card" style="padding:34px"><div class="row" style="justify-content:center;gap:6px;margin-bottom:14px">' + [0, 1, 2].map(function (k) { return '<span class="chip ' + (k === i ? 'br' : '') + '">' + (k + 1) + '</span>'; }).join('') + '</div><div id="wb"></div></div>'; steps[i]($('#wb', v)); };
        go(A.st.linked ? 1 : 0);
      });
    },

    /* ---------- boot ---------- */
    boot: async function () {
      U.installSprite(); A.applyTheme();
      const splash = Splash.start($('#brain'));
      const offBoot = cm.on('boot', function (e) { if (e && typeof e.pct === 'number') { splash.setProgress(e.pct); $('#splash-bar').style.width = e.pct + '%'; const m = { settings: 'تحميل الإعدادات…', database: 'فتح قاعدة البيانات…', license: 'التحقق من الترخيص…', data: 'مزامنة البيانات…', done: 'اكتمل' }[e.phase]; if (m) $('#splash-msg').textContent = m; } });
      let st;
      try { st = await cm.boot(); } catch (e) { $('#splash-msg').textContent = 'تعذّر بدء التطبيق'; $('#splash-sub').textContent = e.message || String(e); splash.stop(); return; }
      offBoot(); A.st = st; A.ymd = st.todayYmd; A.view = st.settings.role === 'doctor' ? 'doctor' : 'reviewers'; A.applyTheme();
      await splash.finish();
      const sp = $('#splash'); sp.classList.add('out');
      await showWelcome(st);
      setTimeout(function () { sp.remove(); splash.stop(); }, 700);
      $('#app').hidden = false;
      A.renderSide(); A.licenseGate();
      cm.on('data', function () { A.refresh(); });
      cm.on('state', function (s) { if (s && s.phase) return; cm.state().then(function (n) { const prevLic = A.st.license.status; A.st = n; A.applyTheme(); A.renderSide(); if (n.license.status !== prevLic) A.licenseGate(); A.statusBanners && A.statusBanners(); }); });
      cm.on('toast', function (t) { U.toast(t.text, t.kind); });
      cm.on('event', function (e) { U.toast((e.patientName ? e.patientName + ': ' : '') + e.message, e.severity === 'danger' ? 'err' : e.severity === 'warning' ? 'warn' : '', e.severity === 'danger' ? 9000 : 5500); });
      window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && U.isDlgOpen()) U.closeDlg(); });
      matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { A.applyTheme(); });
      if (!st.linked || !st.settings.firstRunDone) { await A.wizard(); }
      $('#view').innerHTML = ''; A.view = A.st.settings.role === 'doctor' ? 'doctor' : 'reviewers'; A.ymd = A.st.todayYmd; A.renderSide(); A.refresh();
      setInterval(function () { cm.state().then(function (n) { if (n.todayYmd !== A.st.todayYmd) { const was = A.ymd === A.st.todayYmd; A.st = n; if (was) A.ymd = n.todayYmd; A.refresh(); } else A.st = n; A.renderSide(); }).catch(function () {}); }, 60000);
    }
  };

  async function showWelcome(st) {
    const w = $('#welcome'), name = st.doctorName ? 'د. ' + st.doctorName.replace(/^د\.?\s*/, '') : '';
    $('#w-greet').textContent = U.greeting();
    $('#w-name').innerHTML = name ? '<b>' + E(name) + '</b>' : '<b>' + E(st.appName) + '</b>';
    $('#w-sub').textContent = st.clinicName || '';
    const lg = $('#w-logo'); if (st.settings.logo) { lg.src = st.settings.logo; lg.hidden = false; }
    w.hidden = false; await U.sleep(1700); w.classList.add('out'); await U.sleep(550); w.remove();
  }

  document.addEventListener('DOMContentLoaded', function () { A.boot(); });
})();
