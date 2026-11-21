/*
 * C6 (b) – đánh giá mạng mới so với mạng hiện tại: Elo ± khoảng tin cậy 95 % và SPRT (kiểm định tỉ số hợp lý tuần tự, cách
 * làm phổ biến của các dự án engine cờ – công thức tự viết theo tài liệu thống kê, không chép mã của dự án nào).
 *   node server/scripts/rapfi/caro/nnue/sprt.js <thắng> <hoà> <thua> [elo0=0] [elo1=10] [alpha=0.05] [beta=0.05]
 * Thắng / hoà / thua tính theo phía mạng MỚI. Kết quả: Elo ước lượng, khoảng 95 %, LLR, ngưỡng [A, B] và kết luận:
 *   H1 (mạng mới mạnh hơn ≥ elo1) – thay mạng · H0 (không hơn quá elo0) – bỏ · chưa đủ – đánh tiếp.
 * Mỗi khai cuộc nên đánh 2 ván đổi bên (Caro luật Việt Nam bên đi trước lợi thế lớn – docs/nnue-caro-ke-hoach.md).
 * LLR theo xấp xỉ chuẩn của mô hình ba kết quả (W / D / L): LLR ≈ N · (s1 − s0)(2·s̄ − s0 − s1) / (2·σ²), s̄ = điểm trung bình,
 * σ² = phương sai điểm một ván. Dùng như thư viện: require(...) → { elo, eloCi, llr, sprt }.
 */
'use strict';

const scoreOf = (elo) => 1 / (1 + Math.pow(10, -elo / 400));
const eloOf = (s) => -400 * Math.log10(1 / s - 1);

/** Điểm trung bình + phương sai một ván. */
function stats(w, d, l) {
  const n = w + d + l;
  if (!n) return null;
  const s = (w + 0.5 * d) / n;
  const v = (w * (1 - s) ** 2 + d * (0.5 - s) ** 2 + l * (0 - s) ** 2) / n;
  return { n, s, v };
}

/** Elo ước lượng (±Infinity khi toàn thắng / toàn thua). */
function elo(w, d, l) { const st = stats(w, d, l); return st ? eloOf(Math.min(Math.max(st.s, 1e-9), 1 - 1e-9)) : 0; }

/** Khoảng tin cậy 95 % của Elo (xấp xỉ chuẩn trên điểm trung bình). */
function eloCi(w, d, l, z = 1.959964) {
  const st = stats(w, d, l);
  if (!st) return [-Infinity, Infinity];
  const se = Math.sqrt(st.v / st.n);
  const clamp = (x) => Math.min(Math.max(x, 1e-9), 1 - 1e-9);
  return [eloOf(clamp(st.s - z * se)), eloOf(clamp(st.s + z * se))];
}

/** Log tỉ số hợp lý H1 (elo1) so với H0 (elo0). */
function llr(w, d, l, elo0 = 0, elo1 = 10) {
  const st = stats(w, d, l);
  if (!st || st.v <= 0) return 0;
  const s0 = scoreOf(elo0), s1 = scoreOf(elo1);
  return (st.n * (s1 - s0) * (2 * st.s - s0 - s1)) / (2 * st.v);
}

/** Kết luận SPRT. */
function sprt(w, d, l, { elo0 = 0, elo1 = 10, alpha = 0.05, beta = 0.05 } = {}) {
  const A = Math.log(beta / (1 - alpha)), B = Math.log((1 - beta) / alpha);
  const L = llr(w, d, l, elo0, elo1);
  return { llr: L, a: A, b: B, decision: L >= B ? 'H1' : L <= A ? 'H0' : 'continue', elo: elo(w, d, l), ci: eloCi(w, d, l) };
}

if (require.main === module) {
  const [w, d, l, e0 = 0, e1 = 10, a = 0.05, b = 0.05] = process.argv.slice(2).map(Number);
  if (![w, d, l].every(Number.isFinite)) { console.error('Dùng: node sprt.js <thắng> <hoà> <thua> [elo0] [elo1] [alpha] [beta]'); process.exit(1); }
  const r = sprt(w, d, l, { elo0: e0, elo1: e1, alpha: a, beta: b });
  const f = (x) => (Number.isFinite(x) ? (x >= 0 ? '+' : '') + x.toFixed(1) : String(x));
  console.log(`${w + d + l} ván (W ${w} / D ${d} / L ${l}) · Elo ${f(r.elo)} (95%: ${f(r.ci[0])} … ${f(r.ci[1])})`);
  console.log(`SPRT [${e0}, ${e1}] · LLR ${r.llr.toFixed(2)} (ngưỡng ${r.a.toFixed(2)} … ${r.b.toFixed(2)}) → ${{ H1: 'mạng mới mạnh hơn: thay mạng', H0: 'không mạnh hơn: bỏ', continue: 'chưa đủ, đánh tiếp' }[r.decision]}`);
}

module.exports = { elo, eloCi, llr, sprt, scoreOf, eloOf };
