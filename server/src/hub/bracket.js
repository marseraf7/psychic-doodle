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
const { normalizeTiebreaks } = require('./stages-tiebreak.js');

class Bracket {
  startBracket(t, now) {
    if (t.teamMatch && !this.prepareTeamMatch(t)) return; // giao hữu CLB: đội hình → người chơi + cặp theo bàn (club-battle.js)
    // Thi đấu theo vòng: chỉ người đã điểm danh (nếu bật điểm danh)
    for (const p of t.players) if (!p.withdrawn && t.checkin && !t.checkinWaived && !p.checkedIn) p.out = 'no_checkin';
    const entrants = this.activePlayers(t);
    if (entrants.length < 2) {
      this.cancelTour(t, 'too_few');
      return;
    }
    for (const p of entrants) p.rating = this.store.users.get(p.uid)?.rating || p.rating;
    t.queue = []; // hàng chờ duyệt / danh sách chờ hết hiệu lực khi giải bắt đầu
    if (t.seeding === 'random') {
      for (let i = entrants.length - 1; i > 0; i--) {
        const j = crypto.randomInt(i + 1);
        [entrants[i], entrants[j]] = [entrants[j], entrants[i]];
      }
    } else if (t.seeding !== 'list') entrants.sort((a, b) => b.rating - a.rating); // 'list': thứ tự đăng ký / thêm
    const seeded = this.applySeedPlan(t, entrants); // hạt giống thủ công của ban tổ chức (tour-manage.js)
    entrants.splice(0, entrants.length, ...seeded);
    entrants.forEach((p, i) => { p.seed = i + 1; });
    t.status = 'running';
    this.tourLog(t, null, 'started', { n: entrants.length });
    t.stage = 0;
    t.st = [ST.buildStage(t.stages[0], 0, entrants.map((p) => p.uid), { seedOf: this.seedOf(t), isActive: (u) => this.isActiveIn(t, u), groups: t.groupPlan, pairs: t.teamMatch && t.teamMatch.pairs, placeBy: t.placeBy })];
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

  /** Hạt giống của người chơi (thấp = mạnh); .rating: Elo lúc bắt đầu giải (tie-break ARO / TPR – stages-tb-calc.js). */
  seedOf(t) {
    const f = (uid) => (this.player(t, uid) && this.player(t, uid).seed) || 999;
    f.rating = (uid) => { const p = this.player(t, uid); return (p && p.rating) || 0; }; // người chơi offline không tài khoản: 0 (bỏ qua)
    return f;
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
    this.notifyPlayers(t, 'tour_not_advanced', {}, (p) => p.out === 'not_advanced' && st.entrants.includes(p.uid));
    // "Dừng lại để xếp nhánh": chờ ban tổ chức kéo thả rồi mới bốc thăm giai đoạn sau (tour-arrange.js)
    if (this.arrangeHold(t, st, seeds, groupOf)) {
      this.notifyPlayers(t, 'tour_arranging', { n: t.stage + 2 }, (p) => going.has(p.uid));
      this.saveTour(t);
      this.pushTour(t);
      return;
    }
    t.stage++;
    t.st.push(ST.buildStage(t.stages[t.stage], t.stage, seeds, { groupOf, seedOf: this.seedOf(t), isActive: (u) => this.isActiveIn(t, u) }));
    this.notifyPlayers(t, 'tour_advanced', { n: t.stage + 1 }, (p) => going.has(p.uid));
    this.saveTour(t);
    this.pushTour(t);
  }

  /** Mở các trận đã sẵn sàng của vòng hiện tại; xử thua người vắng mặt / đã rút. */
  runBracket(t, now) {
    if (t.held) return; // ban tổ chức tạm dừng: không mở trận mới
    if (t.offline) return this.runOffline(t); // trận ngoài đời: chờ ban tổ chức nhập tỉ số (tour-score.js)
    for (let guard = 0; guard < 500 && t.status === 'running'; guard++) {
      const st = this.curStage(t);
      let changed = false;
      for (const m of ST.playable(st)) {
        if (m.hold) continue; // ván mất kết nối chờ ban tổ chức quyết định
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
        // Thời gian chờ vắng mặt: ban tổ chức chọn khi tạo giải (phút), mặc định của máy chủ
        if (now - m.readyAt < (t.noShowMin ? t.noShowMin * 60000 : this.T.TOUR_NOSHOW_MS)) continue;
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
    const carry = m.carry;
    // Trận đánh tiếp sau khi ban tổ chức xử lý ván mất kết nối: giữ tỉ số các ván trước
    const prep = carry && ((room) => {
      for (const u of [m.a, m.b]) room.score[userPid(u)] = carry.wins[u] || 0;
      room.gameNo = carry.games + 1;
    });
    // Người đi trước ván đầu (đánh tiếp sau mất kết nối: giữ như cũ) – tie-break "số ván đi sau"
    if (!carry || !m.first) m.first = aFirst ? m.a : m.b;
    const room = this.openTourRoom(t, 'series', ST.boOf(st, m), m.a, m.b, aFirst, { match: m.id }, prep);
    m.room = room.code;
    m.wins = carry ? { ...carry.wins } : {};
    m.carry = null;
    this.saveTour(t);
    this.pushTour(t);
  }

  /** Người đang có trận loại trực tiếp sẵn sàng đấu (ở giải khác): ưu tiên trận đó, Arena không ghép nữa. */
  koWaiting() {
    const s = new Set();
    for (const t of this.tours.values()) {
      if (t.status !== 'running' || t.format !== 'bracket') continue;
      for (const m of ST.playable(this.curStage(t))) if (!m.room && !m.hold) { s.add(m.a); s.add(m.b); }
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
    const list = this.activePlayers(t).map((p) => ({ uid: p.uid, r: this.store.users.get(p.uid)?.rating || p.rating }));
    if (t.seeding !== 'list') list.sort((a, b) => b.r - a.r); // 'list': thứ tự đăng ký / thêm (như khi bốc thăm)
    return this.applySeedPlan(t, list).map((x) => x.uid); // hạt giống xếp tay (như startBracket)
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
    const t = this.requireManager(conn, id, 'players');
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
    const wins = { [m.a]: room.score[userPid(m.a)] || 0, [m.b]: room.score[userPid(m.b)] || 0 };
    // Thua vì mất kết nối: tạm dừng trận, chờ ban tổ chức công nhận / huỷ kết quả / cho đấu lại (disputes.js)
    if (room.reason === 'timeout' && winUid) {
      const loser = winUid === m.a ? m.b : m.a;
      const prev = { ...wins, [winUid]: Math.max(0, wins[winUid] - 1) };
      m.hold = { w: winUid, l: loser, share: room.lastShare || null, prev, after: wins, gameNo: room.gameNo };
      m.wins = prev;
      m.room = null;
      room.tourDone = true;
      this.openDispute(t, { kind: 'bracket', match: m.id, w: winUid, l: loser, share: room.lastShare || null,
        deadline: Date.now() + this.T.TOUR_DISPUTE_MS });
      for (const uid of [m.a, m.b]) this.send(userPid(uid), note('tour_dispute_wait', { name: t.name }));
      this.saveTour(t);
      this.pushTour(t);
      return true;
    }
    m.games.push({ share: room.lastShare || null, w: winUid, ...(winUid === null ? { draw: true } : {}) });
    m.wins = wins;
    // Bỏ trận giữa chừng (bấm rời phòng) = thua cả trận
    const decided = room.reason === 'leave' && winUid ? winUid : this.decideMatch(t, st, m, room.gameNo);
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

  /** Dải phong độ (như MyLeague): 5 kết quả gần nhất của từng người trong giai đoạn – W thắng, D hoà, L thua (vắng cả hai: thua). */
  formStrip(st) {
    const by = new Map();
    const list = Object.values(st.matches).filter((m) => m.done && !m.bye && ST.real(m.a) && ST.real(m.b)).sort((a, b) => a.round - b.round);
    for (const m of list) {
      for (const u of [m.a, m.b]) {
        const r = m.double ? 'L' : m.winner === null ? 'D' : m.winner === u ? 'W' : 'L';
        by.set(u, ((by.get(u) || '') + r).slice(-5));
      }
    }
    return by;
  }

  /** Một trận gửi cho client (st: giai đoạn của trận – để biết Bo riêng của bán kết / chung kết). */
  matchView(t, m, st) {
    const bo = st && m ? ST.boOf(st, m) : 0;
    const sd = (u) => (ST.real(u) ? this.tourSide(t, u) : u === ST.BYE ? { bye: true } : null);
    return m && {
      id: m.id, round: m.round, a: sd(m.a), b: sd(m.b), wa: (ST.real(m.a) && m.wins[m.a]) || 0, wb: (ST.real(m.b) && m.wins[m.b]) || 0,
      done: !!m.done, winner: ST.real(m.winner) ? m.winner : null, draw: !!(m.done && m.winner === null && !m.double),
      double: !!m.double, bye: !!m.bye, skipped: !!m.skipped, walkover: !!m.walkover, gf: m.gf || 0, held: !!m.hold,
      bo: st && bo !== st.cfg.bestOf ? bo : 0, split: !!m.split,
      sets: m.sets || null, extra: m.extra || null, override: !!m.override, quick: !!m.quick, // tỉ số từng set (giải offline), ghi đè, chỉ báo người thắng
      votes: this.voteCount(t, m), // "Ai sẽ thắng?" – số phiếu hai bên (tour-fun.js)
      att: m.att && m.att.length ? this.attView(m) : null, // đính kèm của trận (tour-opts.js)
      live: !!(m.room && !m.done && this.rooms.has(m.room)), room: m.room && !m.done && this.rooms.has(m.room) ? m.room : null, games: m.games.map((g) => g.share).filter(Boolean),
    };
  }

  /** Các giai đoạn đã bốc thăm, gửi cho client: nhánh đấu / bảng xếp hạng / các vòng. */
  stageViews(t) {
    const seedOf = this.seedOf(t);
    // form: dải phong độ của giai đoạn (formStrip) – uid → 'WLD' (5 trận gần nhất, cũ → mới)
    // tb: giá trị các tie-break đã chọn của giai đoạn (cùng thứ tự cfg.tiebreaks; đối đầu: null)
    const table = (rk, adv, form, tbs) => rk.list.map((u, i) => {
      const x = rk.stats[u];
      return { ...this.tourSide(t, u), rank: i + 1, mp: x.mp, w: x.w, d: x.d, l: x.l, gw: x.gw, gl: x.gl, pts: x.pts, bh: x.bh, mbh: x.mbh, sb: x.sb,
        tb: tbs.map((k) => ST.tbValue(k, x)), adv: i < adv, form: form.get(u) || '' };
    });
    return (t.st || []).map((st, i) => {
      const M = (id) => this.matchView(t, st.matches[id], st);
      const adv = i === t.stages.length - 1 ? 0 : st.cfg.advance || 0;
      const v = { index: i, type: st.type, cfg: st.cfg, done: st.done };
      if (st.type === 'single' || st.type === 'double') {
        // Split: vòng 1 nhánh thắng không đấu (hạt giống cao vào thẳng vòng 2) nên không hiện
        v.rounds = (st.cfg.split ? st.rounds.slice(1) : st.rounds).map((r) => r.map(M));
        if (st.cfg.split) v.split = true;
        if (st.third) v.third = M(st.third);
        // Trận xếp hạng: các nhánh phân hạng 5–8, 9–16… (base = hạng cao nhất của nhánh)
        if (st.places && st.places.length) v.places = st.places.map((p) => ({ base: p.base, size: p.n || 2 << (p.rounds.length - 1), rounds: p.rounds.map((r) => r.map(M)) }));
        if (st.lrounds) v.lrounds = st.lrounds.map((r) => r.map(M));
        if (st.gf) v.gf = st.gf.map(M);
      } else if (st.type === 'roundrobin') {
        const tabs = ST.standings(st, seedOf), form = this.formStrip(st);
        v.groups = st.groups.map((g, gi) => ({ name: g.name, rounds: g.rounds.map((r) => r.map(M)), table: table(tabs[gi], adv, form, normalizeTiebreaks(st.cfg.tiebreaks, st.type)) }));
      } else {
        v.rounds = st.rounds.map((r) => r.map(M));
        v.table = table(ST.standings(st, seedOf)[0], adv, this.formStrip(st), normalizeTiebreaks(st.cfg.tiebreaks, st.type)); // giải cũ chưa lưu danh sách: mặc định
        v.totalRounds = st.cfg.rounds;
      }
      return v;
    });
  }
}

module.exports = { Bracket };
