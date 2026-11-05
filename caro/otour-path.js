/*
 * Giải đấu Offline – nhánh loại trực tiếp theo vị trí trong bảng (dùng chung trình duyệt + máy chủ: otour-run.js):
 * vòng bảng → loại trực tiếp mà đường đi biết trước theo bảng (1A gặp 2B, 1E gặp đội hạng ba của A/B/C/D/F…) thay cho
 * xếp theo hạt giống. Bật bằng cfg.path = 'groups' ở giai đoạn loại trực tiếp ngay sau vòng bảng.
 *
 * Ô (slot): '1E' – nhất bảng E; '2A' – nhì bảng A; '3ABCDF' – một đội hạng ba tốt nhất thuộc các bảng A/B/C/D/F.
 * Khuôn = các cặp vòng 1 theo đúng thứ tự trên nhánh (cặp 0 – 1 gặp nhau ở vòng 2…).
 *   - World Cup 2026 (12 bảng, nhất + nhì + 8 đội hạng ba tốt nhất = 32): đúng các cặp vòng 32 đội FIFA công bố (trận
 *     73–88) và đường lên vòng 16 đội / tứ kết / bán kết (trận 89–102). Đội hạng ba vào ô nào: ghép hợp lệ (mỗi ô chỉ
 *     nhận bảng được phép, không trùng bảng) – có thể khác bảng 495 tổ hợp (Annex C) của FIFA ở một số tổ hợp.
 *   - Khuôn chung cho nhất + nhì (+ hạng ba tốt nhất): nhất bảng đầu gặp đội hạng ba (không cùng bảng), các nhất bảng
 *     còn lại gặp nhì bảng kề (1A–2B, 1B–2A…), nhì các bảng có nhất gặp hạng ba thì gặp nhau; xếp hai nửa nhánh để đội
 *     cùng bảng ở hai nửa khác nhau (gặp lại muộn nhất có thể).
 *   template(G, k, n) → khuôn hoặc null (không hợp: dùng cách xếp theo hạt giống như trước)
 *   resolve(pairs, pick) → mảng uid theo ô (slots cho buildStage) – pick(pos, g) = uid đội hạng pos của bảng g;
 *                          thirds: các bảng có đội hạng ba đi tiếp.
 *   labels(pairs, name) → ['1E – 3A/B/C/D/F', …] để hiện trước khi vòng bảng xong.
 */
(function (global) {
  'use strict';
  const LET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const isPow2 = (n) => n >= 2 && (n & (n - 1)) === 0;

  // World Cup 2026: thứ tự trên nhánh = 74, 77, 73, 75 | 83, 84, 81, 82 | 76, 78, 79, 80 | 86, 88, 85, 87
  // (vòng 16 đội: 89 = W74–W77, 90 = W73–W75, 93 = W83–W84, 94 = W81–W82, 91 = W76–W78, 92 = W79–W80, 95 = W86–W88,
  // 96 = W85–W87; tứ kết 97 = W89–W90, 98 = W93–W94, 99 = W91–W92, 100 = W95–W96; bán kết 101 = W97–W98, 102 = W99–W100)
  const WC2026 = [
    ['1E', '3ABCDF'], ['1I', '3CDFGH'], ['2A', '2B'], ['1F', '2C'],
    ['2K', '2L'], ['1H', '2J'], ['1D', '3BEFIJ'], ['1G', '3AEHIJ'],
    ['1C', '2F'], ['2E', '2I'], ['1A', '3CEFHI'], ['1L', '3EHIJK'],
    ['1J', '2H'], ['2D', '2G'], ['1B', '3EFGIJ'], ['1K', '3DEIJL'],
  ];

  const parse = (s) => ({ p: Number(s[0]), g: s.length === 2 ? LET.indexOf(s[1]) : null, from: s[0] === '3' ? [...s.slice(1)].map((c) => LET.indexOf(c)) : null });

  /** Khuôn chung: nhất + nhì (k = 2) + n đội hạng ba tốt nhất; hoặc chỉ nhất bảng (k = 1, n = 0). */
  function generic(G, k, n) {
    const L = (g) => LET[g];
    if (k === 1 && n === 0 && isPow2(G)) {
      const out = [];
      for (let i = 0; i < G / 2; i++) out.push(['1' + L(i), '1' + L(G - 1 - i)]);
      return out;
    }
    if (G > LET.length || k !== 2 || n % 2 || (G - n) % 2 || n > G || !isPow2(2 * G + n)) return null;
    const all = LET.slice(0, G);
    const pairs = [];
    for (let g = 0; g < n; g++) pairs.push(['1' + L(g), '3' + [...all].filter((c) => c !== L(g)).join('')]);
    for (let g = n; g < G; g += 2) pairs.push(['1' + L(g), '2' + L(g + 1)], ['1' + L(g + 1), '2' + L(g)]);
    for (let g = 0; g < n; g += 2) pairs.push(['2' + L(g), '2' + L(g + 1)]);
    return halves(pairs);
  }

  /** Xếp các cặp vào hai nửa nhánh: nhất và nhì cùng bảng ở hai nửa khác nhau (tô hai màu, cân số cặp mỗi nửa). */
  function halves(pairs) {
    const at = new Map(); // '1A' → chỉ số cặp
    pairs.forEach((pr, i) => pr.forEach((s) => { if (s[0] !== '3') at.set(s, i); }));
    const side = new Array(pairs.length).fill(-1);
    const half = pairs.length / 2;
    let cnt = [0, 0];
    for (let i = 0; i < pairs.length; i++) {
      if (side[i] >= 0) continue;
      const want = cnt[0] <= cnt[1] ? 0 : 1;
      const queue = [[i, want]];
      while (queue.length) {
        const [j, c] = queue.shift();
        if (side[j] >= 0) continue;
        const cc = cnt[c] < half ? c : 1 - c;
        side[j] = cc; cnt[cc]++;
        for (const s of pairs[j]) {
          if (s[0] === '3') continue;
          const other = at.get((s[0] === '1' ? '2' : '1') + s[1]);
          if (other != null && side[other] < 0) queue.push([other, 1 - cc]);
        }
      }
    }
    return [...pairs.filter((_, i) => side[i] === 0), ...pairs.filter((_, i) => side[i] === 1)];
  }

  function template(G, k, n) {
    if (G === 12 && k === 2 && n === 8) return WC2026.map((p) => p.slice());
    return generic(G, k, n);
  }

  /**
   * Ghép các đội hạng ba đi tiếp (bảng thirds) vào các ô '3…': mỗi ô một bảng được phép, không bảng nào hai lần.
   * Tìm theo thứ tự ô, thử bảng theo thứ tự chữ cái (kết quả cố định). Không ghép được → null.
   */
  function assignThirds(pairs, thirds) {
    const slots = [];
    pairs.forEach((pr, i) => pr.forEach((s, j) => { if (s[0] === '3') slots.push({ i, j, from: parse(s).from }); }));
    if (slots.length !== thirds.length) return null;
    const want = [...thirds].sort((a, b) => a - b);
    const used = new Set(), out = new Array(slots.length);
    const go = (k) => {
      if (k === slots.length) return true;
      for (const g of want) {
        if (used.has(g) || !slots[k].from.includes(g)) continue;
        used.add(g); out[k] = g;
        if (go(k + 1)) return true;
        used.delete(g);
      }
      return false;
    };
    if (!go(0)) return null;
    const m = new Map();
    slots.forEach((s, k) => m.set(s.i + ':' + s.j, out[k]));
    return m;
  }

  /** Mảng uid theo ô (vòng 1, đúng thứ tự trên nhánh) hoặc null. */
  function resolve(pairs, pick, thirds) {
    const th = assignThirds(pairs, thirds || []);
    if (!th) return null;
    const out = [];
    for (let i = 0; i < pairs.length; i++) {
      for (let j = 0; j < 2; j++) {
        const x = parse(pairs[i][j]);
        const uid = x.p === 3 ? pick(3, th.get(i + ':' + j)) : pick(x.p, x.g);
        if (!uid) return null;
        out.push(uid);
      }
    }
    return out;
  }

  /** Nhãn hiện trước: "1E – 3A/B/C/D/F"; name(g): tên bảng thứ g (mặc định chữ cái). */
  function labels(pairs, name = (g) => LET[g]) {
    const one = (s) => { const x = parse(s); return x.p === 3 ? '3 ' + x.from.map(name).join('/') : x.p + name(x.g); };
    return pairs.map(([a, b]) => `${one(a)} – ${one(b)}`);
  }

  const api = { template, resolve, labels, assignThirds, WC2026 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.CaroOTourPath = api;
})(typeof window !== 'undefined' ? window : globalThis);
