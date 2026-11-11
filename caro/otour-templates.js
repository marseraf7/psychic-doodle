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
    // LoL Worlds (thể thức 2025): 17 đội – hạt giống 16 và 17 đá Play-In một loạt Bo5, 15 đội còn lại vào thẳng vòng
    // Thụy Sĩ 16 đội (thắng 3 đi tiếp, thua 3 bị loại, trận quyết định Bo3, vòng 1 tránh cùng khu vực), 8 đội vào loại
    // trực tiếp Bo5. Cấm chọn kiểu LoL, Fearless cứng trong từng loạt. Khu vực mẫu xếp như Worlds (2 đội Play-In: KR, CN).
    { id: 'lol_worlds', icon: '🎮', sport: 'esports', n: 17, countries: ['KR', 'CN', 'EU', 'NA', 'AP', 'KR', 'CN', 'EU', 'NA', 'AP', 'KR', 'CN', 'EU', 'NA', 'AP', 'KR', 'CN'],
      esports: { draft: 'lol', fearless: 'hard', scope: 'series', stats: ['kills', 'gold', 'towers', 'dragons', 'barons'], players: false },
      stages: [{ type: 'roundrobin', groups: 1, meetings: 1, bestOf: 5, advance: 1 },
        { type: 'swiss', bestOf: 1, record: { win: 3, lose: 3, bo: 3 }, region: true, direct: 15 }, { type: 'single', bestOf: 5, thirdPlace: false }] },
    // America's Cup (thể thức 2024): đội đầu danh sách là đội giữ cúp – vào thẳng trận tranh cúp. 5 đội thách đấu đá vòng
    // tròn 2 lượt (thắng 1 điểm), 4 đội đầu vào bán kết ai thắng 5 race trước (Bo9), chung kết đội thách đấu ai thắng 7
    // race trước (Bo13); đội thắng gặp đội giữ cúp trong trận tranh cúp Bo13. Mỗi race ghi bên vào sân + thời gian về đích.
    { id: 'americas_cup', icon: '⛵', sport: 'sailing', n: 6,
      esports: { draft: 'off', fearless: 'off', stats: ['finish'], sides: 'ps' },
      stages: [{ type: 'roundrobin', groups: 1, meetings: 2, bestOf: 1, advance: 4 },
        { type: 'single', bestOf: 9, boRounds: [9, 13], thirdPlace: false, advance: 1 },
        { type: 'single', bestOf: 13, thirdPlace: false, direct: 1 }] },
    // Tour de France (kiểu 2025): 21 chặng – đồng bằng, đồi, núi, 2 chặng tính giờ cá nhân; 23 đội × 8 tay đua. Bảng tổng
    // thời gian (áo vàng, có giây thưởng 10-6-4), điểm (xanh), leo núi (chấm bi), tay đua trẻ (trắng), đồng đội
    { id: 'tour_de_france', icon: '🚴', sport: 'cycling', n: 184, squad: 8,
      stages: [{ type: 'race', events: 21, score: 'gt', bonus: true,
        kinds: ['flat', 'hilly', 'flat', 'hilly', 'itt', 'hilly', 'hilly', 'flat', 'flat', 'mtn', 'flat', 'mtn', 'itt', 'mtn', 'hilly', 'mtn', 'flat', 'mtn', 'mtn', 'hilly', 'flat'] }] },
    // The Masters (thể thức 2025): khoảng 90 người mời, 4 vòng × 18 lỗ par 72; sau vòng 2 chỉ 50 người đầu và đồng hạng
    // đánh tiếp (cộng dồn); bằng điểm ở hạng nhất thì đấu phụ đột tử lỗ 18, 10 luân phiên. Nhập tổng gậy mỗi vòng
    { id: 'masters', icon: '⛳', sport: 'golf', n: 90,
      stages: [{ type: 'race', events: 4, score: 'golf', input: 'round', cut: { after: 2, top: 50 }, po: [18, 10] }] },
    // Esports World Cup (kiểu 2025): "giải tổng" gom nhiều giải con, mỗi game một giải thể thức riêng; câu lạc bộ có đội ở
    // nhiều game nhận điểm theo thứ hạng ở từng game (1000-750-500-300-200-200-100-100), cộng dồn thành bảng vô địch câu
    // lạc bộ. Tên game chỉ ghi theo thể loại (không dùng tên / dữ liệu của game thật). stages: thể thức mặc định của một giải con
    { id: 'esports_world_cup', icon: '🌐', sport: 'esports', n: 16,
      stages: [{ type: 'single', bestOf: 3, thirdPlace: false }],
      // Bảng điểm theo hạng: 1000-750-500-300-200-150-100-50 (đồng hạng nhận điểm của hạng đó); câu lạc bộ phải có điểm ở ít
      // nhất 2 game và vô địch ít nhất 1 game mới được xếp đầu
      multi: { table: [1000, 750, 500, 300, 200, 150, 100, 50], minTop: 2, needWin: true, games: [
        // MOBA / bắn súng đội: 4 bảng đấu loại kép 4 đội (GSL) → 8 đội loại trực tiếp
        { key: 'moba', sport: 'esports', n: 16, esports: { draft: 'lol', fearless: 'hard', scope: 'series', stats: ['kills', 'gold', 'towers'], players: false },
          stages: [{ type: 'gsl', bestOf: 1, boDecider: 3 }, { type: 'single', bestOf: 3, boFinal: 5, thirdPlace: true }] },
        { key: 'fps', sport: 'esports', n: 16, esports: { draft: 'off', fearless: 'off', stats: ['kills'] },
          stages: [{ type: 'swiss', bestOf: 1, record: { win: 3, lose: 3, bo: 3 } }, { type: 'single', bestOf: 3, thirdPlace: false }] },
        // Sinh tồn có vòng vớt: 24 đội, 12 trận vòng bảng → 8 đội đầu vào thẳng chung kết, 16 đội còn lại đá vòng sinh tồn
        // lấy 8 đội; chung kết 16 đội tối đa 18 trận, sau 12 trận đặt ngưỡng = điểm đội dẫn đầu + 10 (kiểu Smash Rule)
        { key: 'br', sport: 'esports', n: 24, esports: { draft: 'off', fearless: 'off', stats: ['kills'] },
          stages: [{ type: 'race', events: 12, score: 'points', table: [10, 6, 5, 4, 3, 2, 1, 1], kill: 1, advance: 16, skip: 8 },
            { type: 'race', events: 12, score: 'points', table: [10, 6, 5, 4, 3, 2, 1, 1], kill: 1, advance: 8 },
            { type: 'race', events: 18, score: 'points', table: [10, 6, 5, 4, 3, 2, 1, 1], kill: 1, mp: { after: 12, plus: 10 } }] },
        // Sinh tồn match point: 20 đội đấu 10 trận xếp hạt giống, chung kết: đạt 50 điểm rồi thắng một trận thì vô địch
        { key: 'br_mp', sport: 'esports', n: 20, esports: { draft: 'off', fearless: 'off', stats: ['kills'] },
          stages: [{ type: 'race', events: 10, score: 'points', table: [12, 9, 7, 5, 4, 3, 3, 2, 2, 2, 1, 1, 1, 1, 1], kill: 1, advance: 20 },
            { type: 'race', events: 12, score: 'points', table: [12, 9, 7, 5, 4, 3, 3, 2, 2, 2, 1, 1, 1, 1, 1], kill: 1, mp: { at: 50 } }] },
        { key: 'fighting', sport: 'esports', n: 32, esports: { draft: 'off', fearless: 'off', stats: [] },
          stages: [{ type: 'double', bestOf: 3 }] },
        { key: 'chess', sport: 'chess', n: 16,
          stages: [{ type: 'gsl' }, { type: 'single', thirdPlace: true }] }] } },
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
      if (c.type === 'race' && (c.score || 'points') === 'points' && !c.table) c.table = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
      return c;
    });
    return { sport: tpl.sport, result: tpl.result || sp.result, ...(tpl.set !== undefined ? { set: tpl.set } : {}), stages, ...(tpl.esports ? { esports: JSON.parse(JSON.stringify(tpl.esports)) } : {}) };
  }

  /** Danh sách đội mẫu để thử nhanh: "Đội 1", … (league phase: kèm mã quốc gia mẫu xoay vòng; đua: kèm đội). */
  function sampleTeams(tpl, word = 'Team') {
    return Array.from({ length: tpl.n }, (_, i) => {
      let s = `${word} ${i + 1}`;
      if (tpl.countries) s += ' | ' + tpl.countries[i % tpl.countries.length];
      else if (tpl.squad) s += ' |  | ' + `${word} ${String.fromCharCode(65 + Math.floor(i / tpl.squad) % 26)}` + (i % tpl.squad === tpl.squad - 1 ? ' | U25' : ''); // đua xe đạp: đội nhiều người, mỗi đội một tay đua trẻ
      else if (tpl.stages.some((c) => c.teams)) s += ' |  | ' + `${word} ${String.fromCharCode(65 + Math.floor(i / 2) % 26)}`;
      return s;
    });
  }

  const api = { TEMPLATES, byId, specOf, sampleTeams };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.CaroOTourTemplates = api;
})(typeof window !== 'undefined' ? window : globalThis);
