/*
 * Giải đấu Offline – trang xem + khung nhập của các cách tính Race tự chứa (máy chủ: stages-race-plug.js):
 *   omnium    – bảng tổng (điểm 4 đua con, điểm sprint, vòng hơn / kém), mỗi đua con nhập thứ hạng (points race: thêm điểm sprint,
 *               số vòng hơn / kém);
 *   massstart – bán kết (các lượt) + chung kết: nhập thứ tự về đích + tổng điểm giữa đua, bỏ cuộc / truất quyền;
 *   pursuit   – danh sách xuất phát theo khoảng thua (mốc xuất phát đồng loạt), nhập thứ tự qua vạch + thời gian thuần, vòng phạt.
 *   skijump   – nhảy cầu (phần đầu Nordic combined): mỗi lượt nhập điểm từng người, xếp theo tổng điểm.
 * K.racePlugHtml(t, v) – otour-race.js gọi khi v.omnium / v.mass / v.pursuit / v.jump. Nạp sau otour-race.js.
 */
(function () {
  'use strict';
  const K = window.CaroTourKit;
  const RU = window.CaroOTourRules;
  if (!K || !RU) return;
  const { O, T, esc, D, icon } = K;
  const S = { err: {} };
  const sgn = (n) => (n > 0 ? '+' + n : String(n));
  const gapTxt = (ms) => (ms ? '+' + RU.fmtTime(ms) : '0');

  /** Bảng tổng theo cách tính. */
  function board(v) {
    let head, row;
    if (v.omnium) {
      head = ['#', '', ...[0, 1, 2, 3].map((k) => T('om_ev_' + k)), T('om_sp'), T('om_lap'), T('col_pts')];
      row = (x) => [x.parts.map((p) => (p == null ? '' : sgn(p))).join('</td><td>'), x.parts[3] == null ? '' : x.sp, x.parts[3] == null ? '' : sgn(x.lap), `<b>${x.total}</b>`];
    } else if (v.jump) {
      head = ['#', '', ...v.events.map((e) => T('sj_round_n', { n: e.i + 1 })), T('col_pts')];
      row = (x) => [...x.jumps.map((p) => (p == null ? '' : p.toFixed(1))), x.dsq ? esc(T('ms_dsq')) : x.dnf ? esc(T('pl_dnf')) : x.total != null ? `<b>${x.total.toFixed(1)}</b>` : ''];
    } else if (v.mass) {
      head = ['#', '', T('ms_fin'), T('ms_semi'), T('col_pts')];
      row = (x) => [x.fin ? x.fin : x.dsq ? T('ms_dsq') : x.dnf ? T('pl_dnf') : '', x.semi ? T('ms_semi_n', { n: x.heat + 1, k: x.semi }) : '', `<b>${x.pts}</b>`];
    } else {
      head = ['#', '', T('pu_gap'), T('pu_time'), T('pu_pen')];
      row = (x) => [esc(gapTxt(x.gap)), x.time ? esc(RU.fmtTime(x.time)) : x.dnf ? esc(T('pl_dnf')) : x.dns ? esc(T('pl_dns')) : '', x.pen || ''];
    }
    const rows = (v.table || []).map((x) => `<tr class="${x.adv ? 'adv' : ''}${x.dnf || x.dsq || x.dns ? ' dnf' : ''}"><td>${x.rank}</td><td class="nm">${esc(x.name)}</td><td>${row(x).join('</td><td>')}</td></tr>`).join('');
    return `<div class="tscroll"><table class="stand"><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  /** Người của cuộc đua i theo nhóm (mass start: các lượt bán kết; pursuit: thứ tự xuất phát). */
  function groupsOf(v, ev) {
    if (v.mass) return ev.groups || [];
    if (v.pursuit) return [v.pursuit.start];
    return [v.entrants];
  }

  /** Khung nhập cuộc đua i. */
  function form(t, v, ev) {
    const key = `${t.id}:${v.index}:p${ev.i}`, last = v.omnium && ev.i === 3, by = new Map((ev.rows || []).map((x) => [x.uid, x]));
    const extra = (p) => {
      const x = by.get(p.uid) || {};
      if (last) return `<td><input class="p-sp" type="number" min="0" max="500" value="${x.sp != null ? x.sp : ''}" aria-label="${esc(T('om_sp'))}"></td><td><input class="p-lap" type="number" min="-20" max="20" value="${x.lap || 0}" aria-label="${esc(T('om_lap'))}"></td>`;
      if (v.mass) return `<td><input class="p-ip" type="number" min="0" max="99" value="${x.ip || ''}" aria-label="${esc(T('ms_ip'))}"></td>`;
      if (v.pursuit) return `<td><input class="p-time" placeholder="mm:ss.s" value="${x.time ? esc(RU.fmtTime(x.time)) : ''}" aria-label="${esc(T('pu_time'))}"></td><td><input class="p-pen" type="number" min="0" max="40" value="${x.pen || ''}" aria-label="${esc(T('pu_pen'))}"></td>`;
      return '';
    };
    const cols = last ? [T('om_sp'), T('om_lap')] : v.mass ? [T('ms_ip')] : v.pursuit ? [T('pu_time'), T('pu_pen')] : [];
    const st = (p) => { const x = by.get(p.uid) || {}; return x.dsq ? 'dsq' : x.dnf ? 'dnf' : ''; };
    const stSel = (p) => `<select class="p-st"><option value="">—</option><option value="dnf" ${st(p) === 'dnf' ? 'selected' : ''}>${esc(T('pl_dnf'))}</option>${v.mass || v.jump ? `<option value="dsq" ${st(p) === 'dsq' ? 'selected' : ''}>${esc(T('ms_dsq'))}</option>` : ''}</select>`;
    const tables = groupsOf(v, ev).map((g, gi, all) => `${all.length > 1 ? `<h6>${esc(T('ms_heat_n', { n: gi + 1 }))}</h6>` : ''}<div class="tscroll"><table class="stand race-in"><thead><tr><th></th>${v.pursuit ? `<th>${esc(T('pu_start'))}</th>` : ''}<th>${esc(T(v.jump ? 'sj_pts' : 'pl_rank'))}</th>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}<th></th></tr></thead><tbody>${
      g.map((p) => `<tr data-uid="${esc(p.uid)}"><td class="nm">${esc(p.name)}</td>${v.pursuit ? `<td>${esc(gapTxt(p.start))}${p.wave ? ` <small class="pill">${esc(T('pu_wave'))}</small>` : ''}</td>` : ''}<td>${v.jump ? `<input class="p-pts" type="number" step="0.1" min="0" max="300" inputmode="decimal" value="${(by.get(p.uid) || {}).pts != null ? by.get(p.uid).pts : ''}" aria-label="${esc(T('sj_pts'))}">` : `<input class="p-rank" type="number" min="1" max="99" value="${(by.get(p.uid) || {}).rank || ''}" aria-label="${esc(T('pl_rank'))}">`}</td>${extra(p)}<td>${stSel(p)}</td></tr>`).join('')}</tbody></table></div>`).join('');
    return `<form class="plug-form" data-key="${esc(key)}" data-ev="${ev.i}"><p class="hint">${esc(T(v.jump ? 'sj_form_hint' : v.mass ? 'ms_form_hint' : v.pursuit ? 'pu_form_hint' : last ? 'om_form_hint_pr' : 'om_form_hint'))}</p>${tables}
      <p class="err">${esc(S.err[key] || '')}</p><div class="row"><button class="primary">${esc(T('race_save'))}</button></div></form>`;
  }

  /** Kết quả đã nhập của cuộc đua (theo thứ tự). */
  function result(v, ev) {
    const name = (u) => ((v.entrants || []).find((p) => p.uid === u) || {}).name || '?';
    const list = v.mass && ev.res ? ev.res : v.jump ? [...(ev.rows || [])].sort((a, b) => (b.pts != null ? b.pts : -1) - (a.pts != null ? a.pts : -1)) : [...(ev.rows || [])].sort((a, b) => (!!a.dnf - !!b.dnf) || (a.rank || 0) - (b.rank || 0));
    return `<ol class="plug-res">${list.map((x) => `<li>${esc(name(x.uid))}${x.dnf ? ` <small class="muted">${esc(T('pl_dnf'))}</small>` : ''}${x.dsq ? ` <small class="muted">${esc(T('ms_dsq'))}</small>` : ''}${x.pts != null ? ` · ${x.pts}` : ''}</li>`).join('')}</ol>`;
  }

  function info(v) {
    const c = v.cfg;
    if (v.omnium) return T('om_info', { lap: c.omnium.lap, sp: c.omnium.sprint.join('-') });
    if (v.jump) return T('sj_info', { n: v.events.length });
    if (v.mass) return T('ms_info', { laps: c.massStart.laps, s: c.massStart.sprints.join(', '), mid: c.massStart.mid.join('-'), fin: c.massStart.final.join('-') });
    return T(c.pursuit.wave ? 'pu_info' : 'pu_info_nowave', { w: c.pursuit.wave }) + (v.pursuit.byJump ? ' · ' + T('pu_info_jump', { s: c.pursuit.perPoint }) : '');
  }

  K.racePlugHtml = (t, v) => {
    const can = t.canManage && t.status === 'running' && v.index === (t.stage || 0);
    const cur = v.events.findIndex((e) => !e.done), lastDone = v.events.map((e) => e.done).lastIndexOf(true);
    const name = (i) => (v.omnium ? T('om_ev_' + i) : v.jump ? T('sj_round_n', { n: i + 1 }) : v.mass ? T(v.cfg.massStart.semis && i === 0 ? 'ms_semis' : 'ms_final') : T('pu_race'));
    const races = v.events.map((ev) => {
      const state = ev.done ? icon('check', 'ok') : `<span class="muted">${esc(T('pl_pending'))}</span>`;
      const undo = can && ev.i === lastDone ? `<div class="row"><button type="button" class="ghost sm danger" data-act="otRaceUndo" data-ev="${ev.i}">${esc(T('pl_undo'))}</button></div>` : '';
      const body = () => (can && ev.i === cur ? form(t, v, ev) : ev.done ? result(v, ev) + undo : `<p class="hint">${esc(T(can ? 'pl_wait_prev' : 'pl_wait'))}</p>`);
      return K.fold(`${t.id}:r${v.index}:${ev.i}`, `<b>${esc(name(ev.i))}</b> ${state}`, body, can ? ev.i === cur : ev.i === lastDone);
    }).join('');
    return `<p class="hint">${esc(info(v))}</p>${board(v)}<h5>${esc(T(v.omnium ? 'om_races' : 'pl_races'))}</h5>${races}`;
  };

  // ------------------------------------------------------------ Gửi kết quả
  function rowsOf(f) {
    const rows = [];
    f.querySelectorAll('tr[data-uid]').forEach((tr) => {
      const q = (c) => tr.querySelector(c), stv = q('.p-st').value;
      const rank = q('.p-rank') ? q('.p-rank').value.trim() : '', pts = q('.p-pts') ? q('.p-pts').value.trim() : '';
      const x = { uid: tr.dataset.uid };
      if (stv === 'dnf') x.dnf = true; else if (stv === 'dsq') x.dsq = true; else if (pts) x.pts = Number(pts); else if (rank) x.rank = Number(rank); else return; // trống = không xuất phát / không nhảy
      if (q('.p-sp')) { x.sp = Number(q('.p-sp').value) || 0; x.lap = Number(q('.p-lap').value) || 0; }
      if (q('.p-ip') && q('.p-ip').value) x.ip = Number(q('.p-ip').value);
      if (q('.p-time') && q('.p-time').value.trim()) { const ms = RU.parseTime(q('.p-time').value.trim()); if (ms) x.time = ms; }
      if (q('.p-pen') && q('.p-pen').value) x.pen = Number(q('.p-pen').value);
      rows.push(x);
    });
    return rows;
  }

  K.binders.push((body) => {
    body.querySelectorAll('.plug-form').forEach((f) => {
      f.onsubmit = (e) => {
        e.preventDefault();
        const rows = rowsOf(f), key = f.dataset.key;
        S.err[key] = rows.length ? '' : T('srv_ot_race_empty');
        f.querySelector('.err').textContent = S.err[key];
        if (!rows.length) return;
        S.last = key;
        O.send({ t: 'otRace', id: D.ot.id, event: Number(f.dataset.ev), rows });
      };
    });
  });
  if (!O) return;
  O.on('otPatch', () => { if (S.last) { delete S.err[S.last]; S.last = null; } });
  O.on('error', (m) => {
    if (m.ctx !== 'otRace' || !S.last) return;
    S.err[S.last] = T('srv_' + m.code, m.args || {});
    const el = document.querySelector(`.plug-form[data-key="${S.last}"] .err`);
    if (el) el.textContent = S.err[S.last];
  });
})();
