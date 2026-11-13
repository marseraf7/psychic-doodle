/*
 * Hệ Race – cách tính 'skijump' (nhảy cầu tính điểm – phần đầu của Nordic combined kiểu Gundersen; chỉ mô phỏng thể thức).
 * Mỗi chặng là một lượt nhảy: ban tổ chức nhập điểm của từng người (0–300, một chữ số thập phân – điểm cự ly + điểm phong cách
 * + bù gió / bục xuất phát đã cộng sẵn); bỏ trống = không nhảy, dnf / dsq = không tính. Xếp theo tổng điểm các lượt (nhiều xếp
 * trên); bằng điểm thì đồng hạng (hạt giống chỉ để sắp thứ tự hiển thị).
 * Giai đoạn đuổi bắt (stages-pursuit.js) sau giai đoạn này đổi điểm thua ra giây (cfg.pursuit.perPoint – Gundersen cá nhân:
 * 1 điểm = 4 giây). Nhập lần lượt từng lượt nhảy. Đăng ký vào stages-race-plug.js.
 */
'use strict';

const MAX_PTS = 300;
const int = (v, lo, hi, def) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def; };

function normalize(c, out) {
  out.events = int(c.events, 1, 4, 1);
}

/** Điểm ×10 (số nguyên) của một dòng, null nếu không hợp lệ. */
function tenth(v) {
  if (v === '' || v == null) return null;
  const n = Math.round(Number(v) * 10);
  return Number.isFinite(n) && n >= 0 && n <= MAX_PTS * 10 ? n : undefined;
}

function clean(st, i, rows, members = st.entrants) {
  if (!Array.isArray(rows) || !rows.length || rows.length > members.length) return { code: 'tour_score_bad' };
  const ok = new Set(members), seen = new Set(), out = [];
  for (const r of rows) {
    const uid = r && String(r.uid);
    if (!ok.has(uid) || seen.has(uid)) return { code: 'tour_score_bad' };
    seen.add(uid);
    if (r.dsq === true) { out.push({ uid, dsq: true }); continue; }
    if (r.dnf === true) { out.push({ uid, dnf: true }); continue; }
    const p = tenth(r.pts);
    if (p === undefined) return { code: 'ot_sj_pts', args: { n: MAX_PTS } };
    if (p === null) continue; // trống: không nhảy
    out.push({ uid, p });
  }
  if (!out.length) return { code: 'ot_race_empty' };
  return { rows: out };
}

function record(st, i, rows) {
  const ev = st.events[i];
  ev.rows = rows;
  ev.done = true;
  st.done = st.events.every((e) => e.done);
  return st.done;
}

/** Bảng: { uid, jumps: [điểm | null], jump (tổng, số thập phân), fin (số lượt có điểm), out (dnf / dsq) }. */
function calc(st, seedOf = () => 0) {
  const S = Object.fromEntries(st.entrants.map((u) => [u, { uid: u, jumps: st.events.map(() => null), t: 0, fin: 0, out: null }]));
  for (const ev of st.events) {
    if (!ev.done) continue;
    for (const x of ev.rows) {
      const s = S[x.uid];
      if (!s) continue;
      if (x.dnf || x.dsq) { s.out = s.out || (x.dsq ? 'dsq' : 'dnf'); continue; }
      s.jumps[ev.i] = x.p / 10;
      s.t += x.p;
      s.fin++;
    }
  }
  const grp = (s) => (s.out ? 2 : s.fin ? 0 : 1);
  const order = [...st.entrants].sort((a, b) => grp(S[a]) - grp(S[b]) || S[b].t - S[a].t || seedOf(a) - seedOf(b));
  for (const u of st.entrants) S[u].jump = S[u].fin && !S[u].out ? S[u].t / 10 : null;
  return { stats: S, order };
}

function table(st, seedOf) { const C = calc(st, seedOf); return { list: C.order, stats: C.stats }; }

function view(st, i, adv, side, seedOf) {
  const C = calc(st, seedOf);
  let prev = null, pos = 0;
  const rows = C.order.map((u, k) => {
    const s = C.stats[u], key = s.out ? null : s.t;
    if (key === null || key !== prev) { pos = k + 1; prev = key; }
    return { ...side(u), rank: pos, jumps: s.jumps, total: s.jump, ...(s.out ? { [s.out]: true } : {}), adv: k < adv };
  });
  const events = st.events.map((e) => ({ i: e.i, done: e.done, ...(e.rows ? { rows: e.rows.map((x) => ({ uid: x.uid, ...(x.p != null ? { pts: x.p / 10 } : {}), ...(x.dnf ? { dnf: true } : {}), ...(x.dsq ? { dsq: true } : {}) })) } : {}) }));
  return { index: i, type: 'race', cfg: st.cfg, done: st.done, events, table: rows, jump: true, entrants: st.entrants.map(side) };
}

module.exports = { MAX_PTS, normalize, clean, record, calc, plug: { normalize, clean, record, table, view } };
