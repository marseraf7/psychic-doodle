/*
 * Vẽ ảnh PNG xem trước một ván (cho link chia sẻ: og:image) – không cần thư viện ngoài.
 *  encodePng(w, h, rgb): mã hoá ảnh RGB 8 bit (zlib có sẵn trong Node).
 *  boardPng(moves, opts): ảnh 1200×630 (kích thước chuẩn của ảnh xem trước mạng xã hội), bàn cờ ở giữa,
 *    X đỏ, O xanh, nước cuối có viền, 5 quân thắng được tô nền. Nét vẽ khử răng cưa theo khoảng cách tới nét.
 */
'use strict';
const zlib = require('zlib');
const Caro = require('../../caro/rules.js');

const W = 1200, H = 630;
const COLORS = {
  bg: [38, 36, 33], board: [240, 228, 200], grid: [196, 180, 150], x: [211, 58, 44], o: [42, 111, 219],
  win: [255, 214, 102], last: [120, 100, 70],
};

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(td) >>> 0);
  return Buffer.concat([len, td, crc]);
}

/** rgb: Buffer w*h*3. */
function encodePng(w, h, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // 8 bit
  ihdr[9] = 2; // RGB
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0; // không lọc
    rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 3 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

class Canvas {
  constructor(w, h, color) {
    this.w = w;
    this.h = h;
    this.px = Buffer.alloc(w * h * 3);
    this.rect(0, 0, w, h, color);
  }

  /** Tô hình chữ nhật: tô 1 hàng rồi chép sang các hàng còn lại (nhanh hơn tô từng điểm). */
  rect(x0, y0, w, h, c) {
    const xa = Math.max(0, x0), xb = Math.min(this.w, x0 + w), ya = Math.max(0, y0), yb = Math.min(this.h, y0 + h);
    if (xa >= xb || ya >= yb) return;
    const row = (ya * this.w + xa) * 3;
    for (let x = 0; x < xb - xa; x++) { this.px[row + x * 3] = c[0]; this.px[row + x * 3 + 1] = c[1]; this.px[row + x * 3 + 2] = c[2]; }
    for (let y = ya + 1; y < yb; y++) this.px.copy(this.px, (y * this.w + xa) * 3, row, row + (xb - xa) * 3);
  }

  /** Trộn màu c vào điểm (x, y) với độ phủ a (0..1). */
  set(x, y, c, a) {
    if (a <= 0 || x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 3;
    if (a >= 1) { this.px[i] = c[0]; this.px[i + 1] = c[1]; this.px[i + 2] = c[2]; return; }
    for (let k = 0; k < 3; k++) this.px[i + k] = Math.round(this.px[i + k] * (1 - a) + c[k] * a);
  }

  /** Tô các điểm trong ô vuông (cx, cy, r) theo hàm khoảng cách tới nét: dist(dx, dy) – độ phủ = nửa nét − khoảng cách. */
  shape(cx, cy, r, half, c, dist) {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const d = dist(x + 0.5 - cx, y + 0.5 - cy);
        this.set(x, y, c, Math.min(1, half - d + 0.5));
      }
    }
  }
}

/** moves: [[x, y], ...] (X đi trước). Trả về Buffer PNG. */
function boardPng(moves) {
  const cv = new Canvas(W, H, COLORS.bg);
  const list = Array.isArray(moves) ? moves.slice(0, 2000) : [];
  let minX = 0, maxX = 0, minY = 0, maxY = 0;
  if (list.length) {
    minX = Math.min(...list.map((m) => m[0])); maxX = Math.max(...list.map((m) => m[0]));
    minY = Math.min(...list.map((m) => m[1])); maxY = Math.max(...list.map((m) => m[1]));
  }
  // Thêm lề 1 ô, ít nhất 9×9, nhiều nhất 40×40 (ván quá rộng thì lấy vùng quanh nước cuối)
  const spanX = maxX - minX + 3, spanY = maxY - minY + 3;
  let cols = Math.max(9, spanX), rows = Math.max(9, spanY);
  let x0 = minX - 1 - Math.floor((cols - spanX) / 2), y0 = minY - 1 - Math.floor((rows - spanY) / 2);
  if (cols > 40 || rows > 40) {
    const last = list[list.length - 1];
    cols = Math.min(cols, 40); rows = Math.min(rows, 40);
    x0 = last[0] - (cols >> 1); y0 = last[1] - (rows >> 1);
  }
  const cell = Math.max(10, Math.floor(Math.min((W - 60) / cols, (H - 40) / rows)));
  const bw = cell * cols, bh = cell * rows;
  const left = Math.floor((W - bw) / 2), top = Math.floor((H - bh) / 2);
  cv.rect(left, top, bw, bh, COLORS.board);
  // Ô thắng: dựng lại bàn để tìm 5 quân thắng từ nước cuối
  const board = new Caro.Board();
  list.forEach((m, i) => board.play(m[0], m[1], i % 2 ? Caro.O : Caro.X));
  const last = list[list.length - 1];
  const win = last ? Caro.checkWin(board, last[0], last[1], list.length % 2 ? Caro.X : Caro.O) : null;
  for (const w of win || []) {
    const cx = (Array.isArray(w) ? w[0] : w.x) - x0, cy = (Array.isArray(w) ? w[1] : w.y) - y0;
    if (cx >= 0 && cy >= 0 && cx < cols && cy < rows) cv.rect(left + cx * cell + 1, top + cy * cell + 1, cell - 1, cell - 1, COLORS.win);
  }
  // Lưới
  for (let i = 0; i <= cols; i++) cv.rect(left + i * cell, top, 1, bh + 1, COLORS.grid);
  for (let j = 0; j <= rows; j++) cv.rect(left, top + j * cell, bw + 1, 1, COLORS.grid);
  // Quân
  const r = cell * 0.32, half = Math.max(1, cell * 0.06);
  list.forEach((m, i) => {
    const gx = m[0] - x0, gy = m[1] - y0;
    if (gx < 0 || gy < 0 || gx >= cols || gy >= rows) return;
    const cx = left + gx * cell + cell / 2, cy = top + gy * cell + cell / 2;
    if (i % 2 === 0) {
      cv.shape(cx, cy, r + 2, half, COLORS.x, (dx, dy) => {
        if (Math.abs(dx) > r + half || Math.abs(dy) > r + half) return 99;
        return Math.min(Math.abs(dx - dy), Math.abs(dx + dy)) / Math.SQRT2;
      });
    } else {
      cv.shape(cx, cy, r + half + 2, half, COLORS.o, (dx, dy) => Math.abs(Math.hypot(dx, dy) - r));
    }
    if (i === list.length - 1) {
      const s = cell / 2 - 1.5;
      cv.shape(cx, cy, s + 2, 0.8, COLORS.last, (dx, dy) => Math.abs(Math.max(Math.abs(dx), Math.abs(dy)) - s));
    }
  });
  return encodePng(W, H, cv.px);
}

module.exports = { encodePng, boardPng, W, H };
