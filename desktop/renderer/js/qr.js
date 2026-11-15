'use strict';
/**
 * Minimal QR Code encoder (byte mode, error-correction level M, versions 1–10 → up to 213 bytes). No dependencies.
 * QR.matrix(text) → boolean[][]   |   QR.draw(canvas, text, px, margin)   |   QR.svg(text, px)
 * Verified against OpenCV's QRCodeDetector (see desktop/test/qr.test.py, run in CI).
 */
(function () {
  // [total codewords, ec codewords per block, [[count, dataCodewords], …]]  — level M
  const VERS = [null,
    [26, 10, [[1, 16]]], [44, 16, [[1, 28]]], [70, 26, [[1, 44]]], [100, 18, [[2, 32]]], [134, 24, [[2, 43]]],
    [172, 16, [[4, 27]]], [196, 18, [[4, 31]]], [242, 22, [[2, 38], [2, 39]]], [292, 22, [[3, 36], [2, 37]]], [346, 26, [[4, 43], [1, 44]]]];
  const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

  // GF(256)
  const EXP = new Array(512), LOG = new Array(256);
  (function () { let x = 1; for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; } for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; })();
  const mul = function (a, b) { return a && b ? EXP[LOG[a] + LOG[b]] : 0; };
  function rsGen(n) { let g = [1]; for (let i = 0; i < n; i++) { const ng = new Array(g.length + 1).fill(0); for (let j = 0; j < g.length; j++) { ng[j] ^= g[j]; ng[j + 1] ^= mul(g[j], EXP[i]); } g = ng; } return g; }
  function rsEc(data, n) {
    const g = rsGen(n), r = new Array(n).fill(0);
    data.forEach(function (d) { const f = d ^ r[0]; r.shift(); r.push(0); if (f) for (let i = 0; i < n; i++) r[i] ^= mul(g[i + 1], f); });
    return r;
  }
  function utf8(s) { return Array.from(new TextEncoder().encode(s)); }

  function pickVersion(len) {
    for (let v = 1; v <= 10; v++) { const cap = VERS[v][2].reduce(function (a, b) { return a + b[0] * b[1]; }, 0); const bits = 4 + (v < 10 ? 8 : 16) + len * 8; if (bits <= cap * 8) return v; }
    throw new Error('النص طويل جداً لرمز QR.');
  }
  function codewords(bytes, v) {
    const info = VERS[v], cap = info[2].reduce(function (a, b) { return a + b[0] * b[1]; }, 0), bits = [];
    const put = function (val, n) { for (let i = n - 1; i >= 0; i--) bits.push((val >> i) & 1); };
    put(4, 4); put(bytes.length, v < 10 ? 8 : 16); bytes.forEach(function (b) { put(b, 8); });
    put(0, Math.min(4, cap * 8 - bits.length)); while (bits.length % 8) bits.push(0);
    const out = []; for (let i = 0; i < bits.length; i += 8) { let b = 0; for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j]; out.push(b); }
    for (let pad = 0xEC; out.length < cap; pad ^= 0xEC ^ 0x11) out.push(pad);
    // split into blocks, add EC, interleave
    const blocks = []; let pos = 0;
    info[2].forEach(function (g) { for (let i = 0; i < g[0]; i++) { const d = out.slice(pos, pos + g[1]); pos += g[1]; blocks.push({ d: d, e: rsEc(d, info[1]) }); } });
    const res = [], maxD = Math.max.apply(null, blocks.map(function (b) { return b.d.length; }));
    for (let i = 0; i < maxD; i++) blocks.forEach(function (b) { if (i < b.d.length) res.push(b.d[i]); });
    for (let i = 0; i < info[1]; i++) blocks.forEach(function (b) { res.push(b.e[i]); });
    return res;
  }

  function bch(val, poly, bitsData, bitsAll) { let v = val << (bitsAll - bitsData); const top = (function (p) { let n = 0; while (p >> n) n++; return n; })(poly); for (let i = bitsAll - 1; i >= top - 1; i--) if ((v >> i) & 1) v ^= poly << (i - top + 1); return (val << (bitsAll - bitsData)) | v; }

  function build(text) {
    const bytes = utf8(text), v = pickVersion(bytes.length), n = 17 + 4 * v, cw = codewords(bytes, v);
    const M = [], F = []; for (let i = 0; i < n; i++) { M.push(new Array(n).fill(false)); F.push(new Array(n).fill(false)); }
    const set = function (x, y, d) { if (x >= 0 && y >= 0 && x < n && y < n) { M[y][x] = d; F[y][x] = true; } };
    const finder = function (cx, cy) { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const m = Math.max(Math.abs(dx), Math.abs(dy)); set(cx + dx, cy + dy, m !== 2 && m !== 4); } };
    finder(3, 3); finder(n - 4, 3); finder(3, n - 4);
    for (let i = 8; i < n - 8; i++) { set(i, 6, i % 2 === 0); set(6, i, i % 2 === 0); }
    const al = ALIGN[v];
    al.forEach(function (ay) { al.forEach(function (ax) {
      if ((ax === 6 && ay === 6) || (ax === 6 && ay === al[al.length - 1]) || (ax === al[al.length - 1] && ay === 6)) return;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }); });
    set(8, n - 8, true); // dark module
    for (let i = 0; i < 9; i++) { F[8][i] = F[i][8] = true; } for (let i = 0; i < 8; i++) { F[8][n - 1 - i] = true; F[n - 1 - i][8] = true; }
    if (v >= 7) { const vi = bch(v, 0x1F25, 6, 18); for (let i = 0; i < 18; i++) { const b = ((vi >> i) & 1) === 1, a = Math.floor(i / 3), c = n - 11 + (i % 3); set(c, a, b); set(a, c, b); } }

    // data placement
    const bitsAt = function (i) { return (cw[i >> 3] >> (7 - (i & 7))) & 1; };
    const total = cw.length * 8; let bi = 0;
    const place = function () {
      const D = []; for (let i = 0; i < n; i++) D.push(new Array(n).fill(false));
      let up = true; bi = 0;
      for (let x = n - 1; x > 0; x -= 2) {
        if (x === 6) x--;
        for (let k = 0; k < n; k++) { const y = up ? n - 1 - k : k; for (let c = 0; c < 2; c++) { const xx = x - c; if (F[y][xx]) continue; D[y][xx] = bi < total ? bitsAt(bi) === 1 : false; bi++; } }
        up = !up;
      }
      return D;
    };
    const D = place();
    const MASKS = [function (x, y) { return (x + y) % 2 === 0; }, function (x, y) { return y % 2 === 0; }, function (x, y) { return x % 3 === 0; }, function (x, y) { return (x + y) % 3 === 0; },
      function (x, y) { return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0; }, function (x, y) { return ((x * y) % 2) + ((x * y) % 3) === 0; },
      function (x, y) { return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; }, function (x, y) { return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0; }];
    const withMask = function (m) {
      const R = M.map(function (r, y) { return r.map(function (d, x) { return F[y][x] ? d : (D[y][x] !== MASKS[m](x, y)); }); });
      const fmt = bch((0 << 3) | m, 0x537, 5, 15) ^ 0x5412;                         // level M = 00
      const bit = function (i) { return ((fmt >> i) & 1) === 1; };
      for (let i = 0; i <= 5; i++) R[i][8] = bit(i); R[7][8] = bit(6); R[8][8] = bit(7); R[8][7] = bit(8); for (let i = 9; i < 15; i++) R[8][14 - i] = bit(i);
      for (let i = 0; i < 8; i++) R[8][n - 1 - i] = bit(i); for (let i = 8; i < 15; i++) R[n - 15 + i][8] = bit(i);
      R[n - 8][8] = true;
      return R;
    };
    const penalty = function (R) {
      let p = 0;
      for (let pass = 0; pass < 2; pass++) for (let a = 0; a < n; a++) {
        let run = 1;
        for (let b = 1; b < n; b++) { const cur = pass ? R[b][a] : R[a][b], prev = pass ? R[b - 1][a] : R[a][b - 1]; if (cur === prev) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1; }
      }
      for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) if (R[y][x] === R[y][x + 1] && R[y][x] === R[y + 1][x] && R[y][x] === R[y + 1][x + 1]) p += 3;
      const pat = [true, false, true, true, true, false, true, false, false, false, false];
      for (let a = 0; a < n; a++) for (let b = 0; b <= n - 11; b++) for (let pass = 0; pass < 2; pass++) for (let r = 0; r < 2; r++) {
        let ok = true; for (let k = 0; k < 11; k++) { const val = pass ? R[b + k][a] : R[a][b + k], want = r ? pat[10 - k] : pat[k]; if (val !== want) { ok = false; break; } } if (ok) p += 40;
      }
      let dark = 0; R.forEach(function (r) { r.forEach(function (d) { if (d) dark++; }); }); p += Math.floor(Math.abs(dark * 20 - n * n * 10) / (n * n)) * 10;
      return p;
    };
    let best = null, bp = Infinity; for (let m = 0; m < 8; m++) { const R = withMask(m), p = penalty(R); if (p < bp) { bp = p; best = R; } }
    return best;
  }

  const QR = {
    matrix: build,
    draw: function (canvas, text, px, margin) {
      const m = build(text), q = margin == null ? 4 : margin, s = Math.floor((px || 240) / (m.length + 2 * q)) || 1, size = s * (m.length + 2 * q);
      canvas.width = canvas.height = size; const g = canvas.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, size, size); g.fillStyle = '#000';
      m.forEach(function (r, y) { r.forEach(function (d, x) { if (d) g.fillRect((x + q) * s, (y + q) * s, s, s); }); });
      return canvas;
    },
    svg: function (text, px) {
      const m = build(text), q = 4, n = m.length + 2 * q; let d = '';
      m.forEach(function (r, y) { r.forEach(function (c, x) { if (c) d += 'M' + (x + q) + ' ' + (y + q) + 'h1v1h-1z'; }); });
      return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + n + ' ' + n + '" width="' + (px || 240) + '" height="' + (px || 240) + '" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="' + d + '" fill="#000"/></svg>';
    }
  };
  if (typeof module !== 'undefined') module.exports = QR;
  if (typeof window !== 'undefined') window.QR = QR;
})();
