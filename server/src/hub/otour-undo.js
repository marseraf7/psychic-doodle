/*
 * Giải offline – huỷ kết quả một trận (như giải Caro – tour-score.js): kiểm mọi khoá trước (trận sau đã có kết quả, nhánh vớt /
 * playoff chặng / trận phụ đã đấu, vòng sau của loại trực tiếp dựng từng vòng), được huỷ rồi mới sửa giai đoạn – bị khoá thì
 * giai đoạn giữ nguyên. Gộp vào Hub (hub/index.js).
 */
'use strict';
const { E } = require('../msg.js');
const ST = require('./stages.js');
const PO = require('./stages-playoff.js');

class OTourUndo {
  /** Huỷ kết quả (như giải Caro – tour-score.js): chỉ khi các trận nhận người thắng / thua của nó chưa có kết quả. */
  on_otUndo(conn, { id, match }) {
    const { t, me } = this.otManaged(conn, id);
    const { st, m } = this.otMatch(t, match);
    if (!m.done || m.bye || m.split || PO.undoLocked(st, m)) throw E('tour_undo_locked');
    this.otUndoApply(st, m);
    this.otLog(t, me.id, 'undo', { match: m.id });
    this.otSave(t);
  }

  /** Phần huỷ kết quả của on_otUndo: kiểm hết các khoá trước (không sửa gì), được huỷ rồi mới sửa giai đoạn. */
  otUndoApply(st, m) {
    if (ST.linked(st.type)) {
      const targets = [m.next, m.loserTo].filter(Boolean).map((r) => ({ r, x: st.matches[r.to] }));
      const g2 = m.gf === 1 && st.gf[1] && st.matches[st.gf[1]];
      // Trận sau / trận đấu thêm đã có kết quả; bán kết mà nhánh vớt đã có kết quả
      if (targets.some(({ x }) => x.done) || (g2 && g2.done && !g2.skipped) || ST.REP.undoLocked(st, m)) throw E('tour_undo_locked');
      const kd = ST.Kinds.get(st.type);
      if (kd && kd.beforeUndo && !kd.beforeUndo(st, m)) throw E('tour_undo_locked'); // dựng từng vòng: vòng sau đã đấu (khoá thì chưa sửa gì)
      for (const { r, x } of targets) x[r.slot] = null;
      if (g2) Object.assign(g2, { done: false, skipped: false, winner: null, loser: null, a: null, b: null });
      ST.REP.beforeUndo(st, m); // bán kết: bỏ nhánh vớt chưa đấu
    } else if (st.type === 'swiss' && m.round < st.rounds.length - 1) throw E('tour_undo_locked');
    else if (st.type === 'roundrobin') {
      // Trận phụ / playoff chặng đã đấu: huỷ chúng trước
      if (ST.SPL.undoLocked(st, m) || (m.sp == null && ST.TM.undoLocked(st, m))) throw E('tour_undo_locked');
      ST.SPL.beforeUndo(st, m);
      if (m.sp == null) ST.tieBeforeUndo(st, m);
    }
    Object.assign(m, { done: false, winner: null, loser: null, wins: {}, score: null, sets: null, pens: null, legs: false, extra: null, aet: false, ext: false, quick: false, double: false, lad: null, vp: null, boards: null });
    st.done = false;
    st.v = (st.v || 0) + 1;
  }
}

module.exports = { OTourUndo };
