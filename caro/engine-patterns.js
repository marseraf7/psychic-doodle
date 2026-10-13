/*
 * Mẫu hình theo ô cho engine.js (học ý tưởng từ Rapfi / Wine – engine Gomoku hàng đầu; tự viết, không dùng mã của họ).
 *
 * Mẫu đường (line pattern): với một ô trống, một bên c và một hướng, nếu c đánh vào ô đó thì đường 11 ô qua ô đó
 * (5 ô mỗi bên) thành gì:
 *   F5  – thắng ngay (năm; luật Việt Nam: cả bốn mở hai đầu)
 *   F4  – "bốn mở": có nước thắng tiếp mà đối thủ không chặn nổi bằng một quân trên đường này
 *   B4  – "bốn": có nước thắng tiếp, chặn được bằng một quân
 *   F3S / F3 – "ba mở": đánh thêm một quân là thành F4 (F3S: có ≥ 2 cách)
 *   B3  – "ba chặn": đánh thêm một quân là thành B4
 *   F2 / B2 – "hai": đánh thêm một quân là thành F3 / B3
 * Phân loại bằng cách vét cạn trên đường theo đúng luật thắng của engine (winLine giống Position.winDir), nên đúng cho cả
 * 4 luật – kể cả đặc thù luật Việt Nam (bốn mở thắng ngay, năm bị chặn hai đầu không thắng) – không phải viết tay.
 * Kết quả ghi nhớ theo mã của đường (3^10 trạng thái của 10 ô quanh), mỗi mã chỉ tính một lần.
 *
 * Mẫu chéo (cell pattern, như Pattern4 của Rapfi): gộp 4 hướng của một ô cho một bên:
 *   A_FIVE (thắng ngay) > B_FLEX4 (bốn mở / bốn kép – thắng sau 1 nước nữa) > C_BLOCK4_FLEX3 (bốn-ba) > D_BLOCK4_PLUS
 *   > E_BLOCK4 (bốn) > F_FLEX3_2X (ba kép) > G_FLEX3_PLUS > H_FLEX3 (ba mở) > I_BLOCK3_PLUS > J_FLEX2_2X > K_BLOCK3 > L_FLEX2 > NONE
 * Chạy được trên trình duyệt (window.CaroPatterns), Web Worker và Node.
 */
(function (global) {
  'use strict';
  // Mẫu đường
  const NONE = 0, B2 = 1, F2 = 2, B3 = 3, F3 = 4, F3S = 5, B4 = 6, F4 = 7, F5 = 8;
  // Mẫu chéo
  const P4 = {
    NONE: 0, L_FLEX2: 1, K_BLOCK3: 2, J_FLEX2_2X: 3, I_BLOCK3_PLUS: 4, H_FLEX3: 5, G_FLEX3_PLUS: 6, F_FLEX3_2X: 7,
    E_BLOCK4: 8, D_BLOCK4_PLUS: 9, C_BLOCK4_FLEX3: 10, B_FLEX4: 11, A_FIVE: 12,
  };
  const H = 5, N = 2 * H + 1, C = H; // đường 11 ô, ô giữa là chỉ số 5
  const EMPTY = 0, OWN = 1, OPP = 2;

  /**
   * Đặt quân của mình (OWN) tại ô k của đường L có thắng không – cùng định nghĩa với engine.js winDir.
   * rule: 'vn' | 'free' | 'std' | 'renju'; isX: bên đi là X (Renju: X phải đúng 5, O được hàng dài hơn).
   * Ngoài đường coi như trống (giống at() của engine ngoài mảng). Chuỗi thắng phải chứa ô giữa (C).
   */
  function winAt(L, k, rule, isX) {
    let a = 1; while (k - a >= 0 && L[k - a] === OWN) a++;
    let b = 1; while (k + b < N && L[k + b] === OWN) b++;
    const len = a + b - 1;
    if (len < 4) return false;
    // Chỉ tính đe doạ có quân ở ô giữa: chuỗi không chứa ô giữa là đe doạ có sẵn (hoặc do nhìn thiếu ngoài 11 ô –
    // vd. luật Việt Nam "bốn mở" cần biết ô thứ 6, ngoài cửa sổ)
    if (k - a + 1 > C || k + b - 1 < C) return false;
    switch (rule) {
      case 'free': return len >= 5;
      case 'std': return len === 5;
      case 'renju': return isX ? len === 5 : len >= 5;
    }
    const openA = k - a < 0 || L[k - a] === EMPTY, openB = k + b >= N || L[k + b] === EMPTY;
    return (len >= 5 && (openA || openB)) || (openA && openB);
  }

  /** Các ô trống mà đánh vào là thắng. */
  function winCells(L, rule, isX) {
    const out = [];
    for (let k = 0; k < N; k++) {
      if (L[k] !== EMPTY) continue;
      L[k] = OWN;
      if (winAt(L, k, rule, isX)) out.push(k);
      L[k] = EMPTY;
    }
    return out;
  }

  /** Mức "bốn" của đường (chưa thắng): 2 = F4 (không chặn nổi bằng 1 quân), 1 = B4, 0 = không có. */
  function fourLevel(L, rule, isX) {
    const W = winCells(L, rule, isX);
    if (!W.length) return 0;
    for (let b = 0; b < N; b++) {
      if (L[b] !== EMPTY) continue;
      L[b] = OPP;
      const left = winCells(L, rule, isX).length;
      L[b] = EMPTY;
      if (!left) return 1; // chặn được bằng một quân
    }
    return 2;
  }

  /** Mức "ba": 2 = có nước thành F4 (đếm số nước), 1 = chỉ thành B4, 0 = không. */
  function threeLevel(L, rule, isX) {
    let f4 = 0, b4 = 0;
    for (let e = 0; e < N; e++) {
      if (L[e] !== EMPTY) continue;
      L[e] = OWN;
      if (!winAt(L, e, rule, isX)) {
        const lv = fourLevel(L, rule, isX);
        if (lv === 2) f4++; else if (lv === 1) b4++;
      }
      L[e] = EMPTY;
    }
    return { f4, b4 };
  }

  /** Mẫu đường khi bên mình đã đặt quân ở ô giữa L[C]. */
  function classify(L, rule, isX) {
    if (winAt(L, C, rule, isX)) return F5;
    const lv4 = fourLevel(L, rule, isX);
    if (lv4 === 2) return F4;
    if (lv4 === 1) return B4;
    const t = threeLevel(L, rule, isX);
    if (t.f4 >= 2) return F3S;
    if (t.f4) return F3;
    if (t.b4) return B3;
    // "hai": đánh thêm một quân thành ba mở / ba chặn
    let f3 = false, b3 = false;
    for (let e = 0; e < N && !f3; e++) {
      if (L[e] !== EMPTY) continue;
      L[e] = OWN;
      if (!winAt(L, e, rule, isX) && !fourLevel(L, rule, isX)) {
        const u = threeLevel(L, rule, isX);
        if (u.f4) f3 = true; else if (u.b4) b3 = true;
      }
      L[e] = EMPTY;
    }
    return f3 ? F2 : b3 ? B2 : NONE;
  }

  // Bảng ghi nhớ: mã của cả 11 ô (cơ số 3, theo góc nhìn bên đi; ô giữa luôn trống khi tra) → mẫu đường; -1 = chưa tính.
  // Dùng cả 11 ô để engine tính mã kiểu "trượt" (bỏ một chữ số đầu, thêm một chữ số cuối) khi đi dọc một đường.
  const KEYS = 177147; // 3^11
  const tables = {};
  function table(rule, isX) {
    const name = rule === 'renju' ? (isX ? 'renjuX' : 'renjuO') : rule;
    return tables[name] || (tables[name] = new Int8Array(KEYS).fill(-1));
  }
  const buf = new Int8Array(N);
  /** Mẫu đường theo mã (đã ghi nhớ). */
  function lookup(T, key, rule, isX) {
    let v = T[key];
    if (v >= 0) return v;
    let k = key;
    for (let i = 0; i < N; i++) { buf[i] = k % 3; k = (k - buf[i]) / 3; }
    buf[C] = OWN; // quân vừa đặt ở ô giữa
    v = classify(buf, rule, isX);
    T[key] = v;
    return v;
  }

  /** Gộp 4 mẫu đường của một ô thành mẫu chéo (tra bảng 9^4 tính sẵn). */
  const COMBO = new Uint8Array(6561);
  function combine(a, b, c, d) { return COMBO[a * 729 + b * 81 + c * 9 + d]; }
  function combineSlow(a, b, c, d) {
    let n5 = 0, nF4 = 0, nB4 = 0, nF3 = 0, nB3 = 0, nF2 = 0;
    for (const p of [a, b, c, d]) {
      if (p === F5) n5++; else if (p === F4) nF4++; else if (p === B4) nB4++;
      else if (p === F3 || p === F3S) nF3++; else if (p === B3) nB3++; else if (p === F2) nF2++;
    }
    if (n5) return P4.A_FIVE;
    if (nF4 || nB4 >= 2) return P4.B_FLEX4;
    if (nB4) return nF3 ? P4.C_BLOCK4_FLEX3 : nB3 || nF2 ? P4.D_BLOCK4_PLUS : P4.E_BLOCK4;
    if (nF3 >= 2) return P4.F_FLEX3_2X;
    if (nF3) return nB3 || nF2 ? P4.G_FLEX3_PLUS : P4.H_FLEX3;
    if (nB3 >= 2 || (nB3 && nF2)) return P4.I_BLOCK3_PLUS;
    if (nF2 >= 2) return P4.J_FLEX2_2X;
    if (nB3) return P4.K_BLOCK3;
    if (nF2) return P4.L_FLEX2;
    return P4.NONE;
  }

  for (let a = 0; a < 9; a++) for (let b = 0; b < 9; b++) for (let c = 0; c < 9; c++) for (let d = 0; d < 9; d++) {
    COMBO[a * 729 + b * 81 + c * 9 + d] = combineSlow(a, b, c, d);
  }

  const CaroPatterns = { NONE, B2, F2, B3, F3, F3S, B4, F4, F5, P4, H, N, KEYS, COMBO, table, lookup, combine, classify, winAt };
  if (typeof module !== 'undefined' && module.exports) module.exports = CaroPatterns;
  else global.CaroPatterns = CaroPatterns;
})(typeof window !== 'undefined' ? window : globalThis);
