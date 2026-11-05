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
      stages: {
        type: 'array', minItems: 1, maxItems: 3, description: 'Các giai đoạn; mọi giai đoạn trừ cuối phải là roundrobin / swiss / race',
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
            bestNext: int(0, 32, 'thêm đội xếp ngay sau suất đi tiếp tốt nhất'),
            rounds: int(0, 15, 'Thụy Sĩ: số vòng, 0 = tự động'), pairing: { type: 'string', enum: ['dutch', 'adjacent'] },
            record: { type: 'object', description: 'Thụy Sĩ theo số thắng / thua', properties: { win: int(1, 5), lose: int(1, 5), bo } },
            points: { type: 'object', properties: { w: int(0, 10), d: int(0, 10), l: int(0, 10), wx: int(0, 10), lx: int(0, 10), gw: int(0, 10), gt: int(0, 10), bye: int(0, 10) } },
            tiebreaks: { type: 'array', maxItems: 5, items: { type: 'string', enum: TIEBREAKS } },
            rankBy: { type: 'string', enum: ['points', 'match_wins', 'game_wins', 'game_pct', 'game_diff'] },
            events: int(1, 30, 'hệ Race: số chặng'), score: { type: 'string', enum: ['points', 'time'] },
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
    } else if (c.type === 'roundrobin') {
      if (c.league) x.push(T('ds_league', { games: c.league.games, pots: c.league.pots }));
      else {
        x.push(c.groupSize ? T('ds_group_size', { n: c.groupSize }) : (c.groups || 1) > 1 ? T('ds_groups', { n: c.groups }) : T('ds_rr'));
        if (c.meetings === 2) x.push(T('ds_home_away')); else if (c.meetings === 3) x.push(T('ds_meet3'));
      }
    } else if (c.type === 'swiss') {
      x.push(c.record ? T('ds_swiss_rec', { w: c.record.win, l: c.record.lose }) : c.rounds ? T('ds_swiss', { n: c.rounds }) : T('ds_swiss_auto'));
      if (c.record && c.record.bo) x.push(T('ds_rec_bo', { bo: c.record.bo }));
    } else if (c.type === 'race') {
      x.push(c.score === 'time' ? T('ds_time', { n: c.events || 1 }) : T('ds_race', { n: c.events || 1, top: (c.table || []).slice(0, 3).join('-') }));
      if (c.teams) x.push(T('ds_teams'));
      if (c.heat >= 2) x.push(T('ds_heat', { n: c.heat }));
    }
    if (c.points && (c.type === 'roundrobin' || c.type === 'swiss')) {
      x.push(T('ds_points', { w: c.points.w, d: c.points.d, l: c.points.l }) + (c.points.wx != null ? ' ' + T('ds_points_x', { wx: c.points.wx, lx: c.points.lx }) : ''));
    }
    if (!last) {
      if (c.type === 'swiss' && c.record) x.push(T('ds_adv_rec', { n: c.record.win }));
      else if (c.advance) x.push(T(c.type === 'roundrobin' && !c.league ? 'ds_adv_group' : 'ds_adv', { n: c.advance }) + (c.bestNext ? ' ' + T('ds_best_next', { n: c.bestNext }) : ''));
    }
    return x.join(', ');
  }

  /** Mô tả cả bản cấu hình: [câu bộ môn, câu luật set?, câu từng giai đoạn…]. */
  function describeSpec(spec, T) {
    const sp = SP.SPORTS[spec.sport] || SP.SPORTS.other;
    const out = [T('ds_sport', { icon: sp.icon, sport: T('sport_' + (SP.SPORTS[spec.sport] ? spec.sport : 'other')), result: T('otres_' + (spec.result || sp.result)) })];
    const r = spec.result === 'sets' ? spec.set : null;
    if (r) out.push(T('ds_set', { to: r.to, by: r.by }) + (r.cap ? ' ' + T('ds_set_cap', { cap: r.cap }) : '') + (r.last ? ' ' + T('ds_set_last', { last: r.last }) : ''));
    const st = spec.stages || [];
    st.forEach((c, i) => out.push(T('ds_stage', { n: i + 1, text: stageText(c, T, i === st.length - 1, spec.result || sp.result) })));
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
    return { spec };
  }

  const api = { SCHEMA, describeSpec, stageText, parseSpec, TYPES, TIEBREAKS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.CaroOTourSpecIO = api;
})(typeof window !== 'undefined' ? window : globalThis);
