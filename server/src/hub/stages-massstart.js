/*
 * Hệ Race – cách tính 'massstart' (xuất phát đồng loạt kiểu trượt băng tốc độ – chỉ mô phỏng thể thức).
 * cfg.massStart = { laps, sprints: [vòng có điểm giữa đua], mid: điểm giữa đua (3-2-1), final: điểm về đích (60-40-20-10-6-3),
 *                   semis: true → chặng 0 là các bán kết (chia rắn theo hạt giống, mỗi lượt tối đa `heat` người), `adv` người
 *                   đầu mỗi bán kết vào chung kết (chặng 1) }.
 * Nhập mỗi người: thứ tự về đích (rank – trong bán kết của mình), tổng điểm giữa đua (ip ≤ số mốc × điểm cao nhất), bỏ cuộc
 * (dnf) / truất quyền (dsq). Xếp hạng một cuộc đua: tổng điểm (điểm về đích + giữa đua) rồi thứ tự về đích – người về thứ 10
 * thắng cả 3 mốc (9 điểm) xếp trên người về thứ 5 không có điểm; bỏ cuộc xếp sau, truất quyền xếp cuối.
 * Bảng chung: người chạy chung kết theo hạng chung kết, sau đó người dừng ở bán kết (cùng hạng trong bán kết xếp theo điểm).
 * Đăng ký vào registry stages-race-plug.js.
 */
'use strict';

const MAX_HEAT = 24;
const int = (v, lo, hi, def) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def; };
const ints = (a, lo, hi, def, max) => (Array.isArray(a) && a.length ? a.slice(0, max).map((x) => int(x, lo, hi, 0)) : def);

function normalize(c, out) {
  const m = c.massStart && typeof c.massStart === 'object' ? c.massStart : {};
  const laps = int(m.laps, 4, 40, 16);
  const sprints = [...new Set(ints(m.sprints, 1, laps - 1, [4, 8, 12].filter((x) => x < laps), 10))].sort((a, b) => a - b);
  out.massStart = { laps, sprints, mid: ints(m.mid, 0, 20, [3, 2, 1], 6), final: ints(m.final, 0, 200, [60, 40, 20, 10, 6, 3], 12),
    semis: m.semis === true, heat: int(m.heat, 6, MAX_HEAT, MAX_HEAT), adv: int(m.adv, 2, 16, 8) };
  out.events = out.massStart.semis ? 2 : 1;
}

/** Bán kết: chia rắn theo hạt giống (thứ tự entrants) thành ⌈n / heat⌉ lượt. */
function heatsOf(st) {
  const M = st.cfg.massStart, n = st.entrants.length, H = Math.max(1, Math.ceil(n / M.heat));
  const out = Array.from({ length: H }, () => []);
  st.entrants.forEach((u, k) => { const r = Math.floor(k / H), j = k % H; out[r % 2 ? H - 1 - j : j].push(u); });
  return out;
}

/** Điểm + thứ tự một cuộc đua (một lượt): [{ uid, pts, rank, place, dnf, dsq }] đã xếp. */
function rankRace(cfg, rows) {
  const M = cfg.massStart;
  const list = rows.map((x) => ({ ...x, pts: (x.dnf || x.dsq ? 0 : M.final[x.rank - 1] || 0) + (x.dsq ? 0 : x.ip || 0) }));
  const grp = (x) => (x.dsq ? 2 : x.dnf ? 1 : 0);
  list.sort((a, b) => (grp(a) - grp(b)) || (b.pts - a.pts) || ((a.rank || 999) - (b.rank || 999)));
  list.forEach((x, k) => { x.place = k + 1; });
  return list;
}

/** Người được vào chung kết: `adv` người đầu mỗi bán kết. */
function qualifiers(st) {
  const ev = st.events[0];
  if (!st.cfg.massStart.semis || !ev.done) return [];
  const by = new Map(ev.rows.map((x) => [x.uid, x]));
  return heatsOf(st).flatMap((h) => rankRace(st.cfg, h.filter((u) => by.has(u)).map((u) => by.get(u))).filter((x) => !x.dnf && !x.dsq).slice(0, st.cfg.massStart.adv).map((x) => x.uid));
}

/** Người của cuộc đua i. */
const membersOf = (st, i) => (st.cfg.massStart.semis && i === 1 ? qualifiers(st) : st.entrants);

function clean(st, i, rows) {
  const members = membersOf(st, i), M = st.cfg.massStart;
  if (!Array.isArray(rows) || !rows.length || rows.length > members.length) return { code: 'tour_score_bad' };
  const ok = new Set(members), seen = new Set(), out = [];
  // Thứ tự về đích không trùng trong cùng một lượt (bán kết: theo lượt)
  const heatOf = new Map((M.semis && i === 0 ? heatsOf(st) : [members]).flatMap((h, k) => h.map((u) => [u, k])));
  const used = new Set();
  const maxIp = M.sprints.length * Math.max(0, ...M.mid);
  for (const r of rows) {
    const uid = r && String(r.uid);
    if (!ok.has(uid) || seen.has(uid)) return { code: 'tour_score_bad' };
    seen.add(uid);
    const x = { uid };
    if (r.dsq === true) x.dsq = true;
    else if (r.dnf === true) x.dnf = true;
    else {
      const k = Math.floor(Number(r.rank)), key = heatOf.get(uid) + ':' + k;
      if (!(k >= 1 && k <= MAX_HEAT * 2) || used.has(key)) return { code: 'ot_race_rank' };
      used.add(key);
      x.rank = k;
    }
    const ip = int(r.ip, 0, 999, 0);
    if (ip > maxIp) return { code: 'ot_ms_ip', args: { n: maxIp } };
    if (ip && !x.dsq) x.ip = ip;
    out.push(x);
  }
  return { rows: out };
}

function record(st, i, rows) {
  const ev = st.events[i];
  ev.rows = rows;
  ev.done = true;
  st.done = st.events.every((e) => e.done);
  return st.done;
}

/** Bảng chung: người chạy chung kết trước (theo hạng chung kết), rồi người dừng ở bán kết. */
function calc(st, seedOf) {
  const cfg = st.cfg, M = cfg.massStart, S = {};
  for (const u of st.entrants) S[u] = { uid: u, pts: 0, place: null, heat: null, semi: null, final: false };
  const fin = st.events[M.semis ? 1 : 0];
  if (M.semis && st.events[0].done) {
    const by = new Map(st.events[0].rows.map((x) => [x.uid, x]));
    heatsOf(st).forEach((h, k) => rankRace(cfg, h.filter((u) => by.has(u)).map((u) => by.get(u))).forEach((x) => Object.assign(S[x.uid], { heat: k, semi: x.place, pts: x.pts })));
  }
  if (fin.done) rankRace(cfg, fin.rows).forEach((x) => Object.assign(S[x.uid], { final: true, place: x.place, pts: x.pts, dnf: !!x.dnf, dsq: !!x.dsq }));
  const order = [...st.entrants].sort((a, b) => {
    const x = S[a], y = S[b];
    return (y.final - x.final) || (x.final ? x.place - y.place : ((x.semi || 999) - (y.semi || 999)) || (y.pts - x.pts)) || (seedOf(a) - seedOf(b));
  });
  return { stats: S, order };
}

function table(st, seedOf) { const C = calc(st, seedOf); return { list: C.order, stats: C.stats }; }

function view(st, i, adv, side, seedOf) {
  const C = calc(st, seedOf), M = st.cfg.massStart;
  const rows = C.order.map((u, k) => {
    const s = C.stats[u];
    return { ...side(u), rank: k + 1, pts: s.pts, ...(s.final ? { fin: s.place } : {}), ...(s.semi ? { semi: s.semi, heat: s.heat } : {}), ...(s.dnf ? { dnf: true } : {}), ...(s.dsq ? { dsq: true } : {}), adv: k < adv };
  });
  const races = st.events.map((ev) => {
    const groups = (M.semis && ev.i === 0 ? heatsOf(st) : [membersOf(st, ev.i)]).map((h) => h.map(side));
    const res = ev.rows ? rankRace(st.cfg, ev.rows).map((x) => ({ ...x, ...side(x.uid) })) : null;
    return { i: ev.i, done: ev.done, groups, ...(ev.rows ? { rows: ev.rows, res } : {}) };
  });
  return { index: i, type: 'race', cfg: st.cfg, done: st.done, events: races, table: rows, mass: true, entrants: st.entrants.map(side) };
}

module.exports = { MAX_HEAT, normalize, heatsOf, rankRace, qualifiers, membersOf, clean, record, calc, plug: { normalize, clean, record, table, view } };
