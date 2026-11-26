/*
 * Video ngắn 9:16 (TikTok / YouTube Shorts / Facebook Reels) – phần thuần, không đụng DOM: kích thước khung, vùng an toàn,
 * bố cục, chọn định dạng ghi (MP4 H.264 → WebM VP9 → VP8), tên file, lịch thời gian các cảnh (câu đố / ván đấu), tốc độ tua,
 * chuỗi nước thắng của câu đố, tên miền trên thẻ kết, gắn thời lượng vào file WebM (Chrome ghi WebM không có Duration).
 * Dạng UMD: window.CaroVideoCore (trình duyệt) hoặc module.exports (Node – caro/tests/video-core.test.js).
 * Phần vẽ: video-draw.js; hộp thoại + ghi hình: video-maker.js.
 */
(function (root) {
  'use strict';

  const W = 1080, H = 1920, FPS = 30;
  const BITRATE = 4000000; // ~4 Mbit/s: bàn cờ ít chuyển động, 40 giây ≈ 20 MB – các nền tảng đều nhận
  // Phần bị giao diện TikTok / Reels / Shorts che: ~12% trên, ~20% dưới (chú thích, nút), ~15% bên phải (cột nút thích,
  // bình luận); bên trái chừa một lề nhỏ cho cân.
  const SAFE = { top: 0.12, bottom: 0.2, right: 0.15, left: 0.06 };

  /** Vùng an toàn (điểm ảnh) của khung w × h. */
  function safeArea(w, h) {
    w = w || W; h = h || H;
    const x = Math.ceil(w * SAFE.left), y = Math.ceil(h * SAFE.top);
    return { x, y, w: Math.floor(w * (1 - SAFE.right)) - x, h: Math.floor(h * (1 - SAFE.bottom)) - y };
  }

  /**
   * Bố cục trong vùng an toàn: head (tiêu đề + câu hỏi), board (bàn cờ vuông), cap (dòng chú thích / đếm ngược dưới bàn),
   * end (thẻ kết). Mọi khung đều nằm trọn trong vùng an toàn.
   */
  function layout(w, h) {
    w = w || W; h = h || H;
    const s = safeArea(w, h);
    const headH = Math.round(s.h * 0.2), capH = Math.round(s.h * 0.15), gap = Math.round(s.h * 0.015);
    const size = Math.min(s.w, s.h - headH - capH - 2 * gap);
    const bx = s.x + Math.round((s.w - size) / 2), by = s.y + headH + gap;
    return {
      safe: s,
      head: { x: s.x, y: s.y, w: s.w, h: headH },
      board: { x: bx, y: by, w: size, h: size },
      cap: { x: s.x, y: by + size + gap, w: s.w, h: s.y + s.h - (by + size + gap) },
      end: { x: s.x, y: s.y, w: s.w, h: s.h },
    };
  }

  /** Thứ tự định dạng muốn dùng: MP4 H.264 (đăng thẳng được mọi nơi) trước, rồi WebM. Mức H.264 4.0 đủ cho 1080×1920. */
  const MIMES = [
    'video/mp4;codecs=avc1.640028', 'video/mp4;codecs=avc1.4d0028', 'video/mp4;codecs=avc1.420028', 'video/mp4;codecs=avc1',
    'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm',
  ];
  /** Định dạng đầu tiên trình duyệt nhận (isSupported = MediaRecorder.isTypeSupported), hoặc '' nếu không có. */
  function pickMime(isSupported, list) {
    for (const m of list || MIMES) {
      try { if (isSupported(m)) return m; } catch (e) { /* trình duyệt cũ ném lỗi với chuỗi lạ: thử cái sau */ }
    }
    return '';
  }
  /** Đuôi file theo định dạng thật của bản ghi. */
  const extOf = (mime) => (/mp4/i.test(String(mime || '')) ? 'mp4' : 'webm');
  /** Loại MIME gọn để gắn vào Blob / File (bỏ phần codecs – một số trình chia sẻ không nhận). */
  const baseMime = (mime) => (extOf(mime) === 'mp4' ? 'video/mp4' : 'video/webm');
  /** caro-<loại>-<mã>.<đuôi>; mã chỉ giữ chữ Latin, số, gạch (tên file an toàn trên mọi hệ điều hành). */
  function fileName(kind, id, mime) {
    const k = String(kind || 'video').replace(/[^a-z0-9-]/gi, '').toLowerCase() || 'video';
    const i = String(id == null ? '' : id).replace(/[^a-z0-9-]/gi, '').slice(0, 24) || 'x';
    return `caro-${k}-${i}.${extOf(mime)}`;
  }

  // ---------------------------------------------------------------- Lịch thời gian
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const PLAY_MAX = 40; // phần phát nước của ván đấu tối đa 40 giây

  /**
   * Thời gian mỗi nước khi tua ván n nước: tối thiểu 0,25 s, tối đa 1 s, sao cho cả ván ≤ 40 s.
   * Ván rất dài (> 160 nước) thì nhanh hơn 0,25 s để vẫn giữ ≤ 40 s.
   */
  function moveStep(n) {
    if (!(n > 0)) return 1;
    const s = clamp(PLAY_MAX / n, 0.25, 1);
    return s * n > PLAY_MAX ? PLAY_MAX / n : s;
  }

  /** Dựng lịch từ danh sách cảnh [{ id, dur, ...thêm }] – thêm start; speed > 1 (chỉ bài thử) rút ngắn mọi cảnh. */
  function build(list, speed) {
    const k = speed > 0 ? speed : 1;
    let t = 0;
    const scenes = list.map((s) => { const o = { ...s, start: t, dur: s.dur / k }; if (o.step) o.step /= k; t += o.dur; return o; });
    return { scenes, total: t };
  }

  /**
   * Câu đố: tiêu đề + thế cờ (2 s) → đếm ngược 3 giây cho người xem đoán → lật đáp án (vòng sáng ở nước đầu) → phát chuỗi
   * nước thắng (nếu tìm được) → 5 quân thắng → thẻ kết 3 s. Không có chuỗi: lật đáp án lâu hơn rồi thẻ kết.
   * lineLen: số nước của chuỗi (cả hai bên, tính nước đầu); won: chuỗi kết thúc bằng 5 quân.
   */
  function puzzleTimeline(lineLen, won, speed) {
    const list = [{ id: 'intro', dur: 2 }, { id: 'think', dur: 3 }];
    if (lineLen > 0 && won) {
      const step = clamp(4 / lineLen, 0.35, 0.8);
      list.push({ id: 'reveal', dur: 1.5 }, { id: 'line', dur: step * lineLen, step, n: lineLen }, { id: 'win', dur: 2 });
    } else list.push({ id: 'reveal', dur: 3.5 });
    list.push({ id: 'outro', dur: 3 });
    return build(list, speed);
  }

  /** Ván đấu: tên hai bên (1,5 s) → tua n nước (≤ 40 s) → dừng ở 5 quân thắng (2,5 s; không có thì 1,5 s) → thẻ kết 3 s. */
  function gameTimeline(n, won, speed) {
    const step = moveStep(n);
    return build([
      { id: 'intro', dur: 1.5 },
      { id: 'play', dur: step * Math.max(0, n), step, n: Math.max(0, n) },
      { id: 'win', dur: won ? 2.5 : 1.5 },
      { id: 'outro', dur: 3 },
    ], speed);
  }

  /** Cảnh đang chiếu ở giây t: { scene, local (giây trong cảnh), frac (0..1) }. Sau cùng: giữ cảnh cuối. */
  function sceneAt(tl, t) {
    const list = tl.scenes;
    let s = list[list.length - 1];
    for (const x of list) if (t < x.start + x.dur) { s = x; break; }
    const local = clamp(t - s.start, 0, s.dur);
    return { scene: s, local, frac: s.dur ? local / s.dur : 1 };
  }
  /** Số nước đã hiện trong cảnh phát nước (play / line) ở giây local: nước 1 hiện ngay đầu cảnh. */
  function shownAt(scene, local) {
    if (!scene.n) return 0;
    return clamp(Math.floor(local / scene.step) + 1, 1, scene.n);
  }

  // ---------------------------------------------------------------- Bàn cờ
  /**
   * Khung toạ độ vừa các quân (+2 ô viền), gần vuông và tối thiểu min × min ô (thế ít quân không bị phóng quá to).
   * Bàn lớn chỉ lấy vùng có quân (như ảnh chia sẻ – share.js).
   */
  function boxFor(moves, min, max) {
    min = min || 9;
    const xs = moves.map((m) => m[0]), ys = moves.map((m) => m[1]);
    if (!xs.length) { xs.push(0); ys.push(0); }
    const box = { x0: Math.min(...xs) - 2, x1: Math.max(...xs) + 2, y0: Math.min(...ys) - 2, y1: Math.max(...ys) + 2 };
    const grow = (a, b, want) => { let lo = box[a], hi = box[b], k = 0; while (hi - lo + 1 < want) { if (k++ % 2) lo--; else hi++; } box[a] = lo; box[b] = hi; };
    const side = Math.max(min, box.x1 - box.x0 + 1, box.y1 - box.y0 + 1);
    // Quân rải quá xa (máy chủ cho tới ±512 ô): chỉ lấy vùng max × max quanh nước cuối – ô không teo về 0 điểm ảnh
    // (canvas rộng 0 làm drawImage ném lỗi), quân ngoài vùng bị cắt khi vẽ lên lớp bàn cờ
    if (max && side > max) {
      const [lx, ly] = moves.length ? moves[moves.length - 1] : [0, 0], h = Math.floor(max / 2);
      return { x0: lx - h, x1: lx - h + max - 1, y0: ly - h, y1: ly - h + max - 1 };
    }
    grow('x0', 'x1', side);
    grow('y0', 'y1', side);
    return box;
  }

  /** Nước của ván (dữ liệu có thể hỏng – ván lưu trên máy, link chia sẻ): phần đầu gồm các cặp số nguyên [x, y]. */
  function validMoves(list) {
    const out = [];
    if (!Array.isArray(list)) return out;
    for (const m of list) {
      if (!Array.isArray(m) || !Number.isInteger(m[0]) || !Number.isInteger(m[1])) break; // dừng ở nước hỏng: giữ đúng lượt X / O
      out.push([m[0], m[1]]);
    }
    return out;
  }

  /**
   * Chuỗi nước thắng của câu đố, tính bằng đúng cách trình luyện câu đố "Xem lời giải" (study-trainer.js): đi nước đáp án
   * sol, máy chặn (Analysis.bestBlock, không có thì Caro.chooseMove), rồi tìm nước ép tiếp (Analysis.forced) cho tới 5 quân.
   * C = rules.js, A = analysis.js (truyền vào để chạy được cả trên Node). Trả về { line: [[x, y]…] (cả hai bên), won }.
   */
  function solveLine(C, A, moves, sol, rule, ms) {
    const b = new C.Board(rule || 'vn');
    moves.forEach((m, i) => b.play(m[0], m[1], i % 2 ? C.O : C.X));
    const p = moves.length % 2 ? C.O : C.X, q = C.other(p);
    const line = [];
    let mv = sol, won = false;
    for (let k = 0; k < 16 && mv; k++) {
      if (b.get(mv[0], mv[1]) !== C.EMPTY) break;
      b.play(mv[0], mv[1], p); line.push([mv[0], mv[1]]);
      if (C.checkWin(b, mv[0], mv[1], p)) { won = true; break; }
      const r = A.bestBlock(b, q, mv) || C.chooseMove(b, q, 2);
      if (!r || b.get(r[0], r[1]) !== C.EMPTY) break;
      b.play(r[0], r[1], q); line.push([r[0], r[1]]);
      if (C.checkWin(b, r[0], r[1], q)) break;
      const f = A.forced(b, p, 6, { deadline: Date.now() + (ms || 600) });
      mv = f ? f.move : null;
    }
    return won ? { line, won } : { line: sol ? [[sol[0], sol[1]]] : [], won: false };
  }

  // ---------------------------------------------------------------- Chữ
  /** Tên miền cho thẻ kết: máy chủ của app (CARO_SERVER – bản ứng dụng, GitHub Pages) hoặc tên miền trang đang mở. */
  function siteHost(loc, server) {
    const s = String(server || '').trim();
    const h = s ? s.replace(/^[a-z]+:\/\//i, '').replace(/\/.*$/, '') : String((loc && loc.host) || '');
    return h.replace(/^www\./i, '');
  }

  /**
   * Ngắt chữ thành tối đa max dòng vừa bề rộng w (measure(text) → bề rộng). Chữ có dấu cách ngắt theo từ, chữ Hán / kana
   * (không dấu cách) ngắt theo ký tự; dòng cuối thừa thì cắt và thêm "…".
   */
  function wrap(text, w, max, measure) {
    text = String(text == null ? '' : text).trim();
    if (!text) return [];
    const parts = /\s/.test(text) ? text.split(/(\s+)/) : Array.from(text);
    const lines = [];
    let cur = '';
    for (const p of parts) {
      const next = cur + p;
      if (!cur || measure(next.trim()) <= w) { cur = next; continue; }
      lines.push(cur.trim());
      cur = /^\s+$/.test(p) ? '' : p;
    }
    if (cur.trim()) lines.push(cur.trim());
    // Một "từ" dài hơn cả dòng (tên miền, chữ dính liền): cắt theo ký tự
    const out = [];
    for (const l of lines) {
      if (measure(l) <= w) { out.push(l); continue; }
      let c = '';
      for (const ch of Array.from(l)) { if (c && measure(c + ch) > w) { out.push(c); c = ch; } else c += ch; }
      if (c) out.push(c);
    }
    if (out.length <= max) return out;
    const keep = out.slice(0, max);
    let last = keep[max - 1];
    // Bớt từng ký tự (Array.from: không tách đôi emoji / chữ ngoài BMP thành nửa cặp surrogate)
    const chars = Array.from(last);
    while (chars.length > 1 && measure(chars.join('') + '…') > w) chars.pop();
    last = chars.join('');
    keep[max - 1] = last + '…';
    return keep;
  }

  /** Cỡ chữ lớn nhất (≤ size, ≥ min) để text vừa một dòng rộng w; measureAt(text, cỡ) → bề rộng. */
  function fitSize(text, w, size, min, measureAt) {
    let s = size;
    while (s > min && measureAt(text, s) > w) s -= 2;
    return Math.max(min, s);
  }

  // ---------------------------------------------------------------- WebM: gắn thời lượng
  /**
   * MediaRecorder của Chrome / Firefox ghi WebM kiểu "phát trực tiếp": mục Info không có Duration nên trình phát / trang đăng
   * video không biết dài bao lâu (thanh tua không dùng được). Hàm này chèn Duration (float 64 bit, đơn vị TimecodeScale)
   * vào Info. Chỉ sửa khi Segment có kích thước "không biết" (bản ghi không có SeekHead / Cues) – chèn thêm byte không làm lệch gì.
   * Không nhận ra cấu trúc (hoặc đã có Duration) thì trả lại nguyên bản.
   */
  function fixWebmDuration(bytes, ms) {
    const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const vlen = (b) => { for (let i = 0; i < 8; i++) if (b & (0x80 >> i)) return i + 1; return 0; };
    const readId = (o) => { const n = vlen(u[o]); if (!n || n > 4) return null; let v = 0; for (let i = 0; i < n; i++) v = v * 256 + u[o + i]; return { v, n }; };
    const readSize = (o) => {
      const n = vlen(u[o]);
      if (!n) return null;
      let v = u[o] & (0xff >> n), all = v === (0xff >> n);
      for (let i = 1; i < n; i++) { v = v * 256 + u[o + i]; if (u[o + i] !== 0xff) all = false; }
      return { v, n, unknown: all };
    };
    try {
      // EBML header
      let id = readId(0);
      if (!id || id.v !== 0x1a45dfa3) return u;
      let sz = readSize(id.n);
      let o = id.n + sz.n + sz.v;
      id = readId(o);
      if (!id || id.v !== 0x18538067) return u; // Segment
      sz = readSize(o + id.n);
      // Segment có kích thước đã biết: chèn thêm byte sẽ làm kích thước sai (file hỏng) – chỉ sửa bản ghi "phát trực tiếp"
      if (!sz || !sz.unknown) return u;
      const segData = o + id.n + sz.n, segEnd = u.length;
      for (o = segData; o < segEnd;) {
        const eid = readId(o);
        if (!eid) return u;
        const es = readSize(o + eid.n);
        if (!es) return u;
        const data = o + eid.n + es.n;
        if (eid.v === 0x1549a966 && !es.unknown) { // Info
          if (data + es.v > u.length) return u; // Info bị cắt cụt (file ghi dở): không đọc quá cuối file
          let scale = 1000000; // TimecodeScale mặc định: 1 ms
          for (let p = data; p < data + es.v;) {
            const cid = readId(p), cs = readSize(p + cid.n), cd = p + cid.n + cs.n;
            if (cid.v === 0x4489) return u; // đã có Duration
            if (cid.v === 0x2ad7b1) { scale = 0; for (let i = 0; i < cs.v; i++) scale = scale * 256 + u[cd + i]; }
            p = cd + cs.v;
          }
          const dur = new Uint8Array(11);
          dur[0] = 0x44; dur[1] = 0x89; dur[2] = 0x88; // ID Duration, kích thước 8 byte
          new DataView(dur.buffer).setFloat64(3, (ms * 1000000) / (scale || 1000000));
          const size = es.v + dur.length;
          if (size >= Math.pow(2, 56) - 1) return u;
          const sizeBytes = new Uint8Array(8); // ghi lại kích thước Info bằng 8 byte (0x01 + 7 byte)
          sizeBytes[0] = 0x01;
          for (let i = 7, v = size; i >= 1; i--) { sizeBytes[i] = v % 256; v = Math.floor(v / 256); }
          const head = u.subarray(0, o + eid.n), body = u.subarray(data, data + es.v), tail = u.subarray(data + es.v);
          const out = new Uint8Array(head.length + 8 + body.length + dur.length + tail.length);
          let k = 0;
          for (const part of [head, sizeBytes, body, dur, tail]) { out.set(part, k); k += part.length; }
          return out;
        }
        if (es.unknown) return u; // Cluster kích thước "không biết" trước Info: không phải bản ghi quen thuộc
        o = data + es.v;
      }
    } catch (e) { /* file lạ: giữ nguyên */ }
    return u;
  }

  const api = {
    W, H, FPS, BITRATE, SAFE, MIMES, safeArea, layout, pickMime, extOf, baseMime, fileName,
    moveStep, puzzleTimeline, gameTimeline, sceneAt, shownAt, boxFor, validMoves, solveLine, siteHost, wrap, fitSize, fixWebmDuration,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CaroVideoCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
