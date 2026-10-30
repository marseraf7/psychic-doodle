/*
 * Giải đấu – ban tổ chức kéo thả xếp nhánh trước giai đoạn loại trực tiếp / nhánh thắng – thua (như Challonge: sau vòng
 * bảng / Thụy Sĩ, sắp lại người chơi trong nhánh trước khi bắt đầu giai đoạn 2):
 *  - Bật "Dừng lại để xếp nhánh" (t.arrangeNext, tab Nhánh đấu): giai đoạn trước xong thì chưa bốc thăm ngay mà giữ
 *    t.arrange = { stage, seeds, groupOf, labels, slots } – slots là các ô vòng 1 (cặp liền nhau), mặc định như bốc thăm tự
 *    động (stages-elim.js – defaultSlots). Người chơi thấy "ban tổ chức đang xếp nhánh".
 *  - Ban tổ chức (quyền Người chơi) kéo thả / bấm đổi chỗ ở trang giải (caro/tour-arrange.js): mỗi lần đổi lưu ngay
 *    (tourArrange) để các đồng ban tổ chức cùng thấy; "Bắt đầu giai đoạn" (tourArrangeGo) dựng nhánh theo đúng các ô đó.
 *  - Lưu trong giải (SQLite) nên máy chủ khởi động lại vẫn giữ; đặt lại giải thì bỏ.
 */
'use strict';
const { E, note } = require('../msg.js');
const { userPid } = require('./shared.js');
const ST = require('./stages.js');

class TourArrange {
  /**
   * nextStage (bracket.js) gọi khi giai đoạn trước vừa xong: cần dừng để xếp nhánh thì lưu t.arrange và trả true.
   * Chỉ cho giai đoạn sau là loại trực tiếp / nhánh thắng – thua.
   */
  arrangeHold(t, st, seeds, groupOf) {
    const cfg = t.stages[t.stage + 1];
    if (!t.arrangeNext || !cfg || !ST.isElim(cfg.type)) return false;
    t.arrange = { stage: t.stage + 1, seeds, groupOf, labels: this.advLabels(t, st), slots: ST.defaultSlots(cfg.type, seeds, groupOf, null), at: Date.now() };
    this.tourLog(t, null, 'arrange_wait', { n: t.stage + 2 });
    for (const s of this.tourManagers(t, 'players')) this.send(userPid(s), note('tour_arrange_now', { name: t.name, n: t.stage + 2 })); // disputes.js
    return true;
  }

  /** Nhãn thành tích giai đoạn trước của người đi tiếp: vòng tròn "A1" (nhất bảng A), Thụy Sĩ "#3". */
  advLabels(t, st) {
    const out = {};
    const tables = ST.standings(st, this.seedOf(t)) || [];
    tables.forEach((tb, g) => tb.list.forEach((u, i) => { out[u] = st.type === 'roundrobin' ? ST.groupName(g) + (i + 1) : '#' + (i + 1); }));
    return out;
  }

  arrangeTarget(conn, id) {
    const t = this.requireManager(conn, id, 'players');
    if (t.status !== 'running' || !t.arrange) throw E('tour_arrange_none');
    return t;
  }

  /** Thứ tự ô hợp lệ (null = về mặc định). */
  arrangeSlots(t, slots) {
    const a = t.arrange;
    const type = t.stages[a.stage].type;
    if (slots == null) return ST.defaultSlots(type, a.seeds, a.groupOf, null);
    const ok = ST.checkSlots(type, a.seeds, slots);
    if (!ok) throw E('tour_arrange_bad');
    return ok;
  }

  /** Lưu thứ tự ô đang xếp (mỗi lần kéo thả). */
  on_tourArrange(conn, { id, slots }) {
    const t = this.arrangeTarget(conn, id);
    t.arrange.slots = this.arrangeSlots(t, slots);
    this.saveTour(t);
    this.pushTour(t);
  }

  /** Bắt đầu giai đoạn sau theo đúng các ô đã xếp. */
  on_tourArrangeGo(conn, { id, slots }) {
    const t = this.arrangeTarget(conn, id);
    if (slots !== undefined) t.arrange.slots = this.arrangeSlots(t, slots);
    const a = t.arrange;
    t.arrange = null;
    t.stage = a.stage;
    t.st.push(ST.buildStage(t.stages[a.stage], a.stage, a.seeds, { groupOf: a.groupOf, seedOf: this.seedOf(t), isActive: (u) => this.isActiveIn(t, u), slots: a.slots }));
    this.tourLog(t, this.requireUser(conn).id, 'arranged', { n: a.stage + 1 });
    const going = new Set(a.seeds);
    this.notifyPlayers(t, 'tour_advanced', { n: a.stage + 1 }, (p) => going.has(p.uid));
    this.saveTour(t);
    this.pushTour(t);
    this.runBracket(t, Date.now());
  }

  /** Phần chung: đang chờ xếp nhánh giai đoạn nào (người chơi thấy dòng thông báo). */
  arrangeShared(t) {
    return { arranging: t.arrange ? t.arrange.stage : null };
  }

  /** Phần riêng của ban tổ chức (quyền Người chơi): các ô để kéo thả. */
  arrangeMine(t, uid) {
    const a = t.arrange;
    if (!a || !this.canManageTour(t, uid, 'players')) return {};
    const side = (u) => (ST.real(u) ? { ...this.tourSide(t, u), label: a.labels[u] || '', g: a.groupOf && a.groupOf[u] != null ? a.groupOf[u] : null } : { bye: true });
    return { arrange: { stage: a.stage, type: t.stages[a.stage].type, slots: a.slots.map(side) } };
  }
}

module.exports = { TourArrange };
