/*
 * Băm mã 6 số (mã đặt lại mật khẩu – store.js, mã xác minh email – hub/auth.js) bằng HMAC-SHA256 với khoá bí mật của máy
 * chủ (L-1, rà soát bảo mật 20/11/2026). Trước đây lưu SHA-256 không khoá: không gian mã chỉ 10⁶ nên ai đọc được caro.db
 * trong lúc mã còn hạn tính ngược ra mã trong chưa tới 1 giây, vượt lớp giới hạn 5 lần thử. Nay thiếu khoá thì không thử được.
 *
 * Khoá RIÊNG cho việc này (file DATA_DIR/code-key, 32 byte ngẫu nhiên, quyền 600), không dùng chung eval-key
 * (evalcache.js) – mỗi khoá một việc:
 *  - code-key không cần sao lưu / chép khi chuyển máy: mất hay đổi khoá chỉ làm các mã đang chờ (≤ 30 phút) hết hiệu lực,
 *    người dùng xin mã mới. Vì thế nó cố ý KHÔNG nằm trong bản sao lưu (offsite-backup.sh chỉ chép caro.db + eval-key):
 *    lộ bản sao lưu cũng không dò được mã. Muốn thay khoá: xoá file rồi khởi động lại.
 *  - eval-key thì phải giữ nguyên lâu dài (mã người gửi điểm phân tích) và nằm trong bản sao lưu đã mã hoá.
 * Không có DATA_DIR (test, chạy trong bộ nhớ): khoá ngẫu nhiên trong bộ nhớ.
 * Không bao giờ ghi khoá hay mã ra log.
 *
 * Định dạng lưu: 'h1:' + hex HMAC(khoá, mục đích + ':' + mã). Mục đích ('reset' / 'email') tách hai loại mã: mã băm
 * của loại này không dùng được cho loại kia.
 * Mã cũ (SHA-256 thuần, 64 ký tự hex, phát trước bản này) vẫn được nhận tới khi hết hạn (≤ 30 phút) – không bắt người
 * đang chờ thư xin lại mã sau khi cập nhật máy chủ. Mã mới luôn là HMAC.
 *   codeHash(purpose, code) → chuỗi lưu;  codeMatches(purpose, code, stored) → true/false;  useKeyFile(file)
 */
'use strict';
const fs = require('fs');
const crypto = require('crypto');

let KEY = crypto.randomBytes(32);
const PREFIX = 'h1:';

/** Dùng khoá trong file (tạo mới nếu chưa có, quyền 600). File hỏng thì báo lỗi khi khởi động, không tự ghi đè. */
function useKeyFile(file) {
  let hex;
  try {
    hex = fs.readFileSync(file, 'utf8').trim();
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    hex = crypto.randomBytes(32).toString('hex');
    try {
      fs.writeFileSync(file, hex + '\n', { flag: 'wx', mode: 0o600 });
    } catch (e2) {
      if (e2.code !== 'EEXIST') throw e2;
      hex = fs.readFileSync(file, 'utf8').trim(); // tiến trình khác vừa tạo
    }
  }
  if (!/^[0-9a-f]{64}$/.test(hex)) throw new Error('code-hash: file khoá hỏng ' + file + ' (xoá file để tạo khoá mới)');
  KEY = Buffer.from(hex, 'hex');
}

const hmac = (purpose, code) => crypto.createHmac('sha256', KEY).update(purpose + ':' + String(code)).digest();

function codeHash(purpose, code) {
  return PREFIX + hmac(purpose, code).toString('hex');
}

/** So sánh thời gian hằng: chuỗi hex cùng độ dài 64. */
function sameHex(buf, hex) {
  if (typeof hex !== 'string' || !/^[0-9a-f]{64}$/.test(hex)) return false;
  return crypto.timingSafeEqual(buf, Buffer.from(hex, 'hex'));
}

function codeMatches(purpose, code, stored) {
  if (typeof stored !== 'string') return false;
  if (stored.startsWith(PREFIX)) return sameHex(hmac(purpose, code), stored.slice(PREFIX.length));
  // Mã phát trước bản HMAC (SHA-256 thuần): còn hạn thì vẫn nhận
  return sameHex(crypto.createHash('sha256').update(String(code)).digest(), stored);
}

module.exports = { codeHash, codeMatches, useKeyFile };
