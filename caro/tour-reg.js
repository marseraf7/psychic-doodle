/*
 * Giải đấu – đăng ký trên trang giải (máy chủ: server/src/hub/tour-reg.js):
 *  - Điều kiện tham gia hiện thành các nhãn (hạn chót, Elo, số ván, tuổi tài khoản, cần mã vào, BTC duyệt, danh sách chờ).
 *  - Giải cần mã vào / có câu hỏi: bấm Đăng ký mở form nhỏ ngay trên trang (mã + câu trả lời).
 *  - Đang ở hàng chờ duyệt / danh sách chờ: hiện trạng thái + vị trí, nút rời hàng.
 *  - Ban tổ chức: duyệt người đăng ký (kèm câu trả lời), xem danh sách chờ và mã vào, Bulk Add (dán nhiều dòng hoặc
 *    tệp CSV – giải trực tuyến theo tên đăng nhập, giải offline theo tên người chơi), xem câu trả lời của người đã vào.
 *   K.regHtml(t) – vẽ các khối trên. Nạp sau tour.js.
 */
(function () {
  'use strict';
  const K = window.CaroTourKit;
  if (!K) return;
  const { O, T, esc, $, D, when, icon, render, fold } = K;
  const R = { form: null, result: null, names: '' }; // form đăng ký đang mở (mã giải), kết quả Bulk Add gần nhất, chữ đang dán

  const needsForm = (t) => t.reg && (t.reg.hasCode || (t.reg.questions || []).length);

  function chips(t) {
    const r = t.reg;
    if (!r || t.offline || !['pending', 'scheduled'].includes(t.status)) return '';
    const c = [];
    if (r.closeAt) c.push(T('reg_chip_close', { t: when(r.closeAt) }));
    if (r.minRating) c.push(T('reg_chip_min', { n: r.minRating }));
    if (r.maxRating) c.push(T('reg_chip_max', { n: r.maxRating }));
    if (r.minGames) c.push(T('reg_chip_games', { n: r.minGames }));
    if (r.minAccountDays) c.push(T('reg_chip_days', { n: r.minAccountDays }));
    if (r.hasCode) c.push(T('reg_chip_code'));
    if (r.approval) c.push(T('reg_chip_approval'));
    if (r.waitlist) c.push(T('reg_chip_waitlist'));
    return c.length ? `<p class="reg-chips">${c.map((x) => `<span class="pill">${esc(x)}</span>`).join('')}</p>` : '';
  }

  /** Form đăng ký (mã vào + câu hỏi). */
  function joinForm(t) {
    if (R.form !== t.id || !t.canJoin) return '';
    const qs = (t.reg.questions || []).map((q, i) => q.type === 'choice'
      ? `<label class="field"><span>${esc(q.q)}</span><select data-ans="${i}" required><option value="">—</option>${q.opts.map((o) => `<option>${esc(o)}</option>`).join('')}</select></label>`
      : `<label class="field"><span>${esc(q.q)}</span><input data-ans="${i}" maxlength="200" required></label>`).join('');
    return `<form id="rf" class="tform reg-form"><b>${esc(T('reg_form_title'))}</b>
      ${t.reg.hasCode ? `<label class="field"><span>${esc(T('reg_code'))}</span><input name="code" maxlength="40" required autocomplete="off"></label>` : ''}${qs}
      <p class="err" id="rf-err"></p>
      <div class="row"><button type="button" class="ghost" data-act="regCancel">${esc(T('cancel'))}</button><button class="primary">${esc(T('tour_join'))}</button></div></form>`;
  }

  function myQueue(t) {
    const q = t.myQueue;
    if (!q) return '';
    const msg = q.state === 'pending' ? T('reg_my_pending') : T('reg_my_wait', { n: q.pos });
    return `<div class="mycard"><b>${icon('clock')}${esc(msg)}</b><button type="button" class="ghost sm" data-act="regLeave">${esc(T('reg_leave_queue'))}</button></div>`;
  }

  /** Câu trả lời đăng ký: "Câu 1: …; Câu 2: …". */
  const answersText = (t, a) => (a && a.length ? (t.reg.questions || []).map((q, i) => `${q.q}: ${a[i] || '—'}`).join(' · ') : '');

  function managerHtml(t) {
    const A = t.regAdmin;
    if (!A || !t.canManage) return '';
    let html = '';
    const pend = A.queue.filter((x) => x.state === 'pending'), wait = A.queue.filter((x) => x.state === 'wait');
    if (A.code) html += `<p class="hint">${esc(T('reg_code_is'))} <code class="code">${esc(A.code)}</code></p>`;
    const open = ['pending', 'scheduled'].includes(t.status);
    if (pend.length && open && K.can(t, 'reg')) {
      html += fold(t.id + ':pend', `<b>${esc(T('reg_pending_title'))}</b> <span class="count">${pend.length}</span>`, `<ul class="people">${pend.map((x) => `<li><div class="pn"><b>${esc(x.name)}</b>
        <small>${esc(String(x.rating))} · ${esc(when(x.at))}</small>${x.answers ? `<small class="ans">${esc(answersText(t, x.answers))}</small>` : ''}</div>
        <div class="row"><button type="button" class="ghost sm danger" data-act="regDecide" data-uid="${esc(x.uid)}" data-v="0">${esc(T('reject'))}</button>
        <button type="button" class="primary sm" data-act="regDecide" data-uid="${esc(x.uid)}" data-v="1">${esc(T('approve'))}</button></div></li>`).join('')}</ul>`, true);
    }
    if (wait.length) {
      html += fold(t.id + ':wait', `<b>${esc(T('reg_wait_title'))}</b> <span class="muted">${wait.length}</span>`,
        `<ol class="people">${wait.map((x) => `<li><div class="pn"><b>${esc(x.name)}</b><small>${esc(String(x.rating))}</small>${x.answers ? `<small class="ans">${esc(answersText(t, x.answers))}</small>` : ''}</div></li>`).join('')}</ol>`, false);
    }
    const ans = Object.entries(A.answers || {});
    if (ans.length) {
      const name = (u) => (t.players.find((p) => p.uid === u) || {}).name || '?';
      html += fold(t.id + ':ans', `<b>${esc(T('reg_answers_title'))}</b>`, `<ul class="people">${ans.map(([u, a]) => `<li><div class="pn"><b>${esc(name(u))}</b><small class="ans">${esc(answersText(t, a))}</small></div></li>`).join('')}</ul>`, false);
    }
    if (open && K.can(t, 'players')) {
      const res = R.result && R.result.id === t.id ? R.result : null;
      const line = (k, list) => (list && list.length ? `<li><b>${esc(T('reg_res_' + k, { n: list.length }))}</b> <small>${esc(list.join(', '))}</small></li>` : '');
      html += fold(t.id + ':bulk', `<b>${icon('plus')}${esc(T(t.offline ? 'reg_bulk_title_off' : 'reg_bulk_title'))}</b>`, `<div class="bulk">
        <p class="hint">${esc(T(t.offline ? 'reg_bulk_hint_off' : 'reg_bulk_hint'))}</p>
        <textarea id="bulk-names" rows="5" placeholder="${esc(T(t.offline ? 'reg_bulk_ph_off' : 'reg_bulk_ph'))}">${esc(R.names)}</textarea>
        <div class="row"><label class="ghost sm file-btn">${icon('book')}${esc(T('reg_bulk_csv'))}<input type="file" id="bulk-file" accept=".csv,.txt,text/csv,text/plain" hidden></label>
          <button type="button" class="ghost sm" data-act="bulkSample">${esc(T('reg_bulk_sample'))}</button>
          <button type="button" class="primary sm" data-act="bulkAdd">${esc(T('reg_bulk_add'))}</button></div>
        ${res ? `<ul class="bulk-res">${line('added', res.added)}${line('already', res.already)}${line('missing', res.missing)}${line('full', res.full)}${line('bad', res.bad)}</ul>` : ''}</div>`,
      t.offline && !t.players.length);
    }
    return html;
  }

  K.regHtml = (t) => chips(t) + joinForm(t) + myQueue(t) + managerHtml(t);

  // Dòng tiêu đề của tệp mẫu (cả 4 ngôn ngữ) và các tiêu đề thường gặp
  const HEADERS = /^(#|stt|name|tên|ten|username|tên người chơi|tên đăng nhập|player name|имя игрока|логин|选手名|用户名)$/i;
  /** Tách dòng của tệp CSV / văn bản: lấy cột đầu (bỏ dấu ngoặc kép), bỏ dòng tiêu đề. */
  function csvNames(text) {
    return String(text).split(/\r\n|\n|\r/).map((line) => line.split(/[,;\t]/)[0].trim().replace(/^"(.*)"$/, '$1').trim())
      .filter((x) => x && !HEADERS.test(x));
  }

  // ------------------------------------------------------------ Thao tác
  K.acts.join = () => {
    const t = D.tour;
    if (needsForm(t)) { R.form = t.id; render(true); const f = $('rf'); const first = f && f.querySelector('input, select'); if (first) first.focus(); return; }
    O.send({ t: 'tourJoin', id: t.id });
  };
  K.acts.regCancel = () => { R.form = null; render(true); };
  K.acts.regLeave = () => { O.send({ t: 'tourLeave', id: D.tour.id }); };
  K.acts.regDecide = (b) => { b.disabled = true; O.send({ t: 'tourRegDecide', id: D.tour.id, uid: b.dataset.uid, accept: b.dataset.v === '1' }); };
  K.acts.bulkAdd = () => {
    const box = $('bulk-names');
    const names = box ? box.value.split(/\r\n|\n|\r/).map((x) => x.trim()).filter(Boolean) : [];
    if (!names.length) return;
    R.names = box.value;
    O.send({ t: 'tourAddPlayers', id: D.tour.id, names });
  };
  // Tệp mẫu CSV (một cột tên, như tệp Excel mẫu của MyLeague nhưng nhẹ hơn)
  K.acts.bulkSample = () => {
    const off = D.tour && D.tour.offline;
    const body = (off ? [T('reg_csv_head_off'), 'Nguyễn Văn An', 'Trần Thị Bình', 'Lê Minh Chi'] : [T('reg_csv_head'), 'tennguoichoi1', 'tennguoichoi2']).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8' }));
    a.download = off ? 'caro-players.csv' : 'caro-usernames.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  };
  K.binders.push(() => {
    const f = $('rf');
    if (f) {
      f.onsubmit = (e) => {
        e.preventDefault();
        const answers = [...f.querySelectorAll('[data-ans]')].sort((a, b) => a.dataset.ans - b.dataset.ans).map((x) => x.value.trim());
        if (answers.some((x) => !x) || (f.code && !f.code.value.trim())) { $('rf-err').textContent = T('srv_tour_answers_required'); return; }
        O.send({ t: 'tourJoin', id: D.tour.id, code: f.code ? f.code.value : undefined, answers });
      };
    }
    const file = $('bulk-file');
    if (file) {
      file.onchange = () => {
        const x = file.files && file.files[0];
        if (!x) return;
        if (x.size > 200000) { O.toast(T('reg_csv_big')); return; }
        x.text().then((text) => {
          const box = $('bulk-names');
          const names = csvNames(text);
          box.value = (box.value.trim() ? box.value.trim() + '\n' : '') + names.join('\n');
          R.names = box.value;
        });
      };
    }
    const box = $('bulk-names');
    if (box) box.oninput = () => { R.names = box.value; };
  });

  O.on('tourAddResult', (m) => {
    R.result = m;
    if (m.added.length) R.names = '';
    if (K.isOpen() && K.V.page === 'tour') render(true);
  });
  // Đăng ký xong (vào giải / hàng chờ): đóng form
  O.on('tour', (m) => { if (m.tour && R.form === m.id && !(m.mine || {}).canJoin) R.form = null; });
  K.regCsvNames = csvNames;
})();
