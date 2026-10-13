/*
 * Chạy đúng bản Rapfi WebAssembly của app (caro/rapfi/, GPL-3) trong Node, cùng giao diện với driver.js – để đo sức BOAT
 * như người chơi gặp trong trình duyệt. Cần các file mạng (CC0) trong RAPFI_NETS (mặc định server/scripts/rapfi/run,
 * cùng chỗ với bản dựng gốc – xem README.md). Dùng: RAPFI=wasm node server/scripts/rapfi/match.js …
 */
'use strict';
const fs = require('fs');
const path = require('path');
const RDIR = path.join(__dirname, '../../../caro/rapfi');
const NETS_DIR = process.env.RAPFI_NETS || process.env.RAPFI_DIR || path.join(__dirname, 'run');
const W = require(path.join(RDIR, 'worker.js'));
const RULE = { 0: 'free', 1: 'std', 4: 'renju' };

class Rapfi {
  constructor(size, ruleN, ms) { this.size = size; this.rule = RULE[ruleN]; this.ruleN = ruleN; this.ms = ms; this.restarts = 0; }
  async init() {
    const factory = require(path.join(RDIR, 'rapfi-single-simd128.js'));
    this.out = [];
    this.mod = await factory({
      locateFile: (f) => path.join(RDIR, f),
      onFS: (FS) => {
        FS.writeFile('/config.toml', W.config(this.rule));
        FS.writeFile('/model210901.bin', fs.readFileSync(path.join(RDIR, 'model210901.bin')));
        for (const f of W.NETS[this.rule]) FS.writeFile('/' + f, fs.readFileSync(path.join(NETS_DIR, f)));
      },
      onReceiveStdout: (l) => this.out.push(l),
      onReceiveStderr: () => {},
    });
    this.send('START ' + this.size);
    for (const c of [`INFO rule ${this.ruleN}`, 'INFO timeout_match 0', 'INFO thread_num 1', 'INFO max_memory 0', `INFO timeout_turn ${this.ms}`]) this.send(c);
  }
  send(c) { this.out = []; this.mod.sendCommand(c); return this.out; }
  async move(moves) {
    const side = moves.length % 2;
    const res = this.send(['BOARD', ...moves.map(([x, y], i) => `${x},${y},${i % 2 === side ? 1 : 2}`), 'DONE'].join('\n'));
    let ev = null;
    for (const l of res) {
      const em = /Eval ([+-]?M?\d+)/.exec(l);
      if (em) ev = /M/.test(em[1]) ? (em[1][0] === '-' ? -20000 : 20000) : Number(em[1]);
    }
    const mv = res.map((l) => /^(\d+),(\d+)$/.exec(l.trim())).find(Boolean);
    if (!mv) throw new Error('Rapfi không trả nước');
    const out = [Number(mv[1]), Number(mv[2])];
    out.ev = ev;
    return out;
  }
  quit() { /* tiến trình Node kết thúc là xong */ }
}
module.exports = { Rapfi };
