/*
 * File khai cuộc cho Rapfi selfplay (--opening) và đấu chọn (arena.js ARENA_OPENINGS_FILE): mỗi dòng một thế "h8i9…"
 * (chữ = cột từ a, số = hàng từ 1), bàn 20×20, khung bao các quân nằm giữa bàn.
 *   node make-openings.js <ra.txt> [ván.jsonl …]
 * Nguồn:
 *   - sách khai cuộc luật Việt Nam (caro/book-data.js: vn, vn-rapfi – thế và thế sau nước trong sách); NO_BOOK=1 bỏ qua
 *   - 4 / 6 / 8 nước đầu của các ván jsonl nếu có (vd. ván Gomocup bảng Caro từ server/scripts/gomocup-import.js)
 *   - RANDOM=<số> khai cuộc ngẫu nhiên đúng luật quanh tâm (SEED hạt giống, mặc định 1; STONES "3-7" số quân; BOX 7 cạnh ô)
 * Sách chỉ có ~600 thế: Rapfi tự đấu với số nút cố định là tất định, nên mỗi thế (× 8 phép xoay / lật) chỉ cho đúng một
 * ván – ván thứ hai từ cùng thế là bản sao (điều tra 21/11/2026). Cần hàng chục nghìn thế + số nút ngẫu nhiên (lib.sh).
 * Loại thế trùng (sau xoay / lật), thế đã có người thắng, và mọi thế trùng bộ đo: openings.json (khai cuộc 0–31 đo với
 * engine của game, 32–95 bộ đấu chọn cũ) và EXCLUDE=<file> (vd. bộ đấu chọn openings/arena.txt – mạng không được học trước
 * trên chính thế dùng để chấm nó). Lọc thế cân bằng: balance-openings.js.
 */
'use strict';
const fs = require('fs');
const C = require('../../../../../caro/rules.js');
const B = require('../../../../../caro/book.js');
const L = require('./openings-lib.js');
const OPEN = require('../../../openings.json').vn;

const N = 20;

/** Bộ sinh khai cuộc: add(mv) nhận nước toạ độ bất kỳ (X trước), trả true khi thêm được. */
function collector(exclude = []) {
  const lines = [];
  // Đánh dấu sẵn mọi khai cuộc đo là "đã có" để không thế nào trùng chúng (kể cả thế trong sách)
  const seen = new Set(OPEN.concat(exclude).map((op) => B.canon(op).key));
  function add(mv) {
    if (mv.length < 2) return false;
    const b = new C.Board('vn');
    for (let i = 0; i < mv.length; i++) {
      const [x, y] = mv[i], p = i % 2 ? C.O : C.X;
      if (b.get(x, y) !== C.EMPTY) return false;
      b.play(x, y, p);
      if (C.checkWin(b, x, y, p)) return false;
    }
    const key = B.canon(mv).key;
    if (seen.has(key)) return false;
    const c = L.centerOn(mv, N);
    if (!c) return false;
    seen.add(key);
    lines.push(L.formatPos(c));
    return true;
  }
  return { add, lines };
}

/** Khoá chuẩn hoá của sách ("x.y,…|x.y,…" – quân X | quân O) → nước đi xen kẽ, X trước. */
function fromKey(k) {
  const [xs, os] = k.split('|').map((s) => (s ? s.split(',').map((p) => p.split('.').map(Number)) : []));
  const mv = [];
  for (let i = 0; i < Math.max(xs.length, os.length); i++) { if (xs[i]) mv.push(xs[i]); if (os[i]) mv.push(os[i]); }
  return mv;
}

function build({ jsonl = [], book = true, random = 0, seed = 1, stones = '3-7', box = 7, exclude = [] } = {}) {
  const col = collector(exclude);
  if (book) {
    for (const rule of ['vn', 'vn-rapfi']) {
      for (const [k, m] of Object.entries(global.CaroBookData[rule] || {})) { const mv = fromKey(k); col.add(mv); col.add(mv.concat([m])); }
    }
  }
  for (const f of jsonl) {
    for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      const g = JSON.parse(line).m;
      for (const k of [4, 6, 8]) if (g.length > k + 6) col.add(g.slice(0, k));
    }
  }
  if (random > 0) {
    const rnd = L.prng(seed), [min, max] = String(stones).split('-').map(Number);
    let left = random, guard = random * 50;
    while (left > 0 && guard-- > 0) if (col.add(L.randomOpening(rnd, { min, max: max || min, box }))) left--;
  }
  return col.lines;
}

if (require.main === module) {
  const [out, ...jsonl] = process.argv.slice(2);
  const env = process.env;
  const lines = build({
    jsonl, book: env.NO_BOOK !== '1', random: +env.RANDOM || 0, seed: +env.SEED || 1, stones: env.STONES || '3-7',
    box: +env.BOX || 7, exclude: env.EXCLUDE ? L.readFile(env.EXCLUDE) : [],
  });
  fs.writeFileSync(out, lines.join('\n') + '\n');
  console.log(`${lines.length} khai cuộc → ${out}`);
}

module.exports = { build };
