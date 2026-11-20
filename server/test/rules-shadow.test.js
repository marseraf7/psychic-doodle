// Chạy bóng luật Rust (server/src/rules-shadow.js): ván thật qua máy chủ + client WebSocket ở cả 4 luật phải 0 sai khác;
// sai khác giả (bộ tính giả) được đếm và ghi lại mà kết quả ván không đổi; không nạp được WASM / CARO_RULES_SHADOW=0 thì tắt êm.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const WebSocket = require('ws');
const crypto = require('crypto');
const { start } = require('../server.js');
const { Room } = require('../src/room.js');
const RS = require('../src/rules-shadow.js');
const Wasm = require('../../core/caro-rules/js/rules-wasm.js');

let app, url, base;
test.before(async () => {
  app = start({ port: 0, dataFile: null, msgRate: 2000, timers: { NEXT_GAME_MS: 50, SECOND_MS: 20, DRAW_COOLDOWN_MS: 300 } });
  await new Promise((r) => app.server.on('listening', r));
  url = `ws://127.0.0.1:${app.server.address().port}/ws`;
  base = `http://127.0.0.1:${app.server.address().port}`;
});
test.after(() => app.stop());

class Client {
  constructor() { this.msgs = []; this.waiters = []; }
  static async open(name) {
    const c = new Client();
    c.ws = new WebSocket(url);
    c.ws.on('message', (d) => {
      const m = JSON.parse(d);
      c.msgs.push(m);
      if (m.t === 'room') c.room = m.room;
      if (m.t === 'welcome') { c.me = m.me; c.room = m.room; }
      c.waiters = c.waiters.filter((w) => !w(m));
    });
    await new Promise((r) => c.ws.on('open', r));
    c.send({ t: 'hello', guestKey: crypto.randomBytes(16).toString('hex'), guestName: name });
    await c.wait('welcome');
    return c;
  }
  send(m) { this.ws.send(JSON.stringify(m)); }
  wait(t, pred = () => true, ms = 3000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Hết giờ chờ ' + t + ' | ' + JSON.stringify(this.msgs.filter((m) => m.t === 'error').slice(-2)))), ms);
      this.waiters.push((m) => { if (m.t === t && pred(m)) { clearTimeout(timer); resolve(m); return true; } return false; });
    });
  }
  req(m, t, pred) { const p = this.wait(t, pred); this.send(m); return p; }
  close() { this.ws.close(); }
}

/** Người phải hành động đặt quân (x, y); chờ cả hai client thấy nước mới (hoặc ván kết thúc). */
async function play(a, b, x, y) {
  const who = a.room.actor === a.me.id ? a : b, other = who === a ? b : a;
  const n = who.room.moves.length + 1;
  const done = (m) => m.room && (m.room.moves.length === n || !!m.room.winner);
  const p = Promise.all([who.wait('room', done), other.wait('room', done)]);
  who.send({ t: 'move', x, y });
  await p;
}

/** Nước thứ k của kịch bản: X đi hàng y = 0, O đi hàng y = 10 (X thắng trước). */
const script = (k) => (k % 2 === 0 ? [k / 2, 0] : [(k - 1) / 2, 10]);
async function playOut(a, b, swap2 = false) {
  for (let guard = 0; guard < 40 && !a.room.winner; guard++) {
    const r = a.room;
    if (swap2 && r.phase === 'choose1') {
      const who = r.actor === a.me.id ? a : b, other = who === a ? b : a;
      const p = other.wait('room', (m) => !m.room.phase);
      await who.req({ t: 'swap', choice: 'o' }, 'room', (m) => !m.room.phase);
      await p;
      continue;
    }
    await play(a, b, ...script(r.moves.length));
  }
  assert.strictEqual(a.room.winner, 1, 'X thắng theo kịch bản');
  assert.ok(a.room.winCells && a.room.winCells.length >= 4);
}

async function pair(rule, opening = 'free') {
  const a = await Client.open('Bóng A'), b = await Client.open('Bóng B');
  await a.req({ t: 'createRoom', side: 'first', rule, opening }, 'room');
  const both = a.wait('room', (m) => m.room.players.length === 2);
  await b.req({ t: 'joinRoom', code: a.room.code, password: a.room.password }, 'room');
  await both;
  return [a, b];
}

test('ván thật qua máy chủ, cả 4 luật (đi lại, Swap2, tái đấu, nước cấm Renju): Rust khớp JS, 0 sai khác', async () => {
  const s = new RS.RulesShadow({ enabled: true });
  const old = RS.use(s);
  try {
    for (const rule of ['vn', 'free', 'std', 'renju']) {
      const [a, b] = await pair(rule);
      assert.strictEqual(a.room.rule, rule);
      // Đi lại một nước rồi đánh tiếp: bàn Rust dựng lại từ danh sách nước nên phải vẫn khớp
      await play(a, b, ...script(0)); await play(a, b, ...script(1)); await play(a, b, ...script(2));
      const x = a.room.seats.x === a.me.id ? a : b, o = x === a ? b : a;
      await x.req({ t: 'takeback' }, 'room', (m) => m.room.takebackOffer === x.me.id);
      const back = x.wait('room', (m) => m.room.moves.length === 2);
      await o.req({ t: 'takebackAnswer', accept: true }, 'room', (m) => m.room.moves.length === 2);
      await back;
      await playOut(a, b);
      // Tái đấu (đổi bên đi trước): ván mới, bàn mới
      await a.req({ t: 'rematch' }, 'room', (m) => m.room.rematch.length === 1);
      const fresh = a.wait('room', (m) => m.room.gameNo === 2 && m.room.moves.length === 0);
      await b.req({ t: 'rematch' }, 'room', (m) => m.room.gameNo === 2);
      await fresh;
      await playOut(a, b);
      [a, b].forEach((c) => c.close());
    }
    // Swap2: một người đặt cả X lẫn O, rồi chọn bên
    const [a, b] = await pair('std', 'swap2');
    await playOut(a, b, true);
    [a, b].forEach((c) => c.close());
    // Renju: nước 3-3 của X bị từ chối – bản Rust cũng phải báo cấm '33'
    const [r1, r2] = await pair('renju');
    const xs = [[1, 0], [2, 0], [0, 1], [0, 2]], os = [[9, 9], [9, 11], [11, 9], [12, 12]];
    for (let i = 0; i < 4; i++) { await play(r1, r2, ...xs[i]); await play(r1, r2, ...os[i]); }
    const e = await r1.req({ t: 'move', x: 0, y: 0 }, 'error');
    assert.match(e.msg, /cấm/);
    [r1, r2].forEach((c) => c.close());

    const st = s.stats();
    assert.strictEqual(st.state, 'on');
    assert.ok(st.checked > 60, 'đã so ' + st.checked + ' nước');
    assert.strictEqual(st.rejected, 1, 'nước cấm bị từ chối cũng được so');
    assert.strictEqual(st.wins, 9, '4 luật × 2 ván + Swap2');
    assert.strictEqual(st.mismatches, 0, JSON.stringify(st.recent));
    assert.strictEqual(st.errors, 0, String(st.lastError));
    assert.ok(st.avgMicros > 0 && st.avgMicros < 1000, 'trung bình ' + st.avgMicros + ' µs');
    // Xem qua GET /api/rum: cùng số đo, không lộ tên / id người chơi
    const res = await fetch(base + '/api/rum');
    const body = await res.json();
    assert.strictEqual(body.rulesShadow.checked, st.checked);
    assert.strictEqual(body.rulesShadow.mismatches, 0);
    assert.ok(!JSON.stringify(body).includes('Bóng'), 'không có tên người chơi');
  } finally {
    RS.use(old);
  }
});

// --- Bộ tính giả: luôn trả kết quả sai để thử đường ghi sai khác ---
function room(rule) {
  const r = new Room({ code: 't', rule });
  r.addPlayer({ id: 'A', name: 'Tên A' });
  r.addPlayer({ id: 'B', name: 'Tên B' });
  return r;
}
const winLine = (r) => { for (let i = 0; i < 5 && !r.winner; i++) { r.move(r.actor(), i, 0); if (!r.winner) r.move(r.actor(), i, 5); } };

test('sai khác giả: được đếm + ghi lại (luật, dãy nước, JS / Rust), báo log có giới hạn; ván vẫn theo JS', () => {
  let t = 1000;
  const logs = [];
  const fake = { compute: () => ({ forbidden: null, cells: null }) }; // luôn "không cấm, không thắng"
  const s = new RS.RulesShadow({ enabled: true, engine: fake, log: (m) => logs.push(m), now: () => t });
  const old = RS.use(s);
  try {
    const r = room('free');
    winLine(r);
    assert.strictEqual(r.winner, 1, 'JS vẫn quyết định: X thắng');
    assert.deepStrictEqual(r.winCells, [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]]);
    assert.strictEqual(r.reason, 'win');
    let st = s.stats();
    assert.strictEqual(st.checked, 9);
    assert.strictEqual(st.mismatches, 1);
    const m = st.recent[0];
    assert.strictEqual(m.rule, 'free');
    assert.deepStrictEqual(m.move, [4, 0]);
    assert.strictEqual(m.moves.length, 8);
    assert.deepStrictEqual(m.moves[0], [0, 0]);
    assert.deepStrictEqual(m.js.cells, [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]]);
    assert.strictEqual(m.rust.cells, null);
    assert.ok(!JSON.stringify(st).includes('Tên') && !JSON.stringify(st).includes('"A"'), 'không có tên / id người chơi');
    assert.strictEqual(logs.length, 1);
    assert.match(logs[0], /khác nhau.*free nước 9 \(4,0\)/);
    // Renju: JS từ chối nước 3-3, bộ tính giả nói không cấm -> sai khác, nước vẫn bị từ chối
    const rj = room('renju');
    for (const [x, y] of [[1, 0], [9, 9], [2, 0], [9, 11], [0, 1], [11, 9], [0, 2], [12, 12]]) rj.move(rj.actor(), x, y);
    assert.throws(() => rj.move('A', 0, 0), (e) => e.code === 'forbidden_move');
    assert.strictEqual(rj.board.moves.length, 8, 'nước cấm không được ghi');
    st = s.stats();
    assert.strictEqual(st.mismatches, 2);
    assert.strictEqual(st.rejected, 1);
    assert.deepStrictEqual(st.recent[1].js, { forbidden: '33', cells: null });
    assert.strictEqual(st.recent[1].applied, false);
    assert.strictEqual(logs.length, 1, 'trong 10 giây chỉ báo 1 dòng');
    t += 10001;
    const r2 = room('vn');
    winLine(r2);
    assert.strictEqual(logs.length, 2);
    assert.match(logs[1], /\+1 lần chưa báo/);
    // Chỉ giữ 20 chỗ gần nhất; stats() là bản sao
    for (let i = 0; i < 25; i++) winLine(room('std'));
    st = s.stats();
    assert.strictEqual(st.mismatches, 28);
    assert.strictEqual(st.recent.length, 20);
    st.recent[0].rule = 'đổi';
    assert.notStrictEqual(s.stats().recent[0].rule, 'đổi');
    s.reset();
    assert.strictEqual(s.stats().checked, 0);
  } finally {
    RS.use(old);
  }
});

test('lỗi trong đường chạy bóng bị bắt và đếm, không ném vào ván', () => {
  let calls = 0;
  const boom = { compute: () => { calls++; if (calls === 2) throw 'chuỗi lỗi'; throw new Error('hỏng'); } };
  const s = new RS.RulesShadow({ enabled: true, engine: boom, log: () => { throw new Error('log cũng hỏng'); } });
  const old = RS.use(s);
  try {
    const r = room('std');
    winLine(r);
    assert.strictEqual(r.winner, 1);
    const st = s.stats();
    assert.strictEqual(st.errors, 9);
    assert.strictEqual(st.checked, 0);
    assert.strictEqual(st.lastError, 'hỏng');
    // log ném lỗi khi báo sai khác cũng không lọt ra
    const s2 = new RS.RulesShadow({ enabled: true, engine: { compute: () => ({ forbidden: '44', cells: null }) }, log: () => { throw new Error('x'); } });
    s2.observe('renju', [], true, 0, 0, 1, null, null);
    assert.strictEqual(s2.stats().mismatches, 1);
    assert.strictEqual(s2.stats().errors, 0);
  } finally {
    RS.use(old);
  }
});

test('không nạp được file .wasm: tự tắt, log đúng một lần, ván vẫn chạy', () => {
  const logs = [];
  const s = new RS.RulesShadow({ enabled: true, wasmFile: path.join(__dirname, 'khong-co.wasm'), log: (m) => logs.push(m) });
  assert.strictEqual(s.stats().state, 'idle');
  const old = RS.use(s);
  try {
    const r = room('renju');
    winLine(r);
    winLine(room('vn'));
    assert.strictEqual(r.winner, 1);
    const st = s.stats();
    assert.strictEqual(st.state, 'unavailable');
    assert.strictEqual(st.checked, 0);
    assert.strictEqual(st.errors, 0);
    assert.match(st.lastError, /ENOENT/);
    assert.strictEqual(logs.length, 1);
    assert.match(logs[0], /khong-co\.wasm.*tắt chạy bóng/);
    // log hỏng lúc nạp cũng không lọt ra
    const s2 = new RS.RulesShadow({ enabled: true, wasmFile: __filename, log: () => { throw new Error('x'); } });
    s2.observe('vn', [{ x: 0, y: 0, p: 1 }], true, 0, 0, 1, null, null);
    assert.strictEqual(s2.stats().state, 'unavailable', 'file không phải wasm');
  } finally {
    RS.use(old);
  }
});

test('CARO_RULES_SHADOW=0 tắt hẳn; mặc định bật', () => {
  const was = process.env.CARO_RULES_SHADOW;
  try {
    process.env.CARO_RULES_SHADOW = '0';
    const off = new RS.RulesShadow();
    assert.strictEqual(off.stats().enabled, false);
    assert.strictEqual(off.stats().state, 'off');
    const old = RS.use(off);
    try { winLine(room('vn')); } finally { RS.use(old); }
    assert.strictEqual(off.stats().checked, 0);
    delete process.env.CARO_RULES_SHADOW;
    const on = new RS.RulesShadow();
    assert.strictEqual(on.stats().enabled, true);
    on.observe('vn', [{ x: 0, y: 0, p: 1 }], true, 0, 0, 1, null, null);
    assert.strictEqual(on.stats().state, 'on');
    assert.strictEqual(on.stats().checked, 1);
    assert.strictEqual(on.stats().mismatches, 0);
  } finally {
    if (was === undefined) delete process.env.CARO_RULES_SHADOW; else process.env.CARO_RULES_SHADOW = was;
  }
});

test('bộ tính WASM thật: bàn dựng lại báo lỗi khi danh sách nước hỏng; loader nạp được bản của máy chủ', async () => {
  const eng = RS.wasmEngine();
  assert.deepStrictEqual(eng.compute('renju', [{ x: 1, y: 0, p: 1 }, { x: 2, y: 0, p: 1 }, { x: 0, y: 1, p: 1 }, { x: 0, y: 2, p: 1 }], 4, 0, 0, 1, false),
    { forbidden: '33', cells: null });
  assert.throws(() => eng.compute('vn', [{ x: 0, y: 0, p: 1 }, { x: 0, y: 0, p: 2 }], 2, 1, 1, 1, true), /replay_failed/);
  assert.throws(() => eng.compute('vn', [{ x: 0, y: 0, p: 1 }], 1, 0, 0, 2, true), /play_failed/);
  // loadSync / load mặc định: bản vừa dựng cạnh loader, không có thì server/vendor/caro_rules.wasm
  const R = Wasm.loadSync();
  const b = new R.Board('vn');
  for (let i = 0; i < 4; i++) b.play(i, 0, R.X);
  assert.strictEqual(R.checkWin(b, 3, 0, R.X).length, 4);
  b.free();
  const R2 = await Wasm.load(RS.WASM_FILE);
  assert.deepStrictEqual(R2.checkWinMoves('free', [[0, 0], [0, 9], [1, 0], [1, 9], [2, 0], [2, 9], [3, 0], [3, 9], [4, 0]]).length, 5);
});
