/*
 * Kiểm tra mẫu hình (engine-patterns.js), phòng thủ bắt buộc / thắng nhanh (engine.js) và VCT (engine-vct.js).
 *   node caro/tests/engine-patterns.test.js
 */
'use strict';
const assert = require('assert');
const C = require('../rules.js');
globalThis.Caro = C;
const E = require('../engine.js');
const PT = require('../engine-patterns.js');
const { X, O } = C;
const { P4 } = PT;
const RULES = ['vn', 'free', 'std', 'renju'];

function seeded(s) { return () => { s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff; return s / 0x7fffffff; }; }

/** Ván ngẫu nhiên (quân gần nhau, dừng trước khi có người thắng), hợp lệ theo luật. */
function randomGame(rule, rng, n) {
  const b = new C.Board(rule), mv = [];
  for (let k = 0; k < n * 3 && mv.length < n; k++) {
    const x = Math.floor(rng() * 9) - 4, y = Math.floor(rng() * 9) - 4;
    const p = mv.length % 2 ? O : X;
    if (b.get(x, y) || C.forbidden(b, x, y, p)) continue;
    b.play(x, y, p);
    if (C.checkWin(b, x, y, p)) { b.put(x, y, C.EMPTY); break; }
    mv.push([x, y]);
  }
  return mv;
}

/** Ô trống i, bên p đánh vào có tạo ô thắng mới không (đặt thật rồi lùi). */
function makesWin(pos, i, p) {
  const c0 = pos.count;
  pos.count = p === X ? 0 : 1;
  pos.play(i, p);
  const made = pos.winCount[p] > 0;
  pos.undo();
  pos.count = c0;
  return made;
}

const tests = {
  'mẫu đường: bảng tra đúng các hình cơ bản (luật tự do)'() {
    const T = PT.table('free', true);
    const key = (s) => { let k = 0, pw = 1; for (const ch of s) { k += (ch === 'x' ? 1 : ch === 'o' ? 2 : 0) * pw; pw *= 3; } return k; };
    // 11 ô, ô giữa (chỉ số 5) là ô vừa đánh – để trống trong mã
    assert.strictEqual(PT.lookup(T, key('...xx.xx...'), 'free', true), PT.F5);
    assert.strictEqual(PT.lookup(T, key('....x.xx...'), 'free', true), PT.F4); // _xXxx_ → bốn mở
    assert.strictEqual(PT.lookup(T, key('...ox.xx...'), 'free', true), PT.B4);
    assert.strictEqual(PT.lookup(T, key('....x.x....'), 'free', true), PT.F3S); // _xXx_ → hai cách thành bốn mở
    assert.strictEqual(PT.lookup(T, key('....x..x...'), 'free', true), PT.F3);
    assert.strictEqual(PT.lookup(T, key('...ox.x....'), 'free', true), PT.B3);
    assert.strictEqual(PT.lookup(T, key('......x....'), 'free', true), PT.F2);
    // Luật tiêu chuẩn: thành 6 không thắng; luật Việt Nam: 5 bị chặn hai đầu không thắng
    assert.notStrictEqual(PT.lookup(PT.table('std', true), key('..xxx.xx...'), 'std', true), PT.F5);
    assert.notStrictEqual(PT.lookup(PT.table('vn', true), key('..oxx.xxo..'), 'vn', true), PT.F5);
    assert.strictEqual(PT.combine(PT.B4, PT.B4, 0, 0), P4.B_FLEX4);
    assert.strictEqual(PT.combine(PT.B4, PT.F3, 0, 0), P4.C_BLOCK4_FLEX3);
    assert.strictEqual(PT.combine(PT.F3, PT.F3S, 0, 0), P4.F_FLEX3_2X);
  },
  'mẫu hình cập nhật dần (đi / lùi) = tính lại từ đầu; ô "bốn" = ô tạo ô thắng mới; ô thắng = winDir (4 luật)'() {
    const rng = seeded(5);
    let checked = 0, fours = 0;
    for (const rule of RULES) {
      for (let g = 0; g < 12; g++) {
        const mv = randomGame(rule, rng, 34);
        const pos = new E.Position(mv.slice(0, 2), rule);
        for (let k = 2; k < mv.length; k++) {
          pos.play(pos.idx(mv[k][0], mv[k][1]), pos.side);
          if (k % 5 === 0) { pos.undo(); pos.play(pos.idx(mv[k][0], mv[k][1]), pos.side); }
        }
        const fresh = new E.Position(mv, rule);
        for (let i = 0; i < pos.cells.length; i++) {
          const [x, y] = pos.xy(i), j = fresh.idx(x, y);
          for (const p of [X, O]) {
            assert.strictEqual(pos.p4[p][i], fresh.p4[p][j], `${rule} p4 (${x},${y})`);
            if (pos.cells[i]) continue;
            for (let d = 0; d < 4; d++) assert.strictEqual((pos.win[p][i] >> d) & 1, pos.winDir(i % pos.W, (i / pos.W) | 0, p, d) ? 1 : 0);
            if (!pos.near[i] || pos.winCount[p] || (rule === 'renju' && p === X && pos.forbidden(i, X))) continue;
            const v = pos.p4[p][i];
            assert.strictEqual(v >= P4.E_BLOCK4 && v !== P4.A_FIVE, makesWin(pos, i, p), `${rule} ô bốn (${x},${y}) bên ${p} sau ${JSON.stringify(mv)}`);
            checked++; if (v >= P4.E_BLOCK4) fours++;
          }
        }
        for (const p of [X, O]) {
          const cnt = new Array(13).fill(0);
          for (let i = 0; i < pos.cells.length; i++) cnt[pos.p4[p][i]]++;
          for (let v = 1; v < 13; v++) assert.strictEqual(pos.p4cnt[p][v], cnt[v], `${rule} đếm mẫu ${v}`);
        }
      }
    }
    assert.ok(checked > 5000 && fours > 30, `${checked} ô, ${fours} ô bốn`);
  },
  'phòng thủ bắt buộc: chặn ba mở = mọi nước làm đối thủ hết ô bốn mở, cộng nước bốn của mình'() {
    // Luật tự do: X có ba mở _XXX_ ngang, O tới lượt; O có 2 quân rời rạc
    const mv = [[0, 0], [5, 5], [1, 0], [5, 7], [2, 0]];
    const pos = new E.Position(mv, 'free');
    assert.ok(pos.p4cnt[X][P4.B_FLEX4] > 0);
    const def = pos.threatDefense(O);
    const set = new Set(def.map((i) => pos.xy(i).join()));
    for (const c of ['-1,0', '3,0']) assert.ok(set.has(c), 'thiếu ô chặn ' + c);
    // Đúng bằng vét cạn
    for (let i = 0; i < pos.cells.length; i++) {
      if (pos.cells[i]) continue;
      pos.play(i, O);
      const ok = !pos.p4cnt[X][P4.B_FLEX4];
      pos.undo();
      assert.strictEqual(set.has(pos.xy(i).join()), ok, 'ô ' + pos.xy(i));
    }
    // Thắng nhanh: bên X tới lượt (ba mở, O không có nước bốn) → thắng chắc sau 2 nước
    const q = new E.Position([[0, 0], [5, 5], [1, 0], [5, 7], [2, 0], [9, 9]], 'free');
    assert.ok(q.quickWin(X) && !q.quickWin(O));
  },
  'VCT: hai "hai" giao nhau → ba kép (không có chuỗi bốn) – tìm thấy và đúng ở luật tự do / tiêu chuẩn'() {
    const mv = [[1, 0], [10, 10], [2, 0], [10, 12], [0, 1], [12, 10], [0, 2], [12, 12]];
    for (const rule of ['free', 'std']) {
      const pos = new E.Position(mv, rule);
      assert.strictEqual(pos.threatMoves(X).length, 0, 'không có nước bốn');
      const r = E.analyse(mv, { ms: 600, rule });
      assert.ok(r.mate > 0, JSON.stringify(r));
      // Đánh tiếp: bên thủ đánh bất kỳ cách nào (engine thuần), bên công vẫn thắng
      const b = new C.Board(rule); mv.forEach(([x, y], i) => b.play(x, y, i % 2 ? O : X));
      const m = mv.slice();
      let winner = 0;
      for (let t = 0; t < 20 && !winner; t++) {
        const p = m.length % 2 ? O : X;
        const n = E.analyse(m, { ms: 200, rule }).move;
        b.play(n[0], n[1], p); m.push(n);
        if (C.checkWin(b, n[0], n[1], p)) winner = p;
      }
      assert.strictEqual(winner, X, rule);
    }
  },
  'chấm điểm luật tiêu chuẩn cộng điểm mẫu chéo; lối đánh vẫn nhất quán (đổi dấu theo bên)'() {
    const mv = [[0, 0], [5, 5], [1, 0], [5, 6], [2, 0], [9, 9]];
    const a = new E.Position(mv, 'std');
    const [ax, dx, ao, dO] = a.acc, s = a.side;
    assert.ok(a.ev.pa && a.patScore(X, true) !== 0);
    assert.strictEqual(a.evaluate(), Math.round(s === X ? ax - dO : ao - dx) + a.patScore(s, true) - a.patScore(3 - s, false) + a.ev.tempo);
    const st = new E.Position(mv, 'std');
    st.style = { a: 1.2, d: 0.9, dbl: 1, trap: 1 };
    st.rootSide = st.side;
    const e0 = st.evaluate();
    st.play(st.candidates(st.side, 1)[0], st.side);
    assert.ok(Number.isFinite(e0) && Number.isFinite(st.evaluate()));
    const r = E.analyse(mv, { ms: 150, rule: 'std', style: st.style });
    assert.ok(r.move && r.move.length === 2);
  },
  'VCT ở gốc + kiểm nước định đi: nước luôn hợp lệ, không cấm, ở mọi luật'() {
    const rng = seeded(9);
    for (const rule of RULES) {
      for (let g = 0; g < 4; g++) {
        const mv = randomGame(rule, rng, 16);
        const r = E.analyse(mv, { ms: 120, rule });
        assert.ok(r.move && r.move.length === 2, rule);
        const b = new C.Board(rule); mv.forEach(([x, y], i) => b.play(x, y, i % 2 ? O : X));
        assert.strictEqual(b.get(r.move[0], r.move[1]), C.EMPTY);
        assert.ok(!C.forbidden(b, r.move[0], r.move[1], mv.length % 2 ? O : X));
      }
    }
  },
};

let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
  try { fn(); console.log('✓ ' + name); } catch (e) { failed++; console.log('✗ ' + name + '\n   ' + e.message); }
}
console.log(failed ? `${failed} bài kiểm tra lỗi` : 'Tất cả đều đạt');
process.exit(failed ? 1 : 0);
