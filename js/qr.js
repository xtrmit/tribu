/* Tribu — générateur de QR code, sans dépendance (mode octets, correction M, versions 1 à 10).
   Usage : TribuQR.svg('texte', { ink: '#2B2320', bg: '#FFFFFF' }) -> chaîne SVG. */
(function () {
  'use strict';
  // --- Corps de Galois GF(256), polynôme 0x11D ---
  const EXP = new Array(512), LOG = new Array(256);
  for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
  function rsGen(deg) {
    let g = [1];
    for (let i = 0; i < deg; i++) {
      const n = new Array(g.length + 1).fill(0);
      for (let j = 0; j < g.length; j++) { n[j] ^= g[j]; n[j + 1] ^= mul(g[j], EXP[i]); }
      g = n;
    }
    return g;
  }
  function rsRem(data, deg) {
    const g = rsGen(deg), r = new Array(deg).fill(0);
    for (const d of data) {
      const f = d ^ r.shift(); r.push(0);
      for (let i = 0; i < deg; i++) r[i] ^= mul(g[i + 1], f);
    }
    return r;
  }
  // Niveau M : [codes de correction par bloc, nb blocs groupe 1, données par bloc g1, nb blocs g2, données par bloc g2]
  const TAB = [null, [10, 1, 16, 0, 0], [16, 1, 28, 0, 0], [26, 1, 44, 0, 0], [18, 2, 32, 0, 0], [24, 2, 43, 0, 0],
    [16, 4, 27, 0, 0], [18, 4, 31, 0, 0], [22, 2, 38, 2, 39], [22, 3, 36, 2, 37], [26, 4, 43, 1, 44]];
  const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
  const bit = (v, i) => ((v >>> i) & 1) !== 0;

  function encode(text) {
    const bytes = Array.from(new TextEncoder().encode(text));
    let ver = 0, t;
    for (let v = 1; v <= 10; v++) {
      t = TAB[v];
      const cap = (t[1] * t[2] + t[3] * t[4]) * 8;
      if (4 + (v < 10 ? 8 : 16) + bytes.length * 8 <= cap) { ver = v; break; }
    }
    if (!ver) throw new Error('Texte trop long pour le QR code');
    const dataCw = t[1] * t[2] + t[3] * t[4];
    // Bits de données
    const bits = [];
    const push = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    push(4, 4); push(bytes.length, ver < 10 ? 8 : 16); bytes.forEach(b => push(b, 8));
    push(0, Math.min(4, dataCw * 8 - bits.length));
    while (bits.length % 8) bits.push(0);
    const cw = [];
    for (let i = 0; i < bits.length; i += 8) cw.push(parseInt(bits.slice(i, i + 8).join(''), 2));
    for (let p = 0; cw.length < dataCw; p++) cw.push(p % 2 ? 0x11 : 0xec);
    // Blocs + correction, puis entrelacement
    const blocks = [], eccs = [];
    let k = 0;
    for (let b = 0; b < t[1] + t[3]; b++) {
      const len = b < t[1] ? t[2] : t[4];
      const blk = cw.slice(k, k + len); k += len;
      blocks.push(blk); eccs.push(rsRem(blk, t[0]));
    }
    const all = [];
    for (let i = 0; i < Math.max(t[2], t[4]); i++) blocks.forEach(b => { if (i < b.length) all.push(b[i]); });
    for (let i = 0; i < t[0]; i++) eccs.forEach(e => all.push(e[i]));

    // Matrice
    const n = 17 + 4 * ver;
    const mod = [], fn = [];
    for (let y = 0; y < n; y++) { mod.push(new Array(n).fill(false)); fn.push(new Array(n).fill(false)); }
    const set = (x, y, d) => { mod[y][x] = d; fn[y][x] = true; };
    for (let i = 0; i < n; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    const finder = (cx, cy) => {
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0 || x >= n || y >= n) continue;
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        set(x, y, d !== 2 && d !== 4);
      }
    };
    finder(3, 3); finder(n - 4, 3); finder(3, n - 4);
    const al = ALIGN[ver];
    for (let i = 0; i < al.length; i++) for (let j = 0; j < al.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(al[i] + dx, al[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
    const drawFormat = (mask) => {
      const data = (0 << 3) | mask; // niveau M = 00
      let r = data; for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
      const b = ((data << 10) | r) ^ 0x5412;
      for (let i = 0; i <= 5; i++) set(8, i, bit(b, i));
      set(8, 7, bit(b, 6)); set(8, 8, bit(b, 7)); set(7, 8, bit(b, 8));
      for (let i = 9; i < 15; i++) set(14 - i, 8, bit(b, i));
      for (let i = 0; i < 8; i++) set(n - 1 - i, 8, bit(b, i));
      for (let i = 8; i < 15; i++) set(8, n - 15 + i, bit(b, i));
      set(8, n - 8, true);
    };
    drawFormat(0);
    if (ver >= 7) {
      let r = ver; for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
      const b = (ver << 12) | r;
      for (let i = 0; i < 18; i++) { const a = n - 11 + (i % 3), c = Math.floor(i / 3); set(a, c, bit(b, i)); set(c, a, bit(b, i)); }
    }
    // Placement des données en zigzag
    let bi = 0; const total = all.length * 8;
    for (let right = n - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let v = 0; v < n; v++) for (let j = 0; j < 2; j++) {
        const x = right - j, up = ((right + 1) & 2) === 0, y = up ? n - 1 - v : v;
        if (!fn[y][x] && bi < total) { mod[y][x] = bit(all[bi >>> 3], 7 - (bi & 7)); bi++; }
      }
    }
    // Choix du masque (pénalités standard)
    const MASKS = [
      (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
      (x, y) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0, (x, y) => (x * y) % 2 + (x * y) % 3 === 0,
      (x, y) => ((x * y) % 2 + (x * y) % 3) % 2 === 0, (x, y) => ((x + y) % 2 + (x * y) % 3) % 2 === 0
    ];
    const applyMask = (m) => { for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!fn[y][x] && MASKS[m](x, y)) mod[y][x] = !mod[y][x]; };
    const penalty = () => {
      let p = 0, dark = 0;
      const line = (get) => {
        let run = 1, s = 0, seq = '';
        for (let i = 0; i < n; i++) {
          const c = get(i); seq += c ? '1' : '0';
          if (i > 0) { if (c === get(i - 1)) { run++; if (run === 5) s += 3; else if (run > 5) s++; } else run = 1; }
        }
        let idx = -1;
        while ((idx = seq.indexOf('1011101', idx + 1)) >= 0) {
          if (seq.substr(idx - 4, 4) === '0000' || seq.substr(idx + 7, 4) === '0000') s += 40;
        }
        return s;
      };
      for (let y = 0; y < n; y++) p += line(i => mod[y][i]);
      for (let x = 0; x < n; x++) p += line(i => mod[i][x]);
      for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) {
        const c = mod[y][x];
        if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) p += 3;
      }
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (mod[y][x]) dark++;
      p += Math.floor(Math.abs(dark * 20 - n * n * 10) / (n * n)) * 10;
      return p;
    };
    let best = 0, bestP = Infinity;
    for (let m = 0; m < 8; m++) {
      applyMask(m); drawFormat(m);
      const p = penalty();
      if (p < bestP) { bestP = p; best = m; }
      applyMask(m);
    }
    applyMask(best); drawFormat(best);
    return mod;
  }

  function svg(text, opt) {
    opt = opt || {};
    const m = encode(text), n = m.length, q = 4, s = n + 2 * q;
    let d = '';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (m[y][x]) d += 'M' + (x + q) + ' ' + (y + q) + 'h1v1h-1z';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + s + ' ' + s + '" shape-rendering="crispEdges" role="img" aria-label="QR code">' +
      '<rect width="' + s + '" height="' + s + '" fill="' + (opt.bg || '#FFFFFF') + '"/>' +
      '<path d="' + d + '" fill="' + (opt.ink || '#000000') + '"/></svg>';
  }

  window.TribuQR = { svg: svg, encode: encode };
})();
