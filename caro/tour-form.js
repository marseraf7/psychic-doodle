/*
 * Giải đấu – form tạo giải nhanh: Arena hoặc thi đấu theo giai đoạn. Có mẫu sẵn (loại trực tiếp, nhánh thắng – thua,
 * vòng tròn, Thụy Sĩ, vòng bảng + playoff…) và trình ghép tự do tối đa 3 giai đoạn.
 * Mọi ô nhập nằm trong một bản nháp chung (F.d + F.stages), dùng chung với trang Cài đặt nâng cao (tour-adv.js):
 * chuyển qua lại không mất dữ liệu; nháp lưu ở máy để lỡ tải lại trang vẫn còn, tạo giải xong thì xoá.
 * Dưới ô Thể thức có dòng ước tính số trận / lượt đấu / thời gian (tour-estimate.js).
 * Nạp sau tour.js, tour-stages.js, tour-estimate.js; cắm K.tourDraft cho tour-adv.js.
 */
(function () {
  'use strict';
  const K = window.CaroTourKit;
  if (!K) return;
  const { O, T, esc, $, D, V, secs, me, setTitle, needLogin, open, icon } = K;
  const { stageName, advText } = K;

  // Mẫu có sẵn; chọn xong vẫn sửa tự do từng giai đoạn (đổi gì cũng thành "Tuỳ chỉnh")
  const PT = { w: 3, d: 1, l: 0 };
  const STAGE_DEFAULT = {
    single: () => ({ type: 'single', bestOf: 3, thirdPlace: true }),
    double: () => ({ type: 'double', bestOf: 3, reset: true }),
    roundrobin: () => ({ type: 'roundrobin', bestOf: 1, groups: 1, meetings: 1, points: { ...PT }, advance: 2 }),
    swiss: () => ({ type: 'swiss', bestOf: 1, rounds: 5, points: { w: 2, d: 1, l: 0 }, advance: 4 }),
  };
  /** Vòng bảng chia theo số người mỗi bảng (số bảng tuỳ số người đăng ký). */
  const groupsOf = (size) => { const c = STAGE_DEFAULT.roundrobin(); delete c.groups; c.groupSize = size; return c; };
  const PRESETS = {
    arena: null,
    single: () => [STAGE_DEFAULT.single()],
    double: () => [STAGE_DEFAULT.double()],
    roundrobin: () => [STAGE_DEFAULT.roundrobin()],
    swiss: () => [STAGE_DEFAULT.swiss()],
    groups_single: () => [{ ...STAGE_DEFAULT.roundrobin(), groups: 4 }, STAGE_DEFAULT.single()],
    groups_double: () => [groupsOf(4), STAGE_DEFAULT.double()], // chia theo số người mỗi bảng
    swiss_single: () => [{ ...STAGE_DEFAULT.swiss(), advance: 8 }, { ...STAGE_DEFAULT.single(), thirdPlace: false }],
    custom: null,
  };
  const presetLabel = (k) => T('fmt_' + k); // <option> chỉ hiện được chữ
  const MAX_STAGES = 3;
  const DRAFT_KEY = 'caro.tourDraft';

  // ------------------------------------------------------------ Bản nháp (dùng chung form nhanh và trang nâng cao)
  const F = { preset: 'arena', stages: null, d: null, tab: 'basic' };
  /** Giờ bắt đầu mặc định: 1 giờ nữa, làm tròn 5 phút (chuỗi datetime-local theo giờ máy). */
  function defaultStart() {
    const d = new Date(Date.now() + 60 * 60 * 1000);
    d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }
  const blank = () => ({
    name: '', desc: '', start: defaultStart(), time: 't20', opening: 'free', rule: 'vn', minutes: '30', seeding: 'rating',
    checkin: true, rated: true, max: '32', access: 'public', club: '',
  });
  let saveTimer = 0;
  function saveDraft() {
    clearTimeout(saveTimer);
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ preset: F.preset, stages: F.stages, d: F.d })); } catch (e) { /* chế độ riêng tư */ }
  }
  function loadDraft() {
    let x = null;
    try { x = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch (e) { x = null; }
    F.d = { ...blank(), ...(x && x.d) };
    F.preset = x && Object.prototype.hasOwnProperty.call(PRESETS, x.preset) ? x.preset : 'arena';
    F.stages = x && Array.isArray(x.stages) && x.stages.length ? x.stages.slice(0, MAX_STAGES) : PRESETS[F.preset] ? PRESETS[F.preset]() : null;
    if (F.preset === 'custom' && !F.stages) F.stages = PRESETS.groups_single();
    // Giờ bắt đầu đã qua (nháp cũ) → về mặc định
    if (!F.d.start || new Date(F.d.start).getTime() < Date.now()) F.d.start = defaultStart();
  }
  function resetDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* bỏ qua */ }
    F.d = null;
  }
  /**
   * Mở form từ ngoài (danh sách giải / trang CLB): nạp nháp. clubId = tạo giải cho CLB đó; mở từ danh sách chung thì
   * không giữ lựa chọn "chỉ CLB" của nháp cũ (tránh vô tình tạo giải kín cho CLB).
   */
  function begin(clubId) {
    loadDraft();
    if (clubId) { F.d.access = 'club'; F.d.club = clubId; } else if (F.d.access === 'club') { F.d.access = 'public'; F.d.club = ''; }
  }
  /** Đọc mọi ô của form (nhanh hoặc nâng cao – cùng tên ô) vào bản nháp. lazy: lưu máy sau 0,5 s (khi đang gõ). */
  function collect(form, lazy) {
    if (!form || !F.d) return;
    for (const k of Object.keys(F.d)) {
      const el = form.elements[k];
      if (!el) continue;
      F.d[k] = el.type === 'checkbox' ? el.checked : el.value;
    }
    if (lazy) { clearTimeout(saveTimer); saveTimer = setTimeout(saveDraft, 500); } else saveDraft();
  }
  const isKo = () => F.preset !== 'arena';
  /** Kiểm bản nháp như máy chủ (tên ≥ 3 ký tự, giờ bắt đầu, số người). Lỗi: { key: tên ô, msg }; hợp lệ: null. */
  function validate() {
    const d = F.d, now = Date.now();
    const name = d.name.trim();
    if (name.length < 3) return { key: 'name', msg: T(name ? 'srv_tour_name_short' : 'tour_name_required') };
    const start = new Date(d.start).getTime();
    if (!Number.isFinite(start) || start < now + 60 * 1000 || start > now + 30 * 86400000) return { key: 'start', msg: T('srv_tour_bad_start') };
    const n = Number(d.max), lo = isKo() ? 3 : 2;
    if (!Number.isInteger(n) || n < lo || n > 512) return { key: 'max', msg: T('tour_bad_max', { lo, hi: 512 }) };
    return null;
  }

  // ------------------------------------------------------------ Các ô (cùng HTML ở hai trang)
  const radio = (name, items, val) => `<div class="seg">${items.map(([v, label]) => `<label><input type="radio" name="${name}" value="${v}" ${String(v) === String(val) ? 'checked' : ''}> <span>${esc(label)}</span></label>`).join('')}</div>`;
  const officerClubs = () => (D.myClubs || []).filter((c) => c.status === 'approved' && (c.role === 'owner' || c.role === 'officer'));
  const FIELDS = {
    name: (d) => `<label class="field"><span>${esc(T('tour_name'))}</span><input name="name" maxlength="60" required value="${esc(d.name)}"></label>`,
    desc: (d) => `<label class="field"><span>${esc(T('tour_desc'))}</span><textarea name="desc" maxlength="1000" rows="3">${esc(d.desc)}</textarea></label>`,
    preset: () => `<label class="field"><span>${esc(T('format'))}</span><select name="preset">${Object.keys(PRESETS).map((k) => `<option value="${k}" ${k === F.preset ? 'selected' : ''}>${esc(presetLabel(k))}</option>`).join('')}</select></label>`,
    start: (d) => `<label class="field"><span>${esc(T('tour_start'))}</span><input name="start" type="datetime-local" value="${esc(d.start)}" required></label>`,
    time: (d) => `<fieldset><legend>${esc(T('time_limit'))}</legend>${radio('time', [['t10', secs(10)], ['t20', secs(20)], ['t30', secs(30)], ['c3+2', '3+2'], ['c5+3', '5+3'], ['c10+5', '10+5']], d.time)}</fieldset>`,
    opening: (d) => `<fieldset><legend>${esc(T('opening'))}</legend>${radio('opening', [['free', T('opening_free')], ['swap2', T('opening_swap2')]], d.opening)}</fieldset>`,
    rule: (d) => `<fieldset><legend>${esc(T('grule'))}</legend><select class="select" name="rule">${window.Caro.RULES.map((r) => `<option value="${r}" ${r === d.rule ? 'selected' : ''}>${esc(T('grule_' + r))}</option>`).join('')}</select></fieldset>`,
    minutes: (d) => `<fieldset class="only-arena"><legend>${esc(T('duration'))}</legend>${radio('minutes', [15, 30, 45, 60, 90, 120].map((n) => [n, T('minutes_n', { n })]), d.minutes)}</fieldset>`,
    seeding: (d) => `<fieldset class="only-ko" hidden><legend>${esc(T('seeding'))}</legend>${radio('seeding', [['rating', T('seed_rating')], ['random', T('seed_random')]], d.seeding)}</fieldset>`,
    checkin: (d) => `<label class="check only-ko" hidden><input type="checkbox" name="checkin" ${d.checkin ? 'checked' : ''}> <span>${esc(T('checkin_opt'))}</span></label>`,
    rated: (d) => `<label class="check"><input type="checkbox" name="rated" ${d.rated ? 'checked' : ''}> <span>${esc(T('rated_opt'))}</span></label>`,
    max: (d) => `<label class="field short"><span>${esc(T('max_players'))}</span><input name="max" type="number" min="2" max="512" value="${esc(d.max)}"></label>`,
    access: (d) => {
      const clubs = officerClubs();
      const acc = d.access === 'club' && !clubs.length ? 'public' : d.access;
      return `<fieldset><legend>${esc(T('access'))}</legend>${radio('access', [['public', T('acc_public')], ['link', T('acc_link')], ...(clubs.length ? [['club', T('acc_club')]] : [])], acc)}</fieldset>
        ${clubs.length ? `<label class="field only-club" ${acc === 'club' ? '' : 'hidden'}><span>${esc(T('club'))}</span><select name="club">${clubs.map((c) => `<option value="${esc(c.id)}" ${c.id === d.club ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>` : ''}`;
    },
  };
  const fields = (keys) => keys.map((k) => FIELDS[k](F.d)).join('');

  /** Trình sửa các giai đoạn (vẽ riêng để không mất các ô khác của form). */
  function stageEditor() {
    const st = F.stages || [];
    const num = (i, k, v, min, max) => `<input type="number" data-i="${i}" data-k="${k}" value="${v}" min="${min}" max="${max}">`;
    const sel = (i, k, items, v) => `<select data-i="${i}" data-k="${k}">${items.map(([x, l]) => `<option value="${x}" ${String(x) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    const chk = (i, k, v, label) => `<label class="check"><input type="checkbox" data-i="${i}" data-k="${k}" ${v ? 'checked' : ''}> <span>${esc(label)}</span></label>`;
    const field = (label, inner) => `<label class="field inline"><span>${esc(label)}</span>${inner}</label>`;
    const cards = st.map((c, i) => {
      const last = i === st.length - 1;
      const types = (last ? ['single', 'double', 'roundrobin', 'swiss'] : ['roundrobin', 'swiss']).map((x) => [x, T('fmt_' + x)]);
      const f = [field(T('format'), sel(i, 'type', types, c.type)), field(T('format_bo'), sel(i, 'bestOf', [[1, 'Bo1'], [3, 'Bo3'], [5, 'Bo5']], c.bestOf))];
      if (c.type === 'single') f.push(chk(i, 'thirdPlace', c.thirdPlace, T('third_place_opt')));
      if (c.type === 'double') f.push(chk(i, 'reset', c.reset, T('opt_reset')));
      if (c.type === 'roundrobin') {
        // Chia theo số bảng, hoặc theo số người mỗi bảng (như Challonge)
        const bySize = c.groupSize != null;
        f.push(field(T('gmode'), sel(i, 'gmode', [['count', T('gmode_count')], ['size', T('gmode_size')]], bySize ? 'size' : 'count')));
        f.push(bySize ? field(T('gmode_size'), num(i, 'groupSize', c.groupSize, 2, 16)) : field(T('opt_groups'), num(i, 'groups', c.groups, 1, 64)));
        f.push(field(T('opt_meetings'), sel(i, 'meetings', [[1, T('meet_1')], [2, T('meet_2')]], c.meetings)));
      }
      if (c.type === 'swiss') f.push(field(T('opt_rounds'), num(i, 'rounds', c.rounds, 1, 15)));
      if (c.points) {
        f.push(`<div class="field inline"><span>${esc(T('opt_points'))}</span><span class="pts3">${num(i, 'pw', c.points.w, 0, 10)}${num(i, 'pd', c.points.d, 0, 10)}${num(i, 'pl', c.points.l, 0, 10)}</span></div>`);
      }
      if (!last) f.push(field(T(c.type === 'roundrobin' ? 'adv_per_group' : 'adv_total'), num(i, 'advance', c.advance, 1, 32)));
      const del = st.length > 1 ? `<button type="button" class="ghost sm icon" data-sact="del" data-i="${i}" title="${esc(T('stage_remove'))}" aria-label="${esc(T('stage_remove'))}">${icon('close')}</button>` : '';
      return `<div class="stage-card"><div class="sc-head"><b>${esc(T('stage_n', { n: i + 1 }))}</b>${last && st.length > 1 ? ` <span class="muted">${esc(T('stage_final'))}</span>` : ''}${del}</div><div class="sc-body">${f.join('')}</div></div>`;
    });
    const arrows = [];
    st.forEach((c, i) => { arrows.push(stageName(c)); if (i < st.length - 1) arrows.push(advText(c)); });
    return `<p class="flow">${arrows.map((x, i) => (i % 2 ? `<span class="muted">→ ${esc(x)} →</span>` : `<b>${esc(x)}</b>`)).join(' ')}</p>
      ${cards.join('<div class="sc-arrow">↓</div>')}
      ${st.length < MAX_STAGES ? `<button type="button" class="ghost sm" data-sact="add">${icon('plus')}${esc(T('stage_add'))}</button>` : ''}`;
  }

  /** "Thời gian" dạng 2 giờ 40 phút. */
  const hm = (min) => (min >= 60 ? T('est_hm', { h: Math.floor(min / 60), m: String(min % 60).padStart(2, '0') }) : T('minutes_n', { n: Math.max(1, min) }));
  /** Dòng ước tính: số trận, số lượt đấu, thời gian (nếu đủ số người tối đa). */
  function estimateText() {
    const n = Math.max(isKo() ? 3 : 2, Math.min(512, Math.floor(Number(F.d.max) || 0))); // như máy chủ
    if (F.preset === 'arena') return T('est_arena', { t: hm(Number(F.d.minutes) || 30), n });
    const tc = F.d.time[0] === 'c' ? { clock: F.d.time.slice(1) } : { timeLimit: Number(F.d.time.slice(1)) };
    const e = window.CaroTourEstimate.estimate({ stages: F.stages, players: n, ...tc });
    const m = e.maxMatches > e.matches ? `${e.matches}–${e.maxMatches}` : String(e.matches);
    return T('est_line', { m, w: e.waves, t: hm(e.minutes), n });
  }

  // ------------------------------------------------------------ Trang form nhanh
  function pageTourNew() {
    setTitle('tour_create');
    if (!me()) return needLogin();
    if (!F.d) begin(V.id);
    return `<form id="tf" class="tform">
      <div class="tf-top"><p class="note">${esc(T('review_note_tour'))}</p><button type="button" class="ghost sm" data-act="tourReset">${icon('retry')}${esc(T('draft_reset'))}</button></div>
      ${fields(['name', 'desc', 'preset'])}
      <p class="hint" id="tf-fmt-hint"></p>
      <button type="button" class="ghost adv-btn" id="tf-adv" data-act="tourAdv" hidden>${icon('sliders')}${esc(T('tadv_settings'))}</button>
      <div id="tf-stages" class="only-ko" hidden></div>
      <p class="est" id="tf-est" aria-live="polite"></p>
      ${fields(['start', 'time', 'opening', 'rule', 'minutes', 'seeding', 'checkin', 'rated', 'max', 'access'])}
      <p class="err" id="tf-err"></p>
      <button class="primary wide">${esc(T('tour_submit'))}</button>
    </form>`;
  }

  /** Gắn sự kiện cho một form tạo giải (nhanh hoặc nâng cao). ids: { stages, hint, est, err, adv? }; onInvalid(key): ô lỗi. */
  function bindForm(form, ids, onInvalid) {
    const box = $(ids.stages);
    const drawStages = () => { if (box) box.innerHTML = stageEditor(); };
    // Chỉ ghi khi đổi (dòng aria-live: trình đọc màn hình không đọc lại câu giống hệt)
    const showEst = () => { const el = $(ids.est), t = estimateText(); if (el && el.textContent !== t) el.textContent = t; };
    const sync = () => {
      const ko = F.preset !== 'arena';
      if (form.preset) form.preset.value = F.preset;
      form.querySelectorAll('.only-ko').forEach((x) => { x.hidden = !ko; });
      form.querySelectorAll('.only-arena').forEach((x) => { x.hidden = ko; });
      form.querySelectorAll('.only-club').forEach((x) => { x.hidden = !form.access || form.access.value !== 'club'; });
      if ($(ids.hint)) $(ids.hint).textContent = T('hint_' + F.preset);
      if (ids.adv && $(ids.adv)) $(ids.adv).hidden = F.preset !== 'custom';
      if (form.max) { form.max.max = 512; form.max.min = ko ? 3 : 2; }
      collect(form);
      showEst();
    };
    drawStages();
    if (form.preset) {
      form.preset.onchange = () => {
        F.preset = form.preset.value;
        if (PRESETS[F.preset]) F.stages = PRESETS[F.preset]();
        else if (F.preset === 'custom' && !F.stages) F.stages = PRESETS.groups_single();
        drawStages();
        sync();
      };
    }
    form.addEventListener('change', (e) => { if (!e.target.closest('#' + ids.stages) && e.target !== form.preset) sync(); });
    // Đang gõ: chỉ cập nhật nháp (lưu máy chậm 0,5 s); số người đổi thì cập nhật ước tính
    form.addEventListener('input', (e) => {
      const k = e.target.name;
      if (k !== 'max' && k !== 'name' && k !== 'desc') return;
      collect(form, true);
      if (k === 'max') showEst();
    });
    if (box) {
      // Sửa một giai đoạn
      const custom = () => { F.preset = 'custom'; sync(); };
      box.addEventListener('change', (e) => {
        const el = e.target, i = Number(el.dataset.i), k = el.dataset.k;
        const c = F.stages && F.stages[i];
        if (!c || !k) return;
        const n = Number(el.value);
        if (k === 'type') {
          const nc = STAGE_DEFAULT[el.value]();
          nc.bestOf = c.bestOf;
          if (i === F.stages.length - 1) delete nc.advance; // giai đoạn cuối không có "đi tiếp"
          F.stages[i] = nc;
        } else if (k === 'gmode') {
          if (el.value === 'size') { delete c.groups; c.groupSize = 4; } else { delete c.groupSize; c.groups = 2; }
        } else if (el.type === 'checkbox') c[k] = el.checked;
        else if (k === 'pw' || k === 'pd' || k === 'pl') c.points[k[1]] = Math.max(0, Math.min(10, Math.floor(n) || 0));
        else if (el.tagName === 'SELECT') c[k] = n;
        else c[k] = Number.isFinite(n) ? Math.max(Number(el.min), Math.min(Number(el.max), Math.floor(n))) : c[k];
        custom();
        drawStages();
      });
      box.addEventListener('click', (e) => {
        const b = e.target.closest('[data-sact]');
        if (!b) return;
        if (b.dataset.sact === 'add' && F.stages.length < MAX_STAGES) F.stages.unshift(STAGE_DEFAULT.roundrobin());
        if (b.dataset.sact === 'del' && F.stages.length > 1) {
          F.stages.splice(Number(b.dataset.i), 1);
          const last = F.stages[F.stages.length - 1];
          if (last) delete last.advance; // giai đoạn cuối không có "đi tiếp"
        }
        // Giai đoạn đứng trước phải là vòng tròn / Thụy Sĩ và có số người đi tiếp
        F.stages.forEach((c, i) => {
          if (i < F.stages.length - 1 && !c.points) F.stages[i] = STAGE_DEFAULT.roundrobin();
          else if (i < F.stages.length - 1 && !c.advance) c.advance = STAGE_DEFAULT[c.type]().advance;
        });
        custom();
        drawStages();
      });
    }
    form.onsubmit = (e) => {
      e.preventDefault();
      collect(form);
      const bad = validate();
      if (bad) {
        if ($(ids.err)) $(ids.err).textContent = bad.msg;
        if (onInvalid) onInvalid(bad.key);
        else if (form.elements[bad.key] && form.elements[bad.key].focus) form.elements[bad.key].focus();
        return;
      }
      submit(ids.err);
    };
    sync();
  }

  /** Gửi lệnh tạo giải từ bản nháp. */
  function submit(errId) {
    const d = F.d;
    if ($(errId)) $(errId).textContent = '';
    const start = new Date(d.start).getTime();
    const ko = F.preset !== 'arena';
    O.send({
      t: 'tourCreate', name: d.name.trim(), desc: d.desc.trim(), format: ko ? 'bracket' : 'arena', startsAt: start - D.skew,
      ...(d.time[0] === 'c' ? { timeLimit: 0, clock: d.time.slice(1) } : { timeLimit: Number(d.time.slice(1)) }),
      opening: d.opening, rule: d.rule, minutes: Number(d.minutes), stages: ko ? F.stages : undefined, seeding: d.seeding,
      checkin: !!d.checkin, rated: !!d.rated, maxPlayers: Number(d.max),
      access: d.access, club: d.access === 'club' ? d.club || null : null,
    });
    return true;
  }

  K.pages.tourNew = pageTourNew;
  K.acts.tourNew = () => { F.d = null; open('tourNew', null); };
  K.acts.tourAdv = () => { collect($('tf')); open('tourAdv', null); };
  /** Đặt lại form về mặc định (bỏ nháp), giữ CLB đang chọn nếu mở từ trang CLB. */
  K.acts.tourReset = () => {
    const club = F.d && F.d.access === 'club' ? F.d.club : null;
    resetDraft();
    begin(club);
    K.render(true);
  };
  K.binders.push(() => { const tf = $('tf'); if (tf) bindForm(tf, { stages: 'tf-stages', hint: 'tf-fmt-hint', est: 'tf-est', adv: 'tf-adv', err: 'tf-err' }); });
  // Tạo xong thì bỏ nháp
  O.on('tourCreated', resetDraft);
  K.tourDraft = { F, FIELDS, fields, PRESETS, presetLabel, bindForm, collect, begin, resetDraft, estimateText, validate };
})();
