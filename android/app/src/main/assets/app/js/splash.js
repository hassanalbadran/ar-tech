'use strict';
/**
 * Loading animation: ~260 glowing spheres orbit, then fall into a brain silhouette that keeps rotating until the data is ready;
 * then it turns to face the viewer, glows, and resolves (app.js then shows the welcome screen).
 * Splash.start(canvas) → { setProgress(0..100), finish() → Promise, stop() }
 */
(function () {
  const W = 400, H = 300;

  /** Brain silhouette (side view, frontal lobe on the right) drawn on an offscreen canvas; folds (sulci) are carved out as gaps. */
  function brainMask() {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = '#000';
    // cerebrum
    g.beginPath();
    g.moveTo(62, 150);
    g.bezierCurveTo(40, 118, 62, 78, 104, 66);
    g.bezierCurveTo(124, 36, 176, 24, 214, 38);
    g.bezierCurveTo(258, 22, 318, 40, 342, 82);
    g.bezierCurveTo(372, 100, 378, 150, 352, 176);
    g.bezierCurveTo(350, 202, 318, 214, 292, 204);
    g.bezierCurveTo(274, 222, 246, 222, 232, 206);
    g.bezierCurveTo(206, 214, 168, 212, 148, 198);
    g.bezierCurveTo(118, 206, 76, 190, 62, 150);
    g.closePath(); g.fill();
    // cerebellum
    g.beginPath(); g.moveTo(112, 190); g.bezierCurveTo(100, 220, 128, 252, 172, 246); g.bezierCurveTo(200, 242, 212, 222, 206, 208); g.bezierCurveTo(170, 214, 134, 208, 112, 190); g.closePath(); g.fill();
    // brain stem
    g.beginPath(); g.moveTo(208, 206); g.bezierCurveTo(212, 232, 226, 254, 232, 282); g.lineTo(256, 282); g.bezierCurveTo(250, 252, 252, 232, 252, 212); g.closePath(); g.fill();
    // carve the folds
    g.globalCompositeOperation = 'destination-out'; g.lineWidth = 3.2; g.lineCap = 'round';
    const wig = function (pts) { g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 4) g.quadraticCurveTo(pts[i], pts[i + 1], pts[i + 2], pts[i + 3]); g.stroke(); };
    wig([250, 40, 262, 70, 244, 92, 232, 116, 250, 142, 236, 168]);       // central sulcus
    wig([120, 186, 150, 168, 188, 176, 214, 160, 246, 168, 284, 170]);    // lateral fissure
    wig([112, 96, 140, 84, 158, 108, 176, 92, 196, 104, 214, 82]);
    wig([282, 70, 304, 88, 322, 72, 334, 98, 350, 92]);
    wig([86, 138, 112, 128, 128, 146, 150, 132, 170, 144]);
    wig([290, 120, 312, 132, 300, 150, 326, 160, 316, 178]);
    wig([188, 62, 200, 80, 186, 98, 204, 116]);
    g.lineWidth = 2.2; wig([214, 214, 190, 226, 160, 226, 134, 214]); wig([150, 226, 176, 238, 196, 230]);
    return g.getImageData(0, 0, W, H).data;
  }

  function targets(n) {
    const d = brainMask(), on = function (x, y) { x = Math.round(x); y = Math.round(y); return x >= 0 && y >= 0 && x < W && y < H && d[(y * W + x) * 4 + 3] > 128; };
    const edge = [], fill = [];
    for (let y = 2; y < H - 2; y += 2) for (let x = 2; x < W - 2; x += 2) {
      if (!on(x, y)) continue;
      if (!on(x - 3, y) || !on(x + 3, y) || !on(x, y - 3) || !on(x, y + 3)) edge.push([x, y]); else fill.push([x, y]);
    }
    const out = [], rnd = (function () { let s = 7; return function () { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();
    const pick = function (arr, k) { for (let i = 0; i < k; i++) out.push(arr.splice(Math.floor(rnd() * arr.length), 1)[0]); };
    pick(edge, Math.min(edge.length, Math.round(n * 0.72))); pick(fill, n - out.length);
    return out.map(function (p) {
      const x = (p[0] - W / 2) * 1.3, y = (p[1] - H / 2 - 6) * 1.3, r = Math.min(1, Math.hypot(x / 190, y / 140));
      return { x: x, y: y, z: (rnd() - 0.5) * 2 * Math.sqrt(Math.max(0.03, 1 - r * r)) * 90 };
    });
  }

  const ease = function (t) { t = Math.max(0, Math.min(1, t)); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };

  function start(canvas) {
    const ctx = canvas.getContext('2d'), N = 420, T = targets(N);
    const rnd = (function () { let s = 99; return function () { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();
    const P = T.map(function (t, i) {
      return { t: t, R: 70 + rnd() * 190, ph: rnd() * 6.283, w: (0.5 + rnd() * 0.9) * (rnd() < .5 ? -1 : 1), inc: (rnd() - .5) * 1.9, tilt: rnd() * 6.283, hue: i / N, s: 1.5 + rnd() * 1.7, lag: rnd() * 0.28 };
    });
    const t0 = performance.now(); let raf = 0, prog = 0, finishing = null, resolveFin = null, stopped = false;
    const MIN_MS = 3400, ASSEMBLE = 2300;
    let angle = 0, last = t0;

    function frame(now) {
      if (stopped) return;
      const dt = Math.min(50, now - last) / 1000; last = now;
      const el = now - t0, cw = canvas.width, ch = canvas.height, sc = cw / 560, f = 640;
      ctx.clearRect(0, 0, cw, ch);
      const cx = cw / 2, cy = ch / 2;
      const settle = finishing ? ease((now - finishing.at) / 900) : 0;     // 0..1 turn to face the viewer
      const glow = finishing ? ease((now - finishing.at - 700) / 700) : 0;  // 0..1 halo
      const out = finishing && now - finishing.at > 1900 ? 1 : 0;
      // gentle sway while waiting (always readable as a brain), eased to face the viewer when finishing
      const sway = 0.62 * Math.sin(el / 1050) * Math.min(1, el / ASSEMBLE);
      if (!finishing) angle = sway; else { if (finishing.from === undefined) finishing.from = angle; angle = finishing.from * (1 - settle); }
      const ca = Math.cos(angle), sa = Math.sin(angle);
      const sorted = [];
      for (let i = 0; i < N; i++) {
        const p = P[i], t = p.t;
        const c = ease((el / ASSEMBLE) - p.lag);                // 0 = orbiting, 1 = brain
        const a = p.ph + (el / 1000) * p.w * (1 - c * 0.85);
        // orbit position in 3D
        let ox = p.R * Math.cos(a), oy = p.R * Math.sin(a) * Math.sin(p.inc), oz = p.R * Math.sin(a) * Math.cos(p.inc);
        const tc = Math.cos(p.tilt * 0.3), ts = Math.sin(p.tilt * 0.3); const ox2 = ox * tc - oy * ts; oy = ox * ts + oy * tc; ox = ox2;
        // brain position rotated about Y
        const bx = t.x * ca + t.z * sa, bz = -t.x * sa + t.z * ca, by = t.y;
        // a gentle breathing once assembled
        const br = 1 + 0.012 * Math.sin(el / 420 + i);
        const x = (ox + (bx * br - ox) * c), y = (oy + (by * br - oy) * c), z = (oz + (bz - oz) * c);
        const s = f / (f + z * 1.0);
        sorted.push({ X: cx + x * s * sc, Y: cy + y * s * sc, s: s, z: z, p: p, c: c });
      }
      sorted.sort(function (a, b) { return b.z - a.z; });
      ctx.globalCompositeOperation = 'lighter';
      if (glow > 0) { // soft halo behind the whole brain
        const g = ctx.createRadialGradient(cx, cy, 10 * sc, cx, cy, 260 * sc);
        g.addColorStop(0, 'rgba(120,230,255,' + (0.22 * glow) + ')'); g.addColorStop(0.55, 'rgba(242,174,72,' + (0.10 * glow) + ')'); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch);
      }
      for (let i = 0; i < sorted.length; i++) {
        const o = sorted[i], p = o.p, depth = Math.max(0.25, Math.min(1, 0.55 + o.z / 260));
        const r = p.s * o.s * sc * (1 + glow * 0.2) * (0.8 + 0.2 * o.c);
        const hue = 188 - p.hue * 150 + (o.c > .9 ? 0 : 0);                // teal → amber
        const light = 60 + glow * 14, a = depth * (0.55 + 0.45 * o.c) * (1 - out * 0.25);
        const g = ctx.createRadialGradient(o.X - r * .3, o.Y - r * .3, r * .1, o.X, o.Y, r * 1.9);
        g.addColorStop(0, 'hsla(' + hue + ',90%,' + (light + 22) + '%,' + a + ')'); g.addColorStop(0.45, 'hsla(' + hue + ',85%,' + light + '%,' + a * 0.8 + ')'); g.addColorStop(1, 'hsla(' + hue + ',85%,50%,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(o.X, o.Y, r * 1.9, 0, 6.2832); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      if (finishing && out && resolveFin) { const r = resolveFin; resolveFin = null; r(); }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return {
      setProgress: function (p) { prog = Math.max(prog, p); },
      finish: function () {
        return new Promise(function (resolve) {
          resolveFin = resolve;
          const wait = Math.max(0, MIN_MS - (performance.now() - t0));
          setTimeout(function () { finishing = { at: performance.now(), target: 0 }; }, wait);
        });
      },
      stop: function () { stopped = true; cancelAnimationFrame(raf); }
    };
  }

  window.Splash = { start: start };
})();
