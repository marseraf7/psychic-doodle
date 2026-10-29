/*
 * Giải đấu – trình sửa các giai đoạn khi tạo giải (dùng ở form nhanh và trang Cài đặt nâng cao).
 * Form nhanh: thể thức, Bo, tranh hạng ba / reset chung kết, chia bảng, số vòng, điểm, số người đi tiếp.
 * Trang nâng cao (adv) thêm các tuỳ chọn như Challonge: trận xếp hạng mọi vị trí, chung kết tổng 2 trận / 1 trận /
 * không có, split, Bo riêng bán kết / chung kết, gặp nhau 3 lượt, xếp hạng theo (rankBy), điểm ván thắng / hoà / miễn
 * đấu, tie-break 4 cấp, Thụy Sĩ 0 vòng = tự động.
 *   K.stageEdit = { DEFAULT, MAX, html(stages, adv), change(stages, el), click(stages, btn) } – change / click sửa
 *   mảng stages tại chỗ, trả true nếu có đổi. Nạp sau tour.js, tour-stages.js; trước tour-form.js.
 */
(function () {
  'use strict';
  const K = window.CaroTourKit;
  if (!K) return;
  const { T, esc, icon } = K;
  const { stageName, advText } = K;

  const PT = { w: 3, d: 1, l: 0 };
  const DEFAULT = {
    single: () => ({ type: 'single', bestOf: 3, thirdPlace: true }),
    double: () => ({ type: 'double', bestOf: 3, reset: true, gf: '2' }),
    roundrobin: () => ({ type: 'roundrobin', bestOf: 1, groups: 1, meetings: 1, points: { ...PT }, advance: 2 }),
    swiss: () => ({ type: 'swiss', bestOf: 1, rounds: 5, points: { w: 2, d: 1, l: 0 }, advance: 4 }),
  };
  const MAX = 3;
  const RANK_BY = ['points', 'match_wins', 'game_wins', 'game_pct', 'game_diff'];
  const TIEBREAKS = ['h2h', 'bh', 'mbh', 'sb', 'wins', 'gdiff', 'gwins', 'gpct'];
  // Như máy chủ (stages-tiebreak.js) khi chưa chọn
  const DEFAULT_TB = { roundrobin: ['h2h', 'gdiff', 'gwins'], swiss: ['bh', 'sb', 'wins'] };
  const tbsOf = (c) => (Array.isArray(c.tiebreaks) ? c.tiebreaks : DEFAULT_TB[c.type] || []);
  const gfOf = (c) => c.gf || (c.reset === false ? '1' : '2');
  // Ô chọn có giá trị chữ (còn lại là số)
  const STRING_KEYS = ['rankBy', 'gf', 'tb0', 'tb1', 'tb2', 'tb3', 'gmode', 'type'];

  function html(stages, adv) {
    const st = stages || [];
    const num = (i, k, v, min, max) => `<input type="number" data-i="${i}" data-k="${k}" value="${v}" min="${min}" max="${max}">`;
    const sel = (i, k, items, v) => `<select data-i="${i}" data-k="${k}">${items.map(([x, l]) => `<option value="${x}" ${String(x) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    const chk = (i, k, v, label) => `<label class="check"><input type="checkbox" data-i="${i}" data-k="${k}" ${v ? 'checked' : ''}> <span>${esc(label)}</span></label>`;
    const field = (label, inner) => `<label class="field inline"><span>${esc(label)}</span>${inner}</label>`;
    const boSel = (i, k, v) => sel(i, k, [[0, T('bo_same')], [1, 'Bo1'], [3, 'Bo3'], [5, 'Bo5']], v || 0);
    const cards = st.map((c, i) => {
      const last = i === st.length - 1;
      const types = (last ? ['single', 'double', 'roundrobin', 'swiss'] : ['roundrobin', 'swiss']).map((x) => [x, T('fmt_' + x)]);
      const f = [field(T('format'), sel(i, 'type', types, c.type)), field(T('format_bo'), sel(i, 'bestOf', [[1, 'Bo1'], [3, 'Bo3'], [5, 'Bo5']], c.bestOf))];
      const more = []; // tuỳ chọn nâng cao (chỉ ở trang nâng cao)
      if (c.type === 'single') {
        f.push(chk(i, 'thirdPlace', c.thirdPlace || c.placement, T('third_place_opt')));
        if (adv) more.push(chk(i, 'placement', c.placement, T('opt_placement')));
      }
      if (c.type === 'double') {
        if (adv) {
          more.push(field(T('opt_gf'), sel(i, 'gf', [['2', T('gf_2')], ['1', T('gf_1')], ['none', T('gf_none')]], gfOf(c))));
          more.push(chk(i, 'split', c.split, T('opt_split')));
        } else f.push(chk(i, 'reset', gfOf(c) === '2', T('opt_reset')));
      }
      if (adv && (c.type === 'single' || c.type === 'double')) {
        more.push(field(T('opt_bo_semi'), boSel(i, 'boSemi', c.boSemi)), field(T('opt_bo_final'), boSel(i, 'boFinal', c.boFinal)));
      }
      if (c.type === 'roundrobin') {
        // Chia theo số bảng, hoặc theo số người mỗi bảng (như Challonge)
        const bySize = c.groupSize != null;
        f.push(field(T('gmode'), sel(i, 'gmode', [['count', T('gmode_count')], ['size', T('gmode_size')]], bySize ? 'size' : 'count')));
        f.push(bySize ? field(T('gmode_size'), num(i, 'groupSize', c.groupSize, 2, 16)) : field(T('opt_groups'), num(i, 'groups', c.groups, 1, 64)));
        f.push(field(T('opt_meetings'), sel(i, 'meetings', [[1, T('meet_1')], [2, T('meet_2')], ...(adv ? [[3, T('meet_3')]] : [])], c.meetings)));
        if (adv) more.push(field(T('opt_rankby'), sel(i, 'rankBy', RANK_BY.map((x) => [x, T('rank_' + x)]), c.rankBy || 'points')));
      }
      // 0 = tự động (⌈log₂ n⌉) – cả hai form cùng một ô để không hiện số khác với số sẽ gửi
      if (c.type === 'swiss') f.push(field(T('opt_rounds_auto'), num(i, 'rounds', c.rounds, 0, 15)));
      if (c.points) {
        f.push(`<div class="field inline"><span>${esc(T('opt_points'))}</span><span class="pts3">${num(i, 'pw', c.points.w, 0, 10)}${num(i, 'pd', c.points.d, 0, 10)}${num(i, 'pl', c.points.l, 0, 10)}</span></div>`);
        if (adv) {
          more.push(`<div class="field inline"><span>${esc(T('opt_pts_game'))}</span><span class="pts3">${num(i, 'pgw', c.points.gw || 0, 0, 10)}${num(i, 'pgt', c.points.gt || 0, 0, 10)}</span></div>`);
          if (c.type === 'swiss') more.push(field(T('opt_pts_bye'), num(i, 'pbye', c.points.bye != null ? c.points.bye : c.points.w, 0, 10)));
          const tbs = tbsOf(c);
          const opts = [['', T('tb_none')], ...TIEBREAKS.map((x) => [x, T('tb_' + x)])];
          more.push(`<div class="field tb-row"><span>${esc(T('opt_tiebreaks'))}</span><span class="tb4">${[0, 1, 2, 3].map((n) => sel(i, 'tb' + n, opts, tbs[n] || '')).join('')}</span></div>`);
        }
      }
      if (!last) f.push(field(T(c.type === 'roundrobin' ? 'adv_per_group' : 'adv_total'), num(i, 'advance', c.advance, 1, 32)));
      const del = st.length > 1 ? `<button type="button" class="ghost sm icon" data-sact="del" data-i="${i}" title="${esc(T('stage_remove'))}" aria-label="${esc(T('stage_remove'))}">${icon('close')}</button>` : '';
      const extra = more.length ? `<div class="sc-more"><b>${esc(T('stage_more'))}</b><div class="sc-body">${more.join('')}</div></div>` : '';
      return `<div class="stage-card"><div class="sc-head"><b>${esc(T('stage_n', { n: i + 1 }))}</b>${last && st.length > 1 ? ` <span class="muted">${esc(T('stage_final'))}</span>` : ''}${del}</div><div class="sc-body">${f.join('')}</div>${extra}</div>`;
    });
    const arrows = [];
    st.forEach((c, i) => { arrows.push(stageName(c)); if (i < st.length - 1) arrows.push(advText(c)); });
    return `<p class="flow">${arrows.map((x, i) => (i % 2 ? `<span class="muted">→ ${esc(x)} →</span>` : `<b>${esc(x)}</b>`)).join(' ')}</p>
      ${cards.join('<div class="sc-arrow">↓</div>')}
      ${st.length < MAX ? `<button type="button" class="ghost sm" data-sact="add">${icon('plus')}${esc(T('stage_add'))}</button>` : ''}`;
  }

  /** Sửa một ô của giai đoạn. Trả true nếu đã đổi. */
  function change(stages, el) {
    const i = Number(el.dataset.i), k = el.dataset.k;
    const c = stages && stages[i];
    if (!c || !k) return false;
    const v = STRING_KEYS.includes(k) ? el.value : Number(el.value);
    const clamp = (n) => Math.max(Number(el.min), Math.min(Number(el.max), Math.floor(n) || 0));
    if (k === 'type') {
      const nc = DEFAULT[v]();
      nc.bestOf = c.bestOf;
      if (i === stages.length - 1) delete nc.advance; // giai đoạn cuối không có "đi tiếp"
      stages[i] = nc;
    } else if (k === 'gmode') {
      if (v === 'size') { delete c.groups; c.groupSize = 4; } else { delete c.groupSize; c.groups = 2; }
    } else if (k === 'reset') { c.gf = el.checked ? '2' : '1'; c.reset = el.checked; }
    else if (k === 'gf') { c.gf = v; c.reset = v === '2'; }
    else if (k === 'placement') { c.placement = el.checked; if (el.checked) c.thirdPlace = true; }
    else if (k === 'thirdPlace') { c.thirdPlace = el.checked; if (!el.checked) c.placement = false; }
    else if (el.type === 'checkbox') c[k] = el.checked;
    else if (/^tb\d$/.test(k)) {
      const tbs = [...tbsOf(c)];
      tbs[Number(k[2])] = v;
      c.tiebreaks = tbs.filter((x, j) => x && tbs.indexOf(x) === j).slice(0, 4); // bỏ ô trống và trùng
    } else if (k[0] === 'p' && ['pw', 'pd', 'pl', 'pgw', 'pgt', 'pbye'].includes(k)) c.points[k.slice(1)] = clamp(v);
    else if (el.tagName === 'SELECT') c[k] = v;
    else if (Number.isFinite(v)) c[k] = clamp(v);
    return true;
  }

  /** Nút thêm / bỏ giai đoạn. Trả true nếu đã đổi. */
  function click(stages, b) {
    if (b.dataset.sact === 'add' && stages.length < MAX) stages.unshift(DEFAULT.roundrobin());
    else if (b.dataset.sact === 'del' && stages.length > 1) {
      stages.splice(Number(b.dataset.i), 1);
      const last = stages[stages.length - 1];
      if (last) delete last.advance; // giai đoạn cuối không có "đi tiếp"
    } else return false;
    // Giai đoạn đứng trước phải là vòng tròn / Thụy Sĩ và có số người đi tiếp
    stages.forEach((c, i) => {
      if (i < stages.length - 1 && !c.points) stages[i] = DEFAULT.roundrobin();
      else if (i < stages.length - 1 && !c.advance) c.advance = DEFAULT[c.type]().advance;
    });
    return true;
  }

  K.stageEdit = { DEFAULT, MAX, html, change, click, tbsOf, gfOf };
})();
