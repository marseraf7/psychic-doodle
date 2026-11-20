/*
 * Lưới an toàn cho từng yêu cầu (rà soát bảo mật 20/11/2026, sau H-1): một lỗi không lường trước khi xử lý MỘT yêu cầu
 * HTTP hay MỘT tin WebSocket chỉ làm hỏng yêu cầu đó (ghi log, trả 500 / bỏ tin), không giết cả tiến trình – mất mọi ván
 * đang chơi và mọi kết nối.
 * Không thay cho việc sửa lỗi: log ghi đủ ngăn xếp để còn sửa. Không nuốt lỗi cấp tiến trình (uncaughtException vẫn
 * làm tiến trình thoát và systemd khởi động lại – trạng thái lúc đó có thể đã hỏng, chạy tiếp còn tệ hơn).
 * Lưới này chỉ bắt lỗi ném đồng bộ trong handler và promise bị từ chối mà handler trả về; lỗi trong callback hẹn sau
 * (req.on('end'), fs.stat…) mỗi nơi tự bọc try/catch.
 *   guardHttp(handler, log?)  – bọc (req, res) của http.createServer
 *   guardCall(name, fn, log?) – chạy fn(); lỗi (đồng bộ hoặc promise) chỉ ghi log
 */
'use strict';

/** Đường dẫn để ghi log: bỏ query (có thể chứa mã / token), cắt 100 ký tự, thay ký tự điều khiển. */
const logPath = (url) => String(url || '').split('?')[0].slice(0, 100).replace(/[\x00-\x1f\x7f]/g, '?');

function guardHttp(handler, log = console.error) {
  return function guarded(req, res) {
    const fail = (e) => {
      log(`[web] lỗi không lường trước khi xử lý ${String(req.method).slice(0, 10)} ${logPath(req.url)}:`, e);
      try {
        if (!res.headersSent) { res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }); res.end('server error'); }
        // Đã trả lời xong (res.end) rồi mới ném: chỉ ghi log – destroy lúc này cắt cụt phần thân còn trong bộ đệm socket
        else if (!res.writableEnded) res.destroy(); // đang trả dở: cắt kết nối để bên kia biết trả lời không trọn
      } catch (e2) { try { res.destroy(); } catch (e3) { /* kết nối đã đóng */ } }
    };
    try {
      const r = handler(req, res);
      if (r && typeof r.then === 'function') r.then(null, fail);
    } catch (e) { fail(e); }
  };
}

function guardCall(name, fn, log = console.error) {
  const fail = (e) => log(`[ws] lỗi không lường trước ở ${name}:`, e);
  try {
    const r = fn();
    if (r && typeof r.then === 'function') r.then(null, fail);
  } catch (e) { fail(e); }
}

module.exports = { guardHttp, guardCall, logPath };
