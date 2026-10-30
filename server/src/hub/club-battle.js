/*
 * Câu lạc bộ thi đấu (Đợt 9):
 *  - Team Battle (như Lichess): giải Arena có danh sách 2–10 CLB; mỗi người thi đấu dưới tên một CLB mình là thành viên;
 *    điểm CLB = tổng điểm N người cao điểm nhất (ban tổ chức chọn N); không ghép hai người cùng CLB.
 *  - Giao hữu CLB đấu CLB (như MyLeague): CLB A mời CLB B, mỗi bên xếp đội hình K người theo thứ tự bàn, bàn 1 gặp bàn 1…
 *    Chạy như một giải thường (Thụy Sĩ 1 vòng, cặp cố định) nên dùng chung phòng đấu, vắng mặt, khiếu nại, nhánh đấu.
 *    Tổng điểm các bàn (thắng 1, hoà ½) quyết định thắng thua.
 *  - Bảng xếp hạng CLB toàn hệ thống + tủ cúp: Team Battle hạng 1 / 2 / 3 được 10 / 6 / 4 điểm, giao hữu thắng 3, hoà 1.
 * Phần chung của giải: tournaments.js; Arena: arena.js; thi đấu theo vòng: bracket.js.
 */
'use strict';
const { E, note } = require('../msg.js');
const { userPid } = require('./shared.js');

const MAX_TEAMS = 10;
const MAX_BOARDS = 20;
const TEAM_PTS = [10, 6, 4];
const MATCH_PTS = { win: 3, draw: 1 };
const MAX_TROPHIES = 100;

class ClubBattle {
  // ------------------------------------------------------------ Team Battle
  /** Cấu hình Team Battle từ client (tourFields gọi; chỉ Arena). Người tạo phải có quyền Giải đấu ở ít nhất một CLB. */
  normalizeTeams(me, o) {
    const x = o && o.teams;
    if (!x || !Array.isArray(x.clubs)) return null;
    const ids = [...new Set(x.clubs.map(String))].slice(0, MAX_TEAMS);
    const clubs = ids.map((id) => this.clubs.get(id)).filter((c) => c && c.status === 'approved');
    if (clubs.length < 2) throw E('team_battle_few');
    if (!clubs.some((c) => this.clubCan(c, me.id, 'tours'))) throw E('tour_club_officers');
    const top = Math.max(1, Math.min(20, Math.floor(Number(x.top)) || 5));
    return { clubs: clubs.map((c) => c.id), top };
  }

  /** CLB thi đấu của một người: CLB đã chọn khi đăng ký (nếu còn là thành viên), không thì CLB đầu tiên mình thuộc. */
  pickTeam(t, uid, want) {
    const mine = t.teams.clubs.filter((id) => this.clubs.get(id)?.members[uid]);
    return mine.includes(want) ? want : mine[0] || null;
  }

  /** Bảng xếp hạng CLB của Team Battle: điểm = tổng N người cao điểm nhất. */
  teamTable(t) {
    return t.teams.clubs.map((id) => {
      const c = this.clubs.get(id);
      const ps = t.players.filter((p) => p.team === id && !p.withdrawn).sort((a, b) => b.score - a.score);
      const top = ps.slice(0, t.teams.top);
      return {
        id, name: c ? c.name : '?', icon: c ? c.icon || '' : '', count: ps.length,
        score: top.reduce((n, p) => n + p.score, 0), top: top.map((p) => ({ uid: p.uid, name: p.name, score: p.score })),
      };
    }).sort((a, b) => b.score - a.score || b.count - a.count);
  }

  // ------------------------------------------------------------ Giao hữu CLB đấu CLB
  /** CLB id mời CLB opp: giải Thụy Sĩ 1 vòng, K bàn; qua quản trị viên duyệt như giải thường; CLB kia phải chấp nhận. */
  on_clubMatchCreate(conn, o) {
    const me = this.requireUser(conn);
    const c = this.findClub(o.id, me.id);
    this.requireClubPerm(c, me.id, 'tours');
    const opp = this.clubs.get(String(o.opp || ''));
    if (c.status !== 'approved' || !opp || opp.status !== 'approved' || opp.id === c.id) throw E('club_not_found');
    const boards = Math.max(1, Math.min(MAX_BOARDS, Math.floor(Number(o.boards)) || 5));
    const fields = this.tourFields(me, {
      ...o, name: `${c.name} vs ${opp.name}`.slice(0, 60), format: 'bracket', access: 'public', club: null, checkin: false, offline: false,
      seeding: 'list', maxPlayers: boards * 2, stages: [{ type: 'swiss', rounds: 1, bestOf: o.bestOf }], reg: null, teams: null,
    });
    const t = this.createTour(conn, me, { ...fields, teamMatch: { a: c.id, b: opp.id, boards, accepted: false, lineup: { a: [], b: [] } } });
    for (const uid of this.clubManagers(opp, 'tours')) this.send(userPid(uid), note('club_match_invite', { club: c.name, name: t.name }));
  }

  /** Bên được mời của giao hữu mà mình quản lý (quyền Giải đấu): 'a' / 'b' / null. */
  matchSide(t, uid, side) {
    const m = t.teamMatch;
    const ok = (s) => { const c = this.clubs.get(m[s]); return !!(c && this.clubCan(c, uid, 'tours')); };
    if (side) return ok(side) ? side : null;
    return ok('a') ? 'a' : ok('b') ? 'b' : null;
  }

  on_clubMatchAccept(conn, { tour, accept }) {
    const me = this.requireUser(conn);
    const t = this.findTour(tour, me.id);
    if (!t.teamMatch || !this.matchSide(t, me.id, 'b')) throw E('club_officers_only');
    if (!['pending', 'scheduled'].includes(t.status)) throw E('tour_closed');
    if (accept) t.teamMatch.accepted = true;
    else { this.cancelTour(t, 'match_declined'); return; }
    this.tourLog(t, me.id, 'match_accepted');
    this.saveTour(t);
    this.pushTour(t);
  }

  /** Xếp đội hình bên mình: uids theo thứ tự bàn (thành viên CLB, không trùng, không quá số bàn, không ở đội kia). */
  on_clubMatchLineup(conn, { tour, side, uids }) {
    const me = this.requireUser(conn);
    const t = this.findTour(tour, me.id);
    if (!t.teamMatch || !['a', 'b'].includes(side) || !this.matchSide(t, me.id, side)) throw E('club_officers_only');
    if (!['pending', 'scheduled'].includes(t.status)) throw E('tour_closed');
    const c = this.clubs.get(t.teamMatch[side]);
    const other = t.teamMatch.lineup[side === 'a' ? 'b' : 'a'];
    const list = [...new Set((Array.isArray(uids) ? uids : []).map(String))]
      .filter((u) => c.members[u] && !other.includes(u)).slice(0, t.teamMatch.boards);
    t.teamMatch.lineup[side] = list;
    this.saveTour(t);
    this.pushTour(t);
  }

  /** Tới giờ: đủ điều kiện thì đưa đội hình vào giải và ghép cặp theo bàn; không thì huỷ. Trả true nếu bắt đầu được. */
  prepareTeamMatch(t) {
    const m = t.teamMatch;
    const still = (side) => m.lineup[side].filter((u) => this.clubs.get(m[side])?.members[u] && this.store.users.get(u));
    const a = still('a'), b = still('b');
    const k = Math.min(m.boards, a.length, b.length);
    if (!m.accepted || k < 1) { this.cancelTour(t, m.accepted ? 'match_no_lineup' : 'match_not_accepted'); return false; }
    t.players = [];
    for (let i = 0; i < k; i++) {
      for (const [uid, team] of [[a[i], m.a], [b[i], m.b]]) {
        const u = this.store.users.get(uid);
        t.players.push({ uid, name: u.name, rating: u.rating, joined: Date.now(), score: 0, wins: 0, draws: 0, losses: 0, games: 0, streak: 0, firsts: 0, team, board: i + 1 });
      }
    }
    m.pairs = a.slice(0, k).map((x, i) => [x, b[i]]);
    return true;
  }

  /** Kết quả giao hữu: điểm từng bên (thắng 1, hoà ½) và từng bàn. */
  teamMatchView(t) {
    const m = t.teamMatch;
    const side = (s) => { const c = this.clubs.get(m[s]); return { id: m[s], name: c ? c.name : '?', icon: c ? c.icon || '' : '' }; };
    const name = (u) => this.store.users.get(u)?.name || '?';
    const st = t.st && t.st[0];
    let sa = 0, sb = 0;
    const boards = (m.pairs || []).map(([a, b], i) => {
      const x = st && Object.values(st.matches).find((y) => y.a === a && y.b === b);
      let res = null;
      if (x && x.done) {
        res = x.winner === a ? 'a' : x.winner === b ? 'b' : 'draw';
        if (res === 'a') sa++; else if (res === 'b') sb++; else { sa += 0.5; sb += 0.5; }
      }
      return { board: i + 1, a: { uid: a, name: name(a) }, b: { uid: b, name: name(b) }, res, wa: x ? x.wins[a] || 0 : 0, wb: x ? x.wins[b] || 0 : 0, live: !!(x && !x.done && x.room) };
    });
    return {
      a: { ...side('a'), score: sa }, b: { ...side('b'), score: sb }, boards: m.boards, accepted: !!m.accepted, played: boards,
      lineup: t.status === 'pending' || t.status === 'scheduled' ? { a: m.lineup.a.map((u) => ({ uid: u, name: name(u) })), b: m.lineup.b.map((u) => ({ uid: u, name: name(u) })) } : null,
    };
  }

  /** Phần riêng của người xem (tourMine): CLB mình đấu cho (Team Battle), bên mình quản lý + danh sách thành viên để xếp đội hình. */
  battleMine(t, uid) {
    const out = {};
    if (t.teams && uid) out.myTeams = t.teams.clubs.filter((id) => this.clubs.get(id)?.members[uid]).map((id) => ({ id, name: this.clubs.get(id).name }));
    if (t.teamMatch && uid && ['pending', 'scheduled'].includes(t.status)) {
      const sides = ['a', 'b'].filter((s) => this.matchSide(t, uid, s));
      out.matchSides = sides.map((s) => {
        const c = this.clubs.get(t.teamMatch[s]);
        return { side: s, pool: Object.keys(c.members).map((u) => ({ uid: u, name: this.store.users.get(u)?.name || '?', rating: this.store.users.get(u)?.rating || 1200 }))
          .sort((x, y) => y.rating - x.rating).slice(0, 200) };
      });
    }
    return out;
  }

  // ------------------------------------------------------------ Xếp hạng CLB + tủ cúp
  clubAward(id, t, place, pts, kind) {
    const c = this.clubs.get(id);
    if (!c) return;
    c.points = (c.points || 0) + pts;
    if (place) {
      c.trophies.unshift({ tour: t.id, name: t.name, at: Date.now(), place, kind });
      if (c.trophies.length > MAX_TROPHIES) c.trophies.length = MAX_TROPHIES;
    }
    this.saveClub(c);
  }

  /** Giải xong (finishTour gọi): Team Battle chia hạng CLB; giao hữu: thắng / hoà. */
  clubAwards(t) {
    if (t.teams) {
      const table = this.teamTable(t).filter((x) => x.score > 0);
      t.teamPodium = table.slice(0, 3).map((x) => x.id);
      table.slice(0, 3).forEach((x, i) => this.clubAward(x.id, t, i + 1, TEAM_PTS[i], 'battle'));
    }
    if (t.teamMatch && t.teamMatch.pairs) {
      const v = this.teamMatchView(t);
      if (v.a.score === v.b.score) { this.clubAward(v.a.id, t, 0, MATCH_PTS.draw, 'match'); this.clubAward(v.b.id, t, 0, MATCH_PTS.draw, 'match'); }
      else this.clubAward(v.a.score > v.b.score ? v.a.id : v.b.id, t, 1, MATCH_PTS.win, 'match');
      t.teamMatch.result = { a: v.a.score, b: v.b.score };
    }
  }

  /** Bảng xếp hạng CLB toàn hệ thống: 50 CLB nhiều điểm nhất. */
  on_clubRanking(conn) {
    const list = [...this.clubs.values()].filter((c) => c.status === 'approved' && (c.points || 0) > 0)
      .sort((a, b) => b.points - a.points || b.trophies.length - a.trophies.length).slice(0, 50)
      .map((c, i) => ({
        rank: i + 1, id: c.id, name: c.name, icon: c.icon || '', points: c.points, count: Object.keys(c.members).length,
        gold: c.trophies.filter((x) => x.place === 1).length, trophies: c.trophies.length,
      }));
    conn.send({ t: 'clubRanking', list });
  }
}

module.exports = { ClubBattle, TEAM_PTS, MATCH_PTS, MAX_BOARDS };
