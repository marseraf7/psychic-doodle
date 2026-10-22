/*
 * Canh khởi động (một phần của M-F3): file này nạp ĐẦU TIÊN trong index.html. Nếu sau
 * 15 giây ứng dụng vẫn chưa khởi động xong (cờ __caroBooted do file script cuối cùng
 * đặt), hiện một thông báo rõ ràng kèm nút tải lại — thay vì trang trắng/bàn cờ trống
 * không lời giải thích khi một file bị chặn (trình chặn quảng cáo, mạng rất chậm...).
 * Không phụ thuộc bất kỳ module nào khác của game.
 */
(function () {
  'use strict';
  var BOOT_MS = 15000;
  function booted() {
    if (window.__caroBooted) return true;
    var sh = window.CaroShell; // vỏ đã hiện lên (Trang chủ/bàn cờ) cũng coi là đã khởi động
    return !!(sh && sh.visible);
  }
  function showFail() {
    if (document.getElementById('boot-fail')) return;
    var box = document.createElement('div');
    box.id = 'boot-fail';
    box.setAttribute('style', 'position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;gap:12px;align-items:center;justify-content:center;background:#f6f3ec;color:#222;padding:24px;text-align:center;font-family:system-ui,sans-serif');
    var msg = document.createElement('p');
    msg.textContent = 'Không tải được trò chơi. Kết nối có thể đang chậm hoặc một phần của trang đã bị chặn. / The game failed to load. Your connection may be slow or part of the page was blocked.';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Tải lại / Reload';
    btn.setAttribute('style', 'font-size:16px;padding:10px 22px;border-radius:10px;border:1px solid #888;background:#fff;cursor:pointer');
    btn.addEventListener('click', function () { location.reload(); });
    box.appendChild(msg);
    box.appendChild(btn);
    document.body.appendChild(box);
  }
  setTimeout(function () { if (!booted()) showFail(); }, BOOT_MS);
})();
