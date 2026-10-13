/*
 * Điều khiển Rapfi (engine Gomoku vô địch Gomocup – https://github.com/dhbloo/rapfi, GPL-3; trọng số mạng CC0) qua giao thức
 * Piskvork, có canh giờ: quá hạn không trả nước thì khởi động lại và hỏi lại. Chỉ dùng cho người phát triển, chạy cục bộ:
 * Rapfi KHÔNG nằm trong repo / app. Cách dựng: xem README.md cùng thư mục.
 * Cho Rapfi ≥ 40 ms / nước: ít hơn nó không kịp tìm và trả nước vô nghĩa.
 * move(moves) – moves là toạ độ bàn 0..size-1, X đi trước; trả về [x, y] kèm .ev (điểm Rapfi, góc nhìn bên tới lượt).
 */
'use strict';
const { spawn } = require('child_process');
const path = require('path');
// Thư mục chứa pbrain-rapfi + config.toml + các file trọng số
const DIR = process.env.RAPFI_DIR || path.join(__dirname, 'run');

class Rapfi {
  constructor(size, ruleN, ms) { this.size = size; this.ruleN = ruleN; this.ms = ms; this.restarts = 0; }
  start() {
    this.p = spawn(path.join(DIR, 'pbrain-rapfi'), [], { cwd: DIR });
    this.buf = ''; this.wait = null; this.lastEval = null;
    this.p.stdout.on('data', (d) => {
      this.buf += d.toString();
      let i;
      while ((i = this.buf.indexOf('\n')) >= 0) {
        const line = this.buf.slice(0, i).trim(); this.buf = this.buf.slice(i + 1);
        const em = /Eval ([+-]?M?\d+)/.exec(line);
        if (em) this.lastEval = /M/.test(em[1]) ? (em[1][0] === '-' ? -20000 : 20000) : Number(em[1]);
        if (this.wait && this.wait.re.test(line)) { const w = this.wait; this.wait = null; w.res(line); }
      }
    });
    this.p.on('error', () => {});
  }
  send(s) { try { this.p.stdin.write(s + '\n'); } catch (e) { /* tiến trình đã chết: lần canh giờ sẽ khởi động lại */ } }
  expect(re, ms) {
    return new Promise((res) => {
      const t = setTimeout(() => { this.wait = null; res(null); }, ms);
      this.wait = { re, res: (l) => { clearTimeout(t); res(l); } };
    });
  }
  async init() {
    this.start();
    const ok = this.expect(/^OK$/, 20000);
    this.send(`START ${this.size}`);
    if (!(await ok)) throw new Error('Rapfi không khởi động');
    for (const c of [`INFO rule ${this.ruleN}`, `INFO timeout_turn ${this.ms}`, 'INFO timeout_match 0', 'INFO thread_num 1', 'INFO max_memory 268435456']) this.send(c);
  }
  async move(moves) {
    for (let tries = 0; tries < 4; tries++) {
      const side = moves.length % 2;
      const r = this.expect(/^\d+,\d+$/, this.ms * 20 + 10000);
      this.lastEval = null;
      this.send('BOARD');
      moves.forEach(([x, y], i) => this.send(`${x},${y},${i % 2 === side ? 1 : 2}`));
      this.send('DONE');
      const line = await r;
      if (line) { const out = line.split(',').map(Number); out.ev = this.lastEval; return out; }
      // Treo: khởi động lại
      this.restarts++;
      try { this.p.kill('SIGKILL'); } catch (e) { /* đã chết */ }
      await this.init();
    }
    throw new Error('Rapfi không trả nước');
  }
  quit() { this.send('END'); setTimeout(() => { try { this.p.kill(); } catch (e) { /* */ } }, 200); }
}
module.exports = { Rapfi };
