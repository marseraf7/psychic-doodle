/* Âm thanh tổng hợp bằng Web Audio (không cần file âm thanh). Bật/tắt trong Cài đặt. */
(function () {
  'use strict';
  const KEY = 'caro.sound';
  let enabled = true;
  try { enabled = localStorage.getItem(KEY) !== 'off'; } catch (e) { /* riêng tư */ }
  let ctx = null;

  // Trình duyệt chỉ cho phát âm thanh sau lần chạm/bấm đầu tiên.
  function unlock() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) ctx = new AC();
  }
  ['pointerdown', 'keydown'].forEach((ev) => window.addEventListener(ev, unlock, { capture: true, passive: true }));

  function tone(freq, start, dur, type, vol) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.value = freq;
    const t = ctx.currentTime + start;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.12, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  // Kiểu âm thanh đặt quân: classic (tiếng "bíp" nhẹ), wood (tiếng gõ gỗ), soft (rất nhỏ)
  const STYLES = ['classic', 'wood', 'soft'];
  let style = 'classic';
  try { const v = localStorage.getItem(KEY + 'Style'); if (STYLES.includes(v)) style = v; } catch (e) { /* riêng tư */ }
  /** Tiếng gõ gỗ: tiếng ồn ngắn qua bộ lọc + âm trầm tắt nhanh. */
  function knock(freq) {
    const t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * 0.05);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = freq * 3; f.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.value = 0.5;
    src.connect(f).connect(g).connect(ctx.destination);
    src.start(t);
    tone(freq, 0, 0.06, 'sine', 0.16);
  }
  const place = (f) => (style === 'wood' ? knock(f * 0.35) : style === 'soft' ? tone(f * 0.8, 0, 0.07, 'sine', 0.05) : tone(f, 0, 0.09, 'triangle', 0.14));

  const SOUNDS = {
    placeX: () => place(660),
    placeO: () => place(520),
    win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.22, 'triangle', 0.13)),
    lose: () => [392, 330, 262].forEach((f, i) => tone(f, i * 0.12, 0.25, 'sine', 0.12)),
    draw: () => [523, 523].forEach((f, i) => tone(f, i * 0.15, 0.18, 'sine', 0.1)),
    tick: () => tone(1000, 0, 0.04, 'square', 0.035),
    chat: () => { tone(880, 0, 0.07, 'sine', 0.08); tone(1175, 0.07, 0.09, 'sine', 0.08); },
    notify: () => { tone(784, 0, 0.12, 'sine', 0.1); tone(1047, 0.12, 0.16, 'sine', 0.1); },
  };

  window.CaroSound = {
    play(name) {
      if (!enabled || !ctx || !SOUNDS[name]) return;
      try { if (ctx.state === 'suspended') ctx.resume(); SOUNDS[name](); } catch (e) { /* bỏ qua */ }
    },
    get enabled() { return enabled; },
    get style() { return style; },
    set style(v) {
      if (!STYLES.includes(v)) return;
      style = v;
      try { localStorage.setItem(KEY + 'Style', v); } catch (e) { /* riêng tư */ }
    },
    set enabled(v) {
      enabled = !!v;
      try { localStorage.setItem(KEY, enabled ? 'on' : 'off'); } catch (e) { /* riêng tư */ }
    },
  };
})();
