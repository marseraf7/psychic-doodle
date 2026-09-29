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

  const SOUNDS = {
    placeX: () => tone(660, 0, 0.09, 'triangle', 0.14),
    placeO: () => tone(520, 0, 0.09, 'triangle', 0.14),
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
    set enabled(v) {
      enabled = !!v;
      try { localStorage.setItem(KEY, enabled ? 'on' : 'off'); } catch (e) { /* riêng tư */ }
    },
  };
})();
