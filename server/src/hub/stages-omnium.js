/*
 * Hệ Race – cách tính 'omnium' (omnium xe đạp lòng chảo – chỉ mô phỏng thể thức). Bốn đua con là 4 chặng:
 *   0 Scratch, 1 Tempo, 2 Loại dần (elimination) – ban tổ chức nhập thứ hạng về đích; điểm theo bảng cfg.omnium.rank
 *     (mặc định 40, 38, 36… giảm 2 – ban tổ chức phải điền đủ cho mọi người; bỏ cuộc (DNF) xếp cuối đua đó);
 *   3 Points race – mỗi người mang điểm 3 đua đầu vào; nhập tổng điểm sprint (mốc giữa đua 5-3-2-1, mốc cuối gấp đôi),
 *     số vòng hơn (+lap điểm mỗi vòng) / kém (−lap) và thứ tự qua vạch cuối. Điểm có thể âm.
 * Xếp hạng: tổng điểm (nhiều xếp trên); bằng điểm → thứ tự qua vạch ở points race; bỏ cuộc points race xếp sau người về đích.
 * Nhập lần lượt từng đua con. Đăng ký vào registry stages-race-plug.js.
 */
'use strict';

const EVENTS = 4;
const MAX_RANKS = 40;
const DEF_RANK = Array.from({ length: 20 }, (_, k) => 40 - 2 * k); // 40, 38 … 2 (chưa xác minh hạng sâu – ban tổ chức sửa)
const int = (v, lo, hi, def) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def; };

function normalize(c, out) {
  const o = c.omnium && typeof c.omnium === 'object' ? c.omnium : {};
  const src = Array.isArray(o.rank) ? o.rank : typeof o.rank === 'string' ? o.rank.split(/[\s,;]+/).filter(Boolean) : null;
  const rank = src && src.length ? src.slice(0, MAX_RANKS).map((x) => int(x, 0, 100, 0)) : [...DEF_RANK];
  const sprint = Array.isArray(o.sprint) && o.sprint.length ? o.sprint.slice(0, 6).map((x) => int(x, 0, 20, 0)) : [5, 3, 2, 1];
  out.events = EVENTS;
  out.omnium = { rank, lap: int(o.lap, 1, 50, 20), sprint, every: int(o.every, 1, 50, 10), laps: int(o.laps, 10, 400, 100), double: o.double !== false };
}

/** Bảng điểm hạng phải đủ cho mọi người. */
const error = (cfg, n) => (cfg.omnium && n > cfg.omnium.rank.length ? { code: 'ot_omnium_ranks', args: { n } } : null);

/** Điểm theo hạng về đích (DNF: hạng cuối = số người xuất phát). */
const rankPts = (cfg, rank) => cfg.omnium.rank[rank - 1] || 0;

/** Kiểm kết quả đua con i. rows: 0–2 [{ uid, rank | dnf }]; 3 [{ uid, sp, lap, rank | dnf }]. */
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
    if (i === EVENTS - 1) {
      x.sp = int(r.sp, 0, 500, 0);
      x.lap = int(r.lap, -20, 20, 0);
    }
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

/** Bảng: mỗi người { parts: [điểm 4 đua | null], sp, lap, total, fin (thứ tự qua vạch points race), dnf }. */
function calc(st, seedOf) {
  const cfg = st.cfg, O = cfg.omnium;
  const S = Object.fromEntries(st.entrants.map((u) => [u, { uid: u, parts: [null, null, null, null], sp: 0, lap: 0, total: 0, fin: null, dnf: false }]));
  for (const ev of st.events) {
    if (!ev.done || !ev.rows) continue;
    const last = ev.rows.length; // DNF xếp cuối đua đó
    for (const x of ev.rows) {
      const s = S[x.uid];
      if (!s) continue;
      if (ev.i < EVENTS - 1) { s.parts[ev.i] = rankPts(cfg, x.dnf ? last : x.rank); s.total += s.parts[ev.i]; continue; }
      s.sp = x.sp || 0; s.lap = x.lap || 0;
      s.parts[3] = s.sp + s.lap * O.lap;
      s.total += s.parts[3];
      if (x.dnf) s.dnf = true; else s.fin = x.rank;
    }
  }
  const order = [...st.entrants].sort((a, b) => {
    const x = S[a], y = S[b];
    return (x.dnf - y.dnf) || (y.total - x.total) || ((x.fin || 999) - (y.fin || 999)) || (seedOf(a) - seedOf(b));
  });
  return { stats: S, order };
}

function table(st, seedOf) { const C = calc(st, seedOf); return { list: C.order, stats: C.stats }; }

function view(st, i, adv, side, seedOf) {
  const C = calc(st, seedOf);
  const rows = C.order.map((u, k) => {
    const s = C.stats[u];
    return { ...side(u), rank: k + 1, parts: s.parts, sp: s.sp, lap: s.lap, total: s.total, ...(s.dnf ? { dnf: true } : {}), adv: k < adv };
  });
  // Mỗi đua con: các dòng đã nhập (để sửa / xem), điểm theo hạng
  const events = st.events.map((ev) => ({ i: ev.i, done: ev.done, ...(ev.rows ? { rows: ev.rows.map((x) => ({ ...x, ...side(x.uid) })) } : {}) }));
  return { index: i, type: 'race', cfg: st.cfg, done: st.done, events, table: rows, omnium: true, entrants: st.entrants.map(side) };
}

module.exports = { EVENTS, DEF_RANK, normalize, error, clean, record, calc, rankPts, plug: { normalize, error, clean, record, table, view } };
