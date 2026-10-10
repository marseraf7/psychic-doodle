/*
 * Giải đấu – áp "bản vá" cập nhật trang giải. Giải lớn (tới 512 người, hàng nghìn trận) không gửi lại cả trang
 * mỗi lần có trận xong: máy chủ chỉ gửi phần đổi so với lần trước (server/src/hub/tournaments.js – tourPatch):
 *   - các trường thường (trạng thái, bục trao giải…): gửi lại cả trường;
 *   - người chơi: những người đổi (playerUpd) + thứ tự mới nếu đổi (playerOrder);
 *   - mỗi giai đoạn: cả giai đoạn nếu cấu trúc đổi (giai đoạn mới, vòng Thụy Sĩ mới…), còn lại chỉ các trận đổi
 *     và các dòng bảng xếp hạng đổi (thứ tự bảng gửi lại nếu đổi; hạng = vị trí trong bảng).
 * Mọi thao tác đều là "đặt giá trị mới" nên áp lại nhiều lần vẫn đúng.
 * Dùng chung cho trình duyệt (window.CaroTourPatch) và kiểm thử máy chủ (require).
 */
(function (root) {
  'use strict';
  const SPECIAL = new Set(['playerUpd', 'playerOrder', 'stages']);

  /** Áp bản vá p vào trang giải t (sửa trực tiếp t). Trả về false nếu thiếu dữ liệu, cần tải lại cả trang. */
  function apply(t, p) {
    for (const k of Object.keys(p)) if (!SPECIAL.has(k)) t[k] = p[k];
    if (p.playerUpd || p.playerOrder) {
      const map = new Map(t.players.map((x) => [x.uid, x]));
      for (const x of p.playerUpd || []) map.set(x.uid, x);
      const order = p.playerOrder || t.players.map((x) => x.uid);
      t.players = order.map((u) => map.get(u)).filter(Boolean);
    }
    for (const s of p.stages || []) {
      if (s.full) { t.stageViews[s.index] = s.full; continue; }
      const v = t.stageViews[s.index];
      if (!v) return false;
      if ('done' in s) v.done = s.done;
      if (s.matches && s.matches.length) {
        const upd = new Map(s.matches.map((m) => [m.id, m]));
        const fix = (list) => list.map((m) => (m && upd.has(m.id) ? upd.get(m.id) : m));
        const fixRounds = (rounds) => rounds.map(fix);
        if (v.rounds) v.rounds = fixRounds(v.rounds);
        if (v.lrounds) v.lrounds = fixRounds(v.lrounds);
        if (v.gf) v.gf = fix(v.gf);
        if (v.third && upd.has(v.third.id)) v.third = upd.get(v.third.id);
        if (v.groups) for (const g of v.groups) g.rounds = fixRounds(g.rounds);
      }
      for (const tb of s.tables || []) {
        const holder = tb.key === 't' ? v : v.groups && v.groups[Number(tb.key.slice(1))];
        if (!holder || !holder.table) return false;
        const map = new Map(holder.table.map((r) => [r.uid, r]));
        for (const r of tb.rows || []) map.set(r.uid, r);
        const order = tb.order || holder.table.map((r) => r.uid);
        holder.table = order.map((u, i) => ({ ...map.get(u), rank: i + 1 }));
      }
    }
    return true;
  }

  const api = { apply };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CaroTourPatch = api;
})(typeof window !== 'undefined' ? window : this);
