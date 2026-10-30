/*
 * Giải đấu – kéo thả xếp nhánh trước giai đoạn loại trực tiếp / nhánh thắng – thua (như Challonge). Máy chủ:
 * server/src/hub/tour-arrange.js. Giai đoạn trước xong mà giải bật "Dừng lại để xếp nhánh":
 *  - Ban tổ chức (quyền Người chơi) thấy các cặp vòng 1; kéo một người thả lên ô khác để đổi chỗ (máy tính), hoặc
 *    bấm ô thứ nhất rồi bấm ô thứ hai (điện thoại). Mỗi lần đổi lưu ngay lên máy chủ – đồng ban tổ chức cùng thấy.
 *    Cặp hai người cùng bảng được tô cảnh báo. "Về mặc định" (như bốc thăm tự động), "Bắt đầu giai đoạn N".
 *  - Người chơi / người xem: dòng "Ban tổ chức đang xếp nhánh giai đoạn N".
 *   K.arrangeHtml(t) – khung ở trang giải (tour.js). Nạp sau tour.js.
 */
(function () {
  'use strict';
  const K = window.CaroTourKit;
  if (!K) return;
  const { O, T, esc, D, icon, render } = K;
  let pick = null; // ô đang chọn (bấm để đổi chỗ)

  const uidOf = (x) => (x && x.uid) || '-';
  function slotHtml(x, i) {
    const body = x && x.uid
      ? `<span class="seed">${x.seed || ''}</span><span class="nm">${esc(x.name)}</span>${x.label ? `<small class="lbl">${esc(x.label)}</small>` : ''}`
      : `<span class="nm muted">${esc(T('bye'))}</span>`;
    return `<div class="ar-slot ${pick === i ? 'on' : ''} ${x && x.uid ? '' : 'bye'}" draggable="true" data-ar="${i}" tabindex="0" role="button"
      aria-label="${esc((x && x.name) || T('bye'))}">${icon('menu')}${body}</div>`;
  }

  K.arrangeHtml = (t) => {
    if (t.status !== 'running' || t.arranging == null) return '';
    const a = t.arrange;
    if (!a) return `<p class="note">${esc(T('arr_wait', { n: t.arranging + 1 }))}</p>`;
    const pairs = [];
    for (let i = 0; i < a.slots.length; i += 2) {
      const x = a.slots[i], y = a.slots[i + 1];
      const same = x && y && x.g != null && x.g === y.g; // hai người cùng bảng gặp nhau ngay vòng 1
      pairs.push(`<div class="ar-pair ${same ? 'warn' : ''}"><small class="muted">${esc(T('arr_match', { n: i / 2 + 1 }))}${same ? ' · ' + esc(T('arr_same_group')) : ''}</small>${slotHtml(x, i)}${slotHtml(y, i + 1)}</div>`);
    }
    return `<section class="ar-box" id="ar-box"><h4>${icon('fork')}${esc(T('arr_title', { n: a.stage + 1 }))}</h4>
      <p class="hint">${esc(T('arr_hint'))}</p>
      <div class="ar-grid">${pairs.join('')}</div>
      <div class="row"><button type="button" class="ghost sm" data-act="arrReset">${icon('retry')}${esc(T('arr_reset'))}</button>
        <button type="button" class="primary" data-act="arrGo">${icon('play')}${esc(T('arr_go', { n: a.stage + 1 }))}</button></div></section>`;
  };

  /** Đổi chỗ hai ô, vẽ lại ngay và lưu lên máy chủ. */
  function swap(i, j) {
    const a = D.tour && D.tour.arrange;
    pick = null;
    if (!a || i === j || !a.slots[i] || !a.slots[j]) { render(true); return; }
    [a.slots[i], a.slots[j]] = [a.slots[j], a.slots[i]];
    render(true);
    O.send({ t: 'tourArrange', id: D.tour.id, slots: a.slots.map(uidOf) });
  }

  K.acts.arrReset = () => { pick = null; O.send({ t: 'tourArrange', id: D.tour.id, slots: null }); };
  K.acts.arrGo = () => {
    const a = D.tour.arrange;
    window.CaroConfirm.ask(T('arr_go_confirm', { n: a.stage + 1 })).then((ok) => {
      if (ok) O.send({ t: 'tourArrangeGo', id: D.tour.id, slots: a.slots.map(uidOf) });
    });
  };

  K.binders.push((body) => {
    const box = body.querySelector('#ar-box');
    if (!box) return;
    // Bấm / Enter: chọn ô thứ nhất, rồi ô thứ hai để đổi chỗ
    const choose = (el) => {
      const i = Number(el.dataset.ar);
      if (pick === null) { pick = i; render(true); } else swap(pick, i);
    };
    box.onclick = (e) => { const el = e.target.closest('[data-ar]'); if (el) choose(el); };
    box.onkeydown = (e) => { const el = e.target.closest('[data-ar]'); if (el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); choose(el); } };
    // Kéo thả (máy tính)
    box.ondragstart = (e) => {
      const el = e.target.closest('[data-ar]');
      if (!el) return;
      e.dataTransfer.setData('text/plain', el.dataset.ar);
      e.dataTransfer.effectAllowed = 'move';
      el.classList.add('drag');
    };
    box.ondragend = (e) => { const el = e.target.closest('[data-ar]'); if (el) el.classList.remove('drag'); };
    box.ondragover = (e) => { const el = e.target.closest('[data-ar]'); if (el) { e.preventDefault(); el.classList.add('over'); } };
    box.ondragleave = (e) => { const el = e.target.closest('[data-ar]'); if (el) el.classList.remove('over'); };
    box.ondrop = (e) => {
      const el = e.target.closest('[data-ar]');
      if (!el) return;
      e.preventDefault();
      const from = Number(e.dataTransfer.getData('text/plain'));
      if (Number.isInteger(from)) swap(from, Number(el.dataset.ar));
    };
  });
})();
