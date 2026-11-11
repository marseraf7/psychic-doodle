/*
 * Giải offline – Thụy Sĩ theo số thắng / thua, ghép cặp kiểu CS Major (cfg.pairing = 'valve'; chỉ mô phỏng thể thức, theo
 * luật công khai "Major Supplemental Rulebook" của Valve – không chép mã):
 *   - Hạt giống của giai đoạn = thứ tự vào giai đoạn (đội vào thẳng trước, rồi đội đi tiếp theo thứ hạng giai đoạn trước).
 *   - Vòng 1: hạt giống i gặp i + n/2 (1–9, 2–10… với 16 đội).
 *   - Các vòng sau: chỉ cùng thành tích gặp nhau; trong mỗi nhóm xếp theo độ khó (Difficulty / Buchholz: tổng số thắng trừ
 *     tổng số thua của mọi đối thủ đã gặp trong giai đoạn) rồi hạt giống giai đoạn.
 *     Nhóm 6 đội (vòng 4–5): theo bảng ưu tiên 15 dòng, lấy dòng đầu không có cặp gặp lại.
 *     Còn lại: đội cao nhất gặp đội thấp nhất còn lại mà không gặp lại (tìm kiếm quay lui; hết cách thì cho gặp lại).
 *   - Xếp hạng giai đoạn (đi tiếp, hạt giống giai đoạn sau): thắng – thua, độ khó, hạt giống giai đoạn.
 * Nhóm số lẻ (số đội không chẵn) – không ghép kiểu này được: trả null để stages-groups.js ghép như thường.
 */
'use strict';
const { real } = require('./stages-base.js');

// Bảng ưu tiên cho nhóm 6 đội (chỉ số 1–6 theo thứ tự trong nhóm)
const SIX = [
  [[1, 6], [2, 5], [3, 4]], [[1, 6], [2, 4], [3, 5]], [[1, 5], [2, 6], [3, 4]], [[1, 5], [2, 4], [3, 6]], [[1, 4], [2, 6], [3, 5]],
  [[1, 4], [2, 5], [3, 6]], [[1, 6], [2, 3], [4, 5]], [[1, 5], [2, 3], [4, 6]], [[1, 3], [2, 6], [4, 5]], [[1, 3], [2, 5], [4, 6]],
  [[1, 4], [2, 3], [5, 6]], [[1, 3], [2, 4], [5, 6]], [[1, 2], [3, 6], [4, 5]], [[1, 2], [3, 5], [4, 6]], [[1, 2], [3, 4], [5, 6]],
];

/** Hạt giống trong giai đoạn: vị trí vào giai đoạn (1 = cao nhất). */
const stageSeed = (st) => { const pos = new Map(st.entrants.map((u, i) => [u, i + 1])); return (u) => pos.get(u) || 1e9; };

/** Độ khó của từng người: tổng (thắng − thua) hiện tại của các đối thủ đã gặp (trận đã xong, không tính miễn đấu). */
function difficulty(st, rec) {
  const d = Object.fromEntries(st.entrants.map((u) => [u, 0]));
  for (const m of Object.values(st.matches)) {
    if (!m.done || m.bye || !real(m.a) || !real(m.b) || !rec[m.a] || !rec[m.b]) continue;
    d[m.a] += rec[m.b].w - rec[m.b].l;
    d[m.b] += rec[m.a].w - rec[m.a].l;
  }
  return d;
}

/** Thứ tự kiểu Valve: thắng nhiều, thua ít, độ khó cao, hạt giống giai đoạn cao. */
function valveOrder(st, rec, list) {
  const d = difficulty(st, rec), seed = stageSeed(st);
  return [...list].sort((a, b) => (rec[b].w - rec[a].w) || (rec[a].l - rec[b].l) || (d[b] - d[a]) || (seed(a) - seed(b)));
}

const key = (a, b) => (a < b ? a + '|' + b : b + '|' + a);

/** Cao gặp thấp, không gặp lại (quay lui); allow: số cặp gặp lại được phép. */
function highLow(list, played, allow = 0) {
  if (!list.length) return [];
  const [a, ...rest] = list;
  for (let j = rest.length - 1; j >= 0; j--) {
    const re = played.has(key(a, rest[j]));
    if (re && allow <= 0) continue;
    const sub = highLow(rest.filter((_, k) => k !== j), played, allow - (re ? 1 : 0));
    if (sub) return [[a, rest[j]], ...sub];
  }
  return null;
}

/** Ghép một nhóm cùng thành tích (đã xếp theo độ khó, hạt giống). */
function pairGroup(group, played) {
  if (group.length === 6) {
    const row = SIX.find((r) => r.every(([x, y]) => !played.has(key(group[x - 1], group[y - 1]))));
    if (row) return row.map(([x, y]) => [group[x - 1], group[y - 1]]);
  }
  for (let allow = 0; allow <= group.length / 2; allow++) {
    const p = highLow(group, played, allow);
    if (p) return p;
  }
  return null;
}

/**
 * Các cặp của vòng mới (r = số vòng đã có). pool: người còn thi đấu; played: tập cặp đã gặp ("a|b"). Trả mảng cặp, hoặc null
 * nếu không ghép kiểu này được (số người lẻ / nhóm lẻ).
 */
function valvePairs(st, rec, pool, played) {
  if (pool.length % 2) return null;
  const seed = stageSeed(st);
  if (st.rounds.length === 0) {
    const list = [...pool].sort((a, b) => seed(a) - seed(b)), h = list.length / 2;
    return list.slice(0, h).map((u, i) => [u, list[i + h]]);
  }
  const groups = new Map();
  for (const u of valveOrder(st, rec, pool)) {
    const k = rec[u].w + ':' + rec[u].l;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(u);
  }
  const out = [];
  for (const g of groups.values()) {
    if (g.length % 2) return null;
    const p = pairGroup(g, played);
    if (!p) return null;
    out.push(...p);
  }
  return out;
}

module.exports = { SIX, difficulty, valveOrder, valvePairs, stageSeed };
