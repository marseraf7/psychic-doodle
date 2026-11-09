/*
 * Giải đấu Offline – giải của mọi bộ môn (docs/de-xuat-giai-offline.md), tách khỏi giải Caro nhưng dùng chung khung trang
 * giải (CaroTourKit – tour.js) và cách vẽ nhánh / bảng (tour-stages.js). Máy chủ: server/src/hub/otour*.js.
 *   Trang 'otours'  – danh sách: giải của tôi + giải công khai gần đây (khách xem được).
 *   Trang 'otNew'   – tạo giải: mẫu giải nổi tiếng (otour-tpl.js), tên, link riêng, mô tả có định dạng, ai xem được, bộ môn (điểm / tie-break / kiểu kết quả
 *                     tự điền theo môn – otour-sports.js), luật set (kiểu điểm từng set), thể thức (trình sửa giai đoạn
 *                     của giải Caro), danh sách đội.
 *   Trang 'ot'      – trang giải: đội (thêm / xoá trước khi bắt đầu), bắt đầu, nhánh / bảng, nhập kết quả (otour-score.js).
 * Link mở thẳng: …/?o=<mã hoặc link riêng>.
 */
(function () {
  'use strict';
  const K = window.CaroTourKit;
  const SP = window.CaroOTourSports;
  if (!K || !SP) return;
  const { O, T, esc, $, D, V, me, setTitle, open, icon, render, when } = K;
  const R = window.CaroRich;
  const SE = K.stageEdit;
  const F = { d: null, stages: null };

  // ------------------------------------------------------------ Danh sách
  const item = (x) => `<li><button type="button" class="titem" data-act="ot" data-id="${esc(x.id)}">
    <span class="ticon">${icon('trophy')}</span>
    <span class="pn"><b>${esc(x.name)}</b><small>${esc(T('ot_by', { name: x.owner }))} · ${esc(when(x.updated))}</small></span>
    <span class="tags"><span class="pill ${esc(x.status)}">${esc(T('ot_st_' + x.status))}</span>${x.access !== 'public' ? `<span class="pill">${esc(T('ot_acc_' + x.access))}</span>` : ''}</span></button></li>`;
  function pageList() {
    setTitle('ot_title', null, 'trophy');
    const L = D.otList;
    let html = `<p class="hint">${esc(T('ot_intro'))}</p><div class="row"><button type="button" class="primary" data-act="otNew" ${me() ? '' : 'disabled'}>${icon('plus')}${esc(T('ot_create'))}</button></div>`;
    if (!me()) html += `<p class="hint">${esc(T('ot_login_hint'))}</p>`;
    if (!L) return html + '<p class="hint">…</p>';
    if (L.mine.length) html += `<h4>${esc(T('ot_mine'))}</h4><ul class="tlist">${L.mine.map(item).join('')}</ul>`;
    html += `<h4>${esc(T('ot_recent'))}</h4>` + (L.recent.length ? `<ul class="tlist">${L.recent.map(item).join('')}</ul>` : `<p class="hint">${esc(T('ot_none'))}</p>`);
    return html;
  }

  // ------------------------------------------------------------ Tạo giải
  const PRESETS = {
    single: () => [SE.DEFAULT.single()], double: () => [SE.DEFAULT.double()], roundrobin: () => [SE.DEFAULT.roundrobin()],
    swiss: () => [SE.DEFAULT.swiss()], groups_single: () => [{ ...SE.DEFAULT.roundrobin(), groups: 4 }, SE.DEFAULT.single()],
    swiss_single: () => [{ ...SE.DEFAULT.swiss(), advance: 8 }, { ...SE.DEFAULT.single(), thirdPlace: false }],
    // Hệ Race: một chặng (thứ hạng → điểm), Grand Prix nhiều chặng có bảng đội, Time Trial (thời gian)
    race_single: () => [SE.DEFAULT.race()], grand_prix: () => [{ ...SE.DEFAULT.race(), events: 10, teams: true }],
    time_trial: () => [{ ...SE.DEFAULT.race(), score: 'time' }],
  };
  /** Điểm / tie-break / Bo theo bộ môn cho mọi giai đoạn (đổi môn hoặc đổi thể thức). */
  function applySport(stages, sport) {
    const s = SP.SPORTS[sport] || SP.SPORTS.other;
    for (const c of stages) {
      c.bestOf = s.bestOf;
      // Bỏ điểm thắng / thua sát của môn cũ (bóng chuyền → bóng đá không còn 3–2 = 2 điểm)
      if (c.points) { const { wx, lx, ...rest } = c.points; c.points = { ...rest, ...s.points }; c.tiebreaks = [...s.tiebreaks]; }
    }
    return stages;
  }
  /** Luật set mặc định của môn (môn không có luật: 21 điểm cách 2 khi người dùng tự bật). */
  const sportSet = (sport) => { const r = (SP.SPORTS[sport] || SP.SPORTS.other).set; return r ? { ...r } : null; };
  /** Phần "Luật set" (chỉ kiểu điểm từng set): bật / tắt kiểm luật, điểm thắng set, cách, trần, set quyết định. */
  function setHtml() {
    if (F.d.result !== 'sets') return '';
    const r = F.d.set;
    const num = (k, v, min, max) => `<label class="field inline"><span>${esc(T('ot_setf_' + k))}</span><input type="number" name="set_${k}" value="${v}" min="${min}" max="${max}"></label>`;
    return `<fieldset class="ot-set"><legend>${esc(T('ot_set_legend'))}</legend>
      <label class="check"><input type="checkbox" name="setOn" ${r ? 'checked' : ''}> <span>${esc(T('ot_set_on'))}</span></label>
      ${r ? `${num('to', r.to, 1, 99)}${num('by', r.by, 1, 10)}${num('cap', r.cap || 0, 0, 199)}${num('last', r.last || 0, 0, 99)}<small class="hint">${esc(T('ot_set_hint'))}</small>` : `<small class="hint">${esc(T('ot_set_off_hint'))}</small>`}</fieldset>`;
  }
  function begin() {
    F.d = { name: '', slug: K.slugKit ? K.slugKit.rand() : '', desc: '', access: 'public', sport: 'football', result: SP.SPORTS.football.result, set: null, preset: 'groups_single', teams: '', tpl: null };
    F.stages = applySport(PRESETS.groups_single(), 'football');
  }
  function pageNew() {
    setTitle('ot_create', null, 'plus');
    if (!me()) return K.needLogin();
    if (!F.d) begin();
    const d = F.d;
    const opt = (v, cur, label) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(label)}</option>`;
    const n = d.teams.split('\n').filter((x) => x.trim()).length;
    return `<form id="otf" class="tform">
      ${K.otAiHtml ? K.otAiHtml() : ''}
      ${K.otTplHtml ? K.otTplHtml(d) : ''}
      <label class="field"><span>${esc(T('tour_name'))}</span><input name="name" maxlength="60" required value="${esc(d.name)}"></label>
      ${K.slugKit ? K.slugKit.field(d.slug, 'o') : ''}
      <div class="field"><span>${esc(T('tour_desc'))}</span>${R ? R.editor('desc', d.desc, { rows: 4, max: 4000 }) : `<textarea name="desc" rows="3" maxlength="4000">${esc(d.desc)}</textarea>`}</div>
      <label class="field"><span>${esc(T('ot_sport'))}</span><select name="sport">${Object.keys(SP.SPORTS).map((k) => opt(k, d.sport, SP.SPORTS[k].icon + ' ' + T('sport_' + k))).join('')}</select></label>
      <label class="field"><span>${esc(T('ot_result'))}</span><select name="result">${SP.RESULTS.map((k) => opt(k, d.result, T('otres_' + k))).join('')}</select></label>
      <div id="otf-set">${setHtml()}</div>
      <label class="field"><span>${esc(T('format'))}</span><select name="preset">${[...Object.keys(PRESETS), 'custom'].map((k) => opt(k, d.preset, T('fmt_' + k))).join('')}</select></label>
      <div id="otf-stages">${SE.html(F.stages, true, { max: Math.max(n, 4), n, ext: true, result: F.d.result })}</div>
      <p class="est" id="otf-est"></p>
      <div class="ot-desc" id="otf-desc"></div>
      <label class="field"><span>${esc(T('ot_teams'))} <b id="otf-n">${n}</b></span><textarea name="teams" rows="6" placeholder="${esc(T('ot_teams_ph'))}">${esc(d.teams)}</textarea><small class="hint">${esc(T('ot_teams_hint'))}</small></label>
      <fieldset><legend>${esc(T('ot_access'))}</legend><div class="seg">${['public', 'link', 'private'].map((k) => `<label><input type="radio" name="access" value="${k}" ${d.access === k ? 'checked' : ''}> <span>${esc(T('ot_acc_' + k))}</span></label>`).join('')}</div></fieldset>
      <p class="hint">${esc(T('ot_quota_hint'))}</p>
      <p class="err" id="otf-err"></p>
      <button class="primary wide">${esc(T('ot_create'))}</button></form>`;
  }
  /** Đọc form vào bản nháp. */
  function collect(f) {
    for (const k of ['name', 'slug', 'desc', 'sport', 'result', 'preset', 'teams']) if (f.elements[k]) F.d[k] = f.elements[k].value;
    F.d.access = (f.querySelector('input[name=access]:checked') || {}).value || 'public';
    // Luật set: đọc các ô khi đang bật (bật / tắt xử lý ở sự kiện change)
    if (F.d.set && f.elements.set_to) {
      const v = (k) => Math.floor(Number(f.elements['set_' + k].value)) || 0;
      F.d.set = { to: v('to'), by: v('by'), cap: v('cap'), last: v('last') };
    }
  }
  function showEst(f) {
    if (K.otDescribe) K.otDescribe(F); // xem trước bằng lời (otour-tpl.js)
    const n = F.d.teams.split('\n').filter((x) => x.trim()).length;
    $('otf-n').textContent = n;
    const el = $('otf-est');
    if (!el || n < 2 || !window.CaroTourEstimate) { if (el) el.textContent = ''; return; }
    const e = window.CaroTourEstimate.estimate({ stages: F.stages, players: n, timeLimit: 20 });
    el.textContent = T('ot_est', { m: e.maxMatches > e.matches ? `${e.matches}–${e.maxMatches}` : e.matches, w: e.waves, n });
  }
  function bindNew() {
    const f = $('otf');
    if (!f) return;
    const box = $('otf-stages');
    const draw = () => { const n = F.d.teams.split('\n').filter((x) => x.trim()).length; box.innerHTML = SE.html(F.stages, true, { max: Math.max(4, n), n, ext: true, result: F.d.result }); showEst(f); };
    const drawSet = () => { $('otf-set').innerHTML = setHtml(); };
    f.addEventListener('input', () => { collect(f); showEst(f); });
    f.addEventListener('change', (e) => {
      if (e.target.closest('#otf-stages')) return;
      collect(f);
      // Đổi môn / mẫu thể thức: không còn theo mẫu giải nổi tiếng đã chọn (otour-tpl.js) – bỏ đánh dấu mẫu
      if (F.d.tpl && (e.target.name === 'sport' || e.target.name === 'preset')) { F.d.tpl = null; setTimeout(() => render(true), 0); }
      if (e.target.name === 'sport') {
        F.d.result = (SP.SPORTS[F.d.sport] || SP.SPORTS.other).result; f.elements.result.value = F.d.result;
        F.d.set = sportSet(F.d.sport);
        F.d.esports = null; // cấu hình chi tiết ván theo môn mới (mặc định của môn khi tạo)
        // Môn có mẫu thể thức riêng (đua xe → Grand Prix, chạy / bơi → Time Trial); rời môn đua thì về mẫu mặc định
        const sp = SP.SPORTS[F.d.sport] || SP.SPORTS.other;
        const racing = (F.stages || []).some((c) => c.type === 'race');
        if (sp.preset || racing) { F.d.preset = sp.preset || 'groups_single'; f.elements.preset.value = F.d.preset; F.stages = PRESETS[F.d.preset](); }
        applySport(F.stages, F.d.sport); draw(); drawSet();
      }
      if (e.target.name === 'result') { if (F.d.result === 'sets' && !F.d.set) F.d.set = sportSet(F.d.sport); drawSet(); draw(); }
      if (e.target.name === 'setOn') { F.d.set = e.target.checked ? sportSet(F.d.sport) || { to: 21, by: 2, cap: 0, last: 0 } : null; drawSet(); }
      if (e.target.name === 'preset' && PRESETS[F.d.preset]) { F.stages = applySport(PRESETS[F.d.preset](), F.d.sport); draw(); }
      // Đổi danh sách đội (bắn khi ô mất focus): người dùng đang bấm sang một ô của giai đoạn thì không vẽ lại khung
      // giai đoạn (ô vừa bấm sẽ bị thay mới, mất chữ đang gõ) – chỉ cập nhật ước tính
      if (e.target.name === 'teams') setTimeout(() => { if (box.contains(document.activeElement)) showEst(f); else draw(); }, 0);
    });
    box.addEventListener('change', (e) => { if (SE.change(F.stages, e.target)) { F.d.preset = 'custom'; f.elements.preset.value = 'custom'; draw(); } });
    box.addEventListener('click', (e) => { const b = e.target.closest('[data-sact]'); if (b && SE.click(F.stages, b)) { F.d.preset = 'custom'; f.elements.preset.value = 'custom'; draw(); } });
    f.onsubmit = (e) => {
      e.preventDefault();
      collect(f);
      const teams = F.d.teams.split('\n').map((x) => x.trim()).filter(Boolean);
      if (F.d.name.trim().length < 3) { $('otf-err').textContent = T('srv_tour_name_short'); return; }
      O.send({ t: 'otCreate', name: F.d.name.trim(), slug: F.d.slug.trim().toLowerCase(), desc: F.d.desc, access: F.d.access,
        spec: { sport: F.d.sport, result: F.d.result, ...(F.d.result === 'sets' ? { set: F.d.set } : {}), stages: F.stages, ...(window.CaroOTourDraft && window.CaroOTourDraft.SPORTS.includes(F.d.sport) ? { esports: F.d.esports || window.CaroOTourDraft.defaults(F.d.sport) } : {}) }, teams });
    };
    showEst(f);
  }
  // Cho thư viện mẫu giải (otour-tpl.js): đọc / sửa bản nháp form
  K.otForm = { F, collect: () => { const f = $('otf'); if (f) collect(f); }, applySport, sportSet };

  // ------------------------------------------------------------ Trang giải
  // ------------------------------------------------------------ Trang giải: các tab (kiểu Challonge / MyLeague)
  const TABS = ['overview', 'stages', 'sched', 'stats', 'teams', 'more'];
  const TAB = { id: null, tab: null, auto: true };
  /**
   * Tab đang xem: mặc định giải chưa bắt đầu / đã kết thúc → Tổng quan, đang diễn ra → Nhánh đấu & bảng. Tab tự chọn
   * (chưa bấm) thì đổi theo trạng thái giải; người xem đã bấm tab thì giữ.
   */
  const tabOf = (t) => {
    if (TAB.id !== t.id || !TABS.includes(TAB.tab)) Object.assign(TAB, { id: t.id, auto: true });
    if (TAB.auto) TAB.tab = t.status === 'running' ? 'stages' : 'overview'; // kết thúc: Tổng quan (bục trao giải)
    return TAB.tab;
  };
  const hint = (k) => `<p class="hint">${esc(T(k))}</p>`;
  const L = () => K.otLeague || {};
  function teamsTab(t) {
    let html = '';
    if (t.canManage && t.status === 'draft') {
      html += `<section class="ot-sec mg-sec"><h4>${esc(T('ot_teams'))} (${t.players.length})</h4><ol class="ot-teams">${t.players.map((p) => `<li>${esc(p.name)} <button type="button" class="ghost sm icon" data-act="otTeamDel" data-uid="${esc(p.uid)}" aria-label="${esc(T('ot_team_del'))}">${icon('close')}</button></li>`).join('')}</ol>
        <textarea id="ot-add" rows="3" placeholder="${esc(T('ot_teams_ph'))}"></textarea><button type="button" class="ghost sm" data-act="otTeamsAdd">${icon('plus')}${esc(T('ot_add_teams'))}</button></section>`;
    } else {
      html += `<section class="ot-sec"><h4>${esc(T('ot_teams'))} (${t.players.length})</h4><ol class="ot-teams">${t.players.map((p) => `<li>${esc(p.name)}${p.country ? ` <small class="muted">${esc(p.country)}</small>` : ''}${p.team ? ` <small class="muted">· ${esc(p.team)}</small>` : ''}</li>`).join('')}</ol></section>`;
    }
    return html + (L().rosters ? L().rosters(t) : '');
  }
  const TAB_BODY = {
    overview: (t) => {
      const sp = SP.SPORTS[t.sport] || SP.SPORTS.other;
      let html = `<div class="thead"><span class="pill ${esc(t.status)}">${esc(T('ot_st_' + t.status))}</span> <span class="muted">${esc(sp.icon + ' ' + T('sport_' + t.sport))} · ${esc(T('ot_n_teams', { n: t.players.length }))} · ${esc(T('ot_by', { name: t.owner }))}</span></div>`;
      if (t.podium && t.podium.length && t.status === 'finished') {
        html += `<div class="podium">${t.podium.map((p, i) => `<div class="pl p${i + 1}"><span>${icon('medal', 'm' + (i + 1))}</span><b>${esc(p.name)}</b></div>`).join('')}</div>`;
      }
      if (t.desc) html += `<div class="tdesc rich">${R ? R.render(t.desc) : esc(t.desc)}</div>`;
      const acts = [`<button type="button" class="ghost" data-act="otShare">${icon('link')}${esc(T('share'))}</button>`];
      if (t.canManage && t.status === 'draft') acts.push(`<button type="button" class="primary" data-act="otStart" ${t.players.length < 2 ? 'disabled' : ''}>${icon('play')}${esc(T('ot_start'))}</button>`);
      if (t.canManage) acts.push(`<button type="button" class="ghost danger" data-act="otDelete">${icon('trash')}${esc(T('ot_delete'))}</button>`);
      html += `<div class="row tactions">${acts.join('')}</div>`;
      if (K.otShareHtml) html += K.otShareHtml(t); // ảnh chia sẻ (otour-share.js)
      if (L().reg) html += L().reg(t);
      // Cấu hình thể thức (trước khi bắt đầu) – bằng lời
      if (window.CaroOTourSpecIO) html += `<section class="ot-sec ot-desc"><h4>${esc(T('ot_desc_title'))}</h4><ul>${window.CaroOTourSpecIO.describeSpec(t, T).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></section>`;
      return html;
    },
    stages: (t) => (K.otScoreHtml ? K.otScoreHtml(t) : '') + K.stagesHtml(t), // khung nhập kết quả (otour-score.js) + nhánh / bảng
    sched: (t) => { schedNeedAll(t); return (K.otScoreHtml ? K.otScoreHtml(t) : '') + ((K.otSchedUi ? K.otSchedUi.html(t) : L().sched && L().sched(t)) || hint(t.canManage ? 'ot_sched_none_m' : 'ot_sched_none')); },
    stats: (t) => (((K.otEspStatsHtml && K.otEspStatsHtml(t)) || (L().stats && L().stats(t)) || hint('ot_stats_none')) + (K.otDiscHtml ? K.otDiscHtml(t) : '')), // esports / cầu thủ + treo giò (otour-disc.js)
    teams: teamsTab,
    // Cấu hình esports (otour-games-ui.js), xuất file, nhúng vào website (tour-embed.js), nhật ký
    more: (t) => (K.otEspCfgHtml ? K.otEspCfgHtml(t) : '') + (K.otExportHtml ? K.otExportHtml(t) : '') + (K.embedHtml && t.status !== 'draft' ? K.embedHtml(t) : '')
      + (t.log && t.log.length ? `<section class="ot-sec"><h4>${esc(T('mg_log'))}</h4><ul class="ot-log">${t.log.map((x) => `<li><small class="muted">${esc(when(x.at))}${x.by ? ' · ' + esc(x.by) : ''}</small> ${esc(T('otlog_' + x.act, x))}</li>`).join('')}</ul></section>` : ''),
  };
  function pageView() {
    const t = D.ot;
    if (!t || t.id !== V.id) { setTitle('ot_title'); return '<p class="hint">…</p>'; }
    setTitle(null, t.name, 'trophy');
    const tab = tabOf(t);
    const bar = `<nav class="ot-tabs" role="tablist">${TABS.map((k) => `<button type="button" role="tab" class="${k === tab ? 'on' : ''}" aria-selected="${k === tab}" data-act="otTab" data-tab="${k}">${esc(T('ot_tab_' + k))}</button>`).join('')}</nav>`;
    return `${bar}<div class="ot-tab" data-tab="${tab}">${TAB_BODY[tab](t)}</div>`;
  }
  K.acts.otTab = (b) => { Object.assign(TAB, { tab: b.dataset.tab, auto: false }); render(true); };

  // ------------------------------------------------------------ Trang riêng (shell.js – #page-otour; tour.js – K.fullPages)
  K.fullPages = new Set(['otours', 'otNew', 'ot']);
  /** Địa chỉ của trang riêng: ?o=<link riêng | mã> / ?ot=list / ?ot=new (chia sẻ, tải lại, nút Back của trình duyệt). */
  const urlOf = (page, id) => {
    const u = new URL(location.href);
    ['o', 'ot', 't', 'club'].forEach((k) => u.searchParams.delete(k));
    if (page === 'ot') u.searchParams.set('o', (D.ot && D.ot.id === id && D.ot.slug) || id);
    else u.searchParams.set('ot', page === 'otNew' ? 'new' : 'list');
    return u;
  };
  K.fullUrl = (page, id, push) => {
    try { history[push ? 'pushState' : 'replaceState']({ ot: { page, id } }, '', urlOf(page, id)); } catch (e) { /* trang nhúng / file://: bỏ qua */ }
  };
  /** Rời trang riêng: thôi theo dõi giải, bỏ ?o= / ?ot= khỏi địa chỉ. */
  K.leaveFull = (page) => {
    if (page === 'ot') O.send({ t: 'otUnwatch' });
    try { const u = new URL(location.href); u.searchParams.delete('o'); u.searchParams.delete('ot'); history.replaceState(null, '', u); } catch (e) { /* bỏ qua */ }
  };
  // Nút Back / Forward của trình duyệt: mở lại đúng trang trong lịch sử (không ghi thêm)
  window.addEventListener('popstate', (e) => {
    const st = e.state && e.state.ot;
    if (st && K.fullPages.has(st.page)) { open(st.page, st.id, false); return; }
    if (K.fullPages.has(V.page) && window.CaroShell && window.CaroShell.current === 'otour') window.CaroShell.open('home');
  });

  // ------------------------------------------------------------ Thao tác
  K.pages.otours = pageList;
  K.pages.otNew = pageNew;
  K.pages.ot = pageView;
  K.enter.otours = () => O.send({ t: 'otList' });
  K.enter.otNew = () => { if (!F.d) begin(); };
  K.enter.ot = () => { if (!D.ot || D.ot.id !== V.id) D.ot = null; O.send({ t: 'otGet', id: V.id }); };
  // Kết nối lại (tour.js – load): tải lại trang đang mở
  K.reload = Object.assign(K.reload || {}, { ot: K.enter.ot, otours: K.enter.otours });
  K.acts.otours = () => open('otours', null);
  K.acts.otNew = () => { F.d = null; open('otNew', null); };
  K.acts.ot = (b) => open('ot', b.dataset.id);
  K.acts.otShare = () => K.share(K.shareLink('o', D.ot.slug || D.ot.id), D.ot.name);
  K.acts.otStart = () => window.CaroConfirm.ask(T('ot_start_confirm', { n: D.ot.players.length })).then((ok) => { if (ok) O.send({ t: 'otStart', id: D.ot.id }); });
  K.acts.otDelete = () => window.CaroConfirm.ask(T('ot_delete_confirm', { name: D.ot.name })).then((ok) => { if (ok) O.send({ t: 'otDelete', id: D.ot.id }); });
  K.acts.otTeamDel = (b) => O.send({ t: 'otTeamDel', id: D.ot.id, team: b.dataset.uid });
  K.acts.otTeamsAdd = () => {
    const box = $('ot-add');
    const names = box.value.split('\n').map((x) => x.trim()).filter(Boolean);
    if (names.length) O.send({ t: 'otTeamsAdd', id: D.ot.id, names });
    box.value = '';
  };
  K.binders.push(() => { if (V.page === 'otNew') bindNew(); });

  // ------------------------------------------------------------ Tin từ máy chủ
  O.on('otList', (m) => { D.otList = m; if (K.isOpen() && V.page === 'otours') render(); });
  O.on('otCreated', (m) => { F.d = null; K.V.stack = [{ page: 'otours', id: null }]; open('ot', m.id, false); });
  O.on('otDeleted', () => { D.ot = null; K.V.stack = []; open('otours', null, false); });
  O.on('ot', (m) => {
    // Mở bằng link riêng: từ giờ dùng mã giải
    if (V.page === 'ot' && m.id !== V.id && m.tour && m.tour.slug && m.tour.slug === String(V.id || '').toLowerCase()) V.id = m.id;
    if (V.page === 'ot' && m.id === V.id && m.tour && m.tour.slug) K.fullUrl('ot', m.id, false); // địa chỉ dùng link riêng
    if (m.id !== V.id) return;
    if (!m.tour) { O.toast(T('srv_ot_not_found')); D.ot = null; K.back() || K.top('otours'); return; }
    D.ot = { ...m.tour, ...m.mine };
    // Bản đầy đủ (mở trang / kết nối lại): máy chủ có thể đã quên các bảng đang mở – hỏi lại để tiếp tục nhận cập nhật
    if (G.id === m.id) for (const k of G.asked) { const [i, g] = k.split(':').map(Number); O.send({ t: 'otGroup', id: m.id, stage: i, g }); }
    if (K.isOpen() && V.page === 'ot') render();
  });
  O.on('otPatch', (m) => {
    if (m.id !== V.id || !D.ot || D.ot.id !== m.id) return;
    if (!window.CaroTourPatch.apply(D.ot, m.patch)) { O.send({ t: 'otGet', id: m.id }); return; }
    Object.assign(D.ot, m.mine);
    if (K.isOpen() && V.page === 'ot') render();
  });
  // ------------------------------------------------------------ Tải lười các trận của vòng tròn nhiều bảng
  // (máy chủ: otour-lazy.js) – trang chung chỉ có bảng xếp hạng; mở bảng nào (tour-stages.js) thì tải các trận bảng đó
  const G = { id: null, rounds: new Map(), asked: new Set(), waits: [], allId: null, allAt: 0 };
  const gkey = (i, g) => i + ':' + g;
  const gReset = (id) => { if (G.id !== id) { G.id = id; G.rounds.clear(); G.asked.clear(); } };
  K.otGroupRounds = (t, i, g) => (t.kind === 'otour' && G.id === t.id ? G.rounds.get(gkey(i, g)) || null : null);
  K.otGroupNeed = (t, i, g) => {
    if (t.kind !== 'otour') return;
    gReset(t.id);
    if (G.asked.has(gkey(i, g))) return;
    G.asked.add(gkey(i, g));
    O.send({ t: 'otGroup', id: t.id, stage: i, g });
  };
  /** Tải đủ mọi bảng của các giai đoạn tải lười (xuất CSV kết quả); tối đa 8 giây. */
  K.otGroupsAll = (t) => {
    const lazy = (t.stageViews || []).filter((v) => v.lazy);
    if (!lazy.length) return Promise.resolve();
    gReset(t.id);
    const left = new Map(lazy.map((v) => [v.index, v.groups.length])); // giai đoạn → số bảng phải nhận đủ
    let wait = null;
    const got = new Promise((resolve) => {
      wait = (m) => {
        if (left.get(m.stage) === m.groups.length) left.delete(m.stage);
        if (left.size) return false;
        resolve();
        return true;
      };
      G.waits.push(wait);
      for (const v of lazy) O.send({ t: 'otGroup', id: t.id, stage: v.index, g: 'all' });
    });
    // Quá 8 giây (mạng chậm): thôi chờ – bỏ hàm chờ khỏi danh sách (không để lại hàm chờ thừa)
    return Promise.race([got, new Promise((resolve) => setTimeout(resolve, 8000))]).then(() => { G.waits = G.waits.filter((w) => w !== wait); });
  };
  /**
   * Tab Lịch thi đấu của giải tải lười: lịch cần giờ đấu của mọi trận – tải đủ các bảng (tối đa 5 phút một lần: trang vẽ lại
   * sau mỗi bản vá; giải 512 đội ~1,6 MB). Các bảng đã mở vẫn được máy chủ đẩy cập nhật như thường.
   */
  const SCHED_EVERY = 300000;
  function schedNeedAll(t) {
    if (!(t.stageViews || []).some((v) => v.lazy)) return;
    if (G.allId === t.id && Date.now() - G.allAt < SCHED_EVERY) return;
    Object.assign(G, { allId: t.id, allAt: Date.now() });
    K.otGroupsAll(t);
  }
  O.on('otGroup', (m) => {
    if (!D.ot || m.id !== D.ot.id) return;
    gReset(m.id);
    for (const x of m.groups) G.rounds.set(gkey(m.stage, x.g), x.rounds);
    G.waits = G.waits.filter((w) => !w(m));
    if (K.isOpen() && V.page === 'ot') render();
  });

  // Lỗi khi tạo giải: hiện ngay trong form
  O.on('error', (m) => { if (m.ctx === 'otCreate' && $('otf-err')) $('otf-err').textContent = T('srv_' + m.code, m.args || {}); });

  // Mở bằng link ?o= trên máy chậm: kết nối có thể xong (tour.js đã mở trang 'ot') trước khi file này chạy – khi đó
  // chưa ai gửi otGet. Gửi bù ngay lúc nạp.
  if (K.isOpen() && (V.page === 'ot' || V.page === 'otours') && O.connected) { K.enter[V.page](); render(); }

  window.CaroOTour = { open: (id) => { K.V.stack = [{ page: 'otours', id: null }]; open('ot', id, false); }, list: () => K.top('otours') };
})();
