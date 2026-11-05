/*
 * Giải đấu – trình sửa các giai đoạn khi tạo giải (dùng ở form nhanh và trang Cài đặt nâng cao).
 * Form nhanh: thể thức, Bo, tranh hạng ba / reset chung kết, chia bảng, số vòng, điểm, số người đi tiếp.
 * Trang nâng cao (adv) thêm các tuỳ chọn như Challonge: trận xếp hạng (chọn từng cặp hạng 3–4, 5–6, 7–8…), chung kết
 * tổng 2 trận / 1 trận / không có, split, Bo riêng bán kết / chung kết (Bo1–7 hoặc tự nhập số lẻ tới 15), gặp nhau
 * 3 lượt, xếp hạng theo (rankBy), điểm ván thắng / hoà / miễn đấu, tie-break 5 cấp (theo quy chế FIDE – kèm giải thích),
 * Thụy Sĩ: 0 vòng = tự động, cách xếp cặp (Hà Lan / liền kề), cách tính trận không đấu (FIDE / như bản cũ).
 *   K.stageEdit = { DEFAULT, MAX, html(stages, adv, ctx), change(stages, el), click(stages, btn) } – change / click sửa
 *   mảng stages tại chỗ, trả true nếu có đổi; ctx.max: số người tối đa (số cặp hạng chọn được); ctx.ext: hiện ô điểm
 *   thắng / thua "sát" (giải offline – set quyết định, hiệp phụ); ctx.result: kiểu kết quả giải offline (2 lượt chỉ với
 *   'score') và các thể thức thêm của giải offline (stages-league.js ở
 *   máy chủ): league phase, đội xếp sau tốt nhất, Thụy Sĩ theo số thắng / thua, knock-out 2 lượt, bảng tới 64 đội.
 *   Nạp sau tour.js, tour-stages.js; trước tour-form.js.
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
    // Hệ Race (chỉ giải offline – ctx.ext): chặng đua cả đoàn, điểm theo hạng (bảng F1) hoặc thời gian
    race: () => ({ type: 'race', bestOf: 1, events: 1, score: 'points', table: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1], advance: 8 }),
  };
  const MAX = 3;
  const RANK_BY = ['points', 'match_wins', 'game_wins', 'game_pct', 'game_diff'];
  // Như máy chủ (stages-tiebreak.js): thứ tự trong ô chọn
  const TIEBREAKS = ['h2h', 'bh', 'bh1', 'bh2', 'mbh', 'mbh2', 'fb', 'aob', 'sb', 'koya', 'ps', 'wins', 'won', 'bpg', 'aro', 'aroc1', 'tpr', 'apro',
    'gdiff', 'gwins', 'gpct', 'pdiff', 'ppct'];
  const MAX_TB = 5;
  const BO_OPTS = [1, 3, 5, 7];
  const MAX_BO = 25; // như máy chủ (stages.js)
  const PLACE_CHIPS = 64; // chọn từng cặp hạng tới hạng 64; sau đó một ô "tất cả các hạng sau"
  const pow2 = (n) => { let s = 2; while (s < n) s *= 2; return s; };
  /** Các cặp hạng đang chọn (số lẻ 3, 5, 7…) – giải cũ: mọi vị trí (placement) / chỉ hạng ba (thirdPlace). */
  const placesOf = (c, size) => (Array.isArray(c.places) ? c.places
    : c.placement ? Array.from({ length: Math.max(0, size / 2 - 1) }, (_, i) => 3 + 2 * i) : c.thirdPlace !== false ? [3] : []);
  // Như máy chủ (stages-tiebreak.js) khi chưa chọn
  const DEFAULT_TB = { roundrobin: ['h2h', 'gdiff', 'gwins'], swiss: ['bh', 'sb', 'wins'] };
  const tbsOf = (c) => (Array.isArray(c.tiebreaks) ? c.tiebreaks : DEFAULT_TB[c.type] || []);
  const gfOf = (c) => c.gf || (c.reset === false ? '1' : '2');
  // Ô chọn có giá trị chữ (còn lại là số)
  const STRING_KEYS = ['rankBy', 'gf', 'tb0', 'tb1', 'tb2', 'tb3', 'tb4', 'gmode', 'type', 'pairing', 'unplayed', 'score', 'table'];

  function html(stages, adv, ctx = {}) {
    const st = stages || [];
    const num = (i, k, v, min, max) => `<input type="number" data-i="${i}" data-k="${k}" value="${v}" min="${min}" max="${max}">`;
    const sel = (i, k, items, v) => `<select data-i="${i}" data-k="${k}">${items.map(([x, l]) => `<option value="${x}" ${String(x) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    const chk = (i, k, v, label) => `<label class="check"><input type="checkbox" data-i="${i}" data-k="${k}" ${v ? 'checked' : ''}> <span>${esc(label)}</span></label>`;
    const field = (label, inner) => `<label class="field inline"><span>${esc(label)}</span>${inner}</label>`;
    // Bo của cả giai đoạn: Bo1–7 hoặc tự nhập số lẻ bất kỳ tới MAX_BO
    const boPick = (i, k, v) => {
      const custom = !BO_OPTS.includes(Number(v));
      return sel(i, k, [...BO_OPTS.map((n) => [n, 'Bo' + n]), ['c', T('bo_custom')]], custom ? 'c' : v)
        + (custom ? `<span class="bo-n">Bo${num(i, k + 'N', v, 1, MAX_BO)}</span>` : '');
    };
    // Bo riêng: "giống các vòng khác (BoN)", Bo1–7, hoặc tự nhập số lẻ (ô số hiện ra khi chọn "Tự nhập")
    const boSel = (i, k, v, stageBo) => {
      const custom = v && !BO_OPTS.includes(Number(v));
      return sel(i, k, [[0, T('bo_same_n', { n: stageBo })], ...BO_OPTS.map((n) => [n, 'Bo' + n]), ['c', T('bo_custom')]], custom ? 'c' : v || 0)
        + (custom ? `<span class="bo-n">Bo${num(i, k + 'N', v, 1, MAX_BO)}</span>` : '');
    };
    // Trận xếp hạng: mỗi ô một cặp hạng (3–4, 5–6…) theo số người tối đa của giải
    const placePick = (i, c) => {
      const size = pow2(Math.max(4, Number(ctx.max) || 16));
      const on = new Set(placesOf(c, size));
      const chips = [];
      for (let p = 3; p < Math.min(size, PLACE_CHIPS); p += 2) chips.push(`<label class="chip"><input type="checkbox" data-i="${i}" data-k="place" data-p="${p}" ${on.has(p) ? 'checked' : ''}><span>${p}–${p + 1}</span></label>`);
      const rest = size > PLACE_CHIPS ? `<label class="check"><input type="checkbox" data-i="${i}" data-k="placeRest" data-size="${size}" ${on.has(PLACE_CHIPS + 1) ? 'checked' : ''}> <span>${esc(T('place_rest', { a: PLACE_CHIPS + 1, b: size }))}</span></label>` : '';
      return `<div class="field place-pick"><span>${esc(T('opt_places'))}</span><small class="hint">${esc(T('opt_places_hint'))}</small>
        <div class="chips">${chips.join('')}</div>${rest}
        <div class="row"><button type="button" class="ghost sm" data-sact="placeAll" data-i="${i}" data-size="${size}">${esc(T('place_all'))}</button>
        <button type="button" class="ghost sm" data-sact="placeNone" data-i="${i}">${esc(T('place_none'))}</button></div></div>`;
    };
    const cards = st.map((c, i) => {
      const last = i === st.length - 1;
      const types = [...(last ? ['single', 'double', 'roundrobin', 'swiss'] : ['roundrobin', 'swiss']), ...(ctx.ext ? ['race'] : [])].map((x) => [x, T('fmt_' + x)]);
      const f = [field(T('format'), sel(i, 'type', types, c.type))];
      if (c.type !== 'race') f.push(field(T('format_bo'), boPick(i, 'bestOf', c.bestOf)));
      // Hệ Race: số chặng, cách tính (điểm theo hạng / thời gian), bảng điểm theo hạng, bảng xếp hạng đội
      if (c.type === 'race') {
        f.push(field(T('opt_race_heat'), num(i, 'heat', c.heat || 0, 0, 64))); // chia lượt cho đoàn đông (0 = không chia)
        f.push(field(T('opt_race_events'), num(i, 'events', c.events, 1, 30)),
          field(T('opt_race_score'), sel(i, 'score', [['points', T('race_points')], ['time', T('race_time')]], c.score || 'points')));
        if ((c.score || 'points') === 'points') {
          f.push(`<label class="field"><span>${esc(T('opt_race_table'))}</span><input data-i="${i}" data-k="table" value="${esc((c.table || []).join(' '))}" inputmode="numeric"><small class="hint">${esc(T('opt_race_table_hint'))}</small></label>`,
            chk(i, 'teams', !!c.teams, T('opt_race_teams')));
        }
      }
      const more = []; // tuỳ chọn nâng cao (chỉ ở trang nâng cao)
      if (c.type === 'single') {
        f.push(chk(i, 'thirdPlace', placesOf(c, 4).includes(3), T('third_place_opt')));
        if (adv) more.push(placePick(i, c));
      }
      if (c.type === 'double') {
        if (adv) {
          more.push(field(T('opt_gf'), sel(i, 'gf', [['2', T('gf_2')], ['1', T('gf_1')], ['none', T('gf_none')]], gfOf(c))));
          more.push(chk(i, 'split', c.split, T('opt_split')));
        } else f.push(chk(i, 'reset', gfOf(c) === '2', T('opt_reset')));
      }
      if (adv && (c.type === 'single' || c.type === 'double')) {
        more.push(`<p class="hint">${esc(T('opt_bo_sf_hint'))}</p>`, field(T('opt_bo_semi'), boSel(i, 'boSemi', c.boSemi, c.bestOf)), field(T('opt_bo_final'), boSel(i, 'boFinal', c.boFinal, c.bestOf)));
      }
      // Giải offline (ctx.ext): league phase kiểu Champions League – mỗi đội gặp N đối thủ chia theo nhóm hạt giống
      if (ctx.ext && c.type === 'roundrobin') {
        f.push(chk(i, 'league', !!c.league, T('opt_league')));
        // Cấu hình nhập từ JSON có thể thiếu trường: hiện giá trị mặc định như máy chủ (stages-league.js)
        if (c.league) f.push(field(T('opt_league_games'), num(i, 'lgGames', c.league.games || 8, 1, 20)), field(T('opt_league_pots'), num(i, 'lgPots', c.league.pots || 4, 1, 8)), `<small class="hint">${esc(T('opt_league_hint'))}</small>`);
      }
      if (c.type === 'roundrobin' && !c.league) {
        // Chia theo số bảng, hoặc theo số người mỗi bảng (như Challonge); giải offline: bảng tới 64 đội
        const bySize = c.groupSize != null;
        f.push(field(T('gmode'), sel(i, 'gmode', [['count', T('gmode_count')], ['size', T('gmode_size')]], bySize ? 'size' : 'count')));
        f.push(bySize ? field(T('gmode_size'), num(i, 'groupSize', c.groupSize, 2, ctx.ext ? 64 : 16)) : field(T('opt_groups'), num(i, 'groups', c.groups, 1, 64)));
        f.push(field(T('opt_meetings'), sel(i, 'meetings', [[1, T('meet_1')], [2, T('meet_2')], ...(adv ? [[3, T('meet_3')]] : [])], c.meetings)));
      }
      if (c.type === 'roundrobin' && adv) more.push(field(T('opt_rankby'), sel(i, 'rankBy', RANK_BY.map((x) => [x, T('rank_' + x)]), c.rankBy || 'points')));
      // Giải offline: thêm các đội đứng ngay sau suất đi tiếp có thành tích tốt nhất (World Cup 2026: 8 đội hạng ba)
      if (ctx.ext && c.type === 'roundrobin' && !last && !c.league) f.push(field(T('opt_best_next'), num(i, 'bestNext', c.bestNext || 0, 0, 32)));
      // Giải offline: Thụy Sĩ theo số thắng / thua kiểu LoL (đủ số thắng thì đi tiếp, đủ số thua thì bị loại)
      if (ctx.ext && c.type === 'swiss') {
        f.push(chk(i, 'record', !!c.record, T('opt_record')));
        if (c.record) f.push(field(T('opt_rec_win'), num(i, 'recWin', c.record.win || 3, 1, 5)), field(T('opt_rec_lose'), num(i, 'recLose', c.record.lose || 3, 1, 5)),
          field(T('opt_rec_bo'), sel(i, 'recBo', [[0, T('bo_same_n', { n: c.bestOf })], ...BO_OPTS.map((n) => [n, 'Bo' + n])], c.record.bo || 0)));
      }
      // 0 = tự động (⌈log₂ n⌉) – cả hai form cùng một ô để không hiện số khác với số sẽ gửi
      if (c.type === 'swiss' && !c.record) f.push(field(T('opt_rounds_auto'), num(i, 'rounds', c.rounds, 0, 15)));
      // Giải offline: knock-out 2 lượt (tổng tỉ số, hoà thì luân lưu)
      // (chỉ kiểu tỉ số: set / chỉ người thắng không có tổng tỉ số hai lượt)
      if (ctx.ext && (ctx.result || 'score') === 'score' && (c.type === 'single' || c.type === 'double')) {
        f.push(chk(i, 'legs', !!c.legs, T('opt_legs')));
        if (c.legs && c.type === 'single') f.push(chk(i, 'legsFinal', !!c.legsFinal, T('opt_legs_final')));
      }
      // Giải offline: nhánh theo vị trí trong bảng (1A–2B, 1E–3…) khi giai đoạn trước là vòng bảng nhiều bảng
      const prev = st[i - 1];
      if (ctx.ext && (c.type === 'single' || c.type === 'double') && prev && prev.type === 'roundrobin' && !prev.league && ((prev.groups || 1) > 1 || prev.groupSize)) {
        f.push(chk(i, 'path', c.path === 'groups', T('opt_path')));
      }
      // Thụy Sĩ: cách xếp cặp (Hà Lan – chuẩn FIDE / liền kề – như bản cũ)
      if (adv && c.type === 'swiss') more.push(field(T('opt_pairing'), sel(i, 'pairing', [['dutch', T('pair_dutch')], ['adjacent', T('pair_adjacent')]], c.pairing || 'dutch')));
      if (c.points) {
        f.push(`<div class="field inline"><span>${esc(T('opt_points'))}</span><span class="pts3">${num(i, 'pw', c.points.w, 0, 10)}${num(i, 'pd', c.points.d, 0, 10)}${num(i, 'pl', c.points.l, 0, 10)}</span></div>`);
        if (adv) {
          more.push(`<div class="field inline"><span>${esc(T('opt_pts_game'))}</span><span class="pts3">${num(i, 'pgw', c.points.gw || 0, 0, 10)}${num(i, 'pgt', c.points.gt || 0, 0, 10)}</span></div>`);
          // Giải offline: điểm thắng / thua ở set quyết định / sau hiệp phụ – luân lưu (bóng chuyền 3–2, khúc côn cầu)
          if (ctx.ext) more.push(`<div class="field inline"><span>${esc(T('opt_pts_ext'))}</span><span class="pts3">${num(i, 'pwx', c.points.wx != null ? c.points.wx : c.points.w, 0, 10)}${num(i, 'plx', c.points.lx != null ? c.points.lx : c.points.l, 0, 10)}</span></div>`);
          if (c.type === 'swiss') more.push(field(T('opt_pts_bye'), num(i, 'pbye', c.points.bye != null ? c.points.bye : c.points.w, 0, 10)));
          const tbs = tbsOf(c);
          const opts = [['', T('tb_none')], ...TIEBREAKS.filter((x) => x !== 'koya' || c.type === 'roundrobin').map((x) => [x, T('tb_' + x)])];
          more.push(`<div class="field tb-row"><span>${esc(T('opt_tiebreaks'))}</span><span class="tb4">${Array.from({ length: MAX_TB }, (_, n) => sel(i, 'tb' + n, opts, tbs[n] || '')).join('')}</span></div>`);
          // Trận không đấu (miễn đấu, thắng / thua do vắng mặt): theo FIDE / như bản cũ
          more.push(field(T('opt_unplayed'), sel(i, 'unplayed', [['fide', T('unplayed_fide')], ['raw', T('unplayed_raw')]], c.unplayed || 'fide')));
          more.push(`<details class="tb-help"><summary>${esc(T('tb_help'))}</summary><dl>${TIEBREAKS.map((x) => `<dt>${esc(T('tb_' + x))}</dt><dd>${esc(T('tbx_' + x))}</dd>`).join('')}</dl></details>`);
        }
      }
      // Thụy Sĩ theo số thắng / thua: ai đủ số thắng đều đi tiếp (không cần ô số người đi tiếp)
      if (!last && !c.record) f.push(field(T(c.type === 'roundrobin' && !c.league ? 'adv_per_group' : 'adv_total'), num(i, 'advance', c.advance, 1, 32)));
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
    else if (k === 'thirdPlace' || k === 'place' || k === 'placeRest') {
      // Mọi thay đổi trận xếp hạng đều chuyển sang danh sách cặp hạng (places)
      const size = Number(el.dataset.size) || 1024;
      const set = new Set(placesOf(c, size));
      const list = k === 'thirdPlace' ? [3] : k === 'place' ? [Number(el.dataset.p)] : Array.from({ length: (size - PLACE_CHIPS) / 2 }, (_, j) => PLACE_CHIPS + 1 + 2 * j);
      for (const p of list) { if (el.checked) set.add(p); else set.delete(p); }
      setPlaces(c, [...set]);
    } else if (k === 'boSemi' || k === 'boFinal' || k === 'bestOf') c[k] = el.value === 'c' ? 9 : Number(el.value) || (k === 'bestOf' ? 1 : 0);
    else if (k === 'boSemiN' || k === 'boFinalN' || k === 'bestOfN') {
      let n = clamp(v);
      if (n % 2 === 0) n = n < MAX_BO ? n + 1 : n - 1; // Bo luôn là số lẻ
      c[k.slice(0, -1)] = n;
    }
    else if (k === 'league') {
      if (el.checked) { c.league = { games: 8, pots: 4 }; delete c.groupSize; c.groups = 1; c.meetings = 1; } else delete c.league;
    } else if (k === 'lgGames' || k === 'lgPots') c.league = { games: 8, pots: 4, ...c.league, [k === 'lgGames' ? 'games' : 'pots']: clamp(v) };
    else if (k === 'record') { if (el.checked) c.record = { win: 3, lose: 3, bo: 3 }; else delete c.record; }
    else if (k === 'recWin' || k === 'recLose') c.record = { win: 3, lose: 3, ...c.record, [k === 'recWin' ? 'win' : 'lose']: clamp(v) };
    else if (k === 'recBo') c.record.bo = Number(el.value) || 0;
    else if (k === 'table') c.table = String(el.value).split(/[\s,;]+/).filter(Boolean).map((x) => Math.max(0, Math.min(1000, Math.floor(Number(x)) || 0))).slice(0, 64);
    else if (k === 'path') { if (el.checked) c.path = 'groups'; else delete c.path; } // nhánh theo vị trí trong bảng (otour-path.js)
    else if (el.type === 'checkbox') c[k] = el.checked;
    else if (/^tb\d$/.test(k)) {
      const tbs = [...tbsOf(c)];
      tbs[Number(k[2])] = v;
      c.tiebreaks = tbs.filter((x, j) => x && tbs.indexOf(x) === j).slice(0, MAX_TB); // bỏ ô trống và trùng
    } else if (k[0] === 'p' && ['pw', 'pd', 'pl', 'pgw', 'pgt', 'pbye', 'pwx', 'plx'].includes(k)) c.points[k.slice(1)] = clamp(v);
    else if (el.tagName === 'SELECT') c[k] = v;
    else if (Number.isFinite(v)) c[k] = clamp(v);
    return true;
  }

  /** Đặt danh sách cặp hạng (bỏ cách ghi cũ placement / thirdPlace). */
  function setPlaces(c, list) {
    c.places = [...new Set(list)].filter((p) => p >= 3 && p % 2 === 1).sort((a, b) => a - b);
    c.placement = false;
    c.thirdPlace = c.places.includes(3);
  }

  /** Nút thêm / bỏ giai đoạn. Trả true nếu đã đổi. */
  function click(stages, b) {
    const c = stages[Number(b.dataset.i)];
    if (b.dataset.sact === 'placeAll' && c) { setPlaces(c, Array.from({ length: Number(b.dataset.size) / 2 - 1 }, (_, j) => 3 + 2 * j)); return true; }
    if (b.dataset.sact === 'placeNone' && c) { setPlaces(c, []); return true; }
    if (b.dataset.sact === 'add' && stages.length < MAX) stages.unshift(DEFAULT.roundrobin());
    else if (b.dataset.sact === 'del' && stages.length > 1) {
      stages.splice(Number(b.dataset.i), 1);
      const last = stages[stages.length - 1];
      if (last) delete last.advance; // giai đoạn cuối không có "đi tiếp"
    } else return false;
    // Giai đoạn đứng trước phải là vòng tròn / Thụy Sĩ và có số người đi tiếp
    stages.forEach((c, i) => {
      if (i < stages.length - 1 && !c.points && c.type !== 'race') stages[i] = DEFAULT.roundrobin();
      else if (i < stages.length - 1 && !c.advance) c.advance = DEFAULT[c.type]().advance;
    });
    return true;
  }

  K.stageEdit = { DEFAULT, MAX, html, change, click, tbsOf, gfOf, placesOf, TIEBREAKS };
})();
