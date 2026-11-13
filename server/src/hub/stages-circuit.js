/*
 * Hệ Circuit của sinh tồn (kiểu PGC 2024 – chỉ mô phỏng thể thức): giai đoạn race 'points' có
 *   cfg.circuit = { n, days, keep, late }  – n vòng circuit, mỗi vòng `days` ngày, mỗi ngày cfg.events trận.
 * Trong một vòng circuit (R = bảng xếp hạng đầu vòng; vòng 1: thứ tự hạt giống):
 *   - ngày 1: các đội từ hạng (tổng late) + 1 trở xuống của R;
 *   - ngày j ≥ 2: `keep` đội đầu ngày trước + late[j − 2] đội của R – nhóm hạng càng cao vào càng muộn (ngày cuối nhận
 *     nhóm đầu bảng R);
 *   - ngày cuối là "Circuit Final": chỉ điểm các ngày Final được cộng dồn vào bảng chung của giai đoạn.
 * Bảng xếp hạng một vòng (R của vòng sau): thứ tự ngày Final, rồi các đội dừng ở ngày trước đó (theo bảng ngày đó)…
 * Ví dụ PGC 2024 (24 đội, keep 12, late [4, 4]): ngày 1 hạng 9–24, ngày 2 thêm hạng 5–8, Final thêm hạng 1–4.
 * Mỗi ngày xếp theo tổng điểm ngày đó (cùng chỉ số phụ cfg.tb). Đội của một ngày phụ thuộc kết quả trước nên kết quả
 * nhập lần lượt và máy chủ gửi danh sách đội của trận kế tiếp (raceView).
 * Hàm thuần; stages-race.js truyền vào hàm xếp bảng `table(st, seedOf, members) → { list, stats }`.
 */
'use strict';

const MAX_N = 5;
const MAX_DAYS = 4;
const MAX_LATE = 64;
const int = (v, lo, hi, def) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def; };

/** Chuẩn hoá cfg.circuit (gọi từ normalizeRace khi cách tính 'points'); không đi cùng chia bảng, xoay vòng, match point… */
function normalizeCircuit(c, out) {
  const x = c.circuit;
  if (!x || typeof x !== 'object') return;
  const days = int(x.days, 2, MAX_DAYS, 3);
  const late = Array.from({ length: days - 1 }, (_, k) => int(Array.isArray(x.late) ? x.late[k] : null, 0, MAX_LATE, 4));
  out.circuit = { n: int(x.n, 1, MAX_N, 3), days, keep: int(x.keep, 1, 200, 12), late };
  for (const k of ['groups', 'rot', 'mp', 'gate', 'head', 'carry']) delete out[k];
}

/** Số trận cả giai đoạn. */
const totalEvents = (cfg) => (cfg.circuit ? cfg.events * cfg.circuit.n * cfg.circuit.days : cfg.events);
/** Trận i thuộc vòng c, ngày j (0-based), trận thứ k trong ngày. */
function dayOf(cfg, i) {
  const d = Math.floor(i / cfg.events);
  return { c: Math.floor(d / cfg.circuit.days), j: d % cfg.circuit.days, k: i % cfg.events };
}
const isFinal = (cfg, i) => dayOf(cfg, i).j === cfg.circuit.days - 1;
/** Số đội vào muộn từ ngày j trở đi (j ≥ 1) – nhóm của ngày j là R[sumFrom(j + 1) … sumFrom(j)). */
const sumFrom = (cfg, j) => cfg.circuit.late.slice(Math.max(0, j - 1)).reduce((a, b) => a + b, 0);

/** Số đội từng ngày khi giai đoạn có n đội. */
function daySizes(cfg, n) {
  const C = cfg.circuit, out = [n - sumFrom(cfg, 1)];
  for (let j = 1; j < C.days; j++) out.push(Math.min(C.keep, out[j - 1]) + C.late[j - 1]);
  return out;
}

/** Lỗi cỡ giai đoạn (null nếu được): mỗi ngày phải có đội bị loại (keep < số đội ngày trước) và ít nhất 2 đội. */
function circuitError(cfg, n) {
  if (!cfg.circuit) return null;
  const s = daySizes(cfg, n);
  const need = sumFrom(cfg, 1) + cfg.circuit.keep + 1;
  if (s.some((x) => x < 2) || s.slice(0, -1).some((x) => x <= cfg.circuit.keep)) return { code: 'ot_circuit_few', args: { n: need } };
  return null;
}

/** Các hàm cần bảng xếp hạng: tạo một lần cho mỗi giai đoạn (ghi nhớ trong một lần gọi). */
function make(st, table) {
  const cfg = st.cfg, C = cfg.circuit, E = cfg.events;
  const seed = new Map(st.entrants.map((u, k) => [u, k + 1]));
  const seedOf = (u) => seed.get(u) || 1e9;
  const memoDay = new Map(), memoRank = new Map();
  /** Giai đoạn giả chỉ gồm các trận của ngày (c, j) – để dùng chung hàm xếp bảng. */
  const sub = (c, j) => {
    const from = (c * C.days + j) * E;
    return { ...st, cfg: { ...cfg, circuit: undefined }, head: null, mpWinner: null, events: st.events.slice(from, from + E) };
  };
  /** Bảng xếp hạng đầu vòng c (vòng 1: hạt giống). */
  function rankOf(c) {
    if (c === 0) return [...st.entrants];
    if (memoRank.has(c)) return memoRank.get(c);
    const out = [...dayTable(c - 1, C.days - 1)];
    for (let j = C.days - 2; j >= 0; j--) for (const u of dayTable(c - 1, j).slice(C.keep)) if (!out.includes(u)) out.push(u);
    for (const u of rankOf(c - 1)) if (!out.includes(u)) out.push(u); // phòng hờ: đội chưa đấu ngày nào
    memoRank.set(c, out);
    return out;
  }
  /** Đội của ngày (c, j). */
  function members(c, j) {
    const R = rankOf(c);
    if (j === 0) return R.slice(sumFrom(cfg, 1));
    const band = R.slice(sumFrom(cfg, j + 1), sumFrom(cfg, j));
    return [...dayTable(c, j - 1).slice(0, C.keep), ...band];
  }
  /** Thứ tự ngày (c, j): tổng điểm ngày đó. */
  function dayTable(c, j) {
    const key = c + ':' + j;
    if (!memoDay.has(key)) memoDay.set(key, table(sub(c, j), seedOf, members(c, j)).list);
    return memoDay.get(key);
  }
  /** Bảng ngày đầy đủ ({ list, stats }) cho trang xem. */
  const dayFull = (c, j) => table(sub(c, j), seedOf, members(c, j));
  const lobby = (i) => { const d = dayOf(cfg, i); return members(d.c, d.j); };
  return { lobby, members, dayTable, dayFull, rankOf };
}

/** Các ngày đã bắt đầu (có trận đã nhập) hoặc là ngày của trận kế tiếp: [{ c, j, final, started, done }]. */
function daysShown(st) {
  const cfg = st.cfg, C = cfg.circuit, E = cfg.events, out = [];
  const next = st.events.findIndex((e) => !e.done);
  for (let d = 0; d < C.n * C.days; d++) {
    const evs = st.events.slice(d * E, d * E + E);
    const started = evs.some((e) => e.done), cur = next >= d * E && next < d * E + E;
    if (!started && !cur) continue;
    out.push({ c: Math.floor(d / C.days), j: d % C.days, final: d % C.days === C.days - 1, done: evs.every((e) => e.done) });
  }
  return out;
}

module.exports = { normalizeCircuit, totalEvents, dayOf, isFinal, daySizes, circuitError, make, daysShown, MAX_N, MAX_DAYS };
