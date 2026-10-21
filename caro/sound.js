/*
 * Âm thanh tổng hợp bằng Web Audio (không cần file âm thanh – nhẹ, chơi được khi mất mạng). Bật / tắt, kiểu âm thanh và
 * âm lượng trong Cài đặt → Âm thanh và Cài đặt nhanh (quick-settings.js). Mọi tiếng đi qua một nút âm lượng chung.
 *   CaroSound = { play(name), enabled, style, STYLES, volume (0–100) }
 */
(function () {
  'use strict';
  const KEY = 'caro.sound';
  let enabled = true;
  try { enabled = localStorage.getItem(KEY) !== 'off'; } catch (e) { /* riêng tư */ }
  let volume = 80;
  try { const v = localStorage.getItem(KEY + 'Vol'); if (v !== null && !isNaN(+v)) volume = Math.max(0, Math.min(100, Math.round(+v))); } catch (e) { /* riêng tư */ }
  let ctx = null, out = null;

  // Âm lượng nghe "đều tay" hơn theo hàm mũ: 50 % ≈ một nửa độ to cảm nhận
  const gainOf = (v) => Math.pow(v / 100, 1.6);
  // Trình duyệt chỉ cho phát âm thanh sau lần chạm/bấm đầu tiên.
  function unlock() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    out = ctx.createGain();
    out.gain.value = gainOf(volume);
    out.connect(ctx.destination);
  }
  ['pointerdown', 'keydown'].forEach((ev) => window.addEventListener(ev, unlock, { capture: true, passive: true }));

  function tone(freq, start, dur, type, vol, to) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || 'sine';
    const t = ctx.currentTime + start;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur); // trượt tần số (bong bóng, tương lai)
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.12, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  /** Tiếng ồn ngắn qua bộ lọc (gõ gỗ, đá, phím). */
  function noise(len, filter, freq, q, vol, curve) {
    const n = Math.floor(ctx.sampleRate * len);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, curve || 4);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = filter; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(out);
    src.start(ctx.currentTime);
  }

  // Kiểu âm thanh đặt quân (f: cao độ của bên X / O)
  const PLACE = {
    classic: (f) => tone(f, 0, 0.09, 'triangle', 0.14),                                   // "bíp" nhẹ
    wood: (f) => { noise(0.05, 'bandpass', f * 1.05, 1.2, 0.5); tone(f * 0.35, 0, 0.06, 'sine', 0.16); }, // gõ gỗ
    soft: (f) => tone(f * 0.8, 0, 0.07, 'sine', 0.05),                                     // rất nhỏ
    stone: (f) => { noise(0.03, 'highpass', 2500, 0.7, 0.45, 6); tone(f * 0.28, 0, 0.05, 'sine', 0.12); }, // quân đá cờ vây
    piano: (f) => { const n = f * 0.8; tone(n, 0, 0.6, 'sine', 0.14); tone(n * 2, 0, 0.35, 'sine', 0.04); tone(n * 3, 0, 0.2, 'sine', 0.02); },
    nes: (f) => { tone(f, 0, 0.05, 'square', 0.06); tone(f * 1.5, 0.05, 0.06, 'square', 0.06); }, // máy chơi game 8-bit
    pop: (f) => tone(f * 1.4, 0, 0.07, 'sine', 0.16, f * 0.45),                            // bong bóng
    robot: (f) => { tone(f * 0.5, 0, 0.07, 'sawtooth', 0.05); tone(f * 0.75, 0.07, 0.07, 'sawtooth', 0.05); },
    future: (f) => { tone(f * 0.5, 0, 0.12, 'sine', 0.1, f * 1.6); tone(f * 1.6, 0.1, 0.08, 'sine', 0.04); },
    click: () => noise(0.015, 'highpass', 3500, 0.8, 0.6, 2),                              // phím cơ
  };
  const STYLES = Object.keys(PLACE);
  let style = 'classic';
  try { const v = localStorage.getItem(KEY + 'Style'); if (STYLES.includes(v)) style = v; } catch (e) { /* riêng tư */ }

  const SOUNDS = {
    placeX: () => PLACE[style](660),
    placeO: () => PLACE[style](520),
    win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.22, 'triangle', 0.13)),
    lose: () => [392, 330, 262].forEach((f, i) => tone(f, i * 0.12, 0.25, 'sine', 0.12)),
    draw: () => [523, 523].forEach((f, i) => tone(f, i * 0.15, 0.18, 'sine', 0.1)),
    tick: () => tone(1000, 0, 0.04, 'square', 0.035),
    chat: () => { tone(880, 0, 0.07, 'sine', 0.08); tone(1175, 0.07, 0.09, 'sine', 0.08); },
    notify: () => { tone(784, 0, 0.12, 'sine', 0.1); tone(1047, 0.12, 0.16, 'sine', 0.1); },
  };

  window.CaroSound = {
    STYLES,
    play(name) {
      if (!enabled || !ctx || !volume || !SOUNDS[name]) return;
      try { if (ctx.state === 'suspended') ctx.resume(); SOUNDS[name](); } catch (e) { /* bỏ qua */ }
    },
    get enabled() { return enabled; },
    set enabled(v) {
      enabled = !!v;
      try { localStorage.setItem(KEY, enabled ? 'on' : 'off'); } catch (e) { /* riêng tư */ }
    },
    get style() { return style; },
    set style(v) {
      if (!STYLES.includes(v)) return;
      style = v;
      try { localStorage.setItem(KEY + 'Style', v); } catch (e) { /* riêng tư */ }
    },
    get volume() { return volume; },
    set volume(v) {
      const n = Math.max(0, Math.min(100, Math.round(+v)));
      if (isNaN(n)) return;
      volume = n;
      if (out) out.gain.setTargetAtTime(gainOf(n), ctx.currentTime, 0.02);
      try { localStorage.setItem(KEY + 'Vol', String(n)); } catch (e) { /* riêng tư */ }
    },
  };
})();
