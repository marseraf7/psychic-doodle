/*
 * Giải đấu Offline – hình minh hoạ thể thức cho thư viện mẫu giải (otour-tpl-lib.js) và thẻ chọn thể thức ở form tạo giải
 * (otour-new-ui.js). Dùng chung trình duyệt + Node (kiểm thử: server/test/otour-tpl-art.test.js), không đụng DOM.
 * Hình là SVG tự vẽ từ chính tham số của mẫu (số đội, số bảng, số đội đi tiếp, luật thắng / thua Thụy Sĩ, bảng điểm đua…)
 * nên khớp với giải sẽ được tạo – không dùng ảnh, tên, logo hay dữ liệu của giải thật. Chữ trong hình chỉ là con số.
 *   category(tpl)          – nhóm của mẫu: football | esports | br (sinh tồn) | sports | race | mind
 *   flow(tpl)              – số đội vào / đi tiếp từng giai đoạn (0 = không suy ra chắc chắn được thì không ghi)
 *   stageSvg(c, n, label)  – SVG một giai đoạn (vòng tròn / bảng, loại trực tiếp, nhánh thắng – thua, Thụy Sĩ, đua tính điểm…)
 *   links(stages, lang)    – bài giải thích trung lập về kiểu thể thức (Wikipedia đúng ngôn ngữ, không có thì tiếng Anh)
 *   kind(c)                – kiểu hình của một giai đoạn (rr | single | double | swiss | race | ladder)
 */
(function (global) {
  'use strict';
  const CATS = ['football', 'esports', 'br', 'sports', 'race', 'mind'];
  const MIND = ['chess', 'bridge', 'tcg', 'poker'];

  /** Nhóm của mẫu (để xếp danh sách theo mục). */
  function category(tpl) {
    const st = tpl.stages || [];
    const race = st.length > 0 && st.every((c) => c.type === 'race');
    if (tpl.sport === 'football') return 'football';
    if (tpl.sport === 'esports') return race || /^pg[cs]/.test(tpl.id) ? 'br' : 'esports'; // đấu nhiều đội một trận (sinh tồn, cờ nhân phẩm…)
    if (MIND.includes(tpl.sport) || tpl.id === 'scrabble_koth' || tpl.id === 'bridge_teams') return 'mind';
    if (race) return 'race';
    return 'sports';
  }

  /** Số bảng của giai đoạn vòng tròn / đua khi có cur đội vào. */
  const groupsOf = (c, cur) => {
    if (c.type === 'race') return c.groups || 1;
    if (c.type !== 'roundrobin' || c.league) return 1;
    if (c.groups) return c.groups;
    return c.groupSize && cur ? Math.max(1, Math.ceil(cur / c.groupSize)) : 1;
  };

  /** Số đội đi tiếp sau giai đoạn (0 = không chắc). */
  function advanceOf(c, cur) {
    if (!cur) return 0;
    if (c.type === 'race') {
      if (c.routes || c.skip || c.weekly || c.gate || c.advance == null) return 0; // dải hạng đi nhiều nơi: không ghi số
      return c.advance * groupsOf(c, cur);
    }
    if (c.type === 'roundrobin') {
      if (c.advance == null) return 0;
      const G = groupsOf(c, cur);
      return Math.min(cur, (G > 1 ? c.advance * G : c.advance) + (c.bestNext || 0));
    }
    if (c.type === 'swiss') {
      if (c.advance) return c.advance;
      return c.record && c.record.win === c.record.lose && cur % 2 === 0 ? cur / 2 : 0; // thắng N / thua N: đúng một nửa đi tiếp
    }
    return c.advance || 0; // nhánh đấu chỉ lấy vài đội (Play-In)
  }

  /** Số đội vào và đi tiếp từng giai đoạn theo số đội gợi ý của mẫu (đội vào thẳng giai đoạn sau: c.direct). */
  function flow(tpl) {
    const st = tpl.stages || [];
    const direct = st.map((c, i) => (i ? c.direct || 0 : 0));
    const first = (tpl.n || 0) - direct.reduce((a, b) => a + b, 0);
    let cur = first >= 2 ? first : tpl.n || 0;
    return st.map((c, i) => {
      const last = i === st.length - 1;
      const out = last ? 0 : advanceOf(c, cur);
      const row = { n: cur, groups: groupsOf(c, cur), out, direct: direct[i] };
      cur = out ? out + (direct[i + 1] || 0) : 0;
      return row;
    });
  }

  /** Kiểu hình của một giai đoạn. */
  function kind(c) {
    if (c.type === 'roundrobin') return 'rr';
    if (c.type === 'swiss') return 'swiss';
    if (c.type === 'race') return 'race';
    if (c.type === 'double' || c.type === 'gsl' || c.type === 'pools') return 'double';
    if (c.type === 'graph' && /gauntlet|page/.test(c.shape || '')) return 'ladder';
    return 'single';
  }

  // ------------------------------------------------------------ Vẽ (các lớp a-* tô màu bằng CSS: sáng / tối)
  const W = 168, H = 104;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const r = (x, y, w, h, cls) => `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="2" class="${esc(cls)}"/>`;
  const l = (x1, y1, x2, y2) => `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)}H${x2.toFixed(1)}" class="a-ln"/>`;
  const txt = (x, y, s, cls = 'a-tx') => `<text x="${x}" y="${y}" class="${esc(cls)}">${s}</text>`;
  const wrap = (body, label) => `<svg class="tpl-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label || '')}" preserveAspectRatio="xMidYMid meet">${body}</svg>`;

  /** Bảng xếp hạng: tối đa 4 bảng hiện ra, mỗi bảng tối đa 8 dòng; dòng đi tiếp tô màu nhấn. */
  function drawTables(c, f) {
    const G = Math.max(1, f.groups || 1);
    const per = Math.max(2, Math.ceil((f.n || 8) / G));
    const show = Math.min(G, 4);
    const cols = show === 1 ? 1 : 2, rowsG = Math.ceil(show / cols);
    const rows = Math.min(per, show === 1 ? 10 : 6);
    // Dòng đi tiếp: bảng dài hơn số dòng vẽ thì tô theo tỉ lệ (36 đội, 24 đi tiếp → 2/3 số dòng)
    const adv = c.advance != null ? (per > rows ? Math.round((rows * Math.min(c.advance, per)) / per) : Math.min(c.advance, rows)) : 0;
    const gw = (W - 12 - (cols - 1) * 8) / cols, gh = (H - 12 - (rowsG - 1) * 8) / rowsG;
    let s = '';
    for (let g = 0; g < show; g++) {
      const x0 = 6 + (g % cols) * (gw + 8), y0 = 6 + Math.floor(g / cols) * (gh + 8);
      s += r(x0, y0, gw, gh, 'a-box');
      const rh = (gh - 4) / rows;
      for (let i = 0; i < rows; i++) {
        s += r(x0 + 3, y0 + 2 + i * rh + 0.6, 8, Math.max(1, rh - 1.2), i < adv ? 'a-on' : 'a-seed');
        s += r(x0 + 14, y0 + 2 + i * rh + rh / 2 - 0.8, gw - 30 - (i * 7) % 12, 1.6, i < adv ? 'a-on' : 'a-bar');
      }
    }
    if (G > show) s += txt(W - 6, H - 3, '×' + G, 'a-tx a-end');
    if (per > rows) s += txt(W - 6, 12, '…', 'a-tx a-end');
    return s;
  }

  /** Nhánh loại trực tiếp từ x0 tới x1, leaves đội ở cột đầu, trả { s, y } (y: chỗ của người thắng). */
  function bracket(x0, x1, y0, y1, leaves) {
    const rounds = Math.max(1, Math.round(Math.log2(leaves)));
    const dx = (x1 - x0) / (rounds + 0.6);
    let ys = Array.from({ length: leaves }, (_, i) => y0 + ((i + 0.5) * (y1 - y0)) / leaves);
    let s = '';
    for (let k = 0; k < rounds; k++) {
      const x = x0 + k * dx, nx = [];
      for (let i = 0; i < ys.length; i += 2) {
        const a = ys[i], b = ys[i + 1];
        s += l(x, a, x + dx * 0.7) + l(x, b, x + dx * 0.7) + `<path d="M${(x + dx * 0.7).toFixed(1)} ${a.toFixed(1)}V${b.toFixed(1)}" class="a-ln"/>`;
        nx.push((a + b) / 2);
        if (k === 0) s += r(x - 4, a - 1.5, 4, 3, 'a-seed') + r(x - 4, b - 1.5, 4, 3, 'a-seed');
      }
      ys = nx;
    }
    const y = ys[0];
    s += l(x0 + rounds * dx - dx * 0.3, y, x1);
    return { s, y };
  }
  const pow2 = (n) => { let p = 2; while (p < n && p < 16) p *= 2; return p; };

  function drawSingle(c, f) {
    const leaves = pow2(Math.max(2, c.advance ? Math.min(f.n || 8, 16) : f.n || 8));
    const b = bracket(10, W - 16, 6, H - 6, leaves);
    return b.s + `<circle cx="${W - 10}" cy="${b.y.toFixed(1)}" r="4" class="a-on"/>`;
  }
  function drawDouble(c, f) {
    const leaves = Math.min(8, pow2(Math.max(4, f.n || 8)));
    const up = bracket(10, W - 40, 4, H * 0.58, leaves);
    const lo = bracket(26, W - 40, H * 0.64, H - 4, Math.max(2, leaves / 2));
    const gx = W - 40, gy = (up.y + lo.y) / 2;
    return `${up.s}${lo.s}<path d="M${gx} ${up.y.toFixed(1)}V${lo.y.toFixed(1)}M${gx} ${gy.toFixed(1)}H${W - 16}" class="a-ln"/>`
      + r(18, H * 0.64 - 1, W - 64, 0.8, 'a-out') + `<circle cx="${W - 10}" cy="${gy.toFixed(1)}" r="4" class="a-on"/>`;
  }
  /** Thụy Sĩ: theo thắng – thua (ô bản ghi, xanh đi tiếp / đỏ bị loại) hoặc số vòng (các cột cặp đấu). */
  function drawSwiss(c, f) {
    const rec = c.record;
    if (rec && rec.win && rec.lose) {
      const Wn = Math.min(rec.win, 4), Ln = Math.min(rec.lose, 4), R = Wn + Ln - 1;
      const dx = (W - 20) / R;
      let s = '';
      for (let k = 0; k < R; k++) {
        const cells = [];
        for (let w = 0; w <= k; w++) { const lo = k - w; if (w < Wn && lo < Ln) cells.push([w, lo]); }
        const ch = Math.min(16, (H - 10) / Math.max(cells.length, 1) - 3);
        cells.forEach(([w, lo], i) => {
          const y = H / 2 + (i - (cells.length - 1) / 2) * (ch + 3) - ch / 2;
          s += r(6 + k * dx, y, dx - 6, ch, 'a-box') + txt(6 + k * dx + (dx - 6) / 2, y + ch / 2 + 3, `${w}-${lo}`, 'a-tx a-mid');
        });
      }
      return s + r(W - 12, 6, 6, H / 2 - 9, 'a-on') + r(W - 12, H / 2 + 3, 6, H / 2 - 9, 'a-out');
    }
    const R = Math.min(c.rounds || Math.max(3, Math.ceil(Math.log2(f.n || 8))), 7);
    const dx = (W - 12) / R, pairs = 4;
    let s = '';
    for (let k = 0; k < R; k++) {
      for (let i = 0; i < pairs; i++) {
        const y = 8 + i * ((H - 16) / pairs);
        s += r(6 + k * dx, y, dx - 6, (H - 16) / pairs - 5, 'a-box') + r(6 + k * dx + 2, y + 2, (dx - 10) * (((i + k) % 3) + 1) / 3, 2.4, 'a-on');
      }
    }
    return s;
  }
  /** Đua tính điểm: cột điểm theo hạng (bảng điểm của mẫu), số chặng ghi ở góc. */
  function drawRace(c) {
    const tb = (c.table && c.table.length ? c.table : c.score === 'time' ? [10, 9, 8, 7, 6, 5, 4, 3] : [25, 18, 15, 12, 10, 8, 6, 4]).slice(0, 10);
    const max = Math.max(...tb, 1), bw = (W - 20) / tb.length;
    let s = '';
    tb.forEach((v, i) => {
      const h = Math.max(3, ((H - 26) * v) / max);
      s += r(8 + i * bw, H - 8 - h, bw - 3, h, i < 3 ? 'a-on' : 'a-bar');
    });
    s += `<path d="M6 ${H - 7}H${W - 6}" class="a-ln"/>`;
    if (c.events) s += txt(W - 6, 12, '×' + c.events, 'a-tx a-end');
    return s;
  }
  /** Thang leo bậc / Page playoff: đội hạng thấp leo dần lên gặp đội hạng cao. */
  function drawLadder(c) {
    const steps = Math.max(2, Math.min(5, (c.ladder && c.ladder.length) || 4));
    const sw = (W - 24) / steps, sh = (H - 16) / steps;
    let s = '';
    for (let i = 0; i < steps; i++) {
      const x = 8 + i * sw, y = H - 8 - (i + 1) * sh;
      s += r(x, y, sw - 4, sh - 3, i === steps - 1 ? 'a-on' : 'a-box') + r(x + 3, y + sh / 2 - 2.5, 4, 3, 'a-seed');
    }
    return s;
  }

  /** SVG một giai đoạn; f = { n, groups } (flow() hoặc tự đặt). */
  function stageSvg(c, f, label) {
    f = f || { n: 8, groups: 1 };
    const k = kind(c);
    const body = k === 'rr' ? drawTables(c, f) : k === 'double' ? drawDouble(c, f) : k === 'swiss' ? drawSwiss(c, f) : k === 'race' ? drawRace(c) : k === 'ladder' ? drawLadder(c) : drawSingle(c, f);
    return wrap(body, label);
  }

  // ------------------------------------------------------------ Bài giải thích thể thức (Wikipedia, mở tab mới)
  const WIKI = {
    rr: { en: 'Round-robin_tournament', vi: 'Thi_đấu_vòng_tròn', ru: 'Круговая_система', zh: '循环赛' },
    single: { en: 'Single-elimination_tournament', ru: 'Олимпийская_система', zh: '单败淘汰制' },
    double: { en: 'Double-elimination_tournament', zh: '双败淘汰制' },
    swiss: { en: 'Swiss-system_tournament', vi: 'Thi_đấu_hệ_Thụy_Sĩ', ru: 'Швейцарская_система', zh: '瑞士制' },
    page: { en: 'Page_playoff_system', zh: '佩奇制' },
  };
  const wikiKey = (c) => {
    const k = kind(c);
    if (k === 'race') return null; // đua tính điểm: không có bài chung đủ trung lập
    if (c.type === 'graph' && c.shape === 'page') return 'page';
    return k === 'ladder' ? 'single' : k;
  };
  /** [{ key, lang, url }] – mỗi kiểu thể thức một link, theo thứ tự giai đoạn. */
  function links(stages, lang) {
    const seen = new Set(), out = [];
    for (const c of stages || []) {
      const key = wikiKey(c);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const t = WIKI[key], l2 = t[lang] ? lang : 'en';
      out.push({ key, lang: l2, url: `https://${l2}.wikipedia.org/wiki/${encodeURIComponent(t[l2])}` });
    }
    return out;
  }

  const api = { CATS, category, flow, kind, stageSvg, links, advanceOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.CaroOTourTplArt = api;
})(typeof window !== 'undefined' ? window : globalThis);
