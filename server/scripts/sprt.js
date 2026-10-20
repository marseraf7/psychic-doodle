/*
 * Thống kê cho tự đấu (công cụ cho người phát triển): Elo kèm khoảng tin cậy 95% và kiểm định SPRT (dừng sớm khi đủ
 * chứng cứ) – theo cách của Fishtest (Stockfish) / OpenBench, viết lại cho Cờ Caro.
 *
 * Mỗi khai cuộc đánh 2 ván đổi bên = 1 cặp. Lợi thế đi trước của khai cuộc làm hai ván trong cặp tương quan với nhau, nên
 * tính theo cặp (pentanomial: tổng điểm cặp 0 · 0,5 · 1 · 1,5 · 2) cho phương sai đúng hơn tính từng ván. Ván lẻ (đánh
 * một bên) tính như một mẫu riêng (trinomial).
 *
 * SPRT: H0 = Elo ≤ elo0, H1 = Elo ≥ elo1 (Elo logistic). LLR xấp xỉ theo phân phối chuẩn (GSPRT – Van den Bergh, như
 * Fishtest): LLR = N · (s1 − s0) · (2μ − s0 − s1) / (2σ²), μ, σ²: trung bình / phương sai điểm mỗi mẫu (0..1), sᵢ: điểm kỳ
 * vọng ứng với eloᵢ. Dừng khi LLR ≤ ln(β / (1 − α)) (nhận H0) hoặc ≥ ln((1 − β) / α) (nhận H1), và chỉ sau ít nhất
 * MIN_SAMPLES mẫu (vài cặp đầu phương sai còn ước lượng sai).
 *   const S = require('./sprt.js');
 *   const t = S.tally(); t.pair(1, 0.5); t.game(1);  // cặp: điểm A ở hai ván · ván lẻ: điểm A
 *   S.summary(t, { elo0: 0, elo1: 10 })              // { n, games, score, elo, lo, hi, llr, lower, upper, verdict }
 *   S.format(summary)                                 // một dòng chữ
 */
'use strict';

const MIN_SAMPLES = 16;

/** Điểm kỳ vọng (0..1) của bên hơn `elo` Elo (logistic). */
const expected = (elo) => 1 / (1 + Math.pow(10, -elo / 400));
/** Elo ứng với điểm trung bình s (0..1). */
const eloOf = (s) => {
  const c = Math.min(1 - 1e-9, Math.max(1e-9, s));
  return -400 * Math.log10(1 / c - 1);
};

/** Bộ đếm mẫu: cặp (penta[0..4] theo tổng điểm × 2) và ván lẻ (tri[0..2] theo điểm × 2). */
function tally() {
  const t = {
    penta: [0, 0, 0, 0, 0],
    tri: [0, 0, 0],
    pair(a, b) { t.penta[Math.round((a + b) * 2)]++; return t; },
    game(a) { t.tri[Math.round(a * 2)]++; return t; },
  };
  return t;
}

/** Danh sách { x (điểm mẫu 0..1), w (số mẫu) } từ bộ đếm. */
function samples(t) {
  const out = [];
  t.penta.forEach((w, i) => { if (w) out.push({ x: i / 4, w }); });
  t.tri.forEach((w, i) => { if (w) out.push({ x: i / 2, w }); });
  return out;
}

/** Ngưỡng LLR của SPRT với sai lầm loại I (alpha) và loại II (beta). */
const bounds = (alpha = 0.05, beta = 0.05) => ({ lower: Math.log(beta / (1 - alpha)), upper: Math.log((1 - beta) / alpha) });

/**
 * Tóm tắt bộ đếm: n mẫu, số ván, điểm của A, Elo ± 95%, và (khi có opts.elo0 / elo1) LLR + kết luận SPRT:
 * 'H1' (A mạnh hơn ít nhất elo1) · 'H0' (A không hơn quá elo0) · null (chưa đủ chứng cứ).
 */
function summary(t, opts) {
  const o = { alpha: 0.05, beta: 0.05, ...opts };
  const s = samples(t);
  const n = s.reduce((a, v) => a + v.w, 0);
  const games = t.penta.reduce((a, v) => a + v, 0) * 2 + t.tri.reduce((a, v) => a + v, 0);
  const score = t.penta.reduce((a, v, i) => a + (v * i) / 2, 0) + t.tri.reduce((a, v, i) => a + (v * i) / 2, 0);
  const res = { n, games, score, elo: 0, lo: -Infinity, hi: Infinity, llr: 0, verdict: null, ...bounds(o.alpha, o.beta) };
  if (!n) return res;
  const mu = s.reduce((a, v) => a + v.x * v.w, 0) / n;
  // Phương sai mẫu; chặn dưới để vài mẫu đầu toàn hoà không làm LLR vọt (Fishtest cũng thêm số đếm nhỏ vào ô trống)
  const varRaw = s.reduce((a, v) => a + v.w * (v.x - mu) ** 2, 0) / n;
  const variance = Math.max(varRaw, 1e-3);
  const se = Math.sqrt(variance / n);
  res.elo = eloOf(mu);
  res.lo = eloOf(mu - 1.96 * se);
  res.hi = eloOf(mu + 1.96 * se);
  if (typeof o.elo0 === 'number' && typeof o.elo1 === 'number') {
    const s0 = expected(o.elo0), s1 = expected(o.elo1);
    res.llr = (n * (s1 - s0) * (2 * mu - s0 - s1)) / (2 * variance);
    if (n >= MIN_SAMPLES) res.verdict = res.llr >= res.upper ? 'H1' : res.llr <= res.lower ? 'H0' : null;
  }
  return res;
}

const r1 = (x) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : x > 0 ? '+∞' : '−∞');
/** Một dòng chữ cho kết quả. */
function format(r, opts) {
  let s = `${r.score}/${r.games} (${r.games ? Math.round((100 * r.score) / r.games) : 0}%) · Elo ${r1(r.elo)} [${r1(r.lo)}, ${r1(r.hi)}] (95%)`;
  if (opts && typeof opts.elo0 === 'number') {
    s += ` · SPRT [${opts.elo0}, ${opts.elo1}] LLR ${r.llr.toFixed(2)} (${r.lower.toFixed(2)}, ${r.upper.toFixed(2)})`;
    s += r.verdict === 'H1' ? ' → nhận H1 (mạnh hơn)' : r.verdict === 'H0' ? ' → nhận H0 (không mạnh hơn)' : ' → chưa đủ chứng cứ';
  }
  return s;
}

/** Đọc "elo0,elo1" (vd. "0,10") → { elo0, elo1 } hoặc null. */
function parse(spec) {
  if (!spec) return null;
  const [a, b] = String(spec).split(',').map(Number);
  return Number.isFinite(a) && Number.isFinite(b) && b > a ? { elo0: a, elo1: b } : null;
}

module.exports = { expected, eloOf, tally, summary, format, parse, bounds, MIN_SAMPLES };
