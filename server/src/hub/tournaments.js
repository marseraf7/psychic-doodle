/*
 * Giải đấu – phần chung cho mọi thể thức: tạo, duyệt, danh sách, đăng ký / điểm danh / rút, ban tổ chức,
 * gửi dữ liệu cho client.
 *   tour-run.js – ban tổ chức (bắt đầu / huỷ / loại người), nhịp chạy giải, phòng cho ván của giải, kết thúc giải
 *   arena.js   – giải Arena (ghép ván liên tục, tính điểm, 🔥)
 *   bracket.js – thi đấu theo giai đoạn (loại trực tiếp, nhánh thắng – thua, vòng tròn, Thụy Sĩ)
 *   stages.js  – logic thuần của các thể thức (không phụ thuộc mạng)
 *
 * Vòng đời: pending (chờ quản trị viên duyệt) → scheduled (mở đăng ký) → running → finished
 *           (hoặc rejected / cancelled). Giải lưu trong SQLite nên máy chủ khởi động lại vẫn chạy tiếp.
 * Bắt buộc có giới hạn thời gian mỗi nước để giải không bị kéo dài.
 */
'use strict';
const crypto = require('crypto');
const { E, note } = require('../msg.js');
const { cleanPublicText, cleanPublicName, cleanTc, userPid, uidOf } = require('./shared.js');
const ST = require('./stages.js');

const FORMATS = ['arena', 'bracket'];
const TOUR_TIME_LIMITS = require('../../../caro/timectl.js').PER_MOVE; // giải luôn có giới hạn thời gian
const ARENA_MINUTES = [15, 20, 30, 45, 60, 90, 120];
const ACCESS = ['public', 'link', 'club'];
const MAX_ACTIVE_TOURS_PER_USER = 3;
const MAX_START_DAYS = 30;
const MAX_PLAYERS = 512; // tối đa người mỗi giải (mọi thể thức)

class Tournaments {
  loadTours() {
    this.tours = new Map();
    const now = Date.now();
    for (const t of this.store.loadTours()) {
      this.upgradeTour(t);
      // Máy chủ khởi động lại khi giải đang chạy: các ván dở dang bị mất, đấu lại từ đầu
      if (t.status === 'running' && t.format === 'bracket') {
        for (const m of this.allMatches(t)) {
          if (m.room && !m.done) { m.room = null; m.wins = {}; m.games = []; m.readyAt = now; }
        }
      }
      this.tours.set(t.id, t);
    }
    this.tourTimer = setInterval(() => this.safeTimer('tourTick', () => this.tourTick()), this.T.TOUR_TICK_MS);
    this.tourTimer.unref?.();
  }

  saveTour(t) {
    this.store.saveTour(t);
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
      minutes: t.minutes || null, timeLimit: t.timeLimit, clock: t.clock || null, opening: t.opening || 'free', rule: t.rule || 'vn', stages: t.stages || null, stage: t.stage || 0, rated: t.rated, access: t.access,
      club: c ? { id: c.id, name: c.name } : null, count: t.players.filter((p) => !p.withdrawn).length,
      maxPlayers: t.maxPlayers, creator: this.store.users.get(t.creator)?.name || '?',
      joined: !!(uid && this.player(t, uid) && !this.player(t, uid).withdrawn), checkin: this.inCheckin(t),
      winner: champ ? champ.name : null,
    };
  }

  /**
   * Phần chung của trang giải: giống nhau với mọi người xem, nên khi cập nhật chỉ dựng (và chuyển JSON) một lần
   * cho cả giải. Giải 512 người có thể có hàng nghìn trận – dựng riêng cho từng người xem thì máy chủ nhỏ không kham nổi.
   */
  tourShared(t) {
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
    const side = (u) => this.tourSide(t, u);
    const players = t.players.filter((p) => !p.withdrawn || p.games).map(pv);
    if (t.format === 'arena') players.sort((a, b) => b.score - a.score || b.wins - a.wins || b.rating - a.rating);
    else players.sort((a, b) => (a.seed || 999) - (b.seed || 999) || b.rating - a.rating);
    return {
      ...this.tourSummary(t, null),
      desc: t.desc, seeding: t.seeding, checkinEnabled: !!t.checkin,
      checkinAt: t.checkin ? t.startsAt - this.T.TOUR_CHECKIN_MS : null, startedAt: t.startedAt || null, finishedAt: t.finishedAt || null,
      cancelReason: t.cancelReason || '',
      players, stageViews: this.stageViews(t),
      podium: (t.podium || []).map((u) => side(u)),
      games: t.format === 'arena' ? t.games.slice(-30).reverse().map((g) => ({
        x: side(g.x), o: side(g.o), w: g.w, px: g.px, po: g.po, share: g.share || null, dc: !!g.dc, annulled: !!g.annulled,
      })) : null,
      disputes: this.disputeViews(t), // ván mất kết nối và cách ban tổ chức đã xử lý
      now: Date.now(),
    };
  }

  /** Phần riêng của từng người xem (nhỏ): đã đăng ký chưa, quyền ban tổ chức, trận của mình… */
  tourMine(t, uid) {
    const me = uid && this.player(t, uid);
    const manage = this.canManageTour(t, uid);
    const myMatch = me ? this.myMatch(t, uid) : null;
    return {
      joined: !!(me && !me.withdrawn),
      reviewNote: t.creator === uid || this.isAdmin(uid) ? t.reviewNote || '' : '',
      canManage: manage, canJoin: this.canJoinTour(t, uid),
      me: me ? { checkedIn: !!me.checkedIn, paused: !!me.paused, withdrawn: !!me.withdrawn, out: me.out || null } : null,
      groupDraft: manage ? this.groupDraft(t) : null,
      myMatch: myMatch ? this.matchView(t, myMatch) : null,
      now: Date.now(), // giờ máy chủ (phần chung có thể là bản đã lưu vài giây trước)
    };
  }

  tourView(t, uid) {
    return { ...this.tourShared(t), ...this.tourMine(t, uid) };
  }

  /** Tên + hạt giống của một người trong giải (gửi cho client). */
  tourSide(t, u) {
    const p = u && this.player(t, u);
    return u ? { uid: u, name: p?.name || '?', seed: p?.seed || null } : null;
  }

  notifyPlayers(t, code, args = {}, filter = () => true) {
    for (const p of t.players) if (!p.withdrawn && filter(p)) this.send(userPid(p.uid), note(code, { name: t.name, ...args }));
  }

  // ------------------------------------------------------------ Tạo / xem / đăng ký
  on_tourCreate(conn, o) {
    const me = this.requireUser(conn);
    const name = cleanPublicName(o.name).slice(0, 60);
    if (name.length < 3) throw E('tour_name_short');
    const format = FORMATS.includes(o.format) ? o.format : 'arena';
    // Đồng hồ tổng (thay cho thời gian mỗi nước) và luật khai cuộc; giải luôn có giới hạn thời gian
    const { clock, opening, rule } = cleanTc(o);
    const timeLimit = clock ? 0 : TOUR_TIME_LIMITS.includes(Number(o.timeLimit)) ? Number(o.timeLimit) : 20;
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
    // Bản trước gửi format 'knockout' = 1 vòng loại trực tiếp
    const legacyKo = o.format === 'knockout';
    const ko = format === 'bracket' || legacyKo;
    const stages = ko ? ST.normalizeStages(legacyKo ? [{ type: 'single', bestOf: o.bestOf, thirdPlace: o.thirdPlace }] : o.stages) : null;
    const maxPlayers = Math.max(ko ? 3 : 2, Math.min(MAX_PLAYERS, Math.floor(Number(o.maxPlayers)) || (ko ? 16 : 100)));
    const admin = this.isAdmin(me.id);
    const t = {
      id: crypto.randomBytes(5).toString('hex'), name, desc: cleanPublicText(o.desc, 1000), format: ko ? 'bracket' : 'arena', creator: me.id,
      status: admin ? 'scheduled' : 'pending', created: now, startsAt, timeLimit, clock, opening, rule, rated: o.rated !== false,
      access, club, maxPlayers,
      minutes: ko ? null : (ARENA_MINUTES.includes(Number(o.minutes)) ? Number(o.minutes) : 30),
      stages, seeding: o.seeding === 'random' ? 'random' : 'rating',
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
    this.watchTour(conn, t, uid);
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
      if (t.format === 'bracket') this.tourTick();
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
}

module.exports = { Tournaments };
