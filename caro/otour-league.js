/*
 * Giải đấu Offline – phần kiểu MyLeague trên trang giải (máy chủ: server/src/hub/otour-league.js):
 *   K.otLeagueHtml(t)    – đăng ký đội (mở / duyệt; người có tài khoản gửi đơn), lịch thi đấu, thống kê cầu thủ
 *                          (vua phá lưới, thẻ phạt), đội hình (ban tổ chức sửa: "số áo tên | vị trí").
 *   K.otMatchExtra(t, m) – trong khung trận (otour-score.js): giờ đấu + sân, sự kiện (bàn thắng / phản lưới / thẻ),
 *                          in biên bản trận.
 *   K.otMatchTags(m)     – nhãn nhỏ trên nhánh / danh sách (giờ, sân, số bàn ghi nhận) – tour-stages.js gọi.
 */
(function () {
  'use strict';
  const K = window.CaroTourKit;
  if (!K) return;
  const { O, T, esc, $, D, icon, me, render } = K;
  const S = { roster: null }; // đội đang sửa đội hình
  const EV = { goal: '⚽', own: '⚽↩', yellow: '🟨', red: '🟥' };

  const fmtWhen = (ms) => new Date(ms).toLocaleString(undefined, { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const toLocalInput = (ms) => (ms ? new Date(ms - new Date(ms).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');
  const teamOf = (t, uid) => (t.players || []).find((p) => p.uid === uid) || null;
  /** Mọi trận của các giai đoạn đang hiện. */
  const allMatches = (t) => (t.stageViews || []).flatMap((v) => [...(v.rounds || []).flat(), ...(v.lrounds || []).flat(), ...(v.gf || []), ...(v.third ? [v.third] : []),
    ...(v.places || []).flatMap((p) => p.rounds.flat()), ...(v.groups || []).flatMap((g) => g.rounds.flat())]).filter(Boolean);

  K.otMatchTags = (m) => {
    const out = [];
    if (m.when) out.push(`<span class="pill">📅 ${esc(fmtWhen(m.when))}</span>`);
    if (m.venue) out.push(`<span class="muted">📍 ${esc(m.venue)}</span>`);
    if (m.events) { const g = m.events.filter((e) => e.type === 'goal' || e.type === 'own').length; if (g) out.push(`<span class="muted">⚽${g}</span>`); }
    return out;
  };

  // ------------------------------------------------------------ Khung trận: giờ, sân, sự kiện, biên bản
  K.otMatchExtra = (t, m) => {
    const evs = (m.events || []).map((e, i) => `<li>${EV[e.type] || ''} ${e.min != null ? `<b>${e.min}'</b>` : ''} ${esc(e.who || '')} <small class="muted">(${esc((e.side === 'a' ? m.a : m.b).name)})</small>
      <button type="button" class="ghost sm icon" data-act="otEvDel" data-i="${i}" aria-label="${esc(T('ot_ev_del'))}">${icon('close')}</button></li>`).join('');
    const names = [m.a, m.b].flatMap((s) => ((teamOf(t, s.uid) || {}).roster || []).map((r) => (r.no != null ? r.no + ' ' : '') + r.name));
    return `<div class="ot-mx">
      <div class="row ot-info"><label class="field inline"><span>${esc(T('ot_when'))}</span><input type="datetime-local" id="otm-when" value="${esc(toLocalInput(m.when))}"></label>
        <label class="field inline"><span>${esc(T('ot_venue'))}</span><input id="otm-venue" maxlength="60" value="${esc(m.venue || '')}"></label>
        <button type="button" class="ghost sm" data-act="otInfoSave">${esc(T('ot_info_save'))}</button></div>
      <h6>${esc(T('ot_events'))}</h6>${evs ? `<ul class="ot-evs">${evs}</ul>` : `<p class="hint">${esc(T('ot_events_none'))}</p>`}
      <div class="row ot-evadd"><select id="otm-type">${Object.keys(EV).map((k) => `<option value="${k}">${EV[k]} ${esc(T('ot_ev_' + k))}</option>`).join('')}</select>
        <select id="otm-side"><option value="a">${esc(m.a.name)}</option><option value="b">${esc(m.b.name)}</option></select>
        <input id="otm-who" list="otm-roster" maxlength="40" placeholder="${esc(T('ot_ev_who'))}"><datalist id="otm-roster">${names.map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
        <input id="otm-min" type="number" min="0" max="300" inputmode="numeric" placeholder="${esc(T('ot_ev_min'))}">
        <button type="button" class="ghost sm" data-act="otEvAdd">${icon('plus')}${esc(T('ot_ev_add'))}</button></div>
      <div class="row"><button type="button" class="ghost sm" data-act="otPrint">${esc(T('ot_print'))}</button></div></div>`;
  };
  const cur = () => K.otCurMatch && K.otCurMatch(); // trận đang mở trong khung nhập (otour-score.js)
  K.acts.otInfoSave = () => {
    const v = $('otm-when').value;
    O.send({ t: 'otMatchInfo', id: D.ot.id, match: cur(), when: v ? new Date(v).getTime() : null, venue: $('otm-venue').value });
  };
  K.acts.otEvAdd = () => {
    O.send({ t: 'otEvent', id: D.ot.id, match: cur(), type: $('otm-type').value, side: $('otm-side').value, who: $('otm-who').value, min: $('otm-min').value });
  };
  K.acts.otEvDel = (b) => O.send({ t: 'otEventDel', id: D.ot.id, match: cur(), i: Number(b.dataset.i) });

  /** Biên bản trận: trang in (giải, trận, giờ / sân, đội hình hai bên, sự kiện, kết quả, chỗ ký). */
  K.acts.otPrint = () => {
    const t = D.ot, m = allMatches(t).find((x) => x.id === cur());
    if (!m) return;
    const side = (s) => {
      const r = (teamOf(t, s.uid) || {}).roster || [];
      return `<div class="ps-team"><h3>${esc(s.name)}</h3><table><tbody>${r.map((x) => `<tr><td>${x.no != null ? x.no : ''}</td><td>${esc(x.name)}</td><td>${esc(x.pos || '')}</td></tr>`).join('')
        || Array.from({ length: 11 }, () => '<tr><td>&nbsp;</td><td></td><td></td></tr>').join('')}</tbody></table></div>`;
    };
    const res = m.done ? (m.sets ? m.sets.map((s) => s.join('-')).join(' · ') : `${m.wa} – ${m.wb}`) + (m.extra ? ` (${m.extra.join('-')})` : '') : '…… – ……';
    let box = $('ot-print');
    if (!box) { box = document.createElement('div'); box.id = 'ot-print'; document.body.appendChild(box); }
    box.innerHTML = `<h1>${esc(t.name)}</h1><h2>${esc(T('ot_sheet'))}: ${esc(m.a.name)} – ${esc(m.b.name)}</h2>
      <p>${m.when ? esc(fmtWhen(m.when)) : '……'} · ${esc(m.venue || '……')}</p><p class="ps-res">${esc(T('ot_score'))}: <b>${esc(res)}</b></p>
      <div class="ps-teams">${side(m.a)}${side(m.b)}</div>
      <h3>${esc(T('ot_events'))}</h3><ol>${(m.events || []).map((e) => `<li>${e.min != null ? e.min + "' " : ''}${esc(T('ot_ev_' + e.type))} – ${esc(e.who || '')} (${esc((e.side === 'a' ? m.a : m.b).name)})</li>`).join('') || '<li>&nbsp;</li><li>&nbsp;</li><li>&nbsp;</li>'}</ol>
      <div class="ps-sign"><div>${esc(T('ot_sign_ref'))}</div><div>${esc(m.a.name)}</div><div>${esc(m.b.name)}</div></div>`;
    document.body.classList.add('printing-ot');
    const done = () => { document.body.classList.remove('printing-ot'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    window.print();
    setTimeout(done, 1000);
  };

  // ------------------------------------------------------------ Trang giải: đăng ký, lịch, thống kê, đội hình
  function regHtml(t) {
    if (t.status !== 'draft') return '';
    if (t.canManage) {
      const list = (t.regs || []).map((r) => `<li><b>${esc(r.name)}</b> <small class="muted">${esc(r.byName)}${r.n ? ' · ' + esc(T('ot_reg_roster_n', { n: r.n })) : ''}</small>
        <button type="button" class="ghost sm" data-act="otRegOk" data-id="${esc(r.id)}">${icon('check')}${esc(T('ot_reg_ok'))}</button>
        <button type="button" class="ghost sm danger" data-act="otRegNo" data-id="${esc(r.id)}">${esc(T('ot_reg_no'))}</button></li>`).join('');
      return K.fold('ot:' + t.id + ':reg', esc(T('ot_reg')) + (t.regs && t.regs.length ? ` <span class="pill">${t.regs.length}</span>` : ''), () => `
        <label class="check"><input type="checkbox" id="ot-reg-open" ${t.reg ? 'checked' : ''}> <span>${esc(T('ot_reg_open'))}</span></label>
        <p class="hint">${esc(T('ot_reg_hint'))}</p>${list ? `<ul class="ot-regs">${list}</ul>` : ''}`, !!(t.regs && t.regs.length));
    }
    if (!t.reg) return '';
    if (t.myReg) return `<p class="hint">${esc(T('ot_reg_sent', { name: t.myReg.name }))}</p>`;
    if (!me()) return `<p class="hint">${esc(T('ot_reg_login'))}</p>`;
    return K.fold('ot:' + t.id + ':regf', esc(T('ot_reg_join')), () => `<form id="otreg" class="tform">
      <label class="field"><span>${esc(T('ot_reg_name'))}</span><input name="name" maxlength="40" required></label>
      <label class="field"><span>${esc(T('ot_roster'))}</span><textarea name="roster" rows="4" placeholder="${esc(T('ot_roster_ph'))}"></textarea></label>
      <p class="err" id="otreg-err"></p><button class="primary">${esc(T('ot_reg_send'))}</button></form>`, true);
  }

  function scheduleHtml(t) {
    const ms = allMatches(t).filter((m) => m.when).sort((a, b) => a.when - b.when);
    if (!ms.length) return '';
    return K.fold('ot:' + t.id + ':sched', esc(T('ot_schedule')), () => `<ul class="mlist ot-sched">${ms.map((m) => `<li class="mrow" data-mid="${esc(m.id)}">
      <small class="muted">${esc(fmtWhen(m.when))}${m.venue ? ' · ' + esc(m.venue) : ''}</small>
      <span>${esc(m.a ? m.a.name : '?')} <b>${m.done ? `${m.wa}–${m.wb}` : 'vs'}</b> ${esc(m.b ? m.b.name : '?')}</span></li>`).join('')}</ul>`, false);
  }

  function statsHtml(t) {
    const s = t.stats;
    if (!s) return '';
    const tb = (rows, head, cell) => `<div class="tscroll"><table class="stand"><thead><tr>${head}</tr></thead><tbody>${rows.map(cell).join('')}</tbody></table></div>`;
    return K.fold('ot:' + t.id + ':stats', esc(T('ot_stats')), () => (s.scorers.length ? `<h5>${esc(T('ot_scorers'))}</h5>` + tb(s.scorers, `<th>#</th><th></th><th></th><th>⚽</th>`,
      (x, i) => `<tr><td>${i + 1}</td><td class="nm">${esc(x.who)}</td><td class="muted">${esc(x.team)}</td><td><b>${x.n}</b></td></tr>`) : '')
      + (s.cards.length ? `<h5>${esc(T('ot_cards'))}</h5>` + tb(s.cards, `<th></th><th></th><th>🟨</th><th>🟥</th>`,
        (x) => `<tr><td class="nm">${esc(x.who)}</td><td class="muted">${esc(x.team)}</td><td>${x.y}</td><td>${x.r}</td></tr>`) : ''), false);
  }

  function rosterHtml(t) {
    const withR = (t.players || []).filter((p) => p.roster && p.roster.length);
    if (!t.canManage && !withR.length) return '';
    return K.fold('ot:' + t.id + ':rosters', esc(T('ot_rosters')), () => (t.players || []).filter((p) => t.canManage || (p.roster && p.roster.length)).map((p) => {
      const list = (p.roster || []).map((r) => `<li>${r.no != null ? `<b>${r.no}</b> ` : ''}${esc(r.name)}${r.pos ? ` <small class="muted">${esc(r.pos)}</small>` : ''}</li>`).join('');
      const edit = t.canManage && S.roster === p.uid
        ? `<textarea id="ot-roster-in" rows="6" placeholder="${esc(T('ot_roster_ph'))}">${esc((p.roster || []).map((r) => (r.no != null ? r.no + ' ' : '') + r.name + (r.pos ? ' | ' + r.pos : '')).join('\n'))}</textarea>
          <div class="row"><button type="button" class="primary sm" data-act="otRosterSave" data-uid="${esc(p.uid)}">${esc(T('ot_info_save'))}</button></div>`
        : t.canManage ? `<button type="button" class="ghost sm" data-act="otRosterEdit" data-uid="${esc(p.uid)}">${esc(T('ot_roster_edit'))}</button>` : '';
      return `<div class="ot-roster"><b>${esc(p.name)}</b> <small class="muted">${esc(T('ot_reg_roster_n', { n: (p.roster || []).length }))}</small>${list ? `<ol>${list}</ol>` : ''}${edit}</div>`;
    }).join(''), false);
  }

  K.otLeagueHtml = (t) => regHtml(t) + scheduleHtml(t) + statsHtml(t) + rosterHtml(t);

  K.acts.otRegOk = (b) => O.send({ t: 'otRegDecide', id: D.ot.id, reg: b.dataset.id, ok: true });
  K.acts.otRegNo = (b) => window.CaroConfirm.ask(T('ot_reg_no_confirm')).then((ok) => { if (ok) O.send({ t: 'otRegDecide', id: D.ot.id, reg: b.dataset.id, ok: false }); });
  K.acts.otRosterEdit = (b) => { S.roster = b.dataset.uid; render(true); };
  K.acts.otRosterSave = (b) => { O.send({ t: 'otRoster', id: D.ot.id, team: b.dataset.uid, lines: $('ot-roster-in').value }); S.roster = null; };

  K.binders.push(() => {
    if (K.V.page !== 'ot' || !D.ot) return;
    const box = $('ot-reg-open');
    if (box) box.onchange = () => O.send({ t: 'otRegOpen', id: D.ot.id, open: box.checked });
    const f = $('otreg');
    if (f) f.onsubmit = (e) => { e.preventDefault(); O.send({ t: 'otRegister', id: D.ot.id, name: f.elements.name.value.trim(), roster: f.elements.roster.value }); };
  });
  O.on('error', (m) => { if (m.ctx === 'otRegister' && $('otreg-err')) $('otreg-err').textContent = T('srv_' + m.code, m.args || {}); });
})();
