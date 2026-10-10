/*
 * Điểm xếp hạng Glicko-2 (như Lichess), tách theo loại thời gian:
 *   bullet (siêu chớp) · blitz (chớp) · rapid (nhanh) · classical (chậm / không giới hạn).
 * Mỗi loại: r (điểm), rd (độ lệch – càng lớn càng chưa chắc), vol (độ biến động), n (số ván), at (lần tính gần nhất).
 * rd > 110: điểm "tạm" (hiện kèm dấu ?). Lâu không chơi thì rd tăng dần trở lại: từ 60 lên 110 sau 1 năm (như Lichess).
 * Bảng xếp hạng chỉ tính người có rd ≤ 75. Mỗi ván thay đổi tối đa 700 điểm.
 */
'use strict';

const POOLS = ['bullet', 'blitz', 'rapid', 'classical'];
const CLOCKS = ['1+1', '3+2', '5+3', '10+5']; // phút + giây cộng thêm mỗi nước
const START = 1200;
const RD_MAX = 350, RD_MIN = 45, VOL = 0.06, TAU = 0.75;
const PROVISIONAL_RD = 110;
const SCALE = 173.7178;
const DAY = 86400000;
const RANKABLE_RD = 75; // bảng xếp hạng: chỉ người có rd ≤ 75
const MAX_DELTA = 700; // mỗi ván thay đổi tối đa 700 điểm
// rd tăng từ 60 lên 110 sau 365 ngày không chơi
const C2 = (110 * 110 - 60 * 60) / 365;

/** '3+2' -> { base: 180000, inc: 2000 } (ms), hoặc null nếu không hợp lệ. */
function parseClock(s) {
  if (!CLOCKS.includes(s)) return null;
  const [m, i] = s.split('+').map(Number);
  return { base: m * 60000, inc: i * 1000 };
}

/** Loại thời gian của một ván: đồng hồ tổng theo thời lượng ước tính (phút*60 + 40*giây cộng), hoặc giới hạn mỗi nước. */
function poolOf({ timeLimit, clock, clockSpec }) {
  // Phòng (Room) giữ đồng hồ đã đổi ra ms ở .clock và chuỗi gốc ở .clockSpec
  const spec = typeof clock === 'string' ? clock : clockSpec;
  const c = spec ? parseClock(spec) : null;
  if (c) {
    const est = c.base / 1000 + 40 * (c.inc / 1000);
    return est < 180 ? 'bullet' : est < 480 ? 'blitz' : est < 1500 ? 'rapid' : 'classical';
  }
  const t = Number(timeLimit) || 0;
  return !t ? 'classical' : t <= 10 ? 'blitz' : 'rapid';
}

const newPool = (r = START, rd = RD_MAX) => ({ r, rd, vol: VOL, n: 0, at: 0 });

/** Bổ sung bảng điểm cho tài khoản cũ (chỉ có Elo): mọi loại bắt đầu từ điểm Elo cũ. */
function upgradePools(u) {
  if (!u.pools || typeof u.pools !== 'object') u.pools = {};
  const legacyRd = u.rated >= 20 ? 100 : u.rated > 0 ? 200 : RD_MAX;
  for (const p of POOLS) if (!u.pools[p]) u.pools[p] = newPool(typeof u.rating === 'number' ? u.rating : START, legacyRd);
  return u;
}

/** rd sau thời gian không chơi. */
function decayedRd(p, now) {
  if (!p.at) return p.rd;
  const days = Math.max(0, (now - p.at) / DAY);
  return Math.min(RD_MAX, Math.sqrt(p.rd * p.rd + C2 * days));
}

const g = (phi) => 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));

/** Glicko-2 cho 1 ván: trả về { r, rd, vol } mới của a sau khi gặp b với kết quả s (1 / 0.5 / 0). */
function glicko(a, b, s, now) {
  const mu = (a.r - 1500) / SCALE, phi = decayedRd(a, now) / SCALE, sigma = a.vol;
  const muj = (b.r - 1500) / SCALE, phij = decayedRd(b, now) / SCALE;
  const gj = g(phij);
  const E = 1 / (1 + Math.exp(-gj * (mu - muj)));
  const v = 1 / (gj * gj * E * (1 - E));
  const delta = v * gj * (s - E);
  // Độ biến động mới (thuật toán Illinois)
  const A0 = Math.log(sigma * sigma);
  const f = (x) => {
    const ex = Math.exp(x);
    return (ex * (delta * delta - phi * phi - v - ex)) / (2 * Math.pow(phi * phi + v + ex, 2)) - (x - A0) / (TAU * TAU);
  };
  let A = A0, B;
  if (delta * delta > phi * phi + v) B = Math.log(delta * delta - phi * phi - v);
  else {
    let k = 1;
    while (f(A0 - k * TAU) < 0 && k < 100) k++;
    B = A0 - k * TAU;
  }
  let fA = f(A), fB = f(B);
  for (let i = 0; i < 100 && Math.abs(B - A) > 1e-6; i++) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) { A = B; fA = fB; } else fA /= 2;
    B = C; fB = fC;
  }
  const vol = Math.exp(A / 2);
  const phiStar = Math.sqrt(phi * phi + vol * vol);
  const phiNew = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const muNew = mu + phiNew * phiNew * gj * (s - E);
  return {
    r: 1500 + SCALE * muNew,
    rd: Math.max(RD_MIN, Math.min(RD_MAX, SCALE * phiNew)),
    vol: Math.min(0.1, vol),
  };
}

/** Tính điểm 1 ván giữa a và b trong loại pool; sa = kết quả của a. Trả về { a: thay đổi, b: thay đổi } (đã làm tròn). */
function rateGame(ua, ub, pool, sa, now = Date.now()) {
  upgradePools(ua);
  upgradePools(ub);
  const pa = ua.pools[pool], pb = ub.pools[pool];
  const na = glicko(pa, pb, sa, now), nb = glicko(pb, pa, 1 - sa, now);
  const before = [Math.round(pa.r), Math.round(pb.r)];
  for (const [p, n] of [[pa, na], [pb, nb]]) {
    p.r = Math.round(Math.max(p.r - MAX_DELTA, Math.min(p.r + MAX_DELTA, n.r)) * 10) / 10;
    p.rd = Math.round(n.rd * 10) / 10;
    p.vol = Math.round(n.vol * 1e6) / 1e6;
    p.n++;
    p.at = now;
  }
  for (const u of [ua, ub]) u.rating = mainRating(u);
  return { a: Math.round(pa.r) - before[0], b: Math.round(pb.r) - before[1] };
}

/** Loại thời gian chơi nhiều nhất (để hiện "điểm chính"); chưa chơi loại nào thì rapid. */
function mainPool(u) {
  upgradePools(u);
  let best = 'rapid', n = 0;
  for (const p of ['rapid', 'blitz', 'classical', 'bullet']) if (u.pools[p].n > n) { best = p; n = u.pools[p].n; }
  return best;
}
const mainRating = (u) => Math.round(u.pools[mainPool(u)].r);

const provisional = (p, now = Date.now()) => decayedRd(p, now) > PROVISIONAL_RD;
const rankable = (p, now = Date.now()) => p.n > 0 && decayedRd(p, now) <= RANKABLE_RD;

/** Điểm hiển thị của tài khoản trong một loại (hoặc điểm chính). */
function ratingIn(u, pool, now = Date.now()) {
  upgradePools(u);
  const p = u.pools[pool && u.pools[pool] ? pool : mainPool(u)];
  return { r: Math.round(p.r), prov: provisional(p, now), n: p.n };
}

module.exports = { POOLS, CLOCKS, START, PROVISIONAL_RD, RANKABLE_RD, MAX_DELTA, rankable, parseClock, poolOf, newPool, upgradePools, decayedRd, glicko, rateGame, mainPool, mainRating, provisional, ratingIn };
