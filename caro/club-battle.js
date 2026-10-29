/*
 * Câu lạc bộ thi đấu trên trang giải (Đợt 9; máy chủ: club-battle.js):
 *  - Team Battle: bảng CLB (điểm = tổng N người cao điểm nhất), chọn CLB thi đấu cho khi tham gia (thuộc nhiều CLB);
 *    ô "Đấu đồng đội giữa các CLB" ở tab Thể thức của trang Cài đặt nâng cao (Arena).
 *  - Giao hữu CLB đấu CLB: bảng tỉ số hai bên, từng bàn; ban quản lý bên được mời chấp nhận / từ chối; mỗi bên xếp
 *    đội hình theo thứ tự bàn.
 *   K.battleHtml(t) – phần đặt vào trang giải; K.joinExtra() – thêm CLB đã chọn vào lệnh tham gia. Nạp sau tour.js, tour-form.js.
 */
(function () {
  'use strict';
  const K = window.CaroTourKit;
  if (!K) return;
  const { O, T, esc, $, D, icon } = K;
  const L = { pick: {}, lineup: {} }; // CLB đã chọn (theo giải); đội hình đang sửa (theo giải + bên)
  const logo = (x) => (K.logo ? K.logo(x.name, x.icon) : '');

  // ------------------------------------------------------------ Team Battle
  function teamsHtml(t) {
    const rows = t.teams.map((x, i) => `<li class="${(t.teamPodium || [])[0] === x.id && t.status === 'finished' ? 'win' : ''}"><span class="rank">${i + 1}</span>${logo(x)}
      <div class="pn"><b><a href="#" data-act="club" data-id="${esc(x.id)}">${esc(x.name)}</a></b><small>${esc(T('tb_players_n', { n: x.count }))}${x.top.length ? ' · ' + esc(x.top.map((p) => `${p.name} ${p.score}`).join(', ')) : ''}</small></div>
      <span class="pts">${x.score}</span></li>`).join('');
    let pick = '';
    if (t.canJoin && t.myTeams && t.myTeams.length > 1) {
      const cur = L.pick[t.id] || t.myTeams[0].id;
      pick = `<label class="field"><span>${esc(T('tb_pick'))}</span><select id="team-pick">${t.myTeams.map((x) => `<option value="${esc(x.id)}" ${x.id === cur ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>`;
    }
    return `<section class="team-battle"><h4>${icon('swords')}${esc(T('tb_title'))}</h4><p class="hint">${esc(T('tb_rule', { n: t.teamTop }))}</p>${pick}<ol class="ranks team-table">${rows}</ol></section>`;
  }
  K.joinExtra = () => {
    const t = D.tour;
    if (!t || !t.teams) return {};
    const sel = $('team-pick');
    return { team: sel ? sel.value : t.myTeams && t.myTeams[0] ? t.myTeams[0].id : undefined };
  };

  // ------------------------------------------------------------ Giao hữu CLB đấu CLB
  function matchHtml(t) {
    const m = t.teamMatch;
    const res = (b, side) => (b.res === side ? 'win' : b.res === 'draw' ? 'draw' : '');
    let html = `<section class="team-match"><div class="tm-score">
      <div class="tm-side">${logo(m.a)}<a href="#" data-act="club" data-id="${esc(m.a.id)}">${esc(m.a.name)}</a></div>
      <b class="tm-num">${m.a.score} – ${m.b.score}</b>
      <div class="tm-side">${logo(m.b)}<a href="#" data-act="club" data-id="${esc(m.b.id)}">${esc(m.b.name)}</a></div></div>`;
    if (m.played.length) {
      html += `<ol class="tm-boards">${m.played.map((b) => `<li><span class="muted">${esc(T('tm_board_n', { n: b.board }))}</span>
        <span class="nm ${res(b, 'a')}">${esc(b.a.name)}</span><b>${b.res ? `${b.wa}–${b.wb}` : b.live ? `<span class="pill live">● ${esc(T('live'))}</span>` : 'vs'}</b><span class="nm ${res(b, 'b')}">${esc(b.b.name)}</span></li>`).join('')}</ol>`;
    } else if (m.lineup) {
      html += `<p class="hint">${esc(T(m.accepted ? 'tm_accepted' : 'tm_wait_accept', { club: m.b.name }))} · ${esc(T('tm_boards_n', { n: m.boards }))}</p>`;
      const rows = [];
      for (let i = 0; i < m.boards; i++) {
        const a = m.lineup.a[i], b = m.lineup.b[i];
        rows.push(`<li><span class="muted">${esc(T('tm_board_n', { n: i + 1 }))}</span><span class="nm">${esc(a ? a.name : '—')}</span><b>vs</b><span class="nm">${esc(b ? b.name : '—')}</span></li>`);
      }
      html += `<ol class="tm-boards">${rows.join('')}</ol>`;
      html += officerHtml(t);
    }
    return html + '</section>';
  }
  /** Ban quản lý một bên: chấp nhận (bên được mời) + xếp đội hình (mỗi bàn một ô chọn thành viên). */
  function officerHtml(t) {
    const m = t.teamMatch;
    let html = '';
    for (const s of t.matchSides || []) {
      if (s.side === 'b' && !m.accepted) {
        html += `<div class="row tactions"><button type="button" class="primary sm" data-act="tmAccept" data-v="1">${esc(T('tm_accept'))}</button>
          <button type="button" class="ghost sm danger" data-act="tmAccept" data-v="0">${esc(T('tm_decline'))}</button></div>`;
      }
      const key = t.id + ':' + s.side;
      const cur = L.lineup[key] || m.lineup[s.side].map((x) => x.uid);
      const sel = (i) => `<label class="field inline"><span>${esc(T('tm_board_n', { n: i + 1 }))}</span><select data-lineup="${s.side}" data-i="${i}">
        <option value="">—</option>${s.pool.map((p) => `<option value="${esc(p.uid)}" ${cur[i] === p.uid ? 'selected' : ''}>${esc(p.name)} (${p.rating})</option>`).join('')}</select></label>`;
      html += `<details class="fold" ${L.open === key ? 'open' : ''} data-lu="${esc(key)}"><summary>${icon('users')}${esc(T('tm_lineup', { club: m[s.side].name }))}</summary>
        <div class="tm-lineup">${Array.from({ length: m.boards }, (_, i) => sel(i)).join('')}</div>
        <button type="button" class="primary sm" data-act="tmLineup" data-side="${s.side}">${esc(T('tm_lineup_save'))}</button></details>`;
    }
    return html;
  }

  K.battleHtml = (t) => (t.teams ? teamsHtml(t) : '') + (t.teamMatch ? matchHtml(t) : '');

  K.acts.tmAccept = (b) => {
    const yes = b.dataset.v === '1';
    if (!yes && !confirm(T('tm_decline_q'))) return;
    O.send({ t: 'clubMatchAccept', tour: D.tour.id, accept: yes });
  };
  K.acts.tmLineup = (b) => {
    const side = b.dataset.side;
    const uids = [...document.querySelectorAll(`[data-lineup="${side}"]`)].map((x) => x.value);
    // Ô trống ở giữa: dồn lên (bàn trên trước)
    O.send({ t: 'clubMatchLineup', tour: D.tour.id, side, uids: uids.filter(Boolean) });
    delete L.lineup[D.tour.id + ':' + side];
    O.toast(T('saved'));
  };
  K.binders.push((body) => {
    const tp = $('team-pick');
    if (tp) tp.onchange = () => { L.pick[D.tour.id] = tp.value; };
    body.querySelectorAll('[data-lineup]').forEach((x) => {
      x.onchange = () => {
        const key = D.tour.id + ':' + x.dataset.lineup;
        L.lineup[key] = [...body.querySelectorAll(`[data-lineup="${x.dataset.lineup}"]`)].map((y) => y.value);
      };
    });
    body.querySelectorAll('details[data-lu]').forEach((d) => { d.ontoggle = () => { if (d.open) L.open = d.dataset.lu; else if (L.open === d.dataset.lu) L.open = null; }; });
  });

  // ------------------------------------------------------------ Ô Team Battle ở trang Cài đặt nâng cao (Arena)
  const DR = K.tourDraft;
  if (DR) {
    Object.assign(DR.EXT.defaults, { teamOn: false, teamClubs: [], teamTop: '5' });
    DR.FIELDS.teams = (d) => {
      const clubs = [...(D.myClubs || []), ...(D.clubs || [])].filter((c, i, a) => c.status === 'approved' && a.findIndex((x) => x.id === c.id) === i);
      return `<fieldset class="only-arena tb-field"><legend>${esc(T('tb_title'))}</legend>
        <label class="check"><input type="checkbox" name="teamOn" ${d.teamOn ? 'checked' : ''}> <span>${esc(T('tb_on'))}</span></label>
        <p class="hint">${esc(T('tb_on_hint'))}</p>
        <div class="tb-clubs">${clubs.map((c) => `<label class="check"><input type="checkbox" data-tbclub="${esc(c.id)}" ${(d.teamClubs || []).includes(c.id) ? 'checked' : ''}> <span>${esc(c.name)}</span></label>`).join('') || `<span class="hint">…</span>`}</div>
        <label class="field short"><span>${esc(T('tb_top'))}</span><input type="number" name="teamTop" min="1" max="20" value="${esc(d.teamTop)}"></label></fieldset>`;
    };
    DR.EXT.collectors.push((form, d) => {
      if (!form.querySelector('.tb-field')) return;
      d.teamClubs = [...form.querySelectorAll('[data-tbclub]')].filter((x) => x.checked).map((x) => x.dataset.tbclub);
    });
    DR.EXT.validators.push((d, { ko }) => (!ko && d.teamOn && (d.teamClubs || []).length < 2 ? { key: 'teamOn', msg: T('srv_team_battle_few') } : null));
    DR.EXT.payloads.push((d, { ko }) => (!ko && d.teamOn ? { teams: { clubs: d.teamClubs, top: Number(d.teamTop) || 5 } } : !ko ? { teams: null } : {}));
    DR.EXT.fromTour.push((d, t) => {
      if (!t.teams) return;
      d.teamOn = true;
      d.teamClubs = t.teams.map((x) => x.id);
      d.teamTop = String(t.teamTop || 5);
    });
  }
})();
