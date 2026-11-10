/*
 * Giải đấu Offline – diễn biến giải (otour.js là phần khung): đội / người tham gia, bắt đầu (bốc thăm giai đoạn đầu),
 * nhập kết quả theo kiểu của giải, huỷ kết quả, chuyển giai đoạn, kết thúc. Thể thức dùng chung lõi của giải Caro
 * (stages.js); kết quả:
 *   'score'  – tỉ số [a, b] (bàn thắng / điểm); hoà ở loại trực tiếp phải có luân lưu pen [a, b] (vòng tròn: luân lưu tuỳ
 *              chọn – khúc côn cầu); aet: có đá hiệp phụ. Số bàn ghi vào m.wins nên hiệu số / số bàn thắng là tie-break
 *              'gdiff' / 'gwins' có sẵn.
 *   'sets'   – điểm từng set [[a, b], …], kiểm theo luật set của giải và Bo của trận (otour-rules.js).
 *   m.ext    – trận phân thắng thua ở hiệp phụ / luân lưu / set quyết định: điểm thắng / thua "sát" (points.wx / lx) nếu có.
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
const Rules = require('../../../caro/otour-rules.js');
const PATH = require('../../../caro/otour-path.js');
const PO = require('./stages-playoff.js');

const MAX_POINT = 999;
const pair = (x) => {
  if (!Array.isArray(x) || x.length !== 2) return null;
  const [a, b] = x.map((v) => Math.floor(Number(v)));
  return Number.isFinite(a) && Number.isFinite(b) && a >= 0 && b >= 0 && a <= MAX_POINT && b <= MAX_POINT ? [a, b] : null;
};
const teamName = (s) => cleanPublicText(s, 40).replace(/[<>]/g, '').trim();
/**
 * Một dòng danh sách đội: "Tên đội", "Tên đội | Quốc gia" (league phase tránh hai đội cùng quốc gia gặp nhau) hoặc
 * "Tên | Quốc gia | Đội" (hệ Race: bảng xếp hạng đội – như tay đua và đội đua F1). Tên có dấu | thật thì viết \|.
 */
const YOUNG = /^(u\d{2}|\*|young|trẻ|молодой|青年)$/i;
function parseTeam(raw) {
  const parts = String(raw || '').split(/(?<!\\)\|/).map((x) => x.replace(/\\\|/g, '|'));
  const [name, country, team, flag] = parts;
  const clean = (x, n) => cleanPublicText(x || '', n).replace(/[<>]/g, '').trim();
  // Cột thứ 4: tay đua trẻ (bảng áo trắng của giải xe đạp nhiều chặng) – "U25", "U23", "*", "young", "trẻ"…
  const young = YOUNG.test(String(flag || '').trim());
  return { name: teamName(name), country: clean(country, 20).toUpperCase(), team: clean(team, 40), young };
}

class OTourRun {
  // ------------------------------------------------------------ Đội / người tham gia (trước khi bắt đầu)
  /** Thêm đội từ danh sách tên (mỗi dòng một đội; bỏ trùng, bỏ dòng trống). Trả số đã thêm. */
  otAddTeams(t, names) {
    let n = 0;
    const have = new Set(t.players.map((p) => p.name.toLowerCase()));
    for (const raw of (Array.isArray(names) ? names : []).slice(0, Spec.MAX_TEAMS)) {
      const { name, country, team, young } = parseTeam(raw);
      if (!name || have.has(name.toLowerCase())) continue;
      if (t.players.length >= Spec.MAX_TEAMS) throw E('ot_many_teams', { n: Spec.MAX_TEAMS });
      have.add(name.toLowerCase());
      t.players.push({ uid: 't:' + crypto.randomBytes(5).toString('hex'), name, ...(country ? { country } : {}), ...(team ? { team } : {}), ...(young ? { young: true } : {}) });
      n++;
    }
    if (n && t.exempt && t.exempt.length) this.otMarkExempt(t); // đội có tên trong danh sách đặc cách (otour-next.js)
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

  /** Tuỳ chọn dựng giai đoạn: hạt giống, quốc gia (league phase). */
  otBuildOpts(t, extra = {}) {
    const country = new Map(t.players.map((p) => [p.uid, p.country || '']));
    return { seedOf: this.otSeedOf(t), isActive: () => true, countryOf: (u) => country.get(u) || '', ...extra };
  }

  on_otStart(conn, { id }) {
    const { t, me } = this.otDraft(conn, id);
    if (t.multi) throw E('ot_multi_no_start'); // giải tổng không có trận riêng: bắt đầu từng giải con (otour-multi.js)
    const teams = t.players.filter((p) => !p.withdrawn);
    specGuard(() => Spec.checkSize(t, teams.length));
    teams.forEach((p, i) => { p.seed = i + 1; });
    // Đội hạt giống cao vào thẳng giai đoạn sau (cfg.direct): giữ lại tới lúc bốc thăm giai đoạn đó
    const dp = ST.directPlan(t.stages, teams.map((p) => p.uid));
    t.direct = Object.keys(dp.direct).length ? dp.direct : null;
    t.st = [ST.buildStage(t.stages[0], 0, dp.first, this.otBuildOpts(t))];
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
    // Đội vào thẳng giai đoạn này (hạt giống cao hơn) đứng trước các đội đi tiếp
    const direct = (t.direct && t.direct[t.stage + 1]) || [];
    const adv = ST.advancers(st, this.otSeedOf(t), direct.length ? 1 : 2);
    const { groupOf } = adv;
    const cfg = t.stages[t.stage + 1];
    const seeds = [...direct, ...adv.seeds.filter((u) => !direct.includes(u))];
    // Playoff kiểu nhà nghề Mỹ sau mùa giải (stages-playoff.js): nhánh theo miền, nhất bảng con, play-in – ai đi tiếp
    // theo kế hoạch playoff (không theo số đội đi tiếp của mùa giải)
    const plan = cfg.playoff ? PO.playoffPlan(st, cfg, ST.standings(st, this.otSeedOf(t))) : null;
    const going = new Set(plan ? plan.seeds : adv.seeds);
    for (const u of st.entrants) { const p = t.players.find((x) => x.uid === u); if (p && !going.has(u)) p.out = 'not_advanced'; }
    t.stage++;
    if (plan) {
      const next = ST.buildStage(cfg, t.stage, plan.seeds, this.otBuildOpts(t, { groupOf, slots: plan.slots }));
      PO.attachPre(next, plan);
      t.st.push(next);
      this.otSchedNext(t); // tự xếp lịch giai đoạn mới (otour-sched.js)
      return;
    }
    const slots = this.otPathSlots(t, st, cfg, seeds, groupOf);
    t.st.push(ST.buildStage(cfg, t.stage, seeds, this.otBuildOpts(t, { groupOf, ...(slots ? { slots } : {}) })));
    this.otSchedNext(t);
  }

  /**
   * Nhánh theo vị trí trong bảng (cfg.path = 'groups', caro/otour-path.js): ô vòng 1 lấy từ khuôn (1A–2B, 1E–3…);
   * vòng trước không phải vòng bảng hoặc không hợp khuôn → null (xếp theo hạt giống như thường).
   */
  otPathSlots(t, prev, cfg, seeds, groupOf) {
    if (cfg.path !== 'groups' || prev.type !== 'roundrobin' || !prev.groups || prev.groups.length < 2) return null;
    const k = prev.cfg.advance || 2, G = prev.groups.length, n = prev.cfg.bestNext || 0;
    const pairs = PATH.template(G, k, n);
    if (!pairs || seeds.length !== G * k + n || pairs.length * 2 !== ST.elimSize(cfg.type, seeds.length)) return null;
    const tables = ST.standings(prev, this.otSeedOf(t));
    const thirds = seeds.slice(G * k).map((u) => groupOf[u]);
    return PATH.resolve(pairs, (pos, g) => tables[g] && tables[g].list[pos - 1], thirds);
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
  on_otScore(conn, { id, match, score, legs, pen, pens, aet, sets, winner, draw }) {
    const { t, me } = this.otManaged(conn, id);
    const { st, m } = this.otMatch(t, match);
    if (m.done) throw E('tour_match_done');
    // Không có hoà: loại trực tiếp, Thụy Sĩ theo số thắng / thua
    const elim = ST.isElim(st.type) || !!st.cfg.record;
    let w;
    const bo = ST.boOf(st, m);
    if (t.result === 'score' && elim && bo > 1 && !ST.twoLeg(st, m)) {
      // Loạt Bo ở loại trực tiếp (vd. vòng 1 playoff MLS Bo3): sets = tỉ số từng trận, trận hoà thì pens[i] = luân lưu
      const list = Array.isArray(sets) && sets.length <= bo ? sets.map(pair) : [];
      if (!list.length || list.some((x) => !x)) throw E('tour_score_bad');
      const need = Math.floor(bo / 2) + 1, pk = [];
      let ka = 0, kb = 0;
      list.forEach(([x, y], i) => {
        if (ka >= need || kb >= need) throw E('ot_series_after', { n: i + 1, bo });
        const p = x === y && Array.isArray(pens) && pens[i] != null ? pair(pens[i]) : null;
        if (x === y && (!p || p[0] === p[1])) throw E('ot_need_pen');
        pk.push(p);
        if (x > y || (p && p[0] > p[1])) ka++; else kb++;
      });
      if (ka < need && kb < need) throw E('ot_series_short', { k: need, bo });
      w = ka > kb ? m.a : m.b;
      Object.assign(m, { score: [ka, kb], sets: list, pens: pk.some(Boolean) ? pk : null, extra: null, legs: false, aet: false, ext: false, wins: { [m.a]: ka, [m.b]: kb } });
    } else if (t.result === 'score') {
      // Knock-out 2 lượt: legs [[a, b], [a, b]] (số bàn của ô trên / ô dưới mỗi lượt) → tổng tỉ số, hoà thì luân lưu
      const two = ST.twoLeg(st, m);
      const ls = two && Array.isArray(legs) && legs.length === 2 ? legs.map(pair) : null;
      if (two && (!ls || ls.some((x) => !x))) throw E('tour_score_bad');
      const s = ls ? [ls[0][0] + ls[1][0], ls[0][1] + ls[1][1]] : pair(score);
      if (!s) throw E('tour_score_bad');
      const p = pen == null ? null : pair(pen);
      if (pen != null && !p) throw E('tour_score_bad');
      w = s[0] > s[1] ? m.a : s[1] > s[0] ? m.b : null;
      if (w === null && p && p[0] !== p[1]) w = p[0] > p[1] ? m.a : m.b;
      if (w === null && elim) throw E('ot_need_pen');
      const shootout = w !== null && s[0] === s[1];
      Object.assign(m, { score: s, extra: shootout ? p : null, sets: ls, legs: !!ls, aet: aet === true, ext: aet === true || shootout, wins: { [m.a]: s[0], [m.b]: s[1] } });
    } else if (t.result === 'sets') {
      const list = Array.isArray(sets) && sets.length <= ST.MAX_BO ? sets.map(pair) : [];
      if (!list.length || list.some((x) => !x)) throw E('tour_score_bad');
      const bad = Rules.setsError(t.set || null, list, bo);
      if (bad) throw E(bad.code, bad.args);
      const { ka, kb } = matchScore(list, 'sets');
      w = ka > kb ? m.a : kb > ka ? m.b : null;
      if (w === null && elim) throw E('tour_score_tie');
      Object.assign(m, { sets: list, extra: null, ext: Rules.decidingPlayed(list, bo), wins: { [m.a]: ka, [m.b]: kb } });
    } else {
      const tie = draw === true && !elim;
      if (!tie && winner !== m.a && winner !== m.b) throw E('tour_score_bad');
      w = tie ? null : winner;
      Object.assign(m, { quick: true, sets: null, extra: null, ext: false, wins: tie ? { [m.a]: 0, [m.b]: 0 } : { [w]: 1, [w === m.a ? m.b : m.a]: 0 } });
    }
    ST.recordResult(st, m, w, { seedOf: this.otSeedOf(t), isActive: () => true });
    PO.reseed(st); // NFL: xếp lại cặp vòng sau trong từng miền (cao nhất gặp thấp nhất)
    if (st.type === 'swiss' && !st.done) this.otSchedNext(t); // Thụy Sĩ vừa bốc thăm vòng mới: tự xếp lịch (otour-sched.js)
    st.v = (st.v || 0) + 1;
    const name = (u) => (t.players.find((p) => p.uid === u) || {}).name || '?';
    this.otLog(t, me.id, 'score', { a: name(m.a), b: name(m.b), s: m.score && !m.legs ? m.score.join('-') : m.sets ? m.sets.map((x) => x.join('-')).join(' ') : w ? name(w) : '½' });
    if (st.done) this.otNextStage(t);
    this.otSave(t);
  }

  /** Huỷ kết quả (như giải Caro – tour-score.js): chỉ khi các trận nhận người thắng / thua của nó chưa có kết quả. */
  on_otUndo(conn, { id, match }) {
    const { t, me } = this.otManaged(conn, id);
    const { st, m } = this.otMatch(t, match);
    if (!m.done || m.bye || m.split || PO.undoLocked(st, m)) throw E('tour_undo_locked');
    if (ST.isElim(st.type)) {
      const targets = [m.next, m.loserTo].filter(Boolean).map((r) => ({ r, x: st.matches[r.to] }));
      if (targets.some(({ x }) => x.done)) throw E('tour_undo_locked');
      const g2 = m.gf === 1 && st.gf[1] && st.matches[st.gf[1]];
      if (g2 && g2.done && !g2.skipped) throw E('tour_undo_locked');
      for (const { r, x } of targets) x[r.slot] = null;
      if (g2) Object.assign(g2, { done: false, skipped: false, winner: null, loser: null, a: null, b: null });
    } else if (st.type === 'swiss' && m.round < st.rounds.length - 1) throw E('tour_undo_locked');
    Object.assign(m, { done: false, winner: null, loser: null, wins: {}, score: null, sets: null, pens: null, legs: false, extra: null, aet: false, ext: false, quick: false, double: false });
    st.done = false;
    st.v = (st.v || 0) + 1;
    this.otLog(t, me.id, 'undo', { match: m.id });
    this.otSave(t);
  }
}

module.exports = { OTourRun, parseTeam };
