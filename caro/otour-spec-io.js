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
  const TYPES = ['single', 'double', 'roundrobin', 'swiss', 'race'];
  const TIEBREAKS = ['h2h', 'bh', 'bh1', 'bh2', 'mbh', 'mbh2', 'fb', 'aob', 'sb', 'koya', 'ps', 'wins', 'won', 'bpg', 'aro', 'aroc1', 'tpr', 'apro', 'gdiff', 'gwins', 'gpct', 'pdiff', 'ppct', 'losses'];
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
        properties: { to: int(1, 99, 'điểm thắng set'), by: int(1, 10, 'phải hơn'), cap: int(0, 199, 'điểm trần, 0 = không'), last: int(0, 99, 'set quyết định, 0 = như trên') } },
      esports: { type: 'object', description: 'Esports: cấm chọn và chi tiết từng ván. draft lol (20 bước) / custom (bans, picks mỗi đội) / off; fearless hard (tướng đã chọn ở ván trước không ai chọn lại) / soft (chỉ đội đã chọn) / off; scope series / stage; stats: chỉ số đội bắt buộc (kills, gold, towers, dragons, barons, heralds, inhibitors hoặc nhãn tự đặt); players: nhập K/D/A; pool: danh sách tướng gợi ý',
        properties: { draft: { type: 'string', enum: ['lol', 'custom', 'off'] }, bans: int(0, 10), picks: int(1, 10), fearless: { type: 'string', enum: ['hard', 'soft', 'off'] },
          scope: { type: 'string', enum: ['series', 'stage'] }, stats: { type: 'array', maxItems: 8, items: { type: 'string' } }, players: { type: 'boolean' }, pool: { type: 'array', maxItems: 400, items: { type: 'string' } } } },
      stages: {
        type: 'array', minItems: 1, maxItems: 3, description: 'Các giai đoạn; giai đoạn giữa: roundrobin / swiss / race hoặc single / double (đi tiếp theo thứ hạng chung cuộc, advance)',
        items: {
          type: 'object', required: ['type'],
          properties: {
            type: { type: 'string', enum: TYPES },
            bestOf: bo, advance: int(1, 200, 'số người đi tiếp (vòng tròn: mỗi bảng)'),
            thirdPlace: { type: 'boolean' }, places: { type: 'array', items: { type: 'integer' }, description: 'trận xếp hạng: 3 = hạng 3–4, 5 = 5–6…' },
            boSemi: bo, boFinal: bo, gf: { type: 'string', enum: ['2', '1', 'none'] }, split: { type: 'boolean' },
            legs: { type: 'boolean', description: 'loại trực tiếp 2 lượt (tổng tỉ số)' }, legsFinal: { type: 'boolean' },
            heat: int(0, 64, 'Race: tối đa số người mỗi lượt (đoàn đông hơn thì chia lượt), 0 = không chia'),
            path: { type: 'string', enum: ['groups'], description: 'loại trực tiếp sau vòng bảng: nhánh cố định theo vị trí trong bảng (1A–2B, kiểu World Cup 2026)' },
            groups: int(1, 64), groupSize: int(2, 64), meetings: { type: 'integer', enum: [1, 2, 3] },
            league: { type: 'object', description: 'league phase kiểu Champions League', properties: { games: int(1, 20), pots: int(1, 8) } },
            season: { type: 'object', description: 'mùa giải kiểu nhà nghề Mỹ: confs miền × divs bảng con (đội chia theo thứ tự danh sách); div / conf / inter = gặp đội cùng bảng con / cùng miền khác bảng con / khác miền: m lần mỗi đối thủ + x đối thủ gặp thêm 1 lần',
              properties: { confs: int(1, 8), divs: int(1, 8), div: lv, conf: lv, inter: lv } },
            playoff: { type: 'object', description: 'loại trực tiếp ngay sau mùa giải: playoff kiểu nhà nghề Mỹ – mỗi miền một nửa nhánh, hai đội vô địch miền gặp nhau ở chung kết. mode seed: per đội mỗi miền theo hạt giống (thiếu đội thì hạt giống cao miễn đấu), divWin: nhất bảng con giữ hạt giống đầu, playin nba (hạt giống per−1 … per+2) / one (per gặp per+1); mode div: kiểu NHL (3 đội đầu mỗi bảng con + 2 vé vớt, cần 2 bảng con mỗi miền); reseed: xếp lại cặp sau mỗi vòng. Mùa giải phải cho per + đội play-in (div: 8) đội mỗi miền đi tiếp',
              properties: { mode: { type: 'string', enum: ['seed', 'div'] }, per: int(2, 16), divWin: { type: 'boolean' }, playin: { type: 'string', enum: ['none', 'nba', 'one'] }, reseed: { type: 'boolean' }, playinBo: { type: 'integer', enum: [1, 3, 5, 7] } } },
            boRounds: { type: 'array', maxItems: 8, items: bo, description: 'loại trực tiếp: Bo riêng từng vòng từ vòng 1 (số cuối áp cho các vòng sau), vd. [3, 5, 7, 7]' },
            direct: int(0, 256, 'giai đoạn thứ 2 trở đi: số đội hạt giống cao nhất vào thẳng giai đoạn này (không đá các giai đoạn trước)'),
            region: { type: 'boolean', description: 'Thụy Sĩ: vòng 1 tránh hai đội cùng khu vực (cột quốc gia)' },
            bestNext: int(0, 32, 'thêm đội xếp ngay sau suất đi tiếp tốt nhất'),
            rounds: int(0, 15, 'Thụy Sĩ: số vòng, 0 = tự động'), pairing: { type: 'string', enum: ['dutch', 'adjacent'] },
            record: { type: 'object', description: 'Thụy Sĩ theo số thắng / thua', properties: { win: int(1, 5), lose: int(1, 5), bo } },
            points: { type: 'object', properties: { w: int(0, 10), d: int(0, 10), l: int(0, 10), wx: int(0, 10), lx: int(0, 10), gw: int(0, 10), gt: int(0, 10), bye: int(0, 10) } },
            tiebreaks: { type: 'array', maxItems: TIEBREAKS.length, items: { type: 'string', enum: TIEBREAKS } },
            rankBy: { type: 'string', enum: ['points', 'match_wins', 'game_wins', 'game_pct', 'game_diff'] },
            events: int(1, 30, 'hệ Race: số chặng'), score: { type: 'string', enum: ['points', 'time', 'gt'], description: "'points' điểm theo hạng, 'time' cộng thời gian, 'gt' xe đạp nhiều chặng (tổng thời gian, điểm, leo núi, trẻ, đồng đội)" },
            kinds: { type: 'array', maxItems: 30, items: { type: 'string', enum: ['flat', 'hilly', 'mtn', 'itt'] }, description: "'gt': loại từng chặng – đồng bằng / đồi / núi / tính giờ cá nhân" },
            bonus: { type: 'boolean', description: "'gt': giây thưởng về đích top 3 (10-6-4)" },
            table: { type: 'array', maxItems: 64, items: int(0, 1000), description: 'hệ Race: điểm theo hạng' }, teams: { type: 'boolean', description: 'hệ Race: bảng đội' },
          },
        },
      },
    },
  };

  /** Mô tả một giai đoạn (một câu). T(key, args) – hàm dịch. */
  function stageText(c, T, last, result = 'score') {
    const x = [];
    if (c.type === 'single' || c.type === 'double') {
      x.push(T(c.type === 'single' ? 'ds_single' : 'ds_double', { bo: c.bestOf || 1 }));
      if (c.type === 'single' && (c.thirdPlace || (c.places || []).includes(3))) x.push(T('ds_third'));
      if (c.boFinal) x.push(T('ds_bo_final', { bo: c.boFinal }));
      if (c.legs && result === 'score') x.push(T(c.legsFinal ? 'ds_legs_all' : 'ds_legs')); // 2 lượt chỉ với kiểu tỉ số
      if (c.path === 'groups') x.push(T('ds_path'));
      if (c.type === 'single' && c.playoff) x.push(...playoffText(c.playoff, T)); // playoff kiểu Mỹ
      if (c.type === 'single' && Array.isArray(c.boRounds) && c.boRounds.length) x.push(T('ds_bo_rounds', { list: c.boRounds.join(', ') }));
    } else if (c.type === 'roundrobin') {
      if (c.league) x.push(T('ds_league', { games: c.league.games, pots: c.league.pots }));
      else if (c.season) x.push(seasonText(c.season, T));
      else {
        x.push(c.groupSize ? T('ds_group_size', { n: c.groupSize }) : (c.groups || 1) > 1 ? T('ds_groups', { n: c.groups }) : T('ds_rr'));
        if (c.meetings === 2) x.push(T('ds_home_away')); else if (c.meetings === 3) x.push(T('ds_meet3'));
      }
    } else if (c.type === 'swiss') {
      x.push(c.record ? T('ds_swiss_rec', { w: c.record.win, l: c.record.lose }) : c.rounds ? T('ds_swiss', { n: c.rounds }) : T('ds_swiss_auto'));
      if (c.record && c.record.bo) x.push(T('ds_rec_bo', { bo: c.record.bo }));
    } else if (c.type === 'race') {
      if (c.score === 'gt') { // xe đạp nhiều chặng: số chặng theo loại
        const n = (k) => (c.kinds || []).filter((x) => x === k).length;
        x.push(T('ds_gt', { n: c.events || 1, f: n('flat'), h: n('hilly'), m: n('mtn'), t: n('itt') }));
        if (c.bonus !== false) x.push(T('ds_gt_bonus'));
      } else x.push(c.score === 'time' ? T('ds_time', { n: c.events || 1 }) : T('ds_race', { n: c.events || 1, top: (c.table || []).slice(0, 3).join('-') }));
      if (c.teams) x.push(T('ds_teams'));
      if (c.heat >= 2) x.push(T('ds_heat', { n: c.heat }));
    }
    if (c.points && (c.type === 'roundrobin' || c.type === 'swiss')) {
      x.push(T('ds_points', { w: c.points.w, d: c.points.d, l: c.points.l }) + (c.points.wx != null ? ' ' + T('ds_points_x', { wx: c.points.wx, lx: c.points.lx }) : ''));
    }
    if (!last) {
      if (c.type === 'swiss' && c.record) x.push(T('ds_adv_rec', { n: c.record.win }));
      else if (c.advance) x.push(T(c.season ? 'ds_adv_conf' : c.type === 'roundrobin' && !c.league ? 'ds_adv_group' : 'ds_adv', { n: c.advance }) + (c.bestNext ? ' ' + T('ds_best_next', { n: c.bestNext }) : ''));
    }
    if (c.direct) x.push(T('ds_direct', { n: c.direct })); // đội hạt giống cao vào thẳng giai đoạn này
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
    if (r) out.push(T('ds_set', { to: r.to, by: r.by }) + (r.cap ? ' ' + T('ds_set_cap', { cap: r.cap }) : '') + (r.last ? ' ' + T('ds_set_last', { last: r.last }) : ''));
    const st = spec.stages || [];
    st.forEach((c, i) => out.push(T('ds_stage', { n: i + 1, text: stageText(c, T, i === st.length - 1, spec.result || sp.result) })));
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
    if (!Array.isArray(o.stages) || !o.stages.length || o.stages.length > 3) return { error: 'srv_ot_spec_stages' };
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
