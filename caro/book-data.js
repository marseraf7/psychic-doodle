/*
 * Sách khai cuộc (sinh tự động bởi server/scripts/build-book.js – đừng sửa tay): { luật: { khoá thế cờ: [x, y] } }.
 */
(function (global) {
  'use strict';
  const DATA = {};
  if (typeof module !== 'undefined' && module.exports) module.exports = DATA;
  else global.CaroBookData = DATA;
})(typeof window !== 'undefined' ? window : globalThis);
