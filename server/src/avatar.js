/*
 * Ảnh đại diện: kiểm ảnh người chơi gửi lên và lưu trong CSDL (bảng avatars – store-schema.js).
 * Trình duyệt tự thu nhỏ ảnh về 128×128 (caro/avatar.js) rồi mới gửi, nên máy chủ chỉ nhận ảnh rất nhỏ:
 *   - tối đa MAX_BYTES (10 KB) – vừa một tin WebSocket (giới hạn 16 KB), không làm nặng máy chủ;
 *   - chỉ WebP / JPEG / PNG, nhận ra bằng các byte đầu file (không tin loại ảnh máy khách khai);
 *   - đọc kích thước trong phần đầu ảnh, quá MAX_SIDE thì từ chối: ảnh nhỏ về dung lượng nhưng rất lớn về điểm ảnh
 *     ("bom giải nén") sẽ làm máy người xem tốn hàng trăm MB khi hiện ảnh.
 * Máy chủ không giải mã ảnh (không cần thư viện xử lý ảnh) – chỉ đọc phần đầu, phục vụ lại đúng các byte đã kiểm.
 */
'use strict';

const MAX_BYTES = 10 * 1024;
const MAX_SIDE = 256;

const u16be = (b, i) => b.readUInt16BE(i);
const u16le = (b, i) => b.readUInt16LE(i);

/** Kích thước ảnh JPEG: tìm khung SOFn (bỏ qua các đoạn khác theo độ dài của chúng). */
function jpegSize(b) {
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const m = b[i + 1];
    if (m === 0xff) { i++; continue; } // byte đệm
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; } // dấu không có độ dài
    const len = u16be(b, i + 2);
    if (len < 2) return null;
    // SOF0–SOF15 trừ DHT (C4), JPG (C8), DAC (CC)
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { w: u16be(b, i + 7), h: u16be(b, i + 5) };
    i += 2 + len;
  }
  return null;
}

/** Kích thước ảnh WebP: VP8 (có mất mát), VP8L (không mất mát) hoặc VP8X (mở rộng). */
function webpSize(b) {
  if (b.length < 30) return null;
  const kind = b.toString('latin1', 12, 16);
  if (kind === 'VP8 ' && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) return { w: u16le(b, 26) & 0x3fff, h: u16le(b, 28) & 0x3fff };
  if (kind === 'VP8L' && b[20] === 0x2f) {
    const v = b.readUInt32LE(21);
    return { w: (v & 0x3fff) + 1, h: ((v >> 14) & 0x3fff) + 1 };
  }
  if (kind === 'VP8X') return { w: b.readUIntLE(24, 3) + 1, h: b.readUIntLE(27, 3) + 1 };
  return null;
}

/** Loại ảnh theo các byte đầu file và kích thước; không nhận ra thì null. */
function sniff(b) {
  if (b.length >= 24 && b.readUInt32BE(0) === 0x89504e47 && b.readUInt32BE(4) === 0x0d0a1a0a && b.toString('latin1', 12, 16) === 'IHDR') {
    return { type: 'image/png', w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    const s = jpegSize(b);
    return s && { type: 'image/jpeg', ...s };
  }
  if (b.length >= 16 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') {
    const s = webpSize(b);
    return s && { type: 'image/webp', ...s };
  }
  return null;
}

/**
 * Kiểm ảnh gửi lên (chuỗi base64, có thể kèm tiền tố "data:image/...;base64,").
 * Trả { type, buf } hoặc { error: 'avatar_too_big' | 'bad_avatar' }.
 */
function parse(data) {
  if (typeof data !== 'string' || data.length > Math.ceil(MAX_BYTES / 3) * 4 + 40) return { error: 'avatar_too_big' };
  const b64 = data.replace(/^data:image\/[a-z]+;base64,/, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return { error: 'bad_avatar' };
  const buf = Buffer.from(b64, 'base64');
  if (buf.length > MAX_BYTES) return { error: 'avatar_too_big' };
  const s = sniff(buf);
  if (!s || !s.w || !s.h || s.w > MAX_SIDE || s.h > MAX_SIDE) return { error: 'bad_avatar' };
  return { type: s.type, buf };
}

/** Bảng avatars: uid → ảnh đã kiểm. */
class AvatarDb {
  constructor(db) {
    this.qGet = db.prepare('SELECT type, data FROM avatars WHERE uid = ?');
    this.qSet = db.prepare('INSERT INTO avatars (uid, type, data) VALUES (?, ?, ?) ON CONFLICT(uid) DO UPDATE SET type = excluded.type, data = excluded.data');
    this.qDrop = db.prepare('DELETE FROM avatars WHERE uid = ?');
  }
  get(uid) {
    const r = this.qGet.get(uid);
    return r ? { type: r.type, buf: Buffer.from(r.data) } : null;
  }
  set(uid, type, buf) { this.qSet.run(uid, type, buf); }
  drop(uid) { this.qDrop.run(uid); }
}

module.exports = { parse, sniff, AvatarDb, MAX_BYTES, MAX_SIDE };
