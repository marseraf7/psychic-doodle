/*
 * Hệ Race – cách tính 'golf' (golf đấu gậy kiểu The Masters – chỉ mô phỏng thể thức, không dùng dữ liệu giải thật).
 * Một giai đoạn race có `events` vòng đấu (mặc định 4 vòng × 18 lỗ). Cấu hình:
 *   par   – par từng lỗ (1–18 lỗ, mỗi lỗ 3–6); tổng par là par của một vòng;
 *   input – 'round' nhập tổng số gậy mỗi vòng (mặc định) | 'hole' nhập từng lỗ (bảng dẫn đầu ghi "đã đánh tới lỗ 14");
 *   cut   – { after, top }: sau vòng `after`, chỉ `top` người đầu và cả những người đồng hạng được đánh tiếp (Masters:
 *           sau vòng 2, 50 người + đồng hạng); điểm cộng dồn giữ nguyên;
 *   po    – thứ tự lỗ đấu phụ đột tử khi bằng điểm ở hạng nhất (Masters: 18, 10, lặp lại) – chỉ để hiển thị.
 * Nhập một vòng: gửi cả bảng của vòng (người chưa đánh thì bỏ trống) – lưu được khi đang đánh dở (bảng dẫn đầu trực
 * tiếp); vòng xong khi mọi người còn thi đấu có đủ điểm hoặc rút lui (wd). Nhập lần lượt từng vòng, chỉ huỷ vòng sau cùng.
 * Xếp hạng: số gậy so với par (thấp hơn xếp trên), bằng nhau thì đồng hạng ("T3"); người bị cắt xếp sau ("MC"), người rút
 * lui xếp cuối. Bằng điểm ở hạng nhất khi xong vòng cuối: ban tổ chức ghi người thắng đấu phụ (otour-race.js) rồi giải
 * mới kết thúc. Hàm thuần; stages-race.js gọi khi cfg.score === 'golf'.
 */
'use strict';
const SF = require('./stages-golf-stable.js'); // chấm điểm Stableford (cfg.scoring)

const PAR72 = [4, 5, 4, 3, 4, 3, 4, 5, 4, 4, 4, 3, 5, 4, 5, 3, 4, 4]; // sân par 72 mẫu (2 nửa 36)
const PO = [18, 10]; // lỗ đấu phụ mẫu
const INPUTS = ['round', 'hole'];
const MAX_HOLE = 20; // tối đa số gậy ghi được ở một lỗ
const MAX_TOP = 512;

const int = (v, lo, hi, def) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def; };
const parTotal = (cfg) => cfg.par.reduce((a, b) => a + b, 0);

/** Chuẩn hoá phần riêng của 'golf' vào out (đã có type / events / score). */
function normalizeGolf(c, out) {
  const src = Array.isArray(c.par) ? c.par : typeof c.par === 'string' ? c.par.split(/[\s,;]+/).filter(Boolean) : null;
  out.par = src && src.length ? src.slice(0, 18).map((x) => int(x, 3, 6, 4)) : [...PAR72];
  out.input = INPUTS.includes(c.input) ? c.input : 'round';
  if (c.cut && out.events > 1) out.cut = { after: int(c.cut.after, 1, out.events - 1, Math.min(2, out.events - 1)), top: int(c.cut.top, 1, MAX_TOP, 50) };
  const po = Array.isArray(c.po) ? c.po.map((x) => int(x, 1, out.par.length, 0)).filter(Boolean).slice(0, 18) : [];
  out.po = po.length ? po : PO.filter((h) => h <= out.par.length);
  SF.normalizeStable(c, out);
  return out;
}

/** Điểm một dòng của vòng: { strokes, played (số lỗ đã đánh), toPar, done } – null nếu chưa đánh. */
function scoreOf(cfg, x) {
  if (!x || x.wd) return null;
  if (cfg.input === 'hole') {
    let strokes = 0, par = 0, played = 0;
    (x.h || []).forEach((s, k) => { if (s != null) { strokes += s; par += cfg.par[k]; played++; } });
    return played ? { strokes, played, toPar: strokes - par, done: played === cfg.par.length, ...(cfg.scoring ? { pts: SF.roundPoints(cfg, x) } : {}) } : null;
  }
  return x.s != null ? { strokes: x.s, played: cfg.par.length, toPar: x.s - parTotal(cfg), done: true } : null;
}

/**
 * Tính bảng: mỗi người { rounds: [điểm vòng | null], strokes, toPar, wd (vòng rút lui), cut, cur (điểm vòng đang đánh) };
 * order: thứ tự xếp hạng; leaders: những người dẫn đầu khi đã xong vòng cuối (đấu phụ nếu > 1).
 */
function golfCalc(st, seedOf) {
  const cfg = st.cfg;
  const S = Object.fromEntries(st.entrants.map((u) => [u, { uid: u, rounds: [], strokes: 0, toPar: 0, pts: 0, wd: null, cut: false, played: 0 }]));
  // Khoá xếp hạng (nhỏ xếp trên): số gậy so với par; Stableford: điểm (nhiều xếp trên)
  const key = cfg.scoring ? (s) => -s.pts : (s) => s.toPar;
  let cutDone = false, cutLine = null;
  for (const ev of st.events) {
    if (!ev.rows) continue;
    const by = new Map(ev.rows.map((x) => [x.uid, x]));
    for (const u of st.entrants) {
      const s = S[u], x = by.get(u);
      if (s.wd != null || s.cut) continue;
      if (x && x.wd) { s.wd = ev.i; continue; }
      const sc = scoreOf(cfg, x);
      s.rounds[ev.i] = sc;
      if (sc) { s.strokes += sc.strokes; s.toPar += sc.toPar; s.played += sc.played; s.pts += sc.pts || 0; }
    }
    // Cắt sau vòng cfg.cut.after (khi vòng đó xong): top N + đồng hạng theo số gậy so với par cộng dồn
    if (cfg.cut && ev.done && ev.i === cfg.cut.after - 1) {
      const alive = st.entrants.filter((u) => S[u].wd == null).sort((a, b) => key(S[a]) - key(S[b]));
      if (alive.length > cfg.cut.top) {
        cutLine = key(S[alive[cfg.cut.top - 1]]);
        for (const u of alive) if (key(S[u]) > cutLine) S[u].cut = true;
      }
      cutDone = true;
    }
  }
  const all = st.events.every((e) => e.done);
  const grp = (s) => (s.wd != null ? 2 : s.cut ? 1 : 0);
  const order = [...st.entrants].sort((a, b) => {
    const x = S[a], y = S[b];
    return (grp(x) - grp(y)) || (x.wd != null && y.wd != null ? y.wd - x.wd : 0) || (key(x) - key(y)) || (y.played - x.played) || (seedOf(a) - seedOf(b));
  });
  const active = order.filter((u) => grp(S[u]) === 0 && S[u].played);
  let leaders = [];
  if (all && active.length) leaders = active.filter((u) => key(S[u]) === key(S[active[0]]));
  // Đã có người thắng đấu phụ: lên đầu bảng
  if (st.playoff && leaders.includes(st.playoff.winner)) { order.splice(order.indexOf(st.playoff.winner), 1); order.unshift(st.playoff.winner); }
  // Vạch cắt gửi trình duyệt: số gậy so với par, hoặc điểm (Stableford)
  return { stats: S, order, active, leaders, cutDone, cutLine: cutLine != null && cfg.scoring ? -cutLine : cutLine, all, key };
}

/** Người còn thi đấu ở vòng i (chưa rút lui ở vòng trước, không bị cắt). */
function eligible(st, i) {
  const C = golfCalc({ ...st, events: st.events.filter((e) => e.i < i) }, () => 0);
  return st.entrants.filter((u) => C.stats[u].wd == null && !C.stats[u].cut);
}

/**
 * Kiểm bảng của vòng i. rows: [{ uid, s? (tổng gậy – nhập theo vòng) | h? (mảng số gậy từng lỗ, null = chưa đánh), wd? }].
 * Người chưa có dòng = chưa đánh (lưu dở được). Trả { rows } hoặc { code }.
 */
function cleanRound(st, i, rows) {
  const cfg = st.cfg, H = cfg.par.length;
  if (!Array.isArray(rows) || rows.length > st.entrants.length) return { code: 'tour_score_bad' };
  const ok = new Set(eligible(st, i)), all = new Set(st.entrants), seen = new Set(), out = [];
  for (const r of rows) {
    const uid = r && String(r.uid);
    if (!all.has(uid) || seen.has(uid)) return { code: 'tour_score_bad' };
    if (!ok.has(uid)) return { code: 'ot_golf_out' };
    seen.add(uid);
    if (r.wd === true) { out.push({ uid, wd: true }); continue; }
    if (cfg.input === 'hole') {
      if (!Array.isArray(r.h) || r.h.length > H) return { code: 'ot_golf_bad' };
      const h = Array.from({ length: H }, (_, k) => (r.h[k] == null || r.h[k] === '' ? null : Math.floor(Number(r.h[k]))));
      if (h.some((s) => s != null && !(s >= 1 && s <= MAX_HOLE))) return { code: 'ot_golf_bad' };
      if (h.every((s) => s == null)) continue; // dòng trống = chưa đánh
      const hcp = SF.cleanHcp(cfg, r.hcp);
      out.push({ uid, h, ...(hcp != null ? { hcp } : {}) });
    } else {
      if (r.s == null || r.s === '') continue;
      const s = Math.floor(Number(r.s));
      if (!(s >= H && s <= H * MAX_HOLE)) return { code: 'ot_golf_bad' };
      out.push({ uid, s });
    }
  }
  if (!out.length) return { code: 'ot_race_empty' };
  return { rows: out };
}

/** Ghi bảng vòng i; vòng xong khi mọi người còn thi đấu có đủ điểm / rút lui. Trả true nếu cả giai đoạn đã xong. */
function recordRound(st, i, rows) {
  const ev = st.events[i];
  ev.rows = rows;
  const by = new Map(rows.map((x) => [x.uid, x]));
  ev.done = eligible(st, i).every((u) => { const x = by.get(u); return x && (x.wd || (scoreOf(st.cfg, x) || {}).done); });
  return settle(st);
}

/** Giai đoạn xong: mọi vòng xong và không cần đấu phụ (hoặc đã có người thắng đấu phụ). */
function settle(st) {
  const C = golfCalc(st, () => 0);
  st.done = C.all && (C.leaders.length <= 1 || !!(st.playoff && C.leaders.includes(st.playoff.winner)));
  return st.done;
}

const fmtPar = (n) => (n === 0 ? 'E' : n > 0 ? '+' + n : '−' + -n);

/**
 * Phần gửi cho client (stages-race.js – raceView gọi khi 'golf'). Bảng dẫn đầu: vị trí (đồng hạng "T"), so với par,
 * vòng đang đánh (so với par + "đã đánh tới lỗ"), điểm từng vòng, tổng gậy; người bị cắt / rút lui. v.golf: vạch cắt,
 * đấu phụ, thống kê từng lỗ (khi nhập từng lỗ), vòng thấp nhất. events[i].rows: bảng đã lưu của vòng (để sửa tiếp).
 */
function golfView(st, i, adv, side, seedOf) {
  const cfg = st.cfg, C = golfCalc(st, seedOf), S = C.stats;
  const curIdx = st.events.findIndex((e) => !e.done);
  // Người thắng đấu phụ đứng riêng hạng 1; những người thua đấu phụ đồng hạng 2
  const champ = st.playoff && C.leaders.includes(st.playoff.winner) ? st.playoff.winner : null;
  let prevPar = null, pos = 0;
  const table = C.order.map((u, k) => {
    const s = S[u], on = s.wd == null && !s.cut;
    if (on && (C.key(s) !== prevPar || (champ && k === 1))) { pos = k + 1; prevPar = C.key(s); }
    const r = { ...side(u), rank: on ? pos : k + 1, toPar: s.played ? s.toPar : null, total: s.played ? s.strokes : null,
      rounds: st.events.map((e) => (s.rounds[e.i] ? s.rounds[e.i].strokes : null)), adv: on && k < adv, time: null };
    if (on) {
      r.tie = u !== champ && C.order.some((v, j) => j !== k && v !== champ && S[v].wd == null && !S[v].cut && S[v].played && C.key(S[v]) === C.key(s));
      const cur = curIdx >= 0 ? s.rounds[curIdx] : null;
      if (cur) { r.today = cur.toPar; r.thru = cur.done ? 'F' : cur.played; if (cfg.scoring) r.todayPts = cur.pts; }
    }
    if (cfg.scoring && s.played) { r.pts = s.pts; r.roundPts = st.events.map((e) => (s.rounds[e.i] ? s.rounds[e.i].pts : null)); }
    if (s.cut) r.cut = true;
    if (s.wd != null) r.wd = s.wd + 1;
    return r;
  });
  if (champ && table.length) table[0].po = true;
  const events = st.events.map((ev) => ({ i: ev.i, done: ev.done, ...(ev.rows ? { rows: ev.rows } : {}) }));
  const golf = { par: parTotal(cfg), cutLine: C.cutLine, cutDone: C.cutDone };
  if (C.all && C.leaders.length > 1) golf.playoff = { leaders: C.leaders.map(side), winner: st.playoff ? st.playoff.winner : null, holes: st.playoff ? st.playoff.holes : null };
  // Vòng thấp nhất
  let low = null;
  for (const ev of st.events) for (const x of ev.rows || []) { const sc = scoreOf(cfg, x); if (sc && sc.done && (!low || sc.strokes < low.strokes)) low = { ...side(x.uid), strokes: sc.strokes, round: ev.i + 1 }; }
  if (low) golf.low = low;
  // Thống kê từng lỗ (nhập từng lỗ): trung bình, số eagle (−2 trở xuống), birdie, par, bogey, double bogey trở lên
  if (cfg.input === 'hole') {
    golf.holes = cfg.par.map((p, k) => {
      const h = { h: k + 1, par: p, n: 0, sum: 0, eagle: 0, birdie: 0, par0: 0, bogey: 0, dbl: 0 };
      for (const ev of st.events) for (const x of ev.rows || []) {
        const s = x.h && x.h[k];
        if (s == null) continue;
        h.n++; h.sum += s;
        const d = s - p;
        if (d <= -2) h.eagle++; else if (d === -1) h.birdie++; else if (d === 0) h.par0++; else if (d === 1) h.bogey++; else h.dbl++;
      }
      return h;
    });
  }
  const ok = curIdx >= 0 ? new Set(eligible(st, curIdx)) : new Set();
  const entrants = st.entrants.map((u) => ({ ...side(u), ...(ok.has(u) ? {} : { out: true }) }));
  return { index: i, type: 'race', cfg, done: st.done, events, table, golf, entrants };
}

module.exports = { PAR72, PO, normalizeGolf, scoreOf, golfCalc, eligible, cleanRound, recordRound, settle, golfView, fmtPar, parTotal };
