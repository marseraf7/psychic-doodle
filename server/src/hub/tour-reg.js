/*
 * Giải đấu – đăng ký nâng cao (như Challonge / MyLeague / Lichess Team):
 *  - Hạn chót đăng ký; điều kiện tham gia (Elo tối thiểu / tối đa, số ván tính Elo, tuổi tài khoản, mã vào giải);
 *    câu hỏi khi đăng ký (≤ 5, chữ hoặc chọn một).
 *  - Duyệt tay: người đăng ký vào hàng chờ duyệt (t.queue, state 'pending'), ban tổ chức chấp nhận / từ chối.
 *  - Danh sách chờ: giải đầy thì vào hàng chờ (state 'wait'); có người rút trước giờ đấu thì người đầu hàng tự vào.
 *  - Bulk Add của ban tổ chức: giải trực tuyến thêm theo tên đăng nhập (người được thêm nhận thông báo); giải offline
 *    (t.offline – trận đấu ngoài đời, ban tổ chức nhập tỉ số: tour-score.js) thêm theo tên, không cần tài khoản.
 * Người trong hàng chờ không nằm trong t.players nên mọi chỗ đếm / bốc thăm giữ nguyên như cũ.
 */
'use strict';
const crypto = require('crypto');
const { E, note } = require('../msg.js');
const { cleanPublicText, cleanPublicName, userPid } = require('./shared.js');

const MAX_QUESTIONS = 5;
const MAX_QUEUE = 1000;
const MAX_BULK = 512;
const CHECKIN_MIN = [10, 15, 30, 60, 120, 1440, 2880]; // mở điểm danh trước giờ đấu (phút) – như Challonge 15 phút → 2 ngày
/** Tên đã làm sạch (≤ 40 ký tự), hoặc '' nếu không dùng được (cleanPublicName báo lỗi tên phản cảm). */
const safeName = (x) => { try { return cleanPublicName(x).slice(0, 40); } catch (e) { return ''; } };
const int = (v, lo, hi) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n > 0 ? Math.max(lo, Math.min(hi, n)) : null; };

/** Chuẩn hoá phần đăng ký của giải (dữ liệu client gửi khi tạo giải). */
function normalizeReg(o = {}, startsAt) {
  const r = o && typeof o === 'object' ? o : {};
  const closeAt = Number(r.closeAt);
  const qs = Array.isArray(r.questions) ? r.questions.slice(0, MAX_QUESTIONS).map((q) => {
    const text = cleanPublicText(q && q.q, 120).trim();
    const opts = q && q.type === 'choice' && Array.isArray(q.opts) ? [...new Set(q.opts.map(safeName).filter(Boolean))].slice(0, 10) : [];
    return text ? { q: text, type: opts.length >= 2 ? 'choice' : 'text', opts: opts.length >= 2 ? opts : undefined } : null;
  }).filter(Boolean) : [];
  const minRating = int(r.minRating, 100, 4000), maxRating = int(r.maxRating, 100, 4000);
  return {
    // Hạn chót phải trước giờ đấu
    closeAt: Number.isFinite(closeAt) && closeAt > 0 && (!startsAt || closeAt <= startsAt) ? closeAt : null,
    approval: r.approval === true,
    waitlist: r.waitlist === true,
    minRating, maxRating: maxRating && (!minRating || maxRating >= minRating) ? maxRating : null,
    minGames: int(r.minGames, 1, 10000),
    minAccountDays: int(r.minAccountDays, 1, 3650),
    code: typeof r.code === 'string' && r.code.trim() ? r.code.trim().slice(0, 40) : null,
    questions: qs,
    checkinMin: CHECKIN_MIN.includes(Number(r.checkinMin)) ? Number(r.checkinMin) : 10,
  };
}

class TourReg {
  /** Phần đăng ký gửi cho mọi người xem (không có mã vào giải). */
  regPublic(t) {
    const r = t.reg || {};
    return {
      closeAt: r.closeAt || null, approval: !!r.approval, waitlist: !!r.waitlist, minRating: r.minRating || null,
      maxRating: r.maxRating || null, minGames: r.minGames || null, minAccountDays: r.minAccountDays || null,
      hasCode: !!r.code, questions: r.questions || [], checkinMin: r.checkinMin || 10,
      pending: (t.queue || []).filter((x) => x.state === 'pending').length, waiting: (t.queue || []).filter((x) => x.state === 'wait').length,
    };
  }

  /** Phần riêng cho ban tổ chức: hàng chờ (kèm câu trả lời), câu trả lời của người đã vào, mã vào giải. */
  regManager(t) {
    const side = (x) => ({ uid: x.uid, name: x.name, rating: this.store.users.get(x.uid)?.rating || x.rating || 0, answers: x.answers || null, state: x.state, at: x.joined });
    return {
      queue: (t.queue || []).map(side),
      answers: Object.fromEntries(t.players.filter((p) => p.answers).map((p) => [p.uid, p.answers])),
      code: (t.reg && t.reg.code) || null,
    };
  }

  queueEntry(t, uid) {
    return (t.queue || []).find((x) => x.uid === uid) || null;
  }

  /** Lý do không đủ điều kiện (mã lỗi) hoặc null. */
  regBlock(t, u, o) {
    const r = t.reg || {};
    if (t.offline) return 'tour_offline_join';
    if (r.closeAt && Date.now() > r.closeAt) return 'tour_reg_closed';
    if (r.minRating && u.rating < r.minRating) return 'tour_rating_low';
    if (r.maxRating && u.rating > r.maxRating) return 'tour_rating_high';
    if (r.minGames && (u.rated || 0) < r.minGames) return 'tour_games_few';
    if (r.minAccountDays && u.created && Date.now() - u.created < r.minAccountDays * 86400000) return 'tour_account_new';
    if (r.code && String(o.code || '').trim() !== r.code) return 'tour_bad_code';
    return null;
  }

  /** Câu trả lời hợp lệ cho các câu hỏi đăng ký (mỗi câu bắt buộc). */
  regAnswers(t, list) {
    const qs = (t.reg && t.reg.questions) || [];
    if (!qs.length) return null;
    const a = Array.isArray(list) ? list : [];
    return qs.map((q, i) => {
      const v = cleanPublicText(a[i], 200).trim();
      if (!v || (q.type === 'choice' && !q.opts.includes(v))) throw E('tour_answers_required');
      return v;
    });
  }

  /** Thêm người vào giải (đã kiểm điều kiện): còn chỗ thì vào thẳng, đầy thì danh sách chờ / báo đầy. */
  regAdmit(t, u, answers) {
    const count = t.players.filter((x) => !x.withdrawn).length;
    if (count >= t.maxPlayers) {
      if (!(t.reg && t.reg.waitlist)) throw E('tour_full');
      this.regQueue(t, u, answers, 'wait');
      return 'wait';
    }
    t.queue = (t.queue || []).filter((x) => x.uid !== u.id);
    let p = this.player(t, u.id);
    if (p) { p.withdrawn = false; p.paused = false; } else {
      p = { uid: u.id, name: u.name, rating: u.rating, joined: Date.now(), score: 0, wins: 0, draws: 0, losses: 0, games: 0, streak: 0, firsts: 0 };
      t.players.push(p);
    }
    if (answers) p.answers = answers;
    if (t.teams) p.team = this.pickTeam(t, u.id, t.teamPref && t.teamPref[u.id]); // Team Battle: CLB thi đấu cho
    if (this.inCheckin(t)) p.checkedIn = true; // đăng ký trong lúc điểm danh = điểm danh luôn
    return 'in';
  }

  regQueue(t, u, answers, state) {
    t.queue = t.queue || [];
    if (t.queue.length >= MAX_QUEUE) throw E('tour_full');
    const cur = this.queueEntry(t, u.id);
    if (cur) { cur.state = state; if (answers) cur.answers = answers; return; }
    t.queue.push({ uid: u.id, name: u.name, rating: u.rating, joined: Date.now(), answers, state });
  }

  on_tourJoin(conn, o) {
    const me = this.requireUser(conn);
    const t = this.findTour(o.id, me.id);
    if (t.access === 'club' && !this.clubs.get(t.club)?.members[me.id]) throw E('tour_club_only');
    if (t.teamMatch) throw E('tour_team_match'); // giao hữu CLB: ban quản lý xếp đội hình
    if (t.teams) {
      if (!this.pickTeam(t, me.id)) throw E('tour_team_only');
      t.teamPref = { ...(t.teamPref || {}), [me.id]: String(o.team || '') }; // CLB mình chọn đấu cho (nhận khi vào giải)
    }
    const p = this.player(t, me.id);
    if (p && !p.withdrawn) return;
    if (this.queueEntry(t, me.id)) return; // đã ở hàng chờ
    if (t.status !== 'scheduled' && !(t.status === 'running' && t.format === 'arena' && Date.now() < t.endsAt)) throw E('tour_closed');
    const block = this.regBlock(t, me, o);
    if (block) throw E(block, { n: block === 'tour_rating_low' ? t.reg.minRating : block === 'tour_rating_high' ? t.reg.maxRating
      : block === 'tour_games_few' ? t.reg.minGames : block === 'tour_account_new' ? t.reg.minAccountDays : 0 });
    const answers = this.regAnswers(t, o.answers);
    let res;
    // Duyệt tay áp dụng cả khi Arena đang chạy (vào muộn vẫn phải chờ duyệt)
    if (t.reg && t.reg.approval) {
      this.regQueue(t, me, answers, 'pending');
      res = 'pending';
      for (const uid of this.tourManagers(t, 'reg')) this.send(userPid(uid), note('tour_reg_new', { name: t.name, player: me.name }));
    } else res = this.regAdmit(t, me, answers);
    this.saveTour(t);
    this.pushTour(t);
    conn.send(note(res === 'in' ? 'tour_joined' : res === 'wait' ? 'tour_waitlisted' : 'tour_reg_pending', { name: t.name }));
  }

  /** Ban tổ chức duyệt người đăng ký: accept = vào giải (đầy thì vào danh sách chờ nếu bật), không thì loại khỏi hàng. */
  on_tourRegDecide(conn, { id, uid, accept }) {
    const t = this.requireManager(conn, id, 'reg');
    const arenaOpen = t.status === 'running' && t.format === 'arena' && Date.now() < t.endsAt;
    if (t.status !== 'scheduled' && t.status !== 'pending' && !arenaOpen) throw E('tour_closed');
    const x = this.queueEntry(t, String(uid || ''));
    if (!x) throw E('player_not_found');
    const u = this.store.users.get(x.uid);
    this.tourLog(t, this.requireUser(conn).id, accept ? 'reg_accept' : 'reg_reject', { name: x.name });
    if (accept && u) {
      const res = this.regAdmit(t, u, x.answers);
      this.send(userPid(x.uid), note(res === 'in' ? 'tour_reg_accepted' : 'tour_waitlisted', { name: t.name }));
    } else {
      t.queue = t.queue.filter((y) => y !== x);
      this.send(userPid(x.uid), note('tour_reg_rejected', { name: t.name }));
    }
    this.saveTour(t);
    this.pushTour(t);
  }

  /** Có người rút trước giờ đấu: người đầu danh sách chờ tự vào giải. */
  regPromote(t) {
    if (!t.queue || !t.queue.length) return;
    while (t.players.filter((x) => !x.withdrawn).length < t.maxPlayers) {
      const x = t.queue.find((y) => y.state === 'wait');
      const u = x && this.store.users.get(x.uid);
      if (!x) return;
      t.queue = t.queue.filter((y) => y !== x);
      if (!u) continue;
      this.regAdmit(t, u, x.answers);
      this.send(userPid(x.uid), note('tour_promoted', { name: t.name }));
    }
  }

  /** Rời hàng chờ duyệt / danh sách chờ. Trả true nếu đã rời. */
  regLeave(t, uid) {
    if (!this.queueEntry(t, uid)) return false;
    t.queue = t.queue.filter((x) => x.uid !== uid);
    this.saveTour(t);
    this.pushTour(t);
    return true;
  }

  /**
   * Bulk Add của ban tổ chức (trước khi giải bắt đầu). names: mảng dòng.
   * Giải trực tuyến: mỗi dòng là tên đăng nhập (có hoặc không có @) – thêm thẳng vào giải, người đó nhận thông báo.
   * Giải offline: mỗi dòng là tên người chơi (không cần tài khoản). Trả kết quả cho ban tổ chức: đã thêm / không có / đã có.
   */
  on_tourAddPlayers(conn, { id, names }) {
    const t = this.requireManager(conn, id, 'players');
    if (t.status !== 'scheduled' && t.status !== 'pending') throw E('tour_closed');
    if (t.teamMatch) throw E('tour_team_match'); // giao hữu CLB: người chơi lấy từ đội hình
    if (!Array.isArray(names) || !names.length) throw E('tour_names_empty');
    const res = { added: [], missing: [], already: [], full: [], bad: [] };
    const seen = new Set();
    for (const raw of names.slice(0, MAX_BULK)) {
      const line = String(raw || '').trim();
      if (!line) continue;
      const room = t.players.filter((x) => !x.withdrawn).length < t.maxPlayers;
      if (t.offline) {
        const name = safeName(line);
        const key = name.toLowerCase();
        if (!name) { res.bad.push(line.slice(0, 40)); continue; } // tên không dùng được: bỏ qua dòng này, thêm tiếp các dòng sau
        if (seen.has(key)) { res.already.push(name); continue; } // trùng ngay trong danh sách dán
        seen.add(key);
        if (t.players.some((p) => p.name.toLowerCase() === key)) { res.already.push(name); continue; }
        if (!room) { res.full.push(name); continue; }
        t.players.push({ uid: 'o:' + crypto.randomBytes(5).toString('hex'), name, offline: true, rating: 0, joined: Date.now(), score: 0, wins: 0, draws: 0, losses: 0, games: 0, streak: 0, firsts: 0 });
        res.added.push(name);
      } else {
        const uname = line.replace(/^@/, '').toLowerCase();
        if (seen.has(uname)) { res.already.push(line); continue; }
        seen.add(uname);
        const u = this.store.byUsername ? this.store.byUsername.get(uname) : null;
        if (!u) { res.missing.push(line); continue; }
        const p = this.player(t, u.id);
        if (p && !p.withdrawn) { res.already.push(u.name); continue; }
        if (!room) { res.full.push(u.name); continue; }
        if (t.teams && !this.pickTeam(t, u.id)) { res.bad.push(u.name); continue; } // Team Battle: không thuộc CLB nào tham gia
        t.queue = (t.queue || []).filter((x) => x.uid !== u.id);
        this.regAdmit(t, u, null);
        this.send(userPid(u.id), note('tour_added', { name: t.name }));
        res.added.push(u.name);
      }
    }
    if (res.added.length) {
      this.tourLog(t, this.requireUser(conn).id, 'players_added', { n: res.added.length });
      this.saveTour(t);
      this.pushTour(t);
    }
    conn.send({ t: 'tourAddResult', id: t.id, ...res });
  }
}

module.exports = { TourReg, normalizeReg, CHECKIN_MIN };
