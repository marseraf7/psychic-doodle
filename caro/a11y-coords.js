/*
 * Trợ năng (C5) – phần logic không đụng DOM: tên ô cho người đọc màn hình, đọc lệnh gõ chữ, tìm nước đe doạ.
 * Bàn cờ vô hạn nên dùng một khung quy ước 15×15 quanh tâm: cột a…o (trái → phải), hàng 1…15 (dưới → trên),
 * ô (0, 0) là "h8". Ra ngoài khung vẫn đếm tiếp: cột p, q… (bên phải), cột "-a", "-b"… (bên trái); hàng 16, 17… (trên),
 * hàng 0, -1… (dưới). Nhờ vậy mỗi ô có đúng một tên, gõ lại tên đó là về đúng ô.
 * Dùng chung: trình duyệt (window.CaroA11yCoords – a11y.js) và Node (module.exports – caro/tests/a11y-coords.test.js).
 */
(function (global) {
  'use strict';
  const MID = 7; // cột 'h' / hàng 8 ứng với toạ độ 0

  /** Số thứ tự cột (0 = a) → chữ: a…z, aa, ab… (như bảng tính). */
  function letters(n) {
    let s = '';
    n += 1;
    while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(97 + r) + s; n = Math.floor((n - 1) / 26); }
    return s;
  }
  function unletters(s) {
    let n = 0;
    for (const ch of s) n = n * 26 + (ch.charCodeAt(0) - 96);
    return n - 1;
  }

  /** Tên ô (x, y) – x tăng sang phải, y tăng xuống dưới (như bàn cờ trong rules.js). */
  function name(x, y) {
    const c = x + MID;
    const col = c >= 0 ? letters(c) : '-' + letters(-c - 1);
    return col + (MID + 1 - y);
  }

  /** "h8", "H8", "-a3", "aa10", "h-2" → [x, y]; chữ lạ → null. */
  function parse(text) {
    const m = /^\s*(-?)([a-z]{1,3})\s*(-?\d{1,4})\s*$/i.exec(String(text || ''));
    if (!m) return null;
    const n = unletters(m[2].toLowerCase());
    const c = m[1] ? -n - 1 : n;
    return [c - MID, MID + 1 - Number(m[3])];
  }

  /**
   * Lệnh gõ chữ ở chế độ không nhìn bàn: tên ô → { kind: 'move', x, y }; từ khoá (vi / en / ru / zh) → { kind: lệnh }.
   * Lệnh: undo (đi lại), new (ván mới), last (nước vừa đi), list (các nước gần đây), threats (nước đe doạ), help, status.
   */
  const WORDS = {
    undo: ['undo', 'u', 'đi lại', 'di lai', 'отмена', 'ход назад', '悔棋'],
    new: ['new', 'n', 'ván mới', 'van moi', 'новая', 'новая партия', '新局'],
    last: ['last', 'l', 'vừa đi', 'vua di', 'последний', '上一步'],
    list: ['list', 'moves', 'các nước', 'cac nuoc', 'ходы', '棋谱'],
    threats: ['threats', 't', 'đe doạ', 'de doa', 'угрозы', '威胁'],
    help: ['help', '?', 'trợ giúp', 'tro giup', 'помощь', '帮助'],
    status: ['status', 's', 'lượt', 'luot', 'статус', '状态'],
  };
  function command(text) {
    const t = String(text || '').trim().toLowerCase();
    if (!t) return null;
    const cell = parse(t);
    if (cell) return { kind: 'move', x: cell[0], y: cell[1] };
    for (const [kind, list] of Object.entries(WORDS)) if (list.includes(t)) return { kind };
    return null;
  }

  /**
   * Các ô mà quân p đánh vào là thắng ngay (đe doạ), chỉ xét quanh các quân của p (đủ nhanh để chạy sau mỗi nước).
   * Caro: module rules.js (cần winsIfPlaced, EMPTY, DIRS). Trả [[x, y], …] không trùng, tối đa max ô.
   */
  function threats(Caro, board, p, max = 6) {
    const out = [], seen = new Set();
    for (const m of board.moves) {
      if (m.p !== p) continue;
      for (const [dx, dy] of Caro.DIRS) {
        for (let k = -4; k <= 4; k++) {
          if (!k) continue;
          const x = m.x + k * dx, y = m.y + k * dy, key = x + ',' + y;
          if (seen.has(key)) continue;
          seen.add(key);
          if (board.get(x, y) === Caro.EMPTY && Caro.winsIfPlaced(board, x, y, p)) {
            out.push([x, y]);
            if (out.length >= max) return out;
          }
        }
      }
    }
    return out;
  }

  /** Bước con trỏ theo phím mũi tên trên màn hình (bàn có thể đã quay: unrot đổi về trục bàn cờ). */
  function step(cur, key, unrot) {
    const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[key];
    if (!dir) return null;
    const [dx, dy] = unrot ? unrot(dir[0], dir[1]) : dir;
    return [cur[0] + Math.round(dx), cur[1] + Math.round(dy)];
  }

  const api = { name, parse, command, threats, step, letters, WORDS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.CaroA11yCoords = api;
})(typeof window !== 'undefined' ? window : globalThis);
