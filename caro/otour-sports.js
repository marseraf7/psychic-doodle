/*
 * Giải đấu Offline – bộ môn có sẵn (dùng chung trình duyệt + máy chủ: server/src/hub/otour-spec.js):
 * kiểu kết quả ('score' tỉ số / 'sets' điểm từng set / 'winner' chỉ người thắng), điểm thắng – hoà – thua, tie-break mặc
 * định, số set (Bo), luật set (kiểm khi nhập – otour-rules.js), cách gọi hiệp phụ ('aet' hiệp phụ / 'ot' overtime).
 * Chọn bộ môn ở form tạo giải là có sẵn các giá trị này (sửa được).
 */
(function (global) {
  'use strict';
  // points.wx / lx: điểm khi thắng / thua ở set quyết định hoặc sau hiệp phụ / luân lưu (bóng chuyền 3–2: 2 – 1;
  // khúc côn cầu thắng / thua sau hiệp phụ: 2 – 1). Không có thì như thắng / thua thường.
  const SPORTS = {
    football: { icon: '⚽', result: 'score', points: { w: 3, d: 1, l: 0 }, tiebreaks: ['gdiff', 'gwins', 'h2h'], bestOf: 1, extra: 'aet' },
    futsal: { icon: '🥅', result: 'score', points: { w: 3, d: 1, l: 0 }, tiebreaks: ['h2h', 'gdiff', 'gwins'], bestOf: 1, extra: 'aet' },
    basketball: { icon: '🏀', result: 'score', points: { w: 2, d: 1, l: 1 }, tiebreaks: ['h2h', 'gdiff', 'gwins'], bestOf: 1, extra: 'ot' },
    volleyball: { icon: '🏐', result: 'sets', points: { w: 3, d: 0, l: 0, wx: 2, lx: 1 }, tiebreaks: ['wins', 'gpct', 'ppct'], bestOf: 5, set: { to: 25, by: 2, cap: 0, last: 15 } },
    badminton: { icon: '🏸', result: 'sets', points: { w: 2, d: 0, l: 0 }, tiebreaks: ['h2h', 'gdiff', 'pdiff'], bestOf: 3, set: { to: 21, by: 2, cap: 30, last: 0 } },
    tabletennis: { icon: '🏓', result: 'sets', points: { w: 2, d: 0, l: 1 }, tiebreaks: ['h2h', 'gpct', 'ppct'], bestOf: 5, set: { to: 11, by: 2, cap: 0, last: 0 } },
    pickleball: { icon: '🥒', result: 'sets', points: { w: 2, d: 0, l: 0 }, tiebreaks: ['h2h', 'gdiff', 'pdiff'], bestOf: 3, set: { to: 11, by: 2, cap: 0, last: 0 } },
    tennis: { icon: '🎾', result: 'sets', points: { w: 2, d: 0, l: 0 }, tiebreaks: ['h2h', 'gpct', 'ppct'], bestOf: 3, set: { to: 6, by: 2, cap: 7, last: 0 } },
    hockey: { icon: '🏒', result: 'score', points: { w: 3, d: 1, l: 0, wx: 2, lx: 1 }, tiebreaks: ['h2h', 'gdiff', 'gwins'], bestOf: 1, extra: 'ot' },
    handball: { icon: '🤾', result: 'score', points: { w: 2, d: 1, l: 0 }, tiebreaks: ['h2h', 'gdiff', 'gwins'], bestOf: 1, extra: 'aet' },
    esports: { icon: '🎮', result: 'sets', points: { w: 3, d: 1, l: 0 }, tiebreaks: ['h2h', 'gdiff', 'gwins'], bestOf: 3, set: null },
    chess: { icon: '♟️', result: 'winner', points: { w: 2, d: 1, l: 0 }, tiebreaks: ['bh1', 'bh', 'sb'], bestOf: 1 },
    other: { icon: '🏆', result: 'score', points: { w: 3, d: 1, l: 0 }, tiebreaks: ['h2h', 'gdiff', 'gwins'], bestOf: 1, extra: 'aet' },
  };
  const RESULTS = ['score', 'sets', 'winner'];
  const api = { SPORTS, RESULTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.CaroOTourSports = api;
})(typeof window !== 'undefined' ? window : globalThis);
