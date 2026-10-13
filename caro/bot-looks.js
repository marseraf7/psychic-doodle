/*
 * Ngoại hình của 31 nhân vật máy (30 + trùm cuối BOAT): ảnh đại diện, biểu tượng, màu riêng. File này chỉ có dữ liệu – sửa thoải mái.
 *
 *   avatar – đường dẫn ảnh đại diện (svg / png / jpg / webp, nên là ảnh vuông, từ 128×128 trở lên).
 *            Ảnh mặc định nằm trong img/bots/ (sinh bằng server/scripts/gen-bot-avatars.js).
 *            Đổi ảnh: chép ảnh mới vào img/bots/ (vd. img/bots/rong.png) rồi sửa đường dẫn ở đây.
 *   icon   – biểu tượng nhỏ ở góc ảnh và cạnh tên: một emoji, hoặc đường dẫn ảnh nhỏ (vd. 'img/bots/icons/goat.png').
 *   color  – màu riêng (viền ảnh, nền thẻ khi chọn, chữ tên).
 *
 * Thêm ảnh mới thì nhớ thêm đường dẫn vào FILES trong sw.js (để chơi được khi mất mạng) và tăng CACHE.
 * Số liệu sức cờ / lối đánh nằm ở bots.js; tên và lời thoại ở i18n-bots.js.
 */
(function (global) {
  'use strict';
  const LOOKS = {
    // ---- Mức ~600
    tit: { avatar: 'img/bots/tit.svg', icon: '🐣', color: '#fb923c' },
    na: { avatar: 'img/bots/na.svg', icon: '🌸', color: '#f59e0b' },
    mo: { avatar: 'img/bots/mo.svg', icon: '🏝️', color: '#eab308' },
    bom: { avatar: 'img/bots/bom.svg', icon: '🐍', color: '#84cc16' },
    trinh: { avatar: 'img/bots/trinh.svg', icon: '🧩', color: '#0891b2' },
    // ---- Mức ~900
    ti: { avatar: 'img/bots/ti.svg', icon: '🛵', color: '#22c55e' },
    nam: { avatar: 'img/bots/nam.svg', icon: '🍗', color: '#10b981' },
    lan: { avatar: 'img/bots/lan.svg', icon: '🥤', color: '#14b8a6' },
    cuoi: { avatar: 'img/bots/cuoi.svg', icon: '💄', color: '#d946ef' },
    teliet: { avatar: 'img/bots/teliet.svg', icon: '⚡', color: '#0d9488' },
    // ---- Mức ~1200
    hung: { avatar: 'img/bots/hung.svg', icon: '🎸', color: '#f97316' },
    tuong: { avatar: 'img/bots/tuong.svg', icon: '🌺', color: '#64748b' },
    song: { avatar: 'img/bots/song.svg', icon: '⚽', color: '#06b6d4' },
    bin: { avatar: 'img/bots/bin.svg', icon: '🎲', color: '#3b82f6' },
    fifa: { avatar: 'img/bots/fifa.svg', icon: '🎮', color: '#7c3aed' },
    // ---- Mức ~1500
    loc: { avatar: 'img/bots/loc.svg', icon: '😎', color: '#0ea5e9' },
    da: { avatar: 'img/bots/da.svg', icon: '🍵', color: '#78716c' },
    mai: { avatar: 'img/bots/mai.svg', icon: '🏔️', color: '#ec4899' },
    cao: { avatar: 'img/bots/cao.svg', icon: '🦊', color: '#d97706' },
    sach: { avatar: 'img/bots/sach.svg', icon: '📚', color: '#2563eb' },
    // ---- Mức ~1800
    minh: { avatar: 'img/bots/minh.svg', icon: '💓', color: '#8b5cf6' },
    thanh: { avatar: 'img/bots/thanh.svg', icon: '🗡️', color: '#b45309' },
    kep: { avatar: 'img/bots/kep.svg', icon: '🎓', color: '#6366f1' },
    ninja: { avatar: 'img/bots/ninja.svg', icon: '🧔', color: '#334155' },
    liems: { avatar: 'img/bots/liems.svg', icon: '🎙️', color: '#be123c' },
    // ---- Mức ~2350
    rong: { avatar: 'img/bots/rong.svg', icon: '🔥', color: '#ef4444' }, // Y Đững (tên cũ GOAT chuyển cho nhân vật Toàn diện)
    phao: { avatar: 'img/bots/phao.svg', icon: '🏆', color: '#991b1b' },
    long: { avatar: 'img/bots/long.svg', icon: '🥅', color: '#dc2626' },
    ao: { avatar: 'img/bots/ao.svg', icon: '✌️', color: '#a855f7' },
    goat: { avatar: 'img/bots/goat.svg', icon: '🐐', color: '#ca8a04' },
    // ---- Trùm cuối ~2700
    boat: { avatar: 'img/bots/boat.svg', icon: '⛵', color: '#1d4ed8' }, // BOAT – Best of All Time
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = LOOKS;
  else global.CaroBotLooks = LOOKS;
})(typeof window !== 'undefined' ? window : globalThis);
