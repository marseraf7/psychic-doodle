/*
 * Giải đấu – các ô đăng ký nâng cao ở trang Cài đặt nâng cao (cắm vào bản nháp của tour-form.js qua K.tourDraft.EXT):
 *  - Giải offline: ban tổ chức tự nhập danh sách người chơi (Bulk Add) và tỉ số theo set; trận đấu ngoài đời.
 *    Cách tính tỉ số trận: số set thắng / tổng điểm các set.
 *  - Hạn chót đăng ký, duyệt tay, danh sách chờ, điều kiện (Elo, số ván tính Elo, tuổi tài khoản), mã vào giải,
 *    câu hỏi khi đăng ký (≤ 5), giờ mở điểm danh.
 * Máy chủ: server/src/hub/tour-reg.js. Nạp sau tour-form.js, trước tour-adv.js.
 */
(function () {
  'use strict';
  const K = window.CaroTourKit;
  if (!K || !K.tourDraft) return;
  const { T, esc, D, icon } = K;
  const DR = K.tourDraft;
  const MAX_Q = 5;
  const CHECKIN_MIN = [10, 15, 30, 60, 120, 1440, 2880];

  Object.assign(DR.EXT.defaults, {
    offline: false, scoreMode: 'sets', closeAt: '', approval: false, waitlist: false,
    minRating: '', maxRating: '', minGames: '', minAccountDays: '', code: '', checkinMin: '10', questions: [],
  });

  const num = (name, v, min, max, label) => `<label class="field inline"><span>${esc(label)}</span><input type="number" name="${name}" min="${min}" max="${max}" value="${esc(v)}" placeholder="—"></label>`;
  const chk = (name, v, label, cls = '') => `<label class="check ${esc(cls)}"><input type="checkbox" name="${name}" ${v ? 'checked' : ''}> <span>${esc(label)}</span></label>`;
  const minutesLabel = (n) => (n >= 1440 ? T('days_n', { n: n / 1440 }) : n >= 60 ? T('hours_n', { n: n / 60 }) : T('minutes_n', { n }));

  function questionRows(list) {
    return list.map((q, i) => `<div class="q-row" data-qi="${i}">
      <input data-q="q" maxlength="120" value="${esc(q.q || '')}" placeholder="${esc(T('reg_q_ph'))}" aria-label="${esc(T('reg_q_ph'))}">
      <select data-q="type" aria-label="${esc(T('reg_q_type'))}"><option value="text" ${q.type !== 'choice' ? 'selected' : ''}>${esc(T('reg_q_text'))}</option><option value="choice" ${q.type === 'choice' ? 'selected' : ''}>${esc(T('reg_q_choice'))}</option></select>
      <input data-q="opts" maxlength="300" value="${esc(q.opts || '')}" placeholder="${esc(T('reg_q_opts'))}" aria-label="${esc(T('reg_q_opts'))}" ${q.type === 'choice' ? '' : 'hidden'}>
      <button type="button" class="ghost sm icon" data-qact="del" data-qi="${i}" aria-label="${esc(T('reg_q_del'))}" title="${esc(T('reg_q_del'))}">${icon('close')}</button></div>`).join('');
  }

  Object.assign(DR.FIELDS, {
    offline: (d) => `<div class="only-ko" hidden>${chk('offline', d.offline, T('reg_offline'))}<p class="hint">${esc(T('reg_offline_hint'))}</p></div>`,
    scoreMode: (d) => `<label class="field only-offline" hidden><span>${esc(T('reg_score_mode'))}</span><select name="scoreMode">
      <option value="sets" ${d.scoreMode !== 'points' ? 'selected' : ''}>${esc(T('reg_score_sets'))}</option>
      <option value="points" ${d.scoreMode === 'points' ? 'selected' : ''}>${esc(T('reg_score_points'))}</option></select></label>`,
    closeAt: (d) => `<label class="field only-online"><span>${esc(T('reg_close_at'))}</span><input type="datetime-local" name="closeAt" value="${esc(d.closeAt)}"></label>`,
    approval: (d) => chk('approval', d.approval, T('reg_approval'), 'only-online'),
    waitlist: (d) => chk('waitlist', d.waitlist, T('reg_waitlist'), 'only-online'),
    limits: (d) => `<fieldset class="only-online"><legend>${esc(T('reg_limits'))}</legend><div class="reg-limits">
      ${num('minRating', d.minRating, 100, 4000, T('reg_min_rating'))}${num('maxRating', d.maxRating, 100, 4000, T('reg_max_rating'))}
      ${num('minGames', d.minGames, 1, 10000, T('reg_min_games'))}${num('minAccountDays', d.minAccountDays, 1, 3650, T('reg_min_days'))}</div></fieldset>`,
    code: (d) => `<label class="field only-online"><span>${esc(T('reg_code'))}</span><input name="code" maxlength="40" value="${esc(d.code)}" placeholder="${esc(T('reg_code_ph'))}" autocomplete="off"></label>`,
    checkinMin: (d) => `<label class="field short only-ko only-online" hidden><span>${esc(T('reg_checkin_at'))}</span><select name="checkinMin">${CHECKIN_MIN.map((n) => `<option value="${n}" ${String(n) === String(d.checkinMin) ? 'selected' : ''}>${esc(T('reg_before', { t: minutesLabel(n) }))}</option>`).join('')}</select></label>`,
    questions: (d) => `<fieldset class="only-online reg-qs"><legend>${esc(T('reg_questions'))}</legend><p class="hint">${esc(T('reg_questions_hint'))}</p>
      <div class="q-list">${questionRows(d.questions || [])}</div>
      <button type="button" class="ghost sm" data-qact="add" ${(d.questions || []).length >= MAX_Q ? 'hidden' : ''}>${icon('plus')}${esc(T('reg_q_add'))}</button></fieldset>`,
  });

  // Câu hỏi không phải một ô form: đọc từ các dòng .q-row
  DR.EXT.collectors.push((form, d) => {
    const rows = form.querySelectorAll('.q-row');
    if (!form.querySelector('.reg-qs')) return; // form nhanh không có câu hỏi: giữ nguyên nháp
    d.questions = [...rows].map((r) => ({ q: r.querySelector('[data-q="q"]').value, type: r.querySelector('[data-q="type"]').value, opts: r.querySelector('[data-q="opts"]').value }));
  });

  const ms = (s) => (s ? new Date(s).getTime() : NaN);
  // Nháp cũ: hạn chót đã qua thì bỏ (không thì chặn mọi người đăng ký)
  DR.EXT.loaders.push((d) => { if (d.closeAt && !(ms(d.closeAt) > Date.now())) d.closeAt = ''; });
  DR.EXT.validators.push((d, { ko }) => {
    if (!ko || d.offline) return null; // Arena bỏ qua "offline"; giải offline không dùng các điều kiện đăng ký
    const close = ms(d.closeAt);
    if (d.closeAt && (!Number.isFinite(close) || close <= Date.now())) return { key: 'closeAt', msg: T('reg_close_bad') };
    if (d.minRating && d.maxRating && Number(d.maxRating) < Number(d.minRating)) return { key: 'maxRating', msg: T('reg_rating_range_bad') };
    for (const q of d.questions || []) {
      if (q.q.trim() && q.type === 'choice' && q.opts.split(',').map((x) => x.trim()).filter(Boolean).length < 2) return { key: 'questions', msg: T('reg_q_opts_few') };
    }
    return null;
  });

  DR.EXT.payloads.push((d, { ko }) => {
    const offline = ko && !!d.offline;
    if (offline) return { offline: true, scoreMode: d.scoreMode, rated: false, checkin: false };
    const n = (v) => (v === '' || v == null ? null : Number(v));
    // Hạn chót sau giờ bắt đầu = không có hạn chót riêng (tới giờ đấu)
    const close = d.closeAt ? ms(d.closeAt) : NaN;
    const start = ms(d.start);
    return {
      offline: false,
      reg: {
        closeAt: Number.isFinite(close) && close <= start ? close - (D.skew || 0) : null, approval: !!d.approval, waitlist: !!d.waitlist,
        minRating: n(d.minRating), maxRating: n(d.maxRating), minGames: n(d.minGames), minAccountDays: n(d.minAccountDays),
        code: d.code.trim() || null, checkinMin: Number(d.checkinMin) || 10,
        questions: (d.questions || []).filter((q) => q.q.trim()).map((q) => ({
          q: q.q.trim(), type: q.type, opts: q.type === 'choice' ? q.opts.split(',').map((x) => x.trim()).filter(Boolean) : undefined,
        })),
      },
    };
  });

  // Thêm / bỏ câu hỏi (chỉ trang nâng cao)
  K.binders.push(() => {
    const form = document.getElementById('ta');
    const box = form && form.querySelector('.reg-qs');
    if (!box) return;
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-qact]');
      if (!b) return;
      DR.collect(form);
      const list = DR.F.d.questions;
      if (b.dataset.qact === 'add' && list.length < MAX_Q) list.push({ q: '', type: 'text', opts: '' });
      if (b.dataset.qact === 'del') list.splice(Number(b.dataset.qi), 1);
      box.querySelector('.q-list').innerHTML = questionRows(list);
      box.querySelector('[data-qact="add"]').hidden = list.length >= MAX_Q;
      DR.collect(form);
      const first = box.querySelector('.q-row:last-child [data-q="q"]');
      if (b.dataset.qact === 'add' && first) first.focus();
    });
    box.addEventListener('change', (e) => {
      if (e.target.dataset.q !== 'type') return;
      const row = e.target.closest('.q-row');
      row.querySelector('[data-q="opts"]').hidden = e.target.value !== 'choice';
    });
  });
})();
