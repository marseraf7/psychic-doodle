/*
 * Học "chính sách nước đi" cho engine (như mạng policy của AlphaGo / KataGo, nhưng thay mạng CNN bằng mô hình log-linear
 * trên đặc trưng mẫu hình – chạy được bằng JavaScript trên máy người chơi). Mô hình cho mỗi ô trống một điểm; softmax trên
 * các ô ứng viên = xác suất nước được chọn. Học từ ván của engine vô địch Gomocup (gomocup-import.js) hoặc ván tự đấu
 * (selfplay.js): tối đa log-likelihood nước thật đã đi (SGD). Công cụ cho người phát triển.
 *
 *   node server/scripts/train-policy.js <luật: vn|free|std|renju> <file .jsonl,…> [số thế=150000] [số vòng=3]
 *   → in độ chính xác top-1 / top-3 (so với xếp theo mẫu đường hiện tại) và ghi trọng số vào caro/policy-data.js
 *
 * Đặc trưng của ô i khi bên p tới lượt (q = đối thủ) – xem engine-moves.js policyScore:
 *   [mẫu chéo của p ở i (13)] × [mẫu chéo của q ở i (13)], mẫu đường 4 hướng của p / của q (9 + 9),
 *   khoảng cách tới nước vừa đi của đối thủ / tới nước trước của mình (6 + 6), số quân quanh ô (9), cặp mẫu đường
 *   mình × đối thủ trên từng hướng (9 × 9).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const CARO = path.join(__dirname, '../../caro');
const EN = require(path.join(CARO, 'engine.js'));
const OUT = path.join(CARO, 'policy-data.js');

const NW = 169 + 9 + 9 + 6 + 6 + 9 + 81; // số trọng số
const O_LINE_P = 169, O_LINE_Q = 178, O_DOPP = 187, O_DOWN = 193, O_NEAR = 199, O_PAIR = 208;

/** Các chỉ số đặc trưng của ô i (bên p tới lượt). */
function feats(pos, i, p, lastOpp, lastOwn, out) {
  const q = 3 - p, b = i * 4, W = pos.W;
  out.length = 0;
  out.push(pos.p4[p][i] * 13 + pos.p4[q][i]);
  for (let d = 0; d < 4; d++) {
    const a = pos.pat[p][b + d], c = pos.pat[q][b + d];
    out.push(O_LINE_P + a, O_LINE_Q + c, O_PAIR + a * 9 + c);
  }
  const dist = (j) => (j < 0 ? 5 : Math.min(5, Math.max(Math.abs((j % W) - (i % W)), Math.abs(((j / W) | 0) - ((i / W) | 0))) - 1));
  out.push(O_DOPP + dist(lastOpp), O_DOWN + dist(lastOwn), O_NEAR + Math.min(8, pos.near[i]));
  return out;
}

/** Thế cờ mẫu: chạy qua từng ván, lấy ngẫu nhiên vài thế (bỏ khai cuộc, bỏ thế đã có ô thắng – nước bắt buộc). */
function* samples(files, rule, max) {
  let seed = 11;
  const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  let n = 0;
  const lines = [];
  for (const f of files) for (const l of fs.readFileSync(f, 'utf8').trim().split('\n')) lines.push(l);
  for (let k = lines.length - 1; k > 0; k--) { const j = Math.floor(rnd() * (k + 1)); [lines[k], lines[j]] = [lines[j], lines[k]]; }
  for (const line of lines) {
    const g = JSON.parse(line), m = g.m;
    if (m.length < 12) continue;
    const pos = new EN.Position(m, rule);
    for (let t = m.length; t > 0; t--) pos.undo();
    for (let t = 0; t < m.length - 1; t++) {
      const p = pos.side, mv = pos.idx(m[t][0], m[t][1]);
      if (t >= 6 && rnd() < 0.35 && !pos.winCount[1] && !pos.winCount[2] && pos.near[mv]) {
        yield { pos, p, mv, lastOpp: t ? pos.stack[t - 1] : -1, lastOwn: t > 1 ? pos.stack[t - 2] : -1 };
        if (++n >= max) return;
      }
      pos.play(mv, p);
    }
  }
}

function main() {
  const [rule, fileList, MAX = '150000', EPOCHS = '3'] = process.argv.slice(2);
  if (!rule || !fileList) { console.error('Cách dùng: node server/scripts/train-policy.js <luật> <file.jsonl,…> [số thế] [số vòng]'); process.exit(1); }
  // Gom dữ liệu: mỗi thế = danh sách ứng viên (đặc trưng) + chỉ số nước thật + hạng theo cách xếp cũ
  const data = [];
  const f = [];
  for (const s of samples(fileList.split(','), rule, +MAX)) {
    const { pos, p, mv } = s, flat = [];
    let target = -1, n = 0;
    for (let i = 0; i < pos.cells.length; i++) {
      if (pos.cells[i] || !pos.near[i]) continue;
      if (i === mv) target = n;
      for (const x of feats(pos, i, p, s.lastOpp, s.lastOwn, f)) flat.push(x);
      n++;
    }
    if (target < 0) continue;
    // Hạng của nước thật theo cách xếp hiện tại (candidates – mẫu đường)
    const order = pos.candidates(p);
    data.push({ cand: Int16Array.from(flat), n, target, oldRank: order.indexOf(mv) });
  }
  const cut = Math.floor(data.length * 0.9), train = data.slice(0, cut), test = data.slice(cut);
  console.log(`${rule}: ${data.length} thế (${train.length} học / ${test.length} kiểm tra)`);
  const w = new Float64Array(NW);
  const NF = 16; // số đặc trưng mỗi ô
  const scores = (d) => { const out = new Float64Array(d.n); for (let j = 0; j < d.n; j++) { let s = 0; for (let k = j * NF; k < j * NF + NF; k++) s += w[d.cand[k]]; out[j] = s; } return out; };
  const evalSet = (set) => {
    let top1 = 0, top3 = 0, old1 = 0, old3 = 0, ll = 0;
    for (const d of set) {
      const sc = scores(d), t = sc[d.target];
      let rank = 0, z = 0;
      const mx = Math.max(...sc);
      for (const s of sc) { if (s > t) rank++; z += Math.exp(s - mx); }
      ll += t - mx - Math.log(z);
      if (rank === 0) top1++; if (rank < 3) top3++;
      if (d.oldRank === 0) old1++; if (d.oldRank >= 0 && d.oldRank < 3) old3++;
    }
    const n = set.length;
    return { top1: top1 / n, top3: top3 / n, old1: old1 / n, old3: old3 / n, ll: ll / n };
  };
  // SGD (Adagrad) trên log-likelihood softmax
  const g2 = new Float64Array(NW).fill(1e-8);
  for (let ep = 0; ep < +EPOCHS; ep++) {
    for (const d of train) {
      const sc = scores(d);
      let mx = -Infinity; for (const s of sc) if (s > mx) mx = s;
      let z = 0; for (let j = 0; j < d.n; j++) { sc[j] = Math.exp(sc[j] - mx); z += sc[j]; }
      const grad = new Float64Array(NW);
      for (let j = 0; j < d.n; j++) { const pj = sc[j] / z - (j === d.target ? 1 : 0); for (let k = j * NF; k < j * NF + NF; k++) grad[d.cand[k]] += pj; }
      for (let k = 0; k < NW; k++) if (grad[k]) { g2[k] += grad[k] * grad[k]; w[k] -= 0.1 * grad[k] / Math.sqrt(g2[k]); }
    }
    const r = evalSet(test);
    console.log(`  vòng ${ep + 1}: top-1 ${(100 * r.top1).toFixed(1)}% · top-3 ${(100 * r.top3).toFixed(1)}% · log-lik ${r.ll.toFixed(3)} (xếp cũ: top-1 ${(100 * r.old1).toFixed(1)}%, top-3 ${(100 * r.old3).toFixed(1)}%)`);
  }
  write(rule, Array.from(w, (x) => Math.round(x * 100) / 100));
}

function write(rule, weights) {
  let data = {};
  try { data = require(OUT); } catch (e) { /* chưa có */ }
  data[rule] = weights;
  const body = Object.entries(data).map(([r, a]) => `    ${r}: [${a.join(', ')}],`).join('\n');
  fs.writeFileSync(OUT, `/*
 * Trọng số chính sách nước đi của engine (sinh tự động bởi server/scripts/train-policy.js – đừng sửa tay), theo luật.
 * Thứ tự: [mẫu chéo mình × mẫu chéo đối thủ (13 × 13)], mẫu đường 4 hướng của mình (9), của đối thủ (9), khoảng cách tới
 * nước vừa đi của đối thủ (6), tới nước trước của mình (6), số quân quanh ô (9), cặp mẫu đường mình × đối thủ theo hướng
 * (9 × 9). Dùng trong engine-moves.js (policyScore).
 */
(function (global) {
  'use strict';
  const DATA = {
${body}
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = DATA;
  else global.CaroPolicyData = DATA;
})(typeof window !== 'undefined' ? window : globalThis);
`);
}

if (require.main === module) main();
module.exports = { feats, NW };
