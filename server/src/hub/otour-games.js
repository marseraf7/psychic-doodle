/*
 * Giải đấu Offline – Esports: chi tiết từng ván, cấm chọn + Fearless, thống kê tướng (thuật toán dùng chung:
 * caro/otour-draft.js; giao diện: caro/otour-games-ui.js).
 *   otEspCfg  { id, esports }        – cấu hình cấm chọn / Fearless / chỉ số / danh sách tướng gợi ý (sửa lúc nào cũng được;
 *                                       đổi luật không kiểm lại các ván đã nhập)
 *   otGame    { id, match, i, game } – lưu chi tiết ván i (0-based) vào m.esp[i]: bên xanh / đỏ, thời lượng, cấm chọn (kiểm trùng
 *                                       trong ván + Fearless so với các ván trước), chỉ số đội (bắt buộc), MVP, K/D/A,
 *                                       vàng theo thời gian. Nhập được cả khi loạt chưa xong (cập nhật theo từng ván).
 *   otGameDel { id, match, i }       – xoá chi tiết ván i
 * Người thắng ván lấy từ tỉ số của loạt (m.sets[i]) – không nhập hai lần.
 */
'use strict';
const { E } = require('../msg.js');
const ST = require('./stages.js');
const DR = require('../../../caro/otour-draft.js');

class OTourGames {
  /** Trận vòng trước cùng giai đoạn của hai đội (Fearless phạm vi 'stage'). */
  otGameOthers(st, m) {
    const earlier = (x) => (x.pre && !m.pre) || (!x.pre === !m.pre && x.round < m.round); // play-in đấu trước vòng 1
    return Object.values(st.matches).filter((x) => x !== m && x.esp && earlier(x) && [x.a, x.b].some((u) => u === m.a || u === m.b));
  }

  /** Trận để nhập chi tiết ván: có cấu hình esports, đủ hai đội, ván i nằm trong Bo của trận (và trong số ván đã đấu). */
  otGameTarget(conn, id, match, i) {
    const { t, me } = this.otManaged(conn, id);
    if (!t.esports) throw E('ot_g_off');
    const { st, m } = this.otAnyMatch(t, match);
    if (!ST.real(m.a) || !ST.real(m.b)) throw E('tour_match_not_ready');
    const k = Math.floor(Number(i));
    const bo = ST.boOf(st, m);
    if (!Number.isInteger(k) || k < 0 || k >= bo || (m.done && m.sets && k >= m.sets.length)) throw E('ot_g_index');
    return { t, me, st, m, k };
  }

  on_otEspCfg(conn, { id, esports }) {
    const { t, me } = this.otManaged(conn, id);
    if (t.sport !== 'esports') throw E('ot_g_off');
    t.esports = esports === null ? null : DR.cleanEsports(esports);
    this.otLog(t, me.id, 'esp_cfg');
    this.otSave(t);
  }

  on_otGame(conn, { id, match, i, game }) {
    const { t, st, m, k } = this.otGameTarget(conn, id, match, i);
    const prior = DR.priorPicks(m, k, t.esports, t.esports.scope === 'stage' ? this.otGameOthers(st, m) : []);
    const r = DR.cleanGame(game, t.esports, prior);
    if (r.code) throw E(r.code, r.args || {});
    // m.esp (không phải m.games – đó là mã ván cờ để xem lại của giải Caro)
    m.esp = m.esp || [];
    while (m.esp.length < k) m.esp.push(null);
    m.esp[k] = r.game;
    st.v = (st.v || 0) + 1;
    this.otSave(t);
  }

  on_otGameDel(conn, { id, match, i }) {
    const { t, st, m, k } = this.otGameTarget(conn, id, match, i);
    if (!m.esp || !m.esp[k]) return;
    m.esp[k] = null;
    while (m.esp.length && !m.esp[m.esp.length - 1]) m.esp.pop();
    if (!m.esp.length) delete m.esp;
    st.v = (st.v || 0) + 1;
    this.otSave(t);
  }

  /** Thống kê esports của cả giải (tướng cấm / chọn / thắng, bên xanh, thời lượng, MVP); null nếu chưa có ván nào. */
  otEspStats(t) {
    if (!t.esports) return null;
    const ms = [];
    for (const st of t.st || []) for (const m of Object.values(st.matches || {})) if (m.esp && m.esp.length) ms.push(m);
    if (!ms.length) return null;
    return DR.stats(ms);
  }
}

module.exports = { OTourGames };
