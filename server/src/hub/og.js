/*
 * Dữ liệu cho thẻ xem trước link chia sẻ (A3 – Zalo / Messenger): web.js hỏi ogInfo(tham số link) khi trả trang chính,
 * og-meta.js dựng chữ + HTML. Chỉ trả đúng phần KHÁCH CHƯA ĐĂNG NHẬP xem được (cùng luật kiểm quyền với trang thật):
 *   ?replay=<mã> ván đã lưu · ?room=<mã> ván đang đấu xem được (công khai / ghép nhanh) hoặc lời mời phòng (chỉ mã phòng,
 *   không lộ tên người trong phòng riêng) · ?t= giải đấu · ?o= giải Offline · ?club= CLB · ?u=<tên đăng nhập> hồ sơ · ?bc= tường thuật giải (C3) ·
 *   ?cls= bài Lớp học / Nghiên cứu (C2 – chỉ bài công khai / có link: classroom.js clsCanView như khách).
 * Không tìm thấy / không được xem → null (trang chính giữ thẻ mặc định, không lộ là có tồn tại).
 * sitemapPaths(): đường dẫn công khai cho /sitemap.xml (seo.js) – cùng luật xem như khách, bỏ giải "chỉ link".
 */
'use strict';
const { plainRich } = require('./shared.js');
const R = require('../rating.js');

const KEY = /^[\w.-]{1,40}$/; // mã ván (base64url), mã phòng, mã / link riêng của giải, CLB, tên đăng nhập

class Og {
  /** q: URLSearchParams của link. → { info, url, image } hoặc null. */
  ogInfo(q) {
    const get = (k) => { const v = q.get(k); return v && KEY.test(v) ? v : null; };
    let v;
    if ((v = get('replay'))) {
      const g = this.store.gameByShare(v);
      if (!g) return null;
      return { info: { kind: 'replay', x: g.x_name, o: g.o_name, winner: g.winner, n: (g.moves || []).length }, url: '/?replay=' + g.share, image: `/api/replay/${g.share}.png` };
    }
    if ((v = get('room'))) {
      const code = v.replace(/\D/g, '').slice(0, 6);
      const room = code && this.rooms.get(code);
      if (!room || room.tour) return null; // phòng của giải: mở qua trang giải
      const url = '/?room=' + code;
      if (this.canWatch(room, null) && room.players.length === 2) {
        const nm = (side) => { const id = room.seats[side]; const p = room.players.find((x) => x.id === id); return p ? p.name : '?'; };
        return { info: { kind: 'live', x: nm(1), o: nm(2), n: room.board.moves.length }, url, image: `/api/og/room/${code}.png` };
      }
      return { info: { kind: 'room', code }, url, image: '/api/og/card.png' };
    }
    if ((v = get('bc'))) { // Tường thuật giải đấu (C3 – broadcast.js): giải trực tuyến hoặc "o.<mã>" giải Offline
      const d = this.bcData(v);
      if (!d) return null;
      return { info: { kind: 'bc', name: d.name, n: d.kind === 'tour' ? d.boards.length : 0 }, url: '/?bc=' + v, image: '/api/og/card.png' };
    }
    if ((v = get('cls'))) { // Lớp học / Nghiên cứu (C2): bài riêng tư / CLB không lộ ra (như khách chưa đăng nhập)
      const s = this.store.clsGet(v);
      if (!s || !this.clsCanView(s, null)) return null;
      return { info: { kind: 'cls', name: s.title, n: (s.chapters || []).length }, url: '/?cls=' + s.id, image: '/api/og/card.png' };
    }
    if ((v = get('t'))) {
      const t = this.tours.get(v) || this.tourBySlug(v);
      if (!t || !this.canSeeTour(t, null)) return null;
      return { info: { kind: 'tour', name: t.name, n: (t.players || []).length }, url: '/?t=' + (t.slug || t.id), image: '/api/og/card.png' };
    }
    if ((v = get('o'))) {
      const t = this.otGet(v.toLowerCase());
      if (!t || t.status === 'draft' || !this.otCanSee(t, null)) return null;
      return { info: { kind: 'otour', name: t.name, n: (t.players || []).length }, url: '/?o=' + (t.slug || t.id), image: '/api/og/card.png' };
    }
    if ((v = get('club'))) {
      const c = this.clubs.get(v);
      if (!c || !this.canSeeClub(c, null)) return null;
      return { info: { kind: 'club', name: c.name, intro: c.intro || plainRich(c.desc, 160), n: Object.keys(c.members).length }, url: '/?club=' + c.id, image: '/api/og/card.png' };
    }
    if ((v = get('u'))) {
      const u = this.store.byUsername.get(v.toLowerCase());
      if (!u) return null;
      const s = u.stats || {};
      return { info: { kind: 'user', name: u.name, username: u.username, rating: Math.round(u.rating || 0), games: (s.wins | 0) + (s.losses | 0) + (s.draws | 0) },
        url: '/?u=' + u.username, image: '/api/og/card.png' };
    }
    return null;
  }

  /** Đường dẫn công khai cho sitemap (seo.js): giải trực tuyến công khai (+ tường thuật khi đang đấu), giải Offline công
   *  khai, CLB đã duyệt mà khách xem được, hồ sơ kỳ thủ đầu các bảng xếp hạng. Giải "chỉ link" / riêng tư / CLB / nháp: không. */
  sitemapPaths(limit = 2000) {
    const out = [];
    const tours = [...this.tours.values()].filter((t) => t.access === 'public' && this.canSeeTour(t, null))
      .sort((a, b) => (b.startsAt || b.created || 0) - (a.startsAt || a.created || 0)).slice(0, 300);
    for (const t of tours) {
      out.push('/?t=' + (t.slug || t.id));
      if (t.status === 'running') out.push('/?bc=' + t.id);
    }
    for (const t of this.store.listOTours({ limit: 300 })) if (t.status !== 'draft') out.push('/?o=' + (t.slug || t.id));
    for (const c of [...this.clubs.values()].filter((x) => x.status === 'approved' && this.canSeeClub(x, null)).slice(0, 300)) out.push('/?club=' + c.id);
    const seen = new Set();
    for (const pool of [null, ...R.POOLS]) {
      for (const p of this.publicLeaderboard(pool).players) if (!seen.has(p.username)) { seen.add(p.username); out.push('/?u=' + p.username); }
    }
    return out.slice(0, limit);
  }

  /** Ván đang đấu xem được (cho ảnh og của link ?room=): nước đi + luật, hoặc null. */
  ogRoomMoves(code) {
    const room = this.rooms.get(String(code));
    if (!room || room.tour || !this.canWatch(room, null)) return null;
    return { moves: room.board.moves.map((m) => [m.x, m.y]), rule: room.rule };
  }
}

module.exports = { Og };
