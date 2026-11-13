/*
 * Golf – chấm điểm Stableford (cfg.scoring; chỉ mô phỏng thể thức): mỗi lỗ được điểm theo số gậy so với par thay cho cộng gậy,
 * nhiều điểm xếp trên. Hai bảng mặc định (ban tổ chức sửa được, phải đủ 6 mức):
 *   'stableford' (chuẩn, theo gậy net): albatross 5, eagle 4, birdie 3, par 2, bogey 1, double bogey trở lên 0;
 *   'modified' (kiểu Barracuda Championship): albatross +8, eagle +5, birdie +2, par 0, bogey −1, double bogey trở lên −3.
 * Handicap (cfg.handicap = { si: chỉ số khó từng lỗ 1..H }): mỗi dòng kết quả có thể kèm hcp (0–54) – người chơi được trừ gậy
 * ở các lỗ khó nhất trước (hcp 20 trên sân 18 lỗ: 1 gậy mọi lỗ + thêm 1 gậy ở 2 lỗ chỉ số khó 1–2). Bắt buộc nhập từng lỗ.
 * stages-golf.js gọi khi cfg.scoring có mặt.
 */
'use strict';

const SCORINGS = ['stableford', 'modified'];
const LEVELS = ['alb', 'eagle', 'birdie', 'par', 'bogey', 'dbl']; // −3 trở xuống, −2, −1, 0, +1, +2 trở lên
const TABLES = {
  stableford: { alb: 5, eagle: 4, birdie: 3, par: 2, bogey: 1, dbl: 0 },
  modified: { alb: 8, eagle: 5, birdie: 2, par: 0, bogey: -1, dbl: -3 },
};
const MAX_HCP = 54;
const int = (v, lo, hi, def) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def; };

/** Chuẩn hoá: scoring, bảng điểm (đủ 6 mức, thiếu thì lấy mặc định), handicap; ép nhập từng lỗ. */
function normalizeStable(c, out) {
  if (!SCORINGS.includes(c.scoring)) return;
  out.scoring = c.scoring;
  out.input = 'hole';
  const def = TABLES[c.scoring], src = c.points && typeof c.points === 'object' ? c.points : {};
  out.points = Object.fromEntries(LEVELS.map((k) => [k, int(src[k], -20, 20, def[k])]));
  if (c.handicap) {
    const H = out.par.length, si = Array.isArray(c.handicap.si) ? c.handicap.si.map((x) => int(x, 1, H, 0)) : [];
    // Chỉ số khó phải là một hoán vị 1..H; sai thì theo thứ tự lỗ
    const ok = si.length === H && new Set(si).size === H && si.every((x) => x >= 1);
    out.handicap = { si: ok ? si : Array.from({ length: H }, (_, k) => k + 1) };
  }
}

/** Số gậy được trừ ở lỗ k với handicap hcp. */
function received(cfg, hcp, k) {
  if (!cfg.handicap || !hcp) return 0;
  const H = cfg.par.length;
  return Math.floor(hcp / H) + (cfg.handicap.si[k] <= hcp % H ? 1 : 0);
}

/** Mức của một lỗ theo số gậy net so với par. */
const levelOf = (d) => (d <= -3 ? 'alb' : d === -2 ? 'eagle' : d === -1 ? 'birdie' : d === 0 ? 'par' : d === 1 ? 'bogey' : 'dbl');

/** Điểm một vòng (dòng nhập từng lỗ, kèm hcp): tổng điểm các lỗ đã đánh. */
function roundPoints(cfg, x) {
  let pts = 0;
  (x.h || []).forEach((s, k) => { if (s != null) pts += cfg.points[levelOf(s - received(cfg, x.hcp || 0, k) - cfg.par[k])]; });
  return pts;
}

/** Handicap của một dòng nhập (null = không có). */
const cleanHcp = (cfg, v) => (cfg.handicap && v != null && v !== '' ? int(v, 0, MAX_HCP, 0) : null);

module.exports = { SCORINGS, LEVELS, TABLES, MAX_HCP, normalizeStable, received, levelOf, roundPoints, cleanHcp };
