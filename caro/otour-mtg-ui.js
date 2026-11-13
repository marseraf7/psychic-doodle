/*
 * Giải đấu Offline – phiên draft kiểu Magic: The Gathering (máy chủ: server/src/hub/stages-draft.js; chỉ phần điều hành, không có
 * dữ liệu lá bài): mỗi pod một bàn tròn – thứ tự ghế (bốc ngẫu nhiên), chiều chuyền từng gói, ai đã nộp danh sách bài (số lá).
 * Ban tổ chức dán danh sách bài của từng người (máy chủ chỉ đếm số lá, không lưu nội dung).
 * K.mtgHtml(t, v) – tour-stages.js gọi khi v.draft; K.mtgEdit / K.mtgChange – ô cấu hình (otour-swiss-edit.js, otour-route-edit.js).
 * Nạp sau tour-stages.js.
 */
(function () {
  'use strict';
  const K = window.CaroTourKit;
  if (!K) return;
  const { T, esc, O, D } = K;
  const S = { err: '' };

  K.mtgHtml = (t, v) => {
    const Dr = v.draft, can = t.canManage && t.status === 'running' && v.index === (t.stage || 0);
    const pass = Dr.pass.map((d, k) => T('mtg_pack_n', { n: k + 1, d: T('mtg_pass_' + d) })).join(' · ');
    const pods = Dr.pods.map((p, k) => `<div class="mtg-pod"><b>${esc(T('mtg_pod_n', { n: k + 1 }))}</b><ol class="mtg-seats">${p.map((x) => `<li>${esc(x.name)}${x.deck ? ` <small class="pill">${esc(T('mtg_deck_n', { n: x.deck }))}</small>` : Dr.decklist ? ` <small class="muted">${esc(T('mtg_deck_wait'))}</small>` : ''}</li>`).join('')}</ol></div>`).join('');
    const all = Dr.pods.flat();
    const form = can ? `<form class="mtg-form"><label class="field"><span>${esc(T('mtg_deck_who'))}</span><select name="uid">${all.map((x) => `<option value="${esc(x.uid)}">${esc(x.name)}</option>`).join('')}</select></label>
      <label class="field"><span>${esc(T('mtg_deck_list'))}</span><textarea name="list" rows="4" placeholder="${esc(T('mtg_deck_ph'))}"></textarea><small class="hint">${esc(T('mtg_deck_hint', { n: Dr.min }))}</small></label>
      <p class="err">${esc(S.err)}</p><div class="row"><button class="primary">${esc(T('mtg_deck_save'))}</button></div></form>` : '';
    const body = () => `<p class="hint">${esc(T('mtg_note', { n: Dr.packs }))} ${esc(pass)}${Dr.decklist ? ' · ' + esc(T('mtg_need_deck')) : ''}</p><div class="mtg-pods">${pods}</div>${form}`;
    return K.fold(`${t.id}:mtg${v.index}:${Dr.block}`, `<b>${esc(T('mtg_title', { n: Dr.block + 1 }))}</b>`, body, true);
  };

  // ---- Form giai đoạn: K.mtgEdit(i, c, pod) – ô bật draft (Thụy Sĩ có pod / loại trực tiếp); K.mtgChange(c, k, el)
  const chk = (i, k, v, label) => `<label class="check"><input type="checkbox" data-i="${i}" data-k="${k}" ${v ? 'checked' : ''}> <span>${esc(label)}</span></label>`;
  const num = (i, k, v, min, max) => `<label class="field inline"><span>${esc(T('mtg_packs'))}</span><input type="number" data-i="${i}" data-k="${k}" value="${v}" min="${min}" max="${max}"></label>`;
  K.mtgEdit = (i, c, pod) => {
    const d = c.draft;
    const f = [chk(i, 'mtgOn', !!d, T(pod ? 'opt_mtg_pod' : 'opt_mtg_top'))];
    if (d) f.push(num(i, 'mtgPacks', d.packs || 3, 1, 5), chk(i, 'mtgDeck', !!d.decklist, T('opt_mtg_deck')), ...(pod ? [chk(i, 'mtgCross', d.cross !== false, T('opt_mtg_cross'))] : []), `<small class="hint">${esc(T('opt_mtg_hint'))}</small>`);
    return f;
  };
  K.mtgChange = (c, k, el) => {
    if (k === 'mtgOn') { if (el.checked) c.draft = { packs: 3 }; else delete c.draft; return true; }
    if (!c.draft) return false;
    if (k === 'mtgPacks') { c.draft = { ...c.draft, packs: Math.max(1, Math.min(5, Math.floor(Number(el.value)) || 3)) }; delete c.draft.pass; return true; }
    if (k === 'mtgDeck') { c.draft = { ...c.draft, decklist: el.checked }; return true; }
    if (k === 'mtgCross') { c.draft = { ...c.draft, cross: el.checked }; return true; }
    return false;
  };

  K.binders.push((body) => {
    const f = body.querySelector('.mtg-form');
    if (!f) return;
    f.onsubmit = (e) => {
      e.preventDefault();
      S.err = '';
      S.on = true;
      O.send({ t: 'otDeck', id: D.ot.id, uid: f.elements.uid.value, list: f.elements.list.value });
    };
  });
  if (!O) return;
  O.on('error', (m) => {
    if (m.ctx !== 'otDeck' && !(m.ctx === 'otScore' && m.code === 'ot_deck_missing')) return;
    S.err = T('srv_' + m.code, m.args || {});
    const el = document.querySelector('.mtg-form .err');
    if (el) el.textContent = S.err;
  });
  O.on('otPatch', () => { if (S.on) { S.on = false; S.err = ''; } });
})();
