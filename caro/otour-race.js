/*
 * Giải đấu Offline – hệ Race trên trang giải (máy chủ: server/src/hub/stages-race.js, otour-race.js). K.raceHtml(t, v)
 * – tour-stages.js gọi cho giai đoạn kiểu 'race':
 *   - Bảng xếp hạng chung: điểm (số lần về nhất, số lần lên bục) hoặc tổng thời gian + chênh lệch với người dẫn đầu và
 *     với người ngay trên; đánh dấu suất đi tiếp. Bảng đội (như bảng đội đua F1) nếu bật.
 *   - Từng chặng: kết quả (hạng, điểm – điểm sửa tay có dấu *, hoặc thời gian + chênh lệch); ban tổ chức nhập chặng
 *     chưa có kết quả (thứ hạng / thời gian "1:23.456", bỏ cuộc, điểm sửa tay) và huỷ chặng đã nhập.
 * Chặng chia lượt (heat – đoàn rất đông): mỗi lượt một khung nhập / kết quả riêng (huỷ được từng lượt); đủ các lượt thì
 * hiện kết quả gộp của chặng.
 * Ô đang nhập được giữ lại khi trang vẽ lại (bản vá từ máy chủ).
 */
(function () {
  'use strict';
  const K = window.CaroTourKit;
  const RU = window.CaroOTourRules;
  if (!K || !RU) return;
  const { O, T, esc, D, icon } = K;
  const S = { draft: {}, err: {} }; // nháp theo "mã giải:giai đoạn:chặng" → uid → { v, dnf, pts }

  const dkey = (t, v, i) => `${t.id}:${v.index}:${i}`;
  const gap = (ms) => (ms ? RU.fmtGap(ms) : '');

  function standings(v) {
    const pts = v.cfg.score !== 'time';
    const head = pts ? `<th>#</th><th></th><th>${esc(T('race_pts'))}</th><th>${esc(T('race_wins'))}</th><th>${esc(T('race_podiums'))}</th>`
      : `<th>#</th><th></th><th>${esc(T('race_total'))}</th><th>${esc(T('race_gap'))}</th><th>${esc(T('race_gap_prev'))}</th>`;
    const rows = v.table.map((x) => `<tr class="${x.adv ? 'adv' : ''}"><td>${x.rank}</td><td class="nm">${esc(x.name)}${x.dnf ? ` <small class="muted">${esc(T('race_dnf_n', { n: x.dnf }))}</small>` : ''}</td>${pts
      ? `<td><b>${x.pts}</b></td><td>${x.wins}</td><td>${x.podiums}</td>`
      : `<td><b>${x.time != null ? esc(RU.fmtTime(x.time)) : '–'}</b></td><td>${esc(gap(x.gap))}</td><td>${esc(gap(x.gapPrev))}</td>`}</tr>`).join('');
    return `<div class="tscroll"><table class="stand"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  function teamsTable(v) {
    if (!v.teams || !v.teams.length) return '';
    return `<h5>${esc(T('race_teams'))}</h5><div class="tscroll"><table class="stand"><thead><tr><th>#</th><th></th><th>${esc(T('race_pts'))}</th></tr></thead><tbody>${
      v.teams.map((x) => `<tr><td>${x.rank}</td><td class="nm">${esc(x.name)}</td><td><b>${x.pts}</b></td></tr>`).join('')}</tbody></table></div>`;
  }

  /** Kết quả một chặng đã nhập. */
  function eventResult(v, ev) {
    const pts = v.cfg.score !== 'time';
    return `<ol class="race-rows">${ev.rows.map((x) => `<li class="${x.dnf ? 'dnf' : ''}"><span class="nm">${esc(x.name)}</span> ${x.dnf ? `<span class="pill">${esc(T('race_dnf'))}</span>` : ''}${pts
      ? `<b>${x.pts}${x.manual ? '*' : ''}</b>`
      : x.dnf ? '' : `<b>${esc(RU.fmtTime(x.time))}</b> <small class="muted">${esc(gap(x.gap))}${x.gapPrev ? ' · ' + esc(gap(x.gapPrev)) : ''}</small>`}</li>`).join('')}</ol>`;
  }

  /**
   * Khung nhập một chặng (hoặc lượt h của chặng chia lượt): mỗi người một dòng (thứ hạng hoặc thời gian, bỏ cuộc, điểm
   * sửa tay). Trống = không xuất phát.
   */
  function eventForm(t, v, i, h) {
    const pts = v.cfg.score !== 'time', key = dkey(t, v, i) + (h != null ? ':h' + h : ''), d = S.draft[key] || {};
    const names = new Map(v.entrants.map((p) => [p.uid, p]));
    const members = h != null ? heatUids(v, i)[h].map((u) => names.get(u) || { uid: u, name: '?' }) : v.entrants;
    const rows = members.map((p) => {
      const x = d[p.uid] || {};
      return `<tr data-uid="${esc(p.uid)}"><td class="nm">${esc(p.name)}</td>
        <td><input class="r-v" ${pts ? `type="number" min="1" max="${members.length}" inputmode="numeric" placeholder="${esc(T('race_rank'))}"` : `inputmode="decimal" placeholder="1:23.456"`} value="${esc(x.v || '')}"></td>
        <td><label class="check"><input type="checkbox" class="r-dnf" ${x.dnf ? 'checked' : ''}> <span>${esc(T('race_dnf'))}</span></label></td>
        ${pts ? `<td><input class="r-pts" type="number" min="-1000" max="1000" placeholder="${esc(T('race_pts_auto'))}" value="${esc(x.pts || '')}"></td>` : ''}</tr>`;
    }).join('');
    return `<form class="race-form" data-key="${esc(key)}" data-ev="${i}"${h != null ? ` data-heat="${h}"` : ''}>
      <p class="hint">${esc(T(pts ? 'race_form_hint' : 'race_form_hint_time'))}</p>
      ${pts ? `<button type="button" class="ghost sm" data-act="otRaceFill" data-key="${esc(key)}">${esc(T('race_fill'))}</button>` : ''}
      <div class="tscroll"><table class="stand race-in"><tbody>${rows}</tbody></table></div>
      <p class="err">${esc(S.err[key] || '')}</p><div class="row"><button class="primary">${esc(T('race_save'))}</button></div></form>`;
  }

  /** Chặng chia lượt: kết quả gộp (khi đủ các lượt) + từng lượt (người trong lượt, khung nhập hoặc kết quả). */
  /** Người trong từng lượt của chặng i – tự tính như máy chủ (RU.heatsOf, cùng thứ tự entrants); máy chủ không gửi danh sách. */
  const heatUids = (v, i) => RU.heatsOf(v.entrants.map((p) => p.uid), v.cfg.heat, i);
  function heatsHtml(t, v, ev, can, undo) {
    const names = new Map(v.entrants.map((p) => [p.uid, p.name]));
    const hs = heatUids(v, ev.i);
    const all = ev.done ? `<h6>${esc(T('race_heats_all'))}</h6>${eventResult(v, ev)}` : '';
    return all + ev.heats.map((x) => `<div class="race-heat"><h6>${esc(T('race_heat_n', { n: x.h + 1 }))} ${x.done ? icon('check', 'ok') : `<small class="muted">${esc(T('race_heat_size', { n: (hs[x.h] || []).length }))}</small>`}</h6>${
      x.done ? eventResult(v, x) + undo(x.h) : can ? eventForm(t, v, ev.i, x.h)
        : `<p class="hint">${esc(T('race_wait'))}</p><p class="muted race-who">${(hs[x.h] || []).map((u) => esc(names.get(u) || '?')).join(', ')}</p>`}</div>`).join('');
  }

  K.raceHtml = (t, v) => {
    if (v.cfg.score === 'gt' && K.gtHtml) return K.gtHtml(t, v); // xe đạp nhiều chặng (otour-gt.js)
    const can = t.canManage && t.status === 'running' && v.index === (t.stage || 0);
    const next = v.events.findIndex((e) => !e.done);
    const lastDone = v.events.map((e) => e.done).lastIndexOf(true);
    const evs = v.events.map((ev) => {
      const title = `<b>${esc(T('race_event_n', { n: ev.i + 1 }))}</b> ${ev.done ? icon('check', 'ok') : `<span class="muted">${esc(T('race_pending'))}</span>`}`;
      const undo = (h) => (can ? `<div class="row"><button type="button" class="ghost sm danger" data-act="otRaceUndo" data-ev="${ev.i}"${h != null ? ` data-heat="${h}"` : ''}>${esc(T(h != null ? 'race_undo_heat' : 'race_undo'))}</button></div>` : '');
      const body = () => (ev.heats ? heatsHtml(t, v, ev, can, undo)
        : ev.done ? eventResult(v, ev) + undo(null) : can ? eventForm(t, v, ev.i) : `<p class="hint">${esc(T('race_wait'))}</p>`);
      // Mở sẵn: ban tổ chức – chặng cần nhập tiếp; người xem – chặng vừa có kết quả
      return K.fold(`${t.id}:r${v.index}:${ev.i}`, title, body, can ? ev.i === next : ev.i === lastDone);
    }).join('');
    return `${standings(v)}${teamsTable(v)}${evs}`;
  };

  // ------------------------------------------------------------ Thao tác
  /** Đọc các ô của một khung nhập vào nháp. */
  function read(form) {
    const d = {};
    form.querySelectorAll('tr[data-uid]').forEach((tr) => {
      const v = tr.querySelector('.r-v').value.trim(), dnf = tr.querySelector('.r-dnf').checked, p = tr.querySelector('.r-pts');
      d[tr.dataset.uid] = { v, dnf, pts: p ? p.value.trim() : '' };
    });
    S.draft[form.dataset.key] = d;
    return d;
  }
  K.acts.otRaceUndo = (b) => window.CaroConfirm.ask(T('race_undo_confirm', { n: Number(b.dataset.ev) + 1 }))
    .then((ok) => { if (ok) O.send({ t: 'otRaceUndo', id: D.ot.id, event: Number(b.dataset.ev), ...(b.dataset.heat != null ? { heat: Number(b.dataset.heat) } : {}) }); });
  // Điền thứ hạng theo thứ tự danh sách (rồi sửa vài dòng) – nhanh cho chặng nhiều người
  K.acts.otRaceFill = (b) => {
    const form = b.closest('form');
    let k = 0;
    form.querySelectorAll('tr[data-uid]').forEach((tr) => { if (!tr.querySelector('.r-dnf').checked) tr.querySelector('.r-v').value = ++k; });
    read(form);
  };

  K.binders.push((body) => {
    body.querySelectorAll('.race-form').forEach((form) => {
      form.addEventListener('input', () => read(form));
      form.addEventListener('change', () => read(form));
      form.onsubmit = (e) => {
        e.preventDefault();
        const d = read(form), key = form.dataset.key, pts = !!form.querySelector('.r-pts');
        const fail = (code) => { S.err[key] = T(code); form.querySelector('.err').textContent = S.err[key]; };
        const rows = [];
        for (const [uid, x] of Object.entries(d)) {
          if (!x.v && !x.dnf) continue; // không xuất phát
          const r = { uid };
          if (x.dnf) r.dnf = true;
          else if (pts) r.rank = Number(x.v);
          else { r.time = RU.parseTime(x.v); if (r.time == null) return fail('srv_ot_race_time'); }
          if (pts && x.pts !== '') r.pts = Number(x.pts);
          rows.push(r);
        }
        if (!rows.some((r) => !r.dnf)) return fail('srv_ot_race_empty');
        S.err[key] = '';
        S.last = key;
        O.send({ t: 'otRace', id: D.ot.id, event: Number(form.dataset.ev), ...(form.dataset.heat != null ? { heat: Number(form.dataset.heat) } : {}), rows });
      };
    });
  });
  // Lưu xong: bỏ nháp của chặng; lỗi: hiện trong khung vừa gửi (trang nhúng embed.html không có kết nối O: bỏ qua)
  if (!O) return;
  O.on('otPatch', () => { if (S.last) { delete S.draft[S.last]; S.last = null; } });
  O.on('error', (m) => {
    if (m.ctx !== 'otRace' || !S.last) return;
    S.err[S.last] = T('srv_' + m.code, m.args || {});
    const f = document.querySelector(`.race-form[data-key="${S.last}"] .err`);
    if (f) f.textContent = S.err[S.last];
  });
})();
