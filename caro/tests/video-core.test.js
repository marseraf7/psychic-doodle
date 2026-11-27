// Kiểm thử phần thuần của video ngắn 9:16 (caro/video-core.js): vùng an toàn, bố cục, định dạng ghi, tên file, lịch cảnh,
// tốc độ tua, chuỗi nước thắng của câu đố, tên miền thẻ kết, ngắt chữ, gắn thời lượng WebM.
// Chạy: node --test caro/tests/video-core.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const V = require('../video-core.js');
const C = require('../rules.js');
const A = require('../analysis.js');
const PUZZLES = require('../puzzles.json');

const inside = (r, s) => r.x >= s.x && r.y >= s.y && r.x + r.w <= s.x + s.w && r.y + r.h <= s.y + s.h;

test('khung 1080×1920, 30 khung/giây; vùng an toàn chừa 12% trên, 20% dưới, 15% bên phải', () => {
  assert.strictEqual(V.W, 1080);
  assert.strictEqual(V.H, 1920);
  assert.strictEqual(V.FPS, 30);
  const s = V.safeArea();
  assert.ok(s.y >= 1920 * 0.12 && s.y + s.h <= 1920 * 0.8, 'trên / dưới');
  assert.ok(s.x + s.w <= 1080 * 0.85, 'bên phải');
  assert.ok(s.x > 0 && s.w > 800, 'còn đủ rộng cho bàn cờ');
});

test('bố cục: tiêu đề, bàn cờ (vuông), chú thích, thẻ kết đều nằm trọn trong vùng an toàn, không chồng nhau', () => {
  for (const [w, h] of [[1080, 1920], [720, 1280]]) {
    const L = V.layout(w, h);
    for (const k of ['head', 'board', 'cap', 'end']) assert.ok(inside(L[k], L.safe), `${k} trong vùng an toàn (${w}×${h})`);
    assert.strictEqual(L.board.w, L.board.h);
    assert.ok(L.head.y + L.head.h <= L.board.y && L.board.y + L.board.h <= L.cap.y, 'thứ tự trên → dưới');
    assert.ok(L.cap.h >= 150 * (w / 1080), 'chú thích đủ cao cho chữ to');
  }
});

test('chọn định dạng: MP4 H.264 trước, rồi WebM VP9 → VP8; không có gì thì chuỗi rỗng; isTypeSupported ném lỗi thì bỏ qua', () => {
  assert.match(V.pickMime(() => true), /^video\/mp4;codecs=avc1/);
  assert.strictEqual(V.pickMime((m) => m === 'video/mp4'), 'video/mp4');
  assert.strictEqual(V.pickMime((m) => m.startsWith('video/webm')), 'video/webm;codecs=vp9');
  assert.strictEqual(V.pickMime((m) => m === 'video/webm;codecs=vp8'), 'video/webm;codecs=vp8');
  assert.strictEqual(V.pickMime(() => false), '');
  assert.strictEqual(V.pickMime((m) => { if (m.includes('avc1')) throw new Error('lạ'); return m === 'video/webm'; }), 'video/webm');
  const idx = (m) => V.MIMES.indexOf(m);
  assert.ok(idx('video/mp4') < idx('video/webm;codecs=vp9') && idx('video/webm;codecs=vp9') < idx('video/webm;codecs=vp8'));
});

test('đuôi file và tên file đúng loại bản ghi', () => {
  assert.strictEqual(V.extOf('video/mp4;codecs=avc1.64002a'), 'mp4');
  assert.strictEqual(V.extOf('video/webm;codecs=vp9'), 'webm');
  assert.strictEqual(V.extOf(''), 'webm');
  assert.strictEqual(V.baseMime('video/mp4;codecs=avc1'), 'video/mp4');
  assert.strictEqual(V.baseMime('video/x-matroska;codecs=avc1'), 'video/webm');
  assert.strictEqual(V.fileName('puzzle', 12, 'video/mp4'), 'caro-puzzle-12.mp4');
  assert.strictEqual(V.fileName('game', 'aB3/../x y', 'video/webm;codecs=vp8'), 'caro-game-aB3xy.webm');
  assert.strictEqual(V.fileName('', null, 'video/mp4'), 'caro-video-x.mp4');
  assert.ok(V.fileName('game', 'x'.repeat(100), 'video/mp4').length < 50, 'mã dài bị cắt');
});

test('tốc độ tua: mỗi nước 0,25–1 giây, cả ván ≤ 40 giây', () => {
  assert.strictEqual(V.moveStep(10), 1);
  assert.strictEqual(V.moveStep(40), 1);
  assert.strictEqual(V.moveStep(80), 0.5);
  assert.strictEqual(V.moveStep(160), 0.25);
  assert.strictEqual(V.moveStep(0), 1);
  for (const n of [1, 9, 41, 99, 160, 161, 225, 400]) {
    const s = V.moveStep(n);
    assert.ok(s * n <= 40 + 1e-9, `${n} nước ≤ 40 giây`);
    assert.ok(s <= 1 && (n > 160 || s >= 0.25), `${n} nước: ${s} giây/nước`);
  }
});

test('ván đấu: tên hai bên → tua → dừng ở 5 quân thắng (lâu hơn) → thẻ kết 3 giây', () => {
  const tl = V.gameTimeline(45, true);
  assert.deepStrictEqual(tl.scenes.map((s) => s.id), ['intro', 'play', 'win', 'outro']);
  const play = tl.scenes[1], win = tl.scenes[2], out = tl.scenes[3];
  assert.ok(play.dur <= 40 && Math.abs(play.dur - 45 * V.moveStep(45)) < 1e-9);
  assert.ok(win.dur > V.gameTimeline(45, false).scenes[2].dur, 'có 5 quân thắng: dừng lâu hơn');
  assert.strictEqual(out.dur, 3);
  assert.ok(Math.abs(tl.total - (out.start + out.dur)) < 1e-9);
  assert.ok(V.gameTimeline(300, true).total <= 48, 'ván rất dài vẫn gọn');
  const fast = V.gameTimeline(45, true, 4);
  assert.ok(Math.abs(fast.total - tl.total / 4) < 1e-9 && Math.abs(fast.scenes[1].step - play.step / 4) < 1e-9, 'chế độ thử nhanh');
});

test('câu đố: thế cờ → đếm ngược 3 giây → đáp án → chuỗi thắng → 5 quân → thẻ kết; ~12–17 giây', () => {
  for (const L of [3, 5, 9, 13]) {
    const tl = V.puzzleTimeline(L, true);
    assert.deepStrictEqual(tl.scenes.map((s) => s.id), ['intro', 'think', 'reveal', 'line', 'win', 'outro']);
    assert.strictEqual(tl.scenes[1].dur, 3, 'đếm ngược đúng 3 giây');
    assert.ok(tl.total >= 12 && tl.total <= 17, `${L} nước: ${tl.total} giây`);
  }
  const no = V.puzzleTimeline(1, false);
  assert.deepStrictEqual(no.scenes.map((s) => s.id), ['intro', 'think', 'reveal', 'outro'], 'không có chuỗi: chỉ lật nước đầu');
  assert.ok(no.total >= 11 && no.total <= 13);
});

test('cảnh ở giây t và số nước đã hiện', () => {
  const tl = V.gameTimeline(10, true);
  assert.strictEqual(V.sceneAt(tl, 0).scene.id, 'intro');
  const p = V.sceneAt(tl, 1.5);
  assert.strictEqual(p.scene.id, 'play');
  assert.strictEqual(V.shownAt(p.scene, p.local), 1, 'nước 1 hiện ngay đầu cảnh');
  const q = V.sceneAt(tl, 1.5 + 4.5);
  assert.strictEqual(V.shownAt(q.scene, q.local), 5);
  assert.strictEqual(V.shownAt(p.scene, 999), 10, 'không quá số nước');
  const end = V.sceneAt(tl, tl.total + 5);
  assert.strictEqual(end.scene.id, 'outro');
  assert.strictEqual(end.frac, 1);
  assert.strictEqual(V.shownAt({ id: 'x' }, 3), 0);
});

test('khung bàn cờ: chứa mọi quân (+2 ô), vuông, tối thiểu 9 ô; bàn lớn chỉ lấy vùng có quân', () => {
  const b = V.boxFor([[0, 0], [1, 1]]);
  assert.strictEqual(b.x1 - b.x0 + 1, 9);
  assert.strictEqual(b.y1 - b.y0 + 1, 9);
  const far = [[100, 100], [112, 103], [105, 90]];
  const f = V.boxFor(far);
  for (const [x, y] of far) assert.ok(x - 2 >= f.x0 && x + 2 <= f.x1 && y - 2 >= f.y0 && y + 2 <= f.y1);
  assert.strictEqual(f.x1 - f.x0, f.y1 - f.y0, 'vuông');
  assert.ok(f.x0 >= 80 && f.x1 - f.x0 + 1 <= 20, 'không kéo về gốc toạ độ');
  const e = V.boxFor([]);
  assert.strictEqual(e.x1 - e.x0 + 1, 9);
  // Quân rải rất xa (máy chủ cho tới ±512): giới hạn max ô quanh nước cuối – ô không teo về 0 điểm ảnh, canvas không khổng lồ
  const wide = [[-500, -500], [3, 4], [500, 480], [10, 12]];
  const w = V.boxFor(wide, 9, 41);
  assert.strictEqual(w.x1 - w.x0 + 1, 41);
  assert.strictEqual(w.y1 - w.y0 + 1, 41);
  assert.ok(w.x0 <= 10 && w.x1 >= 10 && w.y0 <= 12 && w.y1 >= 12, 'chứa nước cuối');
  assert.deepStrictEqual(V.boxFor(far, 9, 41), f, 'ván bình thường: max không đổi gì');
});

test('nước của ván hỏng: chỉ giữ phần đầu hợp lệ (cặp số nguyên), giữ đúng thứ tự X / O', () => {
  assert.deepStrictEqual(V.validMoves([[0, 0], [1, 1], null, [2, 2]]), [[0, 0], [1, 1]]);
  assert.deepStrictEqual(V.validMoves([[0, 0], ['a', 1]]), [[0, 0]]);
  assert.deepStrictEqual(V.validMoves([[0, 0], [1.5, 2]]), [[0, 0]]);
  assert.deepStrictEqual(V.validMoves([[0, 0], [NaN, 2]]), [[0, 0]]);
  assert.deepStrictEqual(V.validMoves([[0, 0], [5, 5, 1]]), [[0, 0], [5, 5]]);
  assert.deepStrictEqual(V.validMoves('x'), []);
  assert.deepStrictEqual(V.validMoves(null), []);
});

test('chuỗi thắng của câu đố (cách "Xem lời giải" của trình luyện): bắt đầu bằng nước đáp án, kết thúc 5 quân', () => {
  const sample = PUZZLES.filter((q, i) => i % 12 === 0); // ~30 bài rải đều các loại
  for (const q of sample) {
    const r = V.solveLine(C, A, q.m, q.sol, q.rule, 600);
    assert.ok(r.won, `bài #${q.id} có chuỗi thắng`);
    assert.deepStrictEqual(r.line[0], q.sol);
    assert.strictEqual(r.line.length % 2, 1, 'bên công đi nước cuối');
    const b = new C.Board(q.rule || 'vn');
    q.m.concat(r.line).forEach((m, i) => b.play(m[0], m[1], i % 2 ? C.O : C.X));
    const last = r.line[r.line.length - 1], p = q.m.length % 2 ? C.O : C.X;
    assert.ok(C.checkWin(b, last[0], last[1], p), `bài #${q.id}: nước cuối là 5 quân`);
  }
  // Không tìm được (nước đáp án đã có quân): chỉ còn nước đầu, không thắng
  const q = PUZZLES[0];
  const bad = V.solveLine(C, A, q.m, q.m[0], q.rule, 50);
  assert.strictEqual(bad.won, false);
  assert.deepStrictEqual(bad.line, [q.m[0]]);
  assert.deepStrictEqual(V.solveLine(C, A, q.m, null, q.rule, 50), { line: [], won: false });
});

test('tên miền thẻ kết: máy chủ của app (CARO_SERVER) trước, không thì tên miền trang đang mở', () => {
  assert.strictEqual(V.siteHost({ host: 'game.example' }, ''), 'game.example');
  assert.strictEqual(V.siteHost({ host: 'localhost' }, 'https://srv.example/'), 'srv.example');
  assert.strictEqual(V.siteHost({ host: 'www.game.example' }, null), 'game.example');
  assert.strictEqual(V.siteHost({ host: 'x' }, 'http://a.example:8080/path'), 'a.example:8080');
  assert.strictEqual(V.siteHost(null, ''), '');
});

test('ngắt chữ: theo từ, theo ký tự với chữ Hán; quá số dòng thì "…"; cỡ chữ thu vừa dòng', () => {
  const m = (t) => t.length * 10;
  assert.deepStrictEqual(V.wrap('một hai ba bốn', 70, 3, m), ['một hai', 'ba bốn']);
  assert.deepStrictEqual(V.wrap('五子棋对局精彩', 30, 3, m), ['五子棋', '对局精', '彩']);
  const cut = V.wrap('aa bb cc dd ee ff', 50, 2, m);
  assert.strictEqual(cut.length, 2);
  assert.ok(cut[1].endsWith('…') && m(cut[1]) <= 50);
  assert.deepStrictEqual(V.wrap('averyveryverylongdomain.example', 100, 4, m).map((l) => l.length), [10, 10, 10, 1], 'từ dài cắt theo ký tự');
  assert.deepStrictEqual(V.wrap('', 100, 2, m), []);
  assert.deepStrictEqual(V.wrap(null, 100, 2, m), []);
  // Cắt để thêm "…" không được tách đôi ký tự ngoài BMP (emoji trong tên / chữ): không còn nửa cặp surrogate
  const lone = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
  const emo = V.wrap('ab😀😀 cd', 45, 1, m);
  assert.ok(!lone.test(emo[0]) && emo[0].endsWith('…'), 'emoji: ' + JSON.stringify(emo));
  const at = (t, z) => t.length * z * 0.5;
  assert.strictEqual(V.fitSize('abcdefghij', 400, 84, 40, at), 80);
  assert.strictEqual(V.fitSize('abc', 400, 84, 40, at), 84);
  assert.strictEqual(V.fitSize('x'.repeat(100), 400, 84, 40, at), 40, 'không nhỏ hơn mức tối thiểu');
});

// ---------------------------------------------------------------- WebM
const vint = (n) => { // kích thước EBML 8 byte
  const b = [0x01]; for (let i = 6; i >= 0; i--) b.push(Math.floor(n / Math.pow(256, i)) % 256); return b;
};
function fakeWebm({ withDuration = false, scale = 1000000 } = {}) {
  const ebml = [0x1a, 0x45, 0xdf, 0xa3, 0x84, 0x42, 0x86, 0x81, 0x01]; // EBML header (EBMLVersion = 1)
  const ts = [0x2a, 0xd7, 0xb1, 0x83, (scale >> 16) & 255, (scale >> 8) & 255, scale & 255];
  const muxing = [0x4d, 0x80, 0x82, 0x43, 0x68]; // MuxingApp "Ch"
  const dur = withDuration ? [0x44, 0x89, 0x84, 0x45, 0x9c, 0x40, 0x00] : [];
  const infoBody = [...ts, ...muxing, ...dur];
  const info = [0x15, 0x49, 0xa9, 0x66, 0x80 | infoBody.length, ...infoBody];
  const cluster = [0x1f, 0x43, 0xb6, 0x75, 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xe7, 0x81, 0x00]; // kích thước "không biết"
  const segment = [0x18, 0x53, 0x80, 0x67, 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, ...info, ...cluster];
  return new Uint8Array([...ebml, ...segment]);
}
function readDuration(u) {
  for (let i = 0; i + 11 <= u.length; i++) {
    if (u[i] === 0x44 && u[i + 1] === 0x89 && u[i + 2] === 0x88) return new DataView(u.buffer, u.byteOffset + i + 3, 8).getFloat64(0);
  }
  return null;
}

test('WebM: chèn Duration vào Info (đơn vị TimecodeScale), giữ nguyên phần còn lại', () => {
  const src = fakeWebm();
  const out = V.fixWebmDuration(src, 12345);
  assert.strictEqual(out.length, src.length + 11 + 7, 'thêm 11 byte Duration + kích thước Info ghi bằng 8 byte');
  assert.strictEqual(readDuration(out), 12345);
  // Kích thước mới của Info khớp nội dung
  const at = out.indexOf(0x15);
  assert.deepStrictEqual([...out.subarray(at, at + 4)], [0x15, 0x49, 0xa9, 0x66]);
  const size = [...out.subarray(at + 5, at + 12)].reduce((a, b) => a * 256 + b, 0);
  assert.strictEqual(out[at + 4], 0x01);
  assert.strictEqual(size, 7 + 5 + 11);
  assert.deepStrictEqual([...out.subarray(out.length - 15)], [...src.subarray(src.length - 15)], 'Cluster giữ nguyên');
  // TimecodeScale khác 1 ms
  assert.strictEqual(readDuration(V.fixWebmDuration(fakeWebm({ scale: 500000 }), 1000)), 2000);
});

test('WebM: đã có Duration, không phải WebM hoặc file hỏng thì trả lại nguyên bản', () => {
  const had = fakeWebm({ withDuration: true });
  assert.strictEqual(V.fixWebmDuration(had, 5000), had);
  const junk = new Uint8Array([1, 2, 3, 4, 5]);
  assert.strictEqual(V.fixWebmDuration(junk, 5000), junk);
  const cut = fakeWebm().subarray(0, 14);
  assert.strictEqual(V.fixWebmDuration(cut, 5000).length, cut.length);
  assert.strictEqual(V.fixWebmDuration(new Uint8Array(0), 1).length, 0);
  assert.strictEqual(V.fixWebmDuration(fakeWebm().buffer, 1000).length, fakeWebm().length + 18, 'nhận cả ArrayBuffer');
  // Segment có kích thước đã biết: chèn byte sẽ làm Segment sai kích thước (file hỏng) – giữ nguyên
  const known = fakeWebm();
  known.set([0x01, 0, 0, 0, 0, 0, 0, known.length - 21], 13); // kích thước Segment = phần còn lại sau 21 byte đầu
  assert.strictEqual(V.fixWebmDuration(known, 5000), known);
  // Info bị cắt cụt (file ghi dở): không đọc quá cuối file, giữ nguyên
  const short = fakeWebm().subarray(0, 30);
  assert.strictEqual(V.fixWebmDuration(short, 5000), short);
});
