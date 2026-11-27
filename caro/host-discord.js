/*
 * Discord Activity – bản đầu (Đợt 3, docs/discord-activity.md). Chỉ chạy khi host-detect.js nhận ra Discord
 * (window.CARO_HOST === 'discord': ?frame_id=…&instance_id=…&platform=… hoặc tên miền *.discordsays.com) và đã chèn
 * vendor/discord-sdk.js (@discord/embedded-app-sdk 2.5.0, MIT – global DiscordSDK). Theo tài liệu Discord (Embedded App SDK):
 *  – new DiscordSDK(clientId) bắt tay với Discord qua postMessage, ready() xong khi đã nối. Client id công khai lấy từ tên
 *    miền <client_id>.discordsays.com (Discord luôn phục vụ Activity ở đó), không có thì từ thẻ meta caro-discord-client-id do
 *    máy chủ chèn (biến DISCORD_CLIENT_ID – server/src/host-embed.js). Không cần client secret: bản đầu không làm OAuth;
 *  – disableConsoleLogOverride: không chuyển console của game sang Discord;
 *  – link ra ngoài: commands.openExternalLink (Discord hỏi người dùng trước khi mở) – CSP của Discord chặn mở thẳng;
 *  – mời bạn: commands.openInviteDialog (không cần quyền OAuth) – nút trong hộp "Thông tin phòng" (#ri-discord).
 * Chế độ khách như bản cổng game: dùng chung window.CaroPortal (online-auth.js · openAuth báo "bản này không có đăng nhập",
 * weekly-cup.js ẩn giải tuần); host.css ẩn nút đăng nhập, link ra ngoài, link mời dạng địa chỉ (địa chỉ discordsays.com không
 * mở được ngoài Discord). Tiếng: theo ngôn ngữ trình duyệt / người chơi tự chọn (locale của Discord cần quyền identify –
 * chưa làm). Mã phòng: phòng do máy chủ cấp mã ngẫu nhiên + mật khẩu (hub/rooms.js) – không suy mã từ instance_id.
 * Hàm thuần (kiểm thử trên Node: caro/tests/host-discord.test.js): window.CaroDiscord = { clientIdOf, on, sdk }
 */
(function () {
  'use strict';
  const ID = /^\d{5,25}$/;
  /** Client id từ tên miền <id>.discordsays.com, không có thì từ thẻ meta; sai dạng → null. */
  function clientIdOf(hostname, meta) {
    const m = /^(\d{5,25})\.discordsays\.com$/i.exec(String(hostname || ''));
    if (m) return m[1];
    const v = String(meta || '').trim();
    return ID.test(v) ? v : null;
  }

  const api = { clientIdOf, on: false, sdk: null };
  if (typeof module === 'object' && module.exports) { module.exports = api; return; }
  window.CaroDiscord = api;
  if (window.CARO_HOST !== 'discord') return;
  api.on = true;

  const H = window.CaroHost;
  const T = (k, a) => window.I18N.t(k, a);
  const $ = (id) => document.getElementById(id);
  if ($('ri-discord-hint')) $('ri-discord-hint').hidden = false;
  const ss = {
    get: (k) => { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) { /* riêng tư */ } },
  };

  // Chế độ khách (bản web chính không có portal.js nên CaroPortal chưa có)
  if (!window.CaroPortal) {
    window.CaroPortal = {
      on: true, mode: null, isExternal: H.isExternal,
      noLogin() { if (window.CaroConfirm) window.CaroConfirm.info(T('portal_no_login')); },
    };
  }

  const meta = document.querySelector('meta[name="caro-discord-client-id"]');
  const id = clientIdOf(location.hostname, meta && meta.content) || clientIdOf('', ss.get('caro.discordClient'));
  const Lib = window.DiscordSDK;
  if (!id || !Lib || typeof Lib.DiscordSDK !== 'function') return; // thiếu client id / SDK không nạp được: vẫn chơi như web
  ss.set('caro.discordClient', id);

  // SDK đọc tham số khởi chạy từ location.search lúc tạo: dùng bản host-detect.js đã nhớ (mã khác có thể đã xoá tham số)
  const launch = ss.get('caro.discordLaunch') || location.search;
  class Sdk extends Lib.DiscordSDK { _getSearch() { return launch; } }
  let sdk;
  try { sdk = new Sdk(id, { disableConsoleLogOverride: true }); } catch (e) { return; }
  api.sdk = sdk;
  const ready = sdk.ready();
  const cmd = (name, args) => ready.then(() => sdk.commands[name](args)).catch(() => {});

  // Link ra ngoài (bấm link http(s) khác nguồn – host.js; window.open) → Discord mở bằng trình duyệt của máy
  const openExternal = (url) => cmd('openExternalLink', { url: String(url) });
  H.setOpenLink(openExternal);
  const open0 = window.open;
  window.open = function (url) {
    if (url && H.isExternal(url)) { openExternal(new URL(String(url), location.href).href); return null; }
    return open0.apply(window, arguments);
  };

  const btn = $('ri-discord');
  if (btn) { btn.hidden = false; btn.addEventListener('click', () => cmd('openInviteDialog')); }
})();
