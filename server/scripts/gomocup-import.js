/*
 * Nhập ván đấu Gomocup (giải vô địch thế giới dành cho AI Gomoku, gomocup.org) để engine học: sách khai cuộc, tinh chỉnh
 * trọng số. Công cụ cho người phát triển – không chạy trên máy chủ, dữ liệu không đưa vào repo.
 *
 *   1. Tải kết quả từng năm (mỗi năm một file zip, có ván của mọi bảng đấu):
 *        https://gomocup.org/static/tournaments/<năm>/results/gomocup<năm>results.zip   (vd. 2021 … 2025)
 *   2. Giải nén mỗi năm vào một thư mục con: <thư mục>/<năm>/<bảng đấu>/*.psq
 *   3. node server/scripts/gomocup-import.js <thư mục> <thư mục ra>
 *      → <thư mục ra>/<luật>.jsonl, mỗi dòng: {"m":[[x,y],…],"w":1|2|0,"src":"2024/Caro"}
 *        (x, y tính từ 0; w: 1 = bên đi trước thắng, 2 = bên đi sau thắng, 0 = hoà / không rõ)
 *
 * Bảng đấu → luật của app: Freestyle*, Fastgame → 'free' (≥ 5 quân); Standard* → 'std' (đúng 5); Renju → 'renju';
 * Caro → 'caro' (luật Caro của Gomocup: đúng 5 quân và không bị chặn hai đầu – gần nhất với luật Việt Nam của app).
 * File .psq (định dạng của Piskvork): dòng đầu "Piskvorky 20x20, …", mỗi nước một dòng "x,y,thời gian" (tính từ 1),
 * cuối file là tên 2 AI. Người thắng xác định bằng cách đánh lại ván: nước cuối thành hàng thắng theo luật thì bên đó thắng.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const RULE_OF = (group) => {
  if (/^Caro/i.test(group)) return 'caro';
  if (/^Renju/i.test(group)) return 'renju';
  if (/^Standard/i.test(group)) return 'std';
  if (/^(Freestyle|Fastgame)/i.test(group)) return 'free';
  return null;
};

/** Đọc một file .psq → { size, moves } hoặc null. */
function parsePsq(text) {
  const lines = text.split(/\r?\n/);
  const head = /(\d+)x(\d+)/.exec(lines[0] || '');
  if (!head) return null;
  const size = Number(head[1]);
  const moves = [];
  for (let i = 1; i < lines.length; i++) {
    const m = /^(\d+),(\d+),(-?\d+)$/.exec(lines[i].trim());
    if (!m) break;
    moves.push([Number(m[1]) - 1, Number(m[2]) - 1]);
  }
  return { size, moves };
}

/** Bên đặt nước cuối có thắng theo luật không (đếm hàng qua nước cuối). */
function lastMoveWins(moves, rule) {
  if (moves.length < 9) return false;
  const p = (moves.length - 1) % 2;
  const mine = new Set(), theirs = new Set();
  moves.forEach(([x, y], i) => ((i % 2 === p) ? mine : theirs).add(x + ',' + y));
  const [lx, ly] = moves[moves.length - 1];
  for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
    let a = 1; while (mine.has((lx - a * dx) + ',' + (ly - a * dy))) a++;
    let b = 1; while (mine.has((lx + b * dx) + ',' + (ly + b * dy))) b++;
    const len = a + b - 1;
    if (len < 5) continue;
    if (rule === 'free') return true;
    if (len !== 5) { if (rule === 'renju' && p === 1) return true; continue; } // Renju: O được hàng dài hơn 5
    if (rule === 'caro') {
      const blockA = theirs.has((lx - a * dx) + ',' + (ly - a * dy)), blockB = theirs.has((lx + b * dx) + ',' + (ly + b * dy));
      if (blockA && blockB) continue;
    }
    return true;
  }
  return false;
}

function main() {
  const [src, out] = process.argv.slice(2);
  if (!src || !out) { console.error('Cách dùng: node server/scripts/gomocup-import.js <thư mục giải nén> <thư mục ra>'); process.exit(1); }
  fs.mkdirSync(out, { recursive: true });
  const streams = {}, count = {};
  const write = (rule, obj) => {
    if (!streams[rule]) streams[rule] = fs.createWriteStream(path.join(out, rule + '.jsonl'));
    streams[rule].write(JSON.stringify(obj) + '\n');
    count[rule] = (count[rule] || 0) + 1;
  };
  for (const year of fs.readdirSync(src).sort()) {
    const ydir = path.join(src, year);
    if (!fs.statSync(ydir).isDirectory()) continue;
    for (const group of fs.readdirSync(ydir)) {
      const rule = RULE_OF(group);
      const gdir = path.join(ydir, group);
      if (!rule || !fs.statSync(gdir).isDirectory()) continue;
      for (const f of fs.readdirSync(gdir)) {
        if (!f.endsWith('.psq')) continue;
        const g = parsePsq(fs.readFileSync(path.join(gdir, f), 'utf8'));
        if (!g || g.moves.length < 5) continue;
        const w = lastMoveWins(g.moves, rule) ? ((g.moves.length - 1) % 2) + 1 : 0;
        write(rule, { m: g.moves, w, n: g.size, src: `${year}/${group}` });
      }
    }
  }
  for (const s of Object.values(streams)) s.end();
  console.log('Đã nhập:', JSON.stringify(count));
}

if (require.main === module) main();
module.exports = { parsePsq, lastMoveWins, RULE_OF };
