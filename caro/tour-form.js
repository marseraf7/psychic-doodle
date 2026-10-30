/*
 * Giải đấu – form tạo giải nhanh: Arena hoặc thi đấu theo giai đoạn. Có mẫu sẵn (loại trực tiếp, nhánh thắng – thua,
 * vòng tròn, Thụy Sĩ, vòng bảng + playoff…) và trình ghép tự do tối đa 3 giai đoạn.
 * Mọi ô nhập nằm trong một bản nháp chung (F.d + F.stages), dùng chung với trang Cài đặt nâng cao (tour-adv.js):
 * chuyển qua lại không mất dữ liệu; nháp lưu ở máy để lỡ tải lại trang vẫn còn, tạo giải xong thì xoá.
 * Dưới ô Thể thức có dòng ước tính số trận / lượt đấu / thời gian (tour-estimate.js). Trình sửa giai đoạn:
 * tour-stage-edit.js. Nạp sau tour.js, tour-stages.js, tour-stage-edit.js, tour-estimate.js; cắm K.tourDraft cho tour-adv.js.
 */
(function () {
  'use strict';
  const K = window.CaroTourKit;
  if (!K) return;
  const { O, T, esc, $, D, V, secs, me, setTitle, needLogin, open, icon } = K;

  // Mẫu có sẵn; chọn xong vẫn sửa tự do từng giai đoạn (đổi gì cũng thành "Tuỳ chỉnh")
  const SE = K.stageEdit;
  const STAGE_DEFAULT = SE.DEFAULT;
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
  const MAX_STAGES = SE.MAX;
  const DRAFT_KEY = 'caro.tourDraft';

  // ------------------------------------------------------------ Bản nháp (dùng chung form nhanh và trang nâng cao)
  // editId: đang sửa cài đặt một giải đã tạo (tour-manage.js) – không lưu nháp vào máy, gửi tourEdit thay cho tourCreate
  const F = { preset: 'arena', stages: null, d: null, tab: 'basic', editId: null };
  // Phần mở rộng (vd. tour-adv-reg.js – đăng ký nâng cao): ô mặc định, đọc thêm từ form, kiểm, thêm vào lệnh tạo giải
  const EXT = { defaults: {}, loaders: [], collectors: [], validators: [], payloads: [], fromTour: [] };
  /** Giờ bắt đầu mặc định: 1 giờ nữa, làm tròn 5 phút (chuỗi datetime-local theo giờ máy). */
  function defaultStart() {
    const d = new Date(Date.now() + 60 * 60 * 1000);
    d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }
  const blank = () => ({
    name: '', desc: '', start: defaultStart(), time: 't20', opening: 'free', rule: 'vn', minutes: '30', seeding: 'rating',
    checkin: true, rated: true, max: '32', access: 'public', club: '', noshow: '', hideSeeds: false, ...structuredClone(EXT.defaults),
  });
  let saveTimer = 0;
  function saveDraft() {
    clearTimeout(saveTimer);
    if (F.editId) return;
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
    for (const f of EXT.loaders) f(F.d);
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
    F.editId = null; // mở form tạo giải mới: không còn ở chế độ sửa giải cũ
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
    for (const f of EXT.collectors) f(form, F.d);
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
    for (const f of EXT.validators) { const bad = f(d, { ko: isKo(), start }); if (bad) return bad; }
    return null;
  }

  // ------------------------------------------------------------ Các ô (cùng HTML ở hai trang)
  const radio = (name, items, val) => `<div class="seg">${items.map(([v, label]) => `<label><input type="radio" name="${name}" value="${v}" ${String(v) === String(val) ? 'checked' : ''}> <span>${esc(label)}</span></label>`).join('')}</div>`;
  const officerClubs = () => (D.myClubs || []).filter((c) => c.status === 'approved' && (c.role === 'owner' || c.role === 'officer'));
  const FIELDS = {
    name: (d) => `<label class="field"><span>${esc(T('tour_name'))}</span><input name="name" maxlength="60" required value="${esc(d.name)}"></label>`,
    desc: (d) => `<label class="field"><span>${esc(T('tour_desc'))}</span><textarea name="desc" maxlength="1000" rows="3">${esc(d.desc)}</textarea></label>`,
    preset: () => `<label class="field"><span>${esc(T('format'))}</span><select name="preset">${Object.keys(PRESETS).map((k) => `<option value="${k}" ${k === F.preset ? 'selected' : ''}>${esc(presetLabel(k))}</option>`).join('')}</select></label>`,
    // Ô ngày giờ thống nhất (dt-field.js): 29/10/2026 · 09:00, giá trị ẩn dạng datetime-local
    start: (d) => `<div class="field"><span>${esc(T('tour_start'))}</span>${window.CaroDt.html('start', d.start, { required: true })}</div>`,
    time: (d) => `<fieldset class="only-online"><legend>${esc(T('time_limit'))}</legend>${radio('time', [['t10', secs(10)], ['t20', secs(20)], ['t30', secs(30)], ['c3+2', '3+2'], ['c5+3', '5+3'], ['c10+5', '10+5']], d.time)}</fieldset>`,
    opening: (d) => `<fieldset class="only-online"><legend>${esc(T('opening'))}</legend>${radio('opening', [['free', T('opening_free')], ['swap2', T('opening_swap2')]], d.opening)}</fieldset>`,
    rule: (d) => `<fieldset class="only-online"><legend>${esc(T('grule'))}</legend><select class="select" name="rule">${window.Caro.RULES.map((r) => `<option value="${r}" ${r === d.rule ? 'selected' : ''}>${esc(T('grule_' + r))}</option>`).join('')}</select></fieldset>`,
    minutes: (d) => `<fieldset class="only-arena"><legend>${esc(T('duration'))}</legend>${radio('minutes', [15, 30, 45, 60, 90, 120].map((n) => [n, T('minutes_n', { n })]), d.minutes)}</fieldset>`,
    seeding: (d) => `<fieldset class="only-ko" hidden><legend>${esc(T('seeding'))}</legend>${radio('seeding', [['rating', T('seed_rating')], ['random', T('seed_random')], ['list', T('seed_list')]], d.seeding)}</fieldset>`,
    checkin: (d) => `<label class="check only-ko only-online" hidden><input type="checkbox" name="checkin" ${d.checkin ? 'checked' : ''}> <span>${esc(T('checkin_opt'))}</span></label>`,
    hideSeeds: (d) => `<label class="check only-ko" hidden><input type="checkbox" name="hideSeeds" ${d.hideSeeds ? 'checked' : ''}> <span>${esc(T('hide_seeds_opt'))}</span></label>`,
    noshow: (d) => `<label class="field short only-ko only-online" hidden><span>${esc(T('noshow'))}</span><select name="noshow">${[['', T('noshow_default')], ...[1, 3, 5, 10, 15].map((n) => [String(n), T('minutes_n', { n })])].map(([v, l]) => `<option value="${v}" ${v === String(d.noshow || '') ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`,
    rated: (d) => `<label class="check only-online"><input type="checkbox" name="rated" ${d.rated ? 'checked' : ''}> <span>${esc(T('rated_opt'))}</span></label>`,
    max: (d) => `<label class="field short"><span>${esc(T('max_players'))}</span><input name="max" type="number" min="2" max="512" value="${esc(d.max)}"></label>`,
    access: (d) => {
      const clubs = officerClubs();
      const acc = d.access === 'club' && !clubs.length ? 'public' : d.access;
      return `<fieldset><legend>${esc(T('access'))}</legend>${radio('access', [['public', T('acc_public')], ['link', T('acc_link')], ...(clubs.length ? [['club', T('acc_club')]] : []), ['private', T('acc_private')]], acc)}</fieldset>
        ${clubs.length ? `<label class="field only-club" ${acc === 'club' ? '' : 'hidden'}><span>${esc(T('club'))}</span><select name="club">${clubs.map((c) => `<option value="${esc(c.id)}" ${c.id === d.club ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>` : ''}`;
    },
  };
  const fields = (keys) => keys.map((k) => FIELDS[k](F.d)).join('');

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
      ${K.tplRow ? K.tplRow() : ''}
      ${fields(['name', 'desc', 'preset'])}
      <p class="hint" id="tf-fmt-hint"></p>
      <button type="button" class="ghost adv-btn" id="tf-adv" data-act="tourAdv" hidden>${icon('sliders')}${esc(T('tadv_settings'))}</button>
      <div id="tf-stages" class="only-ko" hidden></div>
      <p class="est" id="tf-est" aria-live="polite"></p>
      ${fields(['start', 'time', 'opening', 'rule', 'minutes', 'seeding', 'checkin', 'rated', 'max', 'offline', 'access'])}
      <p class="err" id="tf-err"></p>
      <button class="primary wide">${esc(T('tour_submit'))}</button>
    </form>`;
  }

  /**
   * Gắn sự kiện cho một form tạo giải (nhanh hoặc nâng cao). ids: { stages, hint, est, err, adv? (nút mở trang nâng
   * cao), full? (trình sửa giai đoạn đủ tuỳ chọn nâng cao) }; onInvalid(key): ô lỗi.
   */
  function bindForm(form, ids, onInvalid) {
    const box = $(ids.stages);
    // max: số người tối đa – số cặp hạng chọn được ở trận xếp hạng
    const drawStages = () => { if (box) box.innerHTML = SE.html(F.stages, !!ids.full, { max: F.d && F.d.max }); };
    // Chỉ ghi khi đổi (dòng aria-live: trình đọc màn hình không đọc lại câu giống hệt)
    const showEst = () => { const el = $(ids.est), t = estimateText(); if (el && el.textContent !== t) el.textContent = t; };
    const sync = () => {
      const ko = F.preset !== 'arena';
      if (form.preset) form.preset.value = F.preset;
      collect(form);
      // Ô chỉ dành cho: thể thức theo giai đoạn / Arena / giải trực tuyến / giải offline
      const off = ko && !!F.d.offline;
      form.querySelectorAll('.only-ko, .only-arena, .only-online, .only-offline').forEach((x) => {
        const c = x.classList;
        x.hidden = (c.contains('only-ko') && !ko) || (c.contains('only-arena') && ko) || (c.contains('only-online') && off) || (c.contains('only-offline') && !off);
      });
      form.querySelectorAll('.only-club').forEach((x) => { x.hidden = !form.access || form.access.value !== 'club'; });
      if ($(ids.hint)) $(ids.hint).textContent = T('hint_' + F.preset);
      if (ids.adv && $(ids.adv)) $(ids.adv).hidden = F.preset !== 'custom';
      if (form.max) { form.max.max = 512; form.max.min = ko ? 3 : 2; }
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
    form.addEventListener('change', (e) => {
      if (e.target.closest('#' + ids.stages) || e.target === form.preset) return;
      sync();
      if (e.target.name === 'max' && ids.full) drawStages();
    });
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
        if (!SE.change(F.stages, e.target)) return;
        custom();
        drawStages();
      });
      box.addEventListener('click', (e) => {
        const b = e.target.closest('[data-sact]');
        if (!b || !SE.click(F.stages, b)) return;
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
        else focusField(form.elements[bad.key]);
        return;
      }
      submit(ids.err);
    };
    sync();
  }

  /** datetime-local theo giờ máy từ mốc thời gian (ms). */
  const localInput = (ms) => new Date(ms - new Date(ms).getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  /** Nạp cài đặt của một giải đã tạo vào form (sửa cài đặt): t = trang giải của ban tổ chức. */
  function fromTour(t) {
    const r = t.reg || {};
    F.editId = t.id;
    F.preset = t.format === 'arena' ? 'arena' : 'custom';
    F.stages = t.stages ? structuredClone(t.stages) : null;
    F.tab = 'basic';
    F.d = {
      // Giờ máy chủ → giờ máy (ngược với submit: startsAt = giờ máy − skew)
      ...blank(), name: t.name, desc: t.desc || '', start: localInput(t.startsAt + (D.skew || 0)),
      time: t.clock ? 'c' + t.clock : 't' + (t.timeLimit || 20), opening: t.opening || 'free', rule: t.rule || 'vn',
      minutes: String(t.minutes || 30), seeding: t.seeding || 'rating', checkin: !!t.checkinEnabled, rated: !!t.rated,
      max: String(t.maxPlayers), access: t.access, club: t.club ? t.club.id : '', noshow: t.noShowMin ? String(t.noShowMin) : '', hideSeeds: !!t.hideSeeds,
      offline: !!t.offline, scoreMode: t.scoreMode || 'sets', closeAt: r.closeAt ? localInput(r.closeAt + (D.skew || 0)) : '',
      approval: !!r.approval, waitlist: !!r.waitlist, minRating: r.minRating || '', maxRating: r.maxRating || '', minGames: r.minGames || '',
      minAccountDays: r.minAccountDays || '', code: (t.regAdmin && t.regAdmin.code) || '', checkinMin: String(r.checkinMin || 10),
      questions: (r.questions || []).map((q) => ({ q: q.q, type: q.type, opts: (q.opts || []).join(', ') })),
    };
    for (const f of EXT.fromTour) f(F.d, t); // các ô cắm thêm (Team Battle – club-battle.js)
  }

  /** Đưa con trỏ tới ô lỗi (ô ngày giờ: ô ngày đang hiện, không phải ô ẩn giữ giá trị). */
  function focusField(el) {
    if (!el || !el.focus) return;
    const box = el.type === 'hidden' && el.closest('[data-dt]');
    (box ? box.querySelector('.dt-d') : el).focus();
  }

  /** Gửi lệnh tạo giải (hoặc sửa cài đặt – F.editId) từ bản nháp. opts.draft: lưu nháp (chưa gửi duyệt). */
  function submit(errId, opts = {}) {
    const d = F.d;
    if ($(errId)) $(errId).textContent = '';
    const start = new Date(d.start).getTime();
    const ko = F.preset !== 'arena';
    const extra = Object.assign({}, ...EXT.payloads.map((f) => f(d, { ko })));
    O.send({
      ...(F.editId ? { t: 'tourEdit', id: F.editId } : { t: 'tourCreate', draft: !!opts.draft }), name: d.name.trim(), desc: d.desc.trim(), format: ko ? 'bracket' : 'arena', startsAt: start - D.skew,
      ...(d.time[0] === 'c' ? { timeLimit: 0, clock: d.time.slice(1) } : { timeLimit: Number(d.time.slice(1)) }),
      opening: d.opening, rule: d.rule, minutes: Number(d.minutes), stages: ko ? F.stages : undefined, seeding: d.seeding,
      checkin: !!d.checkin, rated: !!d.rated, maxPlayers: Number(d.max), noShowMin: d.noshow ? Number(d.noshow) : null,
      access: d.access, club: d.access === 'club' ? d.club || null : null, hideSeeds: !!d.hideSeeds,
      ...extra, // phần mở rộng ghi đè (vd. giải offline: không tính Elo, không điểm danh)
    });
    return true;
  }

  K.pages.tourNew = pageTourNew;
  K.acts.tourNew = () => { F.d = null; F.editId = null; open('tourNew', null); };
  K.acts.tourAdv = () => { collect($('tf')); open('tourAdv', null); };
  /** Đặt lại form về mặc định (bỏ nháp), giữ CLB đang chọn nếu mở từ trang CLB. */
  K.acts.tourReset = () => {
    const club = F.d && F.d.access === 'club' ? F.d.club : null;
    resetDraft();
    begin(club);
    K.render(true);
  };
  K.binders.push(() => { const tf = $('tf'); if (tf) bindForm(tf, { stages: 'tf-stages', hint: 'tf-fmt-hint', est: 'tf-est', adv: 'tf-adv', err: 'tf-err' }); });
  // Tạo xong thì bỏ nháp; sửa xong thì về trang giải
  O.on('tourCreated', resetDraft);
  O.on('tourEdited', (m) => {
    F.editId = null;
    F.d = null;
    O.toast(T('tour_edited'));
    if (K.isOpen() && K.V.page === 'tourAdv') { K.V.stack = [{ page: 'tours', id: null }]; open('tour', m.id, false); }
  });
  K.tourDraft = { F, FIELDS, EXT, fields, PRESETS, presetLabel, bindForm, collect, begin, resetDraft, estimateText, validate, fromTour, submit, focusField, blank, saveDraft };
})();
