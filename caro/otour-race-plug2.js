/*
 * Giải đấu Offline – trang xem + khung nhập của Backyard Ultra và poker có bounty (máy chủ: stages-backyard.js, stages-poker.js):
 *   backyard – bảng số yard / km, người còn chạy; mỗi yard: đánh dấu người về kịp (mặc định tất cả); yard một mình của người
 *              cuối cùng; trạng thái có / không có nhà vô địch;
 *   poker    – bảng: hạng, số người đã loại, điểm thưởng đã nhận, bounty trên đầu (PKO), người còn lại; nhập lần loại: người bị
 *              loại + người loại; Mystery: nhật ký rút phong bì (giá trị lộ khi rút), số phong bì còn lại, mệnh giá cao nhất.
 * K.racePlug2Html(t, v) – otour-race.js gọi khi v.backyard / v.poker. Nạp sau otour-race.js.
 */
(function () {
  'use strict';
  const K = window.CaroTourKit;
  if (!K) return;
  const { O, T, esc, D } = K;
  const S = { err: '' };
  const fmt = (n) => Number(n).toLocaleString();
  const tbl = (head, rows) => `<div class="tscroll"><table class="stand"><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
  const undoBtn = (ev) => `<div class="row"><button type="button" class="ghost sm danger" data-act="otRaceUndo" data-ev="${ev.i}">${esc(T('pl_undo'))}</button></div>`;

  function backyard(t, v, can) {
    const B = v.backyard, Y = v.cfg.backyard;
    const status = B.status === 'champion' ? T('by_champ', { name: (v.table.find((x) => x.champ) || {}).name || '?' }) : B.status === 'none' ? T('by_none') : T('by_running', { n: B.alive.length });
    const rows = v.table.map((x) => `<tr class="${x.champ ? 'adv' : x.alive ? '' : 'dnf'}"><td>${x.rank}</td><td class="nm">${esc(x.name)}${x.alive ? ` <span class="pill">${esc(T('by_alive'))}</span>` : ''}</td><td>${x.yards}</td><td>${x.km}</td></tr>`).join('');
    const cur = v.events.find((e) => !e.done), last = [...v.events].reverse().find((e) => e.done);
    let form = '';
    if (can && cur && B.status === 'running') {
      form = `<form class="plug2-form" data-ev="${cur.i}"><h5>${esc(T('by_yard_n', { n: cur.i + 1 }))}</h5><p class="hint">${esc(T(B.solo ? 'by_solo' : 'by_form_hint'))}</p>${
        B.alive.map((p) => `<label class="check"><input type="checkbox" data-by="${esc(p.uid)}" checked> <span>${esc(p.name)}</span></label>`).join('')}
        <p class="err">${esc(S.err)}</p><div class="row"><button class="primary">${esc(T('race_save'))}</button></div></form>`;
    }
    return `<p class="hint">${esc(T('by_info', { km: (Y.m / 1000).toFixed(3), min: Y.min }))}</p><p><b>${esc(status)}</b></p>${tbl(['#', '', T('by_yards'), 'km'], rows)}${form}${can && last ? undoBtn(last) : ''}`;
  }

  function poker(t, v, can) {
    const P = v.poker, pko = P.type === 'pko';
    const rows = v.table.map((x) => `<tr class="${x.alive ? '' : 'dnf'}"><td>${x.rank}</td><td class="nm">${esc(x.name)}${x.alive ? ` <span class="pill">${esc(T('pk_alive'))}</span>` : ''}</td><td>${x.kos}</td><td><b>${fmt(x.bank)}</b></td>${pko ? `<td>${fmt(x.head)}</td>` : ''}</tr>`).join('');
    const info = pko ? T('pk_info_pko', { s: fmt(v.cfg.poker.start), p: v.cfg.poker.pocket }) : T('pk_info_mystery', { n: v.cfg.poker.act, k: P.left, max: fmt(P.max) }) + (P.active ? ' ' + T('pk_active') : '');
    const cur = v.events.find((e) => !e.done), last = [...v.events].reverse().find((e) => e.done);
    let form = '';
    if (can && cur && P.alive.length > 1) {
      const opts = (sel) => P.alive.map((p) => `<option value="${esc(p.uid)}" ${p.uid === sel ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
      form = `<form class="plug2-form" data-ev="${cur.i}" data-poker="1"><h5>${esc(T('pk_bust'))}</h5><div class="row">
        <label class="field inline"><span>${esc(T('pk_victim'))}</span><select data-pk="uid">${opts(P.alive[P.alive.length - 1].uid)}</select></label>
        <label class="field inline"><span>${esc(T('pk_by'))}</span><select data-pk="by"><option value="">—</option>${opts(P.alive[0].uid)}</select></label></div>
        <p class="err">${esc(S.err)}</p><div class="row"><button class="primary">${esc(T('race_save'))}</button></div></form>`;
    }
    const draws = P.draws && P.draws.length ? K.fold(`pk-env:${v.index}`, `<b>${esc(T('pk_draws'))}</b>`, () => `<ol>${P.draws.map((d) => `<li>${esc(T('pk_draw', { name: d.by.name, n: fmt(d.amount) }))}</li>`).join('')}</ol>`, true) : '';
    const busts = v.events.filter((e) => e.done).map((e) => e.rows.map((x) => `<li>${esc(x.byName ? T('pk_bust_by', { name: x.name, by: x.byName }) : x.name)}</li>`).join('')).join('');
    return `<p class="hint">${esc(info)}</p>${tbl(['#', '', T('pk_kos'), T('pk_bank'), ...(pko ? [T('pk_head')] : [])], rows)}${form}${draws}${busts ? `<h5>${esc(T('pk_log'))}</h5><ol class="plug-res">${busts}</ol>` : ''}${can && last ? undoBtn(last) : ''}`;
  }

  K.racePlug2Html = (t, v) => {
    const can = t.canManage && t.status === 'running' && v.index === (t.stage || 0);
    return v.backyard ? backyard(t, v, can) : poker(t, v, can);
  };

  K.binders.push((body) => {
    body.querySelectorAll('.plug2-form').forEach((f) => {
      f.onsubmit = (e) => {
        e.preventDefault();
        let rows;
        if (f.dataset.poker) {
          const uid = f.querySelector('[data-pk="uid"]').value, by = f.querySelector('[data-pk="by"]').value;
          if (by === uid) { S.err = T('srv_ot_poker_by'); f.querySelector('.err').textContent = S.err; return; }
          rows = [{ uid, ...(by ? { by } : {}) }];
        } else rows = [...f.querySelectorAll('[data-by]')].map((x) => ({ uid: x.dataset.by, done: x.checked }));
        S.err = '';
        S.on = true;
        O.send({ t: 'otRace', id: D.ot.id, event: Number(f.dataset.ev), rows });
      };
    });
  });
  if (!O) return;
  O.on('error', (m) => {
    if (m.ctx !== 'otRace' || !S.on) return;
    S.err = T('srv_' + m.code, m.args || {});
    const el = document.querySelector('.plug2-form .err');
    if (el) el.textContent = S.err;
  });
  O.on('otPatch', () => { S.on = false; S.err = ''; });
})();
