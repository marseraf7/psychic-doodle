/*
 * Giải đấu Offline – nhập kết quả các chặng của giai đoạn hệ Race (lõi: stages-race.js). Ban tổ chức gửi cả bảng kết
 * quả một chặng: thứ hạng (cách tính điểm theo hạng) hoặc thời gian (Time Trial), bỏ cuộc, điểm sửa tay. Huỷ được một
 * chặng khi giai đoạn còn đang diễn ra. Chặng cuối xong thì sang giai đoạn sau / kết thúc giải (otour-run.js – otNextStage).
 */
'use strict';
const { E } = require('../msg.js');
const Race = require('./stages-race.js');

class OTourRace {
  /** Giai đoạn race hiện tại và chặng thứ `event` (lỗi nếu không có). */
  otRaceEvent(t, event) {
    if (t.status !== 'running') throw E('tour_not_running');
    const st = t.st && t.st[t.stage];
    const i = Math.floor(Number(event));
    if (!st || st.type !== 'race' || !Number.isInteger(i) || !st.events[i]) throw E('tour_match_not_found');
    return { st, i };
  }

  on_otRace(conn, { id, event, rows }) {
    const { t, me } = this.otManaged(conn, id);
    const { st, i } = this.otRaceEvent(t, event);
    if (st.events[i].done) throw E('tour_match_done');
    const r = Race.cleanEvent(st, rows);
    if (r.code) throw E(r.code, r.args || {});
    Race.recordEvent(st, i, r.rows);
    st.v = (st.v || 0) + 1;
    this.otLog(t, me.id, 'race', { n: i + 1, k: r.rows.filter((x) => !x.dnf).length });
    if (st.done) this.otNextStage(t);
    this.otSave(t);
  }

  on_otRaceUndo(conn, { id, event }) {
    const { t, me } = this.otManaged(conn, id);
    const { st, i } = this.otRaceEvent(t, event);
    if (!st.events[i].done) throw E('tour_undo_locked');
    Race.undoEvent(st, i);
    st.v = (st.v || 0) + 1;
    this.otLog(t, me.id, 'race_undo', { n: i + 1 });
    this.otSave(t);
  }
}

module.exports = { OTourRace };
