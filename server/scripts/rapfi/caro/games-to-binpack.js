/*
 * Chuyển ván luật Việt Nam (jsonl: {"m":[[x,y],…],"w":1|2|0} – ván tự đấu của engine cũ server/scripts/selfplay.js,
 * ván Gomocup bảng Caro từ gomocup-import.js) sang .binpack (không nén) của Rapfi để tuner Rapfi-CARO học bảng đánh giá:
 *   node server/scripts/rapfi/caro/games-to-binpack.js <ra.bin> <vào.jsonl> [vào2.jsonl …]
 * Mỗi ván đặt vào bàn 20×20 (dời cho khung bao các quân vào giữa); ván rộng hơn bàn thì bỏ. Ghi luật caro (mã 7 trong dữ
 * liệu), kết quả theo bên đi trước, không có điểm đánh giá (tuner học theo kết quả). Đuôi .bin để tuner tự nhận
 * (`--dataset-file-extensions` mặc định .bin,.lz4); tuner đọc file không nén khi không thấy mã LZ4 ở đầu.
 */
'use strict';
const fs = require('fs');
const C = require('../../../../caro/rules.js');

const SIZE = 20, RULE_CARO = 7;
const [out, ...inputs] = process.argv.slice(2);
if (!out || !inputs.length) {
  console.error('Dùng: node games-to-binpack.js <ra.bin> <vào.jsonl> …');
  process.exit(1);
}

/** Toạ độ Rapfi (x << 5 | y), như encodeU16Move. */
const enc = (x, y) => (x << 5) | y;

/** Một ván → Buffer theo PackedEntryHead (8 byte) + PackedMove (4 byte mỗi nước), hoặc null nếu không dùng được. */
function pack(all, w) {
  // Ván phải hợp lệ theo luật Việt Nam (không ô trùng). Ván Gomocup (luật Caro của Gomocup cần đủ 5 quân) thường có bên
  // thắng sớm hơn theo luật Việt Nam (4 quân trống hai đầu): cắt ván ở nước đó – các thế trước vẫn là thế thật
  const b = new C.Board('vn');
  let winner = 0, n = 0;
  for (; n < all.length && !winner; n++) {
    const [x, y] = all[n], p = n % 2 ? C.O : C.X;
    if (b.get(x, y) !== C.EMPTY) return null;
    b.play(x, y, p);
    if (C.checkWin(b, x, y, p)) winner = p;
  }
  const moves = all.slice(0, n);
  if (moves.length < 5 || moves.length > 1000) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of moves) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const wdt = x1 - x0 + 1, hgt = y1 - y0 + 1;
  if (wdt > SIZE || hgt > SIZE) return null;
  const ox = x0 - Math.floor((SIZE - wdt) / 2), oy = y0 - Math.floor((SIZE - hgt) / 2);
  // Không ai thắng theo luật Việt Nam (vd. ván Gomocup kết thúc bằng năm bị chặn một đầu…): tin kết quả ghi trong file
  const result = winner ? (winner === C.X ? 2 : 0) : w === 1 ? 2 : w === 2 ? 0 : 1;
  const buf = Buffer.alloc(8 + 4 * n);
  // PackedEntryHead: boardSize:5 rule:3 result:4 totalPly:10 initPly:10 gameTag:14 moveCount:18 (bit thấp trước)
  const lo = SIZE | (RULE_CARO << 5) | (result << 8) | (n << 12) | (0 << 22);
  buf.writeUInt32LE(lo >>> 0, 0);
  buf.writeUInt32LE(((0) | (n << 14)) >>> 0, 4); // gameTag 14 bit = 0, moveCount 18 bit
  for (let i = 0; i < n; i++) {
    const [x, y] = moves[i];
    // PackedMove: isFirst:1 isLast:1 isNoEval:1 isPass:1 reserved:2 move:10, rồi eval int16
    buf.writeUInt16LE(1 | (1 << 1) | (1 << 2) | (enc(x - ox, y - oy) << 6), 8 + 4 * i);
    buf.writeInt16LE(0, 10 + 4 * i);
  }
  return buf;
}

const parts = [];
let games = 0, skipped = 0;
for (const f of inputs) {
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const g = JSON.parse(line);
    const buf = pack(g.m, g.w);
    if (buf) { parts.push(buf); games++; } else skipped++;
  }
}
fs.writeFileSync(out, Buffer.concat(parts));
console.log(`${games} ván → ${out} (bỏ ${skipped} ván không hợp lệ / quá ngắn / rộng hơn bàn ${SIZE}×${SIZE})`);
