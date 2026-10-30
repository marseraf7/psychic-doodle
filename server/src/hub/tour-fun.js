/*
 * Giải đấu – phần cho người xem (Đợt 10, như Challonge / MyLeague):
 *  - "Ai sẽ thắng?": bình chọn từng trận trước khi trận bắt đầu (đổi được tới lúc đó); trận hiện số phiếu hai bên.
 *  - Dự đoán bục vinh quang trước giờ đấu (vô địch / á quân / hạng ba); giải xong: đúng vị trí 3 điểm, có trên bục
 *    nhưng sai vị trí 1 điểm; bảng xếp hạng người đoán.
 *  - Bình chọn hạng mục sau khi giải xong (trong AWARD_DAYS ngày): Kỳ thủ xuất sắc, Ván đẹp nhất.
 * Chỉ tài khoản đăng nhập; ai xem được giải thì tham gia được. Không ảnh hưởng kết quả thi đấu.
 */
'use strict';
const { E } = require('../msg.js');
const { real } = require('./stages-base.js');

const AWARD_DAYS = 3;
const MAX_PREDICTORS = 5000;
const AWARD_KINDS = ['mvp', 'game'];

class TourFun {
  // ------------------------------------------------------------ Bình chọn từng trận
  on_tourVote(conn, { id, match, pick }) {
    const me = this.requireUser(conn);
    const t = this.findTour(id, me.id);
    if (t.status !== 'running' || !t.st) throw E('tour_vote_closed');
    const m = this.allMatches(t).find((x) => x.id === String(match || ''));
    // Chỉ trận đã rõ hai người, chưa đấu (chưa mở phòng / chưa có kết quả)
    if (!m || m.done || m.room || m.bye || !real(m.a) || !real(m.b)) throw E('tour_vote_closed');
    t.votes = t.votes || {};
    const box = (t.votes[m.id] = t.votes[m.id] || {});
    if (pick === 'a' || pick === 'b') box[me.id] = pick;
    else delete box[me.id];
    this.saveTour(t);
    this.pushTour(t);
  }

  /** Số phiếu hai bên của một trận (matchView gọi): [a, b] hoặc null. */
  voteCount(t, m) {
    const box = t.votes && t.votes[m.id];
    if (!box) return null;
    let a = 0, b = 0;
    for (const v of Object.values(box)) if (v === 'a') a++; else b++;
    return a + b ? [a, b] : null;
  }

  // ------------------------------------------------------------ Dự đoán bục vinh quang
  on_tourPredict(conn, { id, picks }) {
    const me = this.requireUser(conn);
    const t = this.findTour(id, me.id);
    if (t.status !== 'scheduled' && t.status !== 'pending') throw E('tour_predict_closed');
    const ok = new Set(t.players.filter((p) => !p.withdrawn).map((p) => p.uid));
    const list = [...new Set((Array.isArray(picks) ? picks : []).map(String))].filter((u) => ok.has(u)).slice(0, 3);
    t.preds = t.preds || {};
    if (!list.length) delete t.preds[me.id];
    else {
      if (!t.preds[me.id] && Object.keys(t.preds).length >= MAX_PREDICTORS) throw E('too_fast');
      t.preds[me.id] = list;
    }
    this.saveTour(t);
    this.pushTour(t);
  }

  /** Điểm một dự đoán so với bục vinh quang. */
  predScore(pred, podium) {
    let s = 0;
    pred.forEach((u, i) => { if (podium[i] === u) s += 3; else if (podium.slice(0, 3).includes(u)) s += 1; });
    return s;
  }

  // ------------------------------------------------------------ Bình chọn hạng mục cuối giải
  awardOpen(t) {
    return t.status === 'finished' && Date.now() < (t.finishedAt || 0) + AWARD_DAYS * 86400000;
  }

  /** Ván của giải (mã xem lại) để chọn "Ván đẹp nhất": 60 ván gần nhất. */
  awardGames(t) {
    const out = [];
    const name = (u) => this.player(t, u)?.name || '?';
    if (t.format === 'arena') for (const g of t.games || []) { if (g.share) out.push({ share: g.share, label: `${name(g.x)} – ${name(g.o)}` }); }
    else for (const m of this.allMatches(t)) for (const g of m.games || []) if (g.share) out.push({ share: g.share, label: `${name(m.a)} – ${name(m.b)}` });
    return out.slice(-60).reverse();
  }

  on_tourAward(conn, { id, kind, pick }) {
    const me = this.requireUser(conn);
    const t = this.findTour(id, me.id);
    if (!this.awardOpen(t) || !AWARD_KINDS.includes(kind)) throw E('tour_award_closed');
    pick = String(pick || '');
    const valid = kind === 'mvp' ? t.players.some((p) => p.uid === pick) : this.awardGames(t).some((g) => g.share === pick);
    if (!valid) throw E('bad_message');
    t.awards = t.awards || { mvp: {}, game: {} };
    t.awards[kind][me.id] = pick;
    this.saveTour(t);
    this.pushTour(t);
  }

  /** Phần chung: số phiếu từng hạng mục (5 lựa chọn nhiều phiếu nhất), dự đoán (số người, bảng xếp hạng khi xong). */
  funShared(t) {
    const out = { predCount: t.preds ? Object.keys(t.preds).length : 0 };
    if (t.status === 'finished' && t.preds && t.podium) {
      out.predTop = Object.entries(t.preds).map(([uid, p]) => ({ uid, name: this.store.users.get(uid)?.name || '?', score: this.predScore(p, t.podium) }))
        .filter((x) => x.score > 0).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, 20);
    }
    if (t.status === 'finished') {
      out.awardOpen = this.awardOpen(t);
      out.awards = {};
      const games = this.awardGames(t);
      for (const k of AWARD_KINDS) {
        const n = {};
        for (const v of Object.values((t.awards && t.awards[k]) || {})) n[v] = (n[v] || 0) + 1;
        out.awards[k] = Object.entries(n).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([pick, votes]) => ({
          pick, votes, label: k === 'mvp' ? this.player(t, pick)?.name || '?' : (games.find((g) => g.share === pick) || {}).label || pick,
        }));
      }
      if (out.awardOpen) out.awardGames = games;
    }
    return out;
  }

  /** Phần riêng: phiếu của mình (trận, dự đoán, hạng mục). */
  funMine(t, uid) {
    if (!uid) return {};
    const out = {};
    if (t.votes) {
      const mv = {};
      for (const [mid, box] of Object.entries(t.votes)) if (box[uid]) mv[mid] = box[uid];
      out.myVotes = mv;
    }
    if (t.preds && t.preds[uid]) {
      out.myPred = t.preds[uid];
      if (t.status === 'finished' && t.podium) out.myPredScore = this.predScore(t.preds[uid], t.podium);
    }
    if (t.awards) out.myAwards = { mvp: t.awards.mvp[uid] || null, game: t.awards.game[uid] || null };
    return out;
  }
}

module.exports = { TourFun, AWARD_DAYS };
