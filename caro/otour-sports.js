/*
 * Giải đấu Offline – bộ môn có sẵn (dùng chung trình duyệt + máy chủ: server/src/hub/otour-spec.js):
 * kiểu kết quả ('score' tỉ số / 'sets' điểm từng set / 'winner' chỉ người thắng), điểm thắng – hoà – thua, tie-break mặc
 * định, số set (Bo), luật set để nhắc khi nhập. Chọn bộ môn ở form tạo giải là có sẵn các giá trị này (sửa được).
 */
(function (global) {
  'use strict';
  const SPORTS = {
    football: { icon: '⚽', result: 'score', points: { w: 3, d: 1, l: 0 }, tiebreaks: ['gdiff', 'gwins', 'h2h'], bestOf: 1 },
    basketball: { icon: '🏀', result: 'score', points: { w: 2, d: 1, l: 1 }, tiebreaks: ['h2h', 'gdiff', 'gwins'], bestOf: 1 },
    volleyball: { icon: '🏐', result: 'sets', points: { w: 3, d: 0, l: 0 }, tiebreaks: ['wins', 'gpct', 'h2h'], bestOf: 5, set: { to: 25, last: 15, by: 2 } },
    badminton: { icon: '🏸', result: 'sets', points: { w: 2, d: 0, l: 0 }, tiebreaks: ['h2h', 'gdiff', 'gwins'], bestOf: 3, set: { to: 21, by: 2, cap: 30 } },
    tabletennis: { icon: '🏓', result: 'sets', points: { w: 2, d: 0, l: 1 }, tiebreaks: ['h2h', 'gdiff', 'gwins'], bestOf: 5, set: { to: 11, by: 2 } },
    tennis: { icon: '🎾', result: 'sets', points: { w: 2, d: 0, l: 0 }, tiebreaks: ['h2h', 'gdiff', 'gwins'], bestOf: 3, set: { to: 6, by: 2, tiebreak: 7 } },
    esports: { icon: '🎮', result: 'sets', points: { w: 3, d: 1, l: 0 }, tiebreaks: ['h2h', 'gdiff', 'gwins'], bestOf: 3 },
    chess: { icon: '♟️', result: 'winner', points: { w: 2, d: 1, l: 0 }, tiebreaks: ['bh1', 'bh', 'sb'], bestOf: 1 },
    other: { icon: '🏆', result: 'score', points: { w: 3, d: 1, l: 0 }, tiebreaks: ['h2h', 'gdiff', 'gwins'], bestOf: 1 },
  };
  const RESULTS = ['score', 'sets', 'winner'];
  const api = { SPORTS, RESULTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.CaroOTourSports = api;
})(typeof window !== 'undefined' ? window : globalThis);
