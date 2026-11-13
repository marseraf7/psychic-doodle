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
  ];
  if (typeof module !== 'undefined' && module.exports) module.exports = MORE;
  else global.CaroOTourTplMore = MORE;
})(typeof window !== 'undefined' ? window : globalThis);
