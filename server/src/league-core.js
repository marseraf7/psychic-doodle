/*
 * Hạng đấu tuần – phần tính thuần (không CSDL, không mạng), dùng ở hub/league.js:
 *   weekKey(ms)            – tuần ISO theo giờ Việt Nam (UTC+7): '2026-W47'. Tuần bắt đầu 00:00 thứ Hai giờ Việt Nam.
 *   weekEnd(key)           – thời điểm (ms, UTC) kết thúc tuần đó (00:00 thứ Hai tuần sau, giờ Việt Nam)
 *   gamePoints(o)          – điểm của một ván tính điểm, kèm các luật chống cày điểm
 *   rollover(members)      – xếp hạng từng nhóm cuối tuần → lên hạng / giữ hạng / xuống hạng
 * Bậc: Đồng → Bạc → Vàng → Bạch kim → Kim cương → Cao thủ. Mỗi nhóm tối đa GROUP người (người có ván tính điểm đầu tiên
 * trong tuần được xếp vào nhóm còn chỗ của bậc mình). Ý tưởng "giải đấu tuần" học từ các ứng dụng học / chơi cờ phổ biến;
 * cách tính điểm, chống cày điểm, số người lên / xuống hạng là thiết kế riêng của game.
 */
'use strict';

const DIVS = ['bronze', 'silver', 'gold', 'platinum', 'diamond', 'master'];
const GROUP = 30;
const MOVE_N = 5; // tối đa số người lên / xuống hạng mỗi nhóm
const MIN_MOVES = 10; // ván ngắn hơn: không có điểm
const PTS = { win: 4, draw: 2, loss: 0 };
// Gặp lại cùng đối thủ trong tuần: ván thứ 1, 2 đủ điểm; 3, 4 nửa điểm; từ ván 5 không có điểm
const SAME_OPP = [1, 1, 0.5, 0.5];
const SUSPECT_RUN = 3; // ≥ 3 ván liền giữa hai người cùng một người thắng: coi là đáng ngờ, cả tuần không có điểm nữa
const TZ_MS = 7 * 3600 * 1000;
const DAY = 86400000;

/** Tuần ISO 8601 (thứ Hai là ngày đầu tuần; tuần 1 chứa ngày thứ Năm đầu tiên của năm) theo giờ UTC+7. */
function weekKey(ms) {
  const d = new Date(Math.floor((ms + TZ_MS) / DAY) * DAY); // ngày theo giờ Việt Nam (00:00 UTC của "ngày VN")
  const dow = (d.getUTCDay() + 6) % 7; // 0 = thứ Hai
  const thu = new Date(d.getTime() + (3 - dow) * DAY); // thứ Năm cùng tuần quyết định năm ISO
  const y = thu.getUTCFullYear();
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const w1 = jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * DAY; // thứ Hai của tuần 1
  const w = Math.floor((d.getTime() - w1) / (7 * DAY)) + 1;
  return `${y}-W${String(w).padStart(2, '0')}`;
}

/** Thứ Hai 00:00 (giờ VN) bắt đầu tuần key, tính ra ms UTC. */
function weekStart(key) {
  const m = /^(\d{4})-W(\d{2})$/.exec(String(key));
  if (!m) return NaN;
  const y = +m[1], w = +m[2];
  const jan4 = Date.UTC(y, 0, 4);
  const w1 = jan4 - ((new Date(jan4).getUTCDay() + 6) % 7) * DAY;
  return w1 + (w - 1) * 7 * DAY - TZ_MS;
}
const weekEnd = (key) => weekStart(key) + 7 * DAY;

/**
 * Điểm của một ván cho một người. o: { result: 'win' | 'draw' | 'loss', moves: số nước, reason, prior: [kết quả các ván
 * trước trong tuần giữa hai người, nhìn từ người này: 'win' | 'draw' | 'loss'], flagged: cặp đã bị đánh dấu đáng ngờ }.
 * Trả { pts, why } – why: lý do không có / bị giảm điểm (null nếu đủ điểm).
 */
function gamePoints(o) {
  if (['abort', 'abandoned', 'leave'].includes(o.reason)) return { pts: 0, why: 'abandoned' };
  if ((o.moves || 0) < MIN_MOVES) return { pts: 0, why: 'short' };
  if (o.flagged) return { pts: 0, why: 'suspect' };
  const prior = o.prior || [];
  if (suspicious(prior, o.result)) return { pts: 0, why: 'suspect', flag: true };
  const f = prior.length < SAME_OPP.length ? SAME_OPP[prior.length] : 0;
  const base = PTS[o.result] || 0;
  return { pts: Math.round(base * f), why: f < 1 ? 'same_opp' : null };
}

/** Ván này làm thành ≥ SUSPECT_RUN ván liền (cuối) cùng một người thắng giữa hai người không. */
function suspicious(prior, result) {
  if (result === 'draw') return false;
  const run = [...prior, result].slice(-SUSPECT_RUN);
  return run.length >= SUSPECT_RUN && run.every((r) => r === result);
}

/** Số người lên / xuống hạng của nhóm size người: tối đa MOVE_N, không quá một phần ba nhóm. */
const moveCount = (size) => Math.min(MOVE_N, Math.floor(size / 3));

/** Thứ tự trong nhóm: điểm cao trước, rồi ít ván hơn (hiệu quả hơn), rồi đạt điểm sớm hơn, rồi uid (ổn định). */
const order = (a, b) => b.pts - a.pts || a.games - b.games || (a.last || 0) - (b.last || 0) || (a.uid < b.uid ? -1 : 1);

/**
 * Kết quả cuối tuần. members: [{ uid, div, grp, pts, games, last }] → [{ uid, div, grp, rank, size, outcome: 'up' | 'stay' |
 * 'down', next }]. Người 0 điểm không được lên hạng.
 */
function rollover(members) {
  const groups = new Map();
  for (const m of members) {
    const k = m.div + ':' + m.grp;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(m);
  }
  const out = [];
  for (const list of groups.values()) {
    list.sort(order);
    const n = moveCount(list.length);
    list.forEach((m, i) => {
      let outcome = 'stay';
      if (i < n && m.div < DIVS.length - 1 && m.pts > 0) outcome = 'up';
      else if (i >= list.length - n && m.div > 0) outcome = 'down';
      out.push({ uid: m.uid, div: m.div, grp: m.grp, rank: i + 1, size: list.length, pts: m.pts, outcome, next: m.div + (outcome === 'up' ? 1 : outcome === 'down' ? -1 : 0) });
    });
  }
  return out;
}

module.exports = { DIVS, GROUP, MOVE_N, MIN_MOVES, PTS, SAME_OPP, SUSPECT_RUN, weekKey, weekStart, weekEnd, gamePoints, suspicious, moveCount, order, rollover };
