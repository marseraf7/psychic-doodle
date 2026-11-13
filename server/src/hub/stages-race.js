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
 * Chia bảng cố định (cfg.groups = G – sinh tồn kiểu PGC): chia G bảng kiểu rắn theo hạt giống, mỗi bảng đấu `events` trận
 * của riêng mình (trận i thuộc bảng i % G); xếp hạng, đi tiếp (`advance` mỗi bảng) và vào thẳng giai đoạn 3 (`skip` mỗi
 * bảng) tính theo từng bảng. Không dùng cùng chia lượt, 3 bảng xoay vòng, match point.
 * Hệ số phụ kiểu PUBG (cfg.tb = 'pubg'): bằng tổng điểm thì xét tổng điểm hạng (không tính hạ gục, điểm sửa tay), rồi
 * điểm trận gần nhất, điểm hạng trận gần nhất, số hạ gục; mặc định: countback (số lần về nhất, nhì…), số hạ gục.
 * Trạng thái chặt chẽ: mỗi chặng chỉ có chưa nhập / đã nhập (huỷ được); không có bước điểm danh làm kẹt giải.
 * Hàm thuần, không phụ thuộc mạng; hub gọi từ stages.js (dựng, bảng xếp hạng, người đi tiếp) và otour-run.js (nhập kết quả).
 */
'use strict';

const LOB = require('./stages-race-lobby.js'); // xếp lại lượt (TFT), cấm Legend (ALGS)
const RU = require('../../../caro/otour-rules.js');
const GT = require('./stages-gt.js'); // cách tính 'gt': xe đạp nhiều chặng, nhiều bảng xếp hạng
const PLUG = require('./stages-race-plug.js'); // cách tính tự chứa: golf, omnium, mass start (registry)
const CI = require('./stages-circuit.js'); // hệ Circuit kiểu PGC 2024
const WK = require('./stages-weekly.js'); // vòng tuần kiểu PGC 2021

const SCORES = ['points', 'time', 'gt', ...PLUG.NAMES];
const F1 = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
const MAX_EVENTS = 60; // Rank Decision PGC 2021: 36 trận
const MAX_RACE = 200; // tối đa người / đội trong một giai đoạn race (không chia lượt)
const MAX_RACE_HEATS = 512; // có chia lượt (bằng số đội tối đa của giải – otour-spec.js)
const MAX_HEAT = 64; // tối đa người mỗi lượt
const MAX_TABLE = 64;
const MAX_GROUPS = 8; // chia bảng cố định

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
  // Xe đạp nhiều chặng / golf: tối đa 30 chặng / vòng như trước; cách tính điểm / thời gian: tới MAX_EVENTS
  const P = PLUG.get(score);
  const out = { type: 'race', bestOf: 1, events: int(c.events, 1, score === 'gt' ? 30 : P ? P.maxEvents : MAX_EVENTS, 1), score };
  if (score === 'points') {
    out.table = cleanTable(c.table) || [...F1];
    const kill = int(c.kill, 0, 10, 0);
    if (kill) out.kill = kill;
    const mp = c.mp && typeof c.mp === 'object' ? c.mp : null;
    if (mp && Number(mp.at) > 0) {
      out.mp = { at: int(mp.at, 1, 100000, 50) };
      // Số trận tối thiểu (kiểu Finalist Mode của đua xe ảo): match point chỉ tính từ trận thứ `min`
      const mn = int(mp.min, 0, out.events, 0);
      if (mn > 1) out.mp.min = mn;
    }
    else if (mp && Number(mp.after) > 0 && out.events > 1) out.mp = { after: int(mp.after, 1, out.events - 1, 1), plus: int(mp.plus, 0, 1000, 10) };
    // Điểm thưởng mang sang (kiểu Points Rush): đội vào giai đoạn này ở vị trí k được cộng sẵn head[k] điểm
    const head = cleanTable(c.head);
    if (head && head.some((x) => x > 0)) out.head = head;
    // Chia 3 bảng xoay vòng: mỗi trận hai bảng đấu, một bảng nghỉ (không dùng cùng chia lượt); rot = 4…8: xoay G bảng, mỗi
    // trận một cặp bảng theo lịch vòng tròn (kiểu Rank Decision PGC 2021)
    const R = c.rot === true ? 3 : int(c.rot, 0, MAX_GROUPS, 0);
    if (R >= 3 && !(int(c.heat, 0, MAX_HEAT, 0) >= 2)) out.rot = R === 3 ? true : R;
    // Đổi cặp bảng sau mỗi `rotBlock` trận (kiểu vòng bảng PGS: mỗi ngày 6 trận cùng hai bảng – A&B, B&C, C&A)
    const rb = int(c.rotBlock, 1, MAX_EVENTS, 1);
    if (out.rot && rb > 1) out.rotBlock = rb;
    // Chia bảng cố định (kiểu PGC): mỗi bảng đấu riêng – không đi cùng xoay vòng, match point
    const G = int(c.groups, 0, MAX_GROUPS, 0);
    if (G >= 2) { out.groups = G; delete out.rot; delete out.mp; }
    if (c.tb === 'pubg' || c.tb === 'pubg_k') out.tb = c.tb; // hệ số phụ kiểu PUBG (2022+) / kiểu PUBG cũ – hạ gục trước (2019, 2021)
    if (c.dmg === true) out.dmg = true; // nhập tổng sát thương từng đội mỗi trận – chỉ số phụ cuối của PUBG 2022–2023
    if (c.carry === true) out.carry = true; // mang nguyên điểm giai đoạn trước sang (kiểu Elimination PGC 2019)
    // Cổng thắng trận (kiểu Grand Survival PGC 2021 / 2022): mỗi trận `seats` đội đầu hàng chờ đấu, đội về nhất đi tiếp và rời
    // phòng, đội kế tiếp trong hàng chờ vào thay; mỗi trận một suất – số suất = số trận. Không phải giai đoạn cuối
    if (c.gate && !last) {
      out.gate = { seats: int(c.gate.seats != null ? c.gate.seats : c.gate, 2, MAX_RACE, 16) };
      for (const k of ['groups', 'rot', 'mp', 'head', 'carry']) delete out[k];
    }
    CI.normalizeCircuit(c, out); // hệ Circuit (stages-circuit.js): nhiều vòng × nhiều ngày, chỉ điểm ngày Final cộng dồn
    if (!out.circuit) WK.normalizeWeekly(c, out); // vòng tuần (stages-weekly.js): Survival → Weekly Final → Bottom, lặp nhiều tuần
  }
  if (score === 'gt') GT.normalizeGt(c, out); // bảng đội luôn tính theo cột "Đội"; không chia lượt
  else if (P) P.normalize(c, out);
  else if (c.teams === true) out.teams = true;
  const heat = int(c.heat, 0, MAX_HEAT, 0);
  // Chia lượt: không đi cùng 3 bảng xoay vòng, không đi cùng match point (mỗi lượt có một người về nhất)
  if (heat >= 2 && score !== 'gt' && !P && !out.rot && !out.mp && !out.groups && !out.gate && !out.circuit && !out.weekly) out.heat = heat;
  // Xếp lại các lượt (lobby) theo bảng điểm sau mỗi `reseed` trận (kiểu TFT Checkmate: lobby 8 người, đổi sau mỗi 2 game)
  if (out.heat && score === 'points' && Number(c.reseed) >= 1) out.reseed = int(c.reseed, 1, 10, 2);
  LOB.normalizeAlgs(c, out); // draft POI, cấm Legend (kiểu ALGS)
  if (!last) out.advance = out.gate ? out.events : int(c.advance, 1, MAX_RACE_HEATS, 8);
  return out;
}

/** Các lượt của chặng i (hàm chia dùng chung với trình duyệt: caro/otour-rules.js – heatsOf). */
const heatsFor = (list, size, i) => RU.heatsOf(list, size, i).map((uids) => ({ uids, done: false, rows: null }));

/** Dựng giai đoạn: các chặng trống (st.matches rỗng – race không có trận đối đầu); đoàn đông hơn cfg.heat thì chia lượt. */
function buildRace(st) {
  const heat = st.cfg.heat && st.entrants.length > st.cfg.heat ? st.cfg.heat : 0;
  const G = st.cfg.groups || 0; // chia bảng cố định: mỗi bảng `events` trận, trận i thuộc bảng i % G
  st.events = Array.from({ length: (st.cfg.weekly ? WK.totalEvents(st.cfg) : CI.totalEvents(st.cfg)) * (G || 1) }, (_, i) => ({ i, done: false, rows: null, ...(G ? { g: i % G } : {}), ...(heat ? { heats: heatsFor(st.entrants, heat, i) } : {}) }));
  if (PLUG.get(st.cfg.score) && PLUG.get(st.cfg.score).build) PLUG.get(st.cfg.score).build(st);
}

/**
 * Kiểm và chuẩn hoá kết quả một chặng. rows: [{ uid, rank? (points) | time? ms (time), dnf?, pts? }]. Người không có
 * trong rows = không xuất phát (DNS – không điểm). Trả { rows } hoặc { code } (mã lỗi).
 */
function cleanEvent(st, rows, members = st.entrants, i = 0) {
  if (st.cfg.score === 'gt') return GT.cleanGtEvent(st, i, rows);
  if (PLUG.get(st.cfg.score)) return PLUG.get(st.cfg.score).clean(st, i, rows, members);
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
    if (pts && st.cfg.dmg) { const d = int(r.dmg, 0, 1000000, 0); if (d) x.dmg = d; } // tổng sát thương (chỉ số phụ)
    if (pts && st.cfg.legendBan && r.pick) { const p = String(r.pick).replace(/[<>|]/g, '').trim().slice(0, 30); if (p) x.pick = p; } // Legend của đội (ALGS)
    out.push(x);
  }
  if (!out.some((x) => !x.dnf)) return { code: 'ot_race_empty' };
  const lb = LOB.pickError(st, i, out); // Legend đã bị cấm (ALGS)
  if (lb) return lb;
  // cổng thắng trận / Survival của vòng tuần: phải có đội về nhất
  if ((st.cfg.gate || (st.cfg.weekly && WK.isSurv(st.cfg, i))) && !out.some((x) => !x.dnf && x.rank === 1)) return { code: 'ot_gate_winner' };
  if (pts) { // hạng không trùng
    const ranks = out.filter((x) => !x.dnf).map((x) => x.rank);
    if (new Set(ranks).size !== ranks.length) return { code: 'ot_race_rank_dup' };
  }
  return { rows: out };
}

/** Điểm của một dòng (points): sửa tay nếu có, không thì theo bảng điểm; bỏ cuộc 0. */
const rowPts = (cfg, x) => (x.pts != null ? x.pts : (x.dnf ? 0 : cfg.table[x.rank - 1] || 0) + (cfg.kill ? (x.kills || 0) * cfg.kill : 0));

/** Những người đấu chặng i khi chia 3 bảng xoay vòng (cfg.rot); không thì cả đoàn. */
const lobby = (st, i) => (st.cfg.weekly ? WK.make(st, raceTable).lobby(i) : st.cfg.circuit ? CI.make(st, raceTable).lobby(i) : st.cfg.gate ? gateLobby(st, i) : st.cfg.groups ? RU.groupList(st.entrants, st.cfg.groups, i % st.cfg.groups)
  : st.cfg.rot ? RU.lobbyOf(st.entrants, Math.floor(i / (st.cfg.rotBlock || 1)), st.cfg.rot === true ? 3 : st.cfg.rot) : st.entrants); // rotBlock: đổi cặp bảng sau mỗi `rotBlock` trận
/** Cổng thắng trận: đội thắng các chặng trước chặng i (theo thứ tự chặng). */
const gateWinners = (st, upto = Infinity) => st.events.filter((e) => e.done && e.i < upto).map((e) => (e.rows.find((x) => !x.dnf && x.rank === 1) || {}).uid).filter(Boolean);
/** Cổng thắng trận: `seats` đội đầu hàng chờ (thứ tự hạt giống, bỏ đội đã thắng) đấu chặng i. */
function gateLobby(st, i) {
  const won = new Set(gateWinners(st, i));
  return st.entrants.filter((u) => !won.has(u)).slice(0, st.cfg.gate.seats);
}
/** Người của bảng g (chia bảng cố định). */
const groupMembers = (st, g) => RU.groupList(st.entrants, st.cfg.groups, g);

/** Tổng điểm từng người qua các chặng đã nhập có số thứ tự < upto (kể cả điểm thưởng mang sang – st.head). */
function totalsBefore(st, upto) {
  const tot = { ...(st.head || {}) };
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
  if (PLUG.get(st.cfg.score) && PLUG.get(st.cfg.score).record) return PLUG.get(st.cfg.score).record(st, i, rows);
  const ev = st.events[i];
  // Match point: đội thắng trận này đã đạt ngưỡng từ trước trận → vô địch, giai đoạn kết thúc ngay
  const mp = st.cfg.mp;
  const th = st.cfg.score === 'points' && mp && (mp.at ? i + 1 >= (mp.min || 1) : i >= mp.after) ? mpThreshold(st) : null;
  if (th != null) {
    const w = rows.find((x) => !x.dnf && x.rank === 1);
    if (w && (totalsBefore(st, i)[w.uid] || 0) >= th) st.mpWinner = w.uid;
  }
  ev.rows = rows;
  ev.done = true;
  st.done = !!st.mpWinner || st.events.every((e) => e.done);
  if (st.cfg.reseed && ev.heats) LOB.reseedAfter(st, i, raceTable, heatsFor); // xếp lại lượt theo bảng điểm (stages-race-lobby.js)
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
  if (PLUG.get(st.cfg.score) && PLUG.get(st.cfg.score).undo) return PLUG.get(st.cfg.score).undo(st, i); // chặng tự thêm (Backyard, poker)
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
function raceTable(st, seedOf, members = st.entrants) {
  if (st.cfg.score === 'gt') { const C = GT.gtCalc(st, seedOf, null); return { list: C.gc, stats: C.stats }; }
  if (PLUG.get(st.cfg.score)) return PLUG.get(st.cfg.score).table(st, seedOf);
  const cfg = st.cfg, pts = cfg.score === 'points';
  // place: tổng điểm hạng (không tính hạ gục / sửa tay); last, lastPlace: điểm / điểm hạng của trận gần nhất đã đấu (kiểu PUBG)
  const stats = Object.fromEntries(members.map((u) => [u, { uid: u, pts: (pts && st.head && st.head[u]) || 0, time: 0, races: 0, fin: 0, dnf: 0, places: [], kills: 0, place: 0, last: 0, lastPlace: 0, lastKills: 0, best: 0, bestKills: 0, dmg: 0 }]));
  // Hệ Circuit: bảng chung chỉ cộng các ngày Final
  // Vòng tuần: bảng chung chỉ cộng các Weekly Final
  const done = st.events.filter((e) => e.done && (!cfg.circuit || CI.isFinal(cfg, e.i)) && (!cfg.weekly || WK.isFinal(cfg, e.i)));
  const placePts = (x) => (x.dnf ? 0 : cfg.table[x.rank - 1] || 0);
  for (const ev of done) {
    for (const x of ev.rows) {
      const s = stats[x.uid];
      if (!s) continue;
      s.races++;
      if (x.dnf) { s.dnf++; } else s.fin++;
      if (pts) {
        s.pts += rowPts(cfg, x);
        s.kills += x.kills || 0;
        s.dmg += x.dmg || 0;
        s.place += placePts(x);
        s.last = rowPts(cfg, x); // các chặng duyệt theo thứ tự: dòng sau cùng là trận gần nhất
        s.lastPlace = placePts(x);
        s.lastKills = x.kills || 0;
        const mp = rowPts(cfg, x); // trận điểm cao nhất (bằng điểm: giữ trận có nhiều hạ gục hơn)
        if (mp > (s.best || 0) || (mp === (s.best || 0) && (x.kills || 0) > (s.bestKills || 0))) { s.best = mp; s.bestKills = x.kills || 0; }
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
      // Kiểu PUBG: tổng điểm hạng, điểm trận gần nhất, điểm hạng trận gần nhất
      // Kiểu PUBG (2022–2023): tổng điểm hạng, điểm trận gần nhất, điểm hạng trận gần nhất, rồi tổng sát thương (khi nhập)
      if (cfg.tb === 'pubg') for (const k of ['place', 'last', 'lastPlace', ...(cfg.dmg ? ['dmg'] : [])]) if (y[k] !== x[k]) return y[k] - x[k];
      // Kiểu PUBG cũ (2019, 2021): tổng hạ gục, điểm trận cao nhất, hạ gục trong trận đó, hạ gục trận gần nhất, điểm hạng trận gần nhất
      if (cfg.tb === 'pubg_k') for (const k of ['kills', 'best', 'bestKills', 'lastKills', 'lastPlace']) if (y[k] !== x[k]) return y[k] - x[k];
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
  if (cfg.gate) { // cổng thắng trận: đội thắng theo thứ tự chặng, rồi các đội còn lại theo hạt giống
    const won = gateWinners(st), wset = new Set(won);
    return { list: [...won.filter((u) => members.includes(u)), ...members.filter((u) => !wset.has(u)).sort((a, b) => seedOf(a) - seedOf(b))], stats };
  }
  // Vòng tuần: đội nhất các tuần đứng đầu, rồi điểm Weekly Finals cộng dồn (stages-weekly.js)
  if (cfg.weekly) { const all = WK.make(st, raceTable).overall([...members].sort(cmp)); return { list: all.filter((u) => members.includes(u)), stats }; }
  return { list: [...members].sort(cmp), stats };
}

/**
 * Phần gửi cho client (bracket.js – stageView). side(uid): tên / thông tin hiển thị; teamOf(uid): tên đội.
 * Chặng: các dòng theo thứ tự về đích (điểm hoặc thời gian + chênh lệch với người dẫn đầu / người ngay trên).
 * Bảng chung: hạng, tổng điểm / tổng thời gian, chênh lệch; bảng đội nếu bật.
 */
function raceView(st, i, adv, side, seedOf, teamOf = () => '', youngOf = () => false) {
  if (st.cfg.score === 'gt') return GT.gtView(st, i, adv, side, seedOf, teamOf, youngOf);
  if (PLUG.get(st.cfg.score)) return PLUG.get(st.cfg.score).view(st, i, adv, side, seedOf);
  const cfg = st.cfg, pts = cfg.score === 'points';
  // Chia lượt: từng lượt – chỉ trạng thái + kết quả; người trong lượt trình duyệt tự tính (RU.heatsOf, cùng thứ tự entrants)
  // – không gửi lại danh sách mọi lượt của mọi chặng mỗi lần cập nhật (đoàn 512 người × 30 chặng ≈ 200 KB)
  // Xếp lại lượt theo bảng điểm (cfg.reseed): trình duyệt không tự tính được → gửi danh sách người từng lượt
  const heatsOf = (ev) => (ev.heats ? { heats: ev.heats.map((x, h) => ({ h, done: x.done, ...(x.done ? { rows: rowsOf(x) } : {}), ...(cfg.reseed ? { uids: x.uids } : {}) })) } : {});
  const rowsOf = (ev) => {
    const order = eventOrder(st, ev);
    const lead = order[0] && !order[0].dnf ? order[0].time : null;
    let prev = null;
    return order.map((x) => {
      const r = { ...side(x.uid), dnf: x.dnf };
      if (pts) { r.rank = x.dnf ? null : x.rank; r.pts = rowPts(cfg, x); if (x.pts != null) r.manual = true; if (x.kills) r.kills = x.kills; if (x.dmg) r.dmg = x.dmg; if (x.pick) r.pick = x.pick; } else if (!x.dnf) {
        r.time = x.time; r.gap = lead != null ? x.time - lead : null; r.gapPrev = prev != null ? x.time - prev : null; prev = x.time;
      }
      return r;
    });
  };
  const nextGate = cfg.gate || cfg.circuit || cfg.weekly ? st.events.findIndex((e) => !e.done) : -1;
  const ci = cfg.circuit ? CI.make(st, raceTable) : null;
  const events = st.events.map((ev) => {
    // Cổng thắng trận: máy chủ gửi danh sách đội của chặng kế tiếp (phụ thuộc kết quả trước – trình duyệt không tự tính)
    if (!ev.done) return { i: ev.i, done: false, ...heatsOf(ev), ...(ev.i === nextGate ? { lobby: lobby(st, ev.i) } : {}) };
    return { i: ev.i, done: true, rows: rowsOf(ev), ...heatsOf(ev) };
  });
  const all = st.events.filter((e) => e.done).length;
  const mpAt = pts ? mpThreshold(st) : null;
  /** Bảng xếp hạng của một danh sách người (cả đoàn, hoặc một bảng khi chia bảng cố định – adv tính trong bảng). */
  const tableOf = ({ list, stats }) => {
    const lead = list.length ? stats[list[0]] : null;
    let prev = null;
    return list.map((u, k) => {
      const s = stats[u];
      const r = { ...side(u), rank: k + 1, races: s.races, fin: s.fin, dnf: s.dnf, adv: k < adv };
      if (pts) { r.pts = s.pts; if (st.head && st.head[u]) r.head = st.head[u]; if (cfg.kill) r.kills = s.kills; if (cfg.dmg) r.dmg = s.dmg; if (mpAt != null && s.pts >= mpAt) r.mp = true; r.wins = s.places[0] || 0; r.podiums = (s.places[0] || 0) + (s.places[1] || 0) + (s.places[2] || 0); } else {
        r.time = s.fin === all && all ? s.time : null;
        r.gap = r.time != null && lead && lead.fin === all ? s.time - lead.time : null;
        r.gapPrev = r.time != null && prev != null ? s.time - prev : null;
        if (r.time != null) prev = s.time;
      }
      return r;
    });
  };
  const { list, stats } = raceTable(st, seedOf);
  // Chia bảng cố định: bảng xếp hạng từng bảng (v.groups); v.table gộp các bảng (chia sẻ / PDF / CSV dùng chung)
  const groups = cfg.groups ? Array.from({ length: cfg.groups }, (_, g) => ({ name: String.fromCharCode(65 + g), table: tableOf(raceTable(st, seedOf, groupMembers(st, g))) })) : null;
  const table = groups ? groups.flatMap((g) => g.table) : tableOf({ list, stats });
  const v = { index: i, type: 'race', cfg, done: st.done, events, table, entrants: st.entrants.map(side), ...(groups ? { groups } : {}) };
  if (cfg.mp && pts) v.mp = { at: mpAt, winner: st.mpWinner ? side(st.mpWinner).name : null };
  // ALGS: draft POI từng bản đồ (thứ tự theo bảng điểm hiện tại) và Legend bị cấm (suy từ các trận đã đấu)
  if (cfg.poi) v.poi = cfg.poi.maps.map((m, k) => ({ name: m.name, pois: m.pois, order: LOB.poiOrder(st, list, k).map(side), picks: Object.entries((st.poi || {})[k] || {}).map(([u, p]) => ({ ...side(u), poi: p })) }));
  if (cfg.legendBan) v.bans = LOB.bansBefore(st, st.events.length).map((b) => ({ ...b, ev: b.ev + 1 }));
  // Hệ Circuit: bảng từng ngày đã bắt đầu (ngày thường: `keep` đội đầu đi tiếp ngày sau; ngày Final: điểm cộng dồn)
  // Vòng tuần: từng tuần đã bắt đầu – đội thắng Survival, bảng Weekly Final, bảng Bottom
  if (cfg.weekly) {
    const wk = WK.make(st, raceTable), seedOf2 = (u) => st.entrants.indexOf(u) + 1;
    const evsOf = (w, kind) => st.events.filter((e) => { const p = WK.phase(cfg, e.i); return p.w === w && p.kind === kind; });
    const subTable = (w, kind, members) => raceTable({ ...st, cfg: { ...cfg, weekly: undefined }, head: null, events: evsOf(w, kind) }, seedOf2, members);
    v.weekly = WK.weeksShown(st).map(({ w, done }) => ({ w, done, winners: wk.survWinners(w).map(side),
      final: tableOf(subTable(w, 'final', wk.finalists(w))).map((r) => ({ ...r, adv: false })),
      ...(w < cfg.weekly.weeks - 1 ? { bottom: tableOf(subTable(w, 'bottom', wk.bottomMembers(w))).map((r) => ({ ...r, adv: false })) } : {}) }));
  }
  if (ci) v.circuit = CI.daysShown(st).map((d) => ({ ...d, table: (() => { const T = ci.dayFull(d.c, d.j); return tableOf(T).map((r) => ({ ...r, adv: !d.final && r.rank <= cfg.circuit.keep })); })() }));
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
  if (cfg.type === 'race' && cfg.groups && n < 2 * cfg.groups) return { code: 'ot_race_groups_few', args: { n: 2 * cfg.groups } }; // mỗi bảng ít nhất 2 đội
  if (cfg.type === 'race' && cfg.circuit) { const e = CI.circuitError(cfg, n); if (e) return e; }
  if (cfg.type === 'race' && cfg.weekly) { const e = WK.weeklyError(cfg, n); if (e) return e; }
  if (cfg.type === 'race' && PLUG.get(cfg.score) && PLUG.get(cfg.score).error) { const e = PLUG.get(cfg.score).error(cfg, n); if (e) return e; }
  if (cfg.type === 'race' && cfg.rot && n < 6) return { code: 'ot_rot_few', args: { n: 6 } }; // 3 bảng, mỗi bảng ít nhất 2 đội
  return cfg.type === 'race' && n > max ? { code: 'ot_race_many', args: { n: max } } : null;
};

module.exports = { lobby, gateLobby, gateWinners, groupMembers, MAX_GROUPS, mpThreshold, totalsBefore, SCORES, F1, MAX_EVENTS, MAX_RACE, MAX_RACE_HEATS, MAX_HEAT, cleanTable, normalizeRace, buildRace, heatsFor, cleanEvent, recordEvent, recordHeat, undoEvent, undoHeat, raceTable, raceView, raceError, eventOrder, rowPts };
