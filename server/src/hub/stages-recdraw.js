/*
 * Giải offline – bốc thăm nhánh loại trực tiếp theo thành tích vòng Thụy Sĩ thắng / thua (cfg.draw = 'record' ở giai đoạn
 * loại trực tiếp ngay sau; kiểu tứ kết LoL Worlds 2023–2025 – chỉ mô phỏng thể thức):
 *   - Đội thành tích tốt nhất (vd. 3–0) gặp đội thành tích kém nhất trong số đi tiếp (vd. 3–2), bốc ngẫu nhiên;
 *   - các đội còn lại bốc ngẫu nhiên với nhau;
 *   - tránh hai đội cùng khu vực (cột quốc gia) gặp nhau ở vòng đầu khi có thể;
 *   - các đội thành tích tốt nhất ở các nửa nhánh khác nhau.
 * Chỉ khi số đội là luỹ thừa của 2 (không có miễn đấu); không thì xếp theo hạt giống như thường (trả null).
 */
'use strict';
const crypto = require('crypto');
const { records } = require('./stages-league.js');

const TRIES = 300;
const rnd = (n) => crypto.randomInt(n);
function shuffle(a, r = rnd) { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = r(i + 1); [x[i], x[j]] = [x[j], x[i]]; } return x; }

/**
 * Ô vòng 1 của nhánh (mảng uid theo vị trí: cặp 0–1, 2–3…; nửa trên là nửa đầu mảng) hoặc null.
 * prev: giai đoạn Thụy Sĩ vừa xong; seeds: các đội đi tiếp; countryOf(uid) → khu vực; r(n): số ngẫu nhiên 0…n − 1.
 */
function recordDraw(prev, seeds, countryOf = () => '', r = rnd) {
  const n = seeds.length;
  if (n < 4 || (n & (n - 1)) || !prev || prev.type !== 'swiss' || !prev.cfg.record) return null;
  const rec = records(prev);
  const byLoss = new Map();
  for (const u of seeds) { const l = rec[u] ? rec[u].l : 0; if (!byLoss.has(l)) byLoss.set(l, []); byLoss.get(l).push(u); }
  const levels = [...byLoss.keys()].sort((a, b) => a - b);
  const top = byLoss.get(levels[0]), bottom = levels.length > 1 ? byLoss.get(levels[levels.length - 1]) : [];
  const same = (a, b) => !!countryOf(a) && countryOf(a) === countryOf(b);
  let best = null, bestBad = Infinity;
  for (let k = 0; k < TRIES && bestBad > 0; k++) {
    // Đội tốt nhất gặp đội kém nhất (khi đủ), phần còn lại ghép ngẫu nhiên
    const tops = shuffle(top, r), bots = shuffle(bottom, r);
    const pairs = [];
    const used = new Set();
    for (const a of tops) {
      const b = bots.find((x) => !used.has(x));
      if (!b) break;
      pairs.push([a, b]); used.add(a); used.add(b);
    }
    const rest = shuffle(seeds.filter((u) => !used.has(u)), r);
    for (let i = 0; i + 1 < rest.length; i += 2) pairs.push([rest[i], rest[i + 1]]);
    const bad = pairs.filter(([a, b]) => same(a, b)).length;
    if (bad < bestBad) { best = pairs; bestBad = bad; }
  }
  // Nửa nhánh: các cặp có đội tốt nhất xen kẽ hai nửa, các cặp còn lại chia đều ngẫu nhiên
  const half = n / 4; // số cặp mỗi nửa
  const withTop = best.filter(([a]) => top.includes(a)), others = shuffle(best.filter(([a]) => !top.includes(a)), r);
  const A = [], B = [];
  withTop.forEach((p, i) => (i % 2 ? B : A).push(p));
  for (const p of others) (A.length < half ? A : B).push(p);
  if (A.length !== half || B.length !== half) return null;
  return [...A, ...B].flat();
}

module.exports = { recordDraw, shuffle };
