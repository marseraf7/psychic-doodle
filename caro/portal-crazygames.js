/*
 * SDK CrazyGames v3, mức Basic – chỉ có trong bản cổng 'crazygames' (server/scripts/build-portal.js chèn vào <head> ngay sau
 * thẻ SDK https://sdk.crazygames.com/crazygames-sdk-v3.js; bản web chính và bản itch.io không nạp file này).
 * Theo docs.crazygames.com (SDK → Intro, Game module; đọc 21–22/11/2026):
 *  – await SDK.init() trước mọi lệnh; SDK.environment === 'disabled' (ngoài tên miền CrazyGames) thì không gọi gì nữa;
 *  – game.loadingStart() khi bắt đầu tải, game.loadingStop() khi tải xong (sự kiện load của trang);
 *  – game.gameplayStart() khi người chơi vào ván (đấu máy, online, câu đố…), game.gameplayStop() ở mỗi lần nghỉ (hết ván,
 *    về Trang chủ / trang khác, xem lại ván) – không gọi khi chỉ đổi tab / rời vùng game;
 *  – game.settings.muteAudio (+ addSettingsChangeListener): true thì tắt tiếng game, ưu tiên hơn cài đặt trong game
 *    (sound.js · CaroSound.hostMute, không lưu vào cài đặt của người chơi).
 * SDK không tải được (chặn quảng cáo, mất mạng…) hay init lỗi: game vẫn chạy bình thường, chỉ không gửi sự kiện.
 * Hàm thuần isPlaying / makeTracker kiểm thử trên Node: caro/tests/portal-crazygames.test.js.
 */
(function (root) {
  'use strict';

  /**
   * Đang trong ván không, theo ảnh chụp giao diện s:
   * { shell (đang ở một trang), replay, ext (câu đố / bài học), winner (ván trên máy), online: { watch, winner, players } | null }
   */
  function isPlaying(s) {
    if (!s || s.shell || s.replay) return false;
    if (s.online) return !s.online.watch && !s.online.winner && s.online.players >= 2;
    if (s.ext) return true;
    return !s.winner;
  }

  /** Gọi gameplayStart / gameplayStop khi trạng thái đổi – không gọi trùng, lỗi của SDK không lan ra game. */
  function makeTracker(game) {
    let on = false;
    return (playing) => {
      playing = !!playing;
      if (playing === on) return false;
      on = playing;
      try { if (playing) game.gameplayStart(); else game.gameplayStop(); } catch (e) { /* SDK lỗi: bỏ qua */ }
      return true;
    };
  }

  const api = { isPlaying, makeTracker };
  if (typeof module === 'object' && module.exports) { module.exports = api; return; }
  root.CaroCrazy = api;
  // ready: Promise → SDK đã init (môi trường crazygames / local) hoặc null (không tải được / ngoài CrazyGames). Bản Full
  // (portal-crazygames-full.js) chờ lời hứa này trước khi gọi quảng cáo / tài khoản.
  let readyFn = () => {};
  api.ready = new Promise((r) => { readyFn = r; });
  if (root.CARO_PORTAL !== 'crazygames') { readyFn(null); return; }

  /** Ảnh chụp trạng thái từ CaroApp / CaroShell (null khi app chưa khởi động xong). */
  function snapshot() {
    const App = root.CaroApp, Sh = root.CaroShell;
    if (!App || !Sh) return null;
    const on = App.online, room = on && on.room;
    return {
      shell: !!Sh.visible, replay: !!App.replay, ext: !!App.ext, winner: App.local.winner,
      online: on ? { watch: !!on.watch, winner: room ? room.winner : 0, players: room && room.players ? room.players.length : 0 } : null,
    };
  }

  const loaded = new Promise((r) => { if (document.readyState === 'complete') r(); else root.addEventListener('load', r, { once: true }); });

  async function start() {
    const SDK = root.CrazyGames && root.CrazyGames.SDK;
    if (!SDK) return readyFn(null); // thẻ SDK không tải được
    try { await SDK.init(); } catch (e) { return readyFn(null); }
    if (SDK.environment === 'disabled' || !SDK.game) return readyFn(null);
    const game = SDK.game;
    const call = (fn) => { try { game[fn](); } catch (e) { /* bỏ qua */ } };
    root.CaroCrazy.sdk = SDK;
    readyFn(SDK);

    // Tắt tiếng theo cổng
    const mute = (st) => { if (root.CaroSound && st) root.CaroSound.hostMute = !!st.muteAudio; };
    const settings = () => { try { return game.settings; } catch (e) { return null; } };
    try { game.addSettingsChangeListener((st) => mute(st)); } catch (e) { /* bản SDK không có */ }

    call('loadingStart');
    await loaded;
    // Khối mã chạy hết trước sự kiện load (defer): app đã sẵn sàng
    mute(settings());
    call('loadingStop');

    const track = makeTracker(game);
    const update = () => { const s = snapshot(); if (s) track(isPlaying(s)); };
    for (const ev of ['caro:board', 'caro:page', 'caro:gameover', 'caro:newgame', 'caro:replayclose', 'caro:extenter', 'caro:solved', 'caro:online']) {
      root.addEventListener(ev, () => setTimeout(update, 0));
    }
    // Ván online đổi trạng thái (đối thủ vào, hết ván) qua tin của máy chủ: soát lại mỗi giây – rẻ, không cần móc vào online.js
    setInterval(update, 1000);
    update();
  }
  start();
})(this);
