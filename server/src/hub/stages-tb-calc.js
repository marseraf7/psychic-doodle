/*
 * Thể thức thi đấu – các hệ số phụ (tie-break) mở rộng cho vòng tròn / Thụy Sĩ, theo Quy chế Tie-break của FIDE
 * (Handbook C.07, bản 2023) và các phần mềm xếp cặp Thụy Sĩ chuẩn:
 *   bh1 / bh2  Buchholz Cut-1 / Cut-2 (bỏ 1 / 2 đối thủ điểm thấp nhất)
 *   mbh2       Median-Buchholz 2 (bỏ 2 cao nhất và 2 thấp nhất)
 *   fb         Fore-Buchholz (như Buchholz nhưng coi mọi trận vòng cuối là hoà – công bố được trước khi vòng cuối xong)
 *   aob        Trung bình Buchholz của các đối thủ
 *   koya       Koya (vòng tròn): điểm giành được trước các đối thủ đạt ≥ 50% số điểm tối đa
 *   ps         Điểm luỹ tiến (cộng dồn điểm sau từng vòng – ai thắng sớm hơn được lợi)
 *   won        Số trận thắng thật (không tính miễn đấu / thắng do đối thủ vắng); 'wins' là mọi trận thắng
 *   bpg        Số ván đi sau (như "số ván cầm quân Đen" của cờ vua)
 *   aro / aroc1  Elo trung bình của đối thủ (Cut-1: bỏ đối thủ Elo thấp nhất)
 *   tpr        Elo thành tích (Elo trung bình đối thủ + dp theo bảng FIDE B.02)
 *   apro       Trung bình Elo thành tích của các đối thủ
 * Trận không đấu (miễn đấu, thắng / thua do vắng mặt, vắng cả hai, vòng không được ghép) – cfg.unplayed:
 *   'fide': theo Điều 16 của quy chế FIDE: khi tính hệ số cho người khác, mọi trận không đấu của một người được coi
 *           như hoà; còn trận không đấu của chính mình được tính như gặp một "đối thủ ảo" có số điểm bằng điểm của mình,
 *           và khi có "cắt" (Cut / Median) thì các đối thủ ảo bị cắt trước.
 *   'raw' (giải tạo trước bản này): dùng điểm thật của đối thủ, miễn đấu không cộng gì (như bản trước).
 * Dùng bởi stages-tiebreak.js (tally gọi extend sau khi đã tính điểm, Buchholz, SB cơ bản).
 */
'use strict';

// Bảng FIDE B.02 8.1(a): chênh lệch Elo dp theo tỉ lệ điểm p = 0,50; 0,51; …; 1,00 (p < 0,50: đối xứng, mang dấu âm)
const DP = [0, 7, 14, 21, 29, 36, 43, 50, 57, 65, 72, 80, 87, 95, 102, 110, 117, 125, 133, 141, 149, 158, 166, 175, 184, 193,
  202, 211, 220, 230, 240, 251, 262, 273, 284, 296, 309, 322, 336, 351, 366, 383, 401, 422, 444, 470, 501, 538, 589, 677, 800];
const dp = (p) => Math.sign(p - 0.5) * DP[Math.min(50, Math.round(Math.abs(p - 0.5) * 100))];

const sum = (a) => a.reduce((t, v) => t + v, 0);
const avg = (a) => (a.length ? sum(a) / a.length : 0);

/**
 * Bỏ k phần tử thấp nhất (low) và k cao nhất (high) của các đóng góp { v, dummy } – đối thủ ảo bị cắt trước.
 * Ít phần tử hơn số cần cắt thì không cắt (như Median-Buchholz bản trước).
 */
function cut(list, low, high = 0) {
  if (list.length <= low + high) return sum(list.map((c) => c.v));
  const lows = [...list].sort((a, b) => (b.dummy ? 1 : 0) - (a.dummy ? 1 : 0) || a.v - b.v);
  const rest = lows.slice(low).sort((a, b) => b.v - a.v);
  return sum(rest.slice(high).map((c) => c.v));
}

/**
 * Tính các hệ số mở rộng cho mọi người trong s (kết quả của tally). Mỗi người có x.rs: các vòng đã có kết quả
 * { r: vòng, o: đối thủ (null: miễn đấu / vắng), pts: điểm nhận, f: 1 thắng / 0,5 hoà / 0 thua, played: có đấu thật }.
 * ctx.rating(uid): Elo của người chơi (không có thì bỏ qua khi tính ARO / TPR).
 */
function extend(st, s, ctx = {}) {
  const p = { w: 1, d: 0, l: 0, ...st.cfg.points };
  const fide = st.cfg.unplayed === 'fide';
  const rating = (u) => { const r = ctx.rating ? Number(ctx.rating(u)) : 0; return Number.isFinite(r) && r > 0 ? r : 0; };
  const all = Object.values(s);
  // Thụy Sĩ: vòng đã xong hết mà một người không có trận (đã rút / chưa được ghép) = vòng không đấu, 0 điểm
  if (st.type === 'swiss' && Array.isArray(st.rounds)) {
    st.rounds.forEach((ids, r) => {
      if (!ids.every((id) => st.matches[id] && st.matches[id].done)) return;
      for (const x of all) if (!x.rs.some((e) => e.r === r)) x.rs.push({ r, o: null, pts: 0, f: 0, played: false });
    });
  }
  // Điểm "đã điều chỉnh" khi tính cho người khác: FIDE – mỗi trận không đấu coi như hoà
  const adj = new Map(all.map((x) => [x.uid, fide ? sum(x.rs.map((e) => (e.played ? e.pts : p.d))) : x.pts]));
  const scoreOf = (u) => adj.get(u) || 0;
  // Vòng cuối: Thụy Sĩ = vòng cuối theo cấu hình; vòng tròn = vòng lớn nhất có trận
  let maxR = -1;
  for (const x of all) for (const e of x.rs) maxR = Math.max(maxR, e.r);
  const last = st.type === 'swiss' && st.cfg.rounds ? st.cfg.rounds - 1 : maxR;
  const fore = new Map(all.map((x) => {
    const e = x.rs.find((y) => y.r === last && y.played);
    return [x.uid, scoreOf(x.uid) - (e ? e.pts - p.d : 0)];
  }));
  // Đóng góp của từng vòng cho các hệ số kiểu Buchholz
  const contrib = (x, val, own) => {
    const out = [];
    for (const e of x.rs) {
      if (e.played || (!fide && e.o && s[e.o])) out.push({ v: val(e.o), dummy: false });
      else if (fide) out.push({ v: own, dummy: true });
    }
    return out;
  };
  for (const x of all) {
    const c = contrib(x, scoreOf, x.pts); // đối thủ ảo: điểm thật của chính mình
    x.bh1 = cut(c, 1);
    x.bh2 = cut(c, 2);
    x.mbh2 = cut(c, 2, 2);
    x.fb = sum(contrib(x, (u) => fore.get(u) || 0, fore.get(x.uid) || 0).map((y) => y.v));
    if (fide) { // Buchholz / Median / SB theo FIDE (bản 'raw' giữ cách tính của tally)
      x.bh = sum(c.map((y) => y.v));
      x.mbh = cut(c, 1, 1);
      x.sb = sum(x.rs.map((e) => e.f * (e.played ? scoreOf(e.o) : x.pts)));
    }
    // Koya: điểm trước các đối thủ đạt ≥ 50% điểm tối đa (theo số trận đối thủ đã có kết quả)
    x.koya = sum(x.rs.filter((e) => e.o && s[e.o] && s[e.o].pts * 2 >= s[e.o].rs.length * p.w).map((e) => e.pts));
    // Điểm luỹ tiến: điểm của vòng r được cộng (số vòng − r) lần
    x.ps = sum(x.rs.map((e) => e.pts * (maxR + 1 - e.r)));
    x.won = x.rs.filter((e) => e.played && e.f === 1).length;
    const rs = x.rs.filter((e) => e.played).map((e) => rating(e.o)).filter((r) => r > 0).sort((a, b) => a - b);
    x.aro = Math.round(avg(rs));
    x.aroc1 = Math.round(rs.length > 1 ? avg(rs.slice(1)) : avg(rs));
    const played = x.rs.filter((e) => e.played && rating(e.o) > 0);
    x.tpr = played.length ? Math.round(x.aro + dp(sum(played.map((e) => e.f)) / played.length)) : 0;
  }
  for (const x of all) {
    const opps = x.rs.filter((e) => e.played && s[e.o]).map((e) => s[e.o]);
    x.aob = Math.round(avg(opps.map((o) => o.bh)) * 100) / 100;
    x.apro = Math.round(avg(opps.map((o) => o.tpr).filter((v) => v > 0)));
  }
  return s;
}

module.exports = { extend, dp, cut };
