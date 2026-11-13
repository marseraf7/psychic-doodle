/*
 * Hệ Race – cách tính 'pursuit' (đuổi bắt kiểu biathlon / Gundersen – chỉ mô phỏng thể thức). Giai đoạn sau một giai đoạn race
 * tính thời gian (Sprint): người đi tiếp xuất phát chậm đúng số giây thua người nhất Sprint (st.gaps – otour-run.js gán khi dựng
 * giai đoạn); sau giai đoạn nhảy cầu (stages-skijump.js – Nordic combined): mỗi điểm thua đổi ra cfg.pursuit.perPoint giây
 * (Gundersen cá nhân: 1 điểm = 4 giây). Người thua quá cfg.pursuit.wave giây xuất phát cùng lúc ở mốc wave (đúng bằng wave thì
 * vẫn xuất phát theo giây).
 * Xếp hạng: thứ tự qua vạch đích (rank) – thời gian thuần và số vòng phạt chỉ để hiển thị; bỏ cuộc xếp sau người về đích, không
 * xuất phát (không có dòng) xếp cuối. Một chặng duy nhất. Đăng ký vào registry stages-race-plug.js.
 */
'use strict';

const int = (v, lo, hi, def) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def; };
const MAX_TIME = 24 * 3600 * 1000;

function normalize(c, out) {
  const p = c.pursuit && typeof c.pursuit === 'object' ? c.pursuit : {};
  out.events = 1;
  const pp = Math.round(Number(p.perPoint) * 100) / 100;
  out.pursuit = { wave: int(p.wave, 0, 3600, 240), perPoint: pp >= 0.1 && pp <= 60 ? pp : 4 }; // wave 0 = không xuất phát đồng loạt
}

/**
 * Khoảng thua (ms) từ bảng giai đoạn trước: tính thời gian – người nhanh nhất là 0; nhảy cầu – (điểm cao nhất − điểm của mình) ×
 * perPoint giây (người không có điểm xuất phát sau cùng, cùng khoảng thua lớn nhất).
 */
function gapsFrom(tables, seeds, cfg) {
  const jump = {};
  for (const tb of tables || []) for (const u of tb.list) { const s = tb.stats[u]; if (s && s.jump != null) jump[u] = s.jump; }
  if (Object.keys(jump).length) {
    const per = ((cfg && cfg.pursuit && cfg.pursuit.perPoint) || 4) * 1000;
    const best = Math.max(...seeds.filter((u) => jump[u] != null).map((u) => jump[u]));
    const g = Object.fromEntries(seeds.filter((u) => jump[u] != null).map((u) => [u, Math.round((best - jump[u]) * per)]));
    const worst = Math.max(0, ...Object.values(g));
    return Object.fromEntries(seeds.map((u) => [u, g[u] != null ? g[u] : worst]));
  }
  const time = {};
  for (const tb of tables || []) for (const u of tb.list) { const s = tb.stats[u]; if (s && s.time > 0 && s.fin > 0) time[u] = s.time; }
  const best = Math.min(...seeds.filter((u) => time[u] != null).map((u) => time[u]));
  return Number.isFinite(best) ? Object.fromEntries(seeds.map((u) => [u, time[u] != null ? time[u] - best : 0])) : {};
}

/** Gán khoảng thua cho giai đoạn đuổi bắt vừa dựng (st.gapsBy: 'jump' – từ điểm nhảy cầu, 'time' – từ thời gian). */
function attachGaps(st, tables, seeds) {
  st.gaps = gapsFrom(tables, seeds, st.cfg);
  st.gapsBy = (tables || []).some((tb) => tb.list.some((u) => tb.stats[u] && tb.stats[u].jump != null)) ? 'jump' : 'time';
}

/** Danh sách xuất phát: [{ uid, gap (ms), start (ms sau phát súng đầu), wave }] theo khoảng thua. */
function startList(st) {
  const W = st.cfg.pursuit.wave * 1000, g = st.gaps || {};
  return st.entrants.map((u, k) => ({ uid: u, k, gap: g[u] || 0 })).sort((a, b) => a.gap - b.gap || a.k - b.k)
    .map(({ uid, gap }) => ({ uid, gap, start: W && gap > W ? W : gap, ...(W && gap > W ? { wave: true } : {}) }));
}

function clean(st, i, rows, members = st.entrants) {
  if (!Array.isArray(rows) || !rows.length || rows.length > members.length) return { code: 'tour_score_bad' };
  const ok = new Set(members), seen = new Set(), ranks = new Set(), out = [];
  for (const r of rows) {
    const uid = r && String(r.uid);
    if (!ok.has(uid) || seen.has(uid)) return { code: 'tour_score_bad' };
    seen.add(uid);
    const x = { uid };
    if (r.dnf === true) x.dnf = true;
    else {
      const k = Math.floor(Number(r.rank));
      if (!(k >= 1 && k <= rows.length) || ranks.has(k)) return { code: 'ot_race_rank' };
      ranks.add(k);
      x.rank = k;
    }
    const tm = Math.floor(Number(r.time));
    if (r.time != null && r.time !== '' && Number.isFinite(tm) && tm > 0) x.time = Math.min(tm, MAX_TIME);
    const pen = int(r.pen, 0, 40, 0);
    if (pen) x.pen = pen;
    out.push(x);
  }
  return { rows: out };
}

function record(st, i, rows) {
  const ev = st.events[i];
  ev.rows = rows;
  ev.done = true;
  st.done = true;
  return true;
}

function calc(st, seedOf) {
  const ev = st.events[0], by = new Map(((ev && ev.rows) || []).map((x) => [x.uid, x]));
  const grp = (u) => (!by.has(u) ? 2 : by.get(u).dnf ? 1 : 0);
  const order = [...st.entrants].sort((a, b) => (grp(a) - grp(b)) || ((by.get(a) || {}).rank || 0) - ((by.get(b) || {}).rank || 0) || (seedOf(a) - seedOf(b)));
  const stats = Object.fromEntries(st.entrants.map((u) => [u, { uid: u, ...(by.get(u) || {}), gap: (st.gaps || {})[u] || 0 }]));
  return { order, stats };
}

function table(st, seedOf) { const C = calc(st, seedOf); return { list: C.order, stats: C.stats }; }

function view(st, i, adv, side, seedOf) {
  const C = calc(st, seedOf), done = !!(st.events[0] && st.events[0].done);
  const rows = C.order.map((u, k) => {
    const s = C.stats[u];
    return { ...side(u), rank: k + 1, gap: s.gap, ...(s.time ? { time: s.time } : {}), ...(s.pen ? { pen: s.pen } : {}), ...(s.dnf ? { dnf: true } : {}), ...(done && !s.rank && !s.dnf ? { dns: true } : {}), adv: k < adv };
  });
  const events = st.events.map((e) => ({ i: e.i, done: e.done, ...(e.rows ? { rows: e.rows } : {}) }));
  return { index: i, type: 'race', cfg: st.cfg, done: st.done, events, table: rows, pursuit: { start: startList(st).map((x) => ({ ...x, ...side(x.uid) })), ...(st.gapsBy === 'jump' ? { byJump: true } : {}) }, entrants: st.entrants.map(side) };
}

module.exports = { normalize, gapsFrom, attachGaps, startList, clean, record, calc, plug: { normalize, clean, record, table, view } };
