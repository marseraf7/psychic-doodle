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
  const LET = 'ABCDEFGH';
  /** Số bảng xoay vòng (0: không xoay); true = 3 bảng (cách cũ). */
  const rotG = (v) => (v.cfg.rot === true ? 3 : Number(v.cfg.rot) >= 3 ? Number(v.cfg.rot) : 0);
  const groupOfRot = (j, G) => (G === 3 ? RU.lobbyGroup(j) : RU.snakeGroup(j, G));
  /** Hai bảng đấu trận i (chữ cái), như máy chủ (RU.lobbyOf). */
  const rotPair = (i, G) => (G === 3 ? [0, 1, 2].filter((k) => k !== (i + 2) % 3) : RU.rotPairs(G)[i % RU.rotPairs(G).length]).map((k) => LET[k]).join(' + ');
  /** Nhãn "Vào thẳng giai đoạn n" của đội được chuyển thẳng (máy chủ ghi x.to; bản cũ: giai đoạn 3). */
  K.skipTag = (x) => (x.to ? T('adv_to_tag', { n: x.to }) : T('adv_skip_tag'));
  const gap = (ms) => (ms ? RU.fmtGap(ms) : '');

  function standings(v) {
    const pts = v.cfg.score !== 'time';
    const kill = pts && v.cfg.kill; // sinh tồn: cột số hạ gục
    const dmg = pts && v.cfg.dmg; // cột tổng sát thương (chỉ số phụ cuối)
    const head = pts ? `<th>#</th><th></th><th>${esc(T('race_pts'))}</th>${kill ? `<th>${esc(T('br_kills'))}</th>` : ''}${dmg ? `<th>${esc(T('br_dmg'))}</th>` : ''}<th>${esc(T('race_wins'))}</th><th>${esc(T('race_podiums'))}</th>`
      : `<th>#</th><th></th><th>${esc(T('race_total'))}</th><th>${esc(T('race_gap'))}</th><th>${esc(T('race_gap_prev'))}</th>`;
    const rowsOf = (list) => list.map((x) => `<tr class="${x.adv ? 'adv' : ''}"><td>${x.rank}</td><td class="nm">${esc(x.name)}${x.dnf ? ` <small class="muted">${esc(T('race_dnf_n', { n: x.dnf }))}</small>` : ''}${x.skip ? ` <small class="pill">${esc(K.skipTag(x))}</small>` : ''}${x.mp && !(v.mp && v.mp.winner) ? ` <small class="pill mp">${esc(T('mp_tag'))}</small>` : ''}</td>${pts
      ? `<td><b>${x.pts}</b>${x.head ? ` <small class="muted" title="${esc(T('br_head_tip'))}">(+${x.head})</small>` : ''}</td>${kill ? `<td>${x.kills || 0}</td>` : ''}${dmg ? `<td>${x.dmg || 0}</td>` : ''}<td>${x.wins}</td><td>${x.podiums}</td>`
      : `<td><b>${x.time != null ? esc(RU.fmtTime(x.time)) : '–'}</b></td><td>${esc(gap(x.gap))}</td><td>${esc(gap(x.gapPrev))}</td>`}</tr>`).join('');
    const tbl = (list) => `<div class="tscroll"><table class="stand"><thead><tr>${head}</tr></thead><tbody>${rowsOf(list)}</tbody></table></div>`;
    // Match point: ngưỡng điểm, đội đã đạt ngưỡng, đội thắng theo match point
    const mp = v.mp ? `<p class="hint mp-note">${esc(v.mp.winner ? T('mp_won', { name: v.mp.winner }) : v.mp.at != null ? T('mp_note', { n: v.mp.at }) + (v.cfg.mp && v.cfg.mp.min > 1 ? ' ' + T('mp_min_note', { n: v.cfg.mp.min }) : '') : T('mp_wait', { n: v.cfg.mp.after, p: v.cfg.mp.plus }))}</p>` : '';
    // Chia N bảng xoay vòng: ghi các bảng (3 bảng: cách chia cũ; 4–8 bảng: chia kiểu rắn)
    const G = rotG(v);
    const rot = G ? `<p class="hint">${esc(T(G === 3 ? 'br_rot_note' : 'br_rotn_note', { n: G }))} ${Array.from({ length: G }, (_, k) => `<b>${LET[k]}</b>: ${esc(v.entrants.filter((_, j) => groupOfRot(j, G) === k).map((p) => p.name).join(', '))}`).join(' · ')}</p>` : '';
    // Hệ số phụ kiểu PUBG (mới / cũ); cổng thắng trận; mang điểm giai đoạn trước; chia bảng cố định: bảng từng bảng
    const tb = v.cfg.tb ? `<p class="hint">${esc(T(v.cfg.tb === 'pubg_k' ? 'br_tb_pubg_k_note' : 'br_tb_pubg_note'))}${v.cfg.tb === 'pubg' && v.cfg.dmg ? ' ' + esc(T('br_tb_dmg_note')) : ''}</p>` : '';
    const gate = v.cfg.gate ? `<p class="hint">${esc(T('br_gate_note', { n: v.cfg.gate.seats, k: v.cfg.events || 1 }))}</p>` : '';
    const carry = v.cfg.carry ? `<p class="hint">${esc(T('br_carry_note'))}</p>` : '';
    if (v.circuit) return `${tb}${circuitHtml(v, tbl)}`;
    if (v.weekly) return `${tb}${weeklyHtml(v, tbl)}`;
    if (v.groups) return `${tb}<p class="hint">${esc(T('br_groups_note', { n: v.groups.length }))}</p>` + v.groups.map((g) => `<h5>${esc(T('group_name', { name: g.name }))}</h5>${tbl(g.table)}`).join('');
    return `${mp}${gate}${carry}${rot}${tb}${tbl(v.table)}`;
  }

  /** Hệ Circuit: ghi chú, bảng cộng dồn các ngày Final, bảng từng ngày đã đấu (ngày mới nhất mở sẵn). */
  function circuitHtml(v, tbl) {
    const C = v.cfg.circuit;
    const note = `<p class="hint">${esc(T('br_ci_note', { n: C.n, d: C.days, k: C.keep }))}</p>`;
    const days = (v.circuit || []).map((d, x, all) => K.fold(`ci:${v.index}:${d.c}:${d.j}`, `<b>${esc(ciDay(d.c, d.j, C))}</b> ${d.done ? icon('check', 'ok') : ''}`,
      () => tbl(d.table), x === all.length - 1)).reverse().join('');
    return `${note}<h5>${esc(T('br_ci_bank'))}</h5>${tbl(v.table)}${days}`;
  }
  /** Vòng tuần (PGC 2021): ghi chú, bảng giai đoạn (đội nhất tuần, rồi điểm Weekly Finals cộng dồn), từng tuần. */
  function weeklyHtml(v, tbl) {
    const W = v.cfg.weekly;
    const note = `<p class="hint">${esc(T('br_wk_note', { n: W.weeks, s: W.seats, f: W.final, b: W.bottom }))}</p>`;
    const weeks = (v.weekly || []).map((x, k, all) => K.fold(`wk:${v.index}:${x.w}`, `<b>${esc(T('br_wk_week', { n: x.w + 1 }))}</b> ${x.done ? icon('check', 'ok') : ''}`, () =>
      `<p class="hint">${esc(T('br_wk_winners'))} ${esc(x.winners.map((p) => p.name).join(', ') || '–')}</p><h6>${esc(T('br_wk_final'))}</h6>${tbl(x.final)}${x.bottom ? `<h6>${esc(T('br_wk_bottom'))}</h6>${tbl(x.bottom)}` : ''}`, k === all.length - 1)).reverse().join('');
    return `${note}<h5>${esc(T('br_wk_overall'))}</h5>${tbl(v.table)}${weeks}`;
  }
  /** Trận i của vòng tuần: tuần w, loại, thứ tự k (như stages-weekly.js phase). */
  function wkPhase(W, i) {
    const per = W.seats + W.final + W.bottom;
    let w = Math.min(W.weeks - 1, Math.floor(i / per));
    while (w > 0 && i < w * per) w--;
    const r = i - w * per;
    return r < W.seats ? { w, kind: 'surv', k: r } : r < W.seats + W.final ? { w, kind: 'final', k: r - W.seats } : { w, kind: 'bottom', k: r - W.seats - W.final };
  }
  const ciDay = (c, j, C) => (j === C.days - 1 ? T('br_ci_final', { c: c + 1 }) : T('br_ci_day', { c: c + 1, j: j + 1 }));

  function teamsTable(v) {
    if (!v.teams || !v.teams.length) return '';
    return `<h5>${esc(T('race_teams'))}</h5><div class="tscroll"><table class="stand"><thead><tr><th>#</th><th></th><th>${esc(T('race_pts'))}</th></tr></thead><tbody>${
      v.teams.map((x) => `<tr><td>${x.rank}</td><td class="nm">${esc(x.name)}</td><td><b>${x.pts}</b></td></tr>`).join('')}</tbody></table></div>`;
  }

  /** Kết quả một chặng đã nhập. */
  function eventResult(v, ev) {
    const pts = v.cfg.score !== 'time';
    return `<ol class="race-rows">${ev.rows.map((x) => `<li class="${x.dnf ? 'dnf' : ''}"><span class="nm">${esc(x.name)}</span> ${x.dnf ? `<span class="pill">${esc(T('race_dnf'))}</span>` : ''}${pts
      ? `${x.kills ? `<small class="muted">${esc(T('br_kills_n', { n: x.kills }))}</small> ` : ''}<b>${x.pts}${x.manual ? '*' : ''}</b>`
      : x.dnf ? '' : `<b>${esc(RU.fmtTime(x.time))}</b> <small class="muted">${esc(gap(x.gap))}${x.gapPrev ? ' · ' + esc(gap(x.gapPrev)) : ''}</small>`}</li>`).join('')}</ol>`;
  }

  /**
   * Khung nhập một chặng (hoặc lượt h của chặng chia lượt): mỗi người một dòng (thứ hạng hoặc thời gian, bỏ cuộc, điểm
   * sửa tay). Trống = không xuất phát.
   */
  function eventForm(t, v, i, h) {
    const pts = v.cfg.score !== 'time', key = dkey(t, v, i) + (h != null ? ':h' + h : ''), d = S.draft[key] || {};
    const names = new Map(v.entrants.map((p) => [p.uid, p]));
    const ev = v.events[i] || {};
    // Lượt: người trong lượt; cổng thắng trận / hệ Circuit: phòng đấu máy chủ gửi; chia bảng: bảng của trận; xoay vòng: hai bảng đấu trận này
    const members = h != null ? heatUids(v, i, (v.events || []).find((e) => e.i === i))[h].map((u) => names.get(u) || { uid: u, name: '?' })
      : Array.isArray(ev.lobby) ? ev.lobby.map((u) => names.get(u) || { uid: u, name: '?' })
        : v.cfg.groups ? RU.groupList(v.entrants, v.cfg.groups, i % v.cfg.groups) : rotG(v) ? RU.lobbyOf(v.entrants, Math.floor(i / (v.cfg.rotBlock || 1)), rotG(v)) : v.entrants;
    const rows = members.map((p) => {
      const x = d[p.uid] || {};
      return `<tr data-uid="${esc(p.uid)}"><td class="nm">${esc(p.name)}</td>
        <td><input class="r-v" ${pts ? `type="number" min="1" max="${members.length}" inputmode="numeric" placeholder="${esc(T('race_rank'))}"` : `inputmode="decimal" placeholder="1:23.456"`} value="${esc(x.v || '')}"></td>
        <td><label class="check"><input type="checkbox" class="r-dnf" ${x.dnf ? 'checked' : ''}> <span>${esc(T('race_dnf'))}</span></label></td>
        ${pts && v.cfg.kill ? `<td><input class="r-k" type="number" min="0" max="200" inputmode="numeric" placeholder="${esc(T('br_kills'))}" value="${esc(x.k || '')}"></td>` : ''}
        ${pts && v.cfg.dmg ? `<td><input class="r-d" type="number" min="0" max="1000000" inputmode="numeric" placeholder="${esc(T('br_dmg'))}" value="${esc(x.d || '')}"></td>` : ''}
        ${pts && v.cfg.legendBan ? `<td><input class="r-pick" maxlength="30" placeholder="${esc(T('algs_pick'))}" value="${esc(x.pick || '')}" list="algs-legends"></td>` : ''}
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
  // Xếp lại lượt theo bảng điểm (cfg.reseed – kiểu TFT): máy chủ gửi sẵn danh sách từng lượt
  const heatUids = (v, i, ev) => (ev && ev.heats && ev.heats[0] && ev.heats[0].uids ? ev.heats.map((x) => x.uids) : RU.heatsOf(v.entrants.map((p) => p.uid), v.cfg.heat, i));
  function heatsHtml(t, v, ev, can, undo) {
    const names = new Map(v.entrants.map((p) => [p.uid, p.name]));
    const hs = heatUids(v, ev.i, ev);
    const all = ev.done ? `<h6>${esc(T('race_heats_all'))}</h6>${eventResult(v, ev)}` : '';
    return all + ev.heats.map((x) => `<div class="race-heat"><h6>${esc(T('race_heat_n', { n: x.h + 1 }))} ${x.done ? icon('check', 'ok') : `<small class="muted">${esc(T('race_heat_size', { n: (hs[x.h] || []).length }))}</small>`}</h6>${
      x.done ? eventResult(v, x) + undo(x.h) : can ? eventForm(t, v, ev.i, x.h)
        : `<p class="hint">${esc(T('race_wait'))}</p><p class="muted race-who">${(hs[x.h] || []).map((u) => esc(names.get(u) || '?')).join(', ')}</p>`}</div>`).join('');
  }

  K.raceHtml = (t, v) => {
    if (v.cfg.score === 'gt' && K.gtHtml) return K.gtHtml(t, v); // xe đạp nhiều chặng (otour-gt.js)
    if (v.cfg.score === 'golf' && K.golfHtml) return K.golfHtml(t, v); // golf đấu gậy (otour-golf.js)
    if ((v.omnium || v.mass || v.pursuit) && K.racePlugHtml) return K.racePlugHtml(t, v); // omnium, mass start, pursuit (otour-race-plug.js)
    if ((v.backyard || v.poker) && K.racePlug2Html) return K.racePlug2Html(t, v); // Backyard Ultra, poker có bounty (otour-race-plug2.js)
    const can = t.canManage && t.status === 'running' && v.index === (t.stage || 0);
    const next = v.events.findIndex((e) => !e.done);
    const lastDone = v.events.map((e) => e.done).lastIndexOf(true);
    const seq = !!(v.cfg.mp || v.cfg.gate || v.cfg.circuit || v.cfg.weekly); // match point / cổng thắng trận / Circuit / vòng tuần: nhập lần lượt
    const C = v.cfg.circuit, E = v.cfg.events || 1;
    const evs = v.events.map((ev) => {
      const G = v.cfg.groups; // chia bảng cố định: "Bảng A · trận 2"
      const wp = v.cfg.weekly ? wkPhase(v.cfg.weekly, ev.i) : null;
      const title = wp ? `<b>${esc(T('br_wk_week', { n: wp.w + 1 }) + ' · ' + T('br_wk_' + wp.kind) + ' · ' + T('race_event_n', { n: wp.k + 1 }))}</b>${wp.kind === 'surv' && ev.done && ev.rows[0] && !ev.rows[0].dnf ? ` <small class="pill">${esc(T('br_gate_win', { name: ev.rows[0].name }))}</small>` : ''} ${ev.done ? icon('check', 'ok') : `<span class="muted">${esc(T('race_pending'))}</span>`}` : C ? `<b>${esc(ciDay(Math.floor(ev.i / E / C.days), Math.floor(ev.i / E) % C.days, C) + ' · ' + T('race_event_n', { n: (ev.i % E) + 1 }))}</b> ${ev.done ? icon('check', 'ok') : `<span class="muted">${esc(T('race_pending'))}</span>`}` : `<b>${esc(G ? T('group_name', { name: String.fromCharCode(65 + (ev.i % G)) }) + ' · ' + T('race_event_n', { n: Math.floor(ev.i / G) + 1 }) : T('race_event_n', { n: ev.i + 1 }))}</b>${rotG(v) ? ` <small class="muted">${esc(T('br_rot_ev', { g: rotPair(Math.floor(ev.i / (v.cfg.rotBlock || 1)), rotG(v)) }))}</small>` : ''}${v.cfg.gate && ev.done && ev.rows[0] && !ev.rows[0].dnf ? ` <small class="pill">${esc(T('br_gate_win', { name: ev.rows[0].name }))}</small>` : ''} ${ev.done ? icon('check', 'ok') : `<span class="muted">${esc(T('race_pending'))}</span>`}`;
      const undo = (h) => (can ? `<div class="row"><button type="button" class="ghost sm danger" data-act="otRaceUndo" data-ev="${ev.i}"${h != null ? ` data-heat="${h}"` : ''}>${esc(T(h != null ? 'race_undo_heat' : 'race_undo'))}</button></div>` : '');
      const body = () => (ev.heats ? heatsHtml(t, v, ev, can, undo)
        // Match point: nhập lần lượt, chỉ huỷ trận sau cùng
        : ev.done ? eventResult(v, ev) + (seq && ev.i !== lastDone ? '' : undo(null)) : can && (!seq || ev.i === next) ? eventForm(t, v, ev.i) : `<p class="hint">${esc(T(can && seq ? 'gt_wait_prev' : 'race_wait'))}</p>`);
      // Mở sẵn: ban tổ chức – chặng cần nhập tiếp; người xem – chặng vừa có kết quả
      return K.fold(`${t.id}:r${v.index}:${ev.i}`, title, body, can ? ev.i === next : ev.i === lastDone);
    }).join('');
    return `${standings(v)}${teamsTable(v)}${K.algsHtml ? K.algsHtml(t, v, can) : ''}${evs}`; // draft POI, Legend bị cấm (otour-algs-ui.js)
  };

  // ------------------------------------------------------------ Thao tác
  /** Đọc các ô của một khung nhập vào nháp. */
  function read(form) {
    const d = {};
    form.querySelectorAll('tr[data-uid]').forEach((tr) => {
      const v = tr.querySelector('.r-v').value.trim(), dnf = tr.querySelector('.r-dnf').checked, p = tr.querySelector('.r-pts');
      const k = tr.querySelector('.r-k'), dm = tr.querySelector('.r-d'), pk = tr.querySelector('.r-pick');
      d[tr.dataset.uid] = { v, dnf, pts: p ? p.value.trim() : '', k: k ? k.value.trim() : '', d: dm ? dm.value.trim() : '', pick: pk ? pk.value.trim() : '' };
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
          if (pts && x.k) r.kills = Number(x.k);
          if (pts && x.d) r.dmg = Number(x.d);
          if (pts && x.pick) r.pick = x.pick; // Legend của đội (ALGS)
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
