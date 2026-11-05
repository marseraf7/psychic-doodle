/*
 * Giải đấu Offline – treo giò tự động (kỷ luật), tính từ thẻ phạt ghi trong sự kiện trận (otour-league.js):
 *   Luật t.disc = { y, red, reset } – mặc định DEFAULT (luật thường gặp ở giải phong trào):
 *     y     – tích đủ y thẻ vàng thì treo giò 1 trận rồi xoá số thẻ đã tích (0 = không tính thẻ vàng tích luỹ);
 *     red   – thẻ đỏ, hoặc 2 thẻ vàng trong cùng một trận (thẻ đỏ gián tiếp – hai thẻ vàng đó không tích luỹ), treo giò
 *             `red` trận;
 *     reset – sang giai đoạn mới thì xoá thẻ vàng đang tích (như World Cup xoá thẻ sau vòng bảng / tứ kết). Án treo giò
 *             chưa chấp hành vẫn còn.
 *   Cầu thủ = đội + tên ghi trong sự kiện (không phân biệt hoa thường). Trận của mỗi đội xếp theo: giai đoạn → vòng
 *   (nhánh thua sau nhánh thắng cùng vòng, chung kết tổng sau cùng) → giờ đấu. Án treo giò rơi vào các trận kế tiếp của
 *   đội; trận đó đã có kết quả thì coi như đã chấp hành. Chưa có trận kế tiếp (chưa bốc thăm) thì ghi "trận tới".
 *   Cầu thủ đang bị treo giò mà vẫn có tên trong sự kiện của trận đó: cảnh báo cho ban tổ chức.
 * otSusp(t) → { list: [{ team, name, who, match, vs, si, served, why }], warn: [{ match, team, name, who }] } hoặc null.
 */
'use strict';
const { E } = require('../msg.js');

const DEFAULT = { y: 2, red: 1, reset: false };
const MAX_LIST = 200;
const real = (u) => typeof u === 'string' && u !== '-';
const ruleOf = (t) => ({ ...DEFAULT, ...(t.disc || {}) });

/** Thứ tự trận trong một giai đoạn (vòng; nhánh thua sau nhánh thắng; chung kết tổng / trận xếp hạng sau cùng). */
const orderKey = (m) => (m.gf ? 1e6 : 0) + (m.round || 0) * 2 + (m.lb ? 1 : 0);

function suspensions(t) {
  const rule = ruleOf(t);
  const name = (u) => (t.players.find((p) => p.uid === u) || {}).name || '?';
  // Có thẻ phạt nào không – không có thì không cần tính (giải không ghi thẻ)
  const stages = t.st || [];
  if (!stages.some((st) => Object.values(st.matches).some((m) => m.events && m.events.some((e) => e.type === 'yellow' || e.type === 'red')))) return null;
  const byTeam = new Map();
  stages.forEach((st, si) => {
    for (const m of Object.values(st.matches)) {
      if (!real(m.a) || !real(m.b)) continue;
      for (const u of [m.a, m.b]) { if (!byTeam.has(u)) byTeam.set(u, []); byTeam.get(u).push({ m, si }); }
    }
  });
  const list = [], warn = [];
  for (const [u, ms] of byTeam) {
    ms.sort((x, y) => x.si - y.si || orderKey(x.m) - orderKey(y.m) || (x.m.when || 0) - (y.m.when || 0));
    const P = new Map(); // tên viết thường → { who, y, ban: [lý do…] }
    const get = (who) => { const k = who.toLowerCase(); if (!P.has(k)) P.set(k, { who, y: 0, ban: [] }); return P.get(k); };
    let stage = -1;
    for (const { m, si } of ms) {
      if (si !== stage) { if (rule.reset && stage >= 0) for (const p of P.values()) p.y = 0; stage = si; }
      const side = m.a === u ? 'a' : 'b';
      const evs = (m.events || []).filter((e) => e.side === side && e.who);
      // 1) Người đang bị treo giò: ngồi ngoài trận này
      for (const p of P.values()) {
        if (!p.ban.length) continue;
        const why = p.ban.shift();
        list.push({ team: u, name: name(u), who: p.who, match: m.id, vs: name(side === 'a' ? m.b : m.a), si, served: !!m.done, why });
        if (evs.some((e) => e.who.toLowerCase() === p.who.toLowerCase())) warn.push({ match: m.id, team: u, name: name(u), who: p.who });
      }
      // 2) Thẻ của trận này
      const cnt = new Map();
      for (const e of evs) {
        if (e.type !== 'yellow' && e.type !== 'red') continue;
        const c = cnt.get(e.who.toLowerCase()) || { who: e.who, y: 0, r: 0 };
        c[e.type === 'red' ? 'r' : 'y']++;
        cnt.set(e.who.toLowerCase(), c);
      }
      for (const c of cnt.values()) {
        const p = get(c.who);
        if (c.r || c.y >= 2) { for (let i = 0; i < rule.red; i++) p.ban.push(c.r ? 'red' : 'y2'); continue; }
        if (c.y && rule.y > 0 && ++p.y >= rule.y) { p.y = 0; p.ban.push('yc'); }
      }
    }
    // Án chưa có trận để chấp hành (trận kế tiếp chưa bốc thăm)
    for (const p of P.values()) for (const why of p.ban) list.push({ team: u, name: name(u), who: p.who, match: null, vs: null, si: null, served: false, why });
  }
  // Án sắp tới lên đầu, rồi đã chấp hành (mới nhất trước)
  list.sort((a, b) => a.served - b.served || (a.si == null ? 1e9 : a.si) - (b.si == null ? 1e9 : b.si) || a.name.localeCompare(b.name) || a.who.localeCompare(b.who));
  return list.length || warn.length ? { list: list.slice(0, MAX_LIST), warn: warn.slice(0, 50) } : null;
}

class OTourDisc {
  otSusp(t) { return suspensions(t); }

  /** Luật treo giò của giải (ban tổ chức đổi lúc nào cũng được – danh sách tính lại ngay). */
  on_otDisc(conn, { id, y, red, reset }) {
    const { t } = this.otManaged(conn, id);
    const yy = Math.floor(Number(y)), rr = Math.floor(Number(red));
    if (!(yy >= 0 && yy <= 9) || !(rr >= 1 && rr <= 5)) throw E('bad_message');
    t.disc = { y: yy, red: rr, reset: reset === true };
    this.otSave(t);
  }
}

module.exports = { OTourDisc, suspensions, DEFAULT };
