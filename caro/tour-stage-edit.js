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
    // Bảng đấu loại kép 4 đội kiểu GSL (chỉ giải offline): nhất và nhì mỗi bảng đi tiếp
    gsl: () => ({ type: 'gsl', bestOf: 1, advance: 2 }),
    // Vòng tranh hạt giống + cơ hội cuối (chỉ giải offline, giai đoạn giữa): 3/4 số đội đi tiếp, không có ô số đi tiếp
    kings: () => ({ type: 'kings', bestOf: 3 }),
  };
  // Xe đạp nhiều chặng (cách tính 'gt' – stages-gt.js): loại từng chặng
  const GT_KINDS = ['flat', 'hilly', 'mtn', 'itt'];
  const gtKinds = (c) => Array.from({ length: c.events || 1 }, (_, j) => (GT_KINDS.includes((c.kinds || [])[j]) ? c.kinds[j] : GT_PATTERN[j % GT_PATTERN.length]));
  // Mẫu loại chặng mặc định (như một Grand Tour 21 chặng: đồng bằng, đồi, núi, 2 chặng tính giờ) – lặp lại nếu nhiều hơn
  const GT_PATTERN = ['flat', 'hilly', 'flat', 'hilly', 'itt', 'hilly', 'hilly', 'flat', 'flat', 'mtn', 'flat', 'mtn', 'itt', 'mtn', 'hilly', 'mtn', 'flat', 'mtn', 'mtn', 'hilly', 'flat'];
  const gtStage = (n) => ({ type: 'race', bestOf: 1, events: n, score: 'gt', bonus: true, kinds: Array.from({ length: n }, (_, j) => GT_PATTERN[j % GT_PATTERN.length]) });
  // Golf đấu gậy (cách tính 'golf' – stages-golf.js): par từng lỗ, nhập tổng vòng / từng lỗ, cắt sau vòng N
  const PAR72 = [4, 5, 4, 3, 4, 3, 4, 5, 4, 4, 4, 3, 5, 4, 5, 3, 4, 4];
  const golfStage = () => ({ type: 'race', bestOf: 1, events: 4, score: 'golf', input: 'round', par: [...PAR72], cut: { after: 2, top: 50 }, po: [18, 10] });
  const MAX = 3;
  const RANK_BY = ['points', 'match_wins', 'game_wins', 'game_pct', 'game_diff'];
  // Như máy chủ (stages-tiebreak.js): thứ tự trong ô chọn
  const TIEBREAKS = ['h2h', 'bh', 'bh1', 'bh2', 'mbh', 'mbh2', 'fb', 'aob', 'sb', 'koya', 'ps', 'wins', 'won', 'bpg', 'aro', 'aroc1', 'tpr', 'apro',
    'gdiff', 'gwins', 'gpct', 'pdiff', 'ppct'];
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
  const STRING_KEYS = ['rankBy', 'gf', 'tbAdd', 'gmode', 'type', 'pairing', 'unplayed', 'score', 'table', 'kind', 'input', 'par', 'mpMode', 'head'];

  // Tiêu chí chọn được: Koya chỉ ở vòng tròn; số trận thua chỉ ở Thụy Sĩ theo số thắng / thua (như máy chủ)
  const tbChoices = (c) => [...TIEBREAKS.filter((x) => x !== 'koya' || c.type === 'roundrobin'), ...(c.record ? ['losses'] : [])];
  /** Chỉ số phụ (tie-break): danh sách theo thứ tự ưu tiên (↑ / ↓ / bỏ) + ô "Thêm chỉ số phụ" – chọn bao nhiêu tuỳ ý. */
  function tbList(i, c) {
    const tbs = tbsOf(c);
    const btn = (act, n, label, inner, off) => `<button type="button" class="ghost sm icon" data-sact="${act}" data-i="${i}" data-n="${n}" title="${esc(label)}" aria-label="${esc(label)}" ${off ? 'disabled' : ''}>${inner}</button>`;
    const rows = tbs.map((x, n) => `<li><span class="tb-n">${n + 1}</span><span class="tb-crit">${esc(T('tb_' + x))}</span>
      ${btn('tbUp', n, T('tb_up'), '↑', n === 0)}${btn('tbDown', n, T('tb_down'), '↓', n === tbs.length - 1)}${btn('tbDel', n, T('tb_del'), icon('close'))}</li>`).join('');
    const left = tbChoices(c).filter((x) => !tbs.includes(x));
    const add = left.length ? `<select class="tb-add" data-i="${i}" data-k="tbAdd" aria-label="${esc(T('tb_add'))}"><option value="">${esc('+ ' + T('tb_add'))}</option>${left.map((x) => `<option value="${x}">${esc(T('tb_' + x))}</option>`).join('')}</select>` : '';
    return `<div class="field tb-row"><span>${esc(T('opt_tiebreaks'))}</span><small class="hint">${esc(T('tb_order_hint'))}</small>
      ${rows ? `<ol class="tb-list">${rows}</ol>` : `<p class="hint">${esc(T('tb_empty'))}</p>`}${add}</div>`;
  }

  function html(stages, adv, ctx = {}) {
    const st = stages || [];
    const num = (i, k, v, min, max) => `<input type="number" data-i="${i}" data-k="${k}" value="${v}" min="${min}" max="${max}">`;
    const sel = (i, k, items, v) => `<select data-i="${i}" data-k="${k}">${items.map(([x, l]) => `<option value="${x}" ${String(x) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    const chk = (i, k, v, label) => `<label class="check"><input type="checkbox" data-i="${i}" data-k="${k}" ${v ? 'checked' : ''}> <span>${esc(label)}</span></label>`;
    const field = (label, inner) => `<label class="field inline"><span>${esc(label)}</span>${inner}</label>`;
    // Bo của cả giai đoạn: Bo1–7 hoặc tự nhập số lẻ bất kỳ tới MAX_BO
    // even: thêm lựa chọn Bo2 có hoà (vòng tròn / Thụy Sĩ của giải offline)
    const boPick = (i, k, v, even) => {
      const opts = even ? [1, 2, 3, 5, 7] : BO_OPTS;
      const custom = !opts.includes(Number(v));
      return sel(i, k, [...opts.map((n) => [n, n === 2 ? T('bo2_draw') : 'Bo' + n]), ['c', T('bo_custom')]], custom ? 'c' : v)
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
      // Giải offline: loại trực tiếp cũng được làm giai đoạn giữa (vòng loại đội thách đấu kiểu America's Cup)
      const types = [...(last || ctx.ext ? ['single', 'double', 'roundrobin', 'swiss'] : ['roundrobin', 'swiss']), ...(ctx.ext ? ['gsl', 'race', ...(last ? [] : ['kings'])] : [])].map((x) => [x, T('fmt_' + x)]);
      const f = [field(T('format'), sel(i, 'type', types, c.type))];
      if (c.type !== 'race') f.push(field(T('format_bo'), boPick(i, 'bestOf', c.bestOf, ctx.ext && (c.type === 'roundrobin' || c.type === 'swiss') && !c.record)));
      if (c.type === 'kings') f.push(field(T('opt_kings_low'), boSel(i, 'boLow', c.boLow, c.bestOf)), `<small class="hint">${esc(T('opt_kings_hint'))}</small>`);
      if (c.type === 'gsl') f.push(field(T('opt_gsl_size'), sel(i, 'size', [[4, T('gsl_size4')], [8, T('gsl_size8')]], c.size === 8 ? 8 : 4)), field(T('opt_gsl_decider'), boSel(i, 'boDecider', c.boDecider, c.bestOf)), `<small class="hint">${esc(T('opt_gsl_hint'))}</small>`);
      // Hệ Race: số chặng, cách tính (điểm theo hạng / thời gian), bảng điểm theo hạng, bảng xếp hạng đội
      if (c.type === 'race') {
        if (c.score !== 'gt' && c.score !== 'golf') f.push(field(T('opt_race_heat'), num(i, 'heat', c.heat || 0, 0, 64))); // chia lượt cho đoàn đông (0 = không chia)
        f.push(field(T('opt_race_events'), num(i, 'events', c.events, 1, 30)),
          field(T('opt_race_score'), sel(i, 'score', [['points', T('race_points')], ['time', T('race_time')], ['gt', T('race_gt')], ['golf', T('race_golf')]], c.score || 'points')));
        if (c.score === 'golf') { // cách nhập, par từng lỗ, cắt sau vòng N
          const parTxt = (c.par || PAR72).join(' ');
          f.push(field(T('opt_golf_input'), sel(i, 'input', [['round', T('golf_input_round')], ['hole', T('golf_input_hole')]], c.input || 'round')),
            `<label class="field"><span>${esc(T('opt_golf_par', { n: (c.par || PAR72).length, p: (c.par || PAR72).reduce((a, b) => a + b, 0) }))}</span><input data-i="${i}" data-k="par" value="${esc(parTxt)}" inputmode="numeric"><small class="hint">${esc(T('opt_golf_par_hint'))}</small></label>`);
          if ((c.events || 1) > 1) {
            f.push(chk(i, 'cutOn', !!c.cut, T('opt_golf_cut')));
            if (c.cut) f.push(field(T('opt_golf_cut_after'), num(i, 'cutAfter', c.cut.after, 1, (c.events || 2) - 1)), field(T('opt_golf_cut_top'), num(i, 'cutTop', c.cut.top, 1, 512)));
          }
        }
        if (c.score === 'gt') { // loại từng chặng + giây thưởng về đích
          const kinds = GT_KINDS.map((x) => [x, T('gt_kind_' + x)]);
          f.push(`<div class="field gt-kinds"><span>${esc(T('opt_gt_kinds'))}</span><small class="hint">${esc(T('opt_gt_kinds_hint'))}</small><div class="gt-kind-grid">${
            gtKinds(c).map((x, j) => `<label class="gt-kind-sel"><small>${j + 1}</small><select data-i="${i}" data-k="kind" data-n="${j}" aria-label="${esc(T('gt_stage_n', { n: j + 1 }))}">${
              kinds.map(([v, l]) => `<option value="${v}" ${v === x ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`).join('')}</div></div>`,
          chk(i, 'bonus', c.bonus !== false, T('opt_gt_bonus')));
        }
        if ((c.score || 'points') === 'points') {
          f.push(`<label class="field"><span>${esc(T('opt_race_table'))}</span><input data-i="${i}" data-k="table" value="${esc((c.table || []).join(' '))}" inputmode="numeric"><small class="hint">${esc(T('opt_race_table_hint'))}</small></label>`,
            chk(i, 'teams', !!c.teams, T('opt_race_teams')));
          // Sinh tồn (battle royale): điểm mỗi lần hạ gục; kết thúc kiểu match point
          const mode = !c.mp ? 'none' : c.mp.at ? 'at' : 'after';
          f.push(field(T('opt_br_kill'), num(i, 'kill', c.kill || 0, 0, 10)),
            field(T('opt_mp'), sel(i, 'mpMode', [['none', T('mp_none')], ['at', T('mp_at')], ...((c.events || 1) > 1 ? [['after', T('mp_after')]] : [])], mode)));
          if (mode === 'at') f.push(field(T('opt_mp_at'), num(i, 'mpAt', c.mp.at, 1, 100000)), field(T('opt_mp_min'), num(i, 'mpMin', c.mp.min || 1, 1, c.events || 1)));
          if (mode === 'after') f.push(field(T('opt_mp_after'), num(i, 'mpAfter', c.mp.after, 1, Math.max(1, (c.events || 2) - 1))), field(T('opt_mp_plus'), num(i, 'mpPlus', c.mp.plus, 0, 1000)));
          if (mode !== 'none') f.push(`<small class="hint">${esc(T('opt_mp_hint'))}</small>`);
          // Chia 3 bảng xoay vòng (mỗi trận hai bảng đấu); điểm thưởng mang sang cho giai đoạn sau giai đoạn đầu
          if (!c.heat) f.push(chk(i, 'rot', !!c.rot, T('opt_br_rot')));
          if (i > 0) f.push(`<label class="field"><span>${esc(T('opt_br_head'))}</span><input data-i="${i}" data-k="head" value="${esc((c.head || []).join(' '))}" inputmode="numeric"><small class="hint">${esc(T('opt_br_head_hint'))}</small></label>`);
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
      // Giải offline: mùa giải kiểu nhà nghề Mỹ – miền, bảng con, số lần gặp theo quan hệ (otour-season-edit.js)
      if (ctx.ext && c.type === 'roundrobin' && K.seasonEdit && !c.league) f.push(...K.seasonEdit.html(i, c, ctx));
      if (ctx.ext && c.type === 'roundrobin' && !c.season) {
        f.push(chk(i, 'league', !!c.league, T('opt_league')));
        // Cấu hình nhập từ JSON có thể thiếu trường: hiện giá trị mặc định như máy chủ (stages-league.js)
        if (c.league) f.push(field(T('opt_league_games'), num(i, 'lgGames', c.league.games || 8, 1, 20)), field(T('opt_league_pots'), num(i, 'lgPots', c.league.pots || 4, 1, 8)), `<small class="hint">${esc(T('opt_league_hint'))}</small>`);
      }
      if (c.type === 'roundrobin' && !c.league && !c.season) {
        // Chia theo số bảng, hoặc theo số người mỗi bảng (như Challonge); giải offline: bảng tới 64 đội
        const bySize = c.groupSize != null;
        f.push(field(T('gmode'), sel(i, 'gmode', [['count', T('gmode_count')], ['size', T('gmode_size')]], bySize ? 'size' : 'count')));
        f.push(bySize ? field(T('gmode_size'), num(i, 'groupSize', c.groupSize, 2, ctx.ext ? 64 : 16)) : field(T('opt_groups'), num(i, 'groups', c.groups, 1, 64)));
        f.push(field(T('opt_meetings'), sel(i, 'meetings', [[1, T('meet_1')], [2, T('meet_2')], ...(adv ? [[3, T('meet_3')]] : [])], c.meetings)));
      }
      if (c.type === 'roundrobin' && adv) more.push(field(T('opt_rankby'), sel(i, 'rankBy', RANK_BY.map((x) => [x, T('rank_' + x)]), c.rankBy || 'points')));
      // Giải offline: thêm các đội đứng ngay sau suất đi tiếp có thành tích tốt nhất (World Cup 2026: 8 đội hạng ba)
      if (ctx.ext && c.type === 'roundrobin' && !last && !c.league && !c.season) f.push(field(T('opt_best_next'), num(i, 'bestNext', c.bestNext || 0, 0, 32)));
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
      // Giải offline: playoff kiểu nhà nghề Mỹ sau mùa giải (otour-playoff-edit.js) – thay cho nhánh theo vị trí trong bảng
      if (ctx.ext && c.type === 'single' && prev && prev.season && K.playoffEdit) f.push(...K.playoffEdit.html(i, c, prev, ctx));
      if (ctx.ext && (c.type === 'single' || c.type === 'double') && !(c.playoff && prev && prev.season) && prev && prev.type === 'roundrobin' && !prev.league && ((prev.groups || 1) > 1 || prev.groupSize)) {
        f.push(chk(i, 'path', c.path === 'groups', T('opt_path')));
      }
      // Giải offline: đội hạt giống cao vào thẳng giai đoạn này (LoL Worlds: 15 đội vào thẳng vòng Thụy Sĩ); Thụy Sĩ vòng 1
      // tránh hai đội cùng khu vực (cột quốc gia)
      if (ctx.ext && i > 0) f.push(field(T('opt_direct'), num(i, 'direct', c.direct || 0, 0, 256)));
      // 3 giai đoạn: các đội đầu của giai đoạn 1 vào thẳng giai đoạn 3, phần còn lại đá giai đoạn 2 (vòng vớt)
      if (ctx.ext && i === 0 && st.length === 3 && ['roundrobin', 'swiss', 'race', 'gsl'].includes(c.type) && !c.record) f.push(field(T(c.type === 'gsl' || (c.type === 'roundrobin' && !c.league) ? 'opt_skip_group' : 'opt_skip'), num(i, 'skip', c.skip || 0, 0, c.type === 'gsl' ? (c.advance || 2) - 1 : 256)));
      if (ctx.ext && c.type === 'swiss') f.push(chk(i, 'region', !!c.region, T('opt_region')));
      // Thụy Sĩ: cách xếp cặp (Hà Lan – chuẩn FIDE / liền kề – như bản cũ)
      if (adv && c.type === 'swiss') more.push(field(T('opt_pairing'), sel(i, 'pairing', [['dutch', T('pair_dutch')], ['adjacent', T('pair_adjacent')]], c.pairing || 'dutch')));
      if (c.points) {
        f.push(`<div class="field inline"><span>${esc(T('opt_points'))}</span><span class="pts3">${num(i, 'pw', c.points.w, 0, 10)}${num(i, 'pd', c.points.d, 0, 10)}${num(i, 'pl', c.points.l, 0, 10)}</span></div>`);
        if (adv) {
          more.push(`<div class="field inline"><span>${esc(T('opt_pts_game'))}</span><span class="pts3">${num(i, 'pgw', c.points.gw || 0, 0, 10)}${num(i, 'pgt', c.points.gt || 0, 0, 10)}</span></div>`);
          // Giải offline: điểm thắng / thua ở set quyết định / sau hiệp phụ – luân lưu (bóng chuyền 3–2, khúc côn cầu)
          if (ctx.ext) more.push(`<div class="field inline"><span>${esc(T('opt_pts_ext'))}</span><span class="pts3">${num(i, 'pwx', c.points.wx != null ? c.points.wx : c.points.w, 0, 10)}${num(i, 'plx', c.points.lx != null ? c.points.lx : c.points.l, 0, 10)}</span></div>`);
          if (c.type === 'swiss') more.push(field(T('opt_pts_bye'), num(i, 'pbye', c.points.bye != null ? c.points.bye : c.points.w, 0, 10)));
          more.push(tbList(i, c));
          // Trận không đấu (miễn đấu, thắng / thua do vắng mặt): theo FIDE / như bản cũ
          more.push(field(T('opt_unplayed'), sel(i, 'unplayed', [['fide', T('unplayed_fide')], ['raw', T('unplayed_raw')]], c.unplayed || 'fide')));
          more.push(`<details class="tb-help"><summary>${esc(T('tb_help'))}</summary><dl>${TIEBREAKS.map((x) => `<dt>${esc(T('tb_' + x))}</dt><dd>${esc(T('tbx_' + x))}</dd>`).join('')}</dl></details>`);
        }
      }
      // Thụy Sĩ theo số thắng / thua: ai đủ số thắng đều đi tiếp (không cần ô số người đi tiếp)
      if (!last && !c.record && c.type !== 'gsl' && c.type !== 'kings') f.push(field(T(c.season ? 'adv_per_conf' : c.type === 'roundrobin' && !c.league ? 'adv_per_group' : 'adv_total'), num(i, 'advance', c.advance, 1, 32)));
      const del = st.length > 1 ? `<button type="button" class="ghost sm icon" data-sact="del" data-i="${i}" title="${esc(T('stage_remove'))}" aria-label="${esc(T('stage_remove'))}">${icon('close')}</button>` : '';
      const extra = more.length ? `<div class="sc-more"><b>${esc(T('stage_more'))}</b><div class="sc-body">${more.join('')}</div></div>` : '';
      return `<div class="stage-card"><div class="sc-head"><b>${esc(T('stage_n', { n: i + 1 }))}</b>${last && st.length > 1 ? ` <span class="muted">${esc(T('stage_final'))}</span>` : ''}${del}</div><div class="sc-body">${f.join('')}</div>${extra}</div>`;
    });
    const arrows = [];
    st.forEach((c, i) => { arrows.push(stageName(c)); if (i < st.length - 1) arrows.push(advText(c) + (st[i + 1].direct ? ' ' + T('adv_direct', { n: st[i + 1].direct }) : '') + (c.skip && i + 2 < st.length ? ' ' + T('adv_skip', { n: c.skip }) : '')); });
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
      else if (nc.advance == null) nc.advance = 1; // loại trực tiếp làm giai đoạn giữa: mặc định vô địch nhánh đi tiếp
      stages[i] = nc;
    } else if (k === 'score') { // đổi cách tính hệ Race: dọn tuỳ chọn không còn dùng
      c.score = v;
      for (const k2 of ['kinds', 'bonus', 'par', 'input', 'cut', 'po', 'kill', 'mp', 'rot', 'head']) delete c[k2];
      if (v === 'gt') { Object.assign(c, { bonus: true, kinds: gtKinds(c) }); delete c.table; delete c.teams; delete c.heat; }
      else if (v === 'golf') { const g = golfStage(); Object.assign(c, { events: c.events > 1 ? c.events : 4, input: g.input, par: g.par, po: g.po }); if (c.events > 2) c.cut = { after: 2, top: 50 }; delete c.table; delete c.teams; delete c.heat; }
      else if (v === 'points' && !c.table) c.table = DEFAULT.race().table;
    } else if (k === 'par') { // par từng lỗ: 1–18 số, mỗi số 3–6
      const p = String(el.value).split(/[\s,;]+/).filter(Boolean).slice(0, 18).map((x) => Math.max(3, Math.min(6, Math.floor(Number(x)) || 4)));
      c.par = p.length ? p : [...PAR72];
      c.po = (c.po || [18, 10]).filter((h) => h <= c.par.length);
      if (!c.po.length) c.po = [c.par.length];
    } else if (k === 'cutOn') { if (el.checked) c.cut = { after: Math.min(2, (c.events || 2) - 1), top: 50 }; else delete c.cut; }
    else if (k === 'cutAfter' || k === 'cutTop') c.cut = { after: 2, top: 50, ...c.cut, [k === 'cutAfter' ? 'after' : 'top']: clamp(v) };
    else if (k === 'kind') { c.kinds = gtKinds(c); if (GT_KINDS.includes(v)) c.kinds[Number(el.dataset.n)] = v; }
    else if (k === 'gmode') {
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
    } else if (k === 'mpMode') { // match point: tắt / ngưỡng cố định / theo đội dẫn đầu sau N trận
      if (v === 'at') c.mp = { at: 50 }; else if (v === 'after') c.mp = { after: Math.max(1, Math.min((c.events || 2) - 1, Math.ceil((c.events || 2) * 2 / 3))), plus: 10 }; else delete c.mp;
    } else if (k === 'mpAt') c.mp = { ...c.mp, at: clamp(v) };
    else if (k === 'mpMin') { c.mp = { at: 50, ...c.mp }; if (clamp(v) > 1) c.mp.min = clamp(v); else delete c.mp.min; }
    else if (k === 'mpAfter' || k === 'mpPlus') c.mp = { after: 1, plus: 10, ...c.mp, [k === 'mpAfter' ? 'after' : 'plus']: clamp(v) };
    else if (k === 'boSemi' || k === 'boFinal' || k === 'boDecider' || k === 'bestOf') c[k] = el.value === 'c' ? 9 : Number(el.value) || (k === 'bestOf' ? 1 : 0);
    else if (k === 'boSemiN' || k === 'boFinalN' || k === 'boDeciderN' || k === 'bestOfN') {
      let n = clamp(v);
      if (n % 2 === 0) n = n < MAX_BO ? n + 1 : n - 1; // Bo luôn là số lẻ
      c[k.slice(0, -1)] = n;
    }
    else if (K.seasonEdit && K.seasonEdit.change(c, k, el)) { /* mùa giải kiểu Mỹ (otour-season-edit.js) */ }
    else if (K.playoffEdit && K.playoffEdit.change(stages, i, k, el)) { /* playoff kiểu Mỹ (otour-playoff-edit.js) */ }
    else if (k === 'league') {
      if (el.checked) { c.league = { games: 8, pots: 4 }; delete c.groupSize; c.groups = 1; c.meetings = 1; } else delete c.league;
    } else if (k === 'lgGames' || k === 'lgPots') c.league = { games: 8, pots: 4, ...c.league, [k === 'lgGames' ? 'games' : 'pots']: clamp(v) };
    else if (k === 'record') { if (el.checked) c.record = { win: 3, lose: 3, bo: 3 }; else delete c.record; }
    else if (k === 'recWin' || k === 'recLose') c.record = { win: 3, lose: 3, ...c.record, [k === 'recWin' ? 'win' : 'lose']: clamp(v) };
    else if (k === 'recBo') c.record.bo = Number(el.value) || 0;
    else if (k === 'size') { if (v === 8) c.size = 8; else delete c.size; c.advance = (c.size || 4) / 2; if (c.skip) c.skip = Math.min(c.skip, c.advance - 1); }
    else if (k === 'head') { const h = String(el.value).split(/[\s,;]+/).filter(Boolean).map((x) => Math.max(0, Math.min(1000, Math.floor(Number(x)) || 0))).slice(0, 64); if (h.some((x) => x > 0)) c.head = h; else delete c.head; }
    else if (k === 'table') c.table = String(el.value).split(/[\s,;]+/).filter(Boolean).map((x) => Math.max(0, Math.min(1000, Math.floor(Number(x)) || 0))).slice(0, 64);
    else if (k === 'path') { if (el.checked) c.path = 'groups'; else delete c.path; } // nhánh theo vị trí trong bảng (otour-path.js)
    else if (el.type === 'checkbox') c[k] = el.checked;
    else if (k === 'tbAdd') {
      const tbs = tbsOf(c);
      if (!tbChoices(c).includes(v) || tbs.includes(v)) return false;
      c.tiebreaks = [...tbs, v];
    } else if (k[0] === 'p' && ['pw', 'pd', 'pl', 'pgw', 'pgt', 'pbye', 'pwx', 'plx'].includes(k)) c.points[k.slice(1)] = clamp(v);
    else if (el.tagName === 'SELECT') c[k] = v;
    else if (Number.isFinite(v)) c[k] = clamp(v);
    if (k === 'events' && c.mp && c.mp.after) { if (c.events < 2) delete c.mp; else c.mp.after = Math.min(c.mp.after, c.events - 1); }
    if (k === 'events' && c.score === 'gt') c.kinds = gtKinds(c); // đổi số chặng: giữ loại các chặng đầu
    if (k === 'events' && c.score === 'golf' && c.cut) { if (c.events < 2) delete c.cut; else c.cut.after = Math.min(c.cut.after, c.events - 1); }
    // `skip` (vào thẳng giai đoạn 3) chỉ có nghĩa ở giai đoạn 1 của giải 3 giai đoạn
    stages.forEach((x, j) => { if (x.skip != null && !(x.skip > 0 && j === 0 && stages.length === 3)) delete x.skip; });
    dropPlayoff(stages);
    return true;
  }

  /** Playoff kiểu Mỹ chỉ có nghĩa ngay sau mùa giải (như normalizeStages của máy chủ): bỏ khi mùa giải bị tắt / xoá. */
  function dropPlayoff(stages) {
    stages.forEach((c, i) => { if (c.playoff && !(i > 0 && stages[i - 1].season)) { delete c.playoff; delete c.boRounds; } });
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
    // Chỉ số phụ: đổi thứ tự / bỏ
    if (/^tb(Up|Down|Del)$/.test(b.dataset.sact) && c) {
      const tbs = [...tbsOf(c)], n = Number(b.dataset.n), act = b.dataset.sact;
      if (!(n >= 0 && n < tbs.length)) return false;
      if (act === 'tbDel') tbs.splice(n, 1);
      else {
        const m = act === 'tbUp' ? n - 1 : n + 1;
        if (m < 0 || m >= tbs.length) return false;
        [tbs[n], tbs[m]] = [tbs[m], tbs[n]];
      }
      c.tiebreaks = tbs;
      return true;
    }
    if (b.dataset.sact === 'add' && stages.length < MAX) stages.unshift(DEFAULT.roundrobin());
    else if (b.dataset.sact === 'del' && stages.length > 1) {
      stages.splice(Number(b.dataset.i), 1);
      const last = stages[stages.length - 1];
      if (last) delete last.advance; // giai đoạn cuối không có "đi tiếp"
      if (last && last.type === 'kings') stages[stages.length - 1] = DEFAULT.single(); // vòng tranh hạt giống chỉ ở giữa
    } else return false;
    // Giai đoạn đứng trước phải là vòng tròn / Thụy Sĩ và có số người đi tiếp
    stages.forEach((c, i) => {
      if (i < stages.length - 1 && !c.points && c.type !== 'race' && c.type !== 'gsl' && c.type !== 'kings' && !((c.type === 'single' || c.type === 'double') && c.advance)) stages[i] = DEFAULT.roundrobin();
      else if (i < stages.length - 1 && !c.advance && c.type !== 'kings') c.advance = DEFAULT[c.type]().advance;
    });
    dropPlayoff(stages);
    return true;
  }

  K.stageEdit = { DEFAULT, MAX, gtStage, golfStage, html, change, click, tbsOf, gfOf, placesOf, TIEBREAKS };
})();
