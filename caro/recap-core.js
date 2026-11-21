/*
 * Tổng kết tháng / năm – phần tính thuần (trình duyệt: window.CaroRecapCore; máy chủ: server/src/hub/recap.js).
 *   range(kind, y, m)  → { from, to } (ms) – tháng m (1–12) hoặc cả năm y theo giờ Việt Nam (UTC+7)
 *   vnMonth(at)        → { y, m } – tháng theo giờ Việt Nam của thời điểm at
 *   summarize(games)   → số ván, thắng / hoà / thua, luật + loại thời gian chơi nhiều nhất, thắng đẹp nhất (đối thủ điểm cao
 *                        nhất bị mình thắng; tên chỉ khi cả hai công khai lịch sử đấu), chuỗi thắng dài nhất (theo thứ tự thời gian), đối thủ gặp nhiều nhất (chỉ khi
 *                        cả hai để công khai lịch sử đấu), số ngày có chơi
 * games: [{ at, id? (thứ tự lưu – khi cùng thời điểm), rule, pool, res: 'win' | 'loss' | 'draw', share?, opp: { id, name, r, pub } | null }]
 */
(function (global) {
  'use strict';

  // Giờ Việt Nam (UTC+7, không đổi giờ mùa hè) – như tuần của Hạng đấu tuần / bảng Storm tuần (progress-merge.js weekKey):
  // tháng / năm / "ngày có chơi" giống nhau trên máy chủ (thường chạy UTC) và mọi trình duyệt, không theo giờ máy
  const VN = 7 * 3600000;
  const DAY = 86400000;

  function range(kind, y, m) {
    if (kind === 'year') return { from: Date.UTC(y, 0, 1) - VN, to: Date.UTC(y + 1, 0, 1) - VN };
    return { from: Date.UTC(y, m - 1, 1) - VN, to: Date.UTC(y, m, 1) - VN };
  }

  /** Năm và tháng (1–12) theo giờ Việt Nam của thời điểm at (ms) – kỳ mặc định khi mở hộp Tổng kết. */
  function vnMonth(at) {
    const d = new Date(at + VN);
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 };
  }

  function top(counts) {
    let best = null;
    for (const [k, n] of Object.entries(counts)) if (!best || n > best.n || (n === best.n && k < best.k)) best = { k, n };
    return best;
  }

  function summarize(games) {
    const list = (games || []).filter((g) => g && ['win', 'loss', 'draw'].includes(g.res)).sort((a, b) => (a.at || 0) - (b.at || 0) || (a.id || 0) - (b.id || 0)); // cùng mili-giây: theo thứ tự lưu
    const out = { n: list.length, w: 0, d: 0, l: 0, rule: null, pool: null, best: null, streak: 0, opp: null, days: 0 };
    const rules = {}, pools = {}, opps = {}, days = new Set();
    let run = 0;
    for (const g of list) {
      out[g.res === 'win' ? 'w' : g.res === 'draw' ? 'd' : 'l']++;
      rules[g.rule || 'vn'] = (rules[g.rule || 'vn'] || 0) + 1;
      if (g.pool) pools[g.pool] = (pools[g.pool] || 0) + 1;
      days.add(Math.floor(((g.at || 0) + VN) / DAY)); // ngày theo giờ Việt Nam
      run = g.res === 'win' ? run + 1 : 0;
      out.streak = Math.max(out.streak, run);
      const o = g.opp;
      // Tên đối thủ chỉ khi cả hai công khai lịch sử đấu (như "đối thủ gặp nhiều nhất"): thẻ PNG được chia sẻ ra ngoài –
      // không lộ kết quả ván của người để lịch sử đấu riêng tư; không thì chỉ ghi điểm (name: null)
      if (g.res === 'win' && o && o.r > 0 && (!out.best || o.r > out.best.r)) out.best = { name: o.pub ? o.name : null, r: o.r, at: g.at, share: g.share || null };
      if (o && o.id && o.pub) {
        const e = opps[o.id] || (opps[o.id] = { name: o.name, n: 0 });
        e.n++;
      }
    }
    const r = top(rules), p = top(pools);
    out.rule = r ? { k: r.k, n: r.n } : null;
    out.pool = p ? { k: p.k, n: p.n } : null;
    const oe = Object.values(opps).sort((a, b) => b.n - a.n || (a.name < b.name ? -1 : 1))[0];
    out.opp = oe && oe.n >= 2 ? oe : null; // gặp 1 lần thì chưa phải "hay gặp"
    out.days = days.size;
    return out;
  }

  const CaroRecapCore = { range, vnMonth, summarize, VN };
  if (typeof module !== 'undefined' && module.exports) module.exports = CaroRecapCore;
  else global.CaroRecapCore = CaroRecapCore;
})(typeof window !== 'undefined' ? window : globalThis);
