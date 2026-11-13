/*
 * Giải đấu Offline – nhập kết quả các chặng của giai đoạn hệ Race (lõi: stages-race.js). Ban tổ chức gửi cả bảng kết
 * quả một chặng: thứ hạng (cách tính điểm theo hạng) hoặc thời gian (Time Trial), bỏ cuộc, điểm sửa tay. Huỷ được một
 * chặng khi giai đoạn còn đang diễn ra. Chặng cuối xong thì sang giai đoạn sau / kết thúc giải (otour-run.js – otNextStage).
 * Chặng chia lượt (heat): gửi kèm `heat` – kết quả từng lượt; đủ các lượt thì chặng xong; huỷ được từng lượt.
 */
'use strict';
const { E } = require('../msg.js');
const Race = require('./stages-race.js');
const GOLF = require('./stages-golf.js');
// Nhập lần lượt (người bỏ cuộc / bị cắt rời các chặng, vòng sau): xe đạp nhiều chặng, golf
const SEQ = ['gt', 'golf'];

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
    // Xe đạp nhiều chặng / golf: nhập lần lượt từng chặng / vòng (người bỏ cuộc, bị cắt rời các chặng / vòng sau)
    if ((SEQ.includes(st.cfg.score) || st.cfg.mp || st.cfg.gate || st.cfg.circuit || st.cfg.weekly) && st.events.some((e) => e.i < i && !e.done)) throw E('ot_gt_seq'); // match point cũng nhập lần lượt
    const r = Race.cleanEvent(st, rows, h != null ? st.events[i].heats[h].uids : Race.lobby(st, i), i); // chỉ đội của chặng: rot – hai bảng đấu trận này; groups – bảng của chặng; gate – hàng chờ
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
    // 'gt' / 'golf': chỉ huỷ chặng / vòng nhập sau cùng (huỷ ở giữa làm sai danh sách bỏ cuộc / bị cắt của phần sau)
    if ((SEQ.includes(st.cfg.score) || st.cfg.mp || st.cfg.gate || st.cfg.circuit || st.cfg.weekly) && st.events.some((e) => e.i > i && (e.done || e.rows))) throw E('ot_gt_undo_last');
    if (h != null) {
      if (!ev.heats[h].done) throw E('tour_undo_locked');
      Race.undoHeat(st, i, h);
    } else {
      if (!ev.done && !ev.rows && !(ev.heats && ev.heats.some((x) => x.done))) throw E('tour_undo_locked'); // golf: vòng đang dở
      Race.undoEvent(st, i);
    }
    st.v = (st.v || 0) + 1;
    this.otLog(t, me.id, 'race_undo', { n: i + 1 });
    this.otSave(t);
  }

  /**
   * Golf: bằng điểm ở hạng nhất sau vòng cuối – ghi người thắng đấu phụ đột tử (holes: số lỗ đấu phụ đã đánh), rồi
   * giai đoạn kết thúc. Huỷ vòng cuối thì bỏ luôn kết quả đấu phụ.
   */
  on_otGolfPlayoff(conn, { id, winner, holes }) {
    const { t, me } = this.otManaged(conn, id);
    if (t.status !== 'running') throw E('tour_not_running');
    const st = t.st && t.st[t.stage];
    if (!st || st.type !== 'race' || st.cfg.score !== 'golf') throw E('bad_message');
    const C = GOLF.golfCalc(st, this.otSeedOf(t));
    if (!C.all || C.leaders.length < 2 || st.done) throw E('ot_golf_no_po');
    if (!C.leaders.includes(String(winner))) throw E('bad_message');
    const n = Math.floor(Number(holes));
    st.playoff = { winner: String(winner), holes: Number.isInteger(n) && n >= 1 && n <= 30 ? n : 1 };
    GOLF.settle(st);
    st.v = (st.v || 0) + 1;
    const p = t.players.find((x) => x.uid === st.playoff.winner);
    this.otLog(t, me.id, 'golf_po', { name: p ? p.name : '?' });
    if (st.done) this.otNextStage(t);
    this.otSave(t);
  }
}

module.exports = { OTourRace };
