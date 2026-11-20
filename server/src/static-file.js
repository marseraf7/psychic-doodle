/*
 * Gửi một file tĩnh của caro/ (web.js gọi sau khi đã kiểm đường dẫn và fs.stat) – có ETag + Last-Modified để trình duyệt hỏi
 * lại rẻ: file không đổi thì trả 304 (không thân), không phải tải lại cả file mỗi lần mở trang.
 * Trước đây (rà soát 20/11/2026): ~12 file CSS và các file lẻ ở ?bundle=0 trả "no-cache" mà không có ETag / Last-Modified
 * → ngoài Service Worker, mỗi lần mở trang tải lại đủ byte. Vẫn "no-cache" (luôn hỏi lại máy chủ) để bản mới tới ngay.
 * ETag yếu theo kích thước + thời điểm sửa (giống express/serve-static) – không phải đọc file để băm.
 *   sendStatic(req, res, file, st, type)
 */
'use strict';
const fs = require('fs');

/** ETag yếu của file từ fs.Stats. */
const etagOf = (st) => `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;

/** Yêu cầu có điều kiện còn khớp (file chưa đổi)? If-None-Match ưu tiên hơn If-Modified-Since (RFC 9110 §13.2.2). */
function fresh(req, etag, mtimeMs) {
  const inm = req.headers['if-none-match'];
  if (inm) {
    if (inm.trim() === '*') return true;
    // so sánh yếu: bỏ tiền tố W/
    const bare = (t) => t.trim().replace(/^W\//, '');
    return inm.split(',').some((t) => bare(t) === bare(etag));
  }
  const ims = Date.parse(req.headers['if-modified-since'] || '');
  // Last-Modified chỉ chính xác tới giây
  return !Number.isNaN(ims) && Math.floor(mtimeMs / 1000) * 1000 <= ims;
}

function sendStatic(req, res, file, st, type) {
  const etag = etagOf(st);
  const head = { etag, 'last-modified': new Date(st.mtimeMs).toUTCString(), 'cache-control': 'no-cache' };
  if ((req.method === 'GET' || req.method === 'HEAD') && fresh(req, etag, st.mtimeMs)) {
    res.writeHead(304, head);
    return res.end();
  }
  res.writeHead(200, { 'content-type': type, 'content-length': st.size, ...head });
  if (req.method === 'HEAD') return res.end();
  // File bị thay / xoá giữa chừng (update.sh đang cập nhật code): đóng kết nối, không để lỗi luồng làm sập tiến trình (L-S4)
  fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
}

module.exports = { sendStatic, etagOf, fresh };
