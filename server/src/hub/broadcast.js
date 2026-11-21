/*
 * Tường thuật giải đấu (C3) – dữ liệu cho trang caro/broadcast.html (ý tưởng kiểu "broadcast" của Lichess, tự viết):
 *   bcData(key) – key: mã / link riêng của giải trực tuyến, hoặc "o.<mã | link riêng>" của giải Offline.
 *   Giải trực tuyến: các ván đang đấu (bàn nhỏ – nước đi, lượt, kết quả nếu vừa xong), bảng xếp hạng, kết quả gần đây,
 *   nhãn vòng hiện tại. Trang tự hỏi lại mỗi vài giây nên vòng mới tự hiện (không cần tải lại).
 *   Giải Offline (kết quả do ban tổ chức nhập): tên, trạng thái + đường dẫn trang nhúng sẵn có (embed.html) để hiện
 *   bảng / nhánh đấu đúng như trang giải.
 * Chỉ giải người chưa đăng nhập xem được (cùng luật với trang giải công khai – api.js publicTour / otour.js publicOTour);
 * bàn của giải CLB / riêng tư không lộ ra (watch.js canWatch). Phục vụ ở /api/v1/broadcast/<key> (api-v1-http.js).
 * Nhiều người cùng xem (mỗi trang hỏi lại 5 giây một lần): bản đã dựng của giải trực tuyến dùng lại CACHE_MS (không duyệt lại
 * mọi phòng cho từng người xem); quyền xem vẫn kiểm mỗi lần nên giải vừa chuyển riêng tư thôi hiện ngay.
 * bcFresh(key): có bản dựng còn mới (api-v1-http.js không tính lượt giới hạn theo IP – cả lớp chung một IP vẫn xem được).
 */
'use strict';
const { uidOf } = require('./shared.js');

const MAX_BOARDS = 24;
const MAX_RESULTS = 15;
const RECENT_MS = 90 * 1000; // ván vừa xong còn hiện trên lưới bàn 90 giây (thấy kết quả trước khi sang vòng sau)
const CACHE_MS = 1000; // dùng lại bản đã dựng (hub.T.BC_CACHE_MS đổi được khi thử)
const CACHE_MAX = 200;

class Broadcast {
  bcCacheMs() { return this.T && Number.isFinite(this.T.BC_CACHE_MS) ? this.T.BC_CACHE_MS : CACHE_MS; }

  /** Có bản dựng còn mới của key không (chỉ giải trực tuyến – giải Offline trả gọn, không cần). */
  bcFresh(key) {
    const c = this.bcCache && this.bcCache.get(String(key || '').slice(0, 42));
    return !!c && Date.now() - c.at < this.bcCacheMs();
  }

  bcData(key) {
    key = String(key || '').slice(0, 42);
    if (key.startsWith('o.')) {
      const slug = key.slice(2).toLowerCase();
      const t = this.otGet(slug);
      if (!t || t.status === 'draft' || !this.otCanSee(t, null)) return null;
      const id = t.slug || t.id;
      return { kind: 'otour', key, name: t.name, status: t.status, players: (t.players || []).length, embed: '/embed.html?o=' + encodeURIComponent(id), url: '/?o=' + id };
    }
    const t = /^[0-9a-f]{6,20}$/.test(key) ? this.tours.get(key) : this.tourBySlug(key);
    if (!t || !this.canSeeTour(t, null)) return null;
    const cache = this.bcCache || (this.bcCache = new Map());
    const hit = cache.get(key);
    if (hit && hit.id === t.id && Date.now() - hit.at < this.bcCacheMs()) return hit.data;
    const data = this.bcBuild(t);
    if (!data) return null;
    cache.delete(key);
    cache.set(key, { at: Date.now(), id: t.id, data });
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
    return data;
  }

  /** Dựng dữ liệu tường thuật của giải trực tuyến t (đã kiểm quyền xem). */
  bcBuild(t) {
    const pub = this.publicTour(t.id);
    if (!pub) return null;
    const name = (u) => this.player(t, u)?.name || '?';
    const now = Date.now();
    const boards = [];
    for (const r of this.rooms.values()) {
      if (!r.tour || r.tour.id !== t.id || r.players.length !== 2 || !this.canWatch(r, null)) continue;
      const done = !!r.winner;
      if (done && now - (r.activeAt || 0) > RECENT_MS) continue;
      const side = (s) => { const pid = r.seats[s]; return r.players.find((p) => p.id === pid)?.name || name(uidOf(pid)); };
      boards.push({ code: r.code, x: side(1), o: side(2), rule: r.rule, moves: r.board.moves.map((m) => [m.x, m.y]), turn: done ? null : r.turn,
        winner: r.winner || null, round: r.tour.round || null });
      if (boards.length >= MAX_BOARDS) break;
    }
    boards.sort((a, b) => (a.winner ? 1 : 0) - (b.winner ? 1 : 0) || b.moves.length - a.moves.length);
    const results = [];
    if (t.format === 'arena') {
      for (const g of t.games.slice(-MAX_RESULTS).reverse()) results.push({ x: name(g.x), o: name(g.o), winner: g.w === g.x ? 'x' : g.w === g.o ? 'o' : 'draw', share: g.share || null });
    } else {
      for (const st of [...(t.st || [])].reverse()) {
        const ms = Object.values(st.matches || {}).filter((m) => m.done && m.a && m.b && m.a !== '-' && m.b !== '-').sort((a, b) => b.round - a.round);
        for (const m of ms) {
          const last = (m.games || []).slice(-1)[0];
          results.push({ x: name(m.a), o: name(m.b), winner: m.winner === m.a ? 'x' : m.winner === m.b ? 'o' : 'draw', share: last && last.share ? last.share : null, round: m.round });
          if (results.length >= MAX_RESULTS) break;
        }
        if (results.length >= MAX_RESULTS) break;
      }
    }
    const standings = pub.players.filter((p) => !p.withdrawn).slice(0, 30).map((p, i) => ({ rank: i + 1, name: p.name, score: p.score || 0, wins: p.wins || 0, draws: p.draws || 0, losses: p.losses || 0, out: p.out || null }));
    const rounds = boards.map((b) => b.round).filter(Boolean);
    return {
      kind: 'tour', key: t.slug || t.id, id: t.id, name: t.name, format: t.format, status: t.status, startsAt: t.startsAt, endsAt: t.endsAt || null,
      stage: t.stage || 0, round: rounds.length ? Math.max(...rounds) : null, podium: (pub.podium || []).filter(Boolean).map((p) => p.name),
      boards, results, standings, url: '/?t=' + (t.slug || t.id), now,
    };
  }
}

module.exports = { Broadcast };
