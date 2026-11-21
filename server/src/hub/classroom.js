/*
 * Lớp học / Nghiên cứu (C2 – ý tưởng "Study" của Lichess, tự viết): bài nghiên cứu gồm nhiều chương; mỗi chương là thế cờ ban
 * đầu + cây nước đi có biến, lời bình (văn bản có định dạng – cleanRich), dấu ô / mũi tên (caro/class-tree.js làm sạch).
 * Lưu CSDL (store-class.js). Ai có tài khoản cũng tạo được; chủ / quản lý CLB có thêm "Lớp của CLB" (chỉ thành viên CLB xem).
 * Quyền xem: public (ai cũng thấy, có trong danh sách) · unlisted (ai có link) · club (thành viên CLB) · private (chỉ chủ bài).
 * Chỉ chủ bài sửa. Theo dõi trực tiếp: người mở bài nhận clsSync khi chủ bài đi tới nước / chương khác (bàn của học viên đi
 * theo nếu bật "Theo giáo viên"), và bản mới của bài khi chủ bài lưu chương.
 * Tin nhắn: clsList · clsCreate { title, vis, club } · clsOpen { id } · clsLeave { id } · clsMeta { id, title, desc, vis } ·
 *   clsChapter { id, idx, chapter } (lớn hơn 12 000 ký tự: clsChapterPart { id, idx, k, n, d }) · clsChapterDel { id, idx } · clsDelete { id } · clsSync { id, chapter, path }
 */
'use strict';
const crypto = require('crypto');
const Tree = require('../../../caro/class-tree.js');
const { E } = require('../msg.js');
const { uidOf, cleanRich, cleanPublicName } = require('./shared.js');

const VIS = ['public', 'unlisted', 'club', 'private'];
const MAX_STUDIES = 100; // mỗi người
const MAX_CHAPTERS = 64;
const MAX_BYTES = 512 * 1024; // cả bài sau khi làm sạch
const MAX_DESC = 4000;
const PART = 12000; // ký tự mỗi phần khi chương lớn hơn một tin WebSocket
const MAX_PARTS = 64; // 64 × 12 000 ≈ 768 KB (sau đó vẫn kiểm MAX_BYTES)

class Classroom {
  clsFollowers(id) {
    if (!this.clsFollow) this.clsFollow = new Map();
    let s = this.clsFollow.get(id);
    if (!s) { s = new Set(); this.clsFollow.set(id, s); }
    return s;
  }

  /** Người (uid, null = khách) xem được bài s không. */
  clsCanView(s, uid) {
    if (uid && s.owner === uid) return true;
    if (s.vis === 'public' || s.vis === 'unlisted') return true;
    if (s.vis === 'club') { const c = s.club && this.clubs.get(s.club); return !!(uid && c && (c.members[uid] || c.owner === uid)); }
    return false;
  }
  clsMine(conn, id) {
    const me = this.requireUser(conn);
    const s = this.store.clsGet(id);
    if (!s || s.owner !== me.id) throw E('cls_not_found');
    return { me, s };
  }
  /** CLB mà uid là chủ hoặc quản lý (được tạo "Lớp của CLB"). */
  clsMyClubs(uid) {
    const out = [];
    for (const c of this.clubs.values()) if (c.status === 'approved' && (c.owner === uid || c.members[uid] === 'officer')) out.push({ id: c.id, name: c.name });
    return out;
  }
  clsSave(s) {
    s.updated = Date.now();
    if (Buffer.byteLength(JSON.stringify(s)) > MAX_BYTES) throw E('cls_too_big');
    this.store.clsPut(s);
    this.clsPush(s);
  }
  /** Gửi bản mới cho người đang mở bài (bỏ người không còn kết nối / không còn quyền xem). */
  clsPush(s, msg = { t: 'clsStudy', study: s }) {
    const set = this.clsFollowers(s.id);
    for (const pid of [...set]) {
      if (!this.isOnline(pid) || !this.clsCanView(s, uidOf(pid))) { set.delete(pid); continue; }
      this.send(pid, msg);
    }
  }

  on_clsList(conn) {
    this.throttle(conn, 'clsList', 300);
    const uid = uidOf(conn.pid);
    const u = uid && this.store.users.get(uid);
    const clubs = u ? [...this.clubs.values()].filter((c) => c.members[uid] || c.owner === uid).map((c) => c.id) : [];
    conn.send({ t: 'clsList', ...this.store.clsSummaries(u ? uid : null, clubs), myClubs: u ? this.clsMyClubs(uid) : [] });
  }

  on_clsCreate(conn, { title, vis, club } = {}) {
    const me = this.requireUser(conn);
    this.throttle(conn, 'clsCreate', 3000);
    if (this.store.clsCount(me.id) >= MAX_STUDIES) throw E('cls_too_many', { n: MAX_STUDIES });
    const name = cleanPublicName(title, 80);
    if (name.length < 3) throw E('cls_title_short');
    let c = null;
    if (club) {
      c = this.clubs.get(club);
      if (!c || !this.clsMyClubs(me.id).some((x) => x.id === c.id)) throw E('club_officers_only');
    }
    const v = c ? 'club' : VIS.includes(vis) && vis !== 'club' ? vis : 'unlisted';
    const now = Date.now();
    const s = { id: crypto.randomBytes(6).toString('hex'), owner: me.id, ownerName: me.name, title: name, desc: '', vis: v, club: c ? c.id : null,
      clubName: c ? c.name : null, created: now, updated: now, chapters: [Tree.newChapter('1', 'vn')], live: { chapter: 0, path: [] } };
    this.store.clsPut(s);
    conn.send({ t: 'clsCreated', id: s.id });
  }

  on_clsOpen(conn, { id } = {}) {
    this.throttle(conn, 'clsOpen', 200);
    const s = this.store.clsGet(id);
    if (!s || !this.clsCanView(s, uidOf(conn.pid))) throw E('cls_not_found');
    this.clsFollowers(s.id).add(conn.pid);
    conn.send({ t: 'clsStudy', study: s, live: (this.clsLive && this.clsLive.get(s.id)) || null });
  }

  on_clsLeave(conn, { id } = {}) {
    if (this.clsFollow && this.clsFollow.has(id)) this.clsFollow.get(id).delete(conn.pid);
  }

  on_clsMeta(conn, { id, title, desc, vis } = {}) {
    const { s } = this.clsMine(conn, id);
    this.throttle(conn, 'clsMeta', 500);
    if (title != null) { const t = cleanPublicName(title, 80); if (t.length >= 3) s.title = t; }
    if (desc != null) s.desc = cleanRich(desc, MAX_DESC);
    if (vis != null && VIS.includes(vis) && (vis !== 'club' || s.club)) s.vis = vis;
    this.clsSave(s);
  }

  on_clsChapter(conn, { id, idx, chapter } = {}) {
    const { s } = this.clsMine(conn, id);
    this.throttle(conn, 'clsChapter', 150);
    if (!Number.isInteger(idx) || idx < 0 || idx > s.chapters.length || idx >= MAX_CHAPTERS) throw E('bad_message');
    const ch = Tree.clean(chapter, cleanRich);
    if (!ch.name) ch.name = String(idx + 1);
    s.chapters[idx] = ch;
    this.clsSave(s);
  }

  /**
   * Chương lớn hơn một tin WebSocket (16 KB – server.js maxPayload): máy khách chia JSON thành nhiều phần ≤ PART ký tự
   * (k = số thứ tự, n = tổng số phần); đủ phần thì ghép lại và lưu như clsChapter. Mỗi kết nối giữ một chương đang ghép.
   */
  on_clsChapterPart(conn, { id, idx, k, n, d } = {}) {
    this.clsMine(conn, id);
    if (!Number.isInteger(n) || n < 1 || n > MAX_PARTS || !Number.isInteger(k) || k < 0 || k >= n || typeof d !== 'string' || d.length > PART) throw E('bad_message');
    const key = id + ':' + idx;
    if (!conn.clsBuf || conn.clsBuf.key !== key || conn.clsBuf.n !== n) conn.clsBuf = { key, n, parts: [] };
    conn.clsBuf.parts[k] = d;
    if (conn.clsBuf.parts.filter((x) => typeof x === 'string').length < n) return;
    const text = conn.clsBuf.parts.join('');
    conn.clsBuf = null;
    let chapter;
    try { chapter = JSON.parse(text); } catch (e) { throw E('bad_message'); }
    conn.throttle = { ...(conn.throttle || {}), clsChapter: 0 }; // phần cuối không bị chặn "quá nhanh"
    this.on_clsChapter(conn, { id, idx, chapter });
  }

  on_clsChapterDel(conn, { id, idx } = {}) {
    const { s } = this.clsMine(conn, id);
    if (!Number.isInteger(idx) || !s.chapters[idx] || s.chapters.length <= 1) throw E('bad_message');
    s.chapters.splice(idx, 1);
    if (s.live && s.live.chapter >= s.chapters.length) s.live = { chapter: 0, path: [] };
    this.clsSave(s);
  }

  on_clsDelete(conn, { id } = {}) {
    const { s } = this.clsMine(conn, id);
    this.store.clsDel(s.id);
    this.clsPush(s, { t: 'clsGone', id: s.id });
    if (this.clsFollow) this.clsFollow.delete(s.id);
  }

  /** Giáo viên (chủ bài) đi tới chương / nước khác: học viên đang theo dõi đi theo. Không ghi CSDL mỗi lần (chỉ giữ trong bộ nhớ + lần lưu sau). */
  on_clsSync(conn, { id, chapter, path } = {}) {
    const { s } = this.clsMine(conn, id);
    this.throttle(conn, 'clsSync', 80);
    if (!Number.isInteger(chapter) || !s.chapters[chapter] || !Array.isArray(path) || path.length > Tree.LIMITS.depth || !path.every((i) => Number.isInteger(i) && i >= 0)) throw E('bad_message');
    // Không đòi nút đã có trong bản lưu: giáo viên vừa đi nước mới thì tin này tới trước lần lưu chương (gom 400 ms) –
    // học viên tự kiểm đường đi trên bản của mình và áp khi bản mới tới
    if (!this.clsLive) this.clsLive = new Map();
    this.clsLive.set(s.id, { chapter, path }); // người mở bài sau vẫn biết giáo viên đang ở đâu
    const msg = { t: 'clsSync', id: s.id, chapter, path };
    for (const pid of [...this.clsFollowers(s.id)]) if (pid !== conn.pid) { if (this.isOnline(pid)) this.send(pid, msg); else this.clsFollowers(s.id).delete(pid); }
  }
}

module.exports = { Classroom, VIS, MAX_CHAPTERS, PART };
