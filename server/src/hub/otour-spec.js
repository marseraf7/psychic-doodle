/*
 * Giải đấu Offline – "bản cấu hình" của một giải (docs/de-xuat-giai-offline.md mục 6): bộ môn, kiểu kết quả, điểm,
 * tie-break, các giai đoạn. Mẫu giải nổi tiếng và (sau này) chatbot AI đều chỉ viết ra bản cấu hình này; máy chủ kiểm
 * bằng normalizeSpec – sai thì báo lỗi rõ ràng, không bao giờ tự đoán. Không phụ thuộc mạng (kiểm thử riêng được).
 *
 * Kiểu kết quả (result): 'score' (tỉ số – bóng đá, bóng rổ…; hoà ở loại trực tiếp phải có luân lưu),
 * 'sets' (điểm từng set – cầu lông, bóng bàn, bóng chuyền, tennis, thể thao điện tử), 'winner' (chỉ người thắng / hoà).
 */
'use strict';
const ST = require('./stages.js');

// Bộ môn có sẵn và kiểu kết quả: dùng chung với trình duyệt (caro/otour-sports.js)
const { SPORTS, RESULTS } = require('../../../caro/otour-sports.js');
const Rules = require('../../../caro/otour-rules.js');
const MAX_TEAMS = 512;
const MAX_MATCHES = 10000;

class SpecError extends Error {
  constructor(code, args = {}) { super(code); this.code = code; this.args = args; }
}

/**
 * Chuẩn hoá bản cấu hình từ client / mẫu / chatbot. Trả { sport, result, set, stages }.
 * set: luật set (otour-rules.js – chỉ kiểu 'sets'); không ghi thì lấy theo bộ môn, null / false = không kiểm điểm từng set.
 * stages dùng đúng định dạng giai đoạn của giải Caro (stages.js – normalizeStages): loại trực tiếp, nhánh thắng –
 * thua, vòng tròn, Thụy Sĩ… Điểm / tie-break của vòng tròn / Thụy Sĩ lấy từ bộ môn nếu không ghi rõ.
 */
function normalizeSpec(o) {
  o = o || {};
  const sport = Object.prototype.hasOwnProperty.call(SPORTS, o.sport) ? o.sport : 'other';
  const preset = SPORTS[sport];
  const result = RESULTS.includes(o.result) ? o.result : preset.result;
  if (!Array.isArray(o.stages) || !o.stages.length) throw new SpecError('ot_spec_stages');
  if (o.stages.length > 3) throw new SpecError('ot_spec_stages');
  const raw = o.stages.map((c) => {
    const x = { ...(c || {}) };
    if (x.bestOf == null) x.bestOf = preset.bestOf;
    if (x.type === 'roundrobin') x.big = true; // giải offline: bảng lớn tới 64 đội (league lượt đi – về)
    if (x.type === 'roundrobin' || x.type === 'swiss') {
      if (!x.points) x.points = { ...preset.points };
      if (!x.tiebreaks) x.tiebreaks = [...preset.tiebreaks];
    }
    return x;
  });
  const set = result === 'sets' ? Rules.cleanSet(o.set === undefined ? preset.set : o.set) : null;
  return { sport, result, set, stages: ST.normalizeStages(raw, { offline: true }) };
}

/** Kiểm cỡ giải sau khi đã có số đội: đủ người, tối đa MAX_TEAMS, ước tính số trận không vượt MAX_MATCHES. */
function checkSize(spec, n) {
  if (n < 2) throw new SpecError('ot_few_teams');
  if (n > MAX_TEAMS) throw new SpecError('ot_many_teams', { n: MAX_TEAMS });
  const E = require('../../../caro/tour-estimate.js');
  const e = E.estimate({ stages: spec.stages, players: n, timeLimit: 20 });
  if ((e.maxMatches || e.matches) > MAX_MATCHES) throw new SpecError('ot_many_matches', { n: MAX_MATCHES });
  // League phase: số đội (theo ước tính từng giai đoạn) phải chia đều cho các nhóm hạt giống, số trận chia đều cho các nhóm
  spec.stages.forEach((c, i) => {
    const bad = ST.leagueError(c, e.stages[i] ? e.stages[i].players : n);
    if (bad) throw new SpecError(bad.code, bad.args);
  });
  return e;
}

module.exports = { SPORTS, RESULTS, MAX_TEAMS, MAX_MATCHES, SpecError, normalizeSpec, checkSize };
