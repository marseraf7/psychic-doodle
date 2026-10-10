/*
 * Chống bỏ ván (học ý tưởng "playban" của Lichess, không chép mã):
 *  - Mỗi ván ở phòng gặp người lạ (tìm nhanh, phòng công khai) ghi lại kết quả "cư xử" của từng người:
 *      g = bình thường · a = bấm huỷ / rời phòng trước khi ván quá 1 nước · n = không đi nước đầu kịp
 *      r = bỏ đi giữa ván (rời phòng, mất kết nối quá lâu).
 *  - Giữ 20 kết quả gần nhất. Điểm xấu: a, n = 0.8; r = 1. Điểm xấu ≥ max(3, 0.4 × số ván) thì bị cấm tìm trận
 *    (và vào phòng công khai) tạm thời: 10 phút, mỗi lần bị cấm trong 48 giờ trước đó thì × 3; tài khoản mới
 *    (dưới 3 ngày) hoặc khách thì × 2; tối đa 3 ngày. Bị cấm xong thì xoá danh sách kết quả để làm lại từ đầu.
 *  - Người hay bỏ ván được ghép với nhau trước (trừ khi đã chờ quá 20 giây) – xem matchmaking.js.
 * Tài khoản: lưu trong u.play; khách: giữ trong bộ nhớ (tối đa 20.000 khách).
 */
'use strict';
const { E, note } = require('../msg.js');
const { uidOf } = require('./shared.js');

const KEEP = 20;
const WEIGHT = { a: 0.8, n: 0.8, r: 1 };
const BASE_MIN = 10;
const MAX_MIN = 3 * 24 * 60;
const DAY = 24 * 3600 * 1000;
const MAX_GUESTS = 20000;

class Playban {
  /** Bản ghi cư xử của người chơi { o: 'ggar…', bans: [{ at, mins }] }. */
  playRec(pid) {
    const uid = uidOf(pid);
    if (uid) {
      const u = this.store.users.get(uid);
      if (!u) return null;
      if (!u.play) u.play = { o: '', bans: [] };
      return u.play;
    }
    const m = this.guestPlay || (this.guestPlay = new Map());
    let rec = m.get(pid);
    if (!rec) {
      rec = { o: '', bans: [] };
      m.set(pid, rec);
      if (m.size > MAX_GUESTS) m.delete(m.keys().next().value);
    }
    return rec;
  }

  /** Ghi kết quả cư xử: 'g' | 'a' | 'n' | 'r'. */
  recordOutcome(pid, code, now = Date.now()) {
    const rec = this.playRec(pid);
    if (!rec) return;
    rec.o = (rec.o + code).slice(-KEEP);
    if (code !== 'g') this.maybeBan(pid, rec, now);
    const u = uidOf(pid) && this.store.users.get(uidOf(pid));
    if (u) this.store.touch(u);
  }

  maybeBan(pid, rec, now) {
    let bad = 0;
    for (const c of rec.o) bad += WEIGHT[c] || 0;
    if (bad < Math.max(3, 0.4 * rec.o.length)) return;
    const recent = rec.bans.filter((b) => now - b.at < 2 * DAY).length;
    const u = uidOf(pid) && this.store.users.get(uidOf(pid));
    const fresh = !u || !u.created || now - u.created < 3 * DAY;
    const mins = Math.min(MAX_MIN, BASE_MIN * 3 ** recent * (fresh ? 2 : 1));
    rec.bans = [...rec.bans.filter((b) => now - b.at < 7 * DAY), { at: now, mins }].slice(-10);
    rec.o = '';
    this.dequeue(pid);
    this.send(pid, note('playban', { n: mins }));
    this.send(pid, { t: 'me', me: this.meView(pid) });
  }

  /** ms còn lại của lệnh cấm (0 = không bị cấm). */
  playbanLeft(pid, now = Date.now()) {
    const uid = uidOf(pid);
    const rec = uid ? this.store.users.get(uid)?.play : this.guestPlay?.get(pid);
    const last = rec && rec.bans[rec.bans.length - 1];
    return last ? Math.max(0, last.at + last.mins * 60000 - now) : 0;
  }

  checkPlayban(pid) {
    const ms = this.playbanLeft(pid);
    if (ms > 0) throw E('playban', { n: Math.ceil(ms / 60000) });
  }

  /** Người có bỏ ván gần đây (trong 10 ván gần nhất) – ghép với nhau. */
  isSitter(pid) {
    const uid = uidOf(pid);
    const rec = uid ? this.store.users.get(uid)?.play : this.guestPlay?.get(pid);
    return !!rec && /[anr]/.test(rec.o.slice(-10));
  }

  /** Ván ở phòng gặp người lạ vừa xong: ghi cư xử của 2 người. */
  recordRoomOutcomes(room) {
    if (!room.firstMoveMs || room.tour) return;
    for (const p of room.players) {
      let code = 'g';
      if (room.reason === 'abort') code = room.abortedBy === p.id ? (room.noPlay ? 'n' : 'a') : null;
      else if ((room.reason === 'leave' || room.reason === 'timeout') && room.seats[room.winner] !== p.id) code = 'r';
      if (code) this.recordOutcome(p.id, code);
    }
  }
}

module.exports = { Playban };
