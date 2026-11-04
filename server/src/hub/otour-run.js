/*
 * Giải đấu Offline – diễn biến giải (otour.js là phần khung): đội / người tham gia, bắt đầu (bốc thăm giai đoạn đầu),
 * nhập kết quả theo kiểu của giải, huỷ kết quả, chuyển giai đoạn, kết thúc. Thể thức dùng chung lõi của giải Caro
 * (stages.js); kết quả:
 *   'score'  – tỉ số [a, b] (bàn thắng / điểm); hoà ở loại trực tiếp phải có luân lưu pen [a, b]. Số bàn ghi vào m.wins nên
 *              hiệu số / số bàn thắng là tie-break 'gdiff' / 'gwins' có sẵn.
 *   'sets'   – điểm từng set [[a, b], …]; thắng set nhiều hơn thắng trận (như giải Caro offline – tour-score.js).
 *   'winner' – chỉ người thắng (hoặc hoà ở vòng tròn / Thụy Sĩ).
 */
'use strict';
const crypto = require('crypto');
const { E } = require('../msg.js');
const ST = require('./stages.js');
const { matchScore } = require('./tour-score.js');
const { cleanPublicText } = require('./shared.js');
const Spec = require('./otour-spec.js');
const { specGuard } = require('./otour.js');

const MAX_SETS = 9;
const MAX_POINT = 999;
const pair = (x) => {
  if (!Array.isArray(x) || x.length !== 2) return null;
  const [a, b] = x.map((v) => Math.floor(Number(v)));
  return Number.isFinite(a) && Number.isFinite(b) && a >= 0 && b >= 0 && a <= MAX_POINT && b <= MAX_POINT ? [a, b] : null;
};
const teamName = (s) => cleanPublicText(s, 40).replace(/[<>]/g, '').trim();

class OTourRun {
  // ------------------------------------------------------------ Đội / người tham gia (trước khi bắt đầu)
  /** Thêm đội từ danh sách tên (mỗi dòng một đội; bỏ trùng, bỏ dòng trống). Trả số đã thêm. */
  otAddTeams(t, names) {
    let n = 0;
    const have = new Set(t.players.map((p) => p.name.toLowerCase()));
    for (const raw of (Array.isArray(names) ? names : []).slice(0, Spec.MAX_TEAMS)) {
      const name = teamName(raw);
      if (!name || have.has(name.toLowerCase())) continue;
      if (t.players.length >= Spec.MAX_TEAMS) throw E('ot_many_teams', { n: Spec.MAX_TEAMS });
      have.add(name.toLowerCase());
      t.players.push({ uid: 't:' + crypto.randomBytes(5).toString('hex'), name });
      n++;
    }
    return n;
  }

  otDraft(conn, id) {
    const r = this.otManaged(conn, id);
    if (r.t.status !== 'draft') throw E('tour_closed');
    return r;
  }

  on_otTeamsAdd(conn, { id, names }) {
    const { t, me } = this.otDraft(conn, id);
    const n = this.otAddTeams(t, names);
    if (n) { this.otLog(t, me.id, 'teams_added', { n }); this.otSave(t); }
  }

  on_otTeamDel(conn, { id, team }) {
    const { t, me } = this.otDraft(conn, id);
    const p = t.players.find((x) => x.uid === team);
    if (!p) return;
    t.players = t.players.filter((x) => x !== p);
    this.otLog(t, me.id, 'team_removed', { name: p.name });
    this.otSave(t);
  }

  /** Đổi tên đội (cả khi giải đang chạy – sửa lỗi gõ). */
  on_otTeamRename(conn, { id, team, name }) {
    const { t } = this.otManaged(conn, id);
    const p = t.players.find((x) => x.uid === team);
    const n = teamName(name);
    if (!p || !n) throw E('bad_message');
    if (t.players.some((x) => x !== p && x.name.toLowerCase() === n.toLowerCase())) throw E('ot_team_dup');
    p.name = n;
    this.otMemo?.delete(t); // giai đoạn đã xong được dựng sẵn (otShared) – dựng lại cho đúng tên mới
    this.otSave(t);
  }

  /** Thứ tự hạt giống (trước khi bắt đầu): order = mảng mã đội, đội thiếu xếp sau theo thứ tự cũ. */
  on_otSeeds(conn, { id, order }) {
    const { t } = this.otDraft(conn, id);
    const rank = new Map((Array.isArray(order) ? order : []).map((u, i) => [String(u), i]));
    t.players.sort((a, b) => (rank.has(a.uid) ? rank.get(a.uid) : 1e6) - (rank.has(b.uid) ? rank.get(b.uid) : 1e6));
    this.otSave(t);
  }

  // ------------------------------------------------------------ Bắt đầu / kết thúc
  otSeedOf(t) {
    return (uid) => (t.players.find((p) => p.uid === uid) || {}).seed || 999;
  }

  on_otStart(conn, { id }) {
    const { t, me } = this.otDraft(conn, id);
    const teams = t.players.filter((p) => !p.withdrawn);
    specGuard(() => Spec.checkSize(t, teams.length));
    teams.forEach((p, i) => { p.seed = i + 1; });
    t.st = [ST.buildStage(t.stages[0], 0, teams.map((p) => p.uid), { seedOf: this.otSeedOf(t), isActive: () => true })];
    t.stage = 0;
    t.status = 'running';
    t.startedAt = Date.now();
    this.otLog(t, me.id, 'started', { n: teams.length });
    this.otSave(t);
  }

  /** Giai đoạn vừa xong: bốc thăm giai đoạn sau theo thành tích, hoặc kết thúc giải. */
  otNextStage(t) {
    const st = t.st[t.stage];
    if (t.stage >= t.stages.length - 1) {
      t.status = 'finished';
      t.finishedAt = Date.now();
      t.podium = ST.podium(st, this.otSeedOf(t)).slice(0, 4);
      return;
    }
    const { seeds, groupOf } = ST.advancers(st, this.otSeedOf(t));
    const going = new Set(seeds);
    for (const u of st.entrants) { const p = t.players.find((x) => x.uid === u); if (p && !going.has(u)) p.out = 'not_advanced'; }
    t.stage++;
    t.st.push(ST.buildStage(t.stages[t.stage], t.stage, seeds, { groupOf, seedOf: this.otSeedOf(t), isActive: () => true }));
  }

  // ------------------------------------------------------------ Kết quả
  /** Trận chưa xong / đã xong của giai đoạn hiện tại, đủ hai đội. */
  otMatch(t, match) {
    if (t.status !== 'running') throw E('tour_not_running');
    const i = /^s(\d+)/.exec(String(match || ''));
    const st = i && t.st[Number(i[1])];
    const m = st && st.matches[match];
    if (!m || st !== t.st[t.stage]) throw E('tour_match_not_found');
    if (!ST.real(m.a) || !ST.real(m.b)) throw E('tour_match_not_ready');
    return { st, m };
  }

  /**
   * Nhập kết quả: score [a, b] (+ pen [a, b] khi hoà ở loại trực tiếp) | sets [[a, b], …] | winner (mã đội) / draw.
   * Trận đã có kết quả thì phải huỷ trước (on_otUndo) – tránh nhập đè nhầm.
   */
  on_otScore(conn, { id, match, score, pen, sets, winner, draw }) {
    const { t, me } = this.otManaged(conn, id);
    const { st, m } = this.otMatch(t, match);
    if (m.done) throw E('tour_match_done');
    const elim = ST.isElim(st.type);
    let w;
    if (t.result === 'score') {
      const s = pair(score);
      if (!s) throw E('tour_score_bad');
      const p = pen == null ? null : pair(pen);
      if (pen != null && !p) throw E('tour_score_bad');
      w = s[0] > s[1] ? m.a : s[1] > s[0] ? m.b : null;
      if (w === null && p && p[0] !== p[1]) w = p[0] > p[1] ? m.a : m.b;
      if (w === null && elim) throw E('ot_need_pen');
      Object.assign(m, { score: s, extra: w !== null && s[0] === s[1] ? p : null, sets: null, wins: { [m.a]: s[0], [m.b]: s[1] } });
    } else if (t.result === 'sets') {
      const list = Array.isArray(sets) ? sets.slice(0, MAX_SETS).map(pair) : [];
      if (!list.length || list.some((x) => !x)) throw E('tour_score_bad');
      const { ka, kb } = matchScore(list, 'sets');
      w = ka > kb ? m.a : kb > ka ? m.b : null;
      if (w === null && elim) throw E('tour_score_tie');
      Object.assign(m, { sets: list, extra: null, wins: { [m.a]: ka, [m.b]: kb } });
    } else {
      const tie = draw === true && !elim;
      if (!tie && winner !== m.a && winner !== m.b) throw E('tour_score_bad');
      w = tie ? null : winner;
      Object.assign(m, { quick: true, sets: null, extra: null, wins: tie ? { [m.a]: 0, [m.b]: 0 } : { [w]: 1, [w === m.a ? m.b : m.a]: 0 } });
    }
    ST.recordResult(st, m, w, { seedOf: this.otSeedOf(t), isActive: () => true });
    st.v = (st.v || 0) + 1;
    const name = (u) => (t.players.find((p) => p.uid === u) || {}).name || '?';
    this.otLog(t, me.id, 'score', { a: name(m.a), b: name(m.b), s: m.score ? m.score.join('-') : m.sets ? m.sets.map((x) => x.join('-')).join(' ') : w ? name(w) : '½' });
    if (st.done) this.otNextStage(t);
    this.otSave(t);
  }

  /** Huỷ kết quả (như giải Caro – tour-score.js): chỉ khi các trận nhận người thắng / thua của nó chưa có kết quả. */
  on_otUndo(conn, { id, match }) {
    const { t, me } = this.otManaged(conn, id);
    const { st, m } = this.otMatch(t, match);
    if (!m.done || m.bye || m.split) throw E('tour_undo_locked');
    if (ST.isElim(st.type)) {
      const targets = [m.next, m.loserTo].filter(Boolean).map((r) => ({ r, x: st.matches[r.to] }));
      if (targets.some(({ x }) => x.done)) throw E('tour_undo_locked');
      const g2 = m.gf === 1 && st.gf[1] && st.matches[st.gf[1]];
      if (g2 && g2.done && !g2.skipped) throw E('tour_undo_locked');
      for (const { r, x } of targets) x[r.slot] = null;
      if (g2) Object.assign(g2, { done: false, skipped: false, winner: null, loser: null, a: null, b: null });
    } else if (st.type === 'swiss' && m.round < st.rounds.length - 1) throw E('tour_undo_locked');
    Object.assign(m, { done: false, winner: null, loser: null, wins: {}, score: null, sets: null, extra: null, quick: false, double: false });
    st.done = false;
    st.v = (st.v || 0) + 1;
    this.otLog(t, me.id, 'undo', { match: m.id });
    this.otSave(t);
  }
}

module.exports = { OTourRun };
