/*
 * Ảnh trong mô tả giải / đính kèm trận (nút "Chèn ảnh" của trình soạn mô tả – caro/rich-text.js):
 *  - Trình duyệt tự thu nhỏ (cạnh dài ≤ 1600 px) và nén (WebP / JPEG) còn ≤ MAX_BYTES rồi gửi thành nhiều phần nhỏ
 *    (mỗi tin WebSocket tối đa 16 KB), lần lượt i = 0 … n − 1 cùng một mã tải lên (up).
 *  - Máy chủ ghép lại, kiểm loại ảnh bằng các byte đầu file và kích thước như ảnh đại diện (../avatar.js – không giải mã
 *    ảnh), lưu trong bảng tour_imgs; mỗi tài khoản giữ tối đa MAX_PER_USER ảnh (ảnh cũ nhất bị xoá).
 *  - Phục vụ qua HTTP /api/timg/<mã> (web.js) – ảnh không đổi nên trình duyệt giữ lâu trong bộ nhớ đệm.
 * Trong mô tả, ảnh được ghi là ![chú thích](timg:<mã>) – chỉ ảnh của máy chủ này hiện được (CSP img-src 'self').
 */
'use strict';
const crypto = require('crypto');
const { E } = require('../msg.js');
const { sniff } = require('../avatar.js');

const MAX_BYTES = 120 * 1024;
const MAX_SIDE = 2000;
const MAX_PARTS = 12;
const PART_CHARS = 12000; // ký tự base64 mỗi phần (bội số của 4)
const MAX_PER_USER = 40;
const UPLOADS = 30; // lần tải ảnh mỗi 10 phút / tài khoản

class TourImgDb {
  constructor(db) {
    db.exec(`CREATE TABLE IF NOT EXISTS tour_imgs (id TEXT PRIMARY KEY, uid TEXT NOT NULL, type TEXT NOT NULL, data BLOB NOT NULL, at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS tour_imgs_uid ON tour_imgs (uid, at);`);
    this.qGet = db.prepare('SELECT type, data FROM tour_imgs WHERE id = ?');
    this.qAdd = db.prepare('INSERT INTO tour_imgs (id, uid, type, data, at) VALUES (?, ?, ?, ?, ?)');
    this.qOld = db.prepare('SELECT id FROM tour_imgs WHERE uid = ? ORDER BY at DESC LIMIT -1 OFFSET ?');
    this.qDrop = db.prepare('DELETE FROM tour_imgs WHERE id = ?');
  }
  get(id) {
    const r = this.qGet.get(id);
    return r ? { type: r.type, buf: Buffer.from(r.data) } : null;
  }
  add(id, uid, type, buf) {
    this.qAdd.run(id, uid, type, buf, Date.now());
    for (const r of this.qOld.all(uid, MAX_PER_USER)) this.qDrop.run(r.id);
  }
}

class TourImg {
  tourImgDb() {
    return this.tourImgStore || (this.tourImgStore = new TourImgDb(this.store.db));
  }

  /** Ảnh theo mã (cho web.js): { type, buf } hoặc null. */
  tourImgOf(id) {
    return /^[0-9a-f]{16}$/.test(String(id)) ? this.tourImgDb().get(id) : null;
  }

  /** Một phần của ảnh đang tải lên. Phần cuối: ghép, kiểm, lưu, trả { t: 'tourImgSaved', up, id }. */
  on_tourImg(conn, { up, i, n, data }) {
    const me = this.requireUser(conn);
    up = String(up || '');
    i = Number(i);
    n = Number(n);
    if (!/^[0-9a-f]{8}$/.test(up) || !Number.isInteger(n) || n < 1 || n > MAX_PARTS || !Number.isInteger(i) || i < 0 || i >= n) throw E('bad_message');
    if (typeof data !== 'string' || data.length > PART_CHARS || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) throw E('bad_message');
    if (i === 0) {
      const rules = [['timg:' + me.id, UPLOADS]];
      this.limit(rules);
      this.fail(rules);
      conn.timg = { up, n, parts: [] };
    }
    const cur = conn.timg;
    // Phải gửi đúng thứ tự, cùng một lần tải lên
    if (!cur || cur.up !== up || cur.n !== n || cur.parts.length !== i) { conn.timg = null; throw E('bad_message'); }
    cur.parts.push(data);
    if (i < n - 1) return;
    conn.timg = null;
    const buf = Buffer.from(cur.parts.join(''), 'base64');
    if (buf.length > MAX_BYTES) throw E('tour_img_too_big', { n: Math.round(MAX_BYTES / 1024) });
    const s = sniff(buf);
    if (!s || !s.w || !s.h || s.w > MAX_SIDE || s.h > MAX_SIDE) throw E('tour_img_bad');
    const id = crypto.randomBytes(8).toString('hex');
    this.tourImgDb().add(id, me.id, s.type, buf);
    conn.send({ t: 'tourImgSaved', up, id });
  }
}

module.exports = { TourImg, TourImgDb, MAX_BYTES, MAX_SIDE, MAX_PARTS, PART_CHARS };
