/*
 * Chia sẻ ván đẹp: ảnh PNG thế cờ cuối và GIF động từng nước (như Lichess xuất GIF), để đăng Facebook / Zalo.
 * Vẽ bằng canvas theo màu bàn / kiểu quân đang chọn; GIF mã hoá ngay trên máy (GIF89a + LZW, không cần thư viện).
 * Gửi đi: bảng chia sẻ của điện thoại (ứng dụng: ghi file tạm rồi chia sẻ), không hỗ trợ thì tải file về.
 */
(function () {
  'use strict';
  const C = window.Caro;
  const T = window.I18N.t;
  const $ = (id) => document.getElementById(id);
  const toast = (m, ms) => window.CaroOnline && window.CaroOnline.toast(m, ms);

  // ---------------------------------------------------------------- Vẽ một khung hình
  function palette() {
    const cs = getComputedStyle(document.documentElement);
    const v = (k) => cs.getPropertyValue('--' + k).trim();
    return {
      bg: v('board') || v('bg'), grid: v('board-grid') || v('grid'), x: v('x'), o: v('o'), win: v('win') || '#2a9d55',
      panel: v('panel'), text: v('text'), muted: v('muted'), last: v('last'),
    };
  }

  /**
   * Vẽ thế cờ sau n nước lên ctx (W x H). info: { x, o, result } – tên hai bên và dòng kết quả.
   * box: khung toạ độ cố định cho mọi khung hình (để GIF không bị nhảy).
   */
  function drawFrame(ctx, W, H, moves, n, info, box, col, final) {
    const head = 56, foot = 26;
    ctx.fillStyle = col.panel;
    ctx.fillRect(0, 0, W, H);
    const bw = W - 16, bh = H - head - foot - 8;
    const cols = box.x1 - box.x0 + 1, rows = box.y1 - box.y0 + 1;
    const s = Math.floor(Math.min(bw / cols, bh / rows));
    const ox = Math.round((W - s * cols) / 2), oy = head + Math.round((bh - s * rows) / 2);
    ctx.fillStyle = col.bg;
    ctx.fillRect(ox, oy, s * cols, s * rows);
    ctx.strokeStyle = col.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= cols; i++) { ctx.moveTo(ox + i * s + 0.5, oy); ctx.lineTo(ox + i * s + 0.5, oy + s * rows); }
    for (let j = 0; j <= rows; j++) { ctx.moveTo(ox, oy + j * s + 0.5); ctx.lineTo(ox + s * cols, oy + j * s + 0.5); }
    ctx.stroke();
    const cell = (x, y) => [ox + (x - box.x0) * s + s / 2, oy + (y - box.y0) * s + s / 2];
    const b = new C.Board();
    for (let i = 0; i < n; i++) b.play(moves[i][0], moves[i][1], i % 2 ? C.O : C.X);
    if (n) {
      const [lx, ly] = cell(moves[n - 1][0], moves[n - 1][1]);
      ctx.fillStyle = col.last;
      ctx.fillRect(lx - s / 2 + 1, ly - s / 2 + 1, s - 1, s - 1);
    }
    for (const m of b.moves) {
      const [sx, sy] = cell(m.x, m.y);
      window.CaroStyle.drawStone(ctx, m.p, sx, sy, s, 1, col);
    }
    if (final && n) {
      const last = b.moves[n - 1];
      const w = C.checkWin(b, last.x, last.y, last.p);
      if (w) {
        const [ax, ay] = cell(w[0][0], w[0][1]), [bx, by] = cell(w[w.length - 1][0], w[w.length - 1][1]);
        ctx.strokeStyle = col.win;
        ctx.lineWidth = Math.max(3, s * 0.14);
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      }
    }
    // Đầu: tên hai bên + kết quả; chân: tên game
    const font = getComputedStyle(document.body).fontFamily;
    ctx.textBaseline = 'middle';
    ctx.font = `700 17px ${font}`;
    ctx.fillStyle = col.x;
    ctx.textAlign = 'left';
    ctx.fillText('X', 12, 20);
    ctx.fillStyle = col.text;
    ctx.fillText(clip(ctx, info.x, W / 2 - 40), 30, 20);
    ctx.fillStyle = col.o;
    ctx.textAlign = 'right';
    ctx.fillText('O', W - 12, 20);
    ctx.fillStyle = col.text;
    ctx.fillText(clip(ctx, info.o, W / 2 - 40), W - 30, 20);
    ctx.font = `500 13px ${font}`;
    ctx.fillStyle = col.muted;
    ctx.textAlign = 'center';
    ctx.fillText(final ? info.result : T('n_moves', { n }), W / 2, 42);
    ctx.font = `600 12px ${font}`;
    ctx.fillText('✦ ' + T('app_title') + ' ✦', W / 2, H - 13);
  }
  function clip(ctx, text, max) {
    text = String(text || '?');
    if (ctx.measureText(text).width <= max) return text;
    while (text.length > 1 && ctx.measureText(text + '…').width > max) text = text.slice(0, -1);
    return text + '…';
  }
  function boxOf(moves) {
    const xs = moves.map((m) => m[0]), ys = moves.map((m) => m[1]);
    const box = { x0: Math.min(0, ...xs) - 2, x1: Math.max(0, ...xs) + 2, y0: Math.min(0, ...ys) - 2, y1: Math.max(0, ...ys) + 2 };
    // Vuông vắn hơn cho ảnh
    while (box.x1 - box.x0 < box.y1 - box.y0 - 2) { box.x0--; box.x1++; }
    while (box.y1 - box.y0 < box.x1 - box.x0 - 4) { box.y0--; box.y1++; }
    return box;
  }

  // ---------------------------------------------------------------- PNG
  function png(game) {
    const W = 720, H = 800;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    drawFrame(cv.getContext('2d'), W, H, game.moves, game.moves.length, game, boxOf(game.moves), palette(), true);
    return new Promise((res) => cv.toBlob(res, 'image/png'));
  }

  // ---------------------------------------------------------------- GIF (GIF89a, LZW)
  /** Gom màu của khung hình về bảng tối đa 256 màu (màu hay gặp nhất), trả về chỉ số từng điểm ảnh. */
  function buildPalette(frames) {
    const count = new Map();
    for (const f of frames) {
      const d = f.data;
      for (let i = 0; i < d.length; i += 4 * 3) { // lấy mẫu 1/3 điểm ảnh
        const k = ((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3);
        count.set(k, (count.get(k) || 0) + 1);
      }
    }
    const top = [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 256).map(([k]) => [((k >> 10) & 31) << 3 | 4, ((k >> 5) & 31) << 3 | 4, (k & 31) << 3 | 4]);
    while (top.length < 256) top.push([0, 0, 0]);
    return top;
  }
  function indexFrame(f, pal) {
    const out = new Uint8Array(f.width * f.height);
    const cache = new Map();
    const d = f.data;
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      const k = ((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3);
      let idx = cache.get(k);
      if (idx === undefined) {
        let best = 0, bd = Infinity;
        for (let j = 0; j < pal.length; j++) {
          const dr = pal[j][0] - d[i], dg = pal[j][1] - d[i + 1], db = pal[j][2] - d[i + 2];
          const dist = dr * dr * 2 + dg * dg * 4 + db * db * 3;
          if (dist < bd) { bd = dist; best = j; }
        }
        idx = best;
        cache.set(k, idx);
      }
      out[p] = idx;
    }
    return out;
  }
  /** Nén LZW cho GIF (mã độ dài thay đổi, tối đa 12 bit). */
  function lzw(pixels, minCode) {
    const clear = 1 << minCode, eoi = clear + 1;
    const bytes = [];
    let cur = 0, bits = 0;
    let size = minCode + 1;
    const out = (code) => {
      cur |= code << bits;
      bits += size;
      while (bits >= 8) { bytes.push(cur & 255); cur >>= 8; bits -= 8; }
    };
    let dict = new Map();
    let next = eoi + 1;
    out(clear);
    let prefix = pixels[0];
    for (let i = 1; i < pixels.length; i++) {
      const c = pixels[i];
      const key = prefix * 4096 + c;
      const hit = dict.get(key);
      if (hit !== undefined) { prefix = hit; continue; }
      out(prefix);
      if (next < 4096) {
        dict.set(key, next++);
        if (next > (1 << size) && size < 12) size++;
      } else {
        out(clear);
        dict = new Map();
        next = eoi + 1;
        size = minCode + 1;
      }
      prefix = c;
    }
    out(prefix);
    out(eoi);
    if (bits > 0) bytes.push(cur & 255);
    return bytes;
  }
  function gifBytes(frames, W, H, delays) {
    const pal = buildPalette(frames);
    const b = [];
    const str = (s) => { for (const ch of s) b.push(ch.charCodeAt(0)); };
    const u16 = (n) => b.push(n & 255, (n >> 8) & 255);
    str('GIF89a'); u16(W); u16(H);
    b.push(0xf7, 0, 0); // bảng màu chung 256 màu
    for (const [r, g, bl] of pal) b.push(r, g, bl);
    b.push(0x21, 0xff, 11); str('NETSCAPE2.0'); b.push(3, 1); u16(0); b.push(0); // lặp mãi
    frames.forEach((f, i) => {
      b.push(0x21, 0xf9, 4, 0x04); u16(delays[i]); b.push(0, 0); // thời gian hiện (1/100 giây)
      b.push(0x2c); u16(0); u16(0); u16(W); u16(H); b.push(0);
      b.push(8);
      const data = lzw(indexFrame(f, pal), 8);
      for (let k = 0; k < data.length; k += 255) {
        const chunk = data.slice(k, k + 255);
        b.push(chunk.length, ...chunk);
      }
      b.push(0);
    });
    b.push(0x3b);
    return new Uint8Array(b);
  }
  async function gif(game) {
    const W = 360, H = 400;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    const col = palette(), box = boxOf(game.moves);
    const n = game.moves.length;
    const step = Math.max(1, Math.ceil(n / 90)); // tối đa ~90 khung hình
    const frames = [], delays = [];
    for (let k = 0; k <= n; k += step) {
      drawFrame(ctx, W, H, game.moves, k, game, box, col, false);
      frames.push(ctx.getImageData(0, 0, W, H));
      delays.push(k === 0 ? 80 : 55);
      if (frames.length % 10 === 0) await new Promise((r) => setTimeout(r, 0)); // không làm đơ giao diện
    }
    drawFrame(ctx, W, H, game.moves, n, game, box, col, true);
    frames.push(ctx.getImageData(0, 0, W, H));
    delays.push(300);
    await new Promise((r) => setTimeout(r, 0));
    return new Blob([gifBytes(frames, W, H, delays)], { type: 'image/gif' });
  }

  // ---------------------------------------------------------------- Gửi đi
  const b64 = (blob) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.readAsDataURL(blob); });
  async function deliver(blob, name) {
    const title = T('app_title');
    const N = window.CaroNative;
    if (N && N.shareFile) {
      try { await N.shareFile(name, await b64(blob), title); return; } catch (e) { if (/cancel/i.test(String(e && e.message))) return; }
    }
    const file = new File([blob], name, { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] }) && matchMedia('(pointer: coarse)').matches) {
      try { await navigator.share({ files: [file], title }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    toast(T('share_saved'));
  }

  // ---------------------------------------------------------------- Hộp chia sẻ (trong chế độ xem lại)
  let current = null; // { game, link }
  function open(game, onLink) {
    current = { game, onLink };
    $('sh-link').hidden = !onLink;
    $('sh-err').textContent = '';
    window.CaroOnline.openDlg('share-dlg');
  }
  const stamp = () => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  async function run(kind, btn) {
    if (!current) return;
    btn.disabled = true;
    const label = btn.querySelector('span').textContent;
    btn.querySelector('span').textContent = T('share_making');
    try {
      const blob = kind === 'gif' ? await gif(current.game) : await png(current.game);
      await deliver(blob, `caro-${stamp()}.${kind}`);
      window.CaroOnline.closeDlg('share-dlg');
    } catch (e) {
      $('sh-err').textContent = T('share_fail');
    } finally {
      btn.disabled = false;
      btn.querySelector('span').textContent = label;
    }
  }
  $('sh-png').onclick = () => run('png', $('sh-png'));
  $('sh-gif').onclick = () => run('gif', $('sh-gif'));
  $('sh-link').onclick = () => { window.CaroOnline.closeDlg('share-dlg'); if (current && current.onLink) current.onLink(); };

  window.CaroShare = { open, png, gif, gifBytes, lzw };
})();
