/*
 * Giải đấu Offline – giải nhiều mùa và đăng ký theo lời mời (đợt 4; máy chủ: server/src/hub/otour-next.js,
 * otour-league.js):
 *   K.otNextHtml(t)   – tab Khác: mùa thứ mấy + mùa trước / sau; danh sách đặc cách trọn đời (ban tổ chức sửa);
 *                        giải đã kết thúc: "Tạo mùa sau" (giữ cấu hình, nhà vô địch + đặc cách tự vào, có thể giữ cả
 *                        danh sách đội).
 *   K.otInviteHtml(t) – mục Đăng ký (ban tổ chức): chỉ nhận đăng ký theo lời mời, mời theo tên đăng nhập, bỏ lời mời.
 *   K.otSeasonTag(t)  – nhãn "Mùa n" ở đầu trang giải.
 */
(function () {
  'use strict';
  const K = window.CaroTourKit;
  if (!K) return;
  const { O, T, esc, D, icon } = K;
  const S = { inviteMsg: '' };
  const $ = (id) => document.getElementById(id);

  K.otSeasonTag = (t) => (t.series ? ` · <b>${esc(T('ot_season_n', { n: t.series.n }))}</b>` : '');

  K.otNextHtml = (t) => {
    const sr = t.series;
    const link = (x, k) => (x ? `<button type="button" class="ghost sm" data-act="otOpenSeason" data-id="${esc(x.id)}">${esc(T(k, { n: sr.n + (k === 'ot_season_prev' ? -1 : 1) }))}</button>` : '');
    const links = sr ? `<p>${esc(T('ot_season_n', { n: sr.n }))} ${link(sr.prev, 'ot_season_prev')} ${link(sr.next, 'ot_season_next')}</p>` : '';
    const ex = t.exempt || [];
    let body = links;
    if (t.canManage) {
      body += `<label class="field"><span>${esc(T('ot_exempt'))}</span><textarea id="ot-exempt" rows="4" placeholder="${esc(T('ot_exempt_ph'))}">${esc(ex.join('\n'))}</textarea>
        <small class="hint">${esc(T('ot_exempt_hint'))}</small></label><button type="button" class="ghost sm" data-act="otExemptSave">${esc(T('ot_exempt_save'))}</button>`;
      if (t.status === 'finished' && !(sr && sr.next)) {
        body += `<div class="ot-next"><p class="hint">${esc(T('ot_next_hint'))}</p>
          <label class="check"><input type="checkbox" id="ot-next-carry"> <span>${esc(T('ot_next_carry'))}</span></label>
          <button type="button" class="primary" data-act="otNextSeason">${icon('plus')}${esc(T('ot_next_btn'))}</button></div>`;
      }
    } else if (ex.length) body += `<p><b>${esc(T('ot_exempt'))}:</b> ${esc(ex.join(', '))}</p>`;
    if (!body) return '';
    return `<section class="ot-sec"><h4>${esc(T('ot_series_title'))}</h4>${body}</section>`;
  };

  K.otInviteHtml = (t) => {
    if (!t.canManage || t.status !== 'draft' || !t.reg) return '';
    const list = (t.invited || []).map((x) => `<li>${esc(x.name)} <button type="button" class="ghost sm icon" data-act="otUninvite" data-uid="${esc(x.uid)}" aria-label="${esc(T('ot_invite_del'))}">${icon('close')}</button></li>`).join('');
    return `<div class="ot-invite"><label class="check"><input type="checkbox" id="ot-reg-invite" ${t.regInvite ? 'checked' : ''}> <span>${esc(T('ot_reg_invite'))}</span></label>
      ${t.regInvite ? `<label class="field"><span>${esc(T('ot_invite_names'))}</span><textarea id="ot-invite-in" rows="3" placeholder="${esc(T('ot_invite_ph'))}"></textarea></label>
      <button type="button" class="ghost sm" data-act="otInviteSend">${esc(T('ot_invite_send'))}</button><p class="hint" id="ot-invite-msg">${esc(S.inviteMsg)}</p>
      ${list ? `<p class="muted">${esc(T('ot_invited_n', { n: t.invited.length }))}</p><ul class="ot-invited">${list}</ul>` : ''}` : ''}</div>`;
  };

  K.acts.otOpenSeason = (b) => { if (window.CaroOTour) window.CaroOTour.open(b.dataset.id); };
  K.acts.otExemptSave = () => O.send({ t: 'otExempt', id: D.ot.id, names: $('ot-exempt').value });
  K.acts.otNextSeason = () => {
    const carry = !!($('ot-next-carry') && $('ot-next-carry').checked);
    window.CaroConfirm.ask(T('ot_next_confirm')).then((ok) => { if (ok) O.send({ t: 'otNextSeason', id: D.ot.id, carry }); });
  };
  K.acts.otInviteSend = () => { S.inviteMsg = ''; O.send({ t: 'otInvite', id: D.ot.id, names: $('ot-invite-in').value }); };
  K.acts.otUninvite = (b) => O.send({ t: 'otUninvite', id: D.ot.id, uid: b.dataset.uid });

  K.binders.push(() => {
    if (K.V.page !== 'ot' || !D.ot) return;
    const box = $('ot-reg-invite');
    if (box) box.onchange = () => O.send({ t: 'otRegOpen', id: D.ot.id, open: true, invite: box.checked });
  });
  if (!O) return;
  // Kết quả mời: số đã mời + tên không tìm thấy
  O.on('otInvited', (m) => {
    S.inviteMsg = T('ot_invite_done', { n: m.n }) + (m.miss && m.miss.length ? ' ' + T('ot_invite_miss', { names: m.miss.join(', ') }) : '');
    const el = $('ot-invite-msg');
    if (el) el.textContent = S.inviteMsg;
    if (!m.miss || !m.miss.length) { const i = $('ot-invite-in'); if (i) i.value = ''; }
  });
})();
