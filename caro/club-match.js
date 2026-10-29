/*
 * Câu lạc bộ – thành tích và giao hữu (Đợt 9; máy chủ: club-battle.js):
 *  - Trang CLB: tủ cúp (Team Battle hạng 1–3, giao hữu thắng) + điểm xếp hạng; nút "Thách đấu CLB khác".
 *  - Trang thách đấu (clubMatchNew): chọn CLB, số bàn, giờ đấu, thời gian ván, Bo – qua quản trị viên duyệt như giải
 *    thường, CLB kia phải chấp nhận; mỗi bên xếp đội hình ở trang giải (club-battle.js).
 *  - Bảng xếp hạng CLB toàn hệ thống (clubRanking): Team Battle 10 / 6 / 4 điểm, giao hữu thắng 3, hoà 1.
 *   K.clubCupHtml(c) – phần tủ cúp đặt vào trang CLB. Nạp sau club.js.
 */
(function () {
  'use strict';
  const K = window.CaroTourKit;
  if (!K) return;
  const { O, T, esc, $, D, V, me, setTitle, needLogin, open, render, logo, icon } = K;
  const R = { list: null };
  const MEDAL = ['', 'm1', 'm2', 'm3'];
  const day = (ms) => new Intl.DateTimeFormat(document.documentElement.lang || 'vi', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(ms);

  K.clubCupHtml = (c) => {
    const can = (c.perms || []).includes('tours') && c.status === 'approved';
    const cups = (c.trophies || []).map((x) => `<li><button type="button" class="titem" data-act="tour" data-id="${esc(x.tour)}">${icon('medal', MEDAL[x.place] || 'm1')}
      <span class="pn"><b>${esc(x.name)}</b><small>${esc(T(x.kind === 'match' ? 'cup_match_win' : 'cup_battle_' + x.place))} · ${esc(day(x.at))}</small></span></button></li>`).join('');
    return `<section class="club-cup"><div class="row club-mhead"><h4>${icon('trophy')}${esc(T('cup_title'))}</h4><span class="pill">${esc(T('cup_points', { n: c.points || 0 }))}</span></div>
      ${cups ? `<ul class="tlist">${cups}</ul>` : `<p class="hint">${esc(T('cup_none'))}</p>`}
      <div class="row">${can ? `<button type="button" class="ghost sm" data-act="cmNew">${icon('swords')}${esc(T('cm_new'))}</button>` : ''}
      <button type="button" class="ghost sm" data-act="clubRanking">${icon('trophy')}${esc(T('cr_title'))}</button></div></section>`;
  };

  // ------------------------------------------------------------ Thách đấu CLB khác
  const TIMES = [['t10', 10], ['t20', 20], ['t30', 30], ['c3+2', '3+2'], ['c5+3', '5+3'], ['c10+5', '10+5']];
  function pageMatchNew() {
    setTitle('cm_new');
    if (!me()) return needLogin();
    const c = D.club;
    if (!c) return `<p class="hint">…</p>`;
    const opps = (D.clubs || []).filter((x) => x.id !== c.id && x.status === 'approved');
    const soon = new Date(Date.now() + 86400000);
    soon.setMinutes(0, 0, 0);
    const pad = (n) => String(n).padStart(2, '0');
    const def = `${soon.getFullYear()}-${pad(soon.getMonth() + 1)}-${pad(soon.getDate())}T${pad(soon.getHours())}:00`;
    return `<form id="cm-form" class="tform"><p class="note">${esc(T('cm_hint', { club: c.name }))}</p>
      <label class="field"><span>${esc(T('cm_opp'))}</span><select name="opp" required><option value="">—</option>${opps.map((x) => `<option value="${esc(x.id)}">${esc(x.name)} (${esc(T('members_n', { n: x.count }))})</option>`).join('')}</select></label>
      <label class="field short"><span>${esc(T('cm_boards'))}</span><input type="number" name="boards" min="1" max="20" value="5" required></label>
      <div class="field"><span>${esc(T('cm_start'))}</span>${window.CaroDt.html('start', def, { required: true })}</div>
      <label class="field"><span>${esc(T('cm_time'))}</span><select name="time">${TIMES.map(([v, n]) => `<option value="${v}" ${v === 't20' ? 'selected' : ''}>${esc(typeof n === 'number' ? T('per_move', { n }) : n)}</option>`).join('')}</select></label>
      <label class="field short"><span>${esc(T('cm_bo'))}</span><select name="bestOf"><option value="1">Bo1</option><option value="3">Bo3</option></select></label>
      <p class="err" id="cm-err"></p><button class="primary">${esc(T('cm_send'))}</button></form>`;
  }

  function pageRanking() {
    setTitle('cr_title');
    if (!R.list) return `<p class="hint">…</p>`;
    if (!R.list.length) return `<p class="hint">${esc(T('cr_none'))}</p><p class="hint">${esc(T('cr_rule'))}</p>`;
    return `<p class="hint">${esc(T('cr_rule'))}</p><ol class="ranks">${R.list.map((x) => `<li><span class="rank">${x.rank}</span>${logo(x.name, x.icon)}
      <div class="pn"><b><a href="#" data-act="club" data-id="${esc(x.id)}">${esc(x.name)}</a></b><small>${esc(T('members_n', { n: x.count }))} · ${esc(T('cr_cups', { g: x.gold, n: x.trophies }))}</small></div>
      <span class="pts">${x.points}</span></li>`).join('')}</ol>`;
  }

  K.pages.clubMatchNew = pageMatchNew;
  K.pages.clubRanking = pageRanking;
  K.enter.clubMatchNew = () => { if (!D.clubs) O.send({ t: 'clubList' }); };
  K.enter.clubRanking = () => { R.list = null; O.send({ t: 'clubRanking' }); };
  K.acts.cmNew = () => { open('clubMatchNew', D.club.id); };
  K.acts.clubRanking = () => { open('clubRanking', null); };

  K.binders.push(() => {
    const f = $('cm-form');
    if (!f) return;
    f.onsubmit = (e) => {
      e.preventDefault();
      const err = $('cm-err');
      err.textContent = '';
      const start = new Date(f.start.value).getTime();
      if (!f.opp.value) { err.textContent = T('cm_pick_opp'); f.opp.focus(); return; }
      if (!Number.isFinite(start) || start < Date.now() + 60000) { err.textContent = T('cm_bad_start'); return; }
      const time = f.time.value;
      O.send({
        t: 'clubMatchCreate', id: D.club.id, opp: f.opp.value, boards: Number(f.boards.value), startsAt: start - (D.skew || 0), bestOf: Number(f.bestOf.value),
        ...(time[0] === 'c' ? { timeLimit: 0, clock: time.slice(1) } : { timeLimit: Number(time.slice(1)) }),
      });
    };
  });

  O.on('clubRanking', (m) => { R.list = m.list; if (K.isOpen() && V.page === 'clubRanking') render(); });
  // Danh sách CLB (để chọn đối thủ) tới sau khi đã mở trang thách đấu
  O.on('clubList', () => { if (K.isOpen() && V.page === 'clubMatchNew' && !(document.activeElement && document.activeElement.closest('#cm-form'))) render(); });
})();
