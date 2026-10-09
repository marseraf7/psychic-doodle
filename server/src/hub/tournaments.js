/*
 * Giải đấu – kết hợp Arena của Lichess và nhánh loại trực tiếp của Challonge.
 *
 * Vòng đời: pending (chờ quản trị viên duyệt) → scheduled (mở đăng ký) → running → finished
 *           (hoặc rejected / cancelled). Giải lưu trong SQLite nên máy chủ khởi động lại vẫn chạy tiếp.
 *
 * Arena: chơi trong N phút. Xong ván là tự được ghép ván mới với người đang chờ có điểm gần mình.
 *   Thắng 2 điểm, hoà 1 điểm (hoà dưới 10 nước: 0 điểm), thua 0. Thắng 2 ván liền thì "🔥":
 *   ván sau thắng được 4, hoà được 2, cho tới khi hoà hoặc thua. Vào giải muộn vẫn được, nghỉ tạm được.
 * Loại trực tiếp: mỗi cặp đấu Bo1/Bo3/Bo5 (ván sau tự đổi bên đi trước). Xếp hạt giống theo Elo hoặc
 *   ngẫu nhiên; thiếu người thì hạt giống cao được miễn đấu. Có thể thêm trận tranh hạng 3. Điểm danh
 *   (check-in) 10 phút trước giờ bắt đầu: ai không điểm danh bị loại khỏi danh sách.
 *   Tới lượt đấu mà một người không có mặt (offline / đang bận ván khác) quá 2 phút thì xử thua.
 *
 * Bắt buộc có giới hạn thời gian mỗi nước để giải không bị kéo dài.
 */
'use strict';
const crypto = require('crypto');
const { DRAW } = require('../room.js');
const { E, note } = require('../msg.js');
const { MIN_RATED_MOVES, cleanText, cleanName, userPid, uidOf } = require('./shared.js');

const FORMATS = ['arena', 'knockout'];
const TOUR_TIME_LIMITS = [10, 20, 30];
const ARENA_MINUTES = [15, 20, 30, 45, 60, 90, 120];
const ACCESS = ['public', 'link', 'club'];
const MAX_ACTIVE_TOURS_PER_USER = 3;
const MAX_START_DAYS = 30;
const KEEP_GAMES = 300;

/** Thứ tự hạt giống trong nhánh đấu: 1 gặp hạt giống cuối, 1 và 2 chỉ gặp nhau ở chung kết. */
function seedOrder(size) {
  let o = [1];
  while (o.length < size) {
    const n = o.length * 2;
    o = o.flatMap((s) => [s, n + 1 - s]);
  }
  return o;
}

class Tournaments {
  loadTours() {
    this.tours = new Map();
    const now = Date.now();
    for (const t of this.store.loadTours()) {
      // Máy chủ khởi động lại khi giải đang chạy: các ván dở dang bị mất, đấu lại từ đầu
      if (t.status === 'running' && t.format === 'knockout') {
        for (const m of this.allMatches(t)) {
          if (m.room && !m.winner) { m.room = null; m.wins = {}; m.readyAt = now; }
        }
      }
      this.tours.set(t.id, t);
    }
    this.tourTimer = setInterval(() => this.tourTick(), this.T.TOUR_TICK_MS);
    this.tourTimer.unref?.();
  }

  saveTour(t) {
    this.store.saveTour(t);
  }

  allMatches(t) {
    return t.rounds ? [...t.rounds.flat(), ...(t.third ? [t.third] : [])] : [];
  }

  player(t, uid) {
    return t.players.find((p) => p.uid === uid) || null;
  }

  activePlayers(t) {
    return t.players.filter((p) => !p.withdrawn && !p.out);
  }

  canSeeTour(t, uid) {
    if (t.creator === uid || this.isAdmin(uid) || (uid && this.player(t, uid))) return true;
    if (t.status === 'pending' || t.status === 'rejected') return false;
    if (t.access === 'club') {
      const c = this.clubs.get(t.club);
      return !!(c && uid && c.members[uid]);
    }
    return true; // 'public' và 'link' (giải 'link' không hiện trong danh sách, nhưng mở được bằng link)
  }

  canManageTour(t, uid) {
    if (!uid) return false;
    if (t.creator === uid || this.isAdmin(uid)) return true;
    const c = t.club && this.clubs.get(t.club);
    return !!(c && this.isOfficer(c, uid));
  }

  findTour(id, uid) {
    const t = this.tours.get(String(id || ''));
    if (!t || !this.canSeeTour(t, uid)) throw E('tour_not_found');
    return t;
  }

  /** Bước điểm danh: từ 10 phút trước giờ bắt đầu (chỉ giải loại trực tiếp có bật điểm danh). */
  inCheckin(t, now = Date.now()) {
    return t.status === 'scheduled' && t.checkin && now >= t.startsAt - this.T.TOUR_CHECKIN_MS;
  }

  // ------------------------------------------------------------ Thông tin gửi cho client
  tourSummary(t, uid) {
    const c = t.club && this.clubs.get(t.club);
    const champ = t.podium && t.podium[0] && this.player(t, t.podium[0]);
    return {
      id: t.id, name: t.name, format: t.format, status: t.status, startsAt: t.startsAt, endsAt: t.endsAt || null,
      minutes: t.minutes || null, timeLimit: t.timeLimit, bestOf: t.bestOf || 1, rated: t.rated, access: t.access,
      club: c ? { id: c.id, name: c.name } : null, count: t.players.filter((p) => !p.withdrawn).length,
      maxPlayers: t.maxPlayers, creator: this.store.users.get(t.creator)?.name || '?',
      joined: !!(uid && this.player(t, uid) && !this.player(t, uid).withdrawn), checkin: this.inCheckin(t),
      winner: champ ? champ.name : null,
    };
  }

  tourView(t, uid) {
    const me = uid && this.player(t, uid);
    const live = new Set();
    for (const r of this.rooms.values()) {
      if (r.tour && r.tour.id === t.id && r.active) for (const p of r.players) live.add(uidOf(p.id));
    }
    const pv = (p) => p && {
      uid: p.uid, name: p.name, rating: this.store.users.get(p.uid)?.rating || p.rating, seed: p.seed || null,
      score: p.score, wins: p.wins, draws: p.draws, losses: p.losses, games: p.games, streak: p.streak, fire: p.streak >= 2,
      paused: !!p.paused, withdrawn: !!p.withdrawn, out: p.out || null, checkedIn: !!p.checkedIn,
      online: this.isOnline(userPid(p.uid)), playing: live.has(p.uid),
    };
    const side = (u) => (u ? { uid: u, name: this.player(t, u)?.name || '?', seed: this.player(t, u)?.seed || null } : null);
    const mv = (m) => m && {
      id: m.id, a: side(m.a), b: side(m.b), wa: (m.a && m.wins[m.a]) || 0, wb: (m.b && m.wins[m.b]) || 0,
      winner: m.winner, bye: !!m.bye, walkover: !!m.walkover, live: !!(m.room && !m.winner && this.rooms.has(m.room)),
      games: m.games.map((g) => g.share).filter(Boolean),
    };
    let players = t.players.filter((p) => !p.withdrawn || p.games).map(pv);
    if (t.format === 'arena') players.sort((a, b) => b.score - a.score || b.wins - a.wins || b.rating - a.rating);
    else players.sort((a, b) => (a.seed || 999) - (b.seed || 999) || b.rating - a.rating);
    const myMatch = me && t.format === 'knockout' ? this.allMatches(t).find((m) => !m.winner && (m.a === uid || m.b === uid)) : null;
    return {
      ...this.tourSummary(t, uid),
      desc: t.desc, thirdPlace: !!t.thirdPlace, seeding: t.seeding, checkinEnabled: !!t.checkin,
      checkinAt: t.checkin ? t.startsAt - this.T.TOUR_CHECKIN_MS : null, startedAt: t.startedAt || null, finishedAt: t.finishedAt || null,
      reviewNote: t.creator === uid || this.isAdmin(uid) ? t.reviewNote || '' : '', cancelReason: t.cancelReason || '',
      canManage: this.canManageTour(t, uid), canJoin: this.canJoinTour(t, uid),
      me: me ? { checkedIn: !!me.checkedIn, paused: !!me.paused, withdrawn: !!me.withdrawn, out: me.out || null } : null,
      players, rounds: t.rounds ? t.rounds.map((r) => r.map(mv)) : null, third: mv(t.third),
      myMatch: myMatch ? mv(myMatch) : null,
      podium: (t.podium || []).map((u) => side(u)),
      games: t.format === 'arena' ? t.games.slice(-30).reverse().map((g) => ({
        x: side(g.x), o: side(g.o), w: g.w, px: g.px, po: g.po, share: g.share || null,
      })) : null,
      now: Date.now(),
    };
  }

  /** Người đang mở trang giải nhận bản mới (gom thay đổi ~300ms). */
  pushTour(t) {
    if (!this.tourPushes) this.tourPushes = new Set();
    this.tourPushes.add(t.id);
    if (this.tourPushTimer || this.closed) return;
    this.tourPushTimer = setTimeout(() => {
      this.tourPushTimer = null;
      if (this.closed) return;
      const ids = this.tourPushes;
      this.tourPushes = new Set();
      for (const set of this.byPid.values()) {
        for (const conn of set) {
          if (!conn.watchTour || !ids.has(conn.watchTour)) continue;
          const tt = this.tours.get(conn.watchTour);
          const uid = uidOf(conn.pid);
          conn.send({ t: 'tour', id: conn.watchTour, tour: tt && this.canSeeTour(tt, uid) ? this.tourView(tt, uid) : null });
        }
      }
    }, this.T.TOUR_PUSH_MS);
    this.tourPushTimer.unref?.();
  }

  notifyPlayers(t, code, args = {}, filter = () => true) {
    for (const p of t.players) if (!p.withdrawn && filter(p)) this.send(userPid(p.uid), note(code, { name: t.name, ...args }));
  }

  // ------------------------------------------------------------ Tạo / xem / đăng ký
  on_tourCreate(conn, o) {
    const me = this.requireUser(conn);
    const name = cleanName(o.name).slice(0, 60);
    if (name.length < 3) throw E('tour_name_short');
    const format = FORMATS.includes(o.format) ? o.format : 'arena';
    const timeLimit = TOUR_TIME_LIMITS.includes(Number(o.timeLimit)) ? Number(o.timeLimit) : 20;
    const startsAt = Number(o.startsAt);
    const now = Date.now();
    if (!Number.isFinite(startsAt) || startsAt < now + 60 * 1000 || startsAt > now + MAX_START_DAYS * 86400000) throw E('tour_bad_start');
    const access = ACCESS.includes(o.access) ? o.access : 'public';
    let club = null;
    if (access === 'club') {
      const c = this.clubs.get(o.club);
      if (!c || c.status !== 'approved' || !this.isOfficer(c, me.id)) throw E('tour_club_officers');
      club = c.id;
    }
    const active = [...this.tours.values()].filter((t) => t.creator === me.id && ['pending', 'scheduled', 'running'].includes(t.status));
    if (active.length >= MAX_ACTIVE_TOURS_PER_USER) throw E('tour_limit', { n: MAX_ACTIVE_TOURS_PER_USER });
    const ko = format === 'knockout';
    const maxPlayers = Math.max(ko ? 4 : 2, Math.min(ko ? 64 : 200, Math.floor(Number(o.maxPlayers)) || (ko ? 16 : 100)));
    const admin = this.isAdmin(me.id);
    const t = {
      id: crypto.randomBytes(5).toString('hex'), name, desc: cleanText(o.desc, 1000), format, creator: me.id,
      status: admin ? 'scheduled' : 'pending', created: now, startsAt, timeLimit, rated: o.rated !== false,
      access, club, maxPlayers,
      minutes: ko ? null : (ARENA_MINUTES.includes(Number(o.minutes)) ? Number(o.minutes) : 30),
      bestOf: ko ? ([1, 3, 5].includes(Number(o.bestOf)) ? Number(o.bestOf) : 3) : 1,
      thirdPlace: ko && o.thirdPlace !== false, seeding: o.seeding === 'random' ? 'random' : 'rating',
      checkin: ko && o.checkin !== false, players: [], games: [],
    };
    this.tours.set(t.id, t);
    this.saveTour(t);
    conn.send({ t: 'tourCreated', id: t.id, status: t.status });
    if (!admin) this.notifyAdmins(name);
  }

  /** Danh sách giải: đang diễn ra, sắp tới, đã xong (giải 'link' chỉ hiện với người liên quan). */
  on_tourList(conn) {
    const uid = uidOf(conn.pid);
    const items = [];
    for (const t of this.tours.values()) {
      if (!this.canSeeTour(t, uid)) continue;
      const mine = uid && (t.creator === uid || this.player(t, uid));
      if (t.access === 'link' && !mine) continue;
      if ((t.status === 'pending' || t.status === 'rejected') && !mine) continue;
      items.push(this.tourSummary(t, uid));
    }
    const rank = { running: 0, scheduled: 1, pending: 2, finished: 3, cancelled: 4, rejected: 5 };
    items.sort((a, b) => rank[a.status] - rank[b.status] ||
      (a.status === 'finished' || a.status === 'cancelled' ? b.startsAt - a.startsAt : a.startsAt - b.startsAt));
    conn.send({ t: 'tourList', items: items.slice(0, 100), now: Date.now() });
  }

  on_tourGet(conn, { id }) {
    const uid = uidOf(conn.pid);
    const t = this.findTour(id, uid);
    conn.watchTour = t.id;
    conn.send({ t: 'tour', id: t.id, tour: this.tourView(t, uid) });
  }

  on_tourUnwatch(conn) {
    conn.watchTour = null;
  }

  canJoinTour(t, uid) {
    if (!uid || (t.status !== 'scheduled' && !(t.status === 'running' && t.format === 'arena' && Date.now() < t.endsAt))) return false;
    if (t.access === 'club') {
      const c = this.clubs.get(t.club);
      if (!c || !c.members[uid]) return false;
    }
    const p = this.player(t, uid);
    if (p && !p.withdrawn) return false;
    return t.players.filter((x) => !x.withdrawn).length < t.maxPlayers;
  }

  on_tourJoin(conn, { id }) {
    const me = this.requireUser(conn);
    const t = this.findTour(id, me.id);
    if (t.access === 'club' && !this.clubs.get(t.club)?.members[me.id]) throw E('tour_club_only');
    if (!this.canJoinTour(t, me.id)) {
      const p = this.player(t, me.id);
      if (p && !p.withdrawn) return;
      throw E(t.players.filter((x) => !x.withdrawn).length >= t.maxPlayers ? 'tour_full' : 'tour_closed');
    }
    let p = this.player(t, me.id);
    if (p) { p.withdrawn = false; p.paused = false; } else {
      p = { uid: me.id, name: me.name, rating: me.rating, joined: Date.now(), score: 0, wins: 0, draws: 0, losses: 0, games: 0, streak: 0, firsts: 0 };
      t.players.push(p);
    }
    // Đăng ký trong lúc điểm danh = điểm danh luôn
    if (this.inCheckin(t)) p.checkedIn = true;
    this.saveTour(t);
    this.pushTour(t);
    conn.send(note('tour_joined', { name: t.name }));
  }

  /** Rút khỏi giải. Đang diễn ra: Arena = nghỉ hẳn (giữ điểm); loại trực tiếp = xử thua trận còn lại. */
  on_tourLeave(conn, { id }) {
    const me = this.requireUser(conn);
    const t = this.findTour(id, me.id);
    this.withdraw(t, me.id);
  }

  withdraw(t, uid, kicked) {
    const p = this.player(t, uid);
    if (!p || p.withdrawn) return;
    if (t.status === 'scheduled' || t.status === 'pending') {
      t.players = t.players.filter((x) => x !== p);
    } else if (t.status === 'running') {
      p.withdrawn = true;
      if (kicked) p.out = 'kicked';
      const r = this.roomFor(userPid(uid));
      // Đang đánh ván của giải: rời phòng = xử thua (Arena tính ván thua, loại trực tiếp thua cả trận)
      if (r && r.tour && r.tour.id === t.id && r.active) this.leave(userPid(uid));
      if (t.format === 'knockout') this.tourTick();
    } else return;
    this.saveTour(t);
    this.pushTour(t);
  }

  on_tourCheckin(conn, { id }) {
    const me = this.requireUser(conn);
    const t = this.findTour(id, me.id);
    const p = this.player(t, me.id);
    if (!p || p.withdrawn) throw E('tour_not_joined');
    if (!this.inCheckin(t)) throw E('tour_checkin_closed');
    p.checkedIn = true;
    this.saveTour(t);
    this.pushTour(t);
  }

  /** Arena: tạm nghỉ (không được ghép ván mới) / chơi tiếp. */
  on_tourPause(conn, { id, paused }) {
    const me = this.requireUser(conn);
    const t = this.findTour(id, me.id);
    const p = this.player(t, me.id);
    if (!p || p.withdrawn || t.format !== 'arena') throw E('tour_not_joined');
    p.paused = !!paused;
    this.saveTour(t);
    this.pushTour(t);
  }

  // ------------------------------------------------------------ Ban tổ chức
  requireManager(conn, id) {
    const me = this.requireUser(conn);
    const t = this.findTour(id, me.id);
    if (!this.canManageTour(t, me.id)) throw E('tour_managers_only');
    return t;
  }

  /** Bắt đầu ngay (không chờ tới giờ). */
  on_tourStart(conn, { id }) {
    const t = this.requireManager(conn, id);
    if (t.status !== 'scheduled') throw E('tour_cannot_start');
    // Bắt đầu sớm trước giờ điểm danh: coi như mọi người đã đăng ký đều điểm danh
    if (t.checkin && !this.inCheckin(t)) t.checkinWaived = true;
    this.startTour(t);
  }

  on_tourCancel(conn, { id }) {
    const t = this.requireManager(conn, id);
    if (!['pending', 'scheduled', 'running'].includes(t.status)) throw E('tour_cannot_cancel');
    this.cancelTour(t, 'organizer');
  }

  on_tourKick(conn, { id, uid }) {
    const t = this.requireManager(conn, id);
    if (!this.player(t, uid)) throw E('player_not_found');
    this.withdraw(t, uid, true);
    this.send(userPid(uid), note('tour_kicked', { name: t.name }));
  }

  cancelTour(t, reason) {
    const wasPending = t.status === 'pending';
    t.status = 'cancelled';
    t.cancelReason = reason;
    t.finishedAt = Date.now();
    // Ván của giải đang dở vẫn chơi nốt nhưng không tính vào giải nữa
    for (const r of this.rooms.values()) if (r.tour && r.tour.id === t.id) r.tour.cancelled = true;
    this.saveTour(t);
    this.pushTour(t);
    this.notifyPlayers(t, 'tour_cancelled');
    if (wasPending) this.notifyAdmins();
  }

  // ------------------------------------------------------------ Vận hành
  tourTick() {
    if (this.closed) return;
    const now = Date.now();
    for (const t of this.tours.values()) {
      if (t.status === 'scheduled') {
        if (this.inCheckin(t, now) && !t.checkinNotified) {
          t.checkinNotified = true;
          this.saveTour(t);
          this.notifyPlayers(t, 'tour_checkin_open');
          this.pushTour(t);
        }
        if (now >= t.startsAt) this.startTour(t);
      } else if (t.status === 'running') {
        if (t.format === 'arena') {
          if (now < t.endsAt) this.pairArena(t, now);
          else if (![...this.rooms.values()].some((r) => r.tour && r.tour.id === t.id && r.active)) this.finishTour(t);
        } else this.runKnockout(t, now);
      }
    }
  }

  /** Người chơi rảnh: online và không đang đánh dở ván nào. */
  available(uid) {
    const pid = userPid(uid);
    if (!this.isOnline(pid)) return false;
    const r = this.roomFor(pid);
    return !r || r.tourDone || (!r.active && !r.awaitingNextGame);
  }

  startTour(t) {
    const now = Date.now();
    t.startedAt = now;
    if (t.format === 'arena') {
      t.status = 'running';
      t.endsAt = now + t.minutes * 60 * 1000;
      this.saveTour(t);
      this.notifyPlayers(t, 'tour_started');
      this.pushTour(t);
      this.pairArena(t, now);
      return;
    }
    // Loại trực tiếp: chỉ người đã điểm danh (nếu bật điểm danh)
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
    let size = 2;
    while (size < entrants.length) size *= 2;
    const order = seedOrder(size);
    const nRounds = Math.log2(size);
    const match = (id) => ({ id, a: null, b: null, wins: {}, games: [], winner: null, room: null, readyAt: null });
    t.rounds = [];
    for (let r = 0; r < nRounds; r++) t.rounds.push(Array.from({ length: size >> (r + 1) }, (_, i) => match(`r${r}m${i}`)));
    t.third = t.thirdPlace && size >= 4 ? match('third') : null;
    t.status = 'running';
    t.round = 0;
    const bySeed = (s) => entrants[s - 1]?.uid || null;
    t.rounds[0].forEach((m, i) => {
      m.a = bySeed(order[2 * i]);
      m.b = bySeed(order[2 * i + 1]);
      m.readyAt = now;
    });
    // Miễn đấu vòng 1
    t.rounds[0].forEach((m, i) => {
      if (m.a && !m.b) { m.bye = true; this.decideMatch(t, 0, i, m.a, null); }
    });
    this.saveTour(t);
    this.notifyPlayers(t, 'tour_started', {}, (p) => !p.out);
    this.notifyPlayers(t, 'tour_no_checkin', {}, (p) => p.out === 'no_checkin');
    this.pushTour(t);
    this.runKnockout(t, now);
  }

  /** Ghi kết quả một trận loại trực tiếp và đưa người thắng (và người thua bán kết) vào trận sau. */
  decideMatch(t, r, i, winner, loser) {
    const m = r === 'third' ? t.third : t.rounds[r][i];
    m.winner = winner;
    const now = Date.now();
    if (r !== 'third') {
      const next = t.rounds[r + 1] && t.rounds[r + 1][i >> 1];
      if (next) {
        next[i % 2 ? 'b' : 'a'] = winner;
        if (next.a && next.b) next.readyAt = now;
      }
      if (t.third && r === t.rounds.length - 2) {
        t.third[i % 2 ? 'b' : 'a'] = loser || null;
        t.thirdSemis = (t.thirdSemis || 0) + 1;
        if (t.third.a && t.third.b) t.third.readyAt = now;
      }
      const lp = loser && this.player(t, loser);
      if (lp && !(t.third && r === t.rounds.length - 2)) lp.out = lp.out || 'lost';
    }
    // Trận tranh hạng 3 chỉ có 1 người (bán kết kia là miễn đấu): người đó nhận hạng 3
    if (t.third && !t.third.winner && t.thirdSemis === 2 && (!t.third.a || !t.third.b)) {
      t.third.winner = t.third.a || t.third.b || null;
      t.third.bye = true;
    }
    const final = t.rounds[t.rounds.length - 1][0];
    if (final.winner && (!t.third || t.third.winner || (t.thirdSemis === 2 && !t.third.a && !t.third.b))) this.finishTour(t);
  }

  locate(t, matchId) {
    if (matchId === 'third') return ['third', 0];
    const [, r, i] = /^r(\d+)m(\d+)$/.exec(matchId).map(Number);
    return [r, i];
  }

  runKnockout(t, now) {
    for (const m of this.allMatches(t)) {
      if (m.winner || !m.a || !m.b || m.room) continue;
      const [r, i] = this.locate(t, m.id);
      const pa = this.player(t, m.a), pb = this.player(t, m.b);
      // Người đã rút / bị loại: đối thủ thắng luôn
      if (pa.withdrawn || pb.withdrawn) {
        m.walkover = true;
        const w = pa.withdrawn && !pb.withdrawn ? m.b : !pa.withdrawn ? m.a : (pa.seed <= pb.seed ? m.a : m.b);
        this.decideMatch(t, r, i, w, w === m.a ? m.b : m.a);
        this.saveTour(t);
        this.pushTour(t);
        if (t.status !== 'running') return;
        continue;
      }
      const okA = this.available(m.a), okB = this.available(m.b);
      if (okA && okB) { this.startTourMatch(t, m); continue; }
      if (now - m.readyAt < this.T.TOUR_NOSHOW_MS) continue;
      // Quá giờ mà một bên không có mặt: xử thua bên vắng; vắng cả hai thì hạt giống cao hơn đi tiếp
      const w = okA && !okB ? m.a : okB && !okA ? m.b : (pa.seed <= pb.seed ? m.a : m.b);
      m.walkover = true;
      this.send(userPid(w === m.a ? m.b : m.a), note('tour_noshow', { name: t.name }));
      this.decideMatch(t, r, i, w, w === m.a ? m.b : m.a);
      this.saveTour(t);
      this.pushTour(t);
      if (t.status !== 'running') return;
    }
  }

  /** Mở phòng cho một ván / trận của giải và đưa hai người vào (rời phòng cũ đã xong ván). */
  openTourRoom(t, kind, bestOf, aUid, bUid, aFirst, extra) {
    const a = userPid(aUid), b = userPid(bUid);
    this.leave(a);
    this.leave(b);
    const room = this.makeRoom(kind, bestOf, t.timeLimit);
    room.tour = { id: t.id, name: t.name, rated: t.rated, arena: t.format === 'arena', ...extra };
    this.enter(room, a, aFirst ? 1 : 2);
    this.enter(room, b, aFirst ? 2 : 1);
    for (const p of room.players) this.armForfeit(room, p.id);
    this.broadcastRoom(room);
    this.send(a, note('tour_game_start', { name: t.name, opp: this.nameOf(b) }));
    this.send(b, note('tour_game_start', { name: t.name, opp: this.nameOf(a) }));
    for (const pid of [a, b]) this.notifyFriends(pid);
    return room;
  }

  startTourMatch(t, m) {
    const pa = this.player(t, m.a), pb = this.player(t, m.b);
    const room = this.openTourRoom(t, 'series', t.bestOf, m.a, m.b, pa.seed <= pb.seed ? crypto.randomInt(2) === 0 : crypto.randomInt(2) === 1, { match: m.id });
    m.room = room.code;
    m.wins = {};
    this.saveTour(t);
    this.pushTour(t);
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

  /** Người đang có trận loại trực tiếp sẵn sàng đấu (ở giải khác): ưu tiên trận đó, Arena không ghép nữa. */
  koWaiting() {
    const s = new Set();
    for (const t of this.tours.values()) {
      if (t.status !== 'running' || t.format !== 'knockout') continue;
      for (const m of this.allMatches(t)) if (!m.winner && m.a && m.b && !m.room) { s.add(m.a); s.add(m.b); }
    }
    return s;
  }

  inTourGame(t, uid) {
    const r = this.roomFor(userPid(uid));
    return !!(r && r.tour && r.tour.id === t.id && r.active);
  }

  /**
   * Gọi từ settle() khi một ván trong phòng của giải vừa kết thúc.
   * Trả về true nếu không được tự bắt đầu ván tiếp theo trong phòng này.
   */
  tourOnGame(room, leaving) {
    const info = room.tour;
    const t = this.tours.get(info.id);
    if (!t || info.cancelled || t.status !== 'running') { room.tourDone = true; return true; }
    const xUid = uidOf(room.seats[1]), oUid = uidOf(room.seats[2]);
    const winUid = room.winner === DRAW ? null : uidOf(room.seats[room.winner]);
    if (t.format === 'arena') {
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
    // Loại trực tiếp
    const m = this.allMatches(t).find((x) => x.id === info.match);
    if (!m || m.winner) { room.tourDone = true; return true; }
    m.games.push({ share: room.lastShare || null, w: winUid });
    m.wins = { [m.a]: room.score[userPid(m.a)] || 0, [m.b]: room.score[userPid(m.b)] || 0 };
    let decided = null;
    if (room.reason === 'leave' && winUid) decided = winUid; // bỏ trận giữa chừng = thua cả trận
    else if (room.seriesWinner) decided = uidOf(room.seriesWinner);
    else if (room.gameNo >= t.bestOf * 2) {
      // Hoà quá nhiều ván: ai thắng nhiều ván hơn, bằng nhau thì hạt giống cao hơn đi tiếp
      const pa = this.player(t, m.a), pb = this.player(t, m.b);
      decided = m.wins[m.a] > m.wins[m.b] ? m.a : m.wins[m.b] > m.wins[m.a] ? m.b : (pa.seed <= pb.seed ? m.a : m.b);
    }
    if (decided) {
      room.tourDone = true;
      const [r, i] = this.locate(t, m.id);
      this.decideMatch(t, r, i, decided, decided === m.a ? m.b : m.a);
    }
    this.saveTour(t);
    this.pushTour(t);
    return !!decided;
  }

  finishTour(t) {
    if (t.status === 'finished') return;
    t.status = 'finished';
    t.finishedAt = Date.now();
    if (t.format === 'arena') {
      t.podium = t.players.filter((p) => p.games > 0)
        .sort((a, b) => b.score - a.score || b.wins - a.wins || b.rating - a.rating).slice(0, 3).map((p) => p.uid);
    } else {
      const final = t.rounds[t.rounds.length - 1][0];
      const second = final.winner === final.a ? final.b : final.a;
      t.podium = [final.winner, second];
      if (t.third && t.third.winner) t.podium.push(t.third.winner);
      t.podium = t.podium.filter(Boolean);
    }
    this.saveTour(t);
    this.pushTour(t);
    const champ = t.podium[0] && this.player(t, t.podium[0]);
    this.notifyPlayers(t, 'tour_finished', { winner: champ ? champ.name : '—' });
  }

  /**
   * Người chơi rời phòng của giải khi trận chưa xong: xử thua (Arena: thua ván; loại trực tiếp: thua cả trận,
   * kể cả khi đang nghỉ giữa 2 ván). Trả về true nếu đã xử lý.
   */
  tourLeft(room, pid) {
    if (!room.tour || room.tourDone || room.tour.cancelled || !room.full) return false;
    if (room.active) {
      room.finish(3 - room.sideOf(pid), 'leave');
      this.settle(room, true);
      return true;
    }
    if (room.awaitingNextGame) {
      const t = this.tours.get(room.tour.id);
      const m = t && this.allMatches(t).find((x) => x.id === room.tour.match);
      room.tourDone = true;
      if (m && !m.winner && t.status === 'running') {
        const loser = uidOf(pid), winner = loser === m.a ? m.b : m.a;
        const [r, i] = this.locate(t, m.id);
        this.decideMatch(t, r, i, winner, loser);
        this.saveTour(t);
        this.pushTour(t);
      }
      return true;
    }
    return false;
  }

  /** Tài khoản bị xoá: rút khỏi mọi giải chưa xong. */
  tourUserGone(uid) {
    for (const t of this.tours.values()) {
      if (['pending', 'scheduled'].includes(t.status) && t.creator === uid) this.cancelTour(t, 'organizer');
      if (this.player(t, uid)) this.withdraw(t, uid);
    }
  }
}

module.exports = { Tournaments, seedOrder };
