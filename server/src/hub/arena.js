/*
 * Giải Arena (học theo Lichess): chơi trong N phút, xong ván là tự được ghép ván mới với người đang chờ
 * có điểm gần mình. Thắng 2 điểm, hoà 1 điểm (hoà dưới 10 nước: 0 điểm), thua 0. Thắng 2 ván liền thì "🔥":
 * ván sau thắng được 4, hoà được 2, cho tới khi hoà hoặc thua. Vào giải muộn vẫn được, nghỉ tạm được.
 * Phần chung của giải đấu (tạo, đăng ký, xem, huỷ…) nằm ở tournaments.js.
 */
'use strict';
const crypto = require('crypto');
const { MIN_RATED_MOVES, userPid } = require('./shared.js');

const KEEP_GAMES = 300; // số ván gần nhất lưu lại để hiện trên trang giải

class Arena {
  startArena(t, now) {
    t.status = 'running';
    t.endsAt = now + t.minutes * 60 * 1000;
    this.saveTour(t);
    this.notifyPlayers(t, 'tour_started');
    this.pushTour(t);
    this.pairArena(t, now);
  }

  /** Mỗi nhịp: còn giờ thì ghép ván, hết giờ thì chờ các ván đang dở xong rồi kết thúc. */
  tickArena(t, now) {
    if (now < t.endsAt) this.pairArena(t, now);
    else if (![...this.rooms.values()].some((r) => r.tour && r.tour.id === t.id && r.active)) this.finishTour(t);
  }

  /** Arena: ghép những người đang rảnh, điểm gần nhau; tránh gặp lại đối thủ vừa đánh nếu còn người khác. */
  pairArena(t, now) {
    const busy = this.koWaiting();
    const waiting = t.players.filter((p) => !p.withdrawn && !p.paused && (p.restUntil || 0) <= now && this.available(p.uid) &&
      !this.inTourGame(t, p.uid) && !busy.has(p.uid));
    if (waiting.length < 2) return;
    waiting.sort((a, b) => b.score - a.score || Math.random() - 0.5);
    while (waiting.length >= 2) {
      const a = waiting.shift();
      let j = waiting.findIndex((b) => b.uid !== a.last && a.uid !== b.last);
      if (j < 0) {
        // Chỉ còn đúng đối thủ vừa gặp: chờ thêm cho có người khác, quá 20 giây thì cho gặp lại
        if (now - Math.max(a.restUntil || 0, waiting[0].restUntil || 0) < this.T.ARENA_REPEAT_MS) continue;
        j = 0;
      }
      const b = waiting.splice(j, 1)[0];
      const aFirst = a.firsts < b.firsts || (a.firsts === b.firsts && crypto.randomInt(2) === 0);
      (aFirst ? a : b).firsts++;
      this.openTourRoom(t, 'room', 1, a.uid, b.uid, aFirst, {});
    }
    this.saveTour(t);
    this.pushTour(t);
  }

  inTourGame(t, uid) {
    const r = this.roomFor(userPid(uid));
    return !!(r && r.tour && r.tour.id === t.id && r.active);
  }

  /** Một ván Arena vừa xong: cộng điểm, chuỗi thắng 🔥, nghỉ vài giây rồi được ghép tiếp. */
  arenaOnGame(t, room, xUid, oUid, winUid) {
    room.tourDone = true;
    const now = Date.now();
    const pts = {};
    for (const uid of [xUid, oUid]) {
      const p = this.player(t, uid);
      if (!p) continue;
      const fire = p.streak >= 2;
      let gained = 0;
      if (!winUid) {
        gained = room.board.moves.length < MIN_RATED_MOVES ? 0 : fire ? 2 : 1;
        p.draws++;
        p.streak = 0;
      } else if (winUid === uid) {
        gained = fire ? 4 : 2;
        p.wins++;
        p.streak++;
      } else {
        p.losses++;
        p.streak = 0;
        if (room.reason === 'leave') p.paused = true; // rời ván giữa chừng = tạm nghỉ
      }
      p.score += gained;
      p.games++;
      p.last = uid === xUid ? oUid : xUid;
      p.restUntil = now + this.T.ARENA_REST_MS; // nghỉ vài giây xem kết quả rồi mới ghép tiếp
      pts[uid] = gained;
    }
    t.games.push({ x: xUid, o: oUid, w: winUid, px: pts[xUid] || 0, po: pts[oUid] || 0, share: room.lastShare || null, at: now });
    if (t.games.length > KEEP_GAMES) t.games.splice(0, t.games.length - KEEP_GAMES);
    this.saveTour(t);
    this.pushTour(t);
    return true;
  }

  arenaPodium(t) {
    return t.players.filter((p) => p.games > 0)
      .sort((a, b) => b.score - a.score || b.wins - a.wins || b.rating - a.rating).slice(0, 3).map((p) => p.uid);
  }
}

module.exports = { Arena };
