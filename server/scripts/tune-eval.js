/*
 * Huấn luyện trọng số chấm điểm thế cờ của engine.js từ ván đấu thật (Texel tuning – cách cộng đồng engine cờ vua
 * dùng để chỉnh hàm đánh giá: chọn trọng số sao cho điểm thế cờ dự đoán đúng nhất kết quả ván).
 * Công cụ cho người phát triển; dữ liệu lấy từ server/scripts/gomocup-import.js.
 *
 *   node server/scripts/tune-eval.js <file .jsonl> <luật của app: vn|free|std|renju> [số ván tối đa=40000]
 *   TEMPO=<số> node … : giữ cố định lợi thế được đi (dữ liệu tự đấu lệch về bên đi trước có thể kéo nó âm vô lý)
 *   LABEL=ev EVSCALE=<số> node … : học theo điểm của engine thầy ghi trong ván (trường ev, vd. ván Rapfi tự đấu) thay
 *   cho kết quả ván
 *   → in bộ trọng số { a5, d5, a6, d6, pa, pd, tempo } để dán vào EVAL trong caro/engine.js, kèm sai số trước / sau.
 *
 * Mỗi thế cờ (bỏ khai cuộc cho sẵn và các thế đang có ô thắng – thế "động", điểm tĩnh không nói lên gì) được đếm số
 * cửa sổ 5 ô / 6 ô theo số quân của bên tới lượt và của đối thủ. Điểm = Σ a·(thế mình) − Σ d·(thế đối thủ) + tempo,
 * Thêm đặc trưng mẫu chéo (engine-patterns.js, ý tưởng Rapfi): số ô có mẫu L_FLEX2 … B_FLEX4 của bên tới lượt (pa) và
 * của đối thủ (pd), lấy từ Position.p4cnt của engine.
 * khả năng thắng = 1 / (1 + e^(−điểm/360)) như engine.winChance. Tối ưu sai số log-loss bằng Adam.
 * Bàn của Gomocup có biên (15×15 / 20×20) còn bàn của app vô hạn: cửa sổ chạm biên không tính.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const EN = require(path.join(__dirname, '../../caro/engine.js'));
const X = 1, O = 2, WALL = 3;
const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];
// Đặc trưng: own5[1..4], opp5[1..4], own6[2..3], opp6[2..3]; 12: bên tới lượt là X (chỉ để hấp thụ lợi thế đi trước của
// dữ liệu, không đưa vào engine); 13..23: số ô mẫu chéo 1..11 của bên tới lượt; 24..34: của đối thủ
const NP = 11, NF = 13 + 2 * NP, NV = 14 + 2 * NP;
const fi = { own5: (k) => k - 1, opp5: (k) => 3 + k, own6: (k) => 6 + k, opp6: (k) => 8 + k };

/** Đếm đặc trưng của thế cờ (grid n×n, bên tới lượt s). */
function features(grid, n, s, vn) {
  const f = new Float64Array(NF);
  f[12] = s === X ? 1 : 0;
  const at = (x, y) => (x < 0 || y < 0 || x >= n || y >= n ? WALL : grid[y * n + x]);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      for (const [dx, dy] of DIRS) {
        // cửa sổ 5 ô bắt đầu ở (x, y)
        let cx = 0, co = 0, wall = false;
        for (let k = 0; k < 5; k++) { const v = at(x + k * dx, y + k * dy); if (v === X) cx++; else if (v === O) co++; else if (v === WALL) wall = true; }
        if (!wall && !((cx && co) || (!cx && !co))) {
          const c = cx ? X : O, cnt = cx || co, q = cx ? O : X;
          const pa = at(x - dx, y - dy), pb = at(x + 5 * dx, y + 5 * dy);
          const blocked = vn && (pa === q || pa === WALL) && (pb === q || pb === WALL);
          if (!blocked) f[c === s ? fi.own5(cnt) : fi.opp5(cnt)]++;
        }
        // cửa sổ 6 ô: hai đầu trống, 4 ô giữa một màu
        if (at(x, y) === 0 && at(x + 5 * dx, y + 5 * dy) === 0) {
          let ix = 0, io = 0, w6 = false;
          for (let k = 1; k < 5; k++) { const v = at(x + k * dx, y + k * dy); if (v === X) ix++; else if (v === O) io++; else if (v === WALL) w6 = true; }
          if (!w6 && !((ix && io) || (!ix && !io))) {
            const c = ix ? X : O, cnt = ix || io;
            if (cnt >= 2 && cnt <= 3) f[c === s ? fi.own6(cnt) : fi.opp6(cnt)]++;
          }
        }
      }
    }
  }
  return f;
}

function loadPositions(file, rule, maxGames) {
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
  // Trộn cố định rồi lấy maxGames ván
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let i = lines.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [lines[i], lines[j]] = [lines[j], lines[i]]; }
  const out = [];
  const vn = rule === 'vn';
  for (const line of lines.slice(0, maxGames)) {
    const g = JSON.parse(line);
    const n = g.n || 20, moves = g.m;
    if (moves.length < 14) continue;
    // Bỏ phần khai cuộc cho sẵn (Gomocup đặt sẵn ~3–8 quân) và vài nước cuối (thế đã quyết)
    const picks = new Set();
    for (let t = 0; t < 6; t++) picks.add(8 + Math.floor(rnd() * Math.max(1, moves.length - 12)));
    const grid = new Int8Array(n * n);
    const pos = [];
    for (let i = 0; i < moves.length; i++) {
      if (picks.has(i)) {
        const s = i % 2 === 0 ? X : O;
        // Thế "động" (bên nào đang có ô thắng): bỏ
        const P = new EN.Position(moves.slice(0, i), rule === 'vn' ? 'vn' : rule);
        if (!P.winCount[X] && !P.winCount[O]) {
          // Nhãn: kết quả ván; LABEL=ev và ván có điểm của engine thầy (vd. Rapfi – ev[i] theo góc nhìn bên tới lượt) thì dùng
          // nhãn mềm = khả năng thắng theo điểm đó (EVSCALE: thang điểm của thầy) – ít nhiễu hơn kết quả ván nhiều
          const res = process.env.LABEL === 'ev' && g.ev && g.ev[i] != null
            ? 1 / (1 + Math.exp(-g.ev[i] / Number(process.env.EVSCALE || 300)))
            : g.w === 0 ? 0.5 : g.w === (s === X ? 1 : 2) ? 1 : 0;
          const f = features(grid, n, s, vn);
          for (let v = 1; v <= NP; v++) { f[12 + v] = P.p4cnt[s][v]; f[12 + NP + v] = P.p4cnt[3 - s][v]; }
          pos.push({ f, r: res });
        }
      }
      const [x, y] = moves[i];
      if (x >= 0 && y >= 0 && x < n && y < n) grid[y * n + x] = i % 2 === 0 ? X : O;
    }
    out.push(...pos);
  }
  return out;
}

// Tham số: a5[1..4], d5[1..4], a6[2..3], d6[2..3], tempo, xBias, pa[1..11], pd[1..11] → vector NV chiều
const zeros = () => new Array(12).fill(0);
const toVec = (e) => [e.a5[1], e.a5[2], e.a5[3], e.a5[4], e.d5[1], e.d5[2], e.d5[3], e.d5[4], e.a6[2], e.a6[3], e.d6[2], e.d6[3], e.tempo, e.xBias || 0,
  ...(e.pa || zeros()).slice(1, NP + 1), ...(e.pd || zeros()).slice(1, NP + 1)];
const fromVec = (v) => {
  const r = (x) => Math.max(0, Math.round(x));
  return { a5: [0, r(v[0]), r(v[1]), r(v[2]), r(v[3]), 0], d5: [0, r(v[4]), r(v[5]), r(v[6]), r(v[7]), 0],
    a6: [0, 0, r(v[8]), r(v[9]), 0], d6: [0, 0, r(v[10]), r(v[11]), 0],
    pa: [0, ...v.slice(14, 14 + NP).map(Math.round), 0], pd: [0, ...v.slice(14 + NP, 14 + 2 * NP).map(Math.round), 0], tempo: Math.round(v[12]) };
};
// Tham số j (khác tempo / xBias) ↔ đặc trưng FJ[j], dấu SIGN[j] (thế đối thủ mang dấu trừ)
const FJ = [], SIGN = [];
for (let j = 0; j < 12; j++) { FJ[j] = j; SIGN[j] = [1, 1, 1, 1, -1, -1, -1, -1, 1, 1, -1, -1][j]; }
for (let v = 0; v < NP; v++) { FJ[14 + v] = 13 + v; SIGN[14 + v] = 1; FJ[14 + NP + v] = 13 + NP + v; SIGN[14 + NP + v] = -1; }
function score(v, f) {
  let s = v[12] + (v[13] || 0) * f[12];
  for (let j = 0; j < NV; j++) if (j !== 12 && j !== 13) s += SIGN[j] * v[j] * f[FJ[j]];
  return s;
}
const K = 1 / 360;
function loss(v, data) {
  let L = 0;
  for (const d of data) {
    const p = 1 / (1 + Math.exp(-score(v, d.f) * K));
    L -= d.r * Math.log(p + 1e-12) + (1 - d.r) * Math.log(1 - p + 1e-12);
  }
  return L / data.length;
}

function tune(data, start, iters = 400) {
  const v = start.slice();
  while (v.length < NV) v.push(0);
  // Đặc trưng hiếm gặp (vd. 4 quân, 3 mở – thường đã có ô thắng nên thế bị bỏ): không đủ dữ liệu, giữ trọng số cũ
  const seen = new Float64Array(NV);
  for (const d of data) for (let j = 0; j < NV; j++) if (j !== 12 && j !== 13 && d.f[FJ[j]]) seen[j]++;
  const frozen = Array.from(seen, (c, j) => j !== 12 && j !== 13 && c < data.length * (j < 12 ? 0.02 : 0.003));
  // PAT=0: chỉ học trọng số cửa sổ (như trước)
  if (process.env.PAT === '0') for (let j = 14; j < NV; j++) frozen[j] = true;
  const m = new Float64Array(NV), s2 = new Float64Array(NV);
  const lr = [2, 4, 8, 20, 2, 4, 8, 20, 4, 15, 4, 15, 4, 4, ...new Array(2 * NP).fill(4)];
  for (let it = 1; it <= iters; it++) {
    const g = new Float64Array(NV);
    for (const d of data) {
      const p = 1 / (1 + Math.exp(-score(v, d.f) * K));
      const e = (p - d.r) * K;
      for (let j = 0; j < NV; j++) if (j !== 12 && j !== 13) g[j] += e * SIGN[j] * d.f[FJ[j]];
      g[12] += e;
      g[13] += e * d.f[12];
    }
    for (let j = 0; j < NV; j++) {
      if (frozen[j]) continue;
      if (j === 12 && process.env.TEMPO) continue; // TEMPO=<số>: giữ cố định lợi thế được đi
      g[j] /= data.length;
      m[j] = 0.9 * m[j] + 0.1 * g[j];
      s2[j] = 0.999 * s2[j] + 0.001 * g[j] * g[j];
      const mh = m[j] / (1 - Math.pow(0.9, it)), sh = s2[j] / (1 - Math.pow(0.999, it));
      v[j] -= lr[j] * mh / (Math.sqrt(sh) + 1e-12);
      if (j < 12 && v[j] < 0) v[j] = 0;
    }
  }
  return v;
}

function main() {
  const [file, rule = 'free', max = '40000'] = process.argv.slice(2);
  if (!file) { console.error('Cách dùng: node server/scripts/tune-eval.js <file .jsonl> <vn|free|std|renju> [số ván]'); process.exit(1); }
  const data = loadPositions(file, rule, Number(max));
  // 80% để học, 20% để kiểm tra (tránh học thuộc lòng)
  const cut = Math.floor(data.length * 0.8);
  const train = data.slice(0, cut), test = data.slice(cut);
  // Điểm xuất phát: bộ trọng số hiện tại của luật trong engine (START=base: bộ cũ công = thủ)
  const cur = process.env.START === 'base' ? EN.EVAL.base : EN.EVAL[rule] || EN.EVAL.base;
  const base = toVec(cur);
  console.log(`${data.length} thế cờ (${train.length} học / ${test.length} kiểm tra)`);
  console.log('Sai số trước:', loss(base, train).toFixed(4), '/', loss(base, test).toFixed(4));
  if (process.env.TEMPO) base[12] = Number(process.env.TEMPO);
  const v = tune(train, base);
  const e = fromVec(v);
  console.log('Sai số sau:  ', loss(v, train).toFixed(4), '/', loss(v, test).toFixed(4), '· lợi thế cầm X của dữ liệu:', Math.round(v[13]));
  console.log(`${rule}: ${JSON.stringify(e)}`);
}

if (require.main === module) main();
module.exports = { features, loadPositions, tune, loss, toVec, fromVec };
