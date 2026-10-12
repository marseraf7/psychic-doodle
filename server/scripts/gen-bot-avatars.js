// Sinh ảnh đại diện mặc định (SVG) cho 30 nhân vật máy vào caro/img/bots/<id>.svg.
// Mỗi ảnh: nền màu riêng của nhân vật, khuôn mặt (màu da, mắt, miệng khác nhau theo id), kiểu tóc / mũ theo lối đánh
// (Tấn công: tóc dựng + băng đô, Phòng thủ: mũ giáp, Nước đôi: tóc hai màu, Gài bẫy: mũ trùm, Toàn diện: vương miện nhỏ)
// và phụ kiện theo mức.
// Muốn thay ảnh: chép ảnh mới (svg / png / jpg / webp, vuông) vào caro/img/bots/ rồi sửa đường dẫn trong
// caro/bot-looks.js – không cần chạy lại script này.
//   node server/scripts/gen-bot-avatars.js
'use strict';
const fs = require('fs');
const path = require('path');
const B = require('../../caro/bots.js');
const looks = require('../../caro/bot-looks.js');

const OUT = path.join(__dirname, '../../caro/img/bots');
fs.mkdirSync(OUT, { recursive: true });

// Số giả ngẫu nhiên cố định theo id (ảnh giống nhau mỗi lần chạy)
function hash(s) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0; return h; }
const SKIN = ['#f9d7b5', '#f1c27d', '#e0ac69', '#c68642', '#ffdbac', '#d9a066'];
const HAIR = ['#2b2118', '#4a3121', '#6b4423', '#1f2937', '#7c2d12', '#3f3f46'];

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
  return '#' + [f(n >> 16), f((n >> 8) & 255), f(n & 255)].map((v) => v.toString(16).padStart(2, '0')).join('');
}

function eyes(v, ink) {
  switch (v) {
    case 0: return `<circle cx="38" cy="50" r="3.6" fill="${ink}"/><circle cx="62" cy="50" r="3.6" fill="${ink}"/>`;
    case 1: return `<path d="M33 51 q5 -6 10 0 M57 51 q5 -6 10 0" stroke="${ink}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    case 2: return `<ellipse cx="38" cy="50" rx="4.5" ry="5.5" fill="#fff"/><ellipse cx="62" cy="50" rx="4.5" ry="5.5" fill="#fff"/><circle cx="39" cy="51" r="2.6" fill="${ink}"/><circle cx="63" cy="51" r="2.6" fill="${ink}"/>`;
    default: return `<path d="M33 49 h10 M57 49 h10" stroke="${ink}" stroke-width="3.4" stroke-linecap="round"/>`;
  }
}
function mouth(v, ink) {
  switch (v) {
    case 0: return `<path d="M41 64 q9 8 18 0" stroke="${ink}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    case 1: return `<path d="M42 66 h16" stroke="${ink}" stroke-width="3" stroke-linecap="round"/>`;
    case 2: return `<path d="M41 63 q9 10 18 0 z" fill="${ink}"/>`;
    default: return `<path d="M43 66 q7 -5 14 0" stroke="${ink}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
  }
}
// Tóc / mũ theo lối đánh
function top(style, hair, color) {
  switch (style) {
    case 'atk': // tóc dựng + băng đô
      return `<path d="M24 40 l6 -16 l6 10 l6 -14 l6 12 l6 -14 l6 12 l6 -10 l6 16 z" fill="${hair}"/>
        <rect x="23" y="36" width="54" height="7" rx="3" fill="${shade(color, 0.7)}"/>`;
    case 'def': // mũ giáp
      return `<path d="M22 44 a28 26 0 0 1 56 0 z" fill="#94a3b8"/><rect x="20" y="41" width="60" height="6" rx="3" fill="#64748b"/>
        <rect x="47" y="18" width="6" height="24" rx="3" fill="#cbd5e1"/>`;
    case 'dbl': // tóc hai màu (hai đường)
      return `<path d="M24 44 a26 24 0 0 1 26 -24 v24 z" fill="${hair}"/><path d="M50 20 a26 24 0 0 1 26 24 h-26 z" fill="${shade(color, 0.65)}"/>`;
    case 'uni': // Toàn diện: tóc gọn + vương miện nhỏ năm màu (đủ mọi lối)
      return `<path d="M25 44 a25 23 0 0 1 50 0 q-12 -10 -25 -8 q-13 -2 -25 8 z" fill="${hair}"/>
        <path d="M33 26 l5 -9 l6 7 l6 -10 l6 10 l6 -7 l5 9 z" fill="${color}" stroke="${shade(color, 0.6)}" stroke-width="1.5"/>`;
    default: // mũ trùm (gài bẫy)
      return `<path d="M16 86 v-36 a34 34 0 0 1 68 0 v36 h-10 v-34 a24 24 0 0 0 -48 0 v34 z" fill="${shade(color, 0.45)}"/>`;
  }
}
// Phụ kiện theo mức: 1–2 không có, 3 ngôi sao, 4 hai sao, 5 kính, 6 vương miện
function extra(tier) {
  if (tier === 3) return `<path d="M80 18 l2.6 5.3 5.8 .8 -4.2 4.1 1 5.8 -5.2 -2.7 -5.2 2.7 1 -5.8 -4.2 -4.1 5.8 -.8 z" fill="#facc15"/>`;
  if (tier === 4) return `<g fill="#facc15"><path d="M80 14 l2 4.2 4.6 .6 -3.3 3.2 .8 4.6 -4.1 -2.2 -4.1 2.2 .8 -4.6 -3.3 -3.2 4.6 -.6 z"/><path d="M86 28 l2 4.2 4.6 .6 -3.3 3.2 .8 4.6 -4.1 -2.2 -4.1 2.2 .8 -4.6 -3.3 -3.2 4.6 -.6 z"/></g>`;
  if (tier === 5) return `<g fill="#111827"><rect x="29" y="44" width="18" height="11" rx="4"/><rect x="53" y="44" width="18" height="11" rx="4"/><rect x="46" y="47" width="8" height="3"/></g>`;
  if (tier === 6) return `<path d="M30 22 l8 10 l12 -16 l12 16 l8 -10 v14 h-40 z" fill="#facc15" stroke="#b45309" stroke-width="1.5"/>`;
  return '';
}

for (const b of B.BOTS) {
  const look = looks[b.id] || {};
  const color = look.color || '#64748b';
  const h = hash(b.id);
  const skin = SKIN[h % SKIN.length], hair = HAIR[(h >> 3) % HAIR.length], ink = '#1f2937';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${shade(color, 1.25)}"/><stop offset="1" stop-color="${shade(color, 0.8)}"/></linearGradient></defs>
  <rect width="100" height="100" rx="22" fill="url(#g)"/>
  <path d="M18 100 a32 26 0 0 1 64 0 z" fill="${shade(color, 0.55)}"/>
  <ellipse cx="50" cy="54" rx="25" ry="26" fill="${skin}"/>
  ${top(b.style, hair, color)}
  ${eyes((h >> 6) % 4, ink)}
  <circle cx="33" cy="60" r="4" fill="#f87171" opacity="0.35"/><circle cx="67" cy="60" r="4" fill="#f87171" opacity="0.35"/>
  ${mouth((h >> 9) % 4, ink)}
  ${extra(b.tier)}
</svg>
`;
  fs.writeFileSync(path.join(OUT, b.id + '.svg'), svg);
}
console.log('Đã sinh', B.BOTS.length, 'ảnh vào', OUT);
