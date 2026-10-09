/*
 * Thi đấu theo giai đoạn ('bracket'): 1–3 giai đoạn, mỗi giai đoạn một thể thức (logic thuần trong stages.js):
 * loại trực tiếp, nhánh thắng – thua, vòng tròn (chia bảng), hệ Thụy Sĩ. Ví dụ: vòng bảng → playoff.
 * Mỗi trận Bo1/Bo3/Bo5 (ván sau tự đổi bên đi trước). Hạt giống giai đoạn đầu theo Elo hoặc ngẫu nhiên;
 * giai đoạn sau theo thành tích giai đoạn trước. Điểm danh 10 phút trước giờ bắt đầu: ai không điểm danh
 * bị loại khỏi danh sách. Tới lượt đấu mà một người vắng mặt (offline / đang bận ván khác) quá 2 phút thì xử thua.
 * File này nối stages.js với phòng chơi: mở phòng khi trận sẵn sàng, ghi kết quả, chuyển giai đoạn.
 * Phần chung của giải đấu (tạo, đăng ký, xem, huỷ…) nằm ở tournaments.js.
 */
'use strict';
const crypto = require('crypto');
const { E, note } = require('../msg.js');
const { userPid, uidOf } = require('./shared.js');
const ST = require('./stages.js');

class Bracket {
  startBracket(t, now) {
    // Thi đấu theo vòng: chỉ người đã điểm danh (nếu bật điểm danh)
    for (const p of t.players) if (!p.withdrawn && t.checkin && !t.checkinWaived && !p.checkedIn) p.out = 'no_checkin';
    const entrants = this.activePlayers(t);
    if (entrants.length < 2) {
      this.cancelTour(t, 'too_few');
      return;
    }
    for (const p of entrants) p.rating = this.store.users.get(p.uid)?.rating || p.rating;
    if (t.seeding === 'random') {
      for (let i = entrants.length - 1; i > 0; i--) {
        const j = crypto.randomInt(i + 1);
        [entrants[i], entrants[j]] = [entrants[j], entrants[i]];
      }
    } else entrants.sort((a, b) => b.rating - a.rating);
    entrants.forEach((p, i) => { p.seed = i + 1; });
    t.status = 'running';
    t.stage = 0;
    t.st = [ST.buildStage(t.stages[0], 0, entrants.map((p) => p.uid), { seedOf: this.seedOf(t), isActive: (u) => this.isActiveIn(t, u), groups: t.groupPlan })];
    this.saveTour(t);
    this.notifyPlayers(t, 'tour_started', {}, (p) => !p.out);
    this.notifyPlayers(t, 'tour_no_checkin', {}, (p) => p.out === 'no_checkin');
    this.pushTour(t);
    this.runBracket(t, now);
  }

  /** Giải 'knockout' của bản trước = thi đấu theo vòng, 1 vòng loại trực tiếp. */
  upgradeTour(t) {
    if (t.format !== 'knockout') return;
    t.format = 'bracket';
    t.stages = ST.normalizeStages([{ type: 'single', bestOf: t.bestOf, thirdPlace: t.thirdPlace }]);
    // Đang chạy dở theo cách cũ thì không tiếp tục được: huỷ, ghi rõ lý do (trang giải hiện "nâng cấp hệ thống")
    if (t.status === 'running') { t.status = 'cancelled'; t.cancelReason = 'upgrade'; t.finishedAt = Date.now(); }
  }

  allMatches(t) {
    return (t.st || []).flatMap((st) => Object.values(st.matches));
  }

  curStage(t) {
    return t.st ? t.st[t.stage] : null;
  }

  findMatch(t, id) {
    const i = /^s(\d+)/.exec(String(id || ''));
    const st = i && t.st && t.st[Number(i[1])];
    return st && st.matches[id] ? { st, m: st.matches[id] } : null;
  }

  seedOf(t) {
    return (uid) => (this.player(t, uid) && this.player(t, uid).seed) || 999;
  }

  isActiveIn(t, uid) {
    const p = this.player(t, uid);
    return !!(p && !p.withdrawn);
  }

  /** Ghi kết quả một trận (winner: người thắng / null = hoà); xong vòng thì sang vòng sau hoặc kết thúc giải. */
  finishMatch(t, st, m, winner, opts = {}) {
    if (m.done) return;
    m.room = null;
    if (opts.walkover) m.walkover = true;
    ST.recordResult(st, m, winner, { seedOf: this.seedOf(t), double: opts.double, isActive: (u) => this.isActiveIn(t, u) });
    for (const u of [m.a, m.b]) {
      const p = ST.real(u) && this.player(t, u);
      if (p && !p.out && ST.eliminated(st, u)) p.out = 'lost';
    }
    if (st.done && t.status === 'running') this.nextStage(t);
  }

  nextStage(t) {
    const st = this.curStage(t);
    if (t.stage >= t.stages.length - 1) return this.finishTour(t);
    const { seeds, groupOf } = ST.advancers(st, this.seedOf(t));
    const going = new Set(seeds);
    for (const u of st.entrants) {
      const p = this.player(t, u);
      if (p && !going.has(u) && !p.out) p.out = 'not_advanced';
    }
    t.stage++;
    t.st.push(ST.buildStage(t.stages[t.stage], t.stage, seeds, { groupOf, seedOf: this.seedOf(t), isActive: (u) => this.isActiveIn(t, u) }));
    this.notifyPlayers(t, 'tour_advanced', { n: t.stage + 1 }, (p) => going.has(p.uid));
    this.notifyPlayers(t, 'tour_not_advanced', {}, (p) => p.out === 'not_advanced' && st.entrants.includes(p.uid));
    this.saveTour(t);
    this.pushTour(t);
  }

  /** Mở các trận đã sẵn sàng của vòng hiện tại; xử thua người vắng mặt / đã rút. */
  runBracket(t, now) {
    for (let guard = 0; guard < 500 && t.status === 'running'; guard++) {
      const st = this.curStage(t);
      let changed = false;
      for (const m of ST.playable(st)) {
        if (m.room && this.rooms.has(m.room)) continue;
        if (!m.readyAt) m.readyAt = now;
        const pa = this.player(t, m.a), pb = this.player(t, m.b);
        const elim = ST.isElim(st.type);
        const better = (pa.seed || 999) <= (pb.seed || 999) ? m.a : m.b;
        // Người đã rút / bị loại: đối thủ thắng luôn (rút cả hai: vòng loại trực tiếp cho hạt giống cao hơn đi tiếp)
        if (pa.withdrawn || pb.withdrawn) {
          if (pa.withdrawn && pb.withdrawn && !elim) this.finishMatch(t, st, m, null, { double: true, walkover: true });
          else this.finishMatch(t, st, m, pa.withdrawn && !pb.withdrawn ? m.b : !pa.withdrawn ? m.a : better, { walkover: true });
          changed = true;
          break;
        }
        const okA = this.available(m.a), okB = this.available(m.b);
        if (okA && okB) { this.startTourMatch(t, st, m); continue; }
        if (now - m.readyAt < this.T.TOUR_NOSHOW_MS) continue;
        // Quá giờ mà một bên không có mặt: xử thua bên vắng; vắng cả hai thì (loại trực tiếp) hạt giống cao hơn
        // đi tiếp, (vòng tròn / Thụy Sĩ) cả hai cùng thua
        if (okA !== okB) {
          this.send(userPid(okA ? m.b : m.a), note('tour_noshow', { name: t.name }));
          this.finishMatch(t, st, m, okA ? m.a : m.b, { walkover: true });
        } else if (elim) this.finishMatch(t, st, m, better, { walkover: true });
        else this.finishMatch(t, st, m, null, { double: true, walkover: true });
        changed = true;
        break;
      }
      if (changed) { this.saveTour(t); this.pushTour(t); } else break;
    }
  }

  startTourMatch(t, st, m) {
    const pa = this.player(t, m.a), pb = this.player(t, m.b);
    // Ván đầu: ai được đi trước ít hơn thì đi trước (các ván sau trong trận tự đổi bên)
    const aFirst = (pa.firsts || 0) < (pb.firsts || 0) || ((pa.firsts || 0) === (pb.firsts || 0) && crypto.randomInt(2) === 0);
    (aFirst ? pa : pb).firsts = ((aFirst ? pa : pb).firsts || 0) + 1;
    const room = this.openTourRoom(t, 'series', st.cfg.bestOf, m.a, m.b, aFirst, { match: m.id });
    m.room = room.code;
    m.wins = {};
    this.saveTour(t);
    this.pushTour(t);
  }

  /** Người đang có trận loại trực tiếp sẵn sàng đấu (ở giải khác): ưu tiên trận đó, Arena không ghép nữa. */
  koWaiting() {
    const s = new Set();
    for (const t of this.tours.values()) {
      if (t.status !== 'running' || t.format !== 'bracket') continue;
      for (const m of ST.playable(this.curStage(t))) if (!m.room) { s.add(m.a); s.add(m.b); }
    }
    return s;
  }

  // ------------------------------------------------------------ Xếp bảng (như Challonge)
  /** Giai đoạn đầu là vòng tròn thì ban tổ chức được tự xếp người vào bảng trước khi giải bắt đầu. */
  hasGroups(t) {
    return t.format === 'bracket' && t.stages && t.stages[0].type === 'roundrobin';
  }

  /** Người sẽ vào giải nếu bắt đầu lúc này, theo thứ tự hạt giống (Elo). */
  draftSeeds(t) {
    return this.activePlayers(t).map((p) => ({ uid: p.uid, r: this.store.users.get(p.uid)?.rating || p.rating }))
      .sort((a, b) => b.r - a.r).map((x) => x.uid);
  }

  /** Các bảng dự kiến (ban tổ chức xem / sửa trước khi bắt đầu). */
  groupDraft(t) {
    if (!this.hasGroups(t) || !['pending', 'scheduled'].includes(t.status)) return null;
    const groups = ST.drawGroups(t.stages[0], this.draftSeeds(t), t.groupPlan);
    return { manual: !!t.groupPlan, max: ST.MAX_GROUP, groups: groups.map((g) => g.map((u) => this.tourSide(t, u))) };
  }

  /**
   * Ban tổ chức xếp bảng: groups = mảng các bảng (mảng mã người chơi), null = trả về chia tự động.
   * Người đăng ký sau / chưa được xếp sẽ tự vào bảng ít người nhất khi bốc thăm.
   */
  on_tourGroups(conn, { id, groups }) {
    const t = this.requireManager(conn, id);
    if (!this.hasGroups(t)) throw E('tour_no_groups');
    if (!['pending', 'scheduled'].includes(t.status)) throw E('tour_groups_closed');
    if (groups == null) t.groupPlan = null;
    else {
      if (!Array.isArray(groups) || groups.length < 1 || groups.length > ST.MAX_GROUPS) throw E('tour_groups_bad');
      const seen = new Set();
      const plan = groups.map((g) => {
        if (!Array.isArray(g)) throw E('tour_groups_bad');
        if (g.length > ST.MAX_GROUP) throw E('tour_group_too_big', { n: ST.MAX_GROUP });
        return g.map((u) => {
          const p = this.player(t, String(u));
          if (!p || p.withdrawn || seen.has(p.uid)) throw E('tour_groups_bad');
          seen.add(p.uid);
          return p.uid;
        });
      }).filter((g) => g.length);
      if (!plan.length) throw E('tour_groups_bad');
      t.groupPlan = plan;
    }
    this.saveTour(t);
    this.pushTour(t);
  }

  /** Trận chưa xong của người này ở giai đoạn hiện tại. */
  myMatch(t, uid) {
    const cur = this.curStage(t);
    return cur ? Object.values(cur.matches).find((m) => !m.done && (m.a === uid || m.b === uid)) || null : null;
  }

  /**
   * Một ván của trận vừa xong: cập nhật tỉ số; đủ điều kiện thì kết thúc trận.
   * Trả về true nếu trận đã xong (không tự bắt đầu ván tiếp theo trong phòng).
   */
  bracketOnGame(t, room, winUid) {
    const found = this.findMatch(t, room.tour.match);
    if (!found || found.m.done) { room.tourDone = true; return true; }
    const { st, m } = found;
    m.games.push({ share: room.lastShare || null, w: winUid });
    m.wins = { [m.a]: room.score[userPid(m.a)] || 0, [m.b]: room.score[userPid(m.b)] || 0 };
    const bo = st.cfg.bestOf;
    let decided;
    if (room.reason === 'leave' && winUid) decided = winUid; // bỏ trận giữa chừng = thua cả trận
    else if (room.seriesWinner) decided = uidOf(room.seriesWinner);
    else if (!ST.isElim(st.type) && room.gameNo >= bo) {
      // Vòng tròn / Thụy Sĩ: đánh đủ số ván mà chưa ai đủ số thắng: hơn ván thì thắng, bằng thì hoà
      decided = m.wins[m.a] > m.wins[m.b] ? m.a : m.wins[m.b] > m.wins[m.a] ? m.b : null;
    } else if (room.gameNo >= bo * 2) {
      // Loại trực tiếp hoà quá nhiều ván: ai thắng nhiều ván hơn, bằng nhau thì hạt giống cao hơn đi tiếp
      const pa = this.player(t, m.a), pb = this.player(t, m.b);
      decided = m.wins[m.a] > m.wins[m.b] ? m.a : m.wins[m.b] > m.wins[m.a] ? m.b : ((pa.seed || 999) <= (pb.seed || 999) ? m.a : m.b);
    }
    if (decided !== undefined) {
      room.tourDone = true;
      this.finishMatch(t, st, m, decided);
    }
    this.saveTour(t);
    this.pushTour(t);
    return decided !== undefined;
  }

  bracketPodium(t) {
    return ST.podium(this.curStage(t), this.seedOf(t)).slice(0, 4);
  }

  /** Một trận gửi cho client. */
  matchView(t, m) {
    const sd = (u) => (ST.real(u) ? this.tourSide(t, u) : u === ST.BYE ? { bye: true } : null);
    return m && {
      id: m.id, round: m.round, a: sd(m.a), b: sd(m.b), wa: (ST.real(m.a) && m.wins[m.a]) || 0, wb: (ST.real(m.b) && m.wins[m.b]) || 0,
      done: !!m.done, winner: ST.real(m.winner) ? m.winner : null, draw: !!(m.done && m.winner === null && !m.double),
      double: !!m.double, bye: !!m.bye, skipped: !!m.skipped, walkover: !!m.walkover, gf: m.gf || 0,
      live: !!(m.room && !m.done && this.rooms.has(m.room)), games: m.games.map((g) => g.share).filter(Boolean),
    };
  }

  /** Các giai đoạn đã bốc thăm, gửi cho client: nhánh đấu / bảng xếp hạng / các vòng. */
  stageViews(t) {
    const seedOf = this.seedOf(t);
    const table = (rk, adv) => rk.list.map((u, i) => {
      const x = rk.stats[u];
      return { ...this.tourSide(t, u), rank: i + 1, mp: x.mp, w: x.w, d: x.d, l: x.l, gw: x.gw, gl: x.gl, pts: x.pts, bh: x.bh, sb: x.sb, adv: i < adv };
    });
    return (t.st || []).map((st, i) => {
      const M = (id) => this.matchView(t, st.matches[id]);
      const adv = i === t.stages.length - 1 ? 0 : st.cfg.advance || 0;
      const v = { index: i, type: st.type, cfg: st.cfg, done: st.done };
      if (st.type === 'single' || st.type === 'double') {
        v.rounds = st.rounds.map((r) => r.map(M));
        if (st.third) v.third = M(st.third);
        if (st.lrounds) v.lrounds = st.lrounds.map((r) => r.map(M));
        if (st.gf) v.gf = st.gf.map(M);
      } else if (st.type === 'roundrobin') {
        const tabs = ST.standings(st, seedOf);
        v.groups = st.groups.map((g, gi) => ({ name: g.name, rounds: g.rounds.map((r) => r.map(M)), table: table(tabs[gi], adv) }));
      } else {
        v.rounds = st.rounds.map((r) => r.map(M));
        v.table = table(ST.standings(st, seedOf)[0], adv);
        v.totalRounds = st.cfg.rounds;
      }
      return v;
    });
  }
}

module.exports = { Bracket };
