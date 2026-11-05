/*
 * Giải đấu Offline – phần quản lý kiểu MyLeague (docs/de-xuat-giai-offline.md mục 5; chỉ học ý tưởng):
 *   - Lịch & sân: giờ đấu (m.when – mili giây) và sân (m.venue) của từng trận.
 *   - Đội hình: mỗi đội một danh sách cầu thủ { no, name, pos } (p.roster), sửa lúc nào cũng được.
 *   - Sự kiện trong trận (m.events): bàn thắng / phản lưới / thẻ vàng / thẻ đỏ, phút, bên (a | b), cầu thủ (số áo / tên).
 *   - Thống kê: vua phá lưới, thẻ phạt – cộng từ sự kiện của mọi trận (otStats, gửi kèm trang giải).
 *   - Đăng ký: ban tổ chức mở đăng ký (t.reg.open) khi giải chưa bắt đầu; người có tài khoản gửi tên đội (+ đội hình),
 *     ban tổ chức duyệt / từ chối (duyệt = thêm đội như otTeamsAdd).
 * Kết quả trận vẫn nhập riêng (otour-run.js) – sự kiện chỉ để ghi lại và thống kê, không tự đổi tỉ số.
 */
'use strict';
const { E } = require('../msg.js');
const { cleanPublicText } = require('./shared.js');
const ST = require('./stages.js');

const EVENT_TYPES = ['goal', 'own', 'yellow', 'red'];
const MAX_EVENTS = 60; // mỗi trận
const MAX_ROSTER = 40;
const MAX_REGS = 100;
const clean = (s, n) => cleanPublicText(String(s == null ? '' : s), n).replace(/[<>|]/g, '').trim();

/** Đọc danh sách cầu thủ: mỗi dòng "10 Nguyễn Văn A | Tiền đạo" hoặc "Nguyễn Văn A". */
function parseRoster(lines) {
  const out = [];
  for (const raw of (Array.isArray(lines) ? lines : String(lines || '').split('\n')).slice(0, MAX_ROSTER)) {
    const [left, pos] = String(raw || '').split('|');
    const m = /^\s*(\d{1,3})\s+(.+)$/.exec(left || '');
    const name = clean(m ? m[2] : left, 40);
    if (!name) continue;
    out.push({ no: m ? Number(m[1]) : null, name, pos: clean(pos, 20) });
  }
  return out;
}

class OTourLeague {
  /** Trận bất kỳ của giải (mọi giai đoạn đã bốc thăm) theo mã – cho lịch / sự kiện (cả trận đã xong). */
  otAnyMatch(t, match) {
    const i = /^s(\d+)/.exec(String(match || ''));
    const st = i && t.st && t.st[Number(i[1])];
    const m = st && st.matches[match];
    if (!m) throw E('tour_match_not_found');
    return { st, m };
  }

  /** Giờ đấu và sân của một trận (when: mili giây hoặc null để xoá; venue: chữ). */
  on_otMatchInfo(conn, { id, match, when, venue }) {
    const { t } = this.otManaged(conn, id);
    const { st, m } = this.otAnyMatch(t, match);
    const w = when == null || when === '' ? null : Math.floor(Number(when));
    if (w !== null && !(w > 946684800000 && w < 4102444800000)) throw E('bad_message'); // năm 2000–2100
    m.when = w;
    m.venue = clean(venue, 60) || null;
    st.v = (st.v || 0) + 1;
    this.otSave(t);
  }

  /** Đội hình một đội (thay cả danh sách). */
  on_otRoster(conn, { id, team, lines }) {
    const { t } = this.otManaged(conn, id);
    const p = t.players.find((x) => x.uid === team);
    if (!p) throw E('bad_message');
    p.roster = parseRoster(lines);
    this.otSave(t);
  }

  /** Thêm sự kiện trận: type, side ('a' | 'b'), who (tên / số áo), min (phút). */
  on_otEvent(conn, { id, match, type, side, who, min }) {
    const { t } = this.otManaged(conn, id);
    const { st, m } = this.otAnyMatch(t, match);
    if (!ST.real(m.a) || !ST.real(m.b) || !EVENT_TYPES.includes(type) || (side !== 'a' && side !== 'b')) throw E('bad_message');
    m.events = m.events || [];
    if (m.events.length >= MAX_EVENTS) throw E('ot_events_many', { n: MAX_EVENTS });
    const mm = min == null || min === '' ? null : Math.floor(Number(min));
    m.events.push({ type, side, who: clean(who, 40), min: Number.isInteger(mm) && mm >= 0 && mm <= 300 ? mm : null });
    m.events.sort((x, y) => (x.min == null ? 999 : x.min) - (y.min == null ? 999 : y.min));
    st.v = (st.v || 0) + 1;
    this.otSave(t);
  }

  on_otEventDel(conn, { id, match, i }) {
    const { t } = this.otManaged(conn, id);
    const { st, m } = this.otAnyMatch(t, match);
    const k = Math.floor(Number(i));
    if (!m.events || !m.events[k]) throw E('bad_message');
    m.events.splice(k, 1);
    st.v = (st.v || 0) + 1;
    this.otSave(t);
  }

  /** Thống kê cầu thủ của cả giải: vua phá lưới (không tính phản lưới), thẻ phạt. Tối đa 30 dòng mỗi bảng. */
  otStats(t) {
    const goals = new Map(), cards = new Map();
    const team = (u) => (t.players.find((p) => p.uid === u) || {}).name || '?';
    for (const st of t.st || []) {
      for (const m of Object.values(st.matches)) {
        for (const e of m.events || []) {
          if (!e.who) continue;
          const u = e.side === 'a' ? m.a : m.b;
          const key = u + '|' + e.who.toLowerCase();
          if (e.type === 'goal') { const x = goals.get(key) || { who: e.who, team: team(u), n: 0 }; x.n++; goals.set(key, x); }
          if (e.type === 'yellow' || e.type === 'red') { const x = cards.get(key) || { who: e.who, team: team(u), y: 0, r: 0 }; x[e.type === 'red' ? 'r' : 'y']++; cards.set(key, x); }
        }
      }
    }
    const scorers = [...goals.values()].sort((a, b) => b.n - a.n || a.who.localeCompare(b.who)).slice(0, 30);
    const disc = [...cards.values()].sort((a, b) => b.r - a.r || b.y - a.y || a.who.localeCompare(b.who)).slice(0, 30);
    return scorers.length || disc.length ? { scorers, cards: disc } : null;
  }

  // ------------------------------------------------------------ Đăng ký đội
  on_otRegOpen(conn, { id, open }) {
    const { t } = this.otManaged(conn, id);
    if (t.status !== 'draft') throw E('tour_closed');
    t.reg = { ...(t.reg || {}), open: open === true };
    this.otSave(t);
  }

  /** Người có tài khoản đăng ký một đội (mỗi tài khoản một đơn mỗi giải). */
  on_otRegister(conn, { id, name, roster }) {
    const me = this.requireUser(conn);
    const t = this.otGet(id);
    if (!t || !this.otCanSee(t, me.id)) throw E('ot_not_found');
    if (t.status !== 'draft' || !(t.reg && t.reg.open)) throw E('ot_reg_closed');
    t.regs = t.regs || [];
    const n = clean(name, 40);
    if (!n) throw E('bad_message');
    if (t.regs.some((r) => r.by === me.id)) throw E('ot_reg_dup');
    if (t.regs.length >= MAX_REGS) throw E('ot_reg_full');
    if (t.players.some((p) => p.name.toLowerCase() === n.toLowerCase()) || t.regs.some((r) => r.name.toLowerCase() === n.toLowerCase())) throw E('ot_team_dup');
    t.regs.push({ id: 'r' + Date.now().toString(36) + Math.floor(Math.random() * 1e4), by: me.id, byName: me.name, name: n, roster: parseRoster(roster), at: Date.now() });
    this.otLog(t, me.id, 'reg', { name: n });
    this.otSave(t);
  }

  /** Ban tổ chức duyệt (thêm đội) / từ chối một đơn đăng ký. */
  on_otRegDecide(conn, { id, reg, ok }) {
    const { t, me } = this.otManaged(conn, id);
    const r = (t.regs || []).find((x) => x.id === reg);
    if (!r) throw E('bad_message');
    t.regs = t.regs.filter((x) => x !== r);
    if (ok === true) {
      if (t.status !== 'draft') throw E('tour_closed');
      if (this.otAddTeams(t, [r.name])) {
        const p = t.players[t.players.length - 1];
        if (r.roster.length) p.roster = r.roster;
        p.by = r.by;
      }
    }
    this.otLog(t, me.id, ok === true ? 'reg_ok' : 'reg_no', { name: r.name });
    this.otSave(t);
  }

  /** Phần riêng theo người xem (otMine): ban tổ chức thấy các đơn; người đăng ký thấy đơn của mình. */
  otRegMine(t, uid) {
    if (!t.reg || !t.regs) return {};
    if (this.otCanManage(t, uid)) return { regs: t.regs.map((r) => ({ id: r.id, name: r.name, byName: r.byName, n: r.roster.length, at: r.at })) };
    const mine = uid && t.regs.find((r) => r.by === uid);
    return mine ? { myReg: { name: mine.name } } : {};
  }
}

module.exports = { OTourLeague, parseRoster, EVENT_TYPES };
