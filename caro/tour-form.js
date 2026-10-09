/*
 * Giải đấu – form tạo giải: Arena hoặc thi đấu theo giai đoạn. Có mẫu sẵn (loại trực tiếp, nhánh thắng – thua,
 * vòng tròn, Thụy Sĩ, vòng bảng + playoff…) và trình ghép tự do tối đa 3 giai đoạn. Nạp sau tour.js, tour-stages.js.
 */
(function () {
  'use strict';
  const K = window.CaroTourKit;
  if (!K) return;
  const { O, T, esc, $, D, V, secs, me, setTitle, needLogin, open } = K;
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
  const presetLabel = (k) => (k === 'arena' ? '⚔️ ' : k === 'custom' ? '🛠 ' : '🏆 ') + T('fmt_' + k);
  const F = { preset: 'arena', stages: null };
  const MAX_STAGES = 3;
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
      const del = st.length > 1 ? `<button type="button" class="ghost sm icon" data-sact="del" data-i="${i}" title="${esc(T('stage_remove'))}" aria-label="${esc(T('stage_remove'))}">✕</button>` : '';
      return `<div class="stage-card"><div class="sc-head"><b>${esc(T('stage_n', { n: i + 1 }))}</b>${last && st.length > 1 ? ` <span class="muted">${esc(T('stage_final'))}</span>` : ''}${del}</div><div class="sc-body">${f.join('')}</div></div>`;
    });
    const arrows = [];
    st.forEach((c, i) => { arrows.push(stageName(c)); if (i < st.length - 1) arrows.push(advText(c)); });
    return `<p class="flow">${arrows.map((x, i) => (i % 2 ? `<span class="muted">→ ${esc(x)} →</span>` : `<b>${esc(x)}</b>`)).join(' ')}</p>
      ${cards.join('<div class="sc-arrow">↓</div>')}
      ${st.length < MAX_STAGES ? `<button type="button" class="ghost sm" data-sact="add">＋ ${esc(T('stage_add'))}</button>` : ''}`;
  }
  function pageTourNew() {
    setTitle('tour_create');
    if (!me()) return needLogin();
    const d = new Date(Date.now() + 60 * 60 * 1000);
    d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0);
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    const officerClubs = (D.myClubs || []).filter((c) => c.status === 'approved' && (c.role === 'owner' || c.role === 'officer'));
    const preClub = V.id;
    const radio = (name, items, val) => `<div class="seg">${items.map(([v, label]) => `<label><input type="radio" name="${name}" value="${v}" ${String(v) === String(val) ? 'checked' : ''}> <span>${esc(label)}</span></label>`).join('')}</div>`;
    return `<form id="tf" class="tform">
      <p class="note">${esc(T('review_note_tour'))}</p>
      <label class="field"><span>${esc(T('tour_name'))}</span><input name="name" maxlength="60" required></label>
      <label class="field"><span>${esc(T('tour_desc'))}</span><textarea name="desc" maxlength="1000" rows="3"></textarea></label>
      <label class="field"><span>${esc(T('format'))}</span><select name="preset">${Object.keys(PRESETS).map((k) => `<option value="${k}" ${k === F.preset ? 'selected' : ''}>${esc(presetLabel(k))}</option>`).join('')}</select></label>
      <p class="hint" id="tf-fmt-hint"></p>
      <div id="tf-stages" class="only-ko" hidden></div>
      <label class="field"><span>${esc(T('tour_start'))}</span><input name="start" type="datetime-local" value="${local}" required></label>
      <fieldset><legend>${esc(T('time_limit'))}</legend>${radio('time', [[10, secs(10)], [20, secs(20)], [30, secs(30)]], 20)}</fieldset>
      <fieldset class="only-arena"><legend>${esc(T('duration'))}</legend>${radio('minutes', [15, 30, 45, 60, 90, 120].map((n) => [n, T('minutes_n', { n })]), 30)}</fieldset>
      <fieldset class="only-ko" hidden><legend>${esc(T('seeding'))}</legend>${radio('seeding', [['rating', T('seed_rating')], ['random', T('seed_random')]], 'rating')}</fieldset>
      <label class="check only-ko" hidden><input type="checkbox" name="checkin" checked> <span>${esc(T('checkin_opt'))}</span></label>
      <label class="check"><input type="checkbox" name="rated" checked> <span>${esc(T('rated_opt'))}</span></label>
      <label class="field short"><span>${esc(T('max_players'))}</span><input name="max" type="number" min="2" max="512" value="32"></label>
      <fieldset><legend>${esc(T('access'))}</legend>${radio('access', [['public', T('acc_public')], ['link', T('acc_link')], ...(officerClubs.length ? [['club', T('acc_club')]] : [])], preClub ? 'club' : 'public')}</fieldset>
      ${officerClubs.length ? `<label class="field only-club" ${preClub ? '' : 'hidden'}><span>${esc(T('club'))}</span><select name="club">${officerClubs.map((c) => `<option value="${esc(c.id)}" ${c.id === preClub ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>` : ''}
      <p class="err" id="tf-err"></p>
      <button class="primary wide">${esc(T('tour_submit'))}</button>
    </form>`;
  }

  K.pages.tourNew = pageTourNew;
  K.enter.tourNew = () => { F.preset = 'arena'; F.stages = null; };
  K.acts.tourNew = () => open('tourNew', null);
  K.binders.push(() => {
    const tf = $('tf');
    if (tf) {
      const box = $('tf-stages');
      const drawStages = () => { box.innerHTML = stageEditor(); };
      const sync = () => {
        const ko = F.preset !== 'arena';
        tf.preset.value = F.preset;
        tf.querySelectorAll('.only-ko').forEach((x) => { x.hidden = !ko; });
        tf.querySelectorAll('.only-arena').forEach((x) => { x.hidden = ko; });
        tf.querySelectorAll('.only-club').forEach((x) => { x.hidden = tf.access.value !== 'club'; });
        $('tf-fmt-hint').textContent = T('hint_' + F.preset);
        tf.max.max = 512;
        tf.max.min = ko ? 3 : 2;
      };
      if (F.stages) drawStages();
      tf.preset.onchange = () => {
        F.preset = tf.preset.value;
        if (PRESETS[F.preset]) F.stages = PRESETS[F.preset]();
        else if (F.preset === 'custom' && !F.stages) F.stages = PRESETS.groups_single();
        drawStages();
        sync();
      };
      tf.addEventListener('change', (e) => { if (!e.target.closest('#tf-stages') && e.target !== tf.preset) sync(); });
      // Sửa một giai đoạn
      const custom = () => { F.preset = 'custom'; tf.preset.value = 'custom'; $('tf-fmt-hint').textContent = T('hint_custom'); };
      box.addEventListener('change', (e) => {
        const el = e.target, i = Number(el.dataset.i), k = el.dataset.k;
        const c = F.stages && F.stages[i];
        if (!c || !k) return;
        const n = Number(el.value);
        if (k === 'type') {
          const nc = STAGE_DEFAULT[el.value]();
          nc.bestOf = c.bestOf;
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
      sync();
      tf.onsubmit = (e) => {
        e.preventDefault();
        $('tf-err').textContent = '';
        const start = new Date(tf.start.value).getTime();
        const ko = F.preset !== 'arena';
        O.send({
          t: 'tourCreate', name: tf.name.value.trim(), desc: tf.desc.value.trim(), format: ko ? 'bracket' : 'arena', startsAt: start - D.skew,
          timeLimit: Number(tf.time.value), minutes: Number(tf.minutes.value), stages: ko ? F.stages : undefined, seeding: tf.seeding.value,
          checkin: tf.checkin.checked, rated: tf.rated.checked, maxPlayers: Number(tf.max.value),
          access: tf.access.value, club: tf.club ? tf.club.value : null,
        });
      };
    }
  });
})();
