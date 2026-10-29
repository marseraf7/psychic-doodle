/*
 * Câu lạc bộ – chat và diễn đàn có kiểm duyệt (Đợt 8, học theo Team của Lichess):
 *  - Ai dùng được theo cài đặt của CLB (club-manage.js): chat 'off' | 'officers' | 'members';
 *    diễn đàn 'off' | 'officers' (ban quản lý viết, thành viên đọc) | 'members' | 'everyone' (thành viên viết, ai cũng đọc).
 *  - Chat: người đang mở trang CLB nhận ngay; mở trang thì nhận 50 tin gần nhất.
 *  - Diễn đàn: chủ đề + bài viết; tác giả sửa / xoá bài của mình; quyền Kiểm duyệt (mod) xoá bất kỳ, ghim / khoá / xoá
 *    chủ đề, cấm nói (cả chat và diễn đàn) với một thành viên.
 *  - Giới hạn tần suất mỗi người: chat 1 tin / giây, bài viết 1 / 10 giây, chủ đề mới 1 / phút.
 * Lưu ở bảng riêng (store-club.js).
 */
'use strict';
const { E } = require('../msg.js');
const { cleanPublicText, uidOf } = require('./shared.js');
const { cleanMultiline } = require('./clubs.js');

const PAGE = 20; // chủ đề / bài mỗi trang
const MAX_TOPICS = 500;
const GAP = { chat: 1000, post: 10000, topic: 60000 };

class ClubTalk {
  /** Thành viên hoặc ban quản lý (quản trị viên luôn được). */
  inClub(c, uid) {
    return !!uid && (!!c.members[uid] || this.isAdmin(uid));
  }

  canChat(c, uid, write) {
    if (c.chat === 'off' || !this.inClub(c, uid)) return false;
    if (!write) return true;
    if (c.talkMuted.includes(uid)) return false;
    return c.chat === 'members' || this.isOfficer(c, uid);
  }

  canForum(c, uid, write) {
    if (c.forum === 'off') return false;
    if (!write) return c.forum === 'everyone' ? this.canSeeClub(c, uid) : this.inClub(c, uid);
    if (!this.inClub(c, uid) || c.talkMuted.includes(uid)) return false;
    return c.forum !== 'officers' || this.isOfficer(c, uid);
  }

  /** Chống gửi dồn: mỗi người, mỗi loại một khoảng cách tối thiểu. */
  talkGap(uid, kind) {
    this.talkAt = this.talkAt || new Map();
    const key = kind + ':' + uid, now = Date.now(), last = this.talkAt.get(key) || 0;
    if (now - last < GAP[kind] * (this.T.THROTTLE_SCALE ?? 1)) throw E('too_fast');
    this.talkAt.set(key, now);
    if (this.talkAt.size > 5000) this.talkAt.clear();
  }

  /** Người đang mở trang CLB đọc được chat: mỗi người một lần kiểm quyền. */
  sendChatWatchers(c, msg) {
    for (const set of this.byPid.values()) {
      for (const conn of set) {
        if (conn.watchClub === c.id && this.canChat(c, uidOf(conn.pid), false)) conn.send(msg);
      }
    }
  }

  /** Mở trang CLB (clubs.js gọi): gửi 50 tin chat gần nhất nếu được đọc. */
  clubTalkOpen(conn, c, uid) {
    conn.watchTopic = null;
    if (this.canChat(c, uid, false)) conn.send({ t: 'clubChatLog', id: c.id, msgs: this.store.clubChatList(c.id, 50) });
  }

  // ------------------------------------------------------------ Chat
  on_clubChat(conn, { id, text }) {
    const me = this.requireUser(conn);
    const c = this.findClub(id, me.id);
    if (!this.canChat(c, me.id, true)) throw E('club_talk_denied');
    text = cleanPublicText(text, 300);
    if (!text) return;
    this.talkGap(me.id, 'chat');
    const msg = this.store.clubChatAdd(c.id, me.id, me.name, text);
    this.sendChatWatchers(c, { t: 'clubChat', id: c.id, msg });
  }

  /** Xoá tin chat: người viết hoặc quyền Kiểm duyệt. */
  on_clubChatDel(conn, { id, msg }) {
    const me = this.requireUser(conn);
    const c = this.findClub(id, me.id);
    const m = this.store.clubChatGet(c.id, Number(msg));
    if (!m) return;
    if (m.uid !== me.id && !this.clubCan(c, me.id, 'mod')) throw E('club_officers_only');
    this.store.clubChatDel(c.id, m.id);
    this.sendChatWatchers(c, { t: 'clubChatDel', id: c.id, msg: m.id });
  }

  /** Cấm nói (chat + diễn đàn) với một thành viên (quyền Kiểm duyệt). Không áp cho chủ CLB / người có quyền mod. */
  on_clubTalkMute(conn, { id, uid, mute }) {
    const me = this.requireUser(conn);
    const c = this.findClub(id, me.id);
    this.requireClubPerm(c, me.id, 'mod');
    if (!c.members[uid] || uid === me.id || this.clubCan(c, uid, 'mod')) throw E('club_cannot_kick');
    c.talkMuted = c.talkMuted.filter((x) => x !== uid);
    if (mute) c.talkMuted.push(uid);
    this.saveClub(c);
    this.pushClub(c);
  }

  // ------------------------------------------------------------ Diễn đàn
  forumOf(conn, id, write) {
    const me = write ? this.requireUser(conn) : null;
    const uid = me ? me.id : uidOf(conn.pid);
    const c = this.findClub(id, uid);
    if (!this.canForum(c, uid, write)) throw E(write ? 'club_talk_denied' : 'club_not_found');
    return { c, uid, me };
  }

  on_clubTopics(conn, { id, page }) {
    const { c } = this.forumOf(conn, id, false);
    page = Math.max(0, Math.floor(Number(page) || 0));
    conn.send({ t: 'clubTopics', id: c.id, page, total: this.store.clubTopicCount(c.id), topics: this.store.clubTopics(c.id, PAGE, page * PAGE) });
  }

  on_clubTopicNew(conn, { id, title, text }) {
    const { c, me } = this.forumOf(conn, id, true);
    title = cleanPublicText(title, 100);
    text = cleanMultiline(text, 4000);
    if (title.length < 3 || !text) throw E('club_topic_short');
    if (this.store.clubTopicCount(c.id) >= MAX_TOPICS) throw E('club_topic_limit', { n: MAX_TOPICS });
    this.talkGap(me.id, 'topic');
    const topic = this.store.clubTopicAdd(c.id, me.id, me.name, title, text);
    conn.send({ t: 'clubTopicCreated', id: c.id, topic });
    this.topicDirty(c, topic);
  }

  /** Một chủ đề, trang page (page < 0: trang cuối). Người xem nhận tin khi chủ đề có bài mới. */
  on_clubTopic(conn, { id, topic, page }) {
    const { c, uid } = this.forumOf(conn, id, false);
    const t = this.store.clubTopic(c.id, Number(topic));
    if (!t) throw E('club_topic_gone');
    const pages = Math.max(1, Math.ceil(t.posts / PAGE));
    page = Number(page) < 0 ? pages - 1 : Math.min(pages - 1, Math.max(0, Math.floor(Number(page) || 0)));
    conn.watchTopic = t.id;
    conn.send({
      t: 'clubTopic', id: c.id, topic: t, page, pages, posts: this.store.clubPosts(t.id, PAGE, page * PAGE),
      canPost: this.canForum(c, uid, true) && (!t.locked || this.clubCan(c, uid, 'mod')), canMod: this.clubCan(c, uid, 'mod'),
    });
  }

  /** Diễn đàn đổi (chủ đề mới, bài mới / sửa / xoá): người đang mở trang CLB / chủ đề tải lại phần đang xem. */
  topicDirty(c, topic, gone) {
    for (const set of this.byPid.values()) {
      for (const conn of set) if (conn.watchClub === c.id) conn.send({ t: 'clubTopicDirty', id: c.id, topic, gone: !!gone });
    }
  }

  on_clubPost(conn, { id, topic, text }) {
    const { c, me } = this.forumOf(conn, id, true);
    const t = this.store.clubTopic(c.id, Number(topic));
    if (!t) throw E('club_topic_gone');
    if (t.locked && !this.clubCan(c, me.id, 'mod')) throw E('club_topic_locked');
    text = cleanMultiline(text, 4000);
    if (!text) return;
    this.talkGap(me.id, 'post');
    this.store.clubPostAdd(t.id, c.id, me.id, me.name, text);
    this.topicDirty(c, t.id);
  }

  /** Sửa bài: chỉ người viết. */
  on_clubPostEdit(conn, { id, post, text }) {
    const { c, me } = this.forumOf(conn, id, true);
    const p = this.store.clubPost(c.id, Number(post));
    if (!p || p.uid !== me.id) throw E('club_officers_only');
    text = cleanMultiline(text, 4000);
    if (!text) return;
    this.store.clubPostEdit(p.id, text);
    this.topicDirty(c, p.topic);
  }

  /** Xoá bài: người viết hoặc quyền Kiểm duyệt; hết bài thì chủ đề cũng mất. */
  on_clubPostDel(conn, { id, post }) {
    const me = this.requireUser(conn);
    const c = this.findClub(id, me.id);
    const p = this.store.clubPost(c.id, Number(post));
    if (!p) return;
    if (p.uid !== me.id && !this.clubCan(c, me.id, 'mod')) throw E('club_officers_only');
    const gone = this.store.clubPostDel(p.id);
    this.topicDirty(c, p.topic, gone);
  }

  /** Ghim / khoá / xoá chủ đề (quyền Kiểm duyệt). */
  on_clubTopicMod(conn, { id, topic, pinned, locked, del }) {
    const me = this.requireUser(conn);
    const c = this.findClub(id, me.id);
    this.requireClubPerm(c, me.id, 'mod');
    const t = this.store.clubTopic(c.id, Number(topic));
    if (!t) throw E('club_topic_gone');
    if (del) this.store.clubTopicDel(t.id);
    else this.store.clubTopicSet(t.id, { pinned: typeof pinned === 'boolean' ? pinned : null, locked: typeof locked === 'boolean' ? locked : null });
    this.topicDirty(c, t.id, !!del);
    conn.send({ t: 'clubTopicModDone', id: c.id, topic: t.id, del: !!del });
  }
}

module.exports = { ClubTalk, PAGE };
