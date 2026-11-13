/*
 * Giải đấu Offline – sẵn sàng cho chatbot AI (docs/de-xuat-giai-offline.md mục 6), dùng chung trình duyệt + máy chủ:
 *   SCHEMA          – lược đồ JSON (JSON Schema draft-07) của bản cấu hình { sport, result, set, stages } – công khai ở
 *                     /api/otour/schema.json (web.js); chatbot / công cụ ngoài viết đúng lược đồ này, máy chủ vẫn kiểm
 *                     lại bằng normalizeSpec (otour-spec.js) – sai thì báo lỗi rõ ràng, không tự đoán.
 *   describeSpec    – mô tả bản cấu hình bằng lời (từng câu), theo ngôn ngữ của hàm dịch T truyền vào: hiện ở form tạo giải
 *                     ("xem trước bằng lời") và để chatbot đọc lại cho người dùng xác nhận.
 *   parseSpec(text) – đọc cấu hình từ JSON (file xuất ra ở otour-export.js, hoặc chatbot viết): { spec } | { error }.
 */
(function (global) {
  'use strict';
  const SP = typeof module !== 'undefined' && module.exports ? require('./otour-sports.js') : global.CaroOTourSports;
  const TYPES = ['single', 'double', 'roundrobin', 'swiss', 'race', 'gsl', 'kings', 'graph', 'pools', 'knock'];
  const MAX_STAGES = 6; // giải offline tối đa 6 giai đoạn (như máy chủ – stages.js MAX_STAGES_OFFLINE)
  const TIEBREAKS = ['h2h', 'bh', 'bh1', 'bh2', 'mbh', 'mbh2', 'fb', 'aob', 'sb', 'koya', 'ps', 'wins', 'won', 'bpg', 'aro', 'aroc1', 'tpr', 'apro', 'gdiff', 'gwins', 'gpct', 'pdiff', 'ppct', 'losses', 'oppWinPct', 'oppOppWinPct', 'h2hMap'];
  const int = (min, max, d) => ({ type: 'integer', minimum: min, maximum: max, ...(d ? { description: d } : {}) });
  const lv = { type: 'object', properties: { m: int(0, 30, 'số lần gặp mỗi đối thủ ở mức này'), x: int(0, 999, 'số đối thủ ở mức này gặp thêm 1 lần') } };
    const bo = { type: 'integer', enum: Array.from({ length: 13 }, (_, i) => 2 * i + 1), description: 'Best of N (lẻ, 1–25)' };

  const SCHEMA = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: '/api/otour/schema.json',
    title: 'Caro x Gomoku – cấu hình giải đấu Offline',
    type: 'object',
    required: ['stages'],
    properties: {
      sport: { type: 'string', enum: Object.keys(SP.SPORTS), description: 'Bộ môn (điền sẵn điểm, tie-break, Bo, luật set)' },
      result: { type: 'string', enum: SP.RESULTS, description: "'score' tỉ số, 'sets' điểm từng set, 'winner' chỉ người thắng" },
      set: { type: ['object', 'null'], description: 'Luật set (kiểu sets); null = không kiểm điểm từng set',
        properties: { to: int(1, 99, 'điểm thắng set'), by: int(1, 10, 'phải hơn'), cap: int(0, 199, 'điểm trần, 0 = không'), last: int(0, 99, 'set quyết định, 0 = như trên'),
          race: { type: 'boolean', description: 'set đua tới `to`, không có deuce (darts: 3 leg)' }, lastBy: int(0, 10, 'set quyết định phải hơn (darts: 2 leg)'), lastCap: int(0, 199, 'set quyết định: chạm số này thì hơn 1 là đủ (darts: 6 – leg quyết định sau 5–5)'),
          rubber: int(0, 7, 'trận đồng đội: mỗi "set" là tỉ số set của một rubber Bo N (Davis Cup: 3)'), dead: { type: 'boolean', description: 'có rubber: đấu cả rubber không còn ý nghĩa' } } },
      esports: { type: 'object', description: 'Esports: cấm chọn và chi tiết từng ván. draft lol (20 bước) / custom (bans, picks mỗi đội) / off; fearless hard (tướng đã chọn ở ván trước không ai chọn lại) / soft (chỉ đội đã chọn) / off; scope series / stage; stats: chỉ số đội bắt buộc (kills, gold, towers, dragons, barons, heralds, inhibitors hoặc nhãn tự đặt); players: nhập K/D/A; pool: danh sách tướng gợi ý',
        properties: { draft: { type: 'string', enum: ['lol', 'custom', 'off'] }, bans: int(0, 10), picks: int(1, 10), fearless: { type: 'string', enum: ['hard', 'soft', 'off'] },
          scope: { type: 'string', enum: ['series', 'stage'] }, stats: { type: 'array', maxItems: 8, items: { type: 'string' } }, players: { type: 'boolean' }, pool: { type: 'array', maxItems: 400, items: { type: 'string' } } } },
      stages: {
        type: 'array', minItems: 1, maxItems: MAX_STAGES, description: 'Các giai đoạn (tối đa 6); giai đoạn giữa: roundrobin / swiss / race hoặc single / double (đi tiếp theo thứ hạng chung cuộc, advance)',
        items: {
          type: 'object', required: ['type'],
          properties: {
            type: { type: 'string', enum: TYPES, description: "'gsl': bảng đấu loại kép 4 đội (mở màn, nhánh thắng, nhánh thua, quyết định) – số đội chia hết cho 4, nhất và nhì bảng đi tiếp; 'kings' (chỉ giai đoạn giữa): vòng tranh hạt giống + cơ hội cuối – nửa trên cao gặp thấp, thắng vào nhóm hạt giống 1, thua vào nhóm 2; nửa dưới thắng vào nhóm 2, thua bị loại (3/4 số đội đi tiếp, số đội chia hết cho 4)" },
            shape: { type: 'string', enum: ['page', 'afl8', 'afl10', 'gauntlet', 'hybrid', 'compass8'], description: "'graph' (nhánh đồ thị, mỗi trận thắng đi một nơi, thua đi một nơi): 'page' – Page playoff 4 đội; 'afl8' / 'afl10' – Final Eight / Final Ten kiểu AFL (8 / 10 đội); 'gauntlet' – thang leo bậc 3–8 đội (hạt giống thấp nhất leo dần tới gặp hạt giống 1); 'hybrid' – loại kép lai kiểu RLCS 8 đội (hạt giống 1–4 hai mạng); 'compass8' – Compass draw 8 người (ai cũng đấu 3 trận)" },
            ladder: { type: 'array', maxItems: 7, items: { type: 'object', properties: { bo: int(1, 25, 'Bo của bậc, tính cả trận tặng (được chẵn)'), start: { type: 'array', maxItems: 2, items: int(0, 3), description: '[trận tặng hạt giống cao, trận tặng hạt giống thấp]' }, tie: { type: 'boolean', description: 'hoà loạt thì hạt giống cao đi tiếp; trận hoà vẫn tính là đã đấu' } } }, description: "'graph' + 'gauntlet': từng bậc, bậc 1 là trận của hai hạt giống thấp nhất (KBO Wild Card: { bo: 3, start: [1, 0], tie: true })" },
            matchLadder: { type: 'array', maxItems: 6, items: { type: 'object', properties: { games: int(1, 4), tc: { type: 'string', enum: ['classical', 'rapid', 'blitz', 'armageddon'] }, base: int(0, 36000), inc: int(0, 36000), arm: { type: 'boolean' }, white: int(0, 36000), black: int(0, 36000), bid: { type: 'boolean' }, minBid: int(0, 36000), maxBid: int(0, 36000), tieBid: { type: 'string', enum: ['rebid', 'higherSeed'] } } }, description: 'Thang ván của trận (loại trực tiếp / vòng tròn / Thụy Sĩ thường): các cấp lần lượt, cấp sau chỉ đấu khi cấp trước hoà (FIDE World Cup: 2 tiêu chuẩn → 2 rapid 25+10 → 2 rapid 10+10 → 2 blitz 5+3 → Armageddon; arm: 1 ván, hoà thì Đen thắng; bid: hai bên ra giá thời gian để cầm Đen, giá thấp hơn cầm Đen). Trận phân thắng sau cấp đầu được tính điểm thắng / thua sát (points.wx / lx – Norway Chess 1,5 / 1)' },
            rep: { type: 'object', properties: { from: { type: 'string', enum: ['qf', 'r16', 'r32'] }, mode: { type: 'string', enum: ['finalist', 'half'] } }, description: "'single' ở cuối: vòng vớt kiểu Olympic – xong hai bán kết thì người thua trước finalist ('finalist') hoặc mọi người thua ở nửa nhánh đó ('half', kiểu IJF) từ vòng `from` đấu vớt theo thang, người thắng mỗi phía tranh huy chương đồng với người thua bán kết phía kia (hai huy chương đồng)" },
            eliminates: { type: 'boolean', description: "'gsl' giai đoạn giữa: false = không loại ai, mọi hạng trong bảng đều có đích (dải routes + phần đi tiếp – kiểu BLAST Groups)" },
            exit: { type: 'string', maxLength: 40, description: 'Giai đoạn giữa: nhãn đích ra ngoài giải của đội không đi tiếp (vd. "Showdown") – hiện "Ra: …" thay cho bị loại' },
            pool: { type: 'integer', enum: [8, 16, 32], description: "'pools' (chỉ giai đoạn giữa): cỡ mỗi pool loại kép – người chơi chia kiểu rắn vào các pool" },
            out: int(1, 8, "'pools': số suất mỗi phía mỗi pool (lũy thừa 2, ≤ cỡ / 4) – suất nhánh thua mang 1 trận thua sang nhánh thắng – thua giai đoạn sau (thua thêm là bị loại)"),
            reseed: int(1, 10, "Race 'points' có heat: xếp lại các lượt (lobby) theo bảng điểm sau mỗi N trận (TFT: 2)"),
            poi: { type: 'object', properties: { order: { type: 'string', enum: ['seed', 'snake'] }, maps: { type: 'array', maxItems: 4, items: { type: 'object', properties: { name: { type: 'string' }, pois: { type: 'array', maxItems: 40, items: { type: 'string' } } } } } }, description: "Race 'points': draft điểm hạ cánh độc quyền theo bản đồ (ALGS) – mỗi POI chỉ một đội, thứ tự chọn theo bảng điểm" },
            legendBan: { type: 'boolean', description: "Race 'points': ghi Legend của mỗi đội mỗi trận; Legend được chọn nhiều nhất bị cấm khỏi các trận sau (ALGS)" },
            ladderKeep: { type: 'boolean', description: 'Có matchLadder: ô trên cầm Trắng ván 1 mọi cấp (Norway Chess: giữ màu ván tiêu chuẩn cho Armageddon)' },
            splits: { type: 'object', properties: { n: int(2, 6), take: int(2, 16), bo: int(1, 25) }, description: 'Vòng tròn một bảng: chia lịch thành n chặng, xong mỗi chặng thì `take` đội đầu (xếp theo các trận của chặng) đấu playoff Bo `bo` – không tính vào bảng xếp hạng mùa giải (kiểu Overwatch League)' },
            fixed: { type: 'boolean', description: 'Vòng tròn / Thụy Sĩ thường, bestOf 4: luôn đấu đủ 4 ván (kiểu Overwatch League)' },
            decider: { type: 'boolean', description: 'Có fixed: 2–2 thì đấu ván 5 quyết định (không tính vào hiệu số ván)' },
            pairingByRound: { type: 'array', maxItems: 15, items: { type: ['string', 'null'], enum: ['dutch', 'adjacent', 'monrad', 'danish', 'baku', null] }, description: 'Thụy Sĩ thường: cách ghép từng vòng (null = như pairing; vd. vòng cuối danish)' },
            baku: { type: 'object', properties: { virtual: { type: 'array', maxItems: 6, items: { type: 'object', properties: { from: int(1, 15), to: int(1, 15), pts: { type: 'number', minimum: 0, maximum: 10 } } } } }, description: "pairing 'baku': lịch điểm ảo cho nửa trên (mặc định giải 9 vòng FIDE C.04.7: [{ from: 1, to: 3, pts: 1 }, { from: 4, to: 5, pts: 0.5 }]) – chỉ dùng để ghép cặp, không vào bảng xếp hạng / chỉ số phụ" },
            koth: { type: 'object', properties: { rounds: int(1, 5) }, description: 'Thụy Sĩ thường: King of the Hill – `rounds` vòng cuối ghép thẳng 1–2, 3–4 theo bảng xếp hạng (cho gặp lại; kiểu Scrabble)' },
            gibson: { type: 'object', properties: { spots: int(1, 8), swing: int(0, 100000) }, description: 'Có koth: Gibsonization – người trong top `spots` đã chắc suất (kể cả thua hết các trận còn lại với chênh lệch −swing mỗi trận, người đuổi theo thắng hết với +swing) được ghép với người cao nhất đã hết cơ hội' },
            advanceMode: { type: 'string', enum: ['record'], description: "Thụy Sĩ thường (giai đoạn giữa): 'record' – cắt theo số thua (kiểu Pokémon VGC X-2): mọi người thua ≤ cutLosses trận đi tiếp, số người đi tiếp do kết quả quyết định; nhánh sau miễn đấu cho hạt giống cao" },
            cutLosses: int(0, 10, 'advanceMode record: số trận thua tối đa để đi tiếp (VGC: 2)'),
            size: { type: 'integer', enum: [4, 8], description: "'gsl': cỡ bảng – 4 đội (nhất, nhì đi tiếp) hoặc 8 đội (4 đội đi tiếp)" },
            head: { type: 'array', maxItems: 64, items: int(0, 1000), description: "Race 'points' ở giai đoạn sau: điểm cộng sẵn theo vị trí vào giai đoạn (kiểu Points Rush)" },
            groups: int(0, 8, "Race 'points': chia bảng cố định (2–8; kiểu PGC) – mỗi bảng đấu `events` trận của riêng mình, đi tiếp (advance) và vào thẳng giai đoạn 3 (skip) tính mỗi bảng"),
            tb: { type: 'string', enum: ['countback', 'pubg', 'pubg_k'], description: "Race 'points': chỉ số phụ khi bằng điểm – 'pubg': tổng điểm hạng, điểm trận gần nhất, điểm hạng trận gần nhất; 'pubg_k' (PUBG cũ): tổng hạ gục, điểm trận cao nhất, hạ gục trận đó, hạ gục rồi hạng trận gần nhất" },
            routes: { type: 'array', maxItems: 4, items: { type: 'object', properties: { n: int(1, 256), to: int(2, 5), after: { type: 'boolean', description: 'dải nằm sau nhóm `advance` đi tiếp (vd. 8 đội cuối vòng bảng vào thẳng nhánh thua)' } }, required: ['n', 'to'] }, description: "Giai đoạn giữa (không phải loại trực tiếp), còn ≥ 2 giai đoạn sau: các dải hạng từ hạng 1 (chia bảng: mỗi bảng) vào thẳng giai đoạn `to` (chỉ số từ 0, ≥ chỉ số hiện tại + 2); các hạng sau đó: `advance` đội đi tiếp giai đoạn kế (có thể 0), còn lại bị loại. Kiểu nhánh thắng / nhánh thua song song của PGC 2022–2023" },
            directLast: { type: 'boolean', description: 'Đội được chuyển thẳng vào giai đoạn này đứng sau đội đi tiếp (hàng chờ của cổng thắng trận)' },
            gate: { type: 'object', properties: { seats: int(2, 200) }, description: "Race 'points', giai đoạn giữa: cổng thắng trận (Grand Survival PGC 2022) – mỗi trận `seats` đội, đội về nhất đi tiếp và rời phòng, đội kế tiếp trong hàng chờ vào thay; số đội đi tiếp = events" },
            circuit: { type: 'object', properties: { n: int(1, 5), days: int(2, 4), keep: int(1, 200), late: { type: 'array', maxItems: 3, items: int(0, 64) } }, description: "Race 'points': hệ Circuit (PGC 2024) – n vòng × days ngày × events trận mỗi ngày; ngày 1: các đội từ hạng (tổng late) + 1 trở xuống của bảng đầu vòng (vòng 1: hạt giống); ngày sau: `keep` đội đầu ngày trước + late[j] đội hạng cao hơn (nhóm đầu bảng vào ngày cuối); chỉ điểm ngày cuối (Final) cộng dồn. Vd. 24 đội: { n: 3, days: 3, keep: 12, late: [4, 4] }" },
            meetSmall: int(1, 4, "Vòng tròn chia bảng: bảng ít đội hơn bảng đông nhất gặp nhau meetSmall lượt (MSI 2021: bảng 3 đội 4 lượt, bảng 4 đội 2 lượt)"),
            tbmTop: { type: 'boolean', description: 'Có tbm: thêm trận phụ khi bằng điểm ở hạng nhất (cách ghi cũ – như tbmLines: [1])' },
            tbmLines: { type: 'array', maxItems: 8, items: int(1, 63), description: 'Có tbm: các vạch hạng khác cũng phân định bằng trận phụ (vạch L giữa hạng L và L + 1; MSI: [1]; Rumble 2021: [1, 2]). Thủ tục Riot: hoà 2 đội một trận; 3 đội: nhanh nhất được miễn, hai đội còn lại đấu, đội thắng gặp đội được miễn; 4 đội: hai trận Bo1 theo tổng thời gian thắng; bỏ trận thừa' },
            pick: { type: 'boolean', description: 'Loại trực tiếp 4 đội: hạt giống 1 chọn đối thủ bán kết trong hạt giống 3 / 4 (kiểu MSI)' },
            rotBlock: int(1, 30, "Race có rot: đổi cặp bảng sau mỗi rotBlock trận (vòng bảng PGS: 6 – mỗi ngày A&B, B&C, C&A)"),
            dmg: { type: 'boolean', description: "Race 'points': nhập tổng sát thương từng đội mỗi trận; với tb 'pubg' là chỉ số phụ cuối (PUBG 2022–2023)" },
            drawFresh: { type: 'boolean', description: 'Vòng tròn có đội vào thẳng (direct): bốc thăm các đội đi tiếp gặp đội vào thẳng (MSI 2018 Play-In vòng 2)' },
            slotFresh: { type: 'boolean', description: 'Vòng tròn có đội vào thẳng: đội đi tiếp theo thứ tự bảng gặp đội vào thẳng theo hạt giống (MSI 2019: nhất bảng A gặp đội vào thẳng thứ nhất)' },
            weekly: { type: 'object', properties: { weeks: int(1, 5), seats: int(2, 64), final: int(1, 30), bottom: int(0, 30), sit: int(0, 8) }, description: "Race 'points': vòng tuần (PGC 2021) – mỗi tuần: Weekly Survival (cổng thắng trận không tính điểm, phòng `seats` đội, đủ `seats` đội thắng khác nhau) → Weekly Final (`final` trận) → Bottom (`bottom` trận xếp lại hàng chờ, không có ở tuần cuối); `sit` hạt giống cuối nghỉ tuần 1. Bảng giai đoạn: đội nhất các tuần, rồi điểm Weekly Finals cộng dồn. Vd. { weeks: 3, seats: 16, final: 10, bottom: 6, sit: 1 } + routes [{ n: 12, to: … }]" },
            carry: { type: 'boolean', description: "Race 'points' sau một giai đoạn race: mang nguyên điểm giai đoạn trước sang (Elimination PGC 2019)" },
            tbm: { type: 'string', enum: ['match', 'h2h'], description: "Vòng tròn chia bảng (giai đoạn giữa): trận phụ phân hạng khi đúng hai đội bằng điểm ở vạch đi tiếp – 'match': luôn đấu (đối đầu chỉ để chọn bên), 'h2h': chỉ khi đối đầu cũng bằng" },
            draw: { type: 'string', enum: ['record'], description: "Loại trực tiếp ngay sau Thụy Sĩ thắng / thua: bốc thăm theo thành tích (tốt nhất gặp kém nhất, còn lại ngẫu nhiên, tránh cùng khu vực)" },
            rot: { type: ['boolean', 'integer'], minimum: 3, maximum: 8, description: "Race 'points': chia bảng xoay vòng, mỗi trận hai bảng đấu – true: 3 bảng; 4–8: số bảng (các cặp bảng lần lượt gặp nhau)" },
            boDecider: bo, skip: int(0, 256, 'giải từ 3 giai đoạn trở lên, ở giai đoạn 1: số đội đầu vào thẳng giai đoạn 3 (vòng tròn: mỗi bảng); các đội đi tiếp còn lại đá giai đoạn 2'),
            kill: int(0, 10, "Race 'points' (sinh tồn): điểm mỗi lần hạ gục, cộng với điểm theo hạng"),
            mp: { type: 'object', description: "Race 'points': kết thúc kiểu match point – đội đã đạt ngưỡng mà thắng một trận thì vô địch; { at } ngưỡng cố định, hoặc { after, plus } = điểm đội dẫn đầu sau `after` trận + `plus`", properties: { at: int(1, 100000), min: int(1, 30), after: int(1, 29), plus: int(0, 1000) } },
            boLow: bo,
            bestOf: bo, advance: int(1, 200, 'số người đi tiếp (vòng tròn: mỗi bảng)'),
            thirdPlace: { type: 'boolean' }, places: { type: 'array', items: { type: 'integer' }, description: 'trận xếp hạng: 3 = hạng 3–4, 5 = 5–6…' },
            boSemi: bo, boFinal: bo, gf: { type: 'string', enum: ['2', '1', 'none'] }, split: { type: 'boolean' },
            legs: { type: 'boolean', description: 'loại trực tiếp 2 lượt (tổng tỉ số)' }, legsFinal: { type: 'boolean' },
            heat: int(0, 64, 'Race: tối đa số người mỗi lượt (đoàn đông hơn thì chia lượt), 0 = không chia'),
            path: { type: 'string', enum: ['groups'], description: 'loại trực tiếp sau vòng bảng: nhánh cố định theo vị trí trong bảng (1A–2B, kiểu World Cup 2026)' },
            groups: int(1, 64), groupSize: int(2, 64), meetings: { type: 'integer', enum: [1, 2, 3, 4] },
            league: { type: 'object', description: 'league phase kiểu Champions League', properties: { games: int(1, 20), pots: int(1, 8) } },
            season: { type: 'object', description: 'mùa giải kiểu nhà nghề Mỹ: confs miền × divs bảng con (đội chia theo thứ tự danh sách); div / conf / inter = gặp đội cùng bảng con / cùng miền khác bảng con / khác miền: m lần mỗi đối thủ + x đối thủ gặp thêm 1 lần',
              properties: { confs: int(1, 8), divs: int(1, 8), div: lv, conf: lv, inter: lv } },
            playoff: { type: 'object', description: 'loại trực tiếp ngay sau mùa giải: playoff kiểu nhà nghề Mỹ – mỗi miền một nửa nhánh, hai đội vô địch miền gặp nhau ở chung kết. mode seed: per đội mỗi miền theo hạt giống (thiếu đội thì hạt giống cao miễn đấu), divWin: nhất bảng con giữ hạt giống đầu, playin nba (hạt giống per−1 … per+2) / one (per gặp per+1); mode div: kiểu NHL (3 đội đầu mỗi bảng con + 2 vé vớt, cần 2 bảng con mỗi miền); reseed: xếp lại cặp sau mỗi vòng. Mùa giải phải cho per + đội play-in (div: 8) đội mỗi miền đi tiếp',
              properties: { mode: { type: 'string', enum: ['seed', 'div'] }, per: int(2, 16), divWin: { type: 'boolean' }, playin: { type: 'string', enum: ['none', 'nba', 'one'] }, reseed: { type: 'boolean' }, playinBo: { type: 'integer', enum: [1, 3, 5, 7] } } },
            boRounds: { type: 'array', maxItems: 8, items: bo, description: 'loại trực tiếp: Bo riêng từng vòng từ vòng 1 (số cuối áp cho các vòng sau), vd. [3, 5, 7, 7]' },
            direct: int(0, 256, 'giai đoạn thứ 2 trở đi: số đội hạt giống cao nhất vào thẳng giai đoạn này (không đá các giai đoạn trước)'),
            region: { type: 'boolean', description: 'Thụy Sĩ: vòng 1 tránh hai đội cùng khu vực (cột quốc gia)' },
            bestNext: int(0, 32, 'thêm đội xếp ngay sau suất đi tiếp tốt nhất'),
            rounds: int(0, 15, 'Thụy Sĩ: số vòng, 0 = tự động'), pairing: { type: 'string', enum: ['dutch', 'adjacent', 'valve', 'valve16', 'draw', 'faceit', 'monrad', 'danish', 'baku'], description: "Thụy Sĩ thường (giải offline): 'monrad' – ghép thẳng 1–2, 3–4 theo bảng xếp hạng, tránh gặp lại; 'danish' – như Monrad nhưng cho gặp lại; 'baku' – tăng tốc Baku (nửa trên theo hạt giống được cộng điểm ảo chỉ để ghép cặp, xem baku). Chỉ Thụy Sĩ theo thắng / thua: 'faceit' – kiểu FACEIT 2018 (vòng 1–2 như 'draw', vòng 3–5 xếp hạt giống trong nhóm theo Buchholz = tổng số thắng của các đối thủ đã gặp, cao gặp thấp); 'valve' – kiểu CS Major (vòng 1 hạt giống i gặp i + n/2, sau đó cùng thành tích, xếp theo độ khó (Buchholz) rồi hạt giống, cao gặp thấp); 'valve16' – như trên nhưng vòng 1 gập đôi (1 gặp 16 – luật trước 11/2023); 'draw' – kiểu 2017: vòng 1 nhóm hạt giống 1 bốc gặp nhóm 4, 2 gặp 3, sau đó bốc thăm ngẫu nhiên trong cùng thành tích" },
            record: { type: 'object', description: 'Thụy Sĩ theo số thắng / thua', properties: { win: int(1, 5), lose: int(1, 5), bo, boLast: { type: 'boolean', description: 'Bo riêng chỉ cho trận mà cả hai đội đều ở thế thắng là đi tiếp, thua là bị loại (FACEIT 2018: vòng 5, 2–2)' } } },
            points: { type: 'object', properties: { w: int(0, 10), d: int(0, 10), l: int(0, 10), wx: int(0, 10), lx: int(0, 10), gw: int(0, 10), gt: int(0, 10), bye: int(0, 10) } },
            tiebreaks: { type: 'array', maxItems: TIEBREAKS.length, items: { type: 'string', enum: TIEBREAKS } },
            rankBy: { type: 'string', enum: ['points', 'match_wins', 'game_wins', 'game_pct', 'game_diff'] },
            events: int(1, 60, 'hệ Race: số chặng'), score: { type: 'string', enum: ['points', 'time', 'gt', 'golf', 'omnium', 'massstart', 'pursuit', 'backyard', 'poker'], description: "'points' điểm theo hạng, 'time' cộng thời gian, 'gt' xe đạp nhiều chặng (tổng thời gian, điểm, leo núi, trẻ, đồng đội), 'golf' golf đấu gậy (events = số vòng), 'omnium' omnium xe đạp lòng chảo (4 đua con), 'massstart' xuất phát đồng loạt kiểu trượt băng (điểm giữa đua + về đích), 'pursuit' đuổi bắt sau giai đoạn tính giờ (xuất phát theo khoảng thua), 'backyard' Backyard Ultra (mỗi giờ một yard), 'poker' poker có bounty (mỗi chặng một lần loại người)" },
            kinds: { type: 'array', maxItems: 30, items: { type: 'string', enum: ['flat', 'hilly', 'mtn', 'itt'] }, description: "'gt': loại từng chặng – đồng bằng / đồi / núi / tính giờ cá nhân" },
            bonus: { type: 'boolean', description: "'gt': giây thưởng về đích top 3 (10-6-4)" },
            par: { type: 'array', maxItems: 18, items: int(3, 6), description: "'golf': par từng lỗ (mặc định 18 lỗ par 72)" },
            input: { type: 'string', enum: ['round', 'hole'], description: "'golf': nhập tổng gậy mỗi vòng hoặc từng lỗ" },
            cut: { type: 'object', description: "'golf': sau vòng after chỉ top người đầu và đồng hạng đánh tiếp", properties: { after: int(1, 29), top: int(1, 512) } },
            po: { type: 'array', maxItems: 18, items: int(1, 18), description: "'golf': thứ tự lỗ đấu phụ đột tử" },
            scoring: { type: 'string', enum: ['stableford', 'modified'], description: "'golf': chấm điểm Stableford (chuẩn: albatross 5 … double bogey 0) / Modified (+8, +5, +2, 0, −1, −3) – nhiều điểm xếp trên; bắt buộc nhập từng lỗ" },
            points: { type: 'object', description: "'golf' Stableford: điểm 6 mức { alb, eagle, birdie, par, bogey, dbl } (−20…20)" },
            handicap: { type: 'object', properties: { si: { type: 'array', items: int(1, 18), description: 'chỉ số khó từng lỗ (hoán vị 1..số lỗ)' } }, description: "'golf' Stableford: bật handicap – mỗi dòng nhập có hcp 0–54, được trừ gậy ở các lỗ khó nhất trước" },
            omnium: { type: 'object', properties: { rank: { type: 'array', maxItems: 40, items: int(0, 100), description: 'điểm theo hạng ở 3 đua đầu (phải đủ cho mọi người)' }, lap: int(1, 50, 'điểm mỗi vòng hơn / kém ở points race'), sprint: { type: 'array', maxItems: 6, items: int(0, 20) } }, description: "'omnium': Scratch, Tempo, Loại dần, Points race" },
            massStart: { type: 'object', properties: { laps: int(4, 40), sprints: { type: 'array', items: int(1, 39) }, mid: { type: 'array', maxItems: 6, items: int(0, 20) }, final: { type: 'array', maxItems: 12, items: int(0, 200) }, semis: { type: 'boolean' }, heat: int(6, 24), adv: int(2, 16) }, description: "'massstart': số vòng, vòng có điểm giữa đua, điểm giữa đua (3-2-1), điểm về đích (60-40-20-10-6-3), bán kết (mỗi lượt tối đa heat người, adv người đầu vào chung kết)" },
            pursuit: { type: 'object', properties: { wave: int(0, 3600, 'thua quá số giây này thì xuất phát đồng loạt (0 = không)') }, description: "'pursuit': giai đoạn sau giai đoạn race 'time'" },
            backyard: { type: 'object', properties: { m: int(100, 100000, 'độ dài mỗi yard (mét)'), min: int(10, 180, 'phút mỗi yard') }, description: "'backyard': người cuối cùng phải chạy thêm một yard một mình mới vô địch (không thì không có nhà vô địch)" },
            poker: { type: 'object', properties: { type: { type: 'string', enum: ['pko', 'mystery'] }, start: int(0, 1000000), pocket: int(0, 100), act: int(2, 10000), envelopes: { type: 'array', maxItems: 200, items: int(0, 10000000) } }, description: "'poker' (chỉ điểm thưởng): PKO – loại người nhận ngay pocket% bounty, phần còn lại cộng vào bounty mình; Mystery – còn `act` người thì mỗi lần loại rút một phong bì" },
            mode: { type: 'string', enum: ['shootout', 'bounty'], description: "'knock' (loại trực tiếp dựng từng vòng): 'shootout' bốc thăm lại mỗi vòng (Snooker Shoot Out), 'bounty' chọn đối thủ + sổ tiền thưởng (BLAST Bounty)" },
            bounty: { type: 'object', properties: { ladder: { type: 'array', maxItems: 16, items: { type: 'object', properties: { to: int(1, 256), amount: int(0, 100000000) } } }, claim: int(0, 100), finalFull: { type: 'boolean' }, seeding: { type: 'string', enum: ['fixed', 'inherit'] } }, description: "'knock' mode 'bounty': bounty khởi đầu theo bậc hạt giống, % lấy vào quỹ khi thắng, chung kết lấy trọn" },
            boards: int(1, 64, 'Bridge đồng đội (vòng tròn / Thụy Sĩ / loại trực tiếp): số ván mỗi trận – nhập điểm từng ván, đổi IMP rồi VP thang 20 (WBF)'),
            vpTable: { type: 'array', maxItems: 200, items: { type: 'array' }, description: 'Bridge: thang VP riêng [[chênh IMP tối thiểu, VP đội thắng]…] thay cho công thức WBF' },
            pod: { type: 'object', properties: { size: int(4, 16), rounds: int(1, 5) }, description: 'Thụy Sĩ: ghép cặp trong pod `size` người, đổi pod theo bảng xếp hạng sau mỗi `rounds` vòng (kiểu draft Magic)' },
            split: { type: 'object', properties: { top: int(2, 64) }, description: "Vòng tròn ở giai đoạn sau một vòng tròn (The Split, kiểu giải Scotland): `top` đội đầu vào nhóm trên, còn lại nhóm dưới; mang nguyên thành tích; nhóm trên luôn xếp trên nhóm dưới" },
            table: { type: 'array', maxItems: 64, items: int(0, 1000), description: 'hệ Race: điểm theo hạng' }, teams: { type: 'boolean', description: 'hệ Race: bảng đội' },
          },
        },
      },
    },
  };

  /** Mô tả một giai đoạn (một câu). T(key, args) – hàm dịch. */
  const rng = (a, b) => (a === b ? String(a) : a + '–' + b);
  /** Dải hạng vào thẳng giai đoạn sau nữa + dải đi tiếp giai đoạn kế (routes). i: chỉ số giai đoạn. */
  function routeText(c, T, i) {
    const g = c.type === 'gsl' || (c.type === 'roundrobin' && !c.league && ((c.groups || 1) > 1 || c.groupSize)) || (c.type === 'race' && c.groups) ? '_g' : '';
    const x = [];
    let a = 1;
    for (const r of c.routes) if (!r.after) { x.push(T('ds_route' + g, { r: rng(a, a + r.n - 1), k: r.to + 1 })); a += r.n; }
    if (c.advance) { x.push(T('ds_route_next' + g, { r: rng(a, a + c.advance - 1), k: i + 2 })); a += c.advance; }
    for (const r of c.routes) if (r.after) { x.push(T('ds_route' + g, { r: rng(a, a + r.n - 1), k: r.to + 1 })); a += r.n; } // dải sau nhóm đi tiếp
    return x;
  }
  /** Tổng số trận của giai đoạn đua: vòng tuần / hệ Circuit tính cả các tuần, các ngày (như máy chủ). */
  function raceTotal(c) {
    const W = c.weekly, C = c.circuit, e = c.events || 1;
    if (W) return W.weeks * (W.seats + W.final) + (W.weeks - 1) * W.bottom;
    return C ? e * C.n * C.days : e;
  }
  function stageText(c, T, last, result = 'score', i = 0) {
    const x = [];
    if (c.type === 'single' || c.type === 'double') {
      x.push(T(c.type === 'single' ? 'ds_single' : 'ds_double', { bo: c.bestOf || 1 }));
      if (c.type === 'single' && (c.thirdPlace || (c.places || []).includes(3))) x.push(T('ds_third'));
      if (c.boFinal) x.push(T('ds_bo_final', { bo: c.boFinal }));
      if (c.legs && result === 'score') x.push(T(c.legsFinal ? 'ds_legs_all' : 'ds_legs')); // 2 lượt chỉ với kiểu tỉ số
      if (c.path === 'groups') x.push(T('ds_path'));
      if (c.type === 'single' && c.playoff) x.push(...playoffText(c.playoff, T)); // playoff kiểu Mỹ
      if (c.type === 'single' && Array.isArray(c.boRounds) && c.boRounds.length) x.push(T('ds_bo_rounds', { list: c.boRounds.join(', ') }));
      if (c.type === 'single' && c.rep) x.push(T('ds_rep_' + (c.rep.mode || 'finalist'), { from: T({ r16: 'rep_r16', r32: 'rep_r32' }[c.rep.from] || 'r_quarter') }));
    } else if (c.type === 'graph') { // nhánh đồ thị (otour-graph.js)
      x.push(T('ds_graph', { name: T('fmt_graph_' + (c.shape || 'page')) }));
      (c.ladder || []).forEach((y, j) => {
        if (!y) return;
        const p = [y.bo ? T('ds_graph_ladder', { n: j + 1, bo: y.bo }) : '', y.start && y.start[0] ? T('ds_graph_gift', { a: y.start[0] }) : '', y.tie ? T('ds_graph_tie') : ''].filter(Boolean);
        if (p.length) x.push(p.join(', '));
      });
    } else if (c.type === 'knock') { // loại trực tiếp dựng từng vòng (stages-knock.js)
      x.push(T(c.mode === 'bounty' ? 'ds_knock_bounty' : 'ds_knock_shootout', { p: ((c.bounty || {}).claim != null ? c.bounty.claim : 50) }));
    } else if (c.type === 'kings') {
      x.push(T('ds_kings', { bo: c.bestOf || 3 }));
      if (c.boLow) x.push(T('ds_kings_low', { bo: c.boLow }));
    } else if (c.type === 'gsl') {
      x.push(T(c.size === 8 ? 'ds_gsl8' : 'ds_gsl', { bo: c.bestOf || 1 }));
      if (c.boDecider) x.push(T('ds_gsl_dec', { bo: c.boDecider }));
      if (c.eliminates === false) x.push(T('ds_gsl_keep'));
    } else if (c.type === 'pools') { // pool loại kép xếp tầng (kiểu EVO)
      x.push(T('ds_pools', { pool: c.pool || 16, out: c.out || 2, bo: c.bestOf || 1 }));
    } else if (c.type === 'roundrobin') {
      if (c.split) x.push(T('ds_split', { n: c.split.top }));
      else if (c.league) x.push(T('ds_league', { games: c.league.games, pots: c.league.pots }));
      else if (c.season) x.push(seasonText(c.season, T));
      else {
        x.push(c.groupSize ? T('ds_group_size', { n: c.groupSize }) : (c.groups || 1) > 1 ? T('ds_groups', { n: c.groups }) : T('ds_rr'));
        if (c.meetings === 2) x.push(T('ds_home_away')); else if (c.meetings === 3) x.push(T('ds_meet3')); else if (c.meetings === 4) x.push(T('ds_meet4'));
      }
    } else if (c.type === 'swiss') {
      x.push(c.record ? T('ds_swiss_rec', { w: c.record.win, l: c.record.lose }) : c.rounds ? T('ds_swiss', { n: c.rounds }) : T('ds_swiss_auto'));
      if (c.record && c.record.bo) x.push(T(c.record.boLast ? 'ds_rec_bo_last' : 'ds_rec_bo', { bo: c.record.bo }));
      if (c.record && ['valve', 'valve16', 'draw', 'faceit'].includes(c.pairing)) x.push(T('ds_' + c.pairing));
      if (!c.record && ['monrad', 'danish', 'baku'].includes(c.pairing)) x.push(T('ds_pair_' + c.pairing));
      if ((c.pairingByRound || []).includes('danish') && c.pairing !== 'danish') x.push(T('ds_danish_by_round', { list: c.pairingByRound.map((m, r) => (m === 'danish' ? r + 1 : 0)).filter(Boolean).join(', ') }));
      if (c.koth) x.push(T('ds_koth', { n: c.koth.rounds }));
      if (c.koth && c.gibson) x.push(T('ds_gibson', { n: c.gibson.spots, s: c.gibson.swing }));
      if (c.advanceMode === 'record') x.push(T('ds_cut_losses', { n: c.cutLosses != null ? c.cutLosses : 2 }));
    } else if (c.type === 'race') {
      if (c.score === 'golf') { // golf đấu gậy
        const p = (c.par || []).reduce((a, b) => a + b, 0) || 72;
        x.push(T('ds_golf', { n: c.events || 1, h: (c.par || []).length || 18, p }));
        if (c.cut) x.push(T('ds_golf_cut', { r: c.cut.after, n: c.cut.top }));
        if (c.input === 'hole') x.push(T('ds_golf_hole'));
        // Stableford: bảng điểm 6 mức (thiếu thì theo bảng mặc định như máy chủ – stages-golf-stable.js)
        const sf = { stableford: [5, 4, 3, 2, 1, 0], modified: [8, 5, 2, 0, -1, -3] }[c.scoring];
        if (sf) x.push(T('ds_golf_sf_' + c.scoring, { list: ['alb', 'eagle', 'birdie', 'par', 'bogey', 'dbl'].map((k, j) => ((c.points || {})[k] != null ? c.points[k] : sf[j])).join(' / ') }) + (c.handicap ? ' ' + T('ds_golf_hcp') : ''));
      } else if (c.score === 'omnium') {
        const O = c.omnium || {};
        x.push(T('ds_omnium', { top: (O.rank || [40, 38, 36]).slice(0, 3).join('-'), lap: O.lap || 20 }));
      } else if (c.score === 'massstart') {
        const M = c.massStart || {};
        x.push(T('ds_ms', { laps: M.laps || 16, s: (M.sprints || [4, 8, 12]).join(', '), mid: (M.mid || [3, 2, 1]).join('-'), fin: (M.final || [60, 40, 20, 10, 6, 3]).join('-') }));
        if (M.semis) x.push(T('ds_ms_semis', { n: M.heat || 24, k: M.adv || 8 }));
      } else if (c.score === 'backyard') {
        x.push(T('ds_backyard', { km: (((c.backyard || {}).m || 6706) / 1000).toFixed(3), min: (c.backyard || {}).min || 60 }));
      } else if (c.score === 'poker') {
        const P = c.poker || {};
        x.push(P.type === 'mystery' ? T('ds_pk_mystery', { n: P.act || 9 }) : T('ds_pk_pko', { s: P.start != null ? P.start : 100, p: P.pocket != null ? P.pocket : 50 }));
      } else if (c.score === 'pursuit') {
        x.push(T((c.pursuit || {}).wave === 0 ? 'ds_pursuit_nowave' : 'ds_pursuit', { w: (c.pursuit || {}).wave != null ? c.pursuit.wave : 240 }));
      } else if (c.score === 'gt') { // xe đạp nhiều chặng: số chặng theo loại
        const n = (k) => (c.kinds || []).filter((x) => x === k).length;
        x.push(T('ds_gt', { n: c.events || 1, f: n('flat'), h: n('hilly'), m: n('mtn'), t: n('itt') }));
        if (c.bonus !== false) x.push(T('ds_gt_bonus'));
      } else x.push(c.score === 'time' ? T('ds_time', { n: c.events || 1 }) : T('ds_race', { n: raceTotal(c), top: (c.table || []).slice(0, 3).join('-') }));
      if (c.rot) x.push(c.rot === true || c.rot === 3 ? T('ds_rot') : T('ds_rot_n', { n: c.rot }));
      if (c.gate) x.push(T('ds_gate', { n: c.gate.seats }));
      if (c.circuit) x.push(T('ds_circuit', { n: c.circuit.n, d: c.circuit.days, m: c.events || 1, k: c.circuit.keep, late: (c.circuit.late || []).join('-') }));
      if (c.carry) x.push(T('ds_carry'));
      if (c.dmg) x.push(T('ds_dmg'));
      if (c.weekly) x.push(T('ds_weekly', { n: c.weekly.weeks, s: c.weekly.seats, f: c.weekly.final, b: c.weekly.bottom }) + (c.weekly.sit ? ' ' + T('ds_wk_sit', { n: c.weekly.sit }) : ''));
      if (c.groups) x.push(T('ds_race_groups', { n: c.groups, m: c.events || 1 }));
      if (c.tb === 'pubg' || c.tb === 'pubg_k') x.push(T('ds_tb_' + c.tb));
      if (c.head) x.push(T('ds_head', { list: c.head.slice(0, 4).join('-') }));
      if (c.kill) x.push(T('ds_kill', { n: c.kill }));
      if (c.mp) x.push(c.mp.at ? T('ds_mp_at', { n: c.mp.at }) + (c.mp.min > 1 ? ' ' + T('ds_mp_min', { n: c.mp.min }) : '') : T('ds_mp_after', { n: c.mp.after, p: c.mp.plus }));
      if (c.teams) x.push(T('ds_teams'));
      if (c.heat >= 2) x.push(T('ds_heat', { n: c.heat }));
      if (c.reseed && c.heat >= 2) x.push(T('ds_reseed', { n: c.reseed }));
      if (c.poi && Array.isArray(c.poi.maps) && c.poi.maps.length) x.push(T('ds_poi', { n: c.poi.maps.length }));
      if (c.legendBan) x.push(T('ds_legend_ban'));
    }
    if (c.bestOf === 2 && (c.type === 'roundrobin' || c.type === 'swiss')) x.push(T('ds_bo2'));
    if (c.boards) x.push(T('ds_bridge', { n: c.boards }));
    if (c.pod) x.push(T('ds_pod', { n: c.pod.size, k: c.pod.rounds }));
    if (c.splits) x.push(T('ds_splits', { n: c.splits.n, k: c.splits.take, bo: c.splits.bo }));
    if (c.fixed) x.push(T(c.decider ? 'ds_fixed_dec' : 'ds_fixed', { n: c.bestOf })); // đủ số ván (kiểu OWL)
    if (Array.isArray(c.matchLadder) && c.matchLadder.length) { // thang ván (otour-ladder.js)
      x.push(T('ds_ladder', { list: c.matchLadder.map((l) => (l.arm ? T(l.bid ? 'ds_lad_bid' : 'ds_lad_arm') : T('ds_lad_lv', { n: l.games, tc: T('lad_tc_' + l.tc) }))).join(' → ') }));
      if (c.ladderKeep) x.push(T('ds_lad_keep'));
    }
    if (c.tbm) x.push(T(c.tbm === 'h2h' ? 'ds_tbm_h2h' : 'ds_tbm_match'));
    if (c.draw === 'record') x.push(T('ds_draw_record'));
    if (c.tbmLines && c.tbmLines.length) x.push(T('ds_tbm_lines', { list: c.tbmLines.join(', ') }));
    else if (c.tbmTop) x.push(T('ds_tbm_top'));
    if (c.meetSmall) x.push(T('ds_meet_small', { n: c.meetSmall }));
    if (c.pick) x.push(T('ds_pick'));
    if (c.rotBlock > 1) x.push(T('ds_rot_block', { n: c.rotBlock }));
    if (c.points && (c.type === 'roundrobin' || c.type === 'swiss')) {
      x.push(T('ds_points', { w: c.points.w, d: c.points.d, l: c.points.l }) + (c.points.wx != null ? ' ' + T('ds_points_x', { wx: c.points.wx, lx: c.points.lx }) : ''));
    }
    if (!last) {
      if (c.type === 'swiss' && c.record) x.push(T('ds_adv_rec', { n: c.record.win }));
      else if (c.type === 'swiss' && c.advanceMode === 'record') { /* cắt theo số thua: đã ghi ở trên */ }
      else if (Array.isArray(c.routes) && c.routes.length) x.push(...routeText(c, T, i));
      else if (c.advance) x.push(T(c.season ? 'ds_adv_conf' : c.type === 'gsl' || (c.type === 'roundrobin' && !c.league) ? 'ds_adv_group' : 'ds_adv', { n: c.advance }) + (c.bestNext ? ' ' + T('ds_best_next', { n: c.bestNext }) : ''));
      if (c.skip) x.push(T('ds_skip', { n: c.skip }));
      if (c.exit) x.push(T('ds_exit', { x: c.exit }));
    }
    if (c.direct) x.push(T('ds_direct', { n: c.direct })); // đội hạt giống cao vào thẳng giai đoạn này
    if (c.directLast) x.push(T('ds_direct_last'));
    if (c.drawFresh) x.push(T('ds_fresh_draw')); else if (c.slotFresh) x.push(T('ds_fresh_slot'));
    if (c.type === 'swiss' && c.region) x.push(T('ds_region'));
    return x.join(', ');
  }

  /** Mô tả cả bản cấu hình: [câu bộ môn, câu luật set?, câu từng giai đoạn…]. */
  /** "mùa giải 2 miền × 3 bảng con: cùng bảng con 4 lần, cùng miền 3 lần (+6 đội thêm 1 lần), khác miền 2 lần". */
  /** Playoff kiểu Mỹ: các mảnh mô tả. */
  function playoffText(po, T) {
    if (po.mode === 'div') return [T('ds_po_div')].concat(po.reseed ? [T('ds_po_reseed')] : []);
    const x = [T('ds_playoff', { n: po.per || 8 })];
    if (po.divWin) x.push(T('ds_po_divwin'));
    if (po.playin === 'nba' || po.playin === 'one') x.push(T('ds_po_pi_' + po.playin));
    if (po.reseed) x.push(T('ds_po_reseed'));
    return x;
  }
  function seasonText(se, T) {
    const lv = (k) => {
      const v = se[k] || {};
      if (!v.m && !v.x) return '';
      return T('ds_sn_' + k, { m: v.m || 0 }) + (v.x ? ' ' + T('ds_sn_extra', { x: v.x }) : '');
    };
    const parts = ['div', 'conf', 'inter'].filter((k) => (k !== 'conf' || se.divs > 1) && (k !== 'inter' || se.confs > 1)).map(lv).filter(Boolean);
    return T(se.divs > 1 ? 'ds_season_div' : 'ds_season', { c: se.confs, d: se.divs }) + ': ' + parts.join(', ');
  }

  function describeSpec(spec, T) {
    const sp = SP.SPORTS[spec.sport] || SP.SPORTS.other;
    const out = [T('ds_sport', { icon: sp.icon, sport: T('sport_' + (SP.SPORTS[spec.sport] ? spec.sport : 'other')), result: T('otres_' + (spec.result || sp.result)) })];
    const r = spec.result === 'sets' ? spec.set : null;
    if (r && r.rubber) out.push(T('ds_rubber', { n: r.rubber }) + (r.dead ? ' ' + T('ds_rubber_dead') : '')); // trận đồng đội (Davis Cup)
    else if (r && r.race) out.push(T('ds_set_race', { to: r.to }) + (r.lastBy ? ' ' + T('ds_set_last_by', { by: r.lastBy, cap: (r.lastCap || 1) - 1 }) : '')); // darts
    else if (r) out.push(T('ds_set', { to: r.to, by: r.by }) + (r.cap ? ' ' + T('ds_set_cap', { cap: r.cap }) : '') + (r.last ? ' ' + T('ds_set_last', { last: r.last }) : ''));
    const st = spec.stages || [];
    st.forEach((c, i) => out.push(T('ds_stage', { n: i + 1, text: stageText(c, T, i === st.length - 1, spec.result || sp.result, i) })));
    // Esports: cấm chọn / Fearless (otour-draft.js)
    const e = spec.esports;
    if (e) out.push(T('ds_esp', { draft: T('esp_dr_' + (e.draft || 'lol')), fl: T('esp_fl_' + (e.fearless || 'hard')) }));
    return out;
  }

  /** Đọc cấu hình từ JSON: kiểm sơ bộ (máy chủ kiểm kỹ khi tạo giải). Nhận cả { spec: {...} }. */
  function parseSpec(text) {
    let o;
    try { o = JSON.parse(String(text || '')); } catch (e) { return { error: 'ds_err_json' }; }
    if (o && o.spec && typeof o.spec === 'object') o = o.spec;
    if (!o || typeof o !== 'object' || Array.isArray(o)) return { error: 'ds_err_shape' };
    if (!Array.isArray(o.stages) || !o.stages.length || o.stages.length > MAX_STAGES) return { error: 'srv_ot_spec_stages' };
    if (o.stages.some((c) => !c || !TYPES.includes(c.type))) return { error: 'ds_err_type' };
    const spec = { sport: SP.SPORTS[o.sport] ? o.sport : 'other', stages: o.stages };
    if (SP.RESULTS.includes(o.result)) spec.result = o.result;
    if (o.set !== undefined) spec.set = o.set;
    if (o.esports && typeof o.esports === 'object') spec.esports = o.esports;
    return { spec };
  }

  const api = { SCHEMA, describeSpec, stageText, parseSpec, TYPES, TIEBREAKS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.CaroOTourSpecIO = api;
})(typeof window !== 'undefined' ? window : globalThis);
