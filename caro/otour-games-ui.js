/*
 * Giải đấu Offline – Esports trên trang giải (thuật toán dùng chung: caro/otour-draft.js; máy chủ: hub/otour-games.js):
 *   K.otGamesHtml(t, m)   – trong khung trận (otour-score.js): các ván của loạt – bên xanh / đỏ, thời lượng, cấm chọn,
 *                           chỉ số đội, MVP, K/D/A, biểu đồ vàng; ban tổ chức nhập / sửa từng ván (cấm chọn theo kịch bản,
 *                           tướng bị Fearless khoá hiện rõ và bị chặn trước khi gửi)
 *   K.otEspStatsHtml(t)   – tab Thống kê: tướng cấm / chọn / có mặt / tỉ lệ thắng, bên xanh thắng, thời lượng, MVP
 *   K.otEspCfgHtml(t)     – tab Khác (ban tổ chức): kịch bản cấm chọn, Fearless, chỉ số, K/D/A, danh sách tướng gợi ý
 *   K.otGoldSvg(gold)     – biểu đồ chênh lệch vàng theo thời gian (SVG)
 */
(function () {
  'use strict';
  const K = window.CaroTourKit;
  const DR = window.CaroOTourDraft;
  if (!K || !DR) return;
  const { O, T, esc, $, D, render } = K;
  const S = { mid: null, i: -1, vals: {}, err: '', saving: null }; // ván đang sửa (mã trận, chỉ số ván), giá trị đang gõ, đang gửi
  const SIDES = ['blue', 'red'];
  const statLabel = (k) => (DR.STATS.includes(k) ? T('esp_st_' + k) : k);
  /** Nhãn bên: xanh / đỏ (esports) hoặc vào từ mạn trái / phải (đua thuyền – cfg.sides 'ps'). */
  /** "Ván 3" (esports) / "Race 3" (đua thuyền). */
  const gameN = (cfg, i) => T(cfg && cfg.sides === 'ps' ? 'esp_race_n' : 'esp_game_n', { n: i + 1 });
  const sideLabel = (cfg, side) => T(cfg && cfg.sides === 'ps' ? (side === 'blue' ? 'esp_port' : 'esp_stbd') : 'esp_' + side);
  const teamName = (m, who) => (who === 'a' ? m.a : m.b).name;
  const fmtNum = (n) => (n >= 10000 ? (Math.round(n / 100) / 10) + 'k' : String(n));

  // ------------------------------------------------------------ Biểu đồ vàng
  /** Chênh lệch vàng bên xanh − bên đỏ theo phút: vùng trên trục là xanh dẫn, dưới trục là đỏ dẫn. */
  function goldSvg(gold) {
    if (!gold || gold.length < 2) return '';
    const W = 320, H = 120, P = 6;
    const xs = gold.map((g) => g[0]), ds = gold.map((g) => g[1] - g[2]);
    const x0 = xs[0], x1 = xs[xs.length - 1], dm = Math.max(1000, ...ds.map(Math.abs));
    const X = (x) => P + ((x - x0) / Math.max(1, x1 - x0)) * (W - 2 * P), Y = (d) => H / 2 - (d / dm) * (H / 2 - P);
    const pts = gold.map((g, i) => `${X(xs[i]).toFixed(1)},${Y(ds[i]).toFixed(1)}`).join(' ');
    const area = `${X(x0).toFixed(1)},${H / 2} ${pts} ${X(x1).toFixed(1)},${H / 2}`;
    const last = ds[ds.length - 1];
    return `<figure class="gold-fig"><svg class="gold-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(T('esp_gold_diff'))}">
      <defs><clipPath id="gc-up"><rect x="0" y="0" width="${W}" height="${H / 2}"/></clipPath><clipPath id="gc-dn"><rect x="0" y="${H / 2}" width="${W}" height="${H / 2}"/></clipPath></defs>
      <polygon class="gc-blue" clip-path="url(#gc-up)" points="${area}"/><polygon class="gc-red" clip-path="url(#gc-dn)" points="${area}"/>
      <line class="gc-axis" x1="0" y1="${H / 2}" x2="${W}" y2="${H / 2}"/><polyline class="gc-line" points="${pts}"/></svg>
      <figcaption class="muted">${esc(T('esp_gold_diff'))}: ${last > 0 ? '+' : ''}${esc(fmtNum(last))} · ${esc(String(x1))}′ · ±${esc(fmtNum(dm))}</figcaption></figure>`;
  }
  K.otGoldSvg = goldSvg;

  // ------------------------------------------------------------ Xem một ván
  function gameView(t, m, g, i) {
    const cfg = t.esports;
    const s = (m.sets || [])[i];
    const win = s && s[0] !== s[1] ? (s[0] > s[1] ? 'a' : 'b') : null;
    const sideTeam = (side) => DR.teamOf(g, side);
    const head = SIDES.map((side) => `<span class="esp-side ${esc(side)}">${esc(sideLabel(cfg, side))}: <b>${esc(teamName(m, sideTeam(side)))}</b>${win === sideTeam(side) ? ` <span class="pill">${esc(T('esp_win'))}</span>` : ''}</span>`).join(' ');
    const meta = [g.dur ? DR.fmtDur(g.dur) : '', g.mvp ? `${T('esp_mvp')}: ${g.mvp}` : ''].filter(Boolean).join(' · ');
    const draft = g.draft ? SIDES.map((side) => `<div class="esp-draft ${esc(side)}"><small class="muted">${esc(T('esp_ban'))}</small> ${g.draft[side].bans.filter(Boolean).map((c) => `<s class="chip-x">${esc(c)}</s>`).join(' ')}
      <br><small class="muted">${esc(T('esp_pick'))}</small> ${g.draft[side].picks.filter(Boolean).map((c) => `<span class="chip-x">${esc(c)}</span>`).join(' ')}</div>`).join('') : '';
    const keys = g.st ? Object.keys(g.st.blue) : [];
    const stats = keys.length ? `<table class="stand esp-st"><thead><tr><th></th><th>${esc(sideLabel(cfg, 'blue'))}</th><th>${esc(sideLabel(cfg, 'red'))}</th></tr></thead><tbody>${keys.map((k) => `<tr><td>${esc(statLabel(k))}</td><td>${esc(fmtNum(g.st.blue[k]))}</td><td>${esc(fmtNum(g.st.red[k]))}</td></tr>`).join('')}</tbody></table>` : '';
    // Đua thuyền: cách biệt về đích (giây) từ thời gian về đích của hai thuyền
    const margin = g.st && g.st.blue.finish != null && g.st.red.finish != null ? `<p class="hint">${esc(T('esp_margin', { s: Math.abs(g.st.blue.finish - g.st.red.finish) }))}</p>` : '';
    const pl = g.players ? SIDES.map((side) => (g.players[side] || []).length ? `<table class="stand esp-pl ${esc(side)}"><tbody>${g.players[side].map((p) => `<tr><td>${esc(p.n)}</td><td class="muted">${esc(p.c)}</td><td>${p.k}/${p.d}/${p.a}</td></tr>`).join('')}</tbody></table>` : '').join('') : '';
    return `<div class="esp-game"><div class="esp-head"><b>${esc(gameN(t.esports, i))}</b> ${head}${meta ? ` <small class="muted">${esc(meta)}</small>` : ''}</div>
      ${draft ? `<div class="esp-drafts">${draft}</div>` : ''}<div class="esp-row">${stats}${goldSvg(g.gold)}</div>${margin}${pl ? `<div class="esp-pls">${pl}</div>` : ''}</div>`;
  }

  // ------------------------------------------------------------ Nhập / sửa một ván
  /** Giá trị ô: đang gõ (S.vals) hoặc giá trị đã lưu. */
  const val = (k, def) => (Object.prototype.hasOwnProperty.call(S.vals, k) ? S.vals[k] : def == null ? '' : def);
  /** Bên xanh mặc định: ván 1 đội hạt giống cao; các ván sau đội vừa thua ván trước được chọn bên (thường chọn xanh). */
  function defaultBlue(m, i) {
    if (m.tbSide && i === 0) return m.tbSide; // trận phụ: đội có tổng thời gian thắng thấp hơn được chọn bên
    const prev = (m.sets || [])[i - 1];
    if (i > 0 && prev && prev[0] !== prev[1]) return prev[0] > prev[1] ? 'b' : 'a';
    return (m.b.seed || 999) < (m.a.seed || 999) ? 'b' : 'a';
  }
  function editor(t, m, i) {
    const cfg = t.esports, g = (m.esp || [])[i] || {};
    const prior = DR.priorPicks(m, i, cfg);
    const blue = val('blue', g.blue || defaultBlue(m, i));
    const lockList = (who) => [...DR.locked(prior, who, cfg).values()].map(({ c, n }) => (n ? T('esp_locked_g', { c, n }) : T('esp_locked_s', { c })));
    const lockA = lockList('a'), lockB = lockList('b');
    const locks = cfg.fearless === 'hard' ? lockA : null;
    const steps = DR.script(cfg), idx = { blue: { ban: 0, pick: 0 }, red: { ban: 0, pick: 0 } };
    // Mỗi ô ghi số bước chung (1–20) để nhập đúng thứ tự cấm chọn xen kẽ giữa hai bên
    const draft = steps.map(([kind, side], j) => {
      const n = idx[side][kind]++;
      const k = `dr.${side}.${kind}.${n}`;
      const cur = (g.draft && g.draft[side][kind === 'ban' ? 'bans' : 'picks'][n]) || '';
      return `<label class="dr-step ${esc(side)} ${esc(kind)}"><small class="dr-no">${j + 1}</small><span class="muted">${esc(T(kind === 'ban' ? 'esp_ban_n' : 'esp_pick_n', { n: n + 1 }))}</span><input data-gk="${k}" list="ot-champs" maxlength="30" value="${esc(val(k, cur))}"></label>`;
    });
    const half = (side) => draft.filter((_, j) => steps[j][1] === side).join('');
    const stats = cfg.stats.map((k) => `<tr><td>${esc(statLabel(k))}</td>${SIDES.map((side) => `<td><input type="number" min="0" inputmode="numeric" data-gk="st.${side}.${esc(k)}" value="${esc(val(`st.${side}.${k}`, g.st && g.st[side][k] != null ? g.st[side][k] : ''))}"></td>`).join('')}</tr>`).join('');
    const pl = cfg.players ? SIDES.map((side) => `<div class="esp-pl-in ${esc(side)}"><b>${esc(sideLabel(cfg, side))}</b>${Array.from({ length: 5 }, (_, j) => {
      const p = (g.players && g.players[side] && g.players[side][j]) || {};
      const inp = (f, w, type) => `<input data-gk="pl.${side}.${j}.${f}" ${type ? `type="number" min="0" inputmode="numeric"` : 'maxlength="40"'} ${f === 'c' ? 'list="ot-champs"' : ''} placeholder="${esc(w)}" value="${esc(val(`pl.${side}.${j}.${f}`, p[f] != null ? p[f] : ''))}">`;
      return `<div class="pl-row">${inp('n', T('esp_pl_name'))}${inp('c', T('esp_pl_champ'))}${inp('k', 'K', 1)}${inp('d', 'D', 1)}${inp('a', 'A', 1)}</div>`;
    }).join('')}</div>`).join('') : '';
    const goldText = val('gold', (g.gold || []).map((r) => r.join(' ')).join('\n'));
    const lockHtml = (list, who) => (list.length ? `<p class="hint esp-lock">${esc((who ? teamName(m, who) + ' – ' : '') + T('esp_locked', { list: list.join(', ') }))}</p>` : '');
    return `<div class="esp-edit" id="otg-edit"><b>${esc(gameN(t.esports, i))}</b>
      <p class="hint">${esc(T(m.tbSide && i === 0 ? 'esp_side_tb' : 'esp_side_choice', { name: teamName(m, defaultBlue(m, i)) }))}</p>
      <div class="row"><label class="field inline"><span>${esc(T(cfg.sides === 'ps' ? 'esp_side_pick_ps' : 'esp_side_pick'))}</span><select data-gk="blue">${['a', 'b'].map((w) => `<option value="${w}" ${blue === w ? 'selected' : ''}>${esc(teamName(m, w))}</option>`).join('')}</select></label>
        <label class="field inline"><span>${esc(T('esp_dur'))}</span><input data-gk="dur" placeholder="32:15" maxlength="7" value="${esc(val('dur', g.dur ? DR.fmtDur(g.dur) : ''))}"></label></div>
      ${steps.length ? `${locks ? lockHtml(locks) : lockHtml(lockA, 'a') + lockHtml(lockB, 'b')}<div class="esp-dr-in">${SIDES.map((side) => `<div class="${esc(side)}"><b>${esc(sideLabel(cfg, side))}</b>${half(side)}</div>`).join('')}</div>` : ''}
      ${stats ? `<table class="stand esp-st"><thead><tr><th>${esc(T('esp_stats_team'))}</th><th>${esc(sideLabel(cfg, 'blue'))}</th><th>${esc(sideLabel(cfg, 'red'))}</th></tr></thead><tbody>${stats}</tbody></table>` : ''}
      <label class="field inline"><span>${esc(T('esp_mvp'))}</span><input data-gk="mvp" maxlength="40" value="${esc(val('mvp', g.mvp || ''))}"></label>
      ${pl ? `<div class="field"><span>${esc(T('esp_players'))}</span><div class="esp-pls">${pl}</div></div>` : ''}
      ${cfg.sides === 'ps' ? '' : `<label class="field"><span>${esc(T('esp_gold'))}</span><textarea data-gk="gold" rows="4" placeholder="5 8100 7900&#10;10 17200 16400">${esc(goldText)}</textarea><small class="hint">${esc(T('esp_gold_hint'))}</small></label>
      <div id="otg-gold-prev">${(() => { const p = DR.parseGold(goldText); return p.gold ? goldSvg(p.gold) : ''; })()}</div>`}
      <p class="err" id="otg-err">${esc(S.err)}</p>
      <div class="row"><button type="button" class="primary sm" data-act="otGameSave">${esc(T('esp_save'))}</button>
        ${g.blue ? `<button type="button" class="ghost sm danger" data-act="otGameDel">${esc(T('esp_del'))}</button>` : ''}
        <button type="button" class="ghost sm" data-act="otGameClose">${esc(T('esp_close'))}</button></div></div>`;
  }

  /** Đọc các ô của khung sửa thành chi tiết ván (đúng hình dạng máy chủ nhận). Lỗi → { error }. */
  function readGame(t) {
    const box = $('otg-edit');
    const dom = new Map(box ? [...box.querySelectorAll('[data-gk]')].map((e) => [e.dataset.gk, e.value]) : []);
    const cfg = t.esports, v = (k) => (Object.prototype.hasOwnProperty.call(S.vals, k) ? S.vals[k] : dom.get(k) || '');
    const g = { blue: v('blue') || 'a' };
    const dur = String(v('dur')).trim();
    if (dur) { const d = DR.parseDur(dur); if (d == null) return { error: T('srv_ot_g_dur') }; g.dur = d; }
    const cnt = DR.counts(cfg);
    if (DR.script(cfg).length) {
      g.draft = {};
      for (const side of SIDES) {
        g.draft[side] = {
          bans: Array.from({ length: cnt[side].ban }, (_, n) => String(v(`dr.${side}.ban.${n}`)).trim()),
          picks: Array.from({ length: cnt[side].pick }, (_, n) => String(v(`dr.${side}.pick.${n}`)).trim()),
        };
      }
    }
    g.st = { blue: {}, red: {} };
    for (const side of SIDES) for (const k of cfg.stats) g.st[side][k] = v(`st.${side}.${k}`);
    g.mvp = String(v('mvp')).trim();
    if (cfg.players) {
      g.players = {};
      for (const side of SIDES) g.players[side] = Array.from({ length: 5 }, (_, j) => ({ n: v(`pl.${side}.${j}.n`), c: v(`pl.${side}.${j}.c`), k: v(`pl.${side}.${j}.k`), d: v(`pl.${side}.${j}.d`), a: v(`pl.${side}.${j}.a`) }));
    }
    const p = DR.parseGold(v('gold'));
    if (p.error) return { error: T('esp_gold_bad', { n: p.error }) };
    if (p.gold.length) g.gold = p.gold;
    return { game: g };
  }

  K.otGamesHtml = (t, m, v) => {
    if (!t.esports || !m || !m.a || !m.a.uid || !m.b || !m.b.uid) return '';
    const bo = m.bo || (v && v.cfg && v.cfg.bestOf) || 1;
    const games = m.esp || [];
    if (!t.canManage && !games.some(Boolean)) return ''; // người xem: chỉ hiện khi đã có chi tiết ván
    const editing = S.mid === m.id && S.i >= 0;
    // Số ván hiện: loạt đã xong → số ván đã đấu; đang đấu → các ván đã nhập (ít nhất 1) + ván đang sửa
    const played = m.done && m.sets ? m.sets.length : Math.max(games.length, (m.sets || []).length, 1);
    const n = Math.min(Math.max(bo, played), Math.max(played, games.length, editing ? S.i + 1 : 0));
    const rows = [];
    for (let i = 0; i < n; i++) {
      const g = games[i];
      if (editing && S.i === i) { rows.push(editor(t, m, i)); continue; }
      rows.push(g ? gameView(t, m, g, i) : `<div class="esp-game empty"><b>${esc(gameN(t.esports, i))}</b> <span class="muted">${esc(T('esp_none'))}</span></div>`);
      if (t.canManage && !editing) rows.push(`<button type="button" class="ghost sm" data-act="otGameEdit" data-mid="${esc(m.id)}" data-i="${i}">${esc(T(g ? 'esp_fix' : 'esp_edit'))} · ${esc(gameN(t.esports, i))}</button>`);
    }
    // Ván kế tiếp của loạt đang đấu dở (nhập trực tiếp từng ván)
    if (t.canManage && !editing && !m.done && n < bo) rows.push(`<button type="button" class="ghost sm" data-act="otGameEdit" data-mid="${esc(m.id)}" data-i="${n}">${esc(T('esp_edit'))} · ${esc(gameN(t.esports, n))}</button>`);
    return `<section class="esp-games"><h6>${esc(T(t.esports.sides === 'ps' ? 'esp_title_ps' : 'esp_title'))}</h6>${rows.join('')}${champList(t)}</section>`;
  };

  /** Gợi ý tướng: danh sách ban tổ chức dán + tên đã dùng trong giải. */
  function champList(t) {
    const names = new Set([...(t.esports.pool || []), ...((t.esp && t.esp.champs) || []).map((x) => x.c)]);
    return `<datalist id="ot-champs">${[...names].map((c) => `<option value="${esc(c)}">`).join('')}</datalist>`;
  }

  // ------------------------------------------------------------ Thống kê
  K.otEspStatsHtml = (t) => {
    const s = t.esp;
    if (!s || !s.games) return '';
    const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
    const rows = s.champs.slice(0, 60).map((x) => `<tr><td class="nm">${esc(x.c)}</td><td>${x.pick}</td><td>${x.ban}</td><td>${pct(x.pick + x.ban, s.games)}%</td><td>${x.pick ? pct(x.win, x.pick) + '%' : '–'}</td></tr>`).join('');
    return `<section class="ot-sec esp-stats"><h4>${esc(T('esp_st_title'))}</h4>
      <p class="hint">${esc(T(t.esports && t.esports.sides === 'ps' ? 'esp_sum_ps' : 'esp_sum', { g: s.games, d: s.avgDur ? DR.fmtDur(s.avgDur) : '–', b: pct(s.blueWins, s.decided) }))}</p>
      ${rows ? `<div class="tscroll"><table class="stand"><thead><tr><th>${esc(T('esp_col_champ'))}</th><th>${esc(T('esp_col_pick'))}</th><th>${esc(T('esp_col_ban'))}</th><th>${esc(T('esp_col_pres'))}</th><th>${esc(T('esp_col_win'))}</th></tr></thead><tbody>${rows}</tbody></table></div>` : ''}
      ${s.mvp.length ? `<h5>${esc(T('esp_mvp_top'))}</h5><ol>${s.mvp.slice(0, 10).map((x) => `<li>${esc(x.who)} <b>×${x.n}</b></li>`).join('')}</ol>` : ''}</section>`;
  };

  // ------------------------------------------------------------ Cấu hình (tab Khác)
  K.otEspCfgHtml = (t) => {
    if (!t.canManage || !DR.SPORTS.includes(t.sport)) return '';
    const c = t.esports;
    const body = () => {
      if (!c) return `<button type="button" class="ghost sm" data-act="otEspOn">${esc(T('esp_cfg_on'))}</button>`;
      const sel = (name, opts, cur) => `<select name="${name}">${opts.map(([v, l]) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
      const custom = c.stats.filter((k) => !DR.STATS.includes(k));
      return `<form id="otesp" class="tform">
        <label class="field inline"><span>${esc(T('esp_draft'))}</span>${sel('draft', [['lol', T('esp_dr_lol')], ['custom', T('esp_dr_custom')], ['off', T('esp_dr_off')]], c.draft)}</label>
        <div class="row"><label class="field inline"><span>${esc(T('esp_bans'))}</span><input type="number" name="bans" min="0" max="10" value="${c.bans}"></label>
          <label class="field inline"><span>${esc(T('esp_picks'))}</span><input type="number" name="picks" min="1" max="10" value="${c.picks}"></label></div>
        <label class="field inline"><span>${esc(T('esp_sides'))}</span>${sel('sides', [['br', T('esp_blue') + ' / ' + T('esp_red')], ['ps', T('esp_port') + ' / ' + T('esp_stbd')]], c.sides)}</label>
        <label class="field inline"><span>${esc(T('esp_fearless'))}</span>${sel('fearless', [['hard', T('esp_fl_hard_s')], ['soft', T('esp_fl_soft_s')], ['off', T('esp_fl_off')]], c.fearless)}<small class="hint">${esc(T('esp_fl_hard'))}<br>${esc(T('esp_fl_soft'))}</small></label>
        <label class="field inline"><span>${esc(T('esp_scope'))}</span>${sel('scope', [['series', T('esp_sc_series')], ['stage', T('esp_sc_stage')]], c.scope)}</label>
        <div class="field"><span>${esc(T('esp_cfg_stats'))}</span><div class="chips">${DR.STATS.map((k) => `<label class="chip"><input type="checkbox" name="stat" value="${k}" ${c.stats.includes(k) ? 'checked' : ''}><span>${esc(T('esp_st_' + k))}</span></label>`).join('')}</div></div>
        <label class="field"><span>${esc(T('esp_cfg_custom'))}</span><input name="custom" maxlength="200" value="${esc(custom.join(', '))}"></label>
        <label class="check"><input type="checkbox" name="players" ${c.players ? 'checked' : ''}> <span>${esc(T('esp_cfg_players'))}</span></label>
        <label class="field"><span>${esc(T('esp_pool'))}</span><textarea name="pool" rows="4">${esc(c.pool.join('\n'))}</textarea><small class="hint">${esc(T('esp_pool_hint'))}</small></label>
        <button type="button" class="primary sm" data-act="otEspSave">${esc(T('esp_cfg_save'))}</button></form>`;
    };
    return K.fold('ot:' + t.id + ':esp', `<b>${esc(T('esp_cfg'))}</b>`, body, !c);
  };

  // ------------------------------------------------------------ Hành động
  K.acts.otGameEdit = (b) => { Object.assign(S, { mid: b.dataset.mid, i: Number(b.dataset.i), vals: {}, err: '' }); render(true); };
  K.acts.otGameClose = () => { Object.assign(S, { mid: null, i: -1, vals: {}, err: '' }); render(true); };
  K.acts.otGameSave = () => {
    const t = D.ot, r = readGame(t);
    const fail = (msg) => { S.err = msg; const e = $('otg-err'); if (e) e.textContent = msg; };
    if (r.error) return fail(r.error);
    // Kiểm trước như máy chủ (trùng tướng, Fearless trong loạt, đủ chỉ số đội)
    const m = K.otFindMatch ? K.otFindMatch(t, S.mid) : null;
    if (m) {
      const c = DR.cleanGame(r.game, t.esports, DR.priorPicks(m, S.i, t.esports));
      if (c.code) return fail(T('srv_' + c.code, { ...(c.args || {}), ...(c.args && c.args.k ? { k: statLabel(c.args.k) } : {}) }));
    }
    Object.assign(S, { err: '', saving: r.game.blue });
    O.send({ t: 'otGame', id: t.id, match: S.mid, i: S.i, game: r.game });
  };
  K.acts.otGameDel = () => window.CaroConfirm.ask(T('esp_del_confirm', { n: S.i + 1 })).then((ok) => {
    if (ok) { O.send({ t: 'otGameDel', id: D.ot.id, match: S.mid, i: S.i }); Object.assign(S, { mid: null, i: -1, vals: {}, err: '' }); }
  });
  K.acts.otEspOn = () => O.send({ t: 'otEspCfg', id: D.ot.id, esports: DR.defaults(D.ot.sport) });
  K.acts.otEspSave = () => {
    const f = $('otesp');
    if (!f) return;
    const stats = [...f.querySelectorAll('input[name=stat]:checked')].map((x) => x.value).concat(String(f.elements.custom.value).split(',').map((x) => x.trim()).filter(Boolean));
    O.send({ t: 'otEspCfg', id: D.ot.id, esports: { draft: f.elements.draft.value, bans: f.elements.bans.value, picks: f.elements.picks.value, fearless: f.elements.fearless.value,
      scope: f.elements.scope.value, sides: f.elements.sides.value, stats, players: f.elements.players.checked, pool: f.elements.pool.value } });
    window.CaroConfirm.info(T('esp_cfg_saved'));
  };

  // Ghi nhớ giá trị đang gõ (trang vẽ lại khi có cập nhật từ máy chủ thì không mất chữ)
  K.binders.push(() => {
    const box = $('otg-edit');
    if (!box) return;
    box.addEventListener('input', (e) => {
      const k = e.target.dataset && e.target.dataset.gk;
      if (!k) return;
      S.vals[k] = e.target.value;
      // Xem trước biểu đồ vàng ngay khi gõ (không vẽ lại cả trang: mất cú bấm nút đang diễn ra)
      if (k === 'gold') { const p = DR.parseGold(e.target.value), box2 = $('otg-gold-prev'); if (box2) box2.innerHTML = p.gold ? goldSvg(p.gold) : ''; }
    });
    box.addEventListener('change', (e) => { const k = e.target.dataset && e.target.dataset.gk; if (k) S.vals[k] = e.target.value; });
  });
  // Lưu xong (ván đã có trong bản cập nhật, khớp bên xanh vừa gửi): đóng khung sửa
  O.on('otPatch', () => {
    if (S.mid === null || !D.ot) return;
    const m = K.otFindMatch ? K.otFindMatch(D.ot, S.mid) : null;
    const g = m && m.esp && m.esp[S.i];
    if (g && S.saving && g.blue === S.saving) { Object.assign(S, { mid: null, i: -1, vals: {}, err: '', saving: null }); render(true); }
  });
  O.on('error', (m) => {
    if (m.ctx !== 'otGame') return;
    S.saving = null;
    S.err = T('srv_' + m.code, { ...(m.args || {}), ...(m.args && m.args.k ? { k: statLabel(m.args.k) } : {}) });
    if ($('otg-err')) $('otg-err').textContent = S.err;
  });
})();
