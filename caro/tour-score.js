/*
 * Giải đấu – ban tổ chức nhập / sửa kết quả trên trang giải (máy chủ: server/src/hub/tour-score.js):
 *  - Giải offline: bấm một trận → khung nhập tỉ số từng set (thêm / bớt dòng), kết quả phụ (luân lưu) khi hoà;
 *    Lưu, Huỷ KQ (trận trở về chưa đấu), In biên bản. Tỉ số trận tự tính theo cách tính của giải (số set / tổng điểm).
 *  - Giải trực tuyến: trận chưa đấu / không đấu được thì xử thắng cho một bên (ghi đè).
 *  - Thanh công cụ: in biên bản các trận đang chờ, in biên bản trắng (tour-sheet.js).
 *   K.scoreHtml(t) – khung nhập (đầu trang giải). Nạp sau tour.js, tour-stages.js, tour-sheet.js.
 */
(function () {
  'use strict';
  const K = window.CaroTourKit;
  if (!K) return;
  const { O, T, esc, $, D, icon, render, me } = K;
  // Trận đang mở khung nhập (của giải nào); saving: vừa bấm Lưu trận này – máy chủ ghi xong thì đóng khung
  const S = { tour: null, match: null, sets: null, extra: false, saving: null };

  const canScore = (t) => t && t.format === 'bracket' && t.status === 'running' && K.can(t, 'results');
  /** Người chơi tự báo tỉ số trận của mình (giải offline bật "selfReport", người chơi có tài khoản – như Challonge). */
  const selfOn = (t) => t && t.offline && t.selfReport && t.format === 'bracket' && t.status === 'running' && !!me();
  const mine = (t, m) => selfOn(t) && m && !m.done && !m.bye && m.a && m.b && (m.a.uid === me().uid || m.b.uid === me().uid);
  /** Mọi trận đang hiện của các giai đoạn (để tìm theo mã). */
  function allMatches(t) {
    const out = [];
    for (const v of t.stageViews || []) {
      const push = (list) => { for (const m of list || []) if (m) out.push({ m, v }); };
      for (const r of v.rounds || []) push(r);
      for (const r of v.lrounds || []) push(r);
      push(v.gf);
      if (v.third) push([v.third]);
      for (const p of v.places || []) for (const r of p.rounds) push(r);
      for (const g of v.groups || []) for (const r of g.rounds) push(r);
    }
    return out;
  }
  const find = (t, id) => allMatches(t).find((x) => x.m.id === id) || null;
  /** Trận đang chờ nhập (đủ 2 người, chưa xong) của giai đoạn hiện tại. */
  const waiting = (t) => allMatches(t).filter(({ m, v }) => v.index === (t.stage || 0) && !m.done && m.a && m.a.uid && m.b && m.b.uid && !m.bye);
  /** "21-15 · 15-21 (5-3)". */
  const setsText = (m) => (m.sets ? m.sets.map((s) => s.join('-')).join(' · ') + (m.extra ? ` (${m.extra.join('-')})` : '') : '');

  function rowsHtml() {
    return S.sets.map((s, i) => `<div class="set-row"><span class="muted">${esc(T('score_set_n', { n: i + 1 }))}</span>
      <input type="number" inputmode="numeric" min="0" max="999" data-set="${i}" data-side="0" value="${s[0] === '' ? '' : s[0]}" aria-label="${esc(T('score_set_n', { n: i + 1 }))} A">
      <span>–</span><input type="number" inputmode="numeric" min="0" max="999" data-set="${i}" data-side="1" value="${s[1] === '' ? '' : s[1]}" aria-label="${esc(T('score_set_n', { n: i + 1 }))} B">
      ${S.sets.length > 1 ? `<button type="button" class="ghost sm icon" data-act="setDel" data-i="${i}" aria-label="${esc(T('score_set_del'))}">${icon('close')}</button>` : ''}</div>`).join('');
  }

  function panel(t) {
    const x = find(t, S.match);
    if (!x) return '';
    const { m } = x;
    const head = `<div class="sp-head"><b>${esc(m.a ? m.a.name : '—')}</b> <span class="muted">vs</span> <b>${esc(m.b ? m.b.name : '—')}</b>
      <button type="button" class="ghost sm icon" data-act="scoreClose" aria-label="${esc(T('close'))}">${icon('close')}</button></div>`;
    if (!t.offline) {
      // Giải trực tuyến: chỉ xử thắng trận chưa đấu / không đang đấu
      if (m.done || m.live) return `<div class="score-panel">${head}<p class="hint">${esc(T(m.done ? 'score_done_online' : 'score_live'))}</p></div>`;
      return `<div class="score-panel">${head}<p class="hint">${esc(T('score_override_hint'))}</p><div class="row">
        <button type="button" class="ghost" data-act="scoreWin" data-uid="${esc(m.a.uid)}">${esc(T('score_win_for', { name: m.a.name }))}</button>
        <button type="button" class="ghost" data-act="scoreWin" data-uid="${esc(m.b.uid)}">${esc(T('score_win_for', { name: m.b.name }))}</button></div></div>`;
    }
    const done = m.done ? `<p class="hint">${esc(T('score_current', { s: setsText(m) || `${m.wa}–${m.wb}` }))}</p>` : '';
    return `<form class="score-panel" id="sp">${head}${done}
      <p class="hint">${esc(T(t.scoreMode === 'points' ? 'score_mode_points' : 'score_mode_sets'))}</p>
      <div class="sets" id="sp-sets">${rowsHtml()}</div>
      <button type="button" class="ghost sm" data-act="setAdd" ${S.sets.length >= 9 ? 'hidden' : ''}>${icon('plus')}${esc(T('score_set_add'))}</button>
      <label class="check"><input type="checkbox" id="sp-extra-on" ${S.extra ? 'checked' : ''}> <span>${esc(T('score_extra'))}</span></label>
      <div class="set-row" id="sp-extra" ${S.extra ? '' : 'hidden'}><span class="muted">${esc(T('score_extra_short'))}</span>
        <input type="number" min="0" max="999" id="sp-ex0" value="${m.extra ? m.extra[0] : ''}"><span>–</span><input type="number" min="0" max="999" id="sp-ex1" value="${m.extra ? m.extra[1] : ''}"></div>
      <p class="err" id="sp-err"></p>
      ${canScore(t) ? '' : `<p class="hint">${esc(T('score_self_hint'))}</p>`}
      <div class="row">${canScore(t) ? `<button type="button" class="ghost sm" data-act="sheetOne">${icon('book')}${esc(T('sheet_print'))}</button>` : ''}
        ${m.done && canScore(t) ? `<button type="button" class="ghost sm danger" data-act="scoreUndo">${esc(T('score_undo'))}</button>` : ''}
        ${m.done ? '' : `<button class="primary">${esc(T('score_save'))}</button>`}</div></form>`;
  }

  function toolbar(t) {
    if (!t.offline || !K.can(t, 'results') || !['scheduled', 'running'].includes(t.status)) return '';
    const n = t.status === 'running' ? waiting(t).length : 0;
    return `<div class="row score-tools">${t.status === 'running' ? `<span class="hint">${esc(T('score_tap_hint'))}</span>` : ''}
      ${n ? `<button type="button" class="ghost sm" data-act="sheetWaiting">${icon('book')}${esc(T('sheet_waiting', { n }))}</button>` : ''}
      <button type="button" class="ghost sm" data-act="sheetBlank">${icon('book')}${esc(T('sheet_blank'))}</button></div>`;
  }

  K.scoreHtml = (t) => {
    if (S.tour !== t.id) { S.tour = t.id; S.match = null; }
    if (S.saving && S.saving === S.match) { const x = find(t, S.match); if (x && x.m.done) { S.match = null; S.saving = null; } }
    const x = S.match && find(t, S.match);
    return toolbar(t) + (S.match && (canScore(t) || (x && mine(t, x.m))) ? panel(t) : '');
  };
  K.setsText = setsText;

  function open(t, id) {
    const x = find(t, id);
    if (!x || !x.m.a || !x.m.a.uid || !x.m.b || !x.m.b.uid || x.m.bye || !(canScore(t) || mine(t, x.m))) return;
    S.match = id;
    S.sets = x.m.sets ? x.m.sets.map((s) => [...s]) : [['', '']];
    S.extra = !!x.m.extra;
    render(true);
    const p = document.querySelector('.score-panel');
    if (p) { p.scrollIntoView({ block: 'nearest' }); const f = p.querySelector('input[type=number]'); if (f && !x.m.done) f.focus(); }
  }
  /** Đọc các ô set đang nhập vào S.sets (giữ khi vẽ lại). */
  function readSets() {
    document.querySelectorAll('#sp-sets [data-set]').forEach((el) => { S.sets[el.dataset.set][el.dataset.side] = el.value === '' ? '' : Number(el.value); });
  }

  K.acts.scoreClose = () => { S.match = null; render(true); };
  K.acts.setAdd = () => { readSets(); if (S.sets.length < 9) S.sets.push(['', '']); render(true); };
  K.acts.setDel = (b) => { readSets(); S.sets.splice(Number(b.dataset.i), 1); render(true); };
  K.acts.scoreUndo = () => {
    window.CaroConfirm.ask(T('score_undo_confirm')).then((ok) => { if (ok) O.send({ t: 'tourScoreUndo', id: D.tour.id, match: S.match }); });
  };
  K.acts.scoreWin = (b) => {
    window.CaroConfirm.ask(T('score_override_confirm', { name: b.textContent })).then((ok) => {
      if (!ok) return;
      S.saving = S.match;
      O.send({ t: 'tourScore', id: D.tour.id, match: S.match, winner: b.dataset.uid });
    });
  };
  const sheetOf = (list, blank) => window.CaroTourSheet.print(D.tour, list, { blank });
  K.acts.sheetOne = () => { const x = find(D.tour, S.match); if (x) sheetOf([x], false); };
  K.acts.sheetWaiting = () => sheetOf(waiting(D.tour), false);
  K.acts.sheetBlank = () => sheetOf(D.tour.status === 'running' ? waiting(D.tour) : [], true);

  K.binders.push((body) => {
    const t = D.tour;
    if (!(canScore(t) || selfOn(t)) || K.V.page !== 'tour') return;
    // Bấm một trận (nhánh đấu hoặc danh sách) để mở khung nhập – người tự báo: chỉ trận chưa xong của mình
    body.querySelectorAll('.b-match[data-mid], .mrow[data-mid]').forEach((el) => {
      if (!canScore(t)) { const x = find(t, el.dataset.mid); if (!x || !mine(t, x.m)) return; }
      el.classList.add('scorable');
      el.onclick = (e) => { if (e.target.closest('a, button')) return; open(t, el.dataset.mid); };
    });
    const f = $('sp');
    if (!f) return;
    $('sp-extra-on').onchange = (e) => { S.extra = e.target.checked; $('sp-extra').hidden = !S.extra; };
    f.addEventListener('input', readSets);
    f.onsubmit = (e) => {
      e.preventDefault();
      readSets();
      const sets = S.sets.filter((s) => s[0] !== '' || s[1] !== '');
      if (!sets.length || sets.some((s) => s[0] === '' || s[1] === '')) { $('sp-err').textContent = T('score_need_sets'); return; }
      const ex = S.extra ? [$('sp-ex0').value, $('sp-ex1').value] : null;
      if (ex && (ex[0] === '' || ex[1] === '')) { $('sp-err').textContent = T('score_need_extra'); return; }
      S.saving = S.match;
      O.send({ t: 'tourScore', id: t.id, match: S.match, sets, extra: ex ? ex.map(Number) : undefined });
    };
  });
})();
