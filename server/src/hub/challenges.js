/*
 * Thách đấu bạn bè (gửi / huỷ / trả lời lời mời, tạo loạt ván), xin hoà, chat nhanh trong phòng.
 * Tách từ rooms.js (phòng chơi, nước đi, kết thúc ván, tính điểm); gộp vào Hub qua hub/index.js.
 */
'use strict';
const crypto = require('crypto');
const { E, note } = require('../msg.js');
const { QUICK, cleanTc, userPid } = require('./shared.js');

class Challenges {
  inviteMsg(inv) {
    return { t: 'invite', invite: { id: inv.id, from: { id: inv.from, name: this.nameOf(inv.from) }, bestOf: inv.bestOf, first: inv.first, timeLimit: inv.timeLimit, clock: inv.clock, opening: inv.opening, rule: inv.rule } };
  }

  dropInvite(inv, reason) {
    if (!this.invites.delete(inv.id)) return;
    clearTimeout(inv.timer);
    this.send(inv.to, { t: 'inviteGone', id: inv.id });
    this.send(inv.from, { t: 'inviteGone', id: inv.id });
    if (reason) this.send(inv.from, note(...reason));
  }

  on_challenge(conn, { to, bestOf, first, timeLimit, clock, opening, rule }) {
    const me = this.requireUser(conn);
    const friend = this.store.users.get(to);
    if (!friend || !me.friends.includes(friend.id)) throw E('challenge_friends_only');
    if (me.blocked.includes(friend.id) || friend.blocked.includes(me.id)) throw E('blocked');
    const toPid = userPid(friend.id);
    if (!this.isOnline(toPid)) throw E('friend_offline', { name: friend.name });
    if (this.roomFor(conn.pid)?.active) throw E('busy_in_game');
    bestOf = [1, 3, 5].includes(Number(bestOf)) ? Number(bestOf) : 1;
    first = ['me', 'them', 'random'].includes(first) ? first : 'random';
    const tc = cleanTc({ timeLimit, clock, opening, rule });
    timeLimit = tc.timeLimit;
    for (const inv of [...this.invites.values()]) if (inv.from === conn.pid) this.dropInvite(inv);
    const inv = { id: crypto.randomBytes(6).toString('hex'), from: conn.pid, to: toPid, bestOf, first, timeLimit, clock: tc.clock, opening: tc.opening, rule: tc.rule };
    inv.timer = setTimeout(() => this.dropInvite(inv, ['invite_no_answer', { name: friend.name }]), this.T.INVITE_TTL_MS);
    inv.timer.unref?.();
    this.invites.set(inv.id, inv);
    this.send(toPid, this.inviteMsg(inv));
    this.send(conn.pid, { t: 'inviteSent', invite: { id: inv.id, to: { id: toPid, name: friend.name }, bestOf, first, timeLimit, clock: inv.clock, opening: inv.opening, rule: inv.rule } });
  }

  on_challengeCancel(conn, { id }) {
    const inv = this.invites.get(id);
    if (inv && inv.from === conn.pid) this.dropInvite(inv);
  }

  on_challengeRespond(conn, { id, accept }) {
    const inv = this.invites.get(id);
    if (!inv || inv.to !== conn.pid) throw E('invite_expired');
    this.dropInvite(inv);
    if (!accept) {
      this.send(inv.from, note('challenge_declined', { name: this.nameOf(conn.pid) }));
      return;
    }
    if (!this.isOnline(inv.from)) throw E('inviter_offline');
    this.leave(inv.from);
    this.leave(inv.to);
    const room = this.makeRoom('series', inv.bestOf, inv.timeLimit, { clock: inv.clock, opening: inv.opening, rule: inv.rule });
    let challengerFirst = inv.first === 'me' ? true : inv.first === 'them' ? false : crypto.randomInt(2) === 0;
    this.enter(room, inv.from, challengerFirst ? 1 : 2);
    this.enter(room, inv.to, challengerFirst ? 2 : 1);
    this.broadcastRoom(room);
    this.notifyFriends(inv.from);
    this.notifyFriends(inv.to);
  }

  on_drawOffer(conn) {
    const room = this.inRoom(conn);
    const res = room.offerDraw(conn.pid);
    if (res === 'pending') return; // đã xin rồi, không làm phiền đối thủ thêm
    if (res === 'offered') {
      const opp = room.opponentOf(conn.pid);
      if (opp) this.send(opp.id, note('draw_offered', { name: this.nameOf(conn.pid) }));
    }
    this.afterChange(room);
  }

  on_drawAnswer(conn, { accept }) {
    const room = this.inRoom(conn);
    const offerer = room.drawOffer;
    room.answerDraw(conn.pid, !!accept);
    if (!accept && offerer) this.send(offerer, note('draw_declined', { name: this.nameOf(conn.pid) }));
    this.afterChange(room);
  }

  /** Câu chat nhanh có sẵn: gửi mã câu, mỗi người tự dịch sang ngôn ngữ của mình. */
  on_quick(conn, { id }) {
    const room = this.inRoom(conn);
    if (!QUICK.includes(id)) throw E('bad_message');
    const now = Date.now();
    if (now - (conn.lastQuick || 0) < 1200) throw E('too_fast');
    conn.lastQuick = now;
    const opp = room.opponentOf(conn.pid);
    if (opp && !this.isBlocked(opp.id, conn.pid)) this.send(opp.id, { t: 'quick', from: conn.pid, id });
  }
}

module.exports = { Challenges };
