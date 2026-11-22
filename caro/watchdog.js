/*
 * Canh khởi động (một phần của M-F3): file này nạp ĐẦU TIÊN trong index.html. Không phụ thuộc module nào khác của game.
 *  - Trang đã nạp xong (sự kiện load – mọi thẻ <script> đã tải và chạy) mà chưa có cờ __caroBooted (do chat-bubbles.js,
 *    file script cuối cùng, đặt) → có file bị chặn / lỗi: hiện thông báo kèm nút tải lại thay vì trang đứng im.
 *  - Quá 60 giây vẫn chưa nạp xong (mạng rất chậm) → cũng hiện thông báo. Không dùng hẹn giờ ngắn: lần đầu mở từ nơi xa máy
 *    chủ (vd. Nga – Mỹ) có thể mất hơn 20 giây mà vẫn đang tải bình thường.
 * Chữ theo ngôn ngữ đã chọn (caro.lang) hoặc của trình duyệt – đủ 8 ngôn ngữ của langs.js (i18n.js chưa nạp lúc này).
 */
(function () {
  'use strict';
  var SLOW_MS = 60000;
  var TEXT = {
    vi: ['Không tải được trò chơi. Kết nối có thể đang chậm hoặc một phần của trang đã bị chặn (trình chặn quảng cáo…).', 'Tải lại'],
    en: ['The game failed to load. Your connection may be slow, or part of the page was blocked (ad blocker…).', 'Reload'],
    ru: ['Не удалось загрузить игру. Возможно, соединение медленное или часть страницы заблокирована (блокировщик рекламы…).', 'Обновить'],
    zh: ['游戏加载失败。网络可能较慢，或页面的一部分被拦截（广告拦截器等）。', '重新加载'],
    'zh-Hant': ['遊戲載入失敗。網路可能較慢，或頁面的一部分被封鎖（廣告封鎖器等）。', '重新載入'],
    ja: ['ゲームを読み込めませんでした。通信が遅いか、ページの一部がブロックされている可能性があります（広告ブロッカーなど）。', '再読み込み'],
    ko: ['게임을 불러오지 못했습니다. 연결이 느리거나 페이지 일부가 차단되었을 수 있습니다(광고 차단기 등).', '새로고침'],
    cs: ['Hru se nepodařilo načíst. Připojení může být pomalé nebo byla část stránky zablokována (blokátor reklam…).', 'Načíst znovu'],
  };
  function lang() {
    var l = '';
    try { l = localStorage.getItem('caro.lang') || ''; } catch (e) { /* riêng tư */ }
    if (TEXT[l]) return l;
    // Như langs.js fromTag (file này chạy trước mọi file khác): zh-TW / zh-HK / zh-Hant → phồn thể, zh-* khác → giản thể
    var t = String(navigator.language || 'vi').toLowerCase();
    l = /^zh-(?!hans)(hant|tw|hk|mo)/.test(t) ? 'zh-Hant' : t.slice(0, 2);
    return TEXT[l] ? l : 'vi';
  }
  function showFail() {
    if (window.__caroBooted || document.getElementById('boot-fail') || !document.body) return;
    var t = TEXT[lang()];
    var box = document.createElement('div');
    box.id = 'boot-fail';
    box.setAttribute('role', 'alert');
    box.setAttribute('style', 'position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;gap:12px;align-items:center;justify-content:center;background:#f6f3ec;color:#222;padding:24px;text-align:center;font-family:system-ui,sans-serif');
    var msg = document.createElement('p');
    msg.textContent = t[0];
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = t[1];
    btn.setAttribute('style', 'font-size:16px;padding:10px 22px;border-radius:10px;border:1px solid #888;background:#fff;cursor:pointer');
    btn.addEventListener('click', function () { location.reload(); });
    box.appendChild(msg);
    box.appendChild(btn);
    document.body.appendChild(box);
  }
  window.addEventListener('load', function () { setTimeout(showFail, 0); }); // các script đồng bộ đã chạy hết
  setTimeout(showFail, SLOW_MS);
})();
