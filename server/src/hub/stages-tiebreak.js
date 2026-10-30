/*
 * Thể thức thi đấu – bảng điểm và xếp hạng của vòng tròn / Thụy Sĩ (như Challonge, theo quy chế tie-break FIDE):
 *  - Điểm: trận thắng / hoà / thua (points.w/d/l) + mỗi ván thắng / hoà (points.gw/gt) + miễn đấu (points.bye).
 *  - Xếp theo (rankBy, vòng tròn): điểm · số trận thắng · số ván thắng · tỉ lệ thắng ván · hiệu số ván. Thụy Sĩ luôn theo điểm.
 *  - Tie-break tối đa MAX_TB cấp (tiebreaks), mỗi cấp một tiêu chí: đối đầu (bảng điểm riêng giữa những người bằng nhau),
 *    Buchholz (đủ / Cut-1 / Cut-2 / Median / Median-2 / Fore / trung bình Buchholz đối thủ), Sonneborn–Berger, Koya, điểm
 *    luỹ tiến, số trận thắng (mọi trận / thắng thật), số ván đi sau, Elo trung bình đối thủ (ARO, Cut-1), Elo thành tích
 *    (TPR, trung bình TPR đối thủ), hiệu số ván, số ván thắng, tỉ lệ thắng ván. Cuối cùng là hạt giống.
 *    Phần tính các hệ số mở rộng và cách xử lý trận không đấu theo FIDE: stages-tb-calc.js.
 * Dùng bởi stages-groups.js (bảng điểm, người đi tiếp) và stages.js (chuẩn hoá cấu hình).
 */
'use strict';
const { real } = require('./stages-base.js');
const { extend } = require('./stages-tb-calc.js');

const RANK_BY = ['points', 'match_wins', 'game_wins', 'game_pct', 'game_diff'];
const TIEBREAKS = ['h2h', 'bh', 'bh1', 'bh2', 'mbh', 'mbh2', 'fb', 'aob', 'sb', 'koya', 'ps', 'wins', 'won', 'bpg', 'aro', 'aroc1', 'tpr', 'apro',
  'gdiff', 'gwins', 'gpct'];
const MAX_TB = 5;
// Mặc định giữ đúng cách xếp của bản trước: vòng tròn đối đầu → hiệu số → số ván thắng; Thụy Sĩ Buchholz → SB → số trận thắng
const DEFAULT_TB = { roundrobin: ['h2h', 'gdiff', 'gwins'], swiss: ['bh', 'sb', 'wins'] };

/** Danh sách tie-break hợp lệ (không trùng, tối đa MAX_TB); không có thì dùng mặc định theo thể thức. */
function normalizeTiebreaks(list, type) {
  if (!Array.isArray(list)) return [...(DEFAULT_TB[type] || DEFAULT_TB.roundrobin)];
  const out = [];
  for (const x of list) if (TIEBREAKS.includes(x) && !out.includes(x) && out.length < MAX_TB) out.push(x);
  return out;
}

const pct = (x) => (x.gw + x.gl ? x.gw / (x.gw + x.gl) : 0);
const PRIMARY = {
  points: (x) => x.pts, match_wins: (x) => x.w, game_wins: (x) => x.gw, game_pct: pct, game_diff: (x) => x.gw - x.gl,
};
const KEY = {
  wins: (x) => x.w, gdiff: (x) => x.gw - x.gl, gwins: (x) => x.gw, gpct: pct,
};
// Các hệ số lưu sẵn trong thống kê (tally + stages-tb-calc.js) cùng tên
for (const k of TIEBREAKS) if (!KEY[k] && k !== 'h2h') KEY[k] = (x) => x[k];
/** Giá trị một tie-break của một người (bảng xếp hạng hiện cột); đối đầu không có giá trị riêng. */
const tbValue = (k, x) => (KEY[k] ? Math.round(KEY[k](x) * 100) / 100 : null);

/**
 * Thống kê từng người trong vòng (vòng tròn / Thụy Sĩ). only: chỉ tính cho những người này.
 * ctx.rating(uid): Elo (cho ARO / TPR). x.rs: từng vòng của người đó (stages-tb-calc.js).
 */
function tally(st, only, ctx) {
  const p = { w: 1, d: 0, l: 0, ...st.cfg.points };
  const gw = p.gw || 0, gt = p.gt || 0, bye = p.bye == null ? p.w : p.bye;
  const s = {};
  for (const uid of only || st.entrants) s[uid] = { uid, mp: 0, w: 0, d: 0, l: 0, gw: 0, gl: 0, gt: 0, pts: 0, opps: [], beat: [], drew: [], byes: 0, rs: [], bpg: 0 };
  for (const m of Object.values(st.matches)) {
    if (!m.done) continue;
    if (m.bye) { // miễn đấu (Thụy Sĩ): tính như thắng, điểm riêng
      if (s[m.winner]) { s[m.winner].pts += bye; s[m.winner].w++; s[m.winner].byes++; s[m.winner].rs.push({ r: m.round, o: null, pts: bye, f: 1, played: false }); }
      continue;
    }
    const ties = (m.games || []).filter((g) => g && (g.draw || g.w === null)).length; // ván hoà (kín bàn)
    for (const [me, op] of [[m.a, m.b], [m.b, m.a]]) {
      const x = s[me];
      if (!x || !real(me)) continue;
      const before = x.pts;
      x.mp++;
      x.opps.push(op);
      x.gw += m.wins[me] || 0;
      x.gl += m.wins[op] || 0;
      x.gt += ties;
      x.pts += (m.wins[me] || 0) * gw + ties * gt;
      // Ván đi sau: ván đầu do m.first đi trước, các ván sau trong trận đổi bên (bracket.js)
      if (m.first) (m.games || []).forEach((g, i) => { if ((i % 2 === 0) !== (m.first === me)) x.bpg++; });
      let f = 0;
      if (m.double) { x.l++; x.pts += p.l; } // cả hai vắng mặt: đều thua
      else if (m.winner === null) { x.d++; x.pts += p.d; x.drew.push(op); f = 0.5; } else if (m.winner === me) { x.w++; x.pts += p.w; x.beat.push(op); f = 1; } else { x.l++; x.pts += p.l; }
      x.rs.push({ r: m.round, o: op, pts: x.pts - before, f, played: !m.double && !m.walkover });
    }
  }
  // Buchholz (tổng điểm các đối thủ), Median-Buchholz (bỏ cao nhất và thấp nhất khi có ≥ 3 đối thủ),
  // Sonneborn–Berger (điểm đối thủ mình thắng + ½ hoà)
  for (const x of Object.values(s)) {
    const op = x.opps.map((o) => (s[o] ? s[o].pts : 0)).sort((a, b) => a - b);
    x.bh = op.reduce((t, v) => t + v, 0);
    x.mbh = op.length >= 3 ? x.bh - op[0] - op[op.length - 1] : x.bh;
    x.sb = x.beat.reduce((t, o) => t + (s[o] ? s[o].pts : 0), 0) + x.drew.reduce((t, o) => t + (s[o] ? s[o].pts / 2 : 0), 0);
  }
  return extend(st, s, ctx);
}

/** Các trận đã đấu của từng người (dựng một lần cho mỗi lần xếp hạng – đối đầu dùng lại cho mọi nhóm bằng nhau). */
function playedBy(st) {
  const by = new Map();
  for (const m of Object.values(st.matches)) {
    if (!m.done || m.bye || m.double || !real(m.a) || !real(m.b)) continue;
    for (const u of [m.a, m.b]) { if (!by.has(u)) by.set(u, []); by.get(u).push(m); }
  }
  return by;
}
/** Bảng điểm riêng giữa một nhóm người (đối đầu): điểm thắng / hoà như vòng chính, chỉ tính trận giữa họ. */
function miniPoints(st, group, by) {
  const p = { w: 1, d: 0, l: 0, ...st.cfg.points };
  const inG = new Set(group);
  const pts = Object.fromEntries(group.map((u) => [u, 0]));
  for (const u of group) {
    for (const m of by.get(u) || []) {
      if (m.a !== u || !inG.has(m.b)) continue; // mỗi trận tính một lần (từ phía người ô a)
      if (m.winner === null) { pts[m.a] += p.d; pts[m.b] += p.d; } else { pts[m.winner] += p.w; pts[m.winner === m.a ? m.b : m.a] += p.l; }
    }
  }
  return pts;
}

const near = (a, b) => Math.abs(a - b) < 1e-9;
/** Sắp giảm dần theo key rồi tách thành các nhóm bằng nhau. */
function groupsBy(list, key) {
  const sorted = [...list].sort((a, b) => key(b) - key(a));
  const out = [];
  for (const u of sorted) {
    const last = out[out.length - 1];
    if (last && near(key(last[0]), key(u))) last.push(u); else out.push([u]);
  }
  return out;
}

/**
 * Xếp hạng một nhóm người: tiêu chí chính → các tie-break lần lượt (chỉ trong nhóm còn bằng nhau) → hạt giống.
 * seedOf.rating (nếu có): Elo của người chơi cho ARO / TPR.
 */
function rankList(st, uids, seedOf) {
  const s = tally(st, uids, { rating: seedOf.rating });
  const primary = PRIMARY[st.type === 'swiss' ? 'points' : st.cfg.rankBy] || PRIMARY.points;
  const tbs = normalizeTiebreaks(st.cfg.tiebreaks, st.type);
  let by = null; // chỉ dựng khi có nhóm cần xét đối đầu
  const refine = (group, level) => {
    if (group.length < 2) return group;
    if (level >= tbs.length) return [...group].sort((a, b) => seedOf(a) - seedOf(b));
    const tb = tbs[level];
    let key;
    if (tb === 'h2h') { const mini = miniPoints(st, group, by || (by = playedBy(st))); key = (u) => mini[u]; } else key = (u) => KEY[tb](s[u]);
    return groupsBy(group, key).flatMap((g) => refine(g, level + 1));
  };
  const list = groupsBy(uids, (u) => primary(s[u])).flatMap((g) => refine(g, 0));
  return { list, stats: s };
}

/**
 * So sánh hai người ở hai bảng khác nhau (xếp hạt giống người đi tiếp cùng thứ hạng, vd. các đội nhì bảng):
 * tiêu chí chính → các tie-break trừ đối đầu (hai người chưa gặp nhau) → hạt giống.
 */
function crossCompare(st, seedOf) {
  const primary = PRIMARY[st.type === 'swiss' ? 'points' : st.cfg.rankBy] || PRIMARY.points;
  const tbs = normalizeTiebreaks(st.cfg.tiebreaks, st.type).filter((x) => x !== 'h2h');
  return (a, b) => {
    const d = primary(b.s) - primary(a.s);
    if (!near(d, 0)) return d;
    for (const tb of tbs) { const e = KEY[tb](b.s) - KEY[tb](a.s); if (!near(e, 0)) return e; }
    return seedOf(a.uid) - seedOf(b.uid);
  };
}

module.exports = { RANK_BY, TIEBREAKS, MAX_TB, DEFAULT_TB, normalizeTiebreaks, tally, rankList, crossCompare, tbValue };
