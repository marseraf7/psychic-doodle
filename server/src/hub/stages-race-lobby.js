/*
 * Giải offline – phần thêm của hệ Race (sinh tồn tính điểm; chỉ mô phỏng thể thức):
 *   reseedAfter – xếp lại các lượt (lobby) theo bảng điểm sau mỗi cfg.reseed trận (kiểu TFT Checkmate: lobby 8 người, đổi
 *                 sau mỗi 2 game; khối trận cùng lobby, chia kiểu rắn theo thứ hạng hiện tại).
 *   ALGS (kiểu Apex Legends Global Series):
 *     cfg.poi = { maps: [{ name, pois: [...] }], order: 'seed' | 'snake' } – draft điểm hạ cánh độc quyền theo bản đồ: mỗi POI
 *       chỉ một đội; thứ tự chọn theo bảng điểm hiện tại (snake: lượt chẵn đảo ngược – chỉ để hiển thị);
 *     cfg.legendBan – mỗi dòng kết quả ghi Legend của đội (pick); sau mỗi trận, Legend được nhiều đội chọn nhất bị cấm khỏi các
 *       trận sau (hoà tần suất: Legend có tổng lượt chọn từ đầu giai đoạn cao hơn; vẫn hoà thì cấm cả hai). Danh sách cấm là dữ
 *       liệu suy ra – huỷ kết quả trận thì tự tính lại.
 * stages-race.js truyền vào raceTable / heatsFor để không phụ thuộc vòng.
 */
'use strict';

/**
 * Trận i vừa xong mà trận i + 1 mở một khối mới (chia hết cho reseed) và cả khối chưa đấu → các lượt của khối chia kiểu rắn
 * theo bảng điểm hiện tại (giữ nguyên trong cả khối). Huỷ kết quả rồi nhập lại thì chia lại (khi khối sau chưa đấu).
 */
function reseedAfter(st, i, raceTable, heatsFor) {
  const R = st.cfg.reseed, next = i + 1;
  if (next >= st.events.length || next % R) return;
  const block = st.events.slice(next, next + R);
  if (block.some((e) => e.done || (e.heats || []).some((h) => h.done))) return;
  const order = raceTable(st, (u) => st.entrants.indexOf(u) + 1).list;
  for (const e of block) e.heats = heatsFor(order, st.cfg.heat, 0);
}

const clean = (x, n) => String(x == null ? '' : x).replace(/[<>|]/g, '').trim().slice(0, n);
const MAX_MAPS = 4, MAX_POIS = 40;

/** Chuẩn hoá phần ALGS của giai đoạn race tính điểm. */
function normalizeAlgs(c, out) {
  if (out.score !== 'points') return;
  const P = c.poi;
  if (P && Array.isArray(P.maps)) {
    const maps = P.maps.slice(0, MAX_MAPS).map((m) => ({ name: clean(m && m.name, 30) || '?', pois: [...new Set((Array.isArray(m && m.pois) ? m.pois : []).map((x) => clean(x, 30)).filter(Boolean))].slice(0, MAX_POIS) })).filter((m) => m.pois.length);
    if (maps.length) out.poi = { maps, order: P.order === 'snake' ? 'snake' : 'seed' };
  }
  if (c.legendBan === true) out.legendBan = true;
}

/** Danh sách Legend bị cấm trước trận i: [{ legend, ev (trận gây cấm, 0-based), n (số đội chọn) }]. */
function bansBefore(st, i) {
  const out = [], total = new Map();
  for (let j = 0; j < Math.min(i, st.events.length); j++) {
    const e = st.events[j];
    if (!e.done) continue;
    const cnt = new Map();
    for (const r of e.rows || []) if (r.pick) { cnt.set(r.pick, (cnt.get(r.pick) || 0) + 1); total.set(r.pick, (total.get(r.pick) || 0) + 1); }
    if (!cnt.size) continue;
    const top = Math.max(...cnt.values());
    let tied = [...cnt.keys()].filter((k) => cnt.get(k) === top);
    if (tied.length > 1) { const best = Math.max(...tied.map((k) => total.get(k))); tied = tied.filter((k) => total.get(k) === best); }
    for (const k of tied) if (!out.some((b) => b.legend === k)) out.push({ legend: k, ev: j, n: top });
  }
  return out;
}

/** Lỗi khi ghi kết quả trận i: Legend đã bị cấm. */
function pickError(st, i, rows) {
  if (!st.cfg.legendBan) return null;
  const banned = new Set(bansBefore(st, i).map((b) => b.legend));
  const bad = rows.find((r) => r.pick && banned.has(r.pick));
  return bad ? { code: 'ot_legend_banned', args: { x: bad.pick } } : null;
}

/** Gán POI (ban tổ chức): map – chỉ số bản đồ, poi – tên (null = bỏ). Trả null hoặc mã lỗi. */
function setPoi(st, map, uid, poi) {
  const M = st.cfg.poi && st.cfg.poi.maps[map];
  if (!M || !st.entrants.includes(uid)) return 'ot_poi_bad';
  st.poi = st.poi || {};
  const cur = { ...(st.poi[map] || {}) };
  if (poi == null || poi === '') delete cur[uid];
  else {
    if (!M.pois.includes(poi)) return 'ot_poi_bad';
    if (Object.entries(cur).some(([u, p]) => p === poi && u !== uid)) return 'ot_poi_taken';
    cur[uid] = poi;
  }
  st.poi = { ...st.poi, [map]: cur };
  return null;
}

/** Thứ tự draft POI theo bảng điểm hiện tại (snake: mỗi bản đồ thứ hai đảo ngược). */
const poiOrder = (st, list, map) => (st.cfg.poi && st.cfg.poi.order === 'snake' && map % 2 ? [...list].reverse() : list);

module.exports = { reseedAfter, normalizeAlgs, bansBefore, pickError, setPoi, poiOrder };
