/*
 * Giải đấu Offline – nhập kết quả các chặng của giai đoạn hệ Race (lõi: stages-race.js). Ban tổ chức gửi cả bảng kết
 * quả một chặng: thứ hạng (cách tính điểm theo hạng) hoặc thời gian (Time Trial), bỏ cuộc, điểm sửa tay. Huỷ được một
 * chặng khi giai đoạn còn đang diễn ra. Chặng cuối xong thì sang giai đoạn sau / kết thúc giải (otour-run.js – otNextStage).
 * Chặng chia lượt (heat): gửi kèm `heat` – kết quả từng lượt; đủ các lượt thì chặng xong; huỷ được từng lượt.
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

  /** Lượt h của chặng (chặng chia lượt); chặng không chia lượt thì null. */
  otRaceHeat(st, i, heat) {
    const hs = st.events[i].heats;
    if (!hs) { if (heat != null) throw E('bad_message'); return null; }
    const h = Math.floor(Number(heat));
    if (!Number.isInteger(h) || !hs[h]) throw E('bad_message');
    return h;
  }

  on_otRace(conn, { id, event, heat, rows }) {
    const { t, me } = this.otManaged(conn, id);
    const { st, i } = this.otRaceEvent(t, event);
    if (st.events[i].done) throw E('tour_match_done');
    const h = this.otRaceHeat(st, i, heat);
    if (h != null && st.events[i].heats[h].done) throw E('tour_match_done');
    // Xe đạp nhiều chặng ('gt'): nhập lần lượt từng chặng (người bỏ cuộc rời các chặng sau)
    if (st.cfg.score === 'gt' && st.events.some((e) => e.i < i && !e.done)) throw E('ot_gt_seq');
    const r = Race.cleanEvent(st, rows, h != null ? st.events[i].heats[h].uids : undefined, i);
    if (r.code) throw E(r.code, r.args || {});
    if (h != null) Race.recordHeat(st, i, h, r.rows);
    else Race.recordEvent(st, i, r.rows);
    st.v = (st.v || 0) + 1;
    this.otLog(t, me.id, 'race', { n: i + 1, k: r.rows.filter((x) => !x.dnf).length });
    if (st.done) this.otNextStage(t);
    this.otSave(t);
  }

  /** Huỷ kết quả một chặng; chặng chia lượt: gửi kèm heat để huỷ riêng lượt đó. */
  on_otRaceUndo(conn, { id, event, heat }) {
    const { t, me } = this.otManaged(conn, id);
    const { st, i } = this.otRaceEvent(t, event);
    const h = heat == null ? null : this.otRaceHeat(st, i, heat);
    const ev = st.events[i];
    // 'gt': chỉ huỷ chặng nhập sau cùng (huỷ chặng giữa làm sai danh sách bỏ cuộc của các chặng sau)
    if (st.cfg.score === 'gt' && st.events.some((e) => e.i > i && e.done)) throw E('ot_gt_undo_last');
    if (h != null) {
      if (!ev.heats[h].done) throw E('tour_undo_locked');
      Race.undoHeat(st, i, h);
    } else {
      if (!ev.done && !(ev.heats && ev.heats.some((x) => x.done))) throw E('tour_undo_locked');
      Race.undoEvent(st, i);
    }
    st.v = (st.v || 0) + 1;
    this.otLog(t, me.id, 'race_undo', { n: i + 1 });
    this.otSave(t);
  }
}

module.exports = { OTourRace };
