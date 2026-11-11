/*
 * Giải đấu Offline – xếp hạt giống tự động trước khi bắt đầu (dùng chung trình duyệt và bài thử Node):
 *   byRating(text, players)  – mỗi dòng "Tên đội: điểm" (điểm xếp hạng / Elo / điểm bảng xếp hạng thế giới); điểm cao xếp trên,
 *                              đội không có điểm xếp sau theo thứ tự cũ.
 *   byBallots(text, players) – phiếu bầu của các đội (kiểu "Elo cộng đồng" IEM Katowice 2019: mỗi đội xếp hạng các đội còn
 *                              lại): mỗi dòng "Đội bầu: Đội A > Đội B > Đội C…" (dấu > , ; hoặc xuống dòng trong một phiếu đều
 *                              được). Mỗi phiếu cho các cặp so sánh "A trên B"; độ mạnh mỗi đội tính theo mô hình Bradley–Terry
 *                              (cùng gốc với Elo) bằng phép lặp MM; bằng nhau thì theo điểm Borda, rồi thứ tự cũ. Đội tự bầu cho
 *                              mình bị bỏ qua.
 * Trả { order: [uid…], unknown: [tên không khớp đội nào], used: số dòng dùng được }.
 */
(function (global) {
  'use strict';
  const MAX_LINES = 600;
  const ITER = 200;
  const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

  function index(players) {
    const m = new Map();
    for (const p of players) m.set(norm(p.name), p.uid);
    return m;
  }
  const lines = (text) => String(text || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean).slice(0, MAX_LINES);
  /** Thứ tự cuối: theo điểm giảm dần (null = không có điểm – xếp sau), rồi thứ tự cũ. */
  const sortBy = (players, score) => players.map((p, k) => ({ u: p.uid, k, s: score.get(p.uid) }))
    .sort((a, b) => (b.s != null) - (a.s != null) || (b.s || 0) - (a.s || 0) || a.k - b.k).map((x) => x.u);

  function byRating(text, players) {
    const idx = index(players), score = new Map(), unknown = [];
    let used = 0;
    for (const ln of lines(text)) {
      const m = /^(.*?)[\s:：;|=,，]+(-?\d+(?:[.,]\d+)?)\s*$/.exec(ln); // dấu hai chấm thường / toàn khổ
      if (!m) continue;
      const uid = idx.get(norm(m[1]));
      if (!uid) { unknown.push(m[1].trim()); continue; }
      score.set(uid, Number(m[2].replace(',', '.')));
      used++;
    }
    return { order: sortBy(players, score), unknown, used };
  }

  function byBallots(text, players) {
    const idx = index(players), unknown = [];
    const n = players.length, at = new Map(players.map((p, k) => [p.uid, k]));
    const wins = Array.from({ length: n }, () => new Array(n).fill(0)); // wins[i][j]: số lần i được xếp trên j
    const borda = new Map();
    let used = 0;
    for (const ln of lines(text)) {
      const colon = ln.search(/[:：]/); // dấu hai chấm thường / toàn khổ (tiếng Trung)
      const voter = colon > 0 ? idx.get(norm(ln.slice(0, colon))) : null;
      const names = (colon > 0 ? ln.slice(colon + 1) : ln).split(/[>,;＞，；]+/).map((x) => x.trim()).filter(Boolean);
      const list = [];
      for (const nm of names) {
        const uid = idx.get(norm(nm));
        if (!uid) { unknown.push(nm); continue; }
        if (uid !== voter && !list.includes(uid)) list.push(uid);
      }
      if (list.length < 2) continue;
      used++;
      list.forEach((u, k) => {
        borda.set(u, (borda.get(u) || 0) + (list.length - 1 - k));
        for (let j = k + 1; j < list.length; j++) wins[at.get(u)][at.get(list[j])]++;
      });
    }
    // Bradley–Terry (phép lặp MM của Hunter 2004): p_i = W_i / Σ_j n_ij / (p_i + p_j); thêm một nửa trận "ảo" với mỗi đội để
    // đội thắng / thua hết vẫn có số hữu hạn
    let p = new Array(n).fill(1);
    for (let it = 0; it < ITER; it++) {
      const q = p.map((pi, i) => {
        let W = 0.5, D = 0;
        for (let j = 0; j < n; j++) {
          if (i === j) continue;
          const nij = wins[i][j] + wins[j][i] + 1; // + 1 trận ảo (nửa thắng nửa thua)
          W += wins[i][j];
          D += nij / (pi + p[j]);
        }
        return D > 0 ? W / D : pi;
      });
      const s = q.reduce((a, b) => a + b, 0) / n;
      p = q.map((x) => x / s);
    }
    const score = new Map(players.map((pl, k) => [pl.uid, used ? Math.round(p[k] * 1e6) / 1e6 + (borda.get(pl.uid) || 0) * 1e-9 : null]));
    return { order: sortBy(players, score), unknown, used, strength: Object.fromEntries(players.map((pl, k) => [pl.uid, p[k]])) };
  }

  const api = { byRating, byBallots };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.CaroOTourSeedRank = api;
})(typeof window !== 'undefined' ? window : globalThis);
