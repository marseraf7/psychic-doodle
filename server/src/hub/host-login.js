/*
 * Đăng nhập bằng Telegram Mini App / VK Mini App (Đợt 3): kiểm dữ liệu khởi chạy có chữ ký (../host-auth.js), liên kết
 * provider + id ngoài → tài khoản (../store-hostlinks.js). Máy khách: caro/host-auth.js.
 *
 * Tin máy khách gửi:
 *   hostLogin { provider: 'telegram' | 'vk', data: initData | chuỗi tham số vk_…&sign=…, mode, name? }
 *     mode 'auto'   – đăng nhập im lặng lúc mở Mini App (khách): đã liên kết → đăng nhập (auth + welcome như đăng nhập
 *                     thường); chưa liên kết → { t: 'hostState', state: 'unlinked' }; lỗi bất kỳ → { state: 'failed' }
 *                     (không bao giờ ném lỗi – không hiện thông báo lỗi cho lần thử ngầm).
 *     mode 'create' – khách bấm "Lưu tiến độ bằng Telegram / VK": đã liên kết → đăng nhập; chưa → tạo tài khoản mới không
 *                     mật khẩu (như tài khoản Google), gắn liên kết, đăng nhập. Tiến độ khách mang sang như khi đăng ký:
 *                     phòng đang ngồi (core.migrate) + tiến độ trên máy (caro/progress-sync.js gộp vào tài khoản mới).
 *     mode 'link'   – đang đăng nhập, đã xác nhận trong app (CaroConfirm) → gắn Telegram / VK này vào tài khoản hiện tại.
 *     name: tên hiển thị gợi ý (VK không có tên trong tham số khởi chạy) – chỉ dùng khi tạo tài khoản, làm sạch như mọi tên.
 *   hostUnlink { provider, confirm } – bỏ liên kết (Cài đặt tài khoản). Tài khoản không còn cách đăng nhập nào khác (mật khẩu,
 *     Google, nền tảng kia) thì phải có confirm: true (máy khách đã cảnh báo rõ).
 *
 * Quyết định bảo mật:
 *   – Tài khoản QUẢN TRỊ VIÊN không đăng nhập được bằng Telegram / VK và không gắn được (kể cả từ trong tài khoản):
 *     initData / tham số VK là "vé" mang theo người, còn hiệu lực tới 24 giờ, đi qua ứng dụng / địa chỉ của bên thứ ba –
 *     quyền cao nhất chỉ vào bằng mật khẩu / Google. Tài khoản đã gắn rồi mới được thêm vào ADMIN_USERNAMES thì vẫn bị chặn
 *     lúc đăng nhập (kiểm isAdmin mỗi lần).
 *   – Từ chối chung chung (host_auth_failed), log một dòng không kèm dữ liệu; đếm lần sai theo IP như đăng nhập Google;
 *     mỗi kết nối tối đa 1 lần / giây; tạo tài khoản dùng chung hạn mức "reg:<IP>" với đăng ký thường.
 *   – Chống phát lại (rẻ, không thêm bước nào cho người chơi): mỗi liên kết nhớ mốc thời gian (auth_date / vk_ts) của dữ liệu
 *     khởi chạy dùng gần nhất; dữ liệu có mốc cũ hơn thì không cấp phiên (store-hostlinks.js · hlSeen). Bản initData / sign
 *     bị lộ (lịch sử, nhật ký truy cập…) hết dùng được ngay khi người chơi mở lại Mini App, thay vì còn hiệu lực đủ 24 giờ.
 *   – Tên đăng nhập tự sinh tg_<8 ký tự ngẫu nhiên> / vk_<…> – không chứa id Telegram / VK (tên đăng nhập là công khai),
 *     không trùng tên đã có và không trùng tên trong cấu hình quản trị (người đầu tiên lấy tên đó sẽ thành quản trị).
 */
'use strict';
const crypto = require('crypto');
const { E, note } = require('../msg.js');
const { isOffensiveName } = require('../moderation.js');
const { PROVIDERS } = require('../host-auth.js');
const { cleanName, uidOf } = require('./shared.js');

const PREFIX = { telegram: 'tg_', vk: 'vk_' };
const ALNUM = 'abcdefghijklmnopqrstuvwxyz0123456789';

class HostLogin {
  /** Nền tảng đang bật đăng nhập (welcome gửi cho máy khách để hiện / ẩn nút). */
  hostProviders() { return this.hostAuth ? [...this.hostAuth.providers] : []; }

  /** Các nền tảng đã gắn với tài khoản (meView – chỉ tên nền tảng, không có id ngoài). */
  hostLinksOf(uid) { return this.store.hlList(uid).map((l) => l.provider); }

  /** Tên đăng nhập tự sinh, không trùng, không trùng tên quản trị trong cấu hình. */
  hostFreeUsername(provider) {
    for (;;) {
      let s = PREFIX[provider];
      for (const b of crypto.randomBytes(8)) s += ALNUM[b % ALNUM.length];
      if (!this.store.byUsername.has(s) && !this.admins.has(s)) return s;
    }
  }

  hostSendMe(pid) {
    for (const c of this.byPid.get(pid) || []) c.send({ t: 'me', me: this.meView(pid) });
  }

  on_hostLogin(conn, msg) {
    const provider = msg.provider;
    const mode = ['auto', 'create', 'link'].includes(msg.mode) ? msg.mode : 'create';
    if (!PROVIDERS.includes(provider) || !this.hostProviders().includes(provider)) {
      if (mode === 'auto') return conn.send({ t: 'hostState', provider: PROVIDERS.includes(provider) ? provider : null, state: 'failed' });
      throw E('host_auth_disabled');
    }
    if (mode !== 'auto') return this.hostLoginRun(conn, provider, msg, mode);
    try {
      this.hostLoginRun(conn, provider, msg, mode);
    } catch (e) {
      if (!e.code) throw e; // lỗi bất ngờ: handle() báo chung chung + đếm crash như mọi lệnh
      conn.send({ t: 'hostState', provider, state: 'failed' });
    }
  }

  hostLoginRun(conn, provider, msg, mode) {
    // 1 lần / giây / kết nối, đếm riêng lần thử im lặng (máy khách chỉ gửi một lần) để bấm nút ngay sau khi mở không bị chặn
    this.throttle(conn, mode === 'auto' ? 'hostLoginAuto' : 'hostLogin', 1000);
    const rules = [['host:' + conn.ip, 30]];
    this.limit(rules);
    const r = this.hostAuth.verify(provider, msg.data, Date.now());
    if (!r.ok) {
      this.fail(rules);
      console.warn(`[host-auth] từ chối dữ liệu khởi chạy ${provider}`); // không ghi dữ liệu, lý do, IP
      throw E('host_auth_failed');
    }
    const extId = r.user.id;
    // Dữ liệu cũ hơn lần dùng gần nhất của cùng Telegram / VK (bản bị lộ của một lần mở trước) = từ chối như sai chữ ký
    const stale = () => {
      this.fail(rules);
      console.warn(`[host-auth] từ chối dữ liệu khởi chạy ${provider} cũ hơn lần dùng gần nhất`);
      return E('host_auth_failed');
    };
    const cur = uidOf(conn.pid) && this.store.users.get(uidOf(conn.pid));
    const ownerId = this.store.hlOwner(provider, extId);
    let owner = ownerId && this.store.users.get(ownerId);
    if (ownerId && !owner) { this.store.hlDrop(provider, extId); owner = null; } // dòng mồ côi (không nên có)

    if (mode === 'link') {
      if (!cur) throw E('need_account');
      if (this.isAdmin(cur.id)) throw E('host_admin_blocked');
      if (owner === cur) { this.hostSendMe(conn.pid); return conn.send(note('host_linked_' + provider)); }
      if (owner) throw E('host_taken');
      if (!this.store.hlLink(provider, extId, cur.id, Date.now(), r.ts)) throw E('host_has_other');
      this.hostSendMe(conn.pid);
      return conn.send(note('host_linked_' + provider));
    }

    if (owner) {
      if (this.isAdmin(owner.id)) {
        console.warn(`[host-auth] chặn đăng nhập tài khoản quản trị bằng ${provider}`);
        throw E('host_admin_blocked');
      }
      if (cur === owner) return conn.send({ t: 'hostState', provider, state: 'linked' });
      if (cur) throw E('host_taken'); // đang đăng nhập tài khoản khác: không tự đổi tài khoản
      if (!this.store.hlSeen(provider, extId, r.ts)) throw stale(); // chỉ cấp phiên cho dữ liệu không cũ hơn lần trước
      return this.loginConn(conn, owner);
    }
    if (mode === 'auto') return conn.send({ t: 'hostState', provider, state: 'unlinked' });
    if (cur) throw E('host_logged_in'); // đang đăng nhập: dùng nút "Gắn" (có hỏi xác nhận) thay vì tạo tài khoản mới

    // Tạo tài khoản mới không mật khẩu
    const reg = [['reg:' + conn.ip, 30]];
    this.limit(reg);
    this.fail(reg);
    const pick = (s) => { const n = cleanName(s); return n && !isOffensiveName(n) ? n : ''; };
    const name = pick(r.user.firstName) || pick(typeof msg.name === 'string' ? msg.name.slice(0, 64) : '') || 'Player';
    const user = this.store.createUser({ username: this.hostFreeUsername(provider), name });
    if (!this.store.hlLink(provider, extId, user.id, Date.now(), r.ts)) { // không xảy ra (mã đồng bộ) – vẫn dọn cho chắc
      this.store.deleteUser(user);
      throw E('host_taken');
    }
    this.loginConn(conn, user);
  }

  on_hostUnlink(conn, { provider, confirm }) {
    const me = this.requireUser(conn);
    if (!PROVIDERS.includes(provider)) throw E('host_not_linked');
    this.throttle(conn, 'hostUnlink', 1000);
    const links = this.store.hlList(me.id);
    if (!links.some((l) => l.provider === provider)) throw E('host_not_linked');
    const other = !!me.pass || !!me.google || links.some((l) => l.provider !== provider);
    if (!other && confirm !== true) throw E('host_unlink_last');
    this.store.hlUnlink(me.id, provider);
    this.hostSendMe(conn.pid);
    conn.send(note('host_unlinked_' + provider));
  }
}

module.exports = { HostLogin };
