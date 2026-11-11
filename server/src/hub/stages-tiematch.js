/*
 * Giải offline – trận phụ phân hạng ở vòng tròn chia bảng (kiểu LoL Worlds / MSI – chỉ mô phỏng thể thức; luật Riot: MSI 2019
 * §6.1, MSI 2022 §6.2).
 * cfg.tbm (vòng tròn có người đi tiếp):
 *   'match' – bằng điểm ở một vạch có ý nghĩa thì luôn đấu trận phụ (đối đầu chỉ để chọn bên – kiểu Worlds 2021–2022);
 *   'h2h'   – xét đối đầu trước (hai đội: đối đầu trực tiếp; ba đội trở lên: tổng số trận thắng giữa các đội đang bằng
 *             nhau – "đối đầu gộp"); phần còn bằng nhau thì quay lại thủ tục từ đầu với nhóm nhỏ hơn, hết tách được mới đấu.
 * Vạch có ý nghĩa: vạch đi tiếp (`advance`) và các vạch trong cfg.tbmLines (vd. [1] – hạng nhất được chọn đối thủ bán kết;
 * Rumble 2021: [1, 2]; cfg.tbmTop cũ = [1]). Ngoại lệ trận thừa: trận chỉ phân hạng giữa hai vị trí không cách nhau bởi vạch
 * nào (1–2 khi cả hai cùng đi tiếp, 3–4 khi cả hai cùng bị loại…) thì không đấu; xếp theo các chỉ số phụ.
 * Thủ tục đấu một nhóm bằng nhau (xếp trước theo tổng thời gian các ván thắng – thấp hơn là "hạt giống trên"):
 *   - 2 đội: một trận.
 *   - 4 đội (vạch cắt giữa nhóm): hai trận Bo1 – nhanh nhất gặp chậm nhất, nhì gặp ba; đội thắng xếp trên đội thua; cần thì
 *     hai đội thắng (hay hai đội thua) đấu tiếp với nhau.
 *   - 3 đội và các trường hợp khác: bậc thang – hai đội chậm nhất đấu trước, đội thắng gặp đội nhanh kế tiếp… (3 đội: đội nhanh
 *     nhất được miễn, hai đội còn lại đấu, đội thắng gặp đội được miễn). Bậc nào mà kết quả không chạm tới vạch có ý nghĩa nào
 *     (người thắng lẫn người thua đều ở cùng một phía của mọi vạch) thì không đấu: đội nhanh hơn đi tiếp bậc sau. (Luật hoà 5–6 đội của Rumble không có nguyên văn trong hồ sơ – dùng bậc thang này.)
 * Quyền chọn bên (m.side = 'a'): đội có tổng thời gian thắng thấp hơn (thời lượng ván ở chi tiết ván esports); chưa đủ thời
 * lượng thì đội thắng đối đầu, rồi đội xếp trên theo chỉ số phụ.
 * Trận phụ: m.tb, không tính vào bảng điểm (stages-tiebreak.js bỏ qua m.tb), không có hoà; tạo khi mọi trận chính của bảng xong
 * (bậc sau tạo khi bậc trước xong). Huỷ một trận chính: các trận phụ chưa đấu bị bỏ (đã đấu thì phải huỷ trận phụ trước);
 * huỷ một trận phụ: các trận phụ chưa đấu tạo sau nó bị bỏ.
 * st.tbx = { [bảng]: [mã trận phụ theo thứ tự tạo] }. Giải cũ: st.tbm / st.tbt (một trận mỗi vạch) vẫn đọc được.
 */
'use strict';
const { real, newMatch } = require('./stages-base.js');
const { rankList, PRIMARY } = require('./stages-tiebreak.js');

const MODES = ['match', 'h2h'];
const MAX_LINES = 8;

/** Số trận thắng của a trước b (trận chính đã xong). */
function h2hWins(st, a, b) {
  let n = 0;
  for (const m of Object.values(st.matches)) {
    if (!m.done || m.tb || !((m.a === a && m.b === b) || (m.a === b && m.b === a))) continue;
    if (m.winner === a) n++;
    else if (m.winner === b) n--;
  }
  return n;
}

/** Số trận thắng của u trước các đội trong nhóm (trận chính). */
function groupWins(st, u, set) {
  let n = 0;
  for (const m of Object.values(st.matches)) {
    if (!m.done || m.tb || m.winner !== u) continue;
    if (set.has(m.loser)) n++;
  }
  return n;
}

/** Tổng thời lượng (giây) các ván thắng ở trận chính; null nếu có ván thắng chưa nhập thời lượng. */
function victoryTimes(st, uids) {
  const out = Object.fromEntries(uids.map((u) => [u, 0]));
  const set = new Set(uids);
  for (const m of Object.values(st.matches)) {
    if (!m.done || m.tb || !set.has(m.a) || !set.has(m.b)) continue;
    const sets = Array.isArray(m.sets) && m.sets.length ? m.sets : [[m.winner === m.a ? 1 : 0, m.winner === m.b ? 1 : 0]];
    sets.forEach((s, i) => {
      if (!s || s[0] === s[1]) return;
      const w = s[0] > s[1] ? m.a : m.b;
      if (out[w] == null) return;
      const d = m.esp && m.esp[i] && m.esp[i].dur;
      out[w] = d > 0 && out[w] != null ? out[w] + d : null;
    });
  }
  return out;
}

/** Bảng gi đã xong mọi trận chính? */
const groupMainDone = (st, grp) => grp.rounds.every((ids) => ids.every((id) => st.matches[id].tb || st.matches[id].done));

/** Các vạch có ý nghĩa (vạch L nằm giữa hạng L và L + 1). */
function linesOf(cfg) {
  const s = new Set([cfg.advance || 0]);
  for (const L of Array.isArray(cfg.tbmLines) ? cfg.tbmLines : []) s.add(L);
  if (cfg.tbmTop) s.add(1);
  s.delete(0);
  return s;
}

/**
 * Thứ tự cuối của bảng gi theo các trận phụ đã đấu + các trận phụ còn cần tạo.
 * Trả { order, need: [{ a, b }] } – need: các cặp phải đấu ngay (đủ hai đội, chưa có trận).
 */
function plan(st, gi, table) {
  const lines = linesOf(st.cfg), primary = PRIMARY[st.cfg.rankBy] || PRIMARY.points;
  const { list, stats } = table;
  const P = (u) => primary(stats[u]);
  const vt = victoryTimes(st, list);
  const pos = new Map(list.map((u, k) => [u, k]));
  const tbs = ((st.tbx && st.tbx[gi]) || []).map((id) => st.matches[id]).filter(Boolean);
  const need = [];
  const spans = (from, n) => { for (let L = from + 1; L < from + n; L++) if (lines.has(L)) return true; return false; };
  // Hạt giống trên: thời gian thắng thấp hơn (đủ dữ liệu), rồi thứ tự theo chỉ số phụ
  const faster = (a, b) => (vt[a] != null && vt[b] != null && vt[a] !== vt[b] ? vt[a] - vt[b] : pos.get(a) - pos.get(b));
  /** Trận phụ giữa a và b: đã đấu → người thắng; chưa có → ghi vào need; đang chờ → null. */
  const game = (a, b) => {
    const m = tbs.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
    if (m) return m.done && real(m.winner) ? m.winner : null;
    if (!need.some((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a))) need.push(sideFirst(a, b));
    return null;
  };
  const sideFirst = (a, b) => {
    const known = vt[a] != null && vt[b] != null && vt[a] !== vt[b];
    const h = h2hWins(st, a, b);
    const first = known ? (vt[a] < vt[b] ? a : b) : h !== 0 ? (h > 0 ? a : b) : pos.get(a) < pos.get(b) ? a : b;
    return first === a ? { a, b } : { a: b, b: a };
  };
  /** Bậc thang (ties xếp nhanh → chậm, chiếm vị trí base…). */
  function ladder(ties, base) {
    const n = ties.length, out = new Array(n);
    let cur = ties[n - 1];
    for (let j = n - 2; j >= 0; j--) {
      const p = j + 1; // người thua bậc này đứng ở vị trí p của nhóm (vạch base + p)
      // Bậc cần đấu khi có vạch ở base + 1 … base + p (đội thắng còn tranh các vạch phía trên); không thì đội nhanh hơn đi tiếp
      let need = false;
      for (let L = base + 1; L <= base + p; L++) if (lines.has(L)) need = true;
      let w;
      if (!need) w = ties[j];
      else { w = game(ties[j], cur); if (!w) return [...ties]; }
      out[p] = w === ties[j] ? cur : ties[j];
      cur = w;
    }
    out[0] = cur;
    return out;
  }
  function tieGames(ties, base) {
    ties = [...ties].sort(faster);
    const n = ties.length;
    if (n === 2) { const w = game(ties[0], ties[1]); return w ? [w, w === ties[0] ? ties[1] : ties[0]] : ties; }
    if (n === 4 && lines.has(base + 2)) {
      const wA = game(ties[0], ties[3]), wB = game(ties[1], ties[2]);
      if (!wA || !wB) return ties;
      const W = [wA, wB].sort(faster), L = [wA === ties[0] ? ties[3] : ties[0], wB === ties[1] ? ties[2] : ties[1]].sort(faster);
      const pair = (x, at) => { if (!lines.has(at)) return x; const w = game(x[0], x[1]); return w ? [w, w === x[0] ? x[1] : x[0]] : x; };
      return [...pair(W, base + 1), ...pair(L, base + 3)];
    }
    return ladder(ties, base);
  }
  /** Một nhóm bằng nhau chiếm vị trí base…: 'h2h' tách bằng đối đầu (gộp) trước, phần còn lại mới đấu. */
  function resolve(block, base) {
    if (block.length < 2 || !spans(base, block.length)) return block;
    if (st.cfg.tbm !== 'h2h') return tieGames(block, base);
    const set = new Set(block);
    const w = Object.fromEntries(block.map((u) => [u, groupWins(st, u, set)]));
    const sorted = [...block].sort((a, b) => w[b] - w[a] || pos.get(a) - pos.get(b));
    const out = [];
    for (let i = 0; i < sorted.length;) {
      let j = i;
      while (j + 1 < sorted.length && w[sorted[j + 1]] === w[sorted[i]]) j++;
      const sub = sorted.slice(i, j + 1);
      // Không tách được nữa (cả nhóm vẫn bằng nhau) → đấu; tách được → làm lại với nhóm nhỏ hơn
      out.push(...(sub.length === block.length ? tieGames(sub, base + i) : resolve(sub, base + i)));
      i = j + 1;
    }
    return out;
  }
  const order = [];
  for (let i = 0; i < list.length;) {
    let j = i;
    while (j + 1 < list.length && P(list[j + 1]) === P(list[i])) j++;
    order.push(...resolve(list.slice(i, j + 1), i));
    i = j + 1;
  }
  return { order, need };
}

/** Trận phụ kiểu cũ (giải lưu trước khi có st.tbx): một trận mỗi vạch, đội thắng đứng trên đội thua. */
function legacy(st, gi, table) {
  const list = [...table.list];
  for (const key of ['tbt', 'tbm']) {
    const id = st[key] && st[key][gi], m = id && st.matches[id];
    if (!m || !m.done || !real(m.winner)) continue;
    const i = list.indexOf(m.winner), j = list.indexOf(m.loser);
    if (i > j && j >= 0) [list[i], list[j]] = [list[j], list[i]];
  }
  return { ...table, list };
}
const isLegacy = (st, gi) => (st.tbm && st.tbm[gi] != null) || (st.tbt && st.tbt[gi] != null);

/**
 * Gọi sau mỗi kết quả (stages.js – recordResult): bảng nào xong mọi trận chính thì tạo các trận phụ cần đấu tiếp. Trả true nếu
 * vừa tạo trận.
 */
function addTiebreaks(st, seedOf = () => 0) {
  if (!MODES.includes(st.cfg.tbm) || !st.cfg.advance || !st.groups) return false;
  let made = false;
  st.groups.forEach((grp, gi) => {
    if (isLegacy(st, gi) || !groupMainDone(st, grp)) return;
    const { need } = plan(st, gi, rankList(st, grp.players, seedOf));
    for (const { a, b } of need) {
      const ids = (st.tbx && st.tbx[gi]) || [];
      let k = ids.length, id;
      do id = `${st.key}g${gi}tb${k ? k : ''}`; while (st.matches[id] && ++k);
      const m = newMatch(id, grp.rounds.length, { group: gi, tb: true, tag: 'tb' });
      Object.assign(m, { a, b, side: 'a' }); // ô trên: được chọn bên
      st.matches[m.id] = m;
      grp.rounds.push([m.id]);
      st.tbx = { ...(st.tbx || {}), [gi]: [...ids, m.id] };
      made = true;
    }
  });
  return made;
}

/** Áp kết quả các trận phụ vào bảng xếp hạng một bảng. */
function applyTiebreak(st, gi, table) {
  if (isLegacy(st, gi)) return legacy(st, gi, table);
  if (!MODES.includes(st.cfg.tbm) || !st.cfg.advance) return table;
  const groupDone = st.groups && st.groups[gi] && groupMainDone(st, st.groups[gi]);
  return groupDone ? { ...table, list: plan(st, gi, table).order } : table;
}

/**
 * Trước khi huỷ trận m (otour-run.js): huỷ trận chính → bỏ mọi trận phụ chưa đấu của bảng (có trận phụ đã đấu thì không huỷ
 * được); huỷ trận phụ → bỏ các trận phụ chưa đấu tạo sau nó (trận phụ sau đã đấu thì không huỷ được). Trả true nếu được huỷ.
 */
function beforeUndo(st, m) {
  if (m.group == null) return true;
  const gi = m.group, grp = st.groups[gi];
  if (isLegacy(st, gi)) {
    if (m.tb) return true;
    const ids = ['tbm', 'tbt'].map((key) => st[key] && st[key][gi]).filter((x) => x != null);
    if (ids.some((id) => st.matches[id] && st.matches[id].done)) return false;
    for (const key of ['tbm', 'tbt']) {
      const id = st[key] && st[key][gi];
      if (id == null) continue;
      delete st.matches[id];
      grp.rounds = grp.rounds.filter((x) => !x.includes(id));
      delete st[key][gi];
    }
    return true;
  }
  const ids = (st.tbx && st.tbx[gi]) || [];
  const after = m.tb ? ids.slice(ids.indexOf(m.id) + 1) : ids;
  if (after.some((id) => st.matches[id] && st.matches[id].done)) return false;
  for (const id of after) { delete st.matches[id]; grp.rounds = grp.rounds.filter((x) => !x.includes(id)); }
  if (after.length) st.tbx = { ...st.tbx, [gi]: ids.filter((id) => !after.includes(id)) };
  return true;
}

module.exports = { MODES, MAX_LINES, h2hWins, victoryTimes, addTiebreaks, applyTiebreak, beforeUndo, plan, linesOf };
