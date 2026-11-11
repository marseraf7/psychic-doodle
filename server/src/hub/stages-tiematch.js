/*
 * Giải offline – trận phụ phân hạng ở vòng tròn (kiểu vòng bảng LoL Worlds 2021–2022; chỉ mô phỏng thể thức).
 * cfg.tbm (vòng tròn có người đi tiếp):
 *   'match' – hai đội bằng điểm ở ngay vạch đi tiếp (hạng `advance` và `advance + 1`) thì đấu thêm một trận phụ; đội thắng
 *             xếp trên. Đối đầu chỉ dùng để chọn bên (đội xếp trên theo các hệ số phụ đứng ô trên – được chọn bên).
 *   'h2h'   – như trên nhưng chỉ khi đối đầu giữa hai đội cũng bằng nhau (đối đầu khác nhau thì đối đầu quyết định).
 * Chỉ áp cho đúng hai đội bằng điểm (ba đội trở lên bằng điểm: xếp theo các hệ số phụ như thường). Trận phụ được tạo khi
 * mọi trận chính của bảng đã xong; không tính vào bảng điểm (stages-tiebreak.js bỏ qua m.tb), không có hoà. Huỷ một trận
 * chính của bảng: trận phụ chưa đấu bị bỏ; trận phụ đã đấu thì phải huỷ trận phụ trước.
 * st.tbm = { [chỉ số bảng]: mã trận phụ }.
 */
'use strict';
const { real, newMatch } = require('./stages-base.js');
const { rankList, PRIMARY } = require('./stages-tiebreak.js');

const MODES = ['match', 'h2h'];

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

/** Bảng gi đã xong mọi trận chính? */
const groupMainDone = (st, grp) => grp.rounds.every((ids) => ids.every((id) => st.matches[id].tb || st.matches[id].done));

/**
 * Gọi sau mỗi kết quả (stages.js – recordResult): bảng nào xong mọi trận chính mà có đúng hai đội bằng điểm ở vạch đi
 * tiếp thì tạo trận phụ. Trả true nếu vừa tạo trận.
 */
function addTiebreaks(st, seedOf = () => 0) {
  const k = st.cfg.advance || 0;
  if (!MODES.includes(st.cfg.tbm) || !k || !st.groups) return false;
  const primary = PRIMARY[st.cfg.rankBy] || PRIMARY.points;
  let made = false;
  st.groups.forEach((grp, gi) => {
    if ((st.tbm && st.tbm[gi] != null) || !groupMainDone(st, grp)) return;
    const { list, stats } = rankList(st, grp.players, seedOf);
    if (list.length <= k) return;
    const P = (u) => primary(stats[u]);
    const a = list[k - 1], b = list[k];
    if (P(a) !== P(b)) return;
    if ((k >= 2 && P(list[k - 2]) === P(a)) || (k + 1 < list.length && P(list[k + 1]) === P(b))) return; // ba đội trở lên
    if (st.cfg.tbm === 'h2h' && h2hWins(st, a, b) !== 0) return;
    const m = newMatch(`${st.key}g${gi}tb`, grp.rounds.length, { group: gi, tb: true, tag: 'tb' });
    Object.assign(m, { a, b });
    st.matches[m.id] = m;
    grp.rounds.push([m.id]);
    st.tbm = { ...(st.tbm || {}), [gi]: m.id };
    made = true;
  });
  return made;
}

/** Áp kết quả trận phụ vào bảng xếp hạng một bảng: đội thắng trận phụ đứng trên đội thua. */
function applyTiebreak(st, gi, table) {
  const id = st.tbm && st.tbm[gi], m = id && st.matches[id];
  if (!m || !m.done || !real(m.winner)) return table;
  const list = [...table.list], i = list.indexOf(m.winner), j = list.indexOf(m.loser);
  if (i > j && j >= 0) [list[i], list[j]] = [list[j], list[i]];
  return { ...table, list };
}

/**
 * Trước khi huỷ trận m (otour-run.js): trận chính của bảng có trận phụ đã đấu → không huỷ được (false); trận phụ chưa
 * đấu thì bỏ trận phụ. Trả true nếu được huỷ.
 */
function beforeUndo(st, m) {
  if (!st.tbm || m.tb || m.group == null || st.tbm[m.group] == null) return true;
  const id = st.tbm[m.group], tb = st.matches[id];
  if (tb && tb.done) return false;
  delete st.matches[id];
  const grp = st.groups[m.group];
  grp.rounds = grp.rounds.filter((ids) => !ids.includes(id));
  delete st.tbm[m.group];
  return true;
}

module.exports = { MODES, h2hWins, addTiebreaks, applyTiebreak, beforeUndo };
