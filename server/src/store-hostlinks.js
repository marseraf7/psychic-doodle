/*
 * Liên kết tài khoản với Telegram / VK (đăng nhập bằng Mini App – hub/host-login.js). Trộn vào Store.prototype (store.js).
 * Bảng host_links (store-schema.js): provider ('telegram' | 'vk') + ext_id (id người dùng bên nền tảng, chuỗi số) → uid,
 * lúc liên kết (at). Duy nhất theo (provider, ext_id) và theo (uid, provider): một Telegram chỉ gắn một tài khoản, một tài
 * khoản chỉ gắn một Telegram. Dữ liệu tối thiểu: KHÔNG lưu initData, tên / username Telegram, ảnh, chữ ký.
 * Xoá tài khoản (store.deleteUser) → hlUserGone xoá mọi liên kết trong cùng giao dịch.
 */
'use strict';

class HostLinkStore {
  hlQ() {
    if (!this.hlStmts) {
      const q = (sql) => this.db.prepare(sql);
      this.hlStmts = {
        owner: q('SELECT uid FROM host_links WHERE provider = ? AND ext_id = ?'),
        list: q('SELECT provider, at FROM host_links WHERE uid = ? ORDER BY provider'),
        add: q('INSERT INTO host_links (provider, ext_id, uid, at) VALUES (?, ?, ?, ?)'),
        unlink: q('DELETE FROM host_links WHERE uid = ? AND provider = ?'),
        drop: q('DELETE FROM host_links WHERE provider = ? AND ext_id = ?'),
        gone: q('DELETE FROM host_links WHERE uid = ?'),
      };
    }
    return this.hlStmts;
  }

  /** uid đang gắn với (provider, extId) hoặc null. */
  hlOwner(provider, extId) { return this.hlQ().owner.get(provider, extId)?.uid ?? null; }

  /** Các liên kết của tài khoản: [{ provider, at }]. */
  hlList(uid) { return this.hlQ().list.all(uid).map((r) => ({ provider: r.provider, at: r.at })); }

  /** Gắn (provider, extId) vào uid. false nếu id này đã gắn tài khoản khác, hoặc tài khoản đã gắn một id khác của nền tảng đó. */
  hlLink(provider, extId, uid, at = Date.now()) {
    try { this.hlQ().add.run(provider, extId, uid, at); return true; } catch (e) {
      if (/UNIQUE|constraint/i.test(String(e && e.message))) return false;
      throw e;
    }
  }

  /** Bỏ liên kết provider của tài khoản; true nếu có dòng bị xoá. */
  hlUnlink(uid, provider) { return Number(this.hlQ().unlink.run(uid, provider).changes) > 0; }

  /** Bỏ liên kết theo id ngoài (dòng mồ côi – tài khoản không còn). */
  hlDrop(provider, extId) { this.hlQ().drop.run(provider, extId); }

  /** Tài khoản bị xoá: xoá mọi liên kết (gọi trong giao dịch của deleteUser). */
  hlUserGone(uid) { this.hlQ().gone.run(uid); }
}

module.exports = { HostLinkStore };
