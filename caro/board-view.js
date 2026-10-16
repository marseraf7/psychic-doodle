/*
 * Bàn cờ – vẽ và camera: vẽ canvas (lưới, quân, nước cuối, đường thắng, ô cấm Renju, đánh dấu phân tích, toạ độ),
 * khung nhìn (toạ độ màn hình ↔ ô, hoạt ảnh camera, quán tính sau khi vuốt, phóng to, về giữa).
 * app.js gọi window.CaroBoardView(env) một lần (env: canvas, cam, state, canPlaceNow, save, MIN_SIZE, MAX_SIZE);
 * kích thước bàn cờ W / H do file này giữ (đọc qua V.W, V.H).
 */
(function () {
  'use strict';
  window.CaroBoardView = function (env) {
    const { X, EMPTY, forbidden } = window.Caro;
    const { canvas, cam, state, canPlaceNow, save, MIN_SIZE, MAX_SIZE } = env;
    const ctx = canvas.getContext('2d');
    let W = 0, H = 0, dpr = 1;
    let colors = {};

    // ------------------------------------------------------------ Vẽ
    function readColors() {
      const cs = getComputedStyle(document.documentElement);
      for (const k of ['bg', 'grid', 'grid-strong', 'x', 'o', 'last', 'win', 'muted']) {
        colors[k] = cs.getPropertyValue('--' + k).trim();
      }
      // Màu bàn cờ riêng (Cài đặt → Bàn cờ)
      colors.bg = cs.getPropertyValue('--board').trim() || colors.bg;
      colors.grid = cs.getPropertyValue('--board-grid').trim() || colors.grid;
      colors['grid-strong'] = cs.getPropertyValue('--board-grid-strong').trim() || colors['grid-strong'];
    }

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 3);
      // Kích thước thật của bàn cờ: thường là cả màn hình; khi phân tích ván, bàn cờ nhường chỗ cho bảng phân tích
      W = canvas.clientWidth || window.innerWidth;
      H = canvas.clientHeight || window.innerHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      requestDraw();
    }

    const toScreen = (wx, wy) => [(wx - cam.x) * cam.size + W / 2, (wy - cam.y) * cam.size + H / 2];
    const toCell = (sx, sy) => [
      Math.round((sx - W / 2) / cam.size + cam.x),
      Math.round((sy - H / 2) / cam.size + cam.y),
    ];

    let drawQueued = false;
    function requestDraw() {
      if (drawQueued) return;
      drawQueued = true;
      requestAnimationFrame(draw);
    }

    function drawStone(p, sx, sy, s, alpha) {
      window.CaroStyle.drawStone(ctx, p, sx, sy, s, alpha, colors);
    }

    function draw() {
      drawQueued = false;
      const now = performance.now();
      let again = false;
      const s = cam.size;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = colors.bg;
      ctx.fillRect(0, 0, W, H);

      // Lưới: đường kẻ nằm giữa các ô (toạ độ nửa nguyên).
      const x0 = Math.floor(cam.x - W / 2 / s) - 1, x1 = Math.ceil(cam.x + W / 2 / s) + 1;
      const y0 = Math.floor(cam.y - H / 2 / s) - 1, y1 = Math.ceil(cam.y + H / 2 / s) + 1;
      ctx.lineWidth = 1;
      ctx.strokeStyle = colors.grid;
      ctx.beginPath();
      for (let i = x0; i <= x1; i++) {
        const sx = Math.round(toScreen(i + 0.5, 0)[0]) + 0.5;
        ctx.moveTo(sx, 0); ctx.lineTo(sx, H);
      }
      for (let j = y0; j <= y1; j++) {
        const sy = Math.round(toScreen(0, j + 0.5)[1]) + 0.5;
        ctx.moveTo(0, sy); ctx.lineTo(W, sy);
      }
      ctx.stroke();

      // Đánh dấu gốc toạ độ để dễ định hướng.
      const [ox, oy] = toScreen(0, 0);
      ctx.fillStyle = colors['grid-strong'];
      ctx.beginPath();
      ctx.arc(ox, oy, Math.max(1.5, s * 0.05), 0, Math.PI * 2);
      ctx.fill();

      const moves = state.board.moves;
      const last = moves[moves.length - 1];
      if (last) {
        const [sx, sy] = toScreen(last.x - 0.5, last.y - 0.5);
        ctx.fillStyle = colors.last;
        ctx.fillRect(sx + 1, sy + 1, s - 1, s - 1);
        // Chấm nhỏ màu của người vừa đánh ở góc ô
        ctx.fillStyle = last.p === X ? colors.x : colors.o;
        ctx.beginPath();
        ctx.arc(sx + s - s * 0.14, sy + s * 0.14, Math.max(2, s * 0.06), 0, Math.PI * 2);
        ctx.fill();
      }

      // Ván thắng: các quân không thuộc đường thắng mờ dần (cùng nhịp với đường thắng) để 5 quân thắng nổi bật
      let winSet = null, dim = 1;
      if (state.winCells) {
        winSet = new Set(state.winCells.map(([x, y]) => x + ',' + y));
        const t = Math.min(1, (now - (state.winAt || 0)) / 450);
        dim = 1 - 0.55 * (1 - Math.pow(1 - t, 3));
      }
      // Quân cờ (chỉ vẽ các quân trong khung nhìn).
      for (let i = 0; i < moves.length; i++) {
        const m = moves[i];
        if (m.x < x0 || m.x > x1 || m.y < y0 || m.y > y1) continue;
        const [sx, sy] = toScreen(m.x, m.y);
        let scale = 1;
        if (m === last) {
          const t = Math.min(1, (now - state.lastPlacedAt) / 160);
          if (t < 1) again = true;
          scale = 0.5 + 0.5 * (1 - Math.pow(1 - t, 3));
        }
        drawStone(m.p, sx, sy, s * scale, winSet && !winSet.has(m.x + ',' + m.y) ? dim : 1);
      }

      if (state.marks) drawMarks(s, x0, x1, y0, y1);
      drawForbidden(s, x0, x1, y0, y1);

      // Quân mờ: chờ xác nhận hoặc rê chuột.
      const ghost = state.pending || state.hover;
      if (ghost && canPlaceNow() && state.board.get(ghost[0], ghost[1]) === EMPTY) {
        const [sx, sy] = toScreen(ghost[0], ghost[1]);
        if (state.pending) {
          ctx.strokeStyle = state.turn === X ? colors.x : colors.o;
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 4]);
          ctx.strokeRect(sx - s / 2 + 2, sy - s / 2 + 2, s - 4, s - 4);
          ctx.setLineDash([]);
        }
        drawStone(state.turn, sx, sy, s, state.pending ? 0.55 : 0.3);
      }

      // Đường thắng.
      if (state.winCells) {
        const a = state.winCells[0], b = state.winCells[state.winCells.length - 1];
        const [ax, ay] = toScreen(a[0], a[1]);
        const [bx, by] = toScreen(b[0], b[1]);
        // Vẽ dần từ đầu tới cuối trong ~0,45 giây
        const t = Math.min(1, (now - (state.winAt || 0)) / 450);
        if (t < 1) again = true;
        const e = 1 - Math.pow(1 - t, 3);
        ctx.strokeStyle = colors.win;
        ctx.lineWidth = Math.max(3, s * 0.12);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(ax, ay); ctx.lineTo(ax + (bx - ax) * e, ay + (by - ay) * e);
        ctx.stroke();
      }

      // Toạ độ khi phân tích (như bàn cờ Lichess): chữ cái theo cột ở mép dưới, số theo hàng ở mép trái
      if (state.coords && s >= 14) {
        const { minX, maxX, minY, maxY } = state.coords;
        ctx.font = `600 ${Math.round(Math.min(13, s * 0.36))}px ${fontFamily || (fontFamily = getComputedStyle(document.body).fontFamily)}`;
        ctx.fillStyle = colors.muted;
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        for (let x = Math.max(x0, minX); x <= Math.min(x1, maxX); x++) ctx.fillText(colName(x - minX), toScreen(x, 0)[0], H - 3);
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        for (let y = Math.max(y0, minY); y <= Math.min(y1, maxY); y++) ctx.fillText(String(maxY - y + 1), 4, toScreen(0, y)[1]);
      }

      if (camAnim || inertia) again = true;
      if (again) requestDraw();
      stepAnimations(now);
    }

    /** Renju: ô cấm của X (khi người chơi đang cầm X tới lượt) – dấu ✕ đỏ nhỏ, như các app Renju. */
    let fbCache = { key: '', cells: [] };
    function forbiddenCells() {
      const b = state.board;
      if (b.rule !== 'renju' || state.turn !== X || state.winner || state.replay || !canPlaceNow()) return [];
      const key = b.moves.length + ':' + (b.moves.length ? b.moves[b.moves.length - 1].x + ',' + b.moves[b.moves.length - 1].y : '');
      if (fbCache.key === key) return fbCache.cells;
      const cells = window.Caro.candidates(b, 2).filter(([x, y]) => forbidden(b, x, y, X));
      fbCache = { key, cells };
      return cells;
    }
    function drawForbidden(s, x0, x1, y0, y1) {
      const cells = forbiddenCells();
      if (!cells.length) return;
      ctx.strokeStyle = '#e5392f';
      ctx.lineWidth = Math.max(1.5, s * 0.06);
      ctx.lineCap = 'round';
      const r = s * 0.14;
      for (const [x, y] of cells) {
        if (x < x0 || x > x1 || y < y0 || y > y1) continue;
        const [sx, sy] = toScreen(x, y);
        // Nền đỏ nhạt + ✕ nhỏ: khác hẳn quân X (to, không nền)
        ctx.fillStyle = 'rgba(229, 57, 47, 0.14)';
        ctx.fillRect(sx - s / 2 + 1, sy - s / 2 + 1, s - 1, s - 1);
        ctx.beginPath();
        ctx.moveTo(sx - r, sy - r); ctx.lineTo(sx + r, sy + r);
        ctx.moveTo(sx + r, sy - r); ctx.lineTo(sx - r, sy + r);
        ctx.stroke();
      }
    }

    /** Đánh dấu của phân tích / giải đố: huy hiệu loại nước, nước gợi ý (vòng nét đứt), nước sai. */
    /** Tên cột: a…z, rồi aa, ab… (bàn cờ vô hạn nên chỉ đặt tên trong phạm vi ván đang phân tích). */
    const colName = (c) => (c < 26 ? String.fromCharCode(97 + c) : String.fromCharCode(96 + Math.floor(c / 26)) + String.fromCharCode(97 + (c % 26)));
    let fontFamily = ''; // phông chữ của trang (đọc 1 lần, không gọi getComputedStyle mỗi khung hình)
    function drawMarks(s, x0, x1, y0, y1) {
      for (const m of state.marks) {
        if (m.x < x0 || m.x > x1 || m.y < y0 || m.y > y1) continue;
        const [sx, sy] = toScreen(m.x, m.y);
        if (m.kind === 'ghost') {
          ctx.strokeStyle = m.color;
          ctx.lineWidth = Math.max(2, s * 0.08);
          ctx.setLineDash([Math.max(3, s * 0.12), Math.max(3, s * 0.1)]);
          ctx.beginPath();
          ctx.arc(sx, sy, s * 0.4, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
          if (m.p) drawStone(m.p, sx, sy, s, 0.35);
        } else if (m.kind === 'bad') {
          ctx.fillStyle = m.color;
          ctx.globalAlpha = 0.18;
          ctx.fillRect(sx - s / 2 + 1, sy - s / 2 + 1, s - 1, s - 1);
          ctx.globalAlpha = 1;
        }
        if (m.text) {
          // Huy hiệu tròn ở góc trên bên phải ô
          const r = Math.max(7, s * 0.2);
          const bx = sx + s * 0.38, by = sy - s * 0.38;
          ctx.fillStyle = m.color;
          ctx.beginPath();
          ctx.arc(bx, by, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = colors.bg;
          ctx.stroke();
          ctx.fillStyle = '#fff';
          ctx.font = `700 ${Math.round(r * (m.text.length > 1 ? 1.05 : 1.3))}px ${fontFamily || (fontFamily = getComputedStyle(document.body).fontFamily)}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(m.text, bx, by + 0.5);
        }
      }
    }

    // ------------------------------------------------------------ Camera
    let camAnim = null;
    function animateCamera(x, y, size) {
      camAnim = { from: { ...cam }, to: { x, y, size: size || cam.size }, t0: performance.now(), dur: 320 };
      requestDraw();
    }
    let inertia = null;

    function stepAnimations(now) {
      if (camAnim) {
        const t = Math.min(1, (now - camAnim.t0) / camAnim.dur);
        const e = 1 - Math.pow(1 - t, 3);
        const { from, to } = camAnim;
        cam.x = from.x + (to.x - from.x) * e;
        cam.y = from.y + (to.y - from.y) * e;
        cam.size = from.size + (to.size - from.size) * e;
        if (t >= 1) { camAnim = null; saveSoon(); }
      }
      if (inertia) {
        const dt = Math.min(40, now - inertia.t);
        inertia.t = now;
        cam.x -= (inertia.vx * dt) / cam.size;
        cam.y -= (inertia.vy * dt) / cam.size;
        const k = Math.pow(0.994, dt);
        inertia.vx *= k;
        inertia.vy *= k;
        if (Math.hypot(inertia.vx, inertia.vy) < 0.02) { inertia = null; saveSoon(); }
      }
    }

    function ensureVisible(x, y) {
      const [sx, sy] = toScreen(x, y);
      const m = cam.size * 1.5;
      const top = 70, bottom = 90;
      if (sx < m || sx > W - m || sy < top + m || sy > H - bottom - m) {
        animateCamera(x, y - (top - bottom) / 2 / cam.size);
      }
    }

    function centerView() {
      const moves = state.board.moves;
      if (!moves.length) return animateCamera(0, 0, 36);
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const m of moves) {
        minX = Math.min(minX, m.x); maxX = Math.max(maxX, m.x);
        minY = Math.min(minY, m.y); maxY = Math.max(maxY, m.y);
      }
      const w = maxX - minX + 5, h = maxY - minY + 5;
      const size = clamp(Math.min(W / w, (H - 160) / h), MIN_SIZE, 48);
      animateCamera((minX + maxX) / 2, (minY + maxY) / 2, size);
    }

    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

    function zoomAt(sx, sy, newSize) {
      newSize = clamp(newSize, MIN_SIZE, MAX_SIZE);
      const wx = (sx - W / 2) / cam.size + cam.x;
      const wy = (sy - H / 2) / cam.size + cam.y;
      cam.size = newSize;
      cam.x = wx - (sx - W / 2) / newSize;
      cam.y = wy - (sy - H / 2) / newSize;
      requestDraw();
      saveSoon();
    }

    let saveTimer = 0;
    function saveSoon() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(save, 400);
    }

    return {
      readColors, resize, toScreen, toCell, requestDraw, animateCamera, ensureVisible, centerView, clamp, zoomAt, saveSoon, colName,
      get W() { return W; },
      get H() { return H; },
      /** Chạm vào bàn cờ: dừng hoạt ảnh camera và quán tính. */
      stopMotion() { inertia = null; camAnim = null; },
      /** Lăn chuột / touchpad: dừng hoạt ảnh camera. */
      stopAnim() { camAnim = null; },
      /** Vuốt nhanh rồi thả: trượt tiếp theo quán tính (vx, vy: px/ms). */
      fling(vx, vy) { inertia = { vx, vy, t: performance.now() }; },
    };
  };
})();
