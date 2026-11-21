/*
 * Lớp học / Nghiên cứu (C2) – cây nước đi của một chương (không đụng DOM; dùng chung trình duyệt + máy chủ):
 *   chương: { id, name, rule, setup: [[x, y], …] (thế cờ ban đầu, X đi trước), root: nút gốc }
 *   nút:    { m: [x, y] (nút gốc không có), c: lời bình (văn bản có định dạng – CaroRich), s: hình vẽ [{ k: 'm', x, y } dấu ô |
 *            { k: 'a', x0, y0, x1, y1 } mũi tên], ch: [con…] (con đầu = nhánh chính, các con sau = biến) }
 *   đường (path): mảng chỉ số con từ gốc, vd. [0, 0, 1] = nước 1 chính, nước 2 chính, nước 3 theo biến thứ hai.
 * clean(chương) làm sạch dữ liệu từ máy khách: trần số nút / hình / độ dài lời bình, nước phải hợp lệ (ô trống, trong
 * phạm vi), không đi tiếp sau nước thắng. Máy chủ (hub/classroom.js) gọi với cleanText = cleanRich của hub/shared.js.
 * UMD: trình duyệt window.CaroClassTree, Node module.exports.
 */
(function (global) {
  'use strict';
  const Caro = typeof module !== 'undefined' && module.exports ? require('./rules.js') : global.Caro;
  const LIMITS = { nodes: 2000, setup: 400, shapes: 24, comment: 2000, name: 60, coord: 512, depth: 600 };

  const newChapter = (name, rule, id) => ({ id: id || Math.random().toString(36).slice(2, 10), name: String(name || '').slice(0, LIMITS.name), rule: Caro.ruleOf(rule), setup: [], root: { ch: [] } });

  function nodeAt(root, path) {
    let n = root;
    for (const i of path || []) { n = n && n.ch && n.ch[i]; if (!n) return null; }
    return n;
  }
  /** Các nước từ thế ban đầu tới nút ở path (gồm setup). */
  function movesAt(ch, path) {
    const out = (ch.setup || []).slice();
    let n = ch.root;
    for (const i of path || []) { n = n.ch[i]; if (!n) break; out.push(n.m); }
    return out;
  }
  /** Đánh nước [x, y] sau nút ở path: có sẵn thì đi theo, chưa có thì thêm biến mới. → path mới. */
  function addMove(root, path, m) {
    const n = nodeAt(root, path);
    if (!n) return null;
    n.ch = n.ch || [];
    let i = n.ch.findIndex((c) => c.m[0] === m[0] && c.m[1] === m[1]);
    if (i < 0) { n.ch.push({ m: [m[0], m[1]], ch: [] }); i = n.ch.length - 1; }
    return [...path, i];
  }
  /** Xoá nút ở path (cùng mọi nước sau nó). → path của nút cha. */
  function remove(root, path) {
    if (!path || !path.length) return [];
    const parent = nodeAt(root, path.slice(0, -1));
    if (parent && parent.ch) parent.ch.splice(path[path.length - 1], 1);
    return path.slice(0, -1);
  }
  /** Đưa biến ở path lên làm nhánh chính của nút cha. → path mới. */
  function promote(root, path) {
    if (!path || !path.length) return path;
    const parent = nodeAt(root, path.slice(0, -1));
    const i = path[path.length - 1];
    if (!parent || !parent.ch[i] || !i) return path;
    const [n] = parent.ch.splice(i, 1);
    parent.ch.unshift(n);
    return [...path.slice(0, -1), 0];
  }
  /** Đường chính tiếp theo (Tiến) / lùi một nước. */
  const next = (root, path) => { const n = nodeAt(root, path); return n && n.ch && n.ch.length ? [...path, 0] : path; };
  const prev = (path) => (path.length ? path.slice(0, -1) : path);
  function count(root) { let k = 0; const walk = (n) => { for (const c of n.ch || []) { k++; walk(c); } }; walk(root); return k; }
  /** Bật / tắt một hình trên nút (dấu ô hoặc mũi tên cùng toạ độ). */
  function toggleShape(node, sh) {
    node.s = node.s || [];
    const same = (a) => a.k === sh.k && (sh.k === 'm' ? a.x === sh.x && a.y === sh.y : a.x0 === sh.x0 && a.y0 === sh.y0 && a.x1 === sh.x1 && a.y1 === sh.y1);
    const i = node.s.findIndex(same);
    if (i >= 0) node.s.splice(i, 1); else if (node.s.length < LIMITS.shapes) node.s.push(sh);
    if (!node.s.length) delete node.s;
  }

  const int = (v) => Number.isInteger(v) && Math.abs(v) <= LIMITS.coord;
  function cleanShapes(s) {
    if (!Array.isArray(s)) return undefined;
    const out = [];
    for (const x of s.slice(0, LIMITS.shapes)) {
      if (x && x.k === 'm' && int(x.x) && int(x.y)) out.push({ k: 'm', x: x.x, y: x.y });
      else if (x && x.k === 'a' && [x.x0, x.y0, x.x1, x.y1].every(int)) out.push({ k: 'a', x0: x.x0, y0: x.y0, x1: x.x1, y1: x.y1 });
    }
    return out.length ? out : undefined;
  }
  /**
   * Làm sạch một chương (dữ liệu lạ không làm hỏng máy chủ): bỏ nước sai luật / nút vượt trần, giữ phần hợp lệ.
   * cleanText(s, max): làm sạch lời bình (máy chủ: cleanRich; mặc định: cắt độ dài).
   */
  function clean(raw, cleanText = (s, max) => String(s || '').slice(0, max)) {
    const ch = newChapter(raw && raw.name, raw && raw.rule, raw && typeof raw.id === 'string' && /^[\w-]{1,16}$/.test(raw.id) ? raw.id : undefined);
    const b = new Caro.Board(ch.rule);
    let won = false;
    for (const m of Array.isArray(raw && raw.setup) ? raw.setup.slice(0, LIMITS.setup) : []) {
      if (!Array.isArray(m) || !int(m[0]) || !int(m[1]) || b.get(m[0], m[1]) || won) continue;
      const p = b.moves.length % 2 ? Caro.O : Caro.X;
      b.play(m[0], m[1], p);
      ch.setup.push([m[0], m[1]]);
      if (Caro.checkWin(b, m[0], m[1], p)) won = true;
    }
    let budget = LIMITS.nodes;
    function walk(src, dst, depth, over) {
      if (typeof src.c === 'string' && src.c.trim()) dst.c = cleanText(src.c, LIMITS.comment);
      const s = cleanShapes(src.s);
      if (s) dst.s = s;
      dst.ch = [];
      if (over || depth >= LIMITS.depth || !Array.isArray(src.ch)) return;
      for (const c of src.ch) {
        if (budget <= 0) return;
        if (!c || !Array.isArray(c.m) || !int(c.m[0]) || !int(c.m[1]) || b.get(c.m[0], c.m[1])) continue;
        if (dst.ch.some((d) => d.m[0] === c.m[0] && d.m[1] === c.m[1])) continue; // biến trùng nước
        const p = b.moves.length % 2 ? Caro.O : Caro.X;
        b.play(c.m[0], c.m[1], p);
        budget--;
        const n = { m: [c.m[0], c.m[1]] };
        walk(c, n, depth + 1, !!Caro.checkWin(b, c.m[0], c.m[1], p));
        b.undo();
        dst.ch.push(n);
      }
    }
    walk((raw && raw.root) || {}, ch.root, 0, won);
    return ch;
  }

  const api = { LIMITS, newChapter, nodeAt, movesAt, addMove, remove, promote, next, prev, count, toggleShape, clean };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.CaroClassTree = api;
})(typeof window !== 'undefined' ? window : globalThis);
