/*
 * Hệ Race – cách tính 'gt' (giải xe đạp nhiều chặng kiểu Grand Tour: Tour de France, Giro, Vuelta – chỉ mô phỏng thể
 * thức, không dùng dữ liệu giải thật). Một giai đoạn race có `events` chặng; mỗi chặng có loại `kinds[i]`:
 *   'flat' đồng bằng, 'hilly' đồi, 'mtn' núi, 'itt' tính giờ cá nhân.
 * Nhập mỗi chặng: thứ hạng về đích + thời gian (về cùng nhóm thì cùng thời gian), điểm leo núi (kom), điểm nước rút
 * giữa chặng (sp), giây thưởng / phạt thêm (bs: dương = thưởng, âm = phạt), bỏ cuộc (dnf – rời cuộc đua từ chặng đó).
 * Nhiều bảng xếp hạng cùng lúc:
 *   - Tổng thời gian (áo vàng): cộng thời gian các chặng, trừ giây thưởng (về đích top 3 chặng thường: 10–6–4 giây nếu
 *     bật `bonus`, cộng giây thưởng / phạt nhập tay). Bằng nhau: tổng thứ hạng các chặng ít hơn, rồi hạt giống.
 *   - Tính điểm (áo xanh): điểm về đích theo loại chặng (bảng GREEN) + điểm nước rút; bằng điểm: nhiều chặng thắng hơn,
 *     rồi thứ hạng tổng thời gian.
 *   - Leo núi (áo chấm bi): cộng điểm leo núi; bằng điểm: thứ hạng tổng thời gian.
 *   - Tay đua trẻ (áo trắng): bảng tổng thời gian chỉ gồm tay đua đánh dấu trẻ (cột thứ 4 trong danh sách, vd "U25").
 *   - Đồng đội: mỗi chặng cộng thời gian 3 người về sớm nhất của đội; đội còn dưới 3 người thì rời bảng.
 * Người bỏ cuộc rời mọi bảng xếp hạng (xếp cuối bảng chung). Chặng nhập lần lượt; chỉ huỷ được chặng nhập sau cùng
 * (otour-race.js kiểm) – để việc bỏ cuộc luôn khớp các chặng sau.
 * Hàm thuần; stages-race.js gọi khi cfg.score === 'gt'.
 */
'use strict';

const KINDS = ['flat', 'hilly', 'mtn', 'itt'];
// Điểm về đích theo loại chặng (15 người đầu – như luật áo xanh của Grand Tour); tính giờ cá nhân như chặng núi
const GREEN = {
  flat: [50, 30, 20, 18, 16, 14, 12, 10, 8, 7, 6, 5, 4, 3, 2],
  hilly: [30, 25, 22, 19, 17, 15, 13, 11, 9, 7, 6, 5, 4, 3, 2],
  mtn: [20, 17, 15, 13, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
};
GREEN.itt = GREEN.mtn;
const FINISH_BONUS = [10, 6, 4]; // giây thưởng về đích top 3 (không áp dụng chặng tính giờ)
const TEAM_COUNT = 3; // số người tính thời gian đồng đội mỗi chặng
const MAX_KOM = 100, MAX_SP = 200, MAX_BS = 600;
const MAX_TIME = 100 * 3600 * 1000;

const int = (v, lo, hi, def) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def; };

/** Chuẩn hoá phần riêng của 'gt' vào out (cấu hình giai đoạn race đã có type / events / score). */
function normalizeGt(c, out) {
  const src = Array.isArray(c.kinds) ? c.kinds : typeof c.kinds === 'string' ? c.kinds.split(/[\s,;]+/) : [];
  out.kinds = Array.from({ length: out.events }, (_, i) => (KINDS.includes(src[i]) ? src[i] : 'flat'));
  out.bonus = c.bonus !== false;
  return out;
}

/** Người đã bỏ cuộc trước chặng i (ở một chặng đã nhập có số thứ tự nhỏ hơn). */
function outBefore(st, i) {
  const out = new Set();
  for (const ev of st.events) if (ev.done && ev.i < i) for (const x of ev.rows) if (x.dnf) out.add(x.uid);
  return out;
}

/**
 * Kiểm và chuẩn hoá kết quả chặng i. rows: [{ uid, rank, time (ms), kom?, sp?, bs?, dnf? }]. Mọi người còn trong cuộc đua
 * phải có mặt (về đích hoặc bỏ cuộc) – quên một dòng không âm thầm loại người đó. Thời gian không giảm theo thứ hạng.
 * Trả { rows } hoặc { code, args }.
 */
function cleanGtEvent(st, i, rows) {
  if (!Array.isArray(rows) || rows.length > st.entrants.length) return { code: 'tour_score_bad' };
  const out = outBefore(st, i), inStage = new Set(st.entrants), seen = new Set(), res = [];
  for (const r of rows) {
    const uid = r && String(r.uid);
    if (!inStage.has(uid) || seen.has(uid)) return { code: 'tour_score_bad' };
    if (out.has(uid)) return { code: 'ot_gt_out' };
    seen.add(uid);
    if (r.dnf === true) { res.push({ uid, dnf: true }); continue; }
    const x = { uid, dnf: false, rank: Math.floor(Number(r.rank)), time: Math.round(Number(r.time)) };
    if (!Number.isInteger(x.rank) || x.rank < 1 || x.rank > st.entrants.length) return { code: 'ot_race_rank' };
    if (!Number.isFinite(x.time) || x.time <= 0 || x.time > MAX_TIME) return { code: 'ot_race_time' };
    const kom = int(r.kom, 0, MAX_KOM, 0), sp = int(r.sp, 0, MAX_SP, 0), bs = int(r.bs, -MAX_BS, MAX_BS, 0);
    if (kom) x.kom = kom;
    if (sp) x.sp = sp;
    if (bs) x.bs = bs;
    res.push(x);
  }
  const left = st.entrants.filter((u) => !out.has(u) && !seen.has(u)).length;
  if (left) return { code: 'ot_gt_missing', args: { n: left } };
  const fin = res.filter((x) => !x.dnf).sort((a, b) => a.rank - b.rank);
  if (!fin.length) return { code: 'ot_race_empty' };
  if (new Set(fin.map((x) => x.rank)).size !== fin.length) return { code: 'ot_race_rank_dup' };
  for (let k = 1; k < fin.length; k++) if (fin[k].time < fin[k - 1].time) return { code: 'ot_gt_time_order', args: { n: fin[k].rank } };
  return { rows: res };
}

/** Điểm áo xanh và giây thưởng của một dòng về đích ở chặng có loại kind (hạng tính trong số người về đích). */
const greenOf = (kind, place, x) => (GREEN[kind][place - 1] || 0) + (x.sp || 0);
const bonusOf = (cfg, kind, place, x) => (cfg.bonus && kind !== 'itt' ? FINISH_BONUS[place - 1] || 0 : 0) + (x.bs || 0);

/**
 * Tính mọi bảng xếp hạng sau `upto` chặng đầu đã nhập (mặc định: mọi chặng đã nhập).
 * teamOf(uid) → tên đội (bỏ trống = không tính bảng đội). Trả { stats, gc, finishers(ev) }.
 */
function gtCalc(st, seedOf, teamOf, upto = Infinity) {
  const cfg = st.cfg;
  const stats = Object.fromEntries(st.entrants.map((u) => [u, { uid: u, time: 0, bonus: 0, green: 0, kom: 0, wins: 0, rankSum: 0, races: 0, out: null }]));
  const teams = new Map(); // tên đội → { time, out }
  for (const ev of st.events) {
    if (!ev.done || ev.i >= upto) continue;
    const kind = cfg.kinds[ev.i] || 'flat';
    const fin = ev.rows.filter((x) => !x.dnf).sort((a, b) => a.rank - b.rank);
    fin.forEach((x, k) => {
      const s = stats[x.uid];
      if (!s) return;
      s.races++;
      s.time += x.time;
      s.bonus += bonusOf(cfg, kind, k + 1, x);
      s.green += greenOf(kind, k + 1, x);
      s.kom += x.kom || 0;
      s.rankSum += k + 1;
      if (k === 0) s.wins++;
    });
    for (const x of ev.rows) if (x.dnf && stats[x.uid]) { stats[x.uid].races++; stats[x.uid].out = ev.i; }
    if (teamOf) {
      const by = new Map();
      for (const x of fin) { const n = teamOf(x.uid); if (n) { if (!by.has(n)) by.set(n, []); by.get(n).push(x.time); } }
      for (const u of st.entrants) { const n = teamOf(u); if (n && !teams.has(n)) teams.set(n, { name: n, time: 0, out: false }); }
      for (const tm of teams.values()) {
        const ts = by.get(tm.name) || [];
        if (ts.length < TEAM_COUNT) tm.out = true;
        else tm.time += ts.slice(0, TEAM_COUNT).reduce((a, b) => a + b, 0);
      }
    }
  }
  const net = (s) => s.time - s.bonus * 1000;
  // Bảng chung: còn trong cuộc đua trước; tổng thời gian (đã trừ giây thưởng) → tổng thứ hạng chặng → hạt giống.
  // Người bỏ cuộc: bỏ cuộc muộn hơn xếp trên
  const gc = [...st.entrants].sort((a, b) => {
    const x = stats[a], y = stats[b];
    if ((x.out == null) !== (y.out == null)) return x.out == null ? -1 : 1;
    if (x.out != null && x.out !== y.out) return y.out - x.out;
    return (net(x) - net(y)) || (x.rankSum - y.rankSum) || (seedOf(a) - seedOf(b));
  });
  const pos = new Map(gc.map((u, k) => [u, k]));
  const active = gc.filter((u) => stats[u].out == null);
  const by = (key) => active.filter((u) => stats[u][key] > 0).sort((a, b) => (stats[b][key] - stats[a][key]) || (key === 'green' ? stats[b].wins - stats[a].wins : 0) || (pos.get(a) - pos.get(b)));
  const teamList = [...teams.values()].sort((a, b) => (a.out - b.out) || (a.time - b.time) || a.name.localeCompare(b.name));
  return { stats, net, gc, active, green: by('green'), kom: by('kom'), teams: teamList };
}

/**
 * Phần gửi cho client (stages-race.js – raceView gọi khi 'gt'). side(uid): tên hiển thị; teamOf / youngOf: đội, tay đua trẻ.
 * Từng chặng: loại chặng, kết quả (hạng, thời gian + cách biệt với người thắng chặng, giây thưởng, điểm xanh, leo núi),
 * người giữ áo sau chặng. Bảng chung (áo vàng) theo hình dạng bảng race 'time' để dùng chung bục / chia sẻ / PDF;
 * thêm v.gt: bảng điểm, leo núi, trẻ, đồng đội.
 */
function gtView(st, i, adv, side, seedOf, teamOf, youngOf) {
  const cfg = st.cfg;
  const C = gtCalc(st, seedOf, teamOf);
  const all = st.events.filter((e) => e.done).length;
  const name = (u) => (u ? side(u).name : null);
  const leaders = (R) => {
    const young = R.active.find((u) => youngOf(u));
    const team = R.teams.find((x) => !x.out);
    return { gc: name(R.active[0]), green: name(R.green[0]), kom: name(R.kom[0]), young: name(young), team: team ? team.name : null };
  };
  const events = st.events.map((ev) => {
    const kind = cfg.kinds[ev.i] || 'flat';
    if (!ev.done) return { i: ev.i, kind, done: false };
    const fin = ev.rows.filter((x) => !x.dnf).sort((a, b) => a.rank - b.rank);
    const lead = fin.length ? fin[0].time : 0;
    const rows = fin.map((x, k) => ({ ...side(x.uid), rank: k + 1, time: x.time, gap: x.time - lead, bonus: bonusOf(cfg, kind, k + 1, x),
      green: greenOf(kind, k + 1, x), ...(x.kom ? { kom: x.kom } : {}), ...(x.sp ? { sp: x.sp } : {}), dnf: false }))
      .concat(ev.rows.filter((x) => x.dnf).map((x) => ({ ...side(x.uid), dnf: true })));
    return { i: ev.i, kind, done: true, rows, lead: leaders(gtCalc(st, seedOf, teamOf, ev.i + 1)) };
  });
  const { stats, net } = C;
  const leadNet = C.active.length ? net(stats[C.active[0]]) : 0;
  let prev = null;
  const table = C.gc.map((u, k) => {
    const s = stats[u], on = s.out == null;
    const r = { ...side(u), rank: k + 1, races: s.races, fin: s.races - (on ? 0 : 1), dnf: on ? 0 : 1, adv: on && k < adv, team: teamOf(u) || '', young: !!youngOf(u) };
    if (!on) r.out = s.out + 1; // bỏ cuộc ở chặng thứ…
    r.time = on && all ? net(s) : null;
    r.gap = r.time != null ? r.time - leadNet : null;
    r.gapPrev = r.time != null && prev != null ? r.time - prev : null;
    if (r.time != null) { prev = r.time; r.bonus = s.bonus; }
    return r;
  });
  const youngs = C.active.filter((u) => youngOf(u));
  const yLead = youngs.length ? net(stats[youngs[0]]) : 0;
  const tLead = C.teams.find((x) => !x.out);
  const gt = {
    green: C.green.map((u, k) => ({ ...side(u), rank: k + 1, pts: stats[u].green, wins: stats[u].wins })),
    kom: C.kom.map((u, k) => ({ ...side(u), rank: k + 1, pts: stats[u].kom })),
    young: all ? youngs.map((u, k) => ({ ...side(u), rank: k + 1, time: net(stats[u]), gap: net(stats[u]) - yLead })) : [],
    teams: all ? C.teams.map((x, k) => ({ name: x.name, rank: k + 1, out: x.out, time: x.out ? null : x.time, gap: x.out || !tLead ? null : x.time - tLead.time })) : [],
  };
  const out = new Set(C.gc.filter((u) => stats[u].out != null));
  const entrants = st.entrants.map((u) => ({ ...side(u), ...(teamOf(u) ? { team: teamOf(u) } : {}), ...(youngOf(u) ? { young: true } : {}), ...(out.has(u) ? { out: true } : {}) }));
  return { index: i, type: 'race', cfg, done: st.done, events, table, gt, entrants };
}

module.exports = { KINDS, GREEN, FINISH_BONUS, TEAM_COUNT, normalizeGt, cleanGtEvent, outBefore, gtCalc, gtView, greenOf, bonusOf };
