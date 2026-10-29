/*
 * Ước tính quy mô một giải theo giai đoạn (dùng chung trình duyệt và máy chủ – hàm thuần, không phụ thuộc mạng):
 * số trận, số lượt đấu nối tiếp (vòng), số người đi tiếp từng giai đoạn, thời gian ước tính.
 * Như MyLeague ("Đối với cấu hình này thì số lượng trận đấu của giải là: N"), cập nhật ngay khi đổi cấu hình.
 * Công thức khớp cách máy chủ dựng giải (server/src/hub/stages*.js); server/test/estimate.test.js mô phỏng cả giải
 * để kiểm lại. Trận miễn đấu không tính.
 *   CaroTourEstimate.estimate({ stages, players, timeLimit, clock }) → { stages: [...], matches, maxMatches, waves, minutes }
 */
(function (global) {
  'use strict';
  const MAX_GROUP = 16; // như stages-base.js
  const MAX_GROUPS = 64;
  /** Số ván trung bình của một trận BoN (Bo3 thường 2–3 ván, Bo5 thường 3–5 ván). */
  const GAMES = { 1: 1, 3: 2.5, 5: 4 };
  const BREAK_MIN = 1; // nghỉ giữa hai lượt đấu (chờ trận chậm nhất, vào phòng)
  const STAGE_BREAK_MIN = 2; // giữa hai giai đoạn

  const log2up = (n) => { let k = 0; while ((1 << k) < n) k++; return k; };
  /** Số bảng vòng tròn (như groupCount ở stages-groups.js). */
  function groupCount(c, n) {
    let G = c.groupSize ? Math.ceil(n / c.groupSize) : c.groups || 1;
    G = Math.max(G, Math.ceil(n / MAX_GROUP));
    return Math.max(1, Math.min(G, Math.floor(n / 2), MAX_GROUPS));
  }
  /** Cỡ từng bảng khi chia đều n người vào G bảng. */
  const groupSizes = (n, G) => Array.from({ length: G }, (_, i) => Math.floor(n / G) + (i < n % G ? 1 : 0));
  /** Số vòng Thụy Sĩ tối đa có nghĩa với n người (như swissMaxRounds ở stages-groups.js). */
  const swissMax = (n) => (n <= 4 ? Math.max(1, n % 2 ? n : n - 1) : Math.ceil(n / 2));

  /** Một giai đoạn với n người: { matches, maxMatches, waves, advance, rounds?, groups? }. */
  function stage(c, n, last) {
    if (n < 2) return { matches: 0, maxMatches: 0, waves: 0, advance: n };
    if (c.type === 'single') {
      const third = c.thirdPlace !== false && n >= 4 ? 1 : 0;
      return { matches: n - 1 + third, maxMatches: n - 1 + third, waves: log2up(n), advance: null };
    }
    if (c.type === 'double') {
      // Nhánh thua dài gấp đôi nhánh thắng; nhánh đầy (> 5/8 cỡ nhánh) thì thêm một lượt
      const k = log2up(n), P = 1 << k;
      const waves = 2 * k - 1 + (n * 8 > 5 * P ? 1 : 0);
      const reset = c.reset !== false && n >= 2 ? 1 : 0;
      return { matches: 2 * n - 2, maxMatches: 2 * n - 2 + reset, waves, maxWaves: waves + reset, advance: null };
    }
    if (c.type === 'roundrobin') {
      const G = groupCount(c, n), sizes = groupSizes(n, G), meet = c.meetings === 2 ? 2 : 1;
      const big = sizes[0];
      const matches = meet * sizes.reduce((t, s) => t + (s * (s - 1)) / 2, 0);
      const adv = last ? null : sizes.reduce((t, s) => t + Math.min(c.advance || 0, s), 0);
      return { matches, maxMatches: matches, waves: meet * (big % 2 ? big : big - 1), advance: adv, groups: G, groupSize: big };
    }
    // Thụy Sĩ: số vòng bị giới hạn khi ít người
    const rounds = Math.min(c.rounds || 1, swissMax(n));
    const matches = rounds * Math.floor(n / 2);
    return { matches, maxMatches: matches, waves: rounds, rounds, advance: last ? null : Math.min(c.advance || 0, n) };
  }

  /** Thời gian trung bình của một ván (phút): giới hạn mỗi nước timeLimit giây, hoặc đồng hồ '5+3'. */
  function gameMinutes(timeLimit, clock) {
    const m = /^(\d+)\+(\d+)$/.exec(String(clock || ''));
    // Ván caro thường ~45 nước cả hai bên; mỗi nước dùng ~45% giới hạn, đồng hồ tổng dùng ~60% thời gian gốc
    if (m) return 2 * (0.6 * Number(m[1]) + (22 * Number(m[2])) / 60);
    return (45 * 0.45 * (Number(timeLimit) || 20)) / 60;
  }

  function estimate({ stages, players, timeLimit, clock }) {
    const list = Array.isArray(stages) ? stages : [];
    let n = Math.max(0, Math.floor(Number(players) || 0));
    const per = gameMinutes(timeLimit, clock);
    const out = { stages: [], matches: 0, maxMatches: 0, waves: 0, minutes: 0 };
    list.forEach((c, i) => {
      const last = i === list.length - 1;
      const s = { ...stage(c, n, last), players: n };
      const games = GAMES[c.bestOf] || 1;
      s.minutes = (s.maxWaves || s.waves) * (games * per + BREAK_MIN);
      out.stages.push(s);
      out.matches += s.matches;
      out.maxMatches += s.maxMatches;
      out.waves += s.maxWaves || s.waves;
      out.minutes += s.minutes + (i ? STAGE_BREAK_MIN : 0);
      if (!last) n = s.advance;
    });
    out.minutes = Math.round(out.minutes);
    return out;
  }

  const CaroTourEstimate = { estimate, stage, gameMinutes, groupCount, groupSizes };
  if (typeof module !== 'undefined' && module.exports) module.exports = CaroTourEstimate;
  else global.CaroTourEstimate = CaroTourEstimate;
})(typeof window !== 'undefined' ? window : globalThis);
