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
    basketball: { icon: '🏀', result: 'score', points: { w: 2, d: 1, l: 1 }, tiebreaks: ['h2h', 'gdiff', 'gwins'], bestOf: 1, extra: 'ot', unit: 'game' },
    volleyball: { icon: '🏐', result: 'sets', points: { w: 3, d: 0, l: 0, wx: 2, lx: 1 }, tiebreaks: ['wins', 'gpct', 'ppct'], bestOf: 5, set: { to: 25, by: 2, cap: 0, last: 15 } },
    badminton: { icon: '🏸', result: 'sets', points: { w: 2, d: 0, l: 0 }, tiebreaks: ['h2h', 'gdiff', 'pdiff'], bestOf: 3, set: { to: 21, by: 2, cap: 30, last: 0 } },
    tabletennis: { icon: '🏓', result: 'sets', points: { w: 2, d: 0, l: 1 }, tiebreaks: ['h2h', 'gpct', 'ppct'], bestOf: 5, set: { to: 11, by: 2, cap: 0, last: 0 } },
    pickleball: { icon: '🥒', result: 'sets', points: { w: 2, d: 0, l: 0 }, tiebreaks: ['h2h', 'gdiff', 'pdiff'], bestOf: 3, set: { to: 11, by: 2, cap: 0, last: 0 } },
    tennis: { icon: '🎾', result: 'sets', points: { w: 2, d: 0, l: 0 }, tiebreaks: ['h2h', 'gpct', 'ppct'], bestOf: 3, set: { to: 6, by: 2, cap: 7, last: 0 } },
    hockey: { icon: '🏒', result: 'score', points: { w: 3, d: 1, l: 0, wx: 2, lx: 1 }, tiebreaks: ['h2h', 'gdiff', 'gwins'], bestOf: 1, extra: 'ot', unit: 'game' },
    // Bóng bầu dục Mỹ, bóng chày: không hoà (hiệp phụ / hiệp đấu thêm). unit 'game': khi chọn kiểu "điểm từng set" mà
    // không có luật set, mỗi "set" là một trận trong loạt Bo (playoff Bo5 / Bo7 kiểu NBA, MLB, NHL) – form ghi "Trận 1, 2…"
    amfootball: { icon: '🏈', result: 'score', points: { w: 2, d: 1, l: 0 }, tiebreaks: ['h2h', 'gdiff', 'gwins'], bestOf: 1, extra: 'ot', unit: 'game' },
    baseball: { icon: '⚾', result: 'score', points: { w: 2, d: 1, l: 0 }, tiebreaks: ['h2h', 'gdiff', 'gwins'], bestOf: 1, extra: 'ot', unit: 'game' },
    handball: { icon: '🤾', result: 'score', points: { w: 2, d: 1, l: 0 }, tiebreaks: ['h2h', 'gdiff', 'gwins'], bestOf: 1, extra: 'aet' },
    esports: { icon: '🎮', result: 'sets', points: { w: 3, d: 1, l: 0 }, tiebreaks: ['h2h', 'gdiff', 'gwins'], bestOf: 3, set: null },
    // Đua thuyền buồm đối kháng (kiểu America's Cup): mỗi race là một "ván" (Bo13 = ai thắng 7 race trước), không hoà
    sailing: { icon: '⛵', result: 'sets', points: { w: 1, d: 0, l: 0 }, tiebreaks: ['h2h', 'wins'], bestOf: 1, set: null, unit: 'game' },
    // Hệ Race (stages-race.js): preset = mẫu thể thức chọn sẵn khi đổi sang môn này
    racing: { icon: '🏎️', result: 'score', points: { w: 3, d: 1, l: 0 }, tiebreaks: ['h2h', 'gdiff', 'gwins'], bestOf: 1, preset: 'grand_prix' },
    // Xe đạp: mặc định giải nhiều chặng kiểu Grand Tour (stages-gt.js – tổng thời gian, điểm, leo núi, trẻ, đồng đội)
    cycling: { icon: '🚴', result: 'score', points: { w: 3, d: 1, l: 0 }, tiebreaks: ['h2h', 'gdiff', 'gwins'], bestOf: 1, preset: 'stage_race' },
    // Golf đấu gậy (stages-golf.js): vòng đấu, par, cắt, đấu phụ
    golf: { icon: '⛳', result: 'score', points: { w: 3, d: 1, l: 0 }, tiebreaks: ['h2h', 'gdiff', 'gwins'], bestOf: 1, preset: 'stroke_play' },
    running: { icon: '🏃', result: 'score', points: { w: 3, d: 1, l: 0 }, tiebreaks: ['h2h', 'gdiff', 'gwins'], bestOf: 1, preset: 'time_trial' },
    swimming: { icon: '🏊', result: 'score', points: { w: 3, d: 1, l: 0 }, tiebreaks: ['h2h', 'gdiff', 'gwins'], bestOf: 1, preset: 'time_trial' },
    // Trượt băng tốc độ (mass start – stages-massstart.js), trượt tuyết / biathlon (Sprint → Pursuit – stages-pursuit.js)
    skating: { icon: '⛸️', result: 'score', points: { w: 3, d: 1, l: 0 }, tiebreaks: ['h2h', 'gdiff', 'gwins'], bestOf: 1, preset: 'massstart' },
    // Đợt 25: bridge đồng đội (điểm từng ván → IMP → VP – điểm trận là VP), poker có bounty, snooker, game bài sưu tầm (pod)
    bridge: { icon: '🃏', result: 'score', points: { w: 0, d: 0, l: 0 }, tiebreaks: ['h2h', 'gdiff', 'gwins'], bestOf: 1, preset: 'bridge_teams' },
    poker: { icon: '♠️', result: 'score', points: { w: 3, d: 1, l: 0 }, tiebreaks: ['h2h', 'gdiff', 'gwins'], bestOf: 1, preset: 'poker_pko' },
    snooker: { icon: '🎱', result: 'score', points: { w: 2, d: 0, l: 0 }, tiebreaks: ['h2h', 'gdiff', 'gwins'], bestOf: 1, preset: 'snooker_shootout' },
    tcg: { icon: '🎴', result: 'score', points: { w: 3, d: 1, l: 0 }, tiebreaks: ['oppWinPct', 'oppOppWinPct'], bestOf: 3, preset: 'mtg_gp' },
    skiing: { icon: '⛷️', result: 'score', points: { w: 3, d: 1, l: 0 }, tiebreaks: ['h2h', 'gdiff', 'gwins'], bestOf: 1, preset: 'biathlon_pursuit' },
    // Darts (kiểu PDC): mỗi "set" là số leg hai bên thắng – đua tới 3 leg; set quyết định phải hơn 2 leg, 5–5 đấu leg quyết định
    darts: { icon: '🎯', result: 'sets', points: { w: 2, d: 0, l: 0 }, tiebreaks: ['wins', 'gdiff'], bestOf: 5, set: { to: 3, by: 1, cap: 0, last: 0, race: true, lastBy: 2, lastCap: 6 } },
    // Quần vợt đồng đội (kiểu Davis Cup): mỗi "set" là một rubber Bo3 (tỉ số set của rubber), trận = 3 rubber, đấu cả rubber
    // không còn ý nghĩa; xếp hạng: số trận thắng → tỉ lệ rubber → tỉ lệ set
    tennis_team: { icon: '🎾', result: 'sets', points: { w: 1, d: 0, l: 0 }, tiebreaks: ['wins', 'gpct', 'ppct'], bestOf: 3, set: { to: 1, by: 1, cap: 0, last: 0, rubber: 3, dead: true } },
    chess: { icon: '♟️', result: 'winner', points: { w: 2, d: 1, l: 0 }, tiebreaks: ['bh1', 'bh', 'sb'], bestOf: 1 },
    other: { icon: '🏆', result: 'score', points: { w: 3, d: 1, l: 0 }, tiebreaks: ['h2h', 'gdiff', 'gwins'], bestOf: 1, extra: 'aet' },
  };
  const RESULTS = ['score', 'sets', 'winner'];
  const F1 = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1]; // bảng điểm mặc định của hệ Race (như stages-race.js)
  const api = { SPORTS, RESULTS, F1 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.CaroOTourSports = api;
})(typeof window !== 'undefined' ? window : globalThis);
