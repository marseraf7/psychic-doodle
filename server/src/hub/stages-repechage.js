/*
 * Giải offline – vòng vớt kiểu Olympic (repechage – võ thuật: judo, vật, taekwondo; chỉ mô phỏng thể thức) trên giai đoạn
 * loại trực tiếp cuối: cfg.rep = { from: 'qf' | 'r16' | 'r32', mode: 'finalist' | 'half' }.
 *   - Khi xong cả hai bán kết (đã biết hai finalist), mỗi phía (nửa nhánh của một finalist) sinh một nhánh vớt:
 *       'finalist' (mặc định – theo đặc tả): người đã thua trực tiếp trước finalist từ vòng `from` tới trước bán kết;
 *       'half' (kiểu IJF): mọi người thua ở nửa nhánh đó từ vòng `from` tới trước bán kết.
 *     Người thua sớm đấu trước (thang): hai người thua sớm nhất gặp nhau, người thắng gặp người thua vòng kế tiếp…
 *   - Người thắng nhánh vớt phía A tranh huy chương đồng với người thua bán kết phía B (và ngược lại) → hai huy chương đồng.
 *     Nhánh vớt rỗng (vd. finalist thắng toàn bộ nhờ miễn đấu): người thua bán kết phía đối diện nhận đồng thẳng.
 *   - Hạng: 1, 2, 3 (hai người thắng tranh đồng), 5 (hai người thua tranh đồng), 7 (người thua trong nhánh vớt); những
 *     người khác xếp theo vòng bị loại như loại trực tiếp thường.
 * st.rep = { sides: [{ fin, pool: [uid], ids: [trận vớt], bronze: id | null, direct: uid | null }] }. Trận vớt nối next như
 * nhánh loại trực tiếp (resolveElim / huỷ kết quả dùng chung). Huỷ kết quả bán kết khi chưa trận vớt nào có kết quả: bỏ nhánh
 * vớt, sinh lại khi bán kết xong lần nữa.
 */
'use strict';
const { real, newMatch } = require('./stages-base.js');

const FROM = { qf: 3, r16: 4, r32: 5 }; // số vòng tính từ chung kết (chung kết = 1, bán kết = 2, tứ kết = 3…)
const MODES = ['finalist', 'half'];

function normalize(c, out) {
  const x = c.rep;
  if (!x || typeof x !== 'object') return;
  out.rep = { from: Object.prototype.hasOwnProperty.call(FROM, x.from) ? x.from : 'qf', mode: MODES.includes(x.mode) ? x.mode : 'finalist' };
  out.thirdPlace = false; // hai trận tranh đồng thay cho trận tranh hạng 3
  delete out.places;
  out.placement = false;
}

/** Lỗi cỡ: nhánh phải có vòng `from` (ít nhất tứ kết – 8 người). */
function error(cfg, n, elimSize) {
  if (!cfg.rep || cfg.type !== 'single') return null;
  const need = 2 ** (FROM[cfg.rep.from] || 3);
  return elimSize(cfg.type, n) < need ? { code: 'ot_rep_size', args: { n: need / 2 + 1 } } : null;
}

const sfRound = (st) => st.rounds.length - 2;
const fromIdx = (st) => Math.max(0, st.rounds.length - (FROM[st.cfg.rep.from] || 3));

/** Ứng viên vớt của phía có bán kết sf (theo thứ tự vòng thua tăng dần). */
function poolOf(st, sf) {
  const fin = sf.winner, out = [];
  // Nửa nhánh của bán kết: các trận vòng r có next dẫn (qua các vòng) tới trận bán kết này
  const feeds = (m) => { const set = new Set([m.id]); for (let r = sfRound(st) - 1; r >= 0; r--) for (const id of st.rounds[r]) { const x = st.matches[id]; if (x.next && set.has(x.next.to)) set.add(id); } return set; };
  const half = feeds(sf);
  for (let r = fromIdx(st); r < sfRound(st); r++) {
    for (const id of st.rounds[r]) {
      const m = st.matches[id];
      if (!half.has(id) || !m.done || !real(m.loser)) continue;
      if (st.cfg.rep.mode === 'half' || m.winner === fin) out.push(m.loser);
    }
  }
  return out;
}

/** Sinh nhánh vớt + trận tranh đồng khi xong cả hai bán kết (gọi sau mỗi kết quả). */
function update(st) {
  if (!st.cfg.rep || st.rep || st.rounds.length < 3) return;
  const sfs = st.rounds[sfRound(st)].map((id) => st.matches[id]);
  if (sfs.length !== 2 || !sfs.every((m) => m.done)) return;
  const R = st.rounds.length;
  st.rep = { sides: sfs.map((sf, k) => {
    const pool = poolOf(st, sf), other = sfs[1 - k];
    const side = { fin: sf.winner, pool, ids: [], bronze: null, direct: null };
    const mk = (j, extra) => { const m = newMatch(`${st.key}rp${k}m${j}`, R + j, { rep: k, tag: 'rep_pool', ...extra }); st.matches[m.id] = m; return m; };
    if (!pool.length) { side.direct = real(other.loser) ? other.loser : null; return side; } // nhánh vớt rỗng: đồng thẳng cho người thua bán kết phía kia
    // Thang: pool[0] gặp pool[1], người thắng gặp pool[2]…; người cuối cùng còn lại vào trận tranh đồng
    const bronze = newMatch(`${st.key}rp${k}b`, R + pool.length, { rep: k, tag: 'rep_bronze', bronze: true });
    st.matches[bronze.id] = bronze;
    bronze.b = real(other.loser) ? other.loser : null;
    let prev = null;
    for (let j = 1; j < pool.length; j++) {
      const m = mk(j - 1);
      m.a = prev ? null : pool[0];
      m.b = pool[j];
      if (prev) prev.next = { to: m.id, slot: 'a' };
      side.ids.push(m.id);
      prev = m;
    }
    if (prev) prev.next = { to: bronze.id, slot: 'a' }; else bronze.a = pool[0];
    side.bronze = bronze.id;
    return side;
  }) };
}

/** Huỷ kết quả trận m (nhánh chính): false nếu bị khoá; bán kết bị huỷ thì bỏ nhánh vớt (chưa trận vớt nào có kết quả). */
function beforeUndo(st, m) {
  if (!st.rep || m.rep != null) return true;
  const ids = st.rep.sides.flatMap((s) => [...s.ids, ...(s.bronze ? [s.bronze] : [])]);
  if (ids.some((id) => st.matches[id].done)) return false;
  for (const id of ids) delete st.matches[id];
  st.rep = null;
  return true;
}

/** Thứ hạng chung cuộc khi có vòng vớt: [{ uid, place }]. */
function places(st) {
  const out = [], seen = new Set();
  const put = (u, p) => { if (real(u) && !seen.has(u)) { seen.add(u); out.push({ uid: u, place: p }); } };
  const final = st.matches[st.rounds[st.rounds.length - 1][0]];
  if (final.done) { put(final.winner, 1); put(final.loser, 2); }
  const sides = (st.rep && st.rep.sides) || [];
  for (const s of sides) { const b = s.bronze && st.matches[s.bronze]; if (b && b.done) put(b.winner, 3); if (s.direct) put(s.direct, 3); }
  for (const s of sides) { const b = s.bronze && st.matches[s.bronze]; if (b && b.done) put(b.loser, 5); }
  for (const s of sides) for (const id of s.ids) { const m = st.matches[id]; if (m.done) put(m.loser, 7); }
  // Còn lại: theo vòng bị loại ở nhánh chính (vòng muộn trước)
  for (let r = st.rounds.length - 2; r >= 0; r--) {
    const losers = st.rounds[r].map((id) => st.matches[id].loser).filter((u) => real(u) && !seen.has(u));
    const p = out.length + 1;
    for (const u of losers) put(u, p);
  }
  return out;
}
/** Bục trao giải: vô địch, á quân, hai huy chương đồng. */
const podium = (st) => places(st).filter((x) => x.place <= 3).map((x) => x.uid);

/** Phần gửi trình duyệt: mỗi phía một khối (finalist, các trận vớt, trận tranh đồng). */
function view(st, M) {
  if (!st.rep) return null;
  return st.rep.sides.map((s) => ({ fin: s.fin, rounds: [...s.ids.map((id) => [M(id)]), ...(s.bronze ? [[M(s.bronze)]] : [])], direct: s.direct || null }));
}

/** Số trận vớt + tranh đồng tối đa (ước tính): mỗi phía p người vớt → p − 1 trận vớt + 1 trận tranh đồng. */
function extraMatches(cfg, size) {
  if (!cfg.rep) return 0;
  const R = Math.round(Math.log2(size)), from = Math.max(0, R - (FROM[cfg.rep.from] || 3));
  let p = 0;
  for (let r = from; r < R - 2; r++) p += cfg.rep.mode === 'half' ? (size >> (r + 1)) / 2 : 1;
  return 2 * Math.max(1, p);
}

module.exports = { FROM, MODES, normalize, error, update, beforeUndo, places, podium, view, extraMatches };
