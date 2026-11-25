/*
 * Video ngắn 9:16 – vẽ từng khung hình lên canvas 1080×1920 theo lịch cảnh (video-core.js). Bàn cờ vẽ bằng đúng hàm của
 * ảnh / GIF chia sẻ (CaroShare.drawBoard → CaroStyle.drawStone, Caro.Board), màu theo giao diện đang chọn.
 * Chữ quan trọng và bàn cờ nằm trong vùng an toàn (không bị nút / chú thích của TikTok, Reels, Shorts che).
 * window.CaroVideoDraw.renderer(canvas, spec) → { draw(t), tl }. spec do video-maker.js dựng (chữ đã dịch sẵn):
 *   { kind: 'puzzle' | 'game', moves, line, won, rule, side, tl, col, font, host, text: { head, title, … } }
 */
(function () {
  'use strict';
  const V = window.CaroVideoCore;

  function renderer(canvas, spec) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const L = V.layout(W, H);
    const col = spec.col, font = spec.font, tx = spec.text;
    const all = spec.kind === 'puzzle' ? spec.moves.concat(spec.line) : spec.moves;
    const box = V.boxFor(all, 9);
    const cols = box.x1 - box.x0 + 1, rows = box.y1 - box.y0 + 1;
    const s = Math.floor(Math.min(L.board.w / cols, L.board.h / rows));
    const bx = L.board.x + Math.round((L.board.w - s * cols) / 2), by = L.board.y + Math.round((L.board.h - s * rows) / 2);
    const cell = (x, y) => [bx + (x - box.x0) * s + s / 2, by + (y - box.y0) * s + s / 2];

    // Lớp bàn cờ: chỉ vẽ lại khi số quân đổi (vẽ 30 khung/giây trên máy yếu vẫn nhẹ)
    const layer = document.createElement('canvas');
    layer.width = s * cols; layer.height = s * rows;
    const lctx = layer.getContext('2d');
    let layerKey = '';
    function boardAt(n, final) {
      const key = n + '|' + (final ? 1 : 0);
      if (key !== layerKey) {
        lctx.clearRect(0, 0, layer.width, layer.height);
        window.CaroShare.drawBoard(lctx, 0, 0, s, box, all, n, spec.rule, col, final, Math.max(2, Math.round(s / 30)));
        layerKey = key;
      }
      // Viền + bóng nhẹ quanh bàn cho nổi trên nền
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,.25)';
      ctx.shadowBlur = 24;
      ctx.fillStyle = col.bg;
      ctx.fillRect(bx, by, layer.width, layer.height);
      ctx.restore();
      ctx.drawImage(layer, bx, by);
    }

    // ------------------------------------------------------------ Chữ
    const setFont = (size, weight) => { ctx.font = `${weight || 600} ${size}px ${font}`; };
    /** Viết chữ (tự ngắt dòng, tối đa max dòng) giữa khung r theo chiều ngang, bắt đầu ở y; trả về y sau dòng cuối. */
    function text(str, r, y, size, weight, color, max) {
      setFont(size, weight);
      const lines = V.wrap(str, r.w, max || 1, (t) => ctx.measureText(t).width);
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const lh = Math.round(size * 1.22);
      lines.forEach((l, i) => ctx.fillText(l, r.x + r.w / 2, y + i * lh));
      return y + lines.length * lh;
    }
    /** Một dòng chữ thu nhỏ cho vừa bề rộng (tên miền thẻ kết phải đọc được trọn vẹn). */
    function fitLine(str, r, y, size, min, weight, color) {
      const sz = V.fitSize(str, r.w, size, min, (t, z) => { setFont(z, weight); return ctx.measureText(t).width; });
      return text(str, r, y, sz, weight, color, 2);
    }
    /** Chữ của dải chú thích dưới bàn: một dòng thu nhỏ tới 48px, dài nữa thì 2 dòng – không chạm dòng tên game cuối dải. */
    function capText(str, size, weight, color) {
      const r = L.cap;
      const sz = V.fitSize(str, r.w, size, 48, (t, z) => { setFont(z, weight); return ctx.measureText(t).width; });
      return text(str, r, r.y + 18, sz, weight, color, 2);
    }
    const alpha = (a, fn) => { ctx.save(); ctx.globalAlpha = Math.max(0, Math.min(1, a)); fn(); ctx.restore(); };

    function background() {
      ctx.fillStyle = col.panel;
      ctx.fillRect(0, 0, W, H);
      // Dải màu mảnh trên cùng và dưới cùng (ngoài vùng an toàn – chỉ trang trí)
      ctx.fillStyle = col.x;
      ctx.fillRect(0, 0, W / 2, 10);
      ctx.fillStyle = col.o;
      ctx.fillRect(W / 2, 0, W / 2, 10);
    }

    /** Hai bên: "X tên – O tên" (ẩn tên thì chỉ X – O). */
    function sides(y) {
      const r = L.head, size = 60;
      setFont(size, 700);
      ctx.textBaseline = 'top';
      if (!spec.names) {
        ctx.textAlign = 'center';
        const mid = r.x + r.w / 2;
        ctx.fillStyle = col.x; ctx.fillText('X', mid - 70, y);
        ctx.fillStyle = col.muted; ctx.fillText('–', mid, y);
        ctx.fillStyle = col.o; ctx.fillText('O', mid + 70, y);
        return;
      }
      const half = r.w / 2 - 12;
      const clip = (t, max) => { t = String(t || '?'); if (ctx.measureText(t).width <= max) return t; while (t.length > 1 && ctx.measureText(t + '…').width > max) t = t.slice(0, -1); return t + '…'; };
      setFont(52, 700);
      const gw = ctx.measureText('X ').width;
      ctx.textAlign = 'left';
      ctx.fillStyle = col.x; ctx.fillText('X', r.x, y);
      ctx.fillStyle = col.text; ctx.fillText(clip(spec.names.x, half - gw), r.x + gw, y);
      ctx.textAlign = 'right';
      ctx.fillStyle = col.o; ctx.fillText('O', r.x + r.w, y);
      ctx.fillStyle = col.text; ctx.fillText(clip(spec.names.o, half - gw), r.x + r.w - gw, y);
    }

    /** Vòng sáng quanh ô (nước đáp án), nhấp nháy theo thời gian. */
    function ring(x, y, t) {
      const [cx, cy] = cell(x, y);
      const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 3);
      ctx.save();
      ctx.strokeStyle = col.win;
      ctx.lineWidth = Math.max(4, s * 0.12);
      ctx.beginPath();
      ctx.arc(cx, cy, s * (0.62 + 0.12 * pulse), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      window.CaroStyle.drawStone(ctx, spec.side, cx, cy, s, 0.55, col);
    }

    /** Đếm ngược 3 – 2 – 1 trong dải chú thích dưới bàn, kèm vòng tiến độ. */
    function countdown(local, dur) {
      const r = L.cap, R = Math.min(r.h * 0.42, 110);
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      const left = Math.max(1, Math.ceil(3 * (1 - local / dur))); // 3 – 2 – 1 (theo tỉ lệ: đúng cả ở chế độ thử nhanh)
      ctx.save();
      ctx.lineWidth = 14;
      ctx.strokeStyle = col.grid;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = col.win;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - local / dur)); ctx.stroke();
      setFont(Math.round(R * 1.15), 800);
      ctx.fillStyle = col.text;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(left), cx, cy + 4);
      ctx.restore();
    }

    /** Thẻ kết: tên game + "tìm: <tên miền>" chữ to (TikTok hạn chế link với tài khoản mới – phải đọc được). */
    function outro(frac) {
      const r = L.end;
      alpha(Math.min(1, frac * 4), () => {
        let y = r.y + Math.round(r.h * 0.1);
        if (spec.result) y = text(spec.result, r, y, 56, 700, col.muted, 2) + 40;
        // Biểu tượng: 5 quân X thẳng hàng
        const k = 96, x0 = r.x + r.w / 2 - k * 2;
        for (let i = 0; i < 5; i++) window.CaroStyle.drawStone(ctx, 1, x0 + i * k, y + k / 2, k, 1, col);
        ctx.strokeStyle = col.win; ctx.lineWidth = 12; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x0, y + k / 2); ctx.lineTo(x0 + 4 * k, y + k / 2); ctx.stroke();
        y += k + 60;
        y = fitLine(tx.app, r, y, 120, 60, 800, col.text) + 24;
        y = text(tx.tag, r, y, 46, 500, col.muted, 3) + 70;
        // Ô nổi bật chứa tên miền
        const find = tx.find;
        const sz = V.fitSize(find, r.w - 60, 84, 40, (t, z) => { setFont(z, 800); return ctx.measureText(t).width; });
        setFont(sz, 800);
        const lines = V.wrap(find, r.w - 60, 2, (t) => ctx.measureText(t).width);
        const bh = lines.length * Math.round(sz * 1.22) + 56;
        ctx.fillStyle = col.x;
        roundRect(r.x, y, r.w, bh, 36);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        lines.forEach((l, i) => ctx.fillText(l, r.x + r.w / 2, y + 28 + i * Math.round(sz * 1.22)));
      });
    }
    function roundRect(x, y, w, h, rad) {
      ctx.beginPath();
      ctx.moveTo(x + rad, y);
      ctx.arcTo(x + w, y, x + w, y + h, rad);
      ctx.arcTo(x + w, y + h, x, y + h, rad);
      ctx.arcTo(x, y + h, x, y, rad);
      ctx.arcTo(x, y, x + w, y, rad);
      ctx.closePath();
    }

    // ------------------------------------------------------------ Khung hình ở giây t
    function draw(t) {
      const { scene, local, frac } = V.sceneAt(spec.tl, t);
      background();
      if (scene.id === 'outro') { outro(frac); return scene; }
      const head = L.head;
      // Đầu: dòng nhỏ (loại video) + dòng lớn (câu hỏi / hai bên)
      let y = text(tx.head, head, head.y + 8, 44, 600, col.muted, 1) + 18;
      if (spec.kind === 'puzzle') {
        fitLine(tx.question, head, y, 66, 50, 800, col.text); // thu nhỏ cho vừa 1 dòng, dài nữa thì 2 dòng
        const base = spec.moves.length;
        if (scene.id === 'line' || scene.id === 'win') {
          const k = scene.id === 'win' ? spec.line.length : V.shownAt(scene, local);
          boardAt(base + k, scene.id === 'win');
        } else boardAt(base, false);
        if (scene.id === 'reveal' && spec.line[0]) ring(spec.line[0][0], spec.line[0][1], local);
        if (scene.id === 'intro') capText(tx.think, 60, 700, col.text);
        else if (scene.id === 'think') countdown(local, scene.dur);
        else if (scene.id === 'reveal') capText(spec.won ? tx.answer : tx.answerN, 66, 800, col.win);
        else if (scene.id === 'line') capText(tx.answer, 66, 800, col.win);
        else if (scene.id === 'win') capText(tx.won, 72, 800, col.win);
      } else {
        sides(y);
        const n = spec.moves.length;
        const k = scene.id === 'intro' ? 0 : scene.id === 'play' ? V.shownAt(scene, local) : n;
        boardAt(k, scene.id === 'win');
        if (scene.id === 'intro') capText(tx.count, 60, 700, col.muted);
        else if (scene.id === 'play') capText(tx.moveOf(k, n), 60, 700, col.muted);
        else capText(spec.result || tx.count, 66, 800, col.win);
      }
      // Tên game nhỏ ở cuối vùng an toàn (cả khi người xem không xem tới thẻ kết); lúc đếm ngược nhường chỗ cho vòng số
      if (scene.id !== 'think') text('✦ ' + tx.app + ' ✦', L.cap, L.cap.y + L.cap.h - 50, 38, 600, col.muted, 1);
      return scene;
    }

    return { draw, tl: spec.tl, box };
  }

  window.CaroVideoDraw = { renderer };
})();
