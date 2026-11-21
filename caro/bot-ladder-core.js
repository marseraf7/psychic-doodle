/*
 * Thang nhân vật máy – phần tính thuần (dùng chung trình duyệt: window.CaroLadderCore; máy chủ: server/src/hub/ladder.js).
 * Thang = 31 nhân vật của bots.js xếp theo sức cờ: mức 1 → 6 (trong mỗi mức: Gài bẫy, Nước đôi, Phòng thủ, Tấn công, rồi
 * Toàn diện – mạnh nhất mức), cuối cùng là trùm BOAT. Tiến độ theo từng luật: đã thắng tới bậc thứ mấy (bậc cao nhất từng
 * thắng). Không khoá ván: chỉ là tiến độ + huy hiệu (hết mỗi mức, hạ BOAT).
 *   order(bots)              → [id…] thứ tự thang
 *   win(state, id, rule, ids) → trạng thái mới sau khi thắng nhân vật id ở luật rule
 *   merge(a, b)              → gộp hai trạng thái (máy này + tài khoản): lấy bậc cao hơn mỗi luật
 *   clean(x)                 → trạng thái hợp lệ (dữ liệu từ ngoài vào)
 *   badges(state, bots)      → huy hiệu đã có: ['tier1', …, 'boat']
 * state: { r: { vn: số bậc đã qua, free, std, renju }, at: lúc đổi gần nhất }
 */
(function (global) {
  'use strict';
  const RULES = ['vn', 'free', 'std', 'renju'];
  const STYLE_ORDER = ['trap', 'dbl', 'def', 'atk', 'uni'];
  const MAX_RUNG = 64;

  function order(bots) {
    return bots.slice().sort((a, b) => a.tier - b.tier || STYLE_ORDER.indexOf(a.style) - STYLE_ORDER.indexOf(b.style)).map((b) => b.id);
  }

  const int = (v) => Math.max(0, Math.min(MAX_RUNG, Math.floor(Number(v)) || 0));

  function clean(x) {
    const r = {};
    const src = (x && typeof x === 'object' && x.r && typeof x.r === 'object') ? x.r : {};
    for (const k of RULES) if (int(src[k])) r[k] = int(src[k]);
    const at = Number(x && x.at);
    return { r, at: Number.isFinite(at) && at > 0 ? Math.floor(at) : 0 };
  }

  function win(state, id, rule, ids, now) {
    const s = clean(state);
    const i = ids.indexOf(id);
    const k = RULES.includes(rule) ? rule : 'vn';
    if (i < 0 || (s.r[k] || 0) >= i + 1) return s;
    s.r[k] = i + 1;
    s.at = now || Date.now();
    return s;
  }

  function merge(a, b) {
    const x = clean(a), y = clean(b);
    const r = {};
    for (const k of RULES) { const v = Math.max(x.r[k] || 0, y.r[k] || 0); if (v) r[k] = v; }
    return { r, at: Math.max(x.at, y.at) };
  }

  /** Huy hiệu: hết mức t ở bất kỳ luật nào ('tier<t>'), hạ trùm cuối ('boat'). */
  function badges(state, bots) {
    const ids = order(bots);
    const best = Math.max(0, ...Object.values(clean(state).r));
    const out = [];
    const tiers = [...new Set(bots.map((b) => b.tier))].sort((a, b) => a - b);
    for (const t of tiers) {
      const last = Math.max(...ids.map((id, i) => (bots.find((b) => b.id === id).tier === t ? i : -1)));
      if (best >= last + 1) out.push(bots.find((b) => b.tier === t && b.boss) ? 'boat' : 'tier' + t);
    }
    return out;
  }

  const CaroLadderCore = { RULES, STYLE_ORDER, order, win, merge, clean, badges };
  if (typeof module !== 'undefined' && module.exports) module.exports = CaroLadderCore;
  else global.CaroLadderCore = CaroLadderCore;
})(typeof window !== 'undefined' ? window : globalThis);
