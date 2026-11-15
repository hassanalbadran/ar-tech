'use strict';
/* الإعدادات + first-run wizard helpers. Exposes V.settings */
(function () {
  const E = U.E, ic = U.ic, $ = U.$, V = window.V = window.V || {};
  const PAPER = { A5: [148, 210], A4: [210, 297] };

  function readImage(file, maxW, type, q) {
    return new Promise(function (resolve, reject) {
      const fr = new FileReader();
      fr.onerror = function () { reject(new Error('تعذّر قراءة الصورة.')); };
      fr.onload = function () {
        const im = new Image(); im.onerror = function () { reject(new Error('الملف ليس صورة صالحة.')); };
        im.onload = function () {
          const k = Math.min(1, maxW / im.width), c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
          const g = c.getContext('2d'); if (type === 'image/jpeg') { g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); } g.drawImage(im, 0, 0, c.width, c.height);
          resolve({ url: c.toDataURL(type, q), w: im.width, h: im.height });
        };
        im.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }
  const pick = function (accept) { return new Promise(function (res) { const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.onchange = function () { res(i.files[0] || null); }; i.click(); }); };

  /** Pairing form (wizard + settings). */
  function linkForm(box, onDone) {
    box.innerHTML = '<label class="l">رابط تطبيق العيادة</label><input class="in" id="lk1" dir="ltr" placeholder="https://script.google.com/macros/s/…/exec" style="text-align:start"><label class="l">رمز الربط (من لوحة المطوّر في الموقع)</label><input class="in" id="lk2" dir="ltr" placeholder="XXXX-XXXX" maxlength="9" style="text-align:start;letter-spacing:.15em"><button class="btn w" id="lk3" style="margin-top:16px">' + ic('link') + ' ربط</button><p class="mut" style="font-size:.82rem;margin-top:10px" id="lkp"></p>';
    const off = cm.on('state', function (s) { const p = $('#lkp'); if (!p) return off(); if (s && s.phase) p.textContent = s.phase === 'pairing' ? 'جارٍ الاتصال…' : 'جارٍ تنزيل البيانات (' + s.done + '/' + s.total + ')…'; });
    $('#lk3', box).onclick = async function (e) {
      const r = await U.act(e.currentTarget, function () { return cm.link({ url: $('#lk1', box).value.trim(), code: $('#lk2', box).value.trim() }); });
      if (r) { U.toast('تم الربط بالعيادة', 'ok'); onDone && onDone(); }
    };
  }

  function themeSwatch(n) { const c = { 1: ['#0c4a5b', '#f2ae48'], 2: ['#262b52', '#ff8a65'], 3: ['#1f3d2b', '#e3b85a'], 4: ['#3a2243', '#f08aa6'] }[n]; return '<button data-p="' + n + '" class="' + (A.st.settings.theme.palette === n ? 'on' : '') + '" aria-label="لوحة ألوان ' + n + '"><i style="background:' + c[0] + '"></i><i style="background:' + c[1] + '"></i></button>'; }

  const TABS = [['look', 'palette', 'المظهر'], ['clinic', 'doctor', 'العيادة'], ['print', 'printer', 'الطباعة'], ['sec', 'lock', 'الأمان'], ['sync', 'refresh', 'المزامنة والربط'], ['upd', 'download', 'التحديثات'], ['lic', 'shield', 'الترخيص'], ['about', 'info', 'حول']];

  const PANES = {
    look: function (p) {
      const t = A.st.settings.theme;
      p.innerHTML = '<h3>المظهر</h3><label class="l">لوحة الألوان</label><div class="sw" id="sw">' + [1, 2, 3, 4].map(themeSwatch).join('') + '</div>' +
        '<label class="l">النمط</label><div class="seg" id="smode">' + [['light', 'فاتح'], ['dark', 'داكن'], ['system', 'تلقائي']].map(function (m) { return '<button data-m="' + m[0] + '" class="' + (t.mode === m[0] ? 'on' : '') + '">' + m[1] + '</button>'; }).join('') + '</div>' +
        '<label class="l">حجم الخط: <b id="fsv">' + Math.round(t.fontScale * 100) + '%</b></label><input type="range" id="sfs" min="90" max="140" step="5" value="' + Math.round(t.fontScale * 100) + '" style="width:100%">' +
        '<div style="margin-top:18px"><label class="tgl"><input type="checkbox" id="shc" ' + (t.contrast === 'high' ? 'checked' : '') + '><span>تباين عالٍ</span></label></div>';
      const set = function (patch) { return cm.setSettings({ theme: patch }).then(function (s) { A.st.settings = s; A.applyTheme(); }); };
      $('#sw', p).onclick = function (e) { const b = e.target.closest('button'); if (!b) return; set({ palette: +b.dataset.p }).then(function () { U.$$('#sw button', p).forEach(function (x) { x.classList.toggle('on', x === b); }); }); };
      $('#smode', p).onclick = function (e) { const b = e.target.closest('button'); if (!b) return; set({ mode: b.dataset.m }).then(function () { U.$$('#smode button', p).forEach(function (x) { x.classList.toggle('on', x === b); }); }); };
      $('#sfs', p).oninput = function (e) { $('#fsv', p).textContent = e.target.value + '%'; }; $('#sfs', p).onchange = function (e) { set({ fontScale: +e.target.value / 100 }); };
      $('#shc', p).onchange = function (e) { set({ contrast: e.target.checked ? 'high' : 'normal' }); };
    },
    clinic: function (p) {
      const c = A.cfg(), s = A.st.settings;
      p.innerHTML = '<h3>العيادة</h3><div class="row" style="gap:16px;margin:10px 0"><div id="slg" style="width:72px;height:72px;border-radius:20px;background:var(--field);display:grid;place-items:center;overflow:hidden">' + (s.logo ? '<img src="' + s.logo + '" style="width:100%;height:100%;object-fit:contain" alt="">' : ic('doctor')) + '</div><div class="row" style="gap:8px"><button class="btn sm sec" id="slu">' + ic('upload') + ' شعار العيادة</button>' + (s.logo ? '<button class="btn sm sec" id="sld">' + ic('trash') + '</button>' : '') + '</div></div>' +
        '<div class="fg"><div><label class="l">اسم الطبيب</label><input class="in" id="sdn" maxlength="80" value="' + E(s.doctorName || c.doctorName || '') + '"></div><div><label class="l">اسم العيادة</label><input class="in" id="scn" maxlength="150" value="' + E(s.clinicName || c.clinicName || '') + '"></div>' +
        '<div><label class="l">الكشفية (د.ع)</label><input class="in" id="sfe" inputmode="numeric" value="' + (c.consultationFee || 15000) + '"></div><div><label class="l">أيام المراجعة المجانية</label><input class="in" id="sfd" inputmode="numeric" value="' + (c.freeReviewDays || 5) + '"></div></div>' +
        '<p class="mut" style="font-size:.82rem;margin-top:8px">مراجعة مجانية واحدة خلال هذه الأيام من آخر كشفية مدفوعة. تُحفظ هذه القيم في الموقع أيضاً.</p><button class="btn" id="ssv" style="margin-top:14px">' + ic('check') + ' حفظ</button>';
      $('#slu', p).onclick = async function () { const f = await pick('image/*'); if (!f) return; try { const im = await readImage(f, 256, 'image/png'); A.st.settings = await cm.setSettings({ logo: im.url }); A.renderSide(); PANES.clinic(p); } catch (e) { U.toast(e.message, 'err'); } };
      if ($('#sld', p)) $('#sld', p).onclick = async function () { A.st.settings = await cm.setSettings({ logo: '' }); A.renderSide(); PANES.clinic(p); };
      $('#ssv', p).onclick = function (e) {
        U.act(e.currentTarget, async function () {
          await cm.saveClinicConfig({ doctorName: $('#sdn', p).value.trim(), clinicName: $('#scn', p).value.trim(), consultationFee: +U.digits($('#sfe', p).value) || 15000, freeReviewDays: +U.digits($('#sfd', p).value) || 5 });
          await A.reloadState(); U.toast('حُفظت إعدادات العيادة', 'ok');
        });
      };
    },
    print: async function (p) {
      const pr = A.st.settings.printer, tp = pr.template || {}; let printers = []; try { printers = await cm.printers(); } catch (e) { /* none */ }
      const paper = pr.paperSize === 'custom' ? [pr.customWmm, pr.customHmm] : PAPER[pr.paperSize] || PAPER.A5;
      p.innerHTML = '<h3>الطابعة والوصفة</h3><label class="tgl"><input type="checkbox" id="pen" ' + (pr.enabled ? 'checked' : '') + '><span>تفعيل الطباعة</span></label>' +
        '<div class="fg"><div><label class="l">الطابعة</label><select class="in" id="ppn"><option value="">الافتراضية</option>' + printers.map(function (x) { return '<option ' + (x.name === pr.printerName ? 'selected' : '') + '>' + E(x.name) + '</option>'; }).join('') + '</select></div><div><label class="l">نوع الورق</label><input class="in" id="ppt" maxlength="60" value="' + E(pr.paperType || '') + '" placeholder="مثال: ورق العيادة المطبوع"></div>' +
        '<div><label class="l">حجم الورق</label><select class="in" id="pps">' + [['A5', 'A5'], ['A4', 'A4'], ['custom', 'مخصص']].map(function (o) { return '<option value="' + o[0] + '" ' + (pr.paperSize === o[0] ? 'selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></div>' +
        '<div id="ppc" ' + (pr.paperSize === 'custom' ? '' : 'hidden') + '><label class="l">العرض × الارتفاع (مم)</label><div class="row"><input class="in" id="ppw" inputmode="numeric" value="' + pr.customWmm + '"><input class="in" id="pph" inputmode="numeric" value="' + pr.customHmm + '"></div></div></div>' +
        '<label class="l">قالب الوصفة (صورة ورق العيادة) لضبط منطقة الطباعة</label><div class="row" style="gap:8px"><button class="btn sm sec" id="ptu">' + ic('upload') + ' رفع صورة القالب</button>' + (tp.image ? '<button class="btn sm sec" id="ptd">' + ic('trash') + '</button><label class="tgl" style="margin-inline-start:10px"><input type="checkbox" id="pnt" ' + (tp.notesArea ? 'checked' : '') + '><span>منطقة ملاحظات</span></label>' : '') + '</div>' +
        (tp.image ? '<div class="cal-box" id="pcb"><img src="' + tp.image + '" alt="" draggable="false"></div><p class="mut" style="font-size:.8rem;margin-top:6px"><span style="color:#d33">■</span> منطقة الأدوية فقط (اسحبها واضبط حجمها من الزاوية) ' + (tp.notesArea ? '· <span style="color:#2b6fd6">■</span> منطقة الملاحظات' : '') + '. يُطبع النص داخلها فقط على الورق المطبوع مسبقاً.</p>' : '<p class="mut" style="font-size:.82rem;margin-top:8px">بدون قالب تُستخدم منطقة افتراضية في وسط الصفحة.</p>') +
        '<div class="row wrap" style="margin-top:16px;gap:10px"><button class="btn" id="psv">' + ic('check') + ' حفظ</button><button class="btn sec" id="ptt">' + ic('printer') + ' طباعة تجريبية</button></div>';
      const save = async function () {
        const patch = { enabled: $('#pen', p).checked, printerName: $('#ppn', p).value, paperType: $('#ppt', p).value.trim(), paperSize: $('#pps', p).value, customWmm: +U.digits($('#ppw', p).value) || 148, customHmm: +U.digits($('#pph', p).value) || 210 };
        const dims = patch.paperSize === 'custom' ? [patch.customWmm, patch.customHmm] : PAPER[patch.paperSize];
        patch.template = { widthMm: dims[0], heightMm: dims[1] };
        if (zones.s) patch.template.safeArea = zones.s; if (zones.n !== undefined) patch.template.notesArea = zones.n;
        A.st.settings = await cm.setSettings({ printer: patch });
      };
      const zones = { s: tp.safeArea || { x: 0.1, y: 0.2, w: 0.8, h: 0.6 }, n: tp.notesArea || null };
      $('#pps', p).onchange = function () { $('#ppc', p).hidden = $('#pps', p).value !== 'custom'; };
      $('#ptu', p).onclick = async function () { const f = await pick('image/*'); if (!f) return; try { const im = await readImage(f, 1500, 'image/jpeg', 0.85); await save(); A.st.settings = await cm.setSettings({ printer: { template: { image: im.url } } }); PANES.print(p); } catch (e) { U.toast(e.message, 'err'); } };
      if ($('#ptd', p)) $('#ptd', p).onclick = async function () { A.st.settings = await cm.setSettings({ printer: { template: { image: '' } } }); PANES.print(p); };
      if ($('#pnt', p)) $('#pnt', p).onchange = function (e) { zones.n = e.target.checked ? (zones.n || { x: 0.1, y: 0.82, w: 0.8, h: 0.1 }) : null; drawZones(); };
      const box = $('#pcb', p);
      function drawZones() {
        if (!box) return; U.$$('.zone', box).forEach(function (z) { z.remove(); });
        [['s', 'الأدوية'], ['n', 'ملاحظات']].forEach(function (k) {
          const a = zones[k[0]]; if (!a) return; const z = document.createElement('div'); z.className = 'zone ' + k[0]; z.style.cssText = 'left:' + a.x * 100 + '%;top:' + a.y * 100 + '%;width:' + a.w * 100 + '%;height:' + a.h * 100 + '%';
          z.innerHTML = '<b>' + k[1] + '</b><span class="hd"></span>'; box.append(z);
          z.onpointerdown = function (e) {
            e.preventDefault(); const r = box.getBoundingClientRect(), resize = !!e.target.closest('.hd'), sx = e.clientX, sy = e.clientY, o = Object.assign({}, a);
            z.setPointerCapture(e.pointerId);
            z.onpointermove = function (m) {
              const dx = (m.clientX - sx) / r.width, dy = (m.clientY - sy) / r.height;
              if (resize) { a.w = Math.max(0.05, Math.min(1 - a.x, o.w + dx)); a.h = Math.max(0.03, Math.min(1 - a.y, o.h + dy)); } else { a.x = Math.max(0, Math.min(1 - a.w, o.x + dx)); a.y = Math.max(0, Math.min(1 - a.h, o.y + dy)); }
              z.style.left = a.x * 100 + '%'; z.style.top = a.y * 100 + '%'; z.style.width = a.w * 100 + '%'; z.style.height = a.h * 100 + '%';
            };
            z.onpointerup = function () { z.onpointermove = null; z.onpointerup = null; };
          };
        });
      }
      drawZones();
      $('#psv', p).onclick = function (e) { U.act(e.currentTarget, async function () { await save(); U.toast('حُفظت إعدادات الطباعة', 'ok'); }); };
      $('#ptt', p).onclick = function (e) { U.act(e.currentTarget, async function () { await save(); const r = await cm.printTest(); U.toast(r.printed ? 'أُرسلت صفحة تجريبية' : 'لم تُطبع', r.printed ? 'ok' : 'warn'); }); };
      void paper;
    },
    sec: function (p) {
      p.innerHTML = '<h3>الأمان</h3><label class="l">رمز إخفاء الأيام (4 أرقام)</label><div class="fg"><input class="in" id="po" type="password" inputmode="numeric" maxlength="4" placeholder="الرمز الحالي"><input class="in" id="pn" type="password" inputmode="numeric" maxlength="4" placeholder="الرمز الجديد"></div><button class="btn sm" id="ps1" style="margin-top:12px">تغيير الرمز</button>' +
        '<hr style="border:0;border-top:1px solid var(--line);margin:22px 0"><label class="l">رمز المالية في الموقع (يُستخدم عند حفظ إعدادات العيادة وتسجيل الفواتير)</label><div class="row"><input class="in" id="pf" type="password" inputmode="numeric" maxlength="8" placeholder="الرمز"><button class="btn sm" id="ps2">حفظ</button></div><p class="mut" style="font-size:.8rem;margin-top:8px">يُحفظ مشفّراً على هذا الجهاز فقط ولا يُعرض.</p>';
      $('#ps1', p).onclick = function (e) { U.act(e.currentTarget, async function () { await cm.changePin('hide', $('#po', p).value, $('#pn', p).value); U.toast('تم تغيير الرمز', 'ok'); $('#po', p).value = $('#pn', p).value = ''; }); };
      $('#ps2', p).onclick = function (e) { U.act(e.currentTarget, async function () { await cm.setFinancePin($('#pf', p).value); U.toast('حُفظ رمز المالية', 'ok'); $('#pf', p).value = ''; }); };
    },
    sync: function (p) {
      const s = A.st;
      if (!s.linked) { p.innerHTML = '<h3>الربط بالعيادة</h3><p class="mut">اربط التطبيق بموقع العيادة (Google Sheets) لمزامنة البيانات.</p><div id="lkb"></div>'; linkForm($('#lkb', p), function () { A.reloadState().then(function () { PANES.sync(p); A.refresh(); }); }); return; }
      const sy = s.sync;
      p.innerHTML = '<h3>المزامنة</h3><div class="row wrap" style="gap:10px"><span class="chip ' + (sy.online ? 'ok' : 'warn') + '">' + (sy.online ? 'متصل' : 'بلا إنترنت') + '</span><span class="chip">بانتظار الإرسال: ' + sy.pending + '</span>' + (sy.lastSyncAt ? '<span class="chip">آخر مزامنة ' + new Date(sy.lastSyncAt).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' }) + '</span>' : '') + '</div>' + (sy.error ? '<p class="chip bad" style="margin-top:10px">' + E(sy.error) + '</p>' : '') +
        '<div class="row wrap" style="gap:10px;margin-top:16px"><button class="btn" id="sy1">' + ic('refresh') + ' مزامنة الآن</button><button class="btn sec" id="sy2">' + ic('download') + ' جلب البيانات (كاملة)</button><button class="btn sec" id="sy3">' + ic('qr') + ' ربط تطبيق الأندرويد</button></div>' +
        '<h3 style="margin-top:26px">نسخة احتياطية</h3><div class="row wrap" style="gap:10px"><button class="btn sec" id="sy4">' + ic('download') + ' تصدير البيانات</button><button class="btn sec" id="sy5">' + ic('upload') + ' استيراد نسخة</button><button class="btn bad" id="sy6">فصل الربط</button></div><p class="mut" style="font-size:.8rem;margin-top:8px">الاستيراد متاح بعد فصل الربط فقط. لاستيراد السجل القديم (CSV) استخدم الموقع.</p>';
      $('#sy1', p).onclick = function (e) { U.act(e.currentTarget, async function () { await cm.syncNow({}); await A.reloadState(); U.toast('تمت المزامنة', 'ok'); PANES.sync(p); }); };
      $('#sy2', p).onclick = function (e) { U.act(e.currentTarget, async function () { await cm.syncNow({ full: true }); await A.reloadState(); U.toast('تم جلب البيانات كاملة', 'ok'); PANES.sync(p); }); };
      $('#sy3', p).onclick = function () { D.androidQr(); };
      $('#sy4', p).onclick = function (e) { U.act(e.currentTarget, async function () { const r = await cm.exportData(); if (r.path) U.toast('حُفظ الملف: ' + r.path, 'ok'); }); };
      $('#sy5', p).onclick = function (e) { U.act(e.currentTarget, async function () { const r = await cm.importFile(); if (r.imported) { U.toast('تم الاستيراد', 'ok'); A.refresh(); } }); };
      $('#sy6', p).onclick = async function () { if (await U.confirm('فصل الربط', 'سيُمسح ما على هذا الجهاز من بيانات العيادة (تبقى في الموقع). متابعة؟', 'فصل', 'bad')) { await cm.unlink(); location.reload(); } };
    },
    upd: function (p) {
      p.innerHTML = '<h3>التحديثات</h3><p>الإصدار الحالي: <b dir="ltr">' + E(A.st.version) + '</b></p><button class="btn" id="up1">' + ic('refresh') + ' البحث عن تحديث (GitHub)</button><div id="up2" style="margin-top:14px"></div>';
      $('#up1', p).onclick = function (e) {
        U.act(e.currentTarget, async function () {
          const r = await cm.checkUpdate(), o = $('#up2', p);
          if (!r.configured) o.innerHTML = '<p class="mut">لم يُضبط مستودع التحديثات في هذه النسخة.</p>';
          else if (!r.available) o.innerHTML = '<p class="chip ok">أنت على آخر إصدار.</p>';
          else { o.innerHTML = '<div class="card" style="box-shadow:inset 0 0 0 1.5px var(--brand)"><b>إصدار جديد ' + E(r.version) + '</b><pre style="white-space:pre-wrap;font-family:inherit;color:var(--mut);margin:8px 0">' + E(r.notes) + '</pre><button class="btn" id="up3">تثبيت وإعادة التشغيل</button></div>'; $('#up3', p).onclick = function (ev) { U.act(ev.currentTarget, function () { return cm.installUpdate(); }); }; }
        });
      };
    },
    lic: function (p) {
      const l = A.st.license;
      p.innerHTML = '<h3>الترخيص</h3><div class="card" style="background:var(--field);box-shadow:none"><div class="row sp"><b>' + ({ trial: 'نسخة تجريبية', active: 'مفعّلة', expired: 'منتهية', revoked: 'موقوفة', unknown: 'غير معروفة' }[l.status] || '') + '</b><span class="chip ' + (l.status === 'active' ? 'ok' : l.status === 'trial' ? 'warn' : 'bad') + '">' + E(l.message) + '</span></div></div>' +
        (l.enforced ? '<label class="l">مفتاح التفعيل</label><div class="row"><input class="in" id="lc1" dir="ltr" placeholder="CM-XXXX-XXXX-XXXX" style="text-align:start"><button class="btn" id="lc2">تفعيل</button></div><button class="btn sec sm" id="lc3" style="margin-top:14px">تواصل مع المطوّر</button>' : '<p class="mut" style="margin-top:12px">هذه نسخة مفتوحة المصدر بلا قيد ترخيص.</p>');
      if (l.enforced) { $('#lc2', p).onclick = function (e) { U.act(e.currentTarget, async function () { await cm.activate($('#lc1', p).value); await A.reloadState(); U.toast('تم التفعيل', 'ok'); PANES.lic(p); }); }; $('#lc3', p).onclick = function () { cm.openExternal(A.st.developerUrl).catch(function (er) { U.toast(er.message, 'err'); }); }; }
    },
    about: function (p) {
      p.innerHTML = '<h3>حول التطبيق</h3><p>' + E(A.st.appName) + ' <b dir="ltr">v' + E(A.st.version) + '</b></p><h4 style="margin-top:18px">شروط الاستخدام</h4><div class="mut" style="font-size:.9rem;line-height:1.8"><p>• الشيفرة المصدرية مفتوحة (MIT): يمكنك تعديلها وبناء نسختك مع الإبقاء على نسبة العمل للمطوّر.</p><p>• النسخ الرسمية المنشورة في صفحة الإصدارات تعمل مجاناً لمدة 30 يوماً، وبعدها يلزم مفتاح تفعيل.</p><p>• الاستخدام التجاري للنسخ الرسمية يتطلب ترخيصاً من المطوّر.</p><p>• التطبيق أداة مساعدة لإدارة العيادة ولا يغني عن مراجعة السجلات الأصلية؛ احتفظ بنسخ احتياطية.</p></div>' +
        '<h4 style="margin-top:18px">المطوّر</h4><p>صُمّم وطُوّر بواسطة <b>حسن</b> — <button class="btn sm sec" id="ab1">' + ic('link') + ' تواصل مع المطوّر</button></p>';
      $('#ab1', p).onclick = function () { cm.openExternal(A.st.developerUrl).catch(function (er) { U.toast(er.message, 'err'); }); };
    }
  };

  V.settings = {
    linkForm: linkForm,
    open: function (tab) {
      const d = U.dlg('الإعدادات', '<div class="stg"><nav>' + TABS.map(function (t) { return '<button data-t="' + t[0] + '">' + ic(t[1]) + '<span>' + t[2] + '</span></button>'; }).join('') + '</nav><div id="sp"></div></div>', { icon: 'sliders', size: 'wide' });
      const go = function (k) { U.$$('.stg nav button', d).forEach(function (b) { b.classList.toggle('on', b.dataset.t === k); }); PANES[k]($('#sp', d)); };
      $('.stg nav', d).onclick = function (e) { const b = e.target.closest('button'); if (b) go(b.dataset.t); };
      go(tab || 'look');
    }
  };
})();
