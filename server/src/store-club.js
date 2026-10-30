/*
 * Chat và diễn đàn câu lạc bộ (Đợt 8) – bảng club_chat, club_topics, club_posts. Trộn vào Store.prototype (store.js).
 * Ghi thẳng (không gom như bản ghi CLB): mỗi tin / bài một dòng nhỏ, CLB không phải ghi lại cả bản ghi lớn.
 *   Chat: giữ CHAT_KEEP tin gần nhất mỗi CLB.
 *   Diễn đàn: chủ đề (ghim, khoá, số bài, lúc có bài mới nhất) + bài viết (sửa được, xoá được).
 */
'use strict';

const CHAT_KEEP = 300;
const row = (r) => (r ? { ...r } : null); // node:sqlite trả về đối tượng không có prototype

class ClubStore {
  // ------------------------------------------------------------ Chat
  clubChatAdd(club, uid, name, text) {
    const at = Date.now();
    const id = Number(this.db.prepare('INSERT INTO club_chat (club, uid, name, at, text) VALUES (?, ?, ?, ?, ?)').run(club, uid, name, at, text).lastInsertRowid);
    // Chỉ giữ các tin gần nhất (cắt thỉnh thoảng cho nhẹ)
    if (id % 20 === 0) {
      this.db.prepare('DELETE FROM club_chat WHERE club = ? AND id <= (SELECT id FROM club_chat WHERE club = ? ORDER BY id DESC LIMIT 1 OFFSET ?)').run(club, club, CHAT_KEEP);
    }
    return { id, uid, name, at, text };
  }

  /** limit tin gần nhất, cũ → mới. */
  clubChatList(club, limit = 50) {
    return this.db.prepare('SELECT id, uid, name, at, text FROM club_chat WHERE club = ? ORDER BY id DESC LIMIT ?').all(club, limit).map(row).reverse();
  }

  clubChatGet(club, id) {
    return row(this.db.prepare('SELECT id, uid, name, at, text FROM club_chat WHERE club = ? AND id = ?').get(club, id));
  }

  clubChatDel(club, id) {
    return this.db.prepare('DELETE FROM club_chat WHERE club = ? AND id = ?').run(club, id).changes > 0;
  }

  // ------------------------------------------------------------ Diễn đàn
  clubTopicCount(club) {
    return this.db.prepare('SELECT COUNT(*) AS n FROM club_topics WHERE club = ?').get(club).n;
  }

  /** Chủ đề mới + bài đầu tiên. */
  clubTopicAdd(club, uid, name, title, text) {
    const at = Date.now();
    this.db.exec('BEGIN');
    try {
      const id = Number(this.db.prepare('INSERT INTO club_topics (club, title, uid, name, at, last, posts) VALUES (?, ?, ?, ?, ?, ?, 1)').run(club, title, uid, name, at, at).lastInsertRowid);
      this.db.prepare('INSERT INTO club_posts (topic, club, uid, name, at, text) VALUES (?, ?, ?, ?, ?, ?)').run(id, club, uid, name, at, text);
      this.db.exec('COMMIT');
      return id;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  /** Danh sách chủ đề: ghim lên đầu, rồi chủ đề có bài mới nhất. */
  clubTopics(club, limit, offset) {
    return this.db.prepare('SELECT id, title, uid, name, at, last, posts, pinned, locked FROM club_topics WHERE club = ? ORDER BY pinned DESC, last DESC LIMIT ? OFFSET ?')
      .all(club, limit, offset).map(row);
  }

  clubTopic(club, id) {
    return row(this.db.prepare('SELECT id, title, uid, name, at, last, posts, pinned, locked FROM club_topics WHERE club = ? AND id = ?').get(club, id));
  }

  clubTopicSet(id, { pinned, locked, title }) {
    if (pinned != null) this.db.prepare('UPDATE club_topics SET pinned = ? WHERE id = ?').run(pinned ? 1 : 0, id);
    if (locked != null) this.db.prepare('UPDATE club_topics SET locked = ? WHERE id = ?').run(locked ? 1 : 0, id);
    if (title != null) this.db.prepare('UPDATE club_topics SET title = ? WHERE id = ?').run(title, id);
  }

  clubTopicDel(id) {
    this.db.prepare('DELETE FROM club_posts WHERE topic = ?').run(id);
    this.db.prepare('DELETE FROM club_topics WHERE id = ?').run(id);
  }

  clubPostAdd(topic, club, uid, name, text) {
    const at = Date.now();
    const id = Number(this.db.prepare('INSERT INTO club_posts (topic, club, uid, name, at, text) VALUES (?, ?, ?, ?, ?, ?)').run(topic, club, uid, name, at, text).lastInsertRowid);
    this.db.prepare('UPDATE club_topics SET last = ?, posts = posts + 1 WHERE id = ?').run(at, topic);
    return id;
  }

  clubPosts(topic, limit, offset) {
    return this.db.prepare('SELECT id, uid, name, at, text, edited FROM club_posts WHERE topic = ? ORDER BY id LIMIT ? OFFSET ?').all(topic, limit, offset).map(row);
  }

  clubPost(club, id) {
    return row(this.db.prepare('SELECT id, topic, uid, name, at, text, edited FROM club_posts WHERE club = ? AND id = ?').get(club, id));
  }

  clubPostEdit(id, text) {
    this.db.prepare('UPDATE club_posts SET text = ?, edited = ? WHERE id = ?').run(text, Date.now(), id);
  }

  /** Xoá một bài; hết bài thì xoá luôn chủ đề. Trả về true nếu chủ đề cũng bị xoá. */
  clubPostDel(id) {
    const p = this.db.prepare('SELECT topic FROM club_posts WHERE id = ?').get(id);
    if (!p) return false;
    this.db.prepare('DELETE FROM club_posts WHERE id = ?').run(id);
    return this.fixTopic(p.topic);
  }

  /** Đếm lại số bài / lúc có bài mới nhất của chủ đề; hết bài thì xoá chủ đề (true). */
  fixTopic(topic) {
    const s = this.db.prepare('SELECT COUNT(*) AS n, MAX(at) AS last FROM club_posts WHERE topic = ?').get(topic);
    if (!s.n) { this.db.prepare('DELETE FROM club_topics WHERE id = ?').run(topic); return true; }
    this.db.prepare('UPDATE club_topics SET posts = ?, last = ? WHERE id = ?').run(s.n, s.last, topic);
    return false;
  }

  /** CLB giải tán: xoá chat và diễn đàn. */
  clubTalkDrop(club) {
    for (const t of ['club_chat', 'club_posts', 'club_topics']) this.db.prepare(`DELETE FROM ${t} WHERE club = ?`).run(club);
  }

  /** Tài khoản bị xoá: xoá tin chat và bài viết của người đó; chủ đề họ mở còn lại (bỏ tên) nếu còn bài của người khác. */
  clubTalkUserGone(uid) {
    this.db.prepare('DELETE FROM club_chat WHERE uid = ?').run(uid);
    const topics = this.db.prepare('SELECT DISTINCT topic FROM club_posts WHERE uid = ?').all(uid).map((r) => r.topic);
    this.db.prepare('DELETE FROM club_posts WHERE uid = ?').run(uid);
    this.db.prepare("UPDATE club_topics SET uid = NULL, name = '?' WHERE uid = ?").run(uid);
    for (const t of topics) this.fixTopic(t);
  }
}

module.exports = { ClubStore, CHAT_KEEP };
