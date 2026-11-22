/*
 * Ngôn ngữ phía máy chủ: danh sách chung với trình duyệt (caro/langs.js – mã, tên, <html lang>, hreflang, og:locale, dự
 * phòng) + chữ phía máy chủ của các ngôn ngữ thư mục (zh-Hant, ja, ko, cs).
 *
 * Chữ phía máy chủ của 4 ngôn ngữ gốc nằm ngay trong file dùng nó (og-meta.js, domain-move.js, hub/shared.js,
 * mcp/ui/widget-i18n.js). Ngôn ngữ thư mục: MỘT file cho mỗi ngôn ngữ, server/src/i18n/<mã>.js (mẫu: i18n/ja.js):
 *   module.exports = { og: {…}, move: [chữ, nút], mail: { verify: { subject, body(u, c) }, reset: {…} }, widget: {…} }
 * Mục / khoá thiếu thì lấy tiếng Anh (fallback trong caro/langs.js). Bài thử: server/test/i18n-langs.test.js.
 */
'use strict';
const L = require('../../caro/langs.js');

const cache = {};
/** Chữ phía máy chủ của ngôn ngữ thư mục l (server/src/i18n/<l>.js), {} nếu chưa có file. */
function serverTexts(l) {
  if (!(l in cache)) {
    let m = {};
    try { m = require('./i18n/' + l + '.js'); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; }
    cache[l] = m || {};
  }
  return cache[l];
}

/** Bảng { vi, en, ru, zh } của một mục (og, move, mail, widget) + bảng của các ngôn ngữ thư mục đã có file. */
function withDirLangs(section, table) {
  const out = { ...table };
  for (const l of L.DIR) { const t = serverTexts(l)[section]; if (t) out[l] = t; }
  return out;
}

/** Phần của bảng theo ngôn ngữ l: l → ngôn ngữ dự phòng (tiếng Anh) → tiếng Việt. */
const own = (t, k) => (k && Object.prototype.hasOwnProperty.call(t, k) ? t[k] : null); // mã lạ từ máy khách ('__proto__'…): bỏ
const pick = (table, l) => own(table, l) || own(table, L.fallback(l)) || table.vi;

module.exports = { ...L, serverTexts, withDirLangs, pick };
