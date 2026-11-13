/*
 * Giải đấu Offline – thư viện mẫu giải (phần thêm, từ đợt 20: nhánh đồ thị…). Cùng dạng mẫu với otour-templates.js
 * (file đó gộp danh sách này vào TEMPLATES); mô tả bằng lời: tpl_<id> / tpl_<id>_d trong i18n-otour-graph.js.
 * Chỉ mô phỏng thể thức (cách chia bảng, đi tiếp, số trận) – không dùng tên, logo hay dữ liệu của giải thật.
 * Nạp trước otour-templates.js.
 */
(function (global) {
  'use strict';
  const MORE = [
    // Page playoff sau vòng tròn (kiểu giải cricket T20 nhượng quyền): 10 đội vòng tròn 2 lượt, 4 đội đầu vào Page playoff
    { id: 'page_t20', icon: '🏏', sport: 'other', result: 'winner', n: 10,
      stages: [{ type: 'roundrobin', groups: 1, meetings: 2, advance: 4, points: { w: 2, d: 1, l: 0 } }, { type: 'graph', shape: 'page', bestOf: 1 }] },
    // Final Eight kiểu bóng bầu dục Úc: 18 đội vòng tròn, 8 đội đầu vào chung kết 9 trận (hạng 1–4 có cơ hội kép)
    { id: 'afl_final8', icon: '🏉', sport: 'other', result: 'score', n: 18,
      stages: [{ type: 'roundrobin', groups: 1, meetings: 1, advance: 8, points: { w: 4, d: 2, l: 0 }, tiebreaks: ['pdiff', 'wins'] }, { type: 'graph', shape: 'afl8', bestOf: 1 }] },
    // Final Ten: thêm vòng Wildcard 7–10, 8–9 trước Final Eight
    { id: 'afl_final10', icon: '🏉', sport: 'other', result: 'score', n: 18,
      stages: [{ type: 'roundrobin', groups: 1, meetings: 1, advance: 10, points: { w: 4, d: 2, l: 0 }, tiebreaks: ['pdiff', 'wins'] }, { type: 'graph', shape: 'afl10', bestOf: 1 }] },
    // Thang leo bậc kiểu bóng chày Hàn Quốc: 10 đội, 5 đội đầu vào thang – Wild Card hạng 4 gặp 5 (Bo3 gồm 1 trận tặng cho hạng 4,
    // hoà loạt thì hạng 4 đi tiếp), rồi Bo5, Bo5, chung kết Bo7 với đội nhất mùa giải
    { id: 'kbo_ladder', icon: '⚾', sport: 'baseball', result: 'score', n: 10,
      stages: [{ type: 'roundrobin', groups: 1, meetings: 2, advance: 5, points: { w: 1, d: 0, l: 0 }, tiebreaks: ['h2h', 'wins'] },
        { type: 'graph', shape: 'gauntlet', bestOf: 5, ladder: [{ bo: 3, start: [1, 0], tie: true }, { bo: 5 }, { bo: 5 }, { bo: 7 }] }] },
    // Climax Series kiểu bóng chày Nhật Bản (mỗi liên đoàn 6 đội): hạng 2 gặp 3 Bo3 (hoà loạt → hạng 2), rồi gặp đội nhất –
    // Bo7 gồm 1 trận tặng cho đội nhất (đội nhất cần 3 thắng thật, đội thách đấu 4), hoà loạt thì đội nhất đi tiếp
    { id: 'npb_climax', icon: '⚾', sport: 'baseball', result: 'score', n: 6,
      stages: [{ type: 'roundrobin', groups: 1, meetings: 4, advance: 3, points: { w: 1, d: 0, l: 0 }, tiebreaks: ['wins', 'h2h'] },
        { type: 'graph', shape: 'gauntlet', bestOf: 3, ladder: [{ bo: 3, tie: true }, { bo: 7, start: [1, 0], tie: true }] }] },
    // Loại kép lai kiểu giải bóng đá xe: 16 đội Thụy Sĩ thắng 3 / thua 3, 8 đội vào nhánh lai (hạt giống 1–4 hai mạng)
    { id: 'rlcs_hybrid', icon: '🚗', sport: 'esports', n: 16, esports: { draft: 'off', fearless: 'off', stats: [] },
      stages: [{ type: 'swiss', bestOf: 5, record: { win: 3, lose: 3 } }, { type: 'graph', shape: 'hybrid', bestOf: 5, boFinal: 7 }] },
    // Compass draw 8 người (giải quần vợt câu lạc bộ): ai cũng đấu đủ 3 trận, bốn chung kết Đông / Bắc / Tây / Nam
    { id: 'compass8', icon: '🧭', sport: 'tennis', n: 8,
      stages: [{ type: 'graph', shape: 'compass8' }] },
    // Võ thuật kiểu Olympic (judo / vật): 32 VĐV loại trực tiếp một trận, người thua trước hai finalist từ vòng 1/8 được đấu
    // vòng vớt, người thắng vòng vớt mỗi phía tranh huy chương đồng với người thua bán kết phía kia – hai huy chương đồng
    { id: 'judo_rep', icon: '🥋', sport: 'other', result: 'winner', n: 32,
      stages: [{ type: 'single', bestOf: 1, rep: { from: 'r16', mode: 'finalist' } }] },
    // Đợt 21 – Thụy Sĩ. Kiểu Pokémon VGC: ngày 1 Thụy Sĩ 7 vòng, thua ≤ 2 trận vào ngày 2 (thành tích làm lại từ 0); ngày 2
    // Thụy Sĩ 6 vòng, thua ≤ 2 trận vào loại trực tiếp (số người do kết quả, hạt giống cao được miễn đấu); xếp theo tỉ lệ
    // thắng của đối thủ
    { id: 'vgc_worlds', icon: '🎮', sport: 'esports', n: 64, esports: { draft: 'off', fearless: 'off', stats: [] },
      stages: [{ type: 'swiss', bestOf: 3, rounds: 7, advanceMode: 'record', cutLosses: 2, tiebreaks: ['oppWinPct', 'oppOppWinPct'] },
        { type: 'swiss', bestOf: 3, rounds: 6, advanceMode: 'record', cutLosses: 2, tiebreaks: ['oppWinPct', 'oppOppWinPct'] },
        { type: 'single', bestOf: 3, thirdPlace: false }] },
    // Giải cờ mở đông người: Thụy Sĩ 9 vòng tăng tốc Baku (nửa trên +1 điểm ảo vòng 1–3, +0,5 vòng 4–5 – chỉ để ghép cặp)
    { id: 'baku_open', icon: '♟️', sport: 'chess', n: 64,
      stages: [{ type: 'swiss', rounds: 9, pairing: 'baku' }] },
    // Giải cờ câu lạc bộ kiểu Bắc Âu: Monrad 7 vòng, vòng cuối Danish (hạng 1 gặp hạng 2 dù đã gặp nhau)
    { id: 'monrad_club', icon: '♟️', sport: 'chess', n: 20,
      stages: [{ type: 'swiss', rounds: 7, pairing: 'monrad', pairingByRound: [null, null, null, null, null, null, 'danish'] }] },
    // Scrabble: Thụy Sĩ 10 vòng tính chênh lệch điểm (spread), 2 vòng cuối King of the Hill + Gibsonization cho 2 suất chung
    // kết; chung kết Bo5 giữa hai người đầu bảng
    { id: 'scrabble_koth', icon: '🔤', sport: 'other', result: 'score', n: 16,
      stages: [{ type: 'swiss', bestOf: 1, rounds: 10, koth: { rounds: 2 }, gibson: { spots: 2, swing: 1000 }, advance: 2, points: { w: 2, d: 1, l: 0 }, tiebreaks: ['gdiff'] },
        { type: 'single', bestOf: 5, thirdPlace: false }] },
    // Đợt 22. Darts kiểu PDC: 64 người loại trực tiếp, số set cần thắng theo vòng 3, 4, 4, 5, 6, 7 (Bo 5, 7, 7, 9, 11, 13)
    { id: 'pdc_worlds', icon: '🎯', sport: 'darts', n: 64,
      stages: [{ type: 'single', bestOf: 5, boRounds: [5, 7, 7, 9, 11, 13], thirdPlace: false }] },
    // Cờ vua kiểu FIDE World Cup: loại trực tiếp, mỗi cặp một thang ván (tiêu chuẩn → rapid → blitz → Armageddon)
    { id: 'fide_world_cup', icon: '♟️', sport: 'chess', n: 64,
      stages: [{ type: 'single', bestOf: 1, thirdPlace: false, matchLadder: [{ games: 2, tc: 'classical' }, { games: 2, tc: 'rapid', base: 1500, inc: 10 }, { games: 2, tc: 'rapid', base: 600, inc: 10 }, { games: 2, tc: 'blitz', base: 300, inc: 3 }, { games: 1, tc: 'armageddon', arm: true, white: 300, black: 240 }] }] },
    // Kiểu Norway Chess: 6 kỳ thủ vòng tròn 2 lượt; thắng tiêu chuẩn 3, hoà thì Armageddon 1,5 / 1
    { id: 'norway_chess', icon: '♟️', sport: 'chess', n: 6,
      stages: [{ type: 'roundrobin', groups: 1, meetings: 2, points: { w: 3, d: 0, l: 0, wx: 1.5, lx: 1 }, tiebreaks: ['wins', 'h2h'], ladderKeep: true,
        matchLadder: [{ games: 1, tc: 'classical' }, { games: 1, tc: 'armageddon', arm: true, white: 600, black: 420, inc: 1 }] }] },
    // Armageddon đấu giá: 8 kỳ thủ loại trực tiếp, 2 tiêu chuẩn + 2 rapid, hoà thì ra giá thời gian để cầm Đen
    { id: 'bid_final', icon: '♟️', sport: 'chess', n: 8,
      stages: [{ type: 'single', bestOf: 1, thirdPlace: false, matchLadder: [{ games: 2, tc: 'classical' }, { games: 2, tc: 'rapid', base: 600, inc: 5 }, { games: 1, tc: 'armageddon', arm: true, bid: true, white: 300, minBid: 60, maxBid: 300, tieBid: 'rebid' }] }] },
    // Quần vợt đồng đội kiểu Davis Cup Finals: 6 bảng 3 đội, nhất bảng + 2 nhì tốt nhất vào tứ kết; mỗi trận 3 rubber Bo3 set
    { id: 'davis_finals', icon: '🎾', sport: 'tennis_team', n: 18,
      stages: [{ type: 'roundrobin', groupSize: 3, advance: 1, bestNext: 2, bestOf: 3 }, { type: 'single', bestOf: 3, thirdPlace: false }] },
    // Kiểu Overwatch League: 12 đội vòng tròn 2 lượt, đủ 4 map + map 5 quyết định; xếp theo trận thắng, hiệu số map, map đối đầu
    { id: 'owl_season', icon: '🎮', sport: 'esports', n: 12, esports: { draft: 'off', fearless: 'off', stats: [] },
      stages: [{ type: 'roundrobin', groups: 1, meetings: 2, bestOf: 4, fixed: true, decider: true, advance: 6, points: { w: 1, d: 0, l: 0 }, tiebreaks: ['gdiff', 'h2hMap', 'h2h'], splits: { n: 4, take: 3, bo: 5 } },
        { type: 'single', bestOf: 5, boFinal: 7, thirdPlace: false }] },
    // Đợt 23. Kiểu BLAST Premier Groups: 12 đội, 3 bảng GSL không loại ai – nhất bảng vào thẳng Finals; hạng 2–4 đá gauntlet chéo
    // bảng (hạng 3 bảng này gặp hạng 4 bảng kia, đội thắng gặp hạng 2), 3 đội thắng vào Finals, còn lại ra Showdown
    { id: 'blast_groups', icon: '💥', sport: 'esports', n: 12, esports: { draft: 'off', fearless: 'off', stats: [] },
      stages: [{ type: 'gsl', bestOf: 3, eliminates: false, routes: [{ n: 1, to: 2 }] },
        { type: 'graph', shape: 'cross9', bestOf: 3, advance: 3, exit: 'Showdown' },
        { type: 'single', bestOf: 3, boFinal: 5, thirdPlace: false }] },
    // Kiểu EVO: 64 người chia 4 pool loại kép 16 người, mỗi pool 2 suất nhánh thắng + 2 suất nhánh thua → Top 16 loại kép
    // (người ra từ nhánh thua mang 1 trận thua), chung kết tổng có trận đấu thêm
    { id: 'evo_pools', icon: '🥊', sport: 'esports', n: 64, esports: { draft: 'off', fearless: 'off', stats: [] },
      stages: [{ type: 'pools', pool: 16, out: 2, bestOf: 3 }, { type: 'double', bestOf: 5, gf: '2' }] },
    // Kiểu TFT: 40 người, lobby 8 người xếp lại theo bảng điểm sau mỗi 2 game; cắt 40 → 32 → 24 → 16 → 8 (mang điểm); chung
    // kết 8 người "Checkmate": đạt 20 điểm rồi thắng một game thì vô địch (tối đa 12 game)
    { id: 'tft_crown', icon: '♟️', sport: 'esports', n: 40, esports: { draft: 'off', fearless: 'off', stats: [] },
      stages: [{ type: 'race', events: 6, score: 'points', table: [8, 7, 6, 5, 4, 3, 2, 1], heat: 8, reseed: 2, advance: 32 },
        { type: 'race', events: 6, score: 'points', table: [8, 7, 6, 5, 4, 3, 2, 1], heat: 8, reseed: 2, advance: 24, carry: true },
        { type: 'race', events: 6, score: 'points', table: [8, 7, 6, 5, 4, 3, 2, 1], heat: 8, reseed: 2, advance: 16, carry: true },
        { type: 'race', events: 6, score: 'points', table: [8, 7, 6, 5, 4, 3, 2, 1], heat: 8, reseed: 2, advance: 8, carry: true },
        { type: 'race', events: 12, score: 'points', table: [8, 7, 6, 5, 4, 3, 2, 1], mp: { at: 20 } }] },
    // Kiểu ALGS: 20 đội sinh tồn 6 trận (điểm hạng + hạ gục), draft điểm hạ cánh độc quyền trên bản đồ, Legend được chọn nhiều
    // nhất mỗi trận bị cấm khỏi các trận sau (tên bản đồ / POI chỉ là ví dụ – ban tổ chức tự dán)
    { id: 'algs_pro', icon: '🪂', sport: 'esports', n: 20, esports: { draft: 'off', fearless: 'off', stats: ['kills'] },
      stages: [{ type: 'race', events: 6, score: 'points', kill: true, table: [12, 9, 7, 5, 4, 3, 3, 2, 2, 2, 1, 1, 1, 1, 1], legendBan: true,
        poi: { order: 'seed', maps: [{ name: 'Map 1', pois: Array.from({ length: 20 }, (_, k) => 'POI ' + (k + 1)) }] } }] },
    // Đợt 24. Golf chấm điểm Modified Stableford (kiểu Barracuda Championship): albatross +8, eagle +5, birdie +2, par 0,
    // bogey −1, double bogey trở lên −3; 4 vòng, cắt sau vòng 2 (top 70 + đồng hạng); nhập từng lỗ
    { id: 'barracuda', icon: '⛳', sport: 'golf', n: 90,
      stages: [{ type: 'race', events: 4, score: 'golf', scoring: 'modified', input: 'hole', cut: { after: 2, top: 70 } }] },
    // Omnium xe đạp lòng chảo: Scratch, Tempo, Loại dần, Points race (mang điểm 3 đua đầu; mỗi vòng hơn / kém ±20)
    { id: 'omnium', icon: '🚴', sport: 'cycling', n: 20, stages: [{ type: 'race', score: 'omnium' }] },
    // Mass start trượt băng tốc độ: 2 bán kết (mỗi lượt 18 người, 8 người đầu vào chung kết), 16 vòng, điểm giữa đua ở vòng 4,
    // 8, 12 (3-2-1), về đích 60-40-20-10-6-3
    { id: 'massstart', icon: '⛸️', sport: 'skating', n: 36,
      stages: [{ type: 'race', score: 'massstart', massStart: { semis: true, heat: 18, adv: 8 } }] },
    // Biathlon: Sprint tính giờ → 60 người đầu đuổi bắt (xuất phát chậm đúng số giây thua; thua quá 4 phút xuất phát đồng loạt)
    { id: 'biathlon_pursuit', icon: '⛷️', sport: 'skiing', n: 80,
      stages: [{ type: 'race', events: 1, score: 'time', advance: 60 }, { type: 'race', score: 'pursuit', pursuit: { wave: 240 } }] },
    // Kiểu giải Scotland: 12 đội vòng tròn 3 lượt (33 trận), rồi tách nhóm trên / dưới 6 đội đấu thêm 5 trận (mang nguyên thành
    // tích – tổng 38 trận); đội nhóm dưới không lên trên được dù nhiều điểm hơn
    { id: 'scottish_split', icon: '🏴', sport: 'football', n: 12,
      stages: [{ type: 'roundrobin', meetings: 3, advance: 12 }, { type: 'roundrobin', split: { top: 6 } }] },
    // Đợt 25. Kiểu BLAST Bounty: 32 đội loại trực tiếp dựng từng vòng, đội nồi dưới chọn đối thủ ở nồi trên; bounty khởi đầu theo
    // hạt giống (1–4: 60.000 … 13–16: 15.000, 17–32: 0 – tổng 500.000), thắng lấy 50% bounty đội thua, chung kết lấy trọn
    { id: 'blast_bounty', icon: '💰', sport: 'esports', n: 32, esports: { draft: 'off', fearless: 'off', stats: [] },
      stages: [{ type: 'knock', mode: 'bounty', bestOf: 3 }] },
    // Kiểu Snooker Shoot Out: 64 người, mỗi trận 1 frame, bốc thăm lại sau mỗi vòng
    { id: 'snooker_shootout', icon: '🎱', sport: 'snooker', n: 64, stages: [{ type: 'knock', mode: 'shootout' }] },
    // Poker PKO / Mystery bounty (chỉ điểm thưởng, không tiền thật)
    { id: 'poker_pko', icon: '♠️', sport: 'poker', n: 60, stages: [{ type: 'race', score: 'poker', poker: { type: 'pko', start: 100, pocket: 50 } }] },
    { id: 'poker_mystery', icon: '✉️', sport: 'poker', n: 60, stages: [{ type: 'race', score: 'poker', poker: { type: 'mystery', act: 9 } }] },
    // Backyard Ultra: mỗi giờ một yard 6,706 km, người cuối cùng phải chạy thêm một yard một mình
    { id: 'backyard_ultra', icon: '🏃', sport: 'running', n: 30, stages: [{ type: 'race', score: 'backyard' }] },
    // Bridge đồng đội: 10 đội vòng tròn, mỗi trận 16 ván, IMP → VP thang 20 (WBF)
    { id: 'bridge_teams', icon: '🃏', sport: 'bridge', n: 10, stages: [{ type: 'roundrobin', boards: 16 }] },
    // Game bài sưu tầm kiểu Grand Prix: 64 người, Thụy Sĩ 6 vòng trong pod 8 người – mỗi pod một phiên draft 3 gói (bốc ghế, vòng đầu
    // ghép đối diện bàn, bắt buộc nộp danh sách bài), đổi pod sau 3 vòng; Top 8 draft lại rồi loại trực tiếp
    { id: 'mtg_gp', icon: '🎴', sport: 'tcg', n: 64,
      stages: [{ type: 'swiss', rounds: 6, pod: { size: 8, rounds: 3 }, draft: { packs: 3, decklist: true }, advance: 8, bestOf: 3 }, { type: 'single', bestOf: 3, draft: { packs: 3 } }] },
    // Nordic combined kiểu Gundersen: nhảy cầu tính điểm → 10 km đuổi bắt, mỗi điểm thua = 4 giây (không xuất phát đồng loạt)
    { id: 'nordic_combined', icon: '⛷️', sport: 'skiing', n: 50,
      stages: [{ type: 'race', score: 'skijump', events: 1, advance: 50 }, { type: 'race', score: 'pursuit', pursuit: { wave: 0, perPoint: 4 } }] },
  ];
  if (typeof module !== 'undefined' && module.exports) module.exports = MORE;
  else global.CaroOTourTplMore = MORE;
})(typeof window !== 'undefined' ? window : globalThis);
