/*
 * Giải đấu Offline – thư viện mẫu giải nổi tiếng (dùng chung trình duyệt + máy chủ: server/test/otour-templates.test.js
 * kiểm mỗi mẫu đều chuẩn hoá được và chạy được với số đội gợi ý). Mỗi mẫu chỉ là một bản cấu hình
 * { sport, result?, set?, stages } (otour-spec.js) + số đội gợi ý n + mã quốc gia mẫu (league phase) – sau này chatbot AI
 * cũng chỉ viết ra đúng dạng này. Mô tả bằng lời: chuỗi dịch tpl_<id> / tpl_<id>_d (i18n-otour-tpl.js).
 * Chỉ mô phỏng thể thức (cách chia bảng, đi tiếp, số trận) – không dùng tên, logo hay dữ liệu của giải thật.
 */
(function (global) {
  'use strict';
  const TEMPLATES = [
    { id: 'premier_league', icon: '⚽', sport: 'football', n: 20,
      stages: [{ type: 'roundrobin', groups: 1, meetings: 2 }] },
    { id: 'champions_league', icon: '⭐', sport: 'football', n: 36, countries: ['ENG', 'ESP', 'GER', 'ITA', 'FRA', 'POR', 'NED', 'BEL', 'SCO'],
      stages: [{ type: 'roundrobin', league: { games: 8, pots: 4 }, advance: 24 }, { type: 'single', thirdPlace: false, legs: true, legsFinal: false }] },
    { id: 'world_cup_2026', icon: '🌎', sport: 'football', n: 48,
      stages: [{ type: 'roundrobin', groupSize: 4, advance: 2, bestNext: 8 }, { type: 'single', thirdPlace: true, path: 'groups' }] },
    { id: 'world_cup', icon: '🏆', sport: 'football', n: 32,
      stages: [{ type: 'roundrobin', groupSize: 4, advance: 2 }, { type: 'single', thirdPlace: true }] },
    { id: 'lol_worlds', icon: '🎮', sport: 'esports', n: 16,
      stages: [{ type: 'swiss', bestOf: 1, record: { win: 3, lose: 3, bo: 3 } }, { type: 'single', bestOf: 5, thirdPlace: false }] },
    { id: 'f1', icon: '🏎️', sport: 'racing', n: 20,
      stages: [{ type: 'race', events: 24, score: 'points', teams: true }] },
    { id: 'time_trial', icon: '⏱️', sport: 'running', n: 30,
      stages: [{ type: 'race', events: 1, score: 'time' }] },
    { id: 'badminton_open', icon: '🏸', sport: 'badminton', n: 32,
      stages: [{ type: 'single', thirdPlace: false }] },
    { id: 'tabletennis_cup', icon: '🏓', sport: 'tabletennis', n: 16,
      stages: [{ type: 'roundrobin', groupSize: 4, advance: 2 }, { type: 'single', thirdPlace: true }] },
    // Giải nhà nghề Mỹ: mùa giải đúng số trận như thật (miền / bảng con, số lần gặp theo quan hệ – caro/otour-season.js),
    // rồi playoff. Bóng rổ, bóng chày, khúc côn cầu đấu loạt Bo (result 'sets', không luật set: mỗi "set" là một trận)
    { id: 'nba', icon: '🏀', sport: 'basketball', n: 30, result: 'sets', set: null, // 82 trận: 4×4 + 6×4 + 4×3 + 15×2
      stages: [{ type: 'roundrobin', season: { confs: 2, divs: 3, div: { m: 4, x: 0 }, conf: { m: 3, x: 6 }, inter: { m: 2, x: 0 } }, advance: 10,
        points: { w: 1, d: 0, l: 0 }, tiebreaks: ['h2h', 'pdiff', 'wins'] },
      // Hạng 1–6 vào thẳng, 7–10 đá play-in giành 2 suất; mỗi miền 8 đội, mọi vòng Bo7, chung kết là hai nhà vô địch miền
      { type: 'single', bestOf: 7, thirdPlace: false, playoff: { per: 8, playin: 'nba' } }] },
    { id: 'nfl', icon: '🏈', sport: 'amfootball', n: 32, // 17 trận: 3×2 + 6 đội cùng miền + 5 đội miền kia
      stages: [{ type: 'roundrobin', season: { confs: 2, divs: 4, div: { m: 2, x: 0 }, conf: { m: 0, x: 6 }, inter: { m: 0, x: 5 } }, advance: 7 },
      // 4 đội nhất bảng con giữ hạt giống 1–4, 3 vé vớt 5–7; hạt giống 1 miễn vòng đầu; xếp lại cặp sau mỗi vòng
      { type: 'single', bestOf: 1, thirdPlace: false, playoff: { per: 7, divWin: true, reseed: true } }] },
    { id: 'mlb', icon: '⚾', sport: 'baseball', n: 30, result: 'sets', set: null, // 162 trận: 4×13 + 6×6 + 4×7 + 14×3 + 1×4
      stages: [{ type: 'roundrobin', season: { confs: 2, divs: 3, div: { m: 13, x: 0 }, conf: { m: 6, x: 4 }, inter: { m: 3, x: 1 } }, advance: 6,
        points: { w: 1, d: 0, l: 0 }, tiebreaks: ['h2h', 'pdiff', 'wins'] },
      // 3 đội nhất bảng con (hạt giống 1–3) + 3 vé vớt; 1, 2 miễn vòng wild card (Bo3), rồi Bo5, Bo7, World Series Bo7
      { type: 'single', bestOf: 5, boRounds: [3, 5, 7, 7], thirdPlace: false, playoff: { per: 6, divWin: true } }] },
    { id: 'nhl', icon: '🏒', sport: 'hockey', n: 32, result: 'sets', set: null, // 82 trận: 5×4 + 2×3 + 8×3 + 16×2
      stages: [{ type: 'roundrobin', season: { confs: 2, divs: 2, div: { m: 3, x: 5 }, conf: { m: 3, x: 0 }, inter: { m: 2, x: 0 } }, advance: 8,
        points: { w: 2, d: 0, l: 0 }, tiebreaks: ['wins', 'h2h', 'pdiff'] },
      // Mỗi bảng con 3 đội đầu + 2 vé vớt mỗi miền; nhánh theo bảng con; mọi vòng Bo7
      { type: 'single', bestOf: 7, thirdPlace: false, playoff: { mode: 'div' } }] },
    { id: 'mls', icon: '⚽', sport: 'football', n: 30, // 34 trận: 14×2 trong miền + 6 đội miền kia
      stages: [{ type: 'roundrobin', season: { confs: 2, divs: 1, div: { m: 2, x: 0 }, conf: { m: 0, x: 0 }, inter: { m: 0, x: 6 } }, advance: 9 },
      // Hạng 8 gặp 9 giành suất cuối; vòng 1 đấu loạt Bo3, các vòng sau một trận
      { type: 'single', bestOf: 1, boRounds: [3, 1], thirdPlace: false, playoff: { per: 8, playin: 'one' } }] },
    { id: 'volleyball_league', icon: '🏐', sport: 'volleyball', n: 8,
      stages: [{ type: 'roundrobin', groups: 1, advance: 4 }, { type: 'single', thirdPlace: true }] },
  ];
  const byId = (id) => TEMPLATES.find((x) => x.id === id) || null;

  /**
   * Bản cấu hình của mẫu (bản sao – sửa thoải mái): điểm / tie-break / Bo lấy theo bộ môn nếu mẫu không ghi.
   * sports: CaroOTourSports.SPORTS (truyền vào để file này không phụ thuộc thứ tự nạp).
   */
  function specOf(tpl, sports) {
    const sp = sports[tpl.sport] || sports.other;
    const stages = JSON.parse(JSON.stringify(tpl.stages)).map((c) => {
      if (c.type !== 'race' && c.bestOf == null) c.bestOf = sp.bestOf;
      if ((c.type === 'roundrobin' || c.type === 'swiss') && !c.points) { c.points = { ...sp.points }; if (!c.tiebreaks) c.tiebreaks = [...sp.tiebreaks]; }
      if (c.type === 'race' && c.score !== 'time' && !c.table) c.table = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
      return c;
    });
    return { sport: tpl.sport, result: tpl.result || sp.result, ...(tpl.set !== undefined ? { set: tpl.set } : {}), stages };
  }

  /** Danh sách đội mẫu để thử nhanh: "Đội 1", … (league phase: kèm mã quốc gia mẫu xoay vòng; đua: kèm đội). */
  function sampleTeams(tpl, word = 'Team') {
    return Array.from({ length: tpl.n }, (_, i) => {
      let s = `${word} ${i + 1}`;
      if (tpl.countries) s += ' | ' + tpl.countries[i % tpl.countries.length];
      else if (tpl.stages.some((c) => c.teams)) s += ' |  | ' + `${word} ${String.fromCharCode(65 + Math.floor(i / 2) % 26)}`;
      return s;
    });
  }

  const api = { TEMPLATES, byId, specOf, sampleTeams };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.CaroOTourTemplates = api;
})(typeof window !== 'undefined' ? window : globalThis);
