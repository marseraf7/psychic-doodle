/*
 * Giải đấu – link riêng và các tuỳ chọn tab "Nhánh đấu" của trang Cài đặt nâng cao (như Advanced options → Bracket
 * của Challonge):
 *  - slug: link riêng của giải (…/?t=<slug>, như challonge.com/<url>): 3–20 ký tự a-z 0-9 - _, không trùng giải khác.
 *  - roundLabels: hiện nhãn vòng tự đặt (tab Quản lý → lịch từng vòng); tắt thì dùng tên mặc định.
 *  - hideBracket: ẩn nhánh đấu xem trước (bốc thăm thử theo danh sách hiện tại) với người xem trước giờ đấu.
 *  - quickAdvance: chỉ báo người thắng, không nhập tỉ số (giải offline – tour-score.js).
 *  - attachments: đính kèm cho trận (link, ảnh, ghi chú) của ban tổ chức và hai người chơi của trận.
 *  - placeBy: xếp người vào nhánh theo luật hạt giống ('seed': 1 gặp 16, 8 gặp 9…) hay theo thứ tự danh sách
 *    ('list': 1 gặp 2, 3 gặp 4…) – stages-elim.js.
 *  - shareImages: ảnh chia sẻ kết quả trận (vẽ ở trình duyệt – caro/tour-share-img.js) cho loại trực tiếp, nhánh thắng
 *    – thua, vòng tròn, Thụy Sĩ.
 * Phần tuỳ chọn đổi được cả khi giải đang chạy / đã xong (chỉ ảnh hưởng cách hiện): LIVE_OPTS.
 */
'use strict';
const { E } = require('../msg.js');
const { cleanPublicText } = require('./shared.js');
const ST = require('./stages.js');

const SLUG_RE = /^[a-z0-9][a-z0-9_-]{2,19}$/;
const MAX_ATT = 10; // đính kèm mỗi trận
const LIVE_OPTS = ['slug', 'roundLabels', 'quickAdvance', 'attachments', 'shareImages', 'showNews', 'showStandings', 'notifyMatch', 'notifyResults'];

class TourOpts {
  /** Các trường tuỳ chọn từ client (tourFields gọi). ko: thi đấu theo giai đoạn; offline: giải offline. */
  optFields(o, ko, offline) {
    const slug = String(o.slug || '').trim().toLowerCase();
    if (slug && !SLUG_RE.test(slug)) throw E('tour_slug_bad');
    return {
      slug: slug || null,
      roundLabels: o.roundLabels !== false,
      hideBracket: ko && o.hideBracket === true,
      quickAdvance: offline && o.quickAdvance === true,
      attachments: ko && o.attachments === true,
      placeBy: ko && o.placeBy === 'list' ? 'list' : 'seed',
      shareImages: ko && o.shareImages !== false,
    };
  }

  /** Link riêng phải chưa có giải nào khác dùng (kể cả trùng mã giải). id: giải đang sửa (bỏ qua chính nó). */
  checkSlug(slug, id = null) {
    if (!slug) return;
    for (const t of this.tours.values()) if (t.id !== id && (t.slug === slug || t.id === slug)) throw E('tour_slug_taken');
  }

  /** Tìm giải theo link riêng (mở bằng ?t=<slug>). */
  tourBySlug(slug) {
    const s = String(slug || '').toLowerCase();
    if (!SLUG_RE.test(s)) return null;
    for (const t of this.tours.values()) if (t.slug === s) return t;
    return null;
  }

  /** Phần chung gửi cho client. */
  optShared(t) {
    return {
      slug: t.slug || null, roundLabels: t.roundLabels !== false, hideBracket: !!t.hideBracket, quickAdvance: !!t.quickAdvance,
      attachments: !!t.attachments, placeBy: t.placeBy || 'seed', shareImages: t.format === 'bracket' && t.shareImages !== false,
      // Nhánh đấu xem trước (trước giờ đấu); tắt "hiện xem trước" thì chỉ ban tổ chức thấy (tourMine – previewMine)
      preview: t.hideBracket ? null : this.previewView(t),
    };
  }

  /** Bốc thăm thử giai đoạn đầu theo danh sách hiện tại (như khi bắt đầu giải) – chỉ trước giờ đấu. */
  previewView(t) {
    if (t.format !== 'bracket' || !t.stages || !['pending', 'scheduled'].includes(t.status) || t.teamMatch) return null;
    const seeds = this.draftSeeds(t);
    if (seeds.length < 2) return null;
    const idx = new Map(seeds.map((u, i) => [u, i + 1]));
    // Số hạt giống dự kiến hiện trong ô trận (ẩn hạt giống: không hiện)
    const side = (u) => (ST.real(u) ? { uid: u, name: this.player(t, u)?.name || '?', seed: t.hideSeeds ? null : idx.get(u) } : u === ST.BYE ? { bye: true } : null);
    const cfg = t.stages[0];
    // Vòng tròn: chỉ cần các bảng dự kiến (không dựng hàng nghìn trận mỗi lần cập nhật)
    if (cfg.type === 'roundrobin') {
      return { index: 0, type: cfg.type, cfg, preview: true, groups: ST.drawGroups(cfg, seeds, t.groupPlan).map((g, i) => ({ name: ST.groupName(i), players: g.map(side), rounds: [] })) };
    }
    const seedOf = (u) => idx.get(u) || 999;
    const st = ST.buildStage(cfg, 0, seeds, { seedOf, placeBy: t.placeBy, isActive: () => true });
    const M = (id) => { const m = st.matches[id]; return { id: m.id, round: m.round, a: side(m.a), b: side(m.b), wa: 0, wb: 0, done: false, bye: !!m.bye, games: [] }; };
    const v = { index: 0, type: st.type, cfg: st.cfg, preview: true };
    if (st.type === 'single' || st.type === 'double') {
      v.rounds = (st.cfg.split ? st.rounds.slice(1) : st.rounds).map((r) => r.map(M));
      if (st.lrounds) v.lrounds = st.lrounds.map((r) => r.map(M));
    } else v.rounds = [st.rounds[0].map(M)];
    return v;
  }

  /** Ban tổ chức luôn thấy nhánh xem trước (kể cả khi đã ẩn với người xem). */
  previewMine(t, manage) {
    return manage && t.hideBracket ? { preview: this.previewView(t) } : {};
  }

  // ------------------------------------------------------------ Đính kèm trận
  /** Ai được đính kèm: ban tổ chức (quyền kết quả) hoặc hai người chơi của trận (khi bật "Cho phép đính kèm"). */
  attachTarget(conn, id, match) {
    const me = this.requireUser(conn);
    const t = this.findTour(id, me.id);
    const found = this.findMatch(t, match);
    if (!found) throw E('bad_message');
    const { m } = found;
    const manager = this.canManageTour(t, me.id, 'results');
    if (!manager && !(t.attachments && (m.a === me.id || m.b === me.id))) throw E('tour_managers_only');
    return { t, m, me, manager };
  }

  /** Thêm đính kèm: link (http/https), ảnh đã tải lên (tour-img.js) và / hoặc ghi chú ngắn. */
  on_tourAttach(conn, { id, match, url, img, text }) {
    const { t, m, me } = this.attachTarget(conn, id, match);
    const link = String(url || '').trim();
    if (link && (!/^https?:\/\/[^\s<>"']+$/i.test(link) || link.length > 300)) throw E('tour_att_bad_url');
    const pic = String(img || '');
    if (pic && !/^[0-9a-f]{16}$/.test(pic)) throw E('bad_message');
    const note = cleanPublicText(text, 200).trim();
    if (!link && !pic && !note) throw E('tour_att_empty');
    m.att = m.att || [];
    if (m.att.length >= MAX_ATT) throw E('tour_att_limit', { n: MAX_ATT });
    m.att.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), url: link || null, img: pic || null, text: note, by: me.id, name: me.name, at: Date.now() });
    this.tourLog(t, me.id, 'attach', { key: m.id });
    this.saveTour(t);
    this.pushTour(t);
  }

  /** Xoá đính kèm: người đã đính kèm hoặc ban tổ chức. */
  on_tourAttachDel(conn, { id, match, att }) {
    const { t, m, me, manager } = this.attachTarget(conn, id, match);
    const i = (m.att || []).findIndex((x) => x.id === att);
    if (i < 0) return;
    if (!manager && m.att[i].by !== me.id) throw E('tour_managers_only');
    m.att.splice(i, 1);
    this.saveTour(t);
    this.pushTour(t);
  }

  /** Đính kèm của trận gửi cho client. */
  attView(m) {
    return (m.att || []).map(({ id, url, img, text, by, name, at }) => ({ id, url, img, text, by, name, at }));
  }
}

module.exports = { TourOpts, SLUG_RE, LIVE_OPTS, MAX_ATT };
