/*
 * Hệ Race của giải đấu Offline (docs/de-xuat-giai-offline.md mục 4.6–4.7, báo cáo Challonge Race của Laplace – chỉ học
 * ý tưởng): một giai đoạn kiểu 'race' gồm `events` chặng (1–30), mỗi chặng cả đoàn cùng thi (đua xe, điền kinh, bơi,
 * battle royale…). Hai cách tính:
 *   'points' – nhập thứ hạng từng chặng; máy tự đổi hạng ra điểm theo bảng điểm `table` (mặc định F1 25-18-15-12-10-8-6-4-2-1),
 *              sửa tay được từng dòng (pts – điểm thưởng, phạt). Xếp theo tổng điểm, bằng điểm thì đếm số lần về nhất,
 *              nhì… (countback như F1), rồi hạt giống. 1 chặng = Single Race; nhiều chặng = Grand Prix.
 *   'time'   – nhập thời gian (Time Trial): xếp theo tổng thời gian của người hoàn thành mọi chặng đã đua; tự tính chênh
 *              lệch với người dẫn đầu và với người ngay trên. Bỏ cuộc (DNF) ở một chặng thì xếp sau.
 * Bảng đội (teams): cộng điểm các thành viên cùng đội (như bảng đội đua của F1) – đội ghi ở danh sách "Tên | Quốc gia | Đội".
 * Chia lượt (heat – đoàn rất đông, như các lượt bơi / chạy): cfg.heat = số người tối đa mỗi lượt. Mỗi chặng chia người
 * thành các lượt đều nhau (kiểu rắn theo hạt giống – sức các lượt cân bằng; từ chặng 2 xoay các hàng để gặp đối thủ
 * khác), nhập kết quả từng lượt; đủ các lượt thì chặng xong. 'time': gộp mọi lượt, xếp theo thời gian; 'points': điểm
 * theo hạng trong lượt (countback theo số lần nhất lượt…).
 * Sinh tồn (battle royale – cách tính 'points'): cfg.kill = điểm mỗi lần hạ gục, cộng với điểm theo hạng (nhập thêm số hạ
 * gục từng đội); cfg.mp = kết thúc kiểu "match point": đội đã đạt ngưỡng điểm mà thắng một trận thì vô địch ngay – ngưỡng
 * cố định (mp.at) hoặc "điểm đội dẫn đầu sau `after` trận + `plus`" (kiểu Smash Rule); hết số trận mà chưa ai làm được thì
 * xếp theo tổng điểm. Có match point thì nhập lần lượt, chỉ huỷ trận sau cùng (otour-race.js).
 * Trạng thái chặt chẽ: mỗi chặng chỉ có chưa nhập / đã nhập (huỷ được); không có bước điểm danh làm kẹt giải.
 * Hàm thuần, không phụ thuộc mạng; hub gọi từ stages.js (dựng, bảng xếp hạng, người đi tiếp) và otour-run.js (nhập kết quả).
 */
'use strict';

const RU = require('../../../caro/otour-rules.js');
const GT = require('./stages-gt.js'); // cách tính 'gt': xe đạp nhiều chặng, nhiều bảng xếp hạng
const GOLF = require('./stages-golf.js'); // cách tính 'golf': golf đấu gậy (vòng, par, cắt, đấu phụ)

const SCORES = ['points', 'time', 'gt', 'golf'];
const F1 = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
const MAX_EVENTS = 30;
const MAX_RACE = 200; // tối đa người / đội trong một giai đoạn race (không chia lượt)
const MAX_RACE_HEATS = 512; // có chia lượt (bằng số đội tối đa của giải – otour-spec.js)
const MAX_HEAT = 64; // tối đa người mỗi lượt
const MAX_TABLE = 64;

const int = (v, lo, hi, def) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def; };

/** Bảng điểm theo hạng: mảng số nguyên 0–1000, tối đa MAX_TABLE hạng; rỗng / sai → null. */
function cleanTable(x) {
  const arr = Array.isArray(x) ? x : typeof x === 'string' ? x.split(/[\s,;]+/) : null;
  if (!arr) return null;
  const out = arr.filter((v) => v !== '' && v != null).slice(0, MAX_TABLE).map((v) => int(v, 0, 1000, 0));
  return out.length ? out : null;
}

/** Chuẩn hoá cấu hình giai đoạn race (stages.js gọi khi giải offline). */
function normalizeRace(c, last) {
  const score = SCORES.includes(c.score) ? c.score : 'points';
  const out = { type: 'race', bestOf: 1, events: int(c.events, 1, MAX_EVENTS, 1), score };
  if (score === 'points') {
    out.table = cleanTable(c.table) || [...F1];
    const kill = int(c.kill, 0, 10, 0);
    if (kill) out.kill = kill;
    const mp = c.mp && typeof c.mp === 'object' ? c.mp : null;
    if (mp && Number(mp.at) > 0) out.mp = { at: int(mp.at, 1, 100000, 50) };
    else if (mp && Number(mp.after) > 0 && out.events > 1) out.mp = { after: int(mp.after, 1, out.events - 1, 1), plus: int(mp.plus, 0, 1000, 10) };
  }
  if (score === 'gt') GT.normalizeGt(c, out); // bảng đội luôn tính theo cột "Đội"; không chia lượt
  else if (score === 'golf') GOLF.normalizeGolf(c, out);
  else if (c.teams === true) out.teams = true;
  const heat = int(c.heat, 0, MAX_HEAT, 0);
  if (heat >= 2 && score !== 'gt' && score !== 'golf') out.heat = heat;
  if (!last) out.advance = int(c.advance, 1, MAX_RACE_HEATS, 8);
  return out;
}

/** Các lượt của chặng i (hàm chia dùng chung với trình duyệt: caro/otour-rules.js – heatsOf). */
const heatsFor = (list, size, i) => RU.heatsOf(list, size, i).map((uids) => ({ uids, done: false, rows: null }));

/** Dựng giai đoạn: các chặng trống (st.matches rỗng – race không có trận đối đầu); đoàn đông hơn cfg.heat thì chia lượt. */
function buildRace(st) {
  const heat = st.cfg.heat && st.entrants.length > st.cfg.heat ? st.cfg.heat : 0;
  st.events = Array.from({ length: st.cfg.events }, (_, i) => ({ i, done: false, rows: null, ...(heat ? { heats: heatsFor(st.entrants, heat, i) } : {}) }));
}

/**
 * Kiểm và chuẩn hoá kết quả một chặng. rows: [{ uid, rank? (points) | time? ms (time), dnf?, pts? }]. Người không có
 * trong rows = không xuất phát (DNS – không điểm). Trả { rows } hoặc { code } (mã lỗi).
 */
function cleanEvent(st, rows, members = st.entrants, i = 0) {
  if (st.cfg.score === 'gt') return GT.cleanGtEvent(st, i, rows);
  if (st.cfg.score === 'golf') return GOLF.cleanRound(st, i, rows);
  if (!Array.isArray(rows) || rows.length > members.length) return { code: 'tour_score_bad' };
  const inStage = new Set(members), seen = new Set(), out = [];
  const pts = st.cfg.score === 'points';
  for (const r of rows) {
    const uid = r && String(r.uid);
    if (!inStage.has(uid) || seen.has(uid)) return { code: 'tour_score_bad' };
    seen.add(uid);
    const x = { uid, dnf: r.dnf === true };
    if (!x.dnf) {
      if (pts) {
        x.rank = Math.floor(Number(r.rank));
        if (!Number.isInteger(x.rank) || x.rank < 1 || x.rank > members.length) return { code: 'ot_race_rank' };
      } else {
        x.time = Math.round(Number(r.time));
        if (!Number.isFinite(x.time) || x.time <= 0 || x.time > 360000000) return { code: 'ot_race_time' };
      }
    }
    if (pts && r.pts != null && r.pts !== '') x.pts = int(r.pts, -1000, 1000, 0); // điểm sửa tay (thưởng / phạt)
    if (pts && st.cfg.kill) { const k = int(r.kills, 0, 200, 0); if (k) x.kills = k; } // số hạ gục (sinh tồn)
    out.push(x);
  }
  if (!out.some((x) => !x.dnf)) return { code: 'ot_race_empty' };
  if (pts) { // hạng không trùng
    const ranks = out.filter((x) => !x.dnf).map((x) => x.rank);
    if (new Set(ranks).size !== ranks.length) return { code: 'ot_race_rank_dup' };
  }
  return { rows: out };
}

/** Điểm của một dòng (points): sửa tay nếu có, không thì theo bảng điểm; bỏ cuộc 0. */
const rowPts = (cfg, x) => (x.pts != null ? x.pts : (x.dnf ? 0 : cfg.table[x.rank - 1] || 0) + (cfg.kill ? (x.kills || 0) * cfg.kill : 0));

/** Tổng điểm từng người qua các chặng đã nhập có số thứ tự < upto. */
function totalsBefore(st, upto) {
  const tot = {};
  for (const ev of st.events) if (ev.done && ev.i < upto) for (const x of ev.rows) tot[x.uid] = (tot[x.uid] || 0) + rowPts(st.cfg, x);
  return tot;
}
/** Ngưỡng match point hiện tại (null: chưa xác định – kiểu "sau `after` trận" mà chưa đấu đủ). */
function mpThreshold(st) {
  const mp = st.cfg.mp;
  if (!mp) return null;
  if (mp.at) return mp.at;
  const ev = st.events[mp.after - 1];
  if (!ev || !ev.done) return null;
  return Math.max(0, ...Object.values(totalsBefore(st, mp.after))) + mp.plus;
}

/** Thứ tự một chặng: theo hạng / thời gian, bỏ cuộc xếp cuối. */
function eventOrder(st, ev) {
  const key = st.cfg.score === 'points' ? 'rank' : 'time';
  return [...ev.rows].sort((a, b) => (a.dnf - b.dnf) || (a.dnf ? 0 : a[key] - b[key]));
}

/** Ghi kết quả chặng i. Trả true nếu cả giai đoạn đã xong. */
function recordEvent(st, i, rows) {
  if (st.cfg.score === 'golf') return GOLF.recordRound(st, i, rows); // vòng golf lưu được khi đang đánh dở
  const ev = st.events[i];
  // Match point: đội thắng trận này đã đạt ngưỡng từ trước trận → vô địch, giai đoạn kết thúc ngay
  const th = st.cfg.score === 'points' && st.cfg.mp && (st.cfg.mp.at || i >= st.cfg.mp.after) ? mpThreshold(st) : null;
  if (th != null) {
    const w = rows.find((x) => !x.dnf && x.rank === 1);
    if (w && (totalsBefore(st, i)[w.uid] || 0) >= th) st.mpWinner = w.uid;
  }
  ev.rows = rows;
  ev.done = true;
  st.done = !!st.mpWinner || st.events.every((e) => e.done);
  return st.done;
}

/** Ghi kết quả lượt h của chặng i; đủ các lượt thì chặng xong (rows = gộp mọi lượt). Trả true nếu cả giai đoạn đã xong. */
function recordHeat(st, i, h, rows) {
  const ev = st.events[i];
  Object.assign(ev.heats[h], { rows, done: true });
  if (ev.heats.every((x) => x.done)) return recordEvent(st, i, ev.heats.flatMap((x) => x.rows));
  return false;
}

function undoEvent(st, i) {
  delete st.playoff; // golf: kết quả đấu phụ không còn đúng
  delete st.mpWinner; // match point: chưa ai thắng nữa
  Object.assign(st.events[i], { done: false, rows: null });
  for (const x of st.events[i].heats || []) Object.assign(x, { done: false, rows: null });
  st.done = false;
}

/** Huỷ một lượt (chặng thành chưa xong). */
function undoHeat(st, i, h) {
  Object.assign(st.events[i], { done: false, rows: null });
  Object.assign(st.events[i].heats[h], { done: false, rows: null });
  st.done = false;
}

/** Bảng xếp hạng chung: { list, stats } (cùng hình dạng bảng điểm vòng tròn để dùng chung người đi tiếp / bục trao giải). */
function raceTable(st, seedOf) {
  if (st.cfg.score === 'gt') { const C = GT.gtCalc(st, seedOf, null); return { list: C.gc, stats: C.stats }; }
  if (st.cfg.score === 'golf') { const C = GOLF.golfCalc(st, seedOf); return { list: C.order, stats: C.stats }; }
  const cfg = st.cfg, pts = cfg.score === 'points';
  const stats = Object.fromEntries(st.entrants.map((u) => [u, { uid: u, pts: 0, time: 0, races: 0, fin: 0, dnf: 0, places: [], kills: 0 }]));
  const done = st.events.filter((e) => e.done);
  for (const ev of done) {
    for (const x of ev.rows) {
      const s = stats[x.uid];
      if (!s) continue;
      s.races++;
      if (x.dnf) { s.dnf++; } else s.fin++;
      if (pts) {
        s.pts += rowPts(cfg, x);
        s.kills += x.kills || 0;
        if (!x.dnf) s.places[x.rank - 1] = (s.places[x.rank - 1] || 0) + 1;
      } else if (!x.dnf) s.time += x.time;
    }
  }
  const all = done.length;
  const cmp = pts
    ? (a, b) => {
      const x = stats[a], y = stats[b];
      // Thắng theo match point, rồi tổng điểm, countback (nhiều lần về nhất hơn, rồi nhì…), số hạ gục
      if (st.mpWinner && (a === st.mpWinner) !== (b === st.mpWinner)) return a === st.mpWinner ? -1 : 1; // thắng theo match point
      if (y.pts !== x.pts) return y.pts - x.pts;
      for (let k = 0; k < Math.max(x.places.length, y.places.length); k++) if ((y.places[k] || 0) !== (x.places[k] || 0)) return (y.places[k] || 0) - (x.places[k] || 0);
      if (y.kills !== x.kills) return y.kills - x.kills;
      return seedOf(a) - seedOf(b);
    }
    : (a, b) => {
      const x = stats[a], y = stats[b];
      // Hoàn thành mọi chặng đã đua trước; rồi nhiều chặng hoàn thành hơn; rồi tổng thời gian ít hơn
      const fx = x.fin === all, fy = y.fin === all;
      if (fx !== fy) return fx ? -1 : 1;
      if (y.fin !== x.fin) return y.fin - x.fin;
      if (x.time !== y.time) return x.time - y.time;
      return seedOf(a) - seedOf(b);
    };
  return { list: [...st.entrants].sort(cmp), stats };
}

/**
 * Phần gửi cho client (bracket.js – stageView). side(uid): tên / thông tin hiển thị; teamOf(uid): tên đội.
 * Chặng: các dòng theo thứ tự về đích (điểm hoặc thời gian + chênh lệch với người dẫn đầu / người ngay trên).
 * Bảng chung: hạng, tổng điểm / tổng thời gian, chênh lệch; bảng đội nếu bật.
 */
function raceView(st, i, adv, side, seedOf, teamOf = () => '', youngOf = () => false) {
  if (st.cfg.score === 'gt') return GT.gtView(st, i, adv, side, seedOf, teamOf, youngOf);
  if (st.cfg.score === 'golf') return GOLF.golfView(st, i, adv, side, seedOf);
  const cfg = st.cfg, pts = cfg.score === 'points';
  // Chia lượt: từng lượt – chỉ trạng thái + kết quả; người trong lượt trình duyệt tự tính (RU.heatsOf, cùng thứ tự entrants)
  // – không gửi lại danh sách mọi lượt của mọi chặng mỗi lần cập nhật (đoàn 512 người × 30 chặng ≈ 200 KB)
  const heatsOf = (ev) => (ev.heats ? { heats: ev.heats.map((x, h) => ({ h, done: x.done, ...(x.done ? { rows: rowsOf(x) } : {}) })) } : {});
  const rowsOf = (ev) => {
    const order = eventOrder(st, ev);
    const lead = order[0] && !order[0].dnf ? order[0].time : null;
    let prev = null;
    return order.map((x) => {
      const r = { ...side(x.uid), dnf: x.dnf };
      if (pts) { r.rank = x.dnf ? null : x.rank; r.pts = rowPts(cfg, x); if (x.pts != null) r.manual = true; if (x.kills) r.kills = x.kills; } else if (!x.dnf) {
        r.time = x.time; r.gap = lead != null ? x.time - lead : null; r.gapPrev = prev != null ? x.time - prev : null; prev = x.time;
      }
      return r;
    });
  };
  const events = st.events.map((ev) => {
    if (!ev.done) return { i: ev.i, done: false, ...heatsOf(ev) };
    return { i: ev.i, done: true, rows: rowsOf(ev), ...heatsOf(ev) };
  });
  const { list, stats } = raceTable(st, seedOf);
  const all = st.events.filter((e) => e.done).length;
  const lead = list.length ? stats[list[0]] : null;
  const mpAt = pts ? mpThreshold(st) : null;
  let prev = null;
  const table = list.map((u, k) => {
    const s = stats[u];
    const r = { ...side(u), rank: k + 1, races: s.races, fin: s.fin, dnf: s.dnf, adv: k < adv };
    if (pts) { r.pts = s.pts; if (cfg.kill) r.kills = s.kills; if (mpAt != null && s.pts >= mpAt) r.mp = true; r.wins = s.places[0] || 0; r.podiums = (s.places[0] || 0) + (s.places[1] || 0) + (s.places[2] || 0); } else {
      r.time = s.fin === all && all ? s.time : null;
      r.gap = r.time != null && lead && lead.fin === all ? s.time - lead.time : null;
      r.gapPrev = r.time != null && prev != null ? s.time - prev : null;
      if (r.time != null) prev = s.time;
    }
    return r;
  });
  const v = { index: i, type: 'race', cfg, done: st.done, events, table, entrants: st.entrants.map(side) };
  if (cfg.mp && pts) v.mp = { at: mpAt, winner: st.mpWinner ? side(st.mpWinner).name : null };
  if (cfg.teams && pts) {
    const tm = new Map();
    for (const u of list) { const name = teamOf(u); if (name) tm.set(name, (tm.get(name) || 0) + stats[u].pts); }
    v.teams = [...tm].sort((a, b) => b[1] - a[1]).map(([name, p], k) => ({ name, pts: p, rank: k + 1 }));
  }
  return v;
}

/** Lỗi cỡ giai đoạn race (null nếu được). */
const raceError = (cfg, n) => {
  const max = cfg.heat ? MAX_RACE_HEATS : MAX_RACE; // đoàn quá MAX_RACE người: phải chia lượt
  return cfg.type === 'race' && n > max ? { code: 'ot_race_many', args: { n: max } } : null;
};

module.exports = { mpThreshold, totalsBefore, SCORES, F1, MAX_EVENTS, MAX_RACE, MAX_RACE_HEATS, MAX_HEAT, cleanTable, normalizeRace, buildRace, heatsFor, cleanEvent, recordEvent, recordHeat, undoEvent, undoHeat, raceTable, raceView, raceError, eventOrder, rowPts };
