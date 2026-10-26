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

    // Quay bàn 90° mỗi nấc (bar-menu.js → board-rotate.js) ở tầng ánh xạ — mọi thứ vẽ qua toScreen (lưới, quân,
    // đánh dấu, toạ độ) và mọi cú bấm qua toCell đều quay theo, quân và chữ vẫn đứng thẳng.
    const R = window.CaroBoardRotate.create(canvas, () => requestDraw());
    const toScreen = (wx, wy) => {
      const [u, v] = R.rot((wx - cam.x) * cam.size, (wy - cam.y) * cam.size);
      return [u + W / 2, v + H / 2];
    };
    // Toạ độ bàn cờ liên tục (không làm tròn) của một điểm màn hình – neo phóng to / chụm
    const toWorld = (sx, sy) => {
      R.settle(); // chạm / lăn chuột khi bàn đang quay dở: xong ngay để bấm đúng ô theo hướng mới
      const [u, v] = R.unrot(sx - W / 2, sy - H / 2);
      return [u / cam.size + cam.x, v / cam.size + cam.y];
    };
    const toCell = (sx, sy) => toWorld(sx, sy).map(Math.round);
    /** Độ dời trên màn hình (px) → độ dời camera trên bàn (ô): kéo, vuốt, lăn chuột, phím mũi tên theo hướng đã quay. */
    const screenDelta = (dx, dy) => R.unrot(dx / cam.size, dy / cam.size);

    // Quân nháp (draft-mode.js): danh sách [x, y, p] do module nháp đẩy vào, vẽ mờ viền chấm.
    let drafts = [];
    function setDrafts(list) { drafts = list; requestDraw(); }

    // Đường vẽ chuột phải (draw-lines.js): danh sách [x0, y0, x1, y1, p] + đường đang kéo.
    let drawLines = [], drawPreview = null;
    function setDrawLines(list, prev) { drawLines = list; drawPreview = prev; requestDraw(); }

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

      // Lưới: đường kẻ nằm giữa các ô (toạ độ nửa nguyên). Bàn quay 90° / 270°: trục x của bàn chạy dọc màn hình
      const odd = R.quarter() % 2 === 1;
      const rx = (odd ? H : W) / 2 / s, ry = (odd ? W : H) / 2 / s;
      const x0 = Math.floor(cam.x - rx) - 1, x1 = Math.ceil(cam.x + rx) + 1;
      const y0 = Math.floor(cam.y - ry) - 1, y1 = Math.ceil(cam.y + ry) + 1;
      ctx.lineWidth = 1;
      ctx.strokeStyle = colors.grid;
      ctx.beginPath();
      const line = ([ax, ay], [bx]) => { // đường kẻ thẳng đứng (cùng x) hoặc nằm ngang, khớp điểm ảnh
        if (Math.abs(ax - bx) < 0.5) { const x = Math.round(ax) + 0.5; ctx.moveTo(x, 0); ctx.lineTo(x, H); return; }
        const y = Math.round(ay) + 0.5; ctx.moveTo(0, y); ctx.lineTo(W, y);
      };
      for (let i = x0; i <= x1; i++) line(toScreen(i + 0.5, 0), toScreen(i + 0.5, 1));
      for (let j = y0; j <= y1; j++) line(toScreen(0, j + 0.5), toScreen(1, j + 0.5));
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
        const [cx, cy] = toScreen(last.x, last.y); // tâm ô (góc trên trái của ô đổi theo hướng quay)
        const sx = cx - s / 2, sy = cy - s / 2;
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

      // Quân nháp: quân mờ viền chấm (khác quân thật đặc, khác bóng ma chờ xác nhận viền nét đứt dài).
      if (drafts.length) {
        for (const [x, y, p] of drafts) {
          if (x < x0 || x > x1 || y < y0 || y > y1) continue;
          const [sx, sy] = toScreen(x, y);
          drawStone(p, sx, sy, s, 0.45);
          ctx.strokeStyle = p === X ? colors.x : colors.o;
          ctx.lineWidth = Math.max(1.5, s * 0.05);
          ctx.setLineDash([2, 3]);
          ctx.strokeRect(sx - s / 2 + 2, sy - s / 2 + 2, s - 4, s - 4);
          ctx.setLineDash([]);
        }
      }

      // Đường vẽ chuột phải: nét đậm màu quân, đầu tròn; đường đang kéo mờ hơn.
      if (drawLines.length || drawPreview) {
        const drawOneLine = (l, alpha) => {
          const [x0, y0, x1, y1, p] = l;
          const [ax, ay] = toScreen(x0, y0);
          const [bx, by] = toScreen(x1, y1);
          ctx.strokeStyle = p === X ? colors.x : colors.o;
          ctx.globalAlpha = alpha;
          ctx.lineWidth = Math.max(3, s * 0.12);
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          ctx.stroke();
          ctx.globalAlpha = 1;
        };
        for (const l of drawLines) drawOneLine(l, 0.85);
        if (drawPreview) drawOneLine(drawPreview, 0.5);
      }

      // Quân mờ: chờ xác nhận hoặc rê chuột (không hiện khi đang ở chế độ nháp).
      const ghost = state.pending || state.hover;
      if (ghost && canPlaceNow() && !(window.CaroDraft && window.CaroDraft.active()) && state.board.get(ghost[0], ghost[1]) === EMPTY) {
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

      // Nước đặt trước (premove.js): quân mờ của mình + vòng tròn nét đứt, khác ô chờ xác nhận (khung vuông)
      const pm = window.CaroPremove && window.CaroPremove.cell();
      if (pm && state.online && state.online.side) {
        const [sx, sy] = toScreen(pm[0], pm[1]);
        const side = state.online.side;
        ctx.strokeStyle = side === X ? colors.x : colors.o;
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.arc(sx, sy, s * 0.46, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        drawStone(side, sx, sy, s, 0.4);
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
        // Bàn quay 90° / 270°: cột chạy dọc màn hình nên chữ cái sang mép trái, số hàng xuống mép dưới
        const bottom = (txt, p) => { ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(txt, p[0], H - 3); };
        const left = (txt, p) => { ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(txt, 4, p[1]); };
        for (let x = Math.max(x0, minX); x <= Math.min(x1, maxX); x++) (odd ? left : bottom)(colName(x - minX), toScreen(x, cam.y));
        for (let y = Math.max(y0, minY); y <= Math.min(y1, maxY); y++) (odd ? bottom : left)(String(maxY - y + 1), toScreen(cam.x, y));
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
        const [ix, iy] = screenDelta(inertia.vx * dt, inertia.vy * dt); // quay bàn: quán tính theo hướng vuốt trên màn hình
        cam.x -= ix;
        cam.y -= iy;
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
      const odd = R.quarter() % 2 === 1; // bàn quay 90° / 270°: chiều ngang của bàn nằm dọc màn hình
      const size = clamp(Math.min(W / (odd ? h : w), (H - 160) / (odd ? w : h)), MIN_SIZE, 48);
      animateCamera((minX + maxX) / 2, (minY + maxY) / 2, size);
    }

    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

    function zoomAt(sx, sy, newSize) {
      newSize = clamp(newSize, MIN_SIZE, MAX_SIZE);
      const [wx, wy] = toWorld(sx, sy); // không làm tròn (làm tròn thì mỗi nấc phóng bàn giật nửa ô); đúng cả khi lật bàn
      cam.size = newSize;
      const [dx, dy] = screenDelta(sx - W / 2, sy - H / 2);
      cam.x = wx - dx;
      cam.y = wy - dy;
      requestDraw();
      saveSoon();
    }

    let saveTimer = 0;
    function saveSoon() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(save, 400);
    }

    return {
      readColors, resize, toScreen, toCell, toWorld, requestDraw, animateCamera, ensureVisible, centerView, clamp, zoomAt, saveSoon, colName,
      screenDelta, rotation: R, setDrafts, setDrawLines,
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
