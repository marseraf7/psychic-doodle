/*
 * Sinh thế cờ cho kiểm thử đối chiếu JS ↔ Rust (diff.js, bench.js): bộ sinh số ngẫu nhiên có hạt giống, ván ngẫu
 * nhiên theo từng luật, và "đám quân" ngẫu nhiên dày đặc (đặt bằng put, không theo lượt) để ép nhiều thế cấm Renju.
 * Chỉ dùng caro/rules.js (C) để chọn nước – kết quả so sánh nằm ở compare.js.
 */
'use strict';

const LIM = 1 << 20;

/** mulberry32: nhanh, đủ đều, tái lập được theo hạt giống. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (rnd, arr) => arr[Math.floor(rnd() * arr.length)];
const inRange = (x, y) => x >= -LIM && x < LIM && y >= -LIM && y < LIM;

/** Điểm xuất phát: phần lớn ở gốc, một số sát mép khoảng hợp lệ [-2^20, 2^20) để thử biên khóa số. */
function startPoint(rnd) {
  const r = rnd();
  if (r < 0.06) return [LIM - 4, LIM - 3];
  if (r < 0.12) return [-LIM + 2, -LIM + 3];
  if (r < 0.16) return [LIM - 3, -LIM + 1];
  if (r < 0.2) return [Math.floor(rnd() * 2 * LIM) - LIM, Math.floor(rnd() * 2 * LIM) - LIM];
  return [0, 0];
}

/** Một nước ứng viên cho quân p (có thể trùng ô / ngoài khoảng: người gọi tự loại). */
function candidate(C, b, own, all, p, rnd) {
  const s = rnd();
  if (own.length && s < 0.35) {
    // Nối dài một đường của mình: đi tới cuối chuỗi theo một hướng
    const [x, y] = pick(rnd, own), [dx, dy] = pick(rnd, C.DIRS), sg = rnd() < 0.5 ? 1 : -1;
    let k = 1;
    while (b.get(x + sg * k * dx, y + sg * k * dy) === p) k++;
    return [x + sg * k * dx, y + sg * k * dy];
  }
  const src = own.length && s < 0.7 ? own : all, d = src === own ? 1 : 2;
  const [x, y] = pick(rnd, src);
  return [x + Math.floor(rnd() * (2 * d + 1)) - d, y + Math.floor(rnd() * (2 * d + 1)) - d];
}

/**
 * Ván ngẫu nhiên theo luật rule: trả về [[x, y, p], …] (X đi trước). Một nửa số ván dừng khi có người thắng, nửa kia
 * đánh tiếp (cho ra chuỗi dài, quá năm, chuỗi bị chặn hai đầu…). Renju: phần lớn ván X tránh ô cấm như ván thật.
 */
function randomGame(C, rule, rnd) {
  const b = new C.Board(rule);
  const len = 6 + Math.floor(rnd() * 115);
  const stopAtWin = rnd() < 0.5, avoidForbid = rnd() < 0.85;
  const moves = [], stones = { 1: [], 2: [] }, all = [];
  let p = C.X;
  for (let i = 0; i < len; i++) {
    let mv = null;
    for (let t = 0; t < 40 && !mv; t++) {
      const [x, y] = all.length ? candidate(C, b, stones[p], all, p, rnd) : startPoint(rnd);
      if (!inRange(x, y) || b.get(x, y) !== C.EMPTY) continue;
      if (rule === 'renju' && p === C.X && avoidForbid && C.forbidden(b, x, y, p)) continue;
      mv = [x, y];
    }
    if (!mv) break;
    b.play(mv[0], mv[1], p);
    moves.push([mv[0], mv[1], p]);
    stones[p].push(mv); all.push(mv);
    if (stopAtWin && C.checkWin(b, mv[0], mv[1], p)) break;
    p = C.other(p);
  }
  return moves;
}

/** Đám quân ngẫu nhiên trong ô vuông cạnh 5–11 (mật độ X 20–45 %, O 5–25 %): danh sách [x, y, p] để put. */
function randomBlob(rnd) {
  const n = 5 + Math.floor(rnd() * 7), dX = 0.2 + rnd() * 0.25, dO = 0.05 + rnd() * 0.2;
  const ox = Math.floor(rnd() * 21) - 10, oy = Math.floor(rnd() * 21) - 10, out = [];
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) {
      const r = rnd();
      if (r < dX) out.push([ox + x, oy + y, 1]);
      else if (r < dX + dO) out.push([ox + x, oy + y, 2]);
    }
  }
  return out;
}

module.exports = { LIM, mulberry32, randomGame, randomBlob, inRange };
