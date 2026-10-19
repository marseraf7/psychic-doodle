/*
 * Học trọng số chấm điểm theo mẫu đường (engine-eval.js evalLines: la / ld / pa / pd / tempo) – Texel tuning như
 * tune-eval.js, nhưng đặc trưng lấy thẳng từ Position của engine: số (ô trống, hướng) theo từng mẫu đường (lcnt) và số ô
 * theo từng mẫu chéo (p4cnt) của bên tới lượt / đối thủ. Công cụ cho người phát triển.
 *
 *   node server/scripts/tune-lines.js <file .jsonl …> [luật=vn]
 *   EVSCALE=<số>: thang điểm của engine thầy (Rapfi-CARO luật Việt Nam: 400 – khả năng thắng 1 / (1 + e^(−cp/400)))
 *   LABEL=result: học theo kết quả ván thay cho điểm của thầy
 * Dữ liệu: ván {"m":[[x,y],…],"w","ev":[điểm thầy của thế trước nước i, góc nhìn bên tới lượt],"open"} – vd. Rapfi-CARO
 * tự đấu. Bỏ: khai cuộc cho sẵn, thế đang có ô thắng (thế "động"), thế đã quyết (|điểm| ≥ 3000), quân cách mép bàn < 3 ô.
 * → in bộ trọng số để dán vào EVAL trong caro/engine-eval.js, kèm sai số trước / sau (80% học / 20% kiểm tra).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const EN = require(path.join(__dirname, '../../caro/engine.js'));

const NL = 8, NP = 11; // mẫu đường 1..8 (B2 … F5), mẫu chéo 1..11
// Vector tham số: la[1..8], ld[1..8], pa[1..11], pd[1..11], tempo, xBias (lợi thế cầm X của dữ liệu – không đưa vào engine)
const NV = 2 * NL + 2 * NP + 2, T0 = 2 * NL + 2 * NP;
const K = 1 / 360;

function features(moves, rule) {
  const P = new EN.Position(moves, rule);
  if (P.winCount[1] || P.winCount[2]) return null;
  const s = P.side, q = 3 - s, f = new Float64Array(NV);
  f.cur = P.evaluate(); // điểm theo bộ trọng số hiện tại của engine (để so)
  for (let t = 1; t <= NL; t++) { f[t - 1] = P.lcnt[s][t]; f[NL + t - 1] = -P.lcnt[q][t]; }
  for (let v = 1; v <= NP; v++) { f[2 * NL + v - 1] = P.p4cnt[s][v]; f[2 * NL + NP + v - 1] = -P.p4cnt[q][v]; }
  f[T0] = 1; f[T0 + 1] = s === 1 ? 1 : 0;
  return f;
}

function load(files, rule) {
  const out = [];
  const scale = Number(process.env.EVSCALE || 400);
  for (const file of files) {
    for (const line of fs.readFileSync(file, 'utf8').trim().split('\n')) {
      if (!line) continue;
      const g = JSON.parse(line), n = g.n || 20, mv = g.m;
      for (let i = (g.open || 3) + 2; i < mv.length; i++) {
        const cp = g.ev && g.ev[i];
        if (process.env.LABEL !== 'result' && (cp == null || Math.abs(cp) >= 3000)) continue;
        const pre = mv.slice(0, i);
        if (pre.some(([x, y]) => x < 3 || y < 3 || x > n - 4 || y > n - 4)) continue;
        const f = features(pre, rule);
        if (!f) continue;
        const s = i % 2 === 0 ? 1 : 2;
        const r = process.env.LABEL === 'result' ? (g.w === 0 ? 0.5 : g.w === s ? 1 : 0) : 1 / (1 + Math.exp(-cp / scale));
        out.push({ f, r, cur: f.cur });
      }
    }
  }
  // Trộn cố định (khỏi để các thế của cùng một ván dồn vào một phía khi chia học / kiểm tra)
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

const score = (v, f) => { let s = 0; for (let j = 0; j < NV; j++) s += v[j] * f[j]; return s; };
function loss(v, data) {
  let L = 0;
  for (const d of data) {
    const p = 1 / (1 + Math.exp(-score(v, d.f) * K));
    L -= d.r * Math.log(p + 1e-12) + (1 - d.r) * Math.log(1 - p + 1e-12);
  }
  return L / data.length;
}

function tune(data, v0, iters = 600) {
  const v = v0.slice(), m = new Float64Array(NV), s2 = new Float64Array(NV);
  for (let it = 1; it <= iters; it++) {
    const g = new Float64Array(NV);
    for (const d of data) {
      const e = (1 / (1 + Math.exp(-score(v, d.f) * K)) - d.r) * K;
      for (let j = 0; j < NV; j++) if (d.f[j]) g[j] += e * d.f[j];
    }
    for (let j = 0; j < NV; j++) {
      g[j] /= data.length;
      m[j] = 0.9 * m[j] + 0.1 * g[j];
      s2[j] = 0.999 * s2[j] + 0.001 * g[j] * g[j];
      v[j] -= 3 * (m[j] / (1 - Math.pow(0.9, it))) / (Math.sqrt(s2[j] / (1 - Math.pow(0.999, it))) + 1e-12);
    }
  }
  return v;
}

function main() {
  const args = process.argv.slice(2);
  const rule = ['vn', 'free', 'std', 'renju'].includes(args[args.length - 1]) ? args.pop() : 'vn';
  if (!args.length) { console.error('Cách dùng: node server/scripts/tune-lines.js <file .jsonl …> [vn|free|std|renju]'); process.exit(1); }
  const data = load(args, rule);
  const cut = Math.floor(data.length * 0.8), train = data.slice(0, cut), test = data.slice(cut);
  // Điểm xuất phát: pa / pd / tempo của bộ hiện tại, la / ld = 0
  const cur = EN.EVAL[rule] || EN.EVAL.base;
  const v0 = new Array(NV).fill(0);
  for (let i = 1; i <= NP; i++) { v0[2 * NL + i - 1] = (cur.pa || [])[i] || 0; v0[2 * NL + NP + i - 1] = (cur.pd || [])[i] || 0; }
  v0[T0] = cur.tempo || 0;
  console.log(`${data.length} thế cờ (${train.length} học / ${test.length} kiểm tra)`);
  console.log('Sai số trước:', loss(v0, train).toFixed(4), '/', loss(v0, test).toFixed(4));
  const v = tune(train, v0);
  console.log('Sai số sau:  ', loss(v, train).toFixed(4), '/', loss(v, test).toFixed(4), '· lợi thế cầm X của dữ liệu:', Math.round(v[T0 + 1]));
  const v1 = v.slice(); v1[T0 + 1] = 0; // engine không có xBias
  console.log('Bộ mới không xBias (kiểm tra):', loss(v1, test).toFixed(4));
  // Cách chấm đang dùng trong engine (cùng dữ liệu kiểm tra) – để biết bộ mới có khớp thầy hơn không
  const lc = test.reduce((L, d) => { const p = 1 / (1 + Math.exp(-d.cur * K)); return L - (d.r * Math.log(p + 1e-12) + (1 - d.r) * Math.log(1 - p + 1e-12)); }, 0) / test.length;
  console.log('Cách chấm hiện tại của engine (kiểm tra):', lc.toFixed(4));
  const r = (x) => Math.round(x);
  const out = {
    la: [0, ...v.slice(0, NL).map(r)], ld: [0, ...v.slice(NL, 2 * NL).map(r)],
    pa: [0, ...v.slice(2 * NL, 2 * NL + NP).map(r), 0], pd: [0, ...v.slice(2 * NL + NP, T0).map(r), 0], tempo: r(v[T0]),
  };
  console.log(`${rule}: ${JSON.stringify(out)}`);
}

if (require.main === module) main();
module.exports = { features, load, tune, loss };
