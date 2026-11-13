/*
 * Giải offline – chia mùa giải vòng tròn thành các chặng, mỗi chặng có playoff riêng (kiểu Overwatch League 2018–2019 –
 * chỉ mô phỏng thể thức): cfg.splits = { n, take, bo } trên vòng tròn một bảng.
 *   - Các vòng của lịch vòng tròn chia đều thành n chặng (chặng b gồm các vòng r có ⌊r·n / R⌋ = b).
 *   - Xong mọi trận của chặng b: xếp hạng riêng chặng đó (chỉ các trận của chặng, cùng cách xếp của giai đoạn) và dựng playoff
 *     loại trực tiếp `take` đội đầu (Bo `bo`; số đội không tròn lũy thừa 2 thì hạt giống cao được miễn đấu – OWL 2018: 3 đội,
 *     đội nhất vào thẳng chung kết chặng).
 *   - Trận playoff chặng (m.sp = b) không tính vào bảng xếp hạng mùa giải (tally bỏ qua), nối next như loại trực tiếp,
 *     không có hoà; giai đoạn chỉ xong khi mọi playoff chặng xong.
 * st.sp = { [b]: { rounds: [[mã trận]], seeds } }.
 */
'use strict';
const { real } = require('./stages-base.js');
const { buildSingle, resolveElim } = require('./stages-elim.js');

const int = (v, lo, hi, def) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def; };

/** Chuẩn hoá (vòng tròn một bảng của giải offline, không phải league phase / mùa giải kiểu Mỹ). */
function normalize(c, out) {
  const x = c.splits;
  if (!x || typeof x !== 'object' || out.type !== 'roundrobin' || out.league || out.season || (out.groups || 1) > 1 || out.groupSize) return;
  const bo = Math.floor(Number(x.bo));
  out.splits = { n: int(x.n, 2, 6, 4), take: int(x.take, 2, 16, 4), bo: bo >= 1 && bo <= 25 && bo % 2 ? bo : 3 };
}

/** Chặng của vòng r khi lịch có R vòng. */
const blockOf = (cfg, r, R) => Math.min(cfg.splits.n - 1, Math.floor((r * cfg.splits.n) / Math.max(1, R)));
const roundsOf = (st) => (st.groups && st.groups[0] ? st.groups[0].rounds.length : 0);

/** Các trận vòng tròn của chặng b. */
function blockMatches(st, b) {
  const R = roundsOf(st);
  return Object.values(st.matches).filter((m) => m.sp == null && !m.tb && m.round < R && blockOf(st.cfg, m.round, R) === b);
}

/** Dựng playoff các chặng vừa xong (gọi sau mỗi kết quả). rankList(st, uids, seedOf) – hàm xếp hạng của giai đoạn. */
function update(st, seedOf, rankList) {
  if (!st.cfg.splits) return;
  const S = st.cfg.splits;
  for (let b = 0; b < S.n; b++) {
    if (st.sp && st.sp[b]) continue;
    const ms = blockMatches(st, b);
    if (!ms.length || !ms.every((m) => m.done)) continue;
    const sub = { ...st, matches: Object.fromEntries(ms.map((m) => [m.id, m])) };
    const seeds = rankList(sub, st.groups[0].players, seedOf).list.slice(0, S.take);
    const tmp = { type: 'single', key: `${st.key}sp${b}`, cfg: { type: 'single', bestOf: S.bo, thirdPlace: false }, matches: {} };
    buildSingle(tmp, seeds);
    const R = roundsOf(st);
    for (const m of Object.values(tmp.matches)) { m.sp = b; m.bo = S.bo; m.round = R + 100 * (b + 1) + m.round; st.matches[m.id] = m; }
    st.sp = { ...(st.sp || {}), [b]: { rounds: tmp.rounds, seeds } };
  }
}

/** Ghi kết quả trận playoff chặng (như loại trực tiếp). */
function record(st, m, winner) { resolveElim(st, m, winner, winner === m.a ? m.b : m.a); }

/**
 * Huỷ kết quả trận m: playoff chặng – khoá nếu trận sau đã có kết quả (bỏ người khỏi trận sau); trận vòng tròn của chặng đã
 * dựng playoff – khoá nếu playoff đã có trận đấu, không thì bỏ playoff (dựng lại khi chặng xong lần nữa). false = bị khoá.
 */
function beforeUndo(st, m) {
  if (!st.sp) return true;
  if (m.sp != null) {
    const x = m.next && st.matches[m.next.to];
    if (x && x.done) return false;
    if (x) x[m.next.slot] = null;
    return true;
  }
  const b = blockOf(st.cfg, m.round, roundsOf(st));
  const p = st.sp[b];
  if (!p) return true;
  const ids = p.rounds.flat();
  if (ids.some((id) => st.matches[id].done && !st.matches[id].bye)) return false;
  for (const id of ids) delete st.matches[id];
  delete st.sp[b];
  return true;
}

/** Phần gửi trình duyệt: mỗi chặng đã dựng một nhánh, kèm nhà vô địch chặng. */
function view(st, M) {
  if (!st.sp) return null;
  return Object.keys(st.sp).map(Number).sort((a, b) => a - b).map((b) => {
    const p = st.sp[b], f = st.matches[p.rounds[p.rounds.length - 1][0]];
    return { b, rounds: p.rounds.map((r) => r.map(M)), champ: f.done && real(f.winner) ? f.winner : null };
  });
}

/** Số trận playoff các chặng (ước tính): mỗi chặng take − 1 trận. */
const extraMatches = (cfg) => (cfg.splits ? cfg.splits.n * (Math.min(cfg.splits.take, 16) - 1) : 0);

module.exports = { normalize, blockOf, update, record, beforeUndo, view, extraMatches };
