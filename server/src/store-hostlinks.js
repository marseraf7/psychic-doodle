/*
 * Liên kết tài khoản với Telegram / VK (đăng nhập bằng Mini App – hub/host-login.js). Trộn vào Store.prototype (store.js).
 * Bảng host_links (store-schema.js): provider ('telegram' | 'vk') + ext_id (id người dùng bên nền tảng, chuỗi số) → uid,
 * lúc liên kết (at), mốc thời gian của dữ liệu khởi chạy dùng gần nhất (seen – auth_date / vk_ts, giây). Duy nhất theo
 * (provider, ext_id) và theo (uid, provider): một Telegram chỉ gắn một tài khoản, một tài khoản chỉ gắn một Telegram.
 * Dữ liệu tối thiểu: KHÔNG lưu initData, tên / username Telegram, ảnh, chữ ký.
 * Chống phát lại (hlSeen): dữ liệu khởi chạy có mốc CŨ HƠN lần dùng gần nhất bị từ chối – bản initData / sign bị lộ của
 * một lần mở trước mất tác dụng ngay khi người chơi mở lại Mini App (cùng một lần mở – tải lại trang – vẫn dùng lại được).
 * Xoá tài khoản (store.deleteUser) → hlUserGone xoá mọi liên kết trong cùng giao dịch.
 * Mốc huỷ (bảng host_unlinked, rà soát 27/11/2026): huỷ liên kết / xoá tài khoản xoá luôn mốc seen, nên một bản initData / sign
 * cũ bị lộ (còn trong hạn 24 giờ) lại tạo / gắn được tài khoản mới với Telegram / VK đó. Nay ghi mốc lúc huỷ (giây);
 * hlFloor(provider, extId) trả mốc này – hub/host-login.js từ chối dữ liệu khởi chạy không mới hơn mốc.
 */
'use strict';

class HostLinkStore {
  hlQ() {
    if (!this.hlStmts) {
      const q = (sql) => this.db.prepare(sql);
      this.hlStmts = {
        owner: q('SELECT uid FROM host_links WHERE provider = ? AND ext_id = ?'),
        list: q('SELECT provider, at FROM host_links WHERE uid = ? ORDER BY provider'),
        add: q('INSERT INTO host_links (provider, ext_id, uid, at, seen) VALUES (?, ?, ?, ?, ?)'),
        // Chỉ nhận mốc không cũ hơn mốc đã lưu; một câu lệnh nên không có kẽ hở giữa đọc và ghi
        seen: q('UPDATE host_links SET seen = ? WHERE provider = ? AND ext_id = ? AND (seen IS NULL OR seen <= ?)'),
        unlink: q('DELETE FROM host_links WHERE uid = ? AND provider = ?'),
        drop: q('DELETE FROM host_links WHERE provider = ? AND ext_id = ?'),
        gone: q('DELETE FROM host_links WHERE uid = ?'),
        extOf: q('SELECT provider, ext_id FROM host_links WHERE uid = ?'),
        tomb: q('INSERT INTO host_unlinked (provider, ext_id, at) VALUES (?, ?, ?) ON CONFLICT (provider, ext_id) DO UPDATE SET at = MAX(at, excluded.at)'),
        floor: q('SELECT at FROM host_unlinked WHERE provider = ? AND ext_id = ?'),
      };
    }
    return this.hlStmts;
  }

  /** uid đang gắn với (provider, extId) hoặc null. */
  hlOwner(provider, extId) { return this.hlQ().owner.get(provider, extId)?.uid ?? null; }

  /** Các liên kết của tài khoản: [{ provider, at }]. */
  hlList(uid) { return this.hlQ().list.all(uid).map((r) => ({ provider: r.provider, at: r.at })); }

  /** Gắn (provider, extId) vào uid (seen: mốc của dữ liệu khởi chạy, giây). false nếu id này đã gắn tài khoản khác, hoặc
   *  tài khoản đã gắn một id khác của nền tảng đó. */
  hlLink(provider, extId, uid, at = Date.now(), seen = null) {
    try { this.hlQ().add.run(provider, extId, uid, at, seen); return true; } catch (e) {
      if (/UNIQUE|constraint/i.test(String(e && e.message))) return false;
      throw e;
    }
  }

  /** Dữ liệu khởi chạy mốc ts (giây) của (provider, extId) còn dùng được không – không cũ hơn lần dùng gần nhất; được thì
   *  ghi ts làm mốc mới. false nếu cũ hơn (phát lại bản của lần mở trước) hoặc không có liên kết. */
  hlSeen(provider, extId, ts) {
    if (!Number.isSafeInteger(ts) || ts < 0) return false;
    return Number(this.hlQ().seen.run(ts, provider, extId, ts).changes) > 0;
  }

  /** Ghi mốc huỷ (giây) cho các liên kết của uid (lọc theo provider nếu có) – gọi TRƯỚC khi xoá dòng. */
  hlTomb(uid, provider = null, at = Date.now()) {
    const sec = Math.floor(at / 1000);
    for (const r of this.hlQ().extOf.all(uid)) if (!provider || r.provider === provider) this.hlQ().tomb.run(r.provider, r.ext_id, sec);
  }

  /** Mốc huỷ liên kết gần nhất của (provider, extId) – giây; 0 nếu chưa từng huỷ. */
  hlFloor(provider, extId) { return Number(this.hlQ().floor.get(provider, extId)?.at ?? 0); }

  /** Bỏ liên kết provider của tài khoản (ghi mốc huỷ); true nếu có dòng bị xoá. */
  hlUnlink(uid, provider, at = Date.now()) {
    this.hlTomb(uid, provider, at);
    return Number(this.hlQ().unlink.run(uid, provider).changes) > 0;
  }

  /** Bỏ liên kết theo id ngoài (dòng mồ côi – tài khoản không còn). */
  hlDrop(provider, extId) { this.hlQ().drop.run(provider, extId); }

  /** Tài khoản bị xoá: xoá mọi liên kết (gọi trong giao dịch của deleteUser). */
  hlUserGone(uid) {
    this.hlTomb(uid);
    this.hlQ().gone.run(uid);
  }
}

module.exports = { HostLinkStore };
