/*
 * Giải đấu Offline – tự xếp lịch thi đấu (dùng chung trình duyệt + máy chủ: server/src/hub/otour-sched.js gọi; form và
 * cảnh báo trùng lịch: caro/otour-sched-ui.js).
 * Cấu hình lịch (t.sched):
 *   { start: 'YYYY-MM-DD', days: [0..6] (0 = Chủ nhật), times: ['19:00', …], tz: phút lệch UTC (Date#getTimezoneOffset),
 *     venues: ['Sân 1', …], home: true = đá trên sân nhà của đội đứng trước, perSlot: số trận tối đa mỗi giờ (0 = theo số
 *     sân / không giới hạn), rest: số ngày nghỉ tối thiểu giữa hai trận của một đội, skip: ['YYYY-MM-DD', …] ngày không
 *     đấu, auto: true = giai đoạn sau bốc thăm xong thì tự xếp }
 * Ngày được đánh số từ ngày bắt đầu (ngày 0); giờ đấu = nửa đêm ngày đó theo giờ địa phương + giờ trong ngày.
 *   cleanSched(s)                       – chuẩn hoá cấu hình
 *   autoSchedule(items, cfg, opts)      – xếp lần lượt từng trận vào ô giờ sớm nhất hợp lệ → { placed: [{ id, when, venue }],
 *                                         unplaced: [id] }. items: [{ id, a, b, stage, lvl, seq, when?, venue?, keep?,
 *                                         homeVenue? }] theo thứ tự đấu; keep: giữ nguyên giờ (chỉ chiếm chỗ).
 *                                         seq: trận ở mức lvl chỉ đấu sau mọi trận mức lvl − 1 của giai đoạn (loại trực
 *                                         tiếp: chưa biết đội). Trận giai đoạn sau đấu sau mọi trận giai đoạn trước.
 *   findSlot(items, cfg, id, fromWhen)  – ô giờ sớm nhất từ fromWhen cho trận id (đá bù) → { when, venue } | null
 *   conflicts(ms, dayKey)               – trận trùng: một đội đá 2 trận cùng ngày, một sân 2 trận cùng giờ
 */
(function (global) {
  'use strict';
  const DAY = 86400000;
  const MAX_DAYS = 3 * 366; // tìm ô giờ trong 3 năm
  const MAX_TIMES = 12, MAX_VENUES = 32, MAX_SKIP = 200;
  const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
  const int = (v, lo, hi, def) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def; };
  const realTeam = (u) => typeof u === 'string' && u !== '-' && u !== '';
  const list = (v) => (Array.isArray(v) ? v : String(v == null ? '' : v).split(/[\n,;]+/));

  /** 'YYYY-MM-DD' hợp lệ → mili giây UTC của nửa đêm ngày đó (theo lịch), không hợp lệ → null. */
  function dateMs(s) {
    const m = DATE_RE.exec(String(s || ''));
    if (!m) return null;
    const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const d = new Date(ms);
    return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]) && m[1] >= '2000' && m[1] < '2100' ? ms : null;
  }
  /** '19:00', '7h30', '19.5'… → '19:00' / '07:30' (không hợp lệ → null). */
  function normTime(s) {
    const m = /^\s*([01]?\d|2[0-3])\s*(?:[:hH.]\s*([0-5]\d)?)?\s*$/.exec(String(s || ''));
    return m ? `${m[1].padStart(2, '0')}:${m[2] || '00'}` : null;
  }
  const isoDate = (ms) => new Date(ms).toISOString().slice(0, 10);

  function cleanSched(s) {
    s = s && typeof s === 'object' ? s : {};
    const days = [...new Set((Array.isArray(s.days) ? s.days : []).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
    const times = [...new Set(list(s.times).map(normTime).filter(Boolean))].sort().slice(0, MAX_TIMES);
    const venues = [...new Set(list(s.venues).map((v) => String(v).replace(/[<>|]/g, '').trim().slice(0, 40)).filter(Boolean))].slice(0, MAX_VENUES);
    const skip = [...new Set(list(s.skip).map((x) => String(x).trim()).filter((x) => dateMs(x) != null))].slice(0, MAX_SKIP);
    return {
      start: dateMs(s.start) != null ? String(s.start) : isoDate(Date.now()),
      days: days.length ? days : [0, 1, 2, 3, 4, 5, 6],
      times: times.length ? times : ['19:00'],
      tz: int(s.tz, -840, 840, 0),
      venues,
      home: s.home === true,
      perSlot: int(s.perSlot, 0, 64, 0),
      rest: int(s.rest, 0, 30, 0),
      skip,
      auto: s.auto === true,
    };
  }

  /** Bộ đếm ngày / giờ theo cấu hình. */
  function clock(cfg) {
    const base = dateMs(cfg.start);
    const mins = cfg.times.map((x) => Number(x.slice(0, 2)) * 60 + Number(x.slice(3)));
    const skip = new Set(cfg.skip);
    const days = new Set(cfg.days);
    return {
      whenOf: (day, ti) => base + day * DAY + (mins[ti] + cfg.tz) * 60000,
      dayOf: (when) => Math.floor((when - cfg.tz * 60000 - base) / DAY),
      open: (day) => days.has(new Date(base + day * DAY).getUTCDay()) && !skip.has(isoDate(base + day * DAY)),
      slots: mins.length,
    };
  }

  /** Trạng thái chiếm chỗ: ô giờ (số trận, sân đã dùng), ngày đấu của từng đội, ngày muộn nhất mỗi giai đoạn / mức. */
  function board(cfg, C) {
    const use = new Map(), team = new Map(), lvlMax = new Map(), stageMax = new Map();
    const cap = Math.min(cfg.home ? Infinity : cfg.venues.length || Infinity, cfg.perSlot || Infinity);
    const slotOf = (when) => { let s = use.get(when); if (!s) use.set(when, (s = { n: 0, venues: new Set() })); return s; };
    const B = {
      teamOk: (u, day) => !realTeam(u) || (team.get(u) || []).every((d) => Math.abs(d - day) > cfg.rest),
      /** Sân cho trận it ở ô giờ when: undefined = ô đầy / sân bận. */
      venueAt(it, when) {
        const s = use.get(when);
        if (s && s.n >= cap) return undefined;
        if (cfg.home) { const v = it.homeVenue || null; return v && s && s.venues.has(v) ? undefined : v; }
        if (!cfg.venues.length) return null;
        const v = cfg.venues.find((x) => !s || !s.venues.has(x));
        return v === undefined ? undefined : v;
      },
      take(it, when, venue) {
        const s = slotOf(when), day = C.dayOf(when);
        s.n++;
        if (venue) s.venues.add(venue);
        for (const u of [it.a, it.b]) if (realTeam(u)) { if (!team.has(u)) team.set(u, []); team.get(u).push(day); }
        const k = it.stage + ':' + it.lvl;
        lvlMax.set(k, Math.max(lvlMax.has(k) ? lvlMax.get(k) : -Infinity, day));
        stageMax.set(it.stage, Math.max(stageMax.has(it.stage) ? stageMax.get(it.stage) : -Infinity, day));
      },
      /** Ngày sớm nhất được đấu: sau các giai đoạn trước; loại trực tiếp: sau mức trước của giai đoạn. */
      minDay(it) {
        let d = 0;
        for (const [s, m] of stageMax) if (s < it.stage) d = Math.max(d, m + 1 + cfg.rest);
        if (it.seq) {
          for (const [k, m] of lvlMax) {
            const [s, l] = k.split(':').map(Number);
            if (s === it.stage && l < it.lvl) d = Math.max(d, m + 1 + cfg.rest);
          }
        }
        return d;
      },
    };
    return B;
  }

  /** Ô giờ sớm nhất từ ngày from cho trận it. */
  function place(B, C, it, from) {
    for (let d = Math.max(0, from); d < MAX_DAYS; d++) {
      if (!C.open(d) || !B.teamOk(it.a, d) || !B.teamOk(it.b, d)) continue;
      for (let ti = 0; ti < C.slots; ti++) {
        const when = C.whenOf(d, ti);
        const venue = B.venueAt(it, when);
        if (venue !== undefined) return { when, venue };
      }
    }
    return null;
  }

  function autoSchedule(items, cfg, opts = {}) {
    cfg = cleanSched(cfg);
    const C = clock(cfg), B = board(cfg, C);
    const from = opts.fromWhen != null ? Math.max(0, C.dayOf(opts.fromWhen) + 1) : 0;
    for (const it of items) if (it.keep && it.when) B.take(it, it.when, it.venue || null);
    const placed = [], unplaced = [];
    for (const it of items) {
      if (it.keep) continue;
      const got = place(B, C, it, Math.max(from, B.minDay(it)));
      if (!got) { unplaced.push(it.id); continue; }
      B.take(it, got.when, got.venue);
      placed.push({ id: it.id, ...got });
    }
    return { placed, unplaced };
  }

  /** Đá bù: mọi trận khác đã có giờ giữ nguyên; trận id lấy ô sớm nhất sau fromWhen. */
  function findSlot(items, cfg, id, fromWhen) {
    cfg = cleanSched(cfg);
    const C = clock(cfg), B = board(cfg, C);
    const it = items.find((x) => x.id === id);
    if (!it) return null;
    for (const x of items) if (x.id !== id && x.when) B.take(x, x.when, x.venue || null);
    return place(B, C, it, Math.max(0, C.dayOf(fromWhen) + 1));
  }

  /**
   * Trận trùng lịch: ms = [{ id, a, b, when, venue }] (trận chưa có giờ bỏ qua); dayKey(when) → ngày địa phương.
   * Trả [{ kind: 'team', who, ids }, { kind: 'venue', who, ids }].
   */
  function conflicts(ms, dayKey) {
    const by = new Map();
    const add = (k, kind, who, id) => { if (!by.has(k)) by.set(k, { kind, who, ids: [] }); by.get(k).ids.push(id); };
    for (const m of ms) {
      if (!m.when) continue;
      const day = dayKey(m.when);
      for (const u of [m.a, m.b]) if (realTeam(u)) add(`t|${u}|${day}`, 'team', u, m.id);
      if (m.venue) add(`v|${m.venue}|${m.when}`, 'venue', m.venue, m.id);
    }
    return [...by.values()].filter((x) => x.ids.length > 1);
  }

  const api = { DAY, cleanSched, normTime, dateMs, autoSchedule, findSlot, conflicts };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.CaroOTourSched = api;
})(typeof window !== 'undefined' ? window : globalThis);
