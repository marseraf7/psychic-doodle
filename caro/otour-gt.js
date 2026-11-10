/*
 * Giải đấu Offline – xe đạp nhiều chặng kiểu Grand Tour (hệ Race, cách tính 'gt'; máy chủ: server/src/hub/stages-gt.js).
 * K.gtHtml(t, v) – otour-race.js gọi khi v.cfg.score === 'gt':
 *   - Người đang giữ áo: vàng (tổng thời gian), xanh (điểm), chấm bi (leo núi), trắng (tay đua trẻ), đội dẫn đầu.
 *   - Các bảng xếp hạng: tổng thời gian (giây thưởng đã trừ, người bỏ cuộc cuối bảng), điểm, leo núi, trẻ, đồng đội.
 *   - Từng chặng (loại chặng): kết quả – hạng, thời gian + cách biệt, giây thưởng, điểm xanh, leo núi; người giữ áo sau
 *     chặng. Ban tổ chức nhập lần lượt từng chặng: thứ hạng, thời gian (bỏ trống = cùng thời gian người về ngay trước;
 *     "+0:12" = chậm hơn người về nhất 12 giây), leo núi, nước rút, giây thưởng / phạt, bỏ cuộc; dán nhanh cả danh sách.
 *     Chỉ huỷ được chặng nhập sau cùng.
 * Ô đang nhập được giữ lại khi trang vẽ lại (bản vá từ máy chủ).
 */
(function () {
  'use strict';
  const K = window.CaroTourKit;
  const RU = window.CaroOTourRules;
  if (!K || !RU) return;
  const { O, T, esc, D, icon } = K;
  const S = { draft: {}, err: {}, paste: {} }; // nháp theo "mã giải:giai đoạn:chặng" → uid → { rank, time, kom, sp, bs, dnf }

  const dkey = (t, v, i) => `${t.id}:${v.index}:gt${i}`;
  const gap = (ms) => (ms ? RU.fmtGap(ms) : '');
  // Thời gian chặng xe đạp tính tới giây: bỏ phần nghìn giây khi tròn giây
  const fmt = (ms) => (ms == null ? '–' : RU.fmtTime(ms).replace(/\.000$/, ''));
  const fmtGap = (ms) => (ms ? '+' + fmt(ms) : '');
  const JERSEYS = [['gc', 'yellow'], ['green', 'green'], ['kom', 'kom'], ['young', 'white'], ['team', 'team']];
  const jersey = (k) => `<span class="jersey j-${esc(k)}" aria-hidden="true"></span>`;
  const who = (x) => `${esc(x.name)}${x.young ? ` <small class="pill gt-young">${esc(T('gt_young_tag'))}</small>` : ''}${x.team ? ` <small class="muted">· ${esc(x.team)}</small>` : ''}`;

  /** Người đang giữ áo (sau chặng nhập gần nhất). */
  function holders(v, lead) {
    if (!lead) return '';
    const items = JERSEYS.filter(([k]) => lead[k]).map(([k, c]) => `<li>${jersey(c)}<span class="muted">${esc(T('gt_j_' + k))}</span> <b>${esc(lead[k])}</b></li>`).join('');
    return items ? `<ul class="gt-holders">${items}</ul>` : '';
  }

  const tbl = (head, rows) => `<div class="tscroll"><table class="stand"><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;

  /** Bảng tổng thời gian (áo vàng). */
  function gcTable(v) {
    const rows = v.table.map((x) => `<tr class="${x.adv ? 'adv' : ''}${x.out ? ' dnf' : ''}"><td>${x.out ? '–' : x.rank}</td><td class="nm">${who(x)}</td>${x.out
      ? `<td colspan="2"><span class="pill">${esc(T('gt_out', { n: x.out }))}</span></td>`
      : `<td><b>${esc(fmt(x.time))}</b>${x.bonus ? ` <small class="muted" title="${esc(T('gt_bonus_total'))}">−${x.bonus}″</small>` : ''}</td><td>${esc(fmtGap(x.gap))}</td>`}</tr>`).join('');
    return tbl(['#', '', T('race_total'), T('race_gap')], rows);
  }
  const ptsTable = (list, wins) => (list.length ? tbl(['#', '', T('race_pts'), ...(wins ? [T('race_wins')] : [])],
    list.map((x) => `<tr><td>${x.rank}</td><td class="nm">${who(x)}</td><td><b>${x.pts}</b></td>${wins ? `<td>${x.wins}</td>` : ''}</tr>`).join('')) : `<p class="hint">${esc(T('race_wait'))}</p>`);
  const youngTable = (list) => (list.length ? tbl(['#', '', T('race_total'), T('race_gap')],
    list.map((x) => `<tr><td>${x.rank}</td><td class="nm">${who(x)}</td><td><b>${esc(fmt(x.time))}</b></td><td>${esc(fmtGap(x.gap))}</td></tr>`).join('')) : `<p class="hint">${esc(T('gt_young_none'))}</p>`);
  const teamTable = (list) => (list.length ? tbl(['#', '', T('race_total'), T('race_gap')],
    list.map((x) => `<tr class="${x.out ? 'dnf' : ''}"><td>${x.out ? '–' : x.rank}</td><td class="nm">${esc(x.name)}</td>${x.out
      ? `<td colspan="2"><span class="pill">${esc(T('gt_team_out'))}</span></td>` : `<td><b>${esc(fmt(x.time))}</b></td><td>${esc(fmtGap(x.gap))}</td>`}</tr>`).join('')) : `<p class="hint">${esc(T('gt_team_none'))}</p>`);

  /** Kết quả một chặng đã nhập: bảng + người giữ áo sau chặng. */
  function eventResult(ev) {
    const rows = ev.rows.map((x) => (x.dnf ? `<tr class="dnf"><td>–</td><td class="nm">${who(x)}</td><td colspan="5"><span class="pill">${esc(T('race_dnf'))}</span></td></tr>`
      : `<tr><td>${x.rank}</td><td class="nm">${who(x)}</td><td>${x.rank === 1 ? `<b>${esc(fmt(x.time))}</b>` : esc(fmtGap(x.gap) || T('gt_same_time'))}</td>
        <td>${x.bonus ? (x.bonus > 0 ? `−${x.bonus}″` : `+${-x.bonus}″`) : ''}</td><td>${x.green || ''}</td><td>${x.kom || ''}</td></tr>`)).join('');
    return `${tbl(['#', '', T('gt_time'), T('gt_bonus'), T('gt_green_pts'), T('gt_kom_pts')], rows)}<h6>${esc(T('gt_after'))}</h6>${holders(null, ev.lead)}`;
  }

  /** Khung nhập chặng i: mỗi tay đua còn trong cuộc đua một dòng; dán nhanh cả danh sách. */
  function eventForm(t, v, i) {
    const key = dkey(t, v, i), d = S.draft[key] || {};
    const riders = v.entrants.filter((p) => !p.out);
    const inp = (cls, x, attrs) => `<input class="${esc(cls)}" ${attrs} value="${esc(x == null ? '' : x)}">`;
    const rows = riders.map((p) => {
      const x = d[p.uid] || {};
      return `<tr data-uid="${esc(p.uid)}" data-name="${esc(p.name.toLowerCase())}"><td class="nm">${who(p)}</td>
        <td>${inp('g-rank', x.rank, `type="number" min="1" max="${riders.length}" inputmode="numeric" placeholder="${esc(T('race_rank'))}"`)}</td>
        <td>${inp('g-time', x.time, `inputmode="decimal" placeholder="${esc(T('gt_time_ph'))}"`)}</td>
        <td>${inp('g-kom', x.kom, `type="number" min="0" max="100" inputmode="numeric" placeholder="${esc(T('gt_kom_pts'))}"`)}</td>
        <td>${inp('g-sp', x.sp, `type="number" min="0" max="200" inputmode="numeric" placeholder="${esc(T('gt_sprint'))}"`)}</td>
        <td>${inp('g-bs', x.bs, `type="number" min="-600" max="600" inputmode="numeric" placeholder="${esc(T('gt_bonus_s'))}"`)}</td>
        <td><label class="check"><input type="checkbox" class="g-dnf" ${x.dnf ? 'checked' : ''}> <span>${esc(T('race_dnf'))}</span></label></td></tr>`;
    }).join('');
    return `<form class="gt-form" data-key="${esc(key)}" data-ev="${i}">
      <p class="hint">${esc(T('gt_form_hint'))}</p>
      <details class="gt-paste"><summary>${esc(T('gt_paste'))}</summary><p class="hint">${esc(T('gt_paste_hint'))}</p>
        <textarea rows="5" class="g-paste" placeholder="${esc(T('gt_paste_ph'))}">${esc(S.paste[key] || '')}</textarea>
        <button type="button" class="ghost sm" data-act="otGtPaste" data-key="${esc(key)}">${esc(T('gt_paste_apply'))}</button></details>
      <button type="button" class="ghost sm" data-act="otGtFill">${esc(T('race_fill'))}</button>
      <div class="tscroll"><table class="stand race-in gt-in"><tbody>${rows}</tbody></table></div>
      <p class="err">${esc(S.err[key] || '')}</p><div class="row"><button class="primary">${esc(T('race_save'))}</button></div></form>`;
  }

  K.gtHtml = (t, v) => {
    const can = t.canManage && t.status === 'running' && v.index === (t.stage || 0);
    const next = v.events.findIndex((e) => !e.done);
    const lastDone = v.events.map((e) => e.done).lastIndexOf(true);
    const g = v.gt || {};
    const k = (x) => `${t.id}:g${v.index}:${x}`;
    const now = lastDone >= 0 ? `<div class="gt-now"><h5>${esc(T('gt_now', { n: lastDone + 1 }))}</h5>${holders(v, v.events[lastDone].lead)}</div>` : '';
    const cls = [
      K.fold(k('gc'), `${jersey('yellow')}<b>${esc(T('gt_c_gc'))}</b>`, () => gcTable(v), true),
      K.fold(k('green'), `${jersey('green')}<b>${esc(T('gt_c_green'))}</b>`, () => ptsTable(g.green || [], true), false),
      K.fold(k('kom'), `${jersey('kom')}<b>${esc(T('gt_c_kom'))}</b>`, () => ptsTable(g.kom || [], false), false),
      K.fold(k('young'), `${jersey('white')}<b>${esc(T('gt_c_young'))}</b>`, () => youngTable(g.young || []), false),
      K.fold(k('team'), `${jersey('team')}<b>${esc(T('gt_c_team'))}</b>`, () => teamTable(g.teams || []), false),
    ].join('');
    const evs = v.events.map((ev) => {
      const title = `<b>${esc(T('gt_stage_n', { n: ev.i + 1 }))}</b> <small class="gt-kind k-${esc(ev.kind)}">${esc(T('gt_kind_' + ev.kind))}</small> ${ev.done ? icon('check', 'ok') : `<span class="muted">${esc(T('race_pending'))}</span>`}`;
      const undo = can && ev.i === lastDone ? `<div class="row"><button type="button" class="ghost sm danger" data-act="otRaceUndo" data-ev="${ev.i}">${esc(T('race_undo'))}</button></div>` : '';
      const body = () => (ev.done ? eventResult(ev) + undo : can && ev.i === next ? eventForm(t, v, ev.i) : `<p class="hint">${esc(T(can ? 'gt_wait_prev' : 'race_wait'))}</p>`);
      return K.fold(`${t.id}:r${v.index}:${ev.i}`, title, body, can ? ev.i === next : ev.i === lastDone);
    }).join('');
    return `${now}${cls}<h5>${esc(T('gt_stages'))}</h5>${evs}`;
  };

  // ------------------------------------------------------------ Thao tác
  /** Đọc các ô của khung nhập vào nháp. */
  function read(form) {
    const d = {}, val = (tr, c) => tr.querySelector(c).value.trim();
    form.querySelectorAll('tr[data-uid]').forEach((tr) => {
      d[tr.dataset.uid] = { rank: val(tr, '.g-rank'), time: val(tr, '.g-time'), kom: val(tr, '.g-kom'), sp: val(tr, '.g-sp'), bs: val(tr, '.g-bs'), dnf: tr.querySelector('.g-dnf').checked };
    });
    S.draft[form.dataset.key] = d;
    const p = form.querySelector('.g-paste');
    if (p) S.paste[form.dataset.key] = p.value;
    return d;
  }
  const setRow = (tr, x) => {
    for (const k of ['rank', 'time', 'kom', 'sp', 'bs']) if (x[k] != null) tr.querySelector('.g-' + k).value = x[k];
    if (x.dnf != null) tr.querySelector('.g-dnf').checked = x.dnf;
  };

  /**
   * Đổi nháp thành các dòng gửi máy chủ. Thời gian: "4:12:33" tuyệt đối, "+0:12" chậm hơn người về nhất, trống = như
   * người về ngay trước. Trả { rows } hoặc { err } (chuỗi đã dịch).
   */
  function toRows(d) {
    const fin = [], rows = [];
    let missing = 0;
    for (const [uid, x] of Object.entries(d)) {
      if (x.dnf) { rows.push({ uid, dnf: true }); continue; }
      if (!x.rank) { missing++; continue; }
      fin.push({ uid, rank: Number(x.rank), x });
    }
    if (missing) return { err: T('srv_ot_gt_missing', { n: missing }) };
    if (!fin.length) return { err: T('srv_ot_race_empty') };
    fin.sort((a, b) => a.rank - b.rank);
    let lead = null, prev = null;
    for (const f of fin) {
      const s = f.x.time;
      let ms;
      if (!s) ms = prev;
      else if (s[0] === '+') { const g = s.slice(1).trim() === '0' ? 0 : RU.parseTime(s.slice(1)); ms = lead != null && g != null ? lead + g : null; } else ms = RU.parseTime(s);
      if (ms == null) return { err: T(prev == null ? 'gt_err_first' : 'srv_ot_race_time') };
      if (lead == null) lead = ms;
      prev = ms;
      const r = { uid: f.uid, rank: f.rank, time: ms };
      for (const k of ['kom', 'sp', 'bs']) if (f.x[k] !== '' && f.x[k] != null) r[k] = Number(f.x[k]);
      rows.push(r);
    }
    return { rows };
  }

  K.acts.otGtFill = (b) => { // điền thứ hạng theo thứ tự danh sách (trừ người bỏ cuộc)
    const form = b.closest('form');
    let n = 0;
    form.querySelectorAll('tr[data-uid]').forEach((tr) => { if (!tr.querySelector('.g-dnf').checked) tr.querySelector('.g-rank').value = ++n; });
    read(form);
  };
  /**
   * Dán danh sách về đích: mỗi dòng "Tên | thời gian | leo núi | nước rút | giây thưởng" theo thứ tự về đích (dấu | hoặc
   * tab); "DNF" ở ô thời gian = bỏ cuộc. Tên khớp không phân biệt hoa thường.
   */
  K.acts.otGtPaste = (b) => {
    const form = b.closest('form'), key = form.dataset.key;
    const trs = new Map([...form.querySelectorAll('tr[data-uid]')].map((tr) => [tr.dataset.name, tr]));
    const bad = [];
    let n = 0;
    for (const line of form.querySelector('.g-paste').value.split(/\r?\n/)) {
      const parts = line.split(/\t|\|/).map((x) => x.trim());
      if (!parts[0]) continue;
      const tr = trs.get(parts[0].replace(/^\d+[.)]\s*/, '').toLowerCase());
      if (!tr) { bad.push(parts[0]); continue; }
      const [, time = '', kom = '', sp = '', bs = ''] = parts;
      if (/^(dnf|bỏ cuộc|сход|退赛)$/i.test(time)) setRow(tr, { dnf: true, rank: '', time: '' });
      else setRow(tr, { dnf: false, rank: ++n, time, kom, sp, bs });
    }
    read(form);
    S.err[key] = bad.length ? T('gt_paste_bad', { names: bad.slice(0, 5).join(', ') + (bad.length > 5 ? '…' : '') }) : '';
    form.querySelector('.err').textContent = S.err[key];
  };

  K.binders.push((body) => {
    body.querySelectorAll('.gt-form').forEach((form) => {
      form.addEventListener('input', () => read(form));
      form.addEventListener('change', () => read(form));
      form.onsubmit = (e) => {
        e.preventDefault();
        const key = form.dataset.key, r = toRows(read(form));
        S.err[key] = r.err || '';
        form.querySelector('.err').textContent = S.err[key];
        if (r.err) return;
        S.last = key;
        O.send({ t: 'otRace', id: D.ot.id, event: Number(form.dataset.ev), rows: r.rows });
      };
    });
  });
  K.gtToRows = toRows; // cho kiểm thử
  if (!O) return;
  O.on('otPatch', () => { if (S.last) { delete S.draft[S.last]; delete S.paste[S.last]; S.last = null; } });
  O.on('error', (m) => {
    if (m.ctx !== 'otRace' || !S.last) return;
    S.err[S.last] = T('srv_' + m.code, m.args || {});
    const f = document.querySelector(`.gt-form[data-key="${S.last}"] .err`);
    if (f) f.textContent = S.err[S.last];
  });
})();
