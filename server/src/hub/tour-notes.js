/*
 * Giải đấu – thông báo theo tuỳ chọn của ban tổ chức (tab Thông báo của trang Cài đặt nâng cao, như Challonge):
 *  - notifyMatch: báo người chơi có tài khoản khi trận của mình sẵn sàng (giải offline: đủ hai người, chờ đấu ngoài đời –
 *    giải trực tuyến thì phòng đấu tự mở và đã có thông báo "vào trận").
 *  - notifyResults: giải xong thì gửi kết quả (hạng của mình, nhà vô địch) cho mọi người chơi có tài khoản.
 * Thông báo lưu: người đang online nhận ngay (chuông thông báo – topbar-inbox.js), người offline nhận khi vào lại.
 * Mỗi người giữ tối đa MAX_NOTES thông báo chưa nhận.
 */
'use strict';
const ST = require('./stages.js');
const { userPid } = require('./shared.js');

const MAX_NOTES = 30;

class TourNotes {
  /** Gửi một thông báo lưu cho tài khoản uid (online: gửi ngay; offline: giữ tới khi vào lại). */
  pushNote(uid, item) {
    const u = this.store.users.get(uid);
    if (!u) return;
    const x = { ...item, at: Date.now() };
    if (this.isOnline(userPid(uid))) { this.send(userPid(uid), { t: 'notes', items: [x] }); return; }
    u.notes = [...(u.notes || []), x].slice(-MAX_NOTES);
    this.store.touch(u);
  }

  /** Vào lại (welcome): gửi các thông báo đang giữ rồi xoá. */
  deliverNotes(conn, uid) {
    const u = this.store.users.get(uid);
    if (!u || !u.notes || !u.notes.length) return;
    conn.send({ t: 'notes', items: u.notes });
    u.notes = [];
    this.store.touch(u);
  }

  /** Giải offline: trận vừa đủ hai người – báo người chơi có tài khoản (mỗi trận một lần). */
  notifyMatchReady(t) {
    if (!t.offline || t.notifyMatch === false || t.status !== 'running') return;
    const st = this.curStage(t);
    if (!st) return;
    for (const m of ST.playable(st)) {
      m.notified = m.notified || [];
      for (const [me, opp] of [[m.a, m.b], [m.b, m.a]]) {
        if (m.notified.includes(me) || !this.store.users.get(me)) continue;
        m.notified.push(me);
        this.pushNote(me, { k: 'tour_match', id: t.id, name: t.name, opp: this.player(t, opp)?.name || '?' });
      }
    }
  }

  /** Giải xong: gửi hạng của mình và nhà vô địch cho người chơi có tài khoản. */
  notifyResults(t) {
    if (t.notifyResults === false) return;
    const champ = t.podium && t.podium[0] && this.player(t, t.podium[0]);
    for (const p of t.players) {
      if (p.withdrawn || !this.store.users.get(p.uid)) continue;
      const i = (t.podium || []).indexOf(p.uid);
      this.pushNote(p.uid, { k: 'tour_result', id: t.id, name: t.name, place: i >= 0 ? i + 1 : null, winner: champ ? champ.name : '' });
    }
  }
}

module.exports = { TourNotes, MAX_NOTES };
