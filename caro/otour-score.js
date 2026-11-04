/*
 * Giải đấu Offline – nhập kết quả trên trang giải (máy chủ: server/src/hub/otour-run.js). Ban tổ chức bấm một trận đang
 * chờ (nhánh đấu hoặc danh sách) → khung nhập theo kiểu kết quả của giải:
 *   'score'  – hai ô tỉ số; hoà ở loại trực tiếp hiện thêm ô luân lưu.
 *   'sets'   – điểm từng set (thêm / bớt set), nhắc luật set của bộ môn.
 *   'winner' – nút chọn người thắng (+ Hoà ở vòng tròn / Thụy Sĩ).
 * Trận đã có kết quả: hiện kết quả + nút Huỷ kết quả (nhập lại). K.otScoreHtml(t) – gọi từ otour.js.
 */
(function () {
  'use strict';
  const K = window.CaroTourKit;
  const SP = window.CaroOTourSports;
  if (!K || !SP) return;
  const { O, T, esc, $, D, icon, render } = K;
  const S = { tour: null, match: null, sets: [['', '']] };

  /** Trận theo mã trong các giai đoạn đang hiện (kèm giai đoạn). */
  function find(t, id) {
    for (const v of t.stageViews || []) {
      const all = [...(v.rounds || []).flat(), ...(v.lrounds || []).flat(), ...(v.gf || []), ...(v.third ? [v.third] : []),
        ...(v.places || []).flatMap((p) => p.rounds.flat()), ...(v.groups || []).flatMap((g) => g.rounds.flat())];
      const m = all.find((x) => x && x.id === id);
      if (m) return { m, v };
    }
    return null;
  }
  const canScore = (t) => t && t.canManage && t.status === 'running';
  const elimType = (v) => v.type === 'single' || v.type === 'double';

  K.otScoreHtml = (t) => {
    if (S.tour !== t.id) { S.tour = t.id; S.match = null; }
    if (!canScore(t)) return '';
    const x = S.match && find(t, S.match);
    if (!x) return `<p class="hint score-tools">${esc(T('score_tap_hint'))}</p>`;
    const { m, v } = x;
    const head = `<div class="sp-head"><b>${esc(m.a.name)}</b> <span class="muted">vs</span> <b>${esc(m.b.name)}</b>
      <button type="button" class="ghost sm icon" data-act="otScoreClose" aria-label="${esc(T('close'))}">${icon('close')}</button></div>`;
    if (m.done) {
      const res = m.sets ? m.sets.map((s) => s.join('-')).join(' · ') : `${m.wa}–${m.wb}`;
      return `<div class="score-panel">${head}<p class="hint">${esc(T('score_current', { s: res + (m.extra ? ` (${m.extra.join('-')})` : '') }))}</p>
        <div class="row"><button type="button" class="ghost sm danger" data-act="otUndo">${esc(T('score_undo'))}</button></div></div>`;
    }
    const sp = SP.SPORTS[t.sport] || SP.SPORTS.other;
    let body;
    if (t.result === 'winner') {
      body = `<div class="row">${[m.a, m.b].map((p) => `<button type="button" class="ghost" data-act="otWin" data-uid="${esc(p.uid)}">${esc(T('score_win_for', { name: p.name }))}</button>`).join('')}
        ${elimType(v) ? '' : `<button type="button" class="ghost" data-act="otWin" data-uid="">${esc(T('draw'))}</button>`}</div>`;
      return `<div class="score-panel">${head}${body}</div>`;
    }
    if (t.result === 'sets') {
      const rule = sp.set ? `<p class="hint">${esc(T('ot_set_rule', { to: sp.set.to, by: sp.set.by, bo: m.bo || (t.stages[v.index] || {}).bestOf || sp.bestOf }))}</p>` : '';
      body = `${rule}<div class="sets" id="ots-sets">${S.sets.map((s, i) => `<div class="set-row"><span class="muted">${esc(T('score_set_n', { n: i + 1 }))}</span>
        <input type="number" min="0" max="999" inputmode="numeric" data-set="${i}" data-side="0" value="${s[0]}"><span>–</span><input type="number" min="0" max="999" inputmode="numeric" data-set="${i}" data-side="1" value="${s[1]}"></div>`).join('')}</div>
        <button type="button" class="ghost sm" data-act="otSetAdd">${icon('plus')}${esc(T('score_set_add'))}</button>`;
    } else {
      body = `<div class="set-row"><span class="muted">${esc(T('ot_score'))}</span><input type="number" min="0" max="999" inputmode="numeric" id="ots-a"><span>–</span><input type="number" min="0" max="999" inputmode="numeric" id="ots-b"></div>
        ${elimType(v) ? `<div class="set-row"><span class="muted">${esc(T('ot_pen'))}</span><input type="number" min="0" max="99" inputmode="numeric" id="ots-pa"><span>–</span><input type="number" min="0" max="99" inputmode="numeric" id="ots-pb"></div><p class="hint">${esc(T('ot_pen_hint'))}</p>` : ''}`;
    }
    return `<form class="score-panel" id="ots">${head}${body}<p class="err" id="ots-err"></p><div class="row"><button class="primary">${esc(T('score_save'))}</button></div></form>`;
  };

  const readSets = () => { document.querySelectorAll('#ots-sets [data-set]').forEach((el) => { S.sets[el.dataset.set][el.dataset.side] = el.value; }); };
  K.acts.otScoreClose = () => { S.match = null; render(true); };
  K.acts.otSetAdd = () => { readSets(); if (S.sets.length < 9) S.sets.push(['', '']); render(true); };
  K.acts.otWin = (b) => O.send({ t: 'otScore', id: D.ot.id, match: S.match, ...(b.dataset.uid ? { winner: b.dataset.uid } : { draw: true }) });
  K.acts.otUndo = () => window.CaroConfirm.ask(T('score_undo_confirm')).then((ok) => { if (ok) O.send({ t: 'otUndo', id: D.ot.id, match: S.match }); });

  K.binders.push((body) => {
    const t = D.ot;
    if (K.V.page !== 'ot' || !canScore(t)) return;
    // Bấm một trận đủ hai đội để mở khung nhập
    body.querySelectorAll('.b-match[data-mid], .mrow[data-mid]').forEach((el) => {
      const x = find(t, el.dataset.mid);
      if (!x || !x.m.a || !x.m.a.uid || !x.m.b || !x.m.b.uid || x.m.bye) return;
      el.classList.add('scorable');
      el.onclick = (e) => {
        if (e.target.closest('a, button')) return;
        S.match = el.dataset.mid;
        S.sets = [['', '']];
        render(true);
        const p = document.querySelector('.score-panel');
        if (p) { p.scrollIntoView({ block: 'nearest' }); const f = p.querySelector('input'); if (f) f.focus(); }
      };
    });
    const f = $('ots');
    if (!f) return;
    f.addEventListener('input', readSets);
    f.onsubmit = (e) => {
      e.preventDefault();
      const err = (k) => { $('ots-err').textContent = T(k); };
      if (t.result === 'sets') {
        readSets();
        const sets = S.sets.filter((s) => s[0] !== '' || s[1] !== '');
        if (!sets.length || sets.some((s) => s[0] === '' || s[1] === '')) return err('score_need_sets');
        O.send({ t: 'otScore', id: t.id, match: S.match, sets: sets.map((s) => s.map(Number)) });
        return;
      }
      const a = $('ots-a').value, b = $('ots-b').value;
      if (a === '' || b === '') return err('ot_need_score');
      const pa = $('ots-pa') ? $('ots-pa').value : '', pb = $('ots-pb') ? $('ots-pb').value : '';
      O.send({ t: 'otScore', id: t.id, match: S.match, score: [Number(a), Number(b)], ...(pa !== '' && pb !== '' ? { pen: [Number(pa), Number(pb)] } : {}) });
    };
  });
  // Lưu xong (trận đã có kết quả trong bản cập nhật): đóng khung; lỗi: hiện trong khung
  O.on('otPatch', () => { const x = S.match && D.ot && find(D.ot, S.match); if (x && x.m.done && document.getElementById('ots')) { S.match = null; render(true); } });
  O.on('error', (m) => { if ((m.ctx === 'otScore' || m.ctx === 'otUndo') && $('ots-err')) $('ots-err').textContent = T('srv_' + m.code, m.args || {}); });
})();
