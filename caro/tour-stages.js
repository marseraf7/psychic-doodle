/*
 * Giải đấu – vẽ các giai đoạn của giải: nhánh loại trực tiếp, nhánh thắng – thua + chung kết tổng,
 * bảng vòng tròn (từng bảng), bảng Thụy Sĩ (Buchholz), danh sách trận theo vòng.
 * Dữ liệu là tourView().stageViews của máy chủ (server/src/hub/bracket.js). Nạp sau tour.js.
 */
(function () {
  'use strict';
  const K = window.CaroTourKit;
  if (!K) return;
  const { T, esc, D, me } = K;

  /** Tên ngắn của một giai đoạn: "Vòng tròn (4 bảng)", "Thụy Sĩ (5 vòng)"… */
  function stageName(c) {
    const x = [];
    if (c.type === 'roundrobin' && c.groupSize) x.push(T('group_size_n', { n: c.groupSize }));
    else if (c.type === 'roundrobin' && c.groups > 1) x.push(T('groups_n', { n: c.groups }));
    if (c.type === 'swiss') x.push(T('rounds_n', { n: c.rounds }));
    return T('fmt_' + c.type) + (x.length ? ` (${x.join(', ')})` : '');
  }
  /** Ai đi tiếp sau giai đoạn này (chỉ giai đoạn trước vòng cuối). */
  const advText = (c) => (c.advance ? T(c.type === 'roundrobin' ? 'adv_group_n' : 'adv_n', { n: c.advance }) : '');

  // ---- Các giai đoạn: nhánh đấu, nhánh thắng-thua, bảng vòng tròn, Thụy Sĩ
  /** Tên vòng của nhánh loại trực tiếp (đếm từ cuối): Chung kết, Bán kết, Tứ kết, Vòng n. */
  function roundName(n, r, finalKey = 'r_final') {
    if (r === n - 1) return T(finalKey);
    if (r === n - 2) return T('r_semi');
    if (r === n - 3) return T('r_quarter');
    return T('r_round', { n: r + 1 });
  }
  const uidMe = () => me() && me().uid;
  const replays = (m) => m.games.map((g, i) => `<a href="#" data-act="replay" data-share="${esc(g)}">▶${i + 1}</a>`);
  function matchBox(m) {
    const row = (p, w, isWin) => p && p.uid
      ? `<div class="b-p ${isWin ? 'win' : ''} ${p.uid === uidMe() ? 'me' : ''}"><span class="seed">${p.seed || ''}</span><span class="nm">${esc(p.name)}</span><b>${m.bye ? '' : w}</b></div>`
      : `<div class="b-p empty"><span class="seed"></span><span class="nm">${esc(p && p.bye ? T('bye') : '—')}</span><b></b></div>`;
    const extra = [];
    if (m.live) extra.push(`<span class="pill live">● ${esc(T('live'))}</span>`);
    if (m.walkover) extra.push(esc(T('walkover')));
    if (m.double) extra.push(esc(T('both_absent')));
    extra.push(...replays(m));
    return `<div class="b-match ${m.live ? 'live' : ''}" data-mid="${esc(m.id)}">${row(m.a, m.wa, m.winner && m.a && m.winner === m.a.uid)}${row(m.b, m.wb, m.winner && m.b && m.winner === m.b.uid)}${extra.length ? `<small>${extra.join(' ')}</small>` : ''}</div>`;
  }
  /** Các cột của một nhánh đấu; name(r) là tên cột. */
  const bracketCols = (rounds, name) => `<div class="bracket">${rounds.map((round, r) => `<div class="b-col"><h5>${esc(name(r))}</h5>${round.map(matchBox).join('')}</div>`).join('')}</div>`;
  /** Một dòng trận (vòng tròn / Thụy Sĩ): A  2–1  B. */
  function matchRow(m) {
    const nm = (p, win) => (p && p.uid ? `<span class="nm ${win ? 'win' : ''} ${p.uid === uidMe() ? 'me' : ''}">${esc(p.name)}</span>`
      : `<span class="nm muted">${esc(p && p.bye ? T('bye') : '—')}</span>`);
    let mid;
    if (m.bye) mid = '';
    else if (m.live) mid = `<span class="pill live">● ${m.wa}–${m.wb}</span>`;
    else if (m.done) mid = `<b>${m.wa}–${m.wb}</b>`;
    else mid = `<span class="muted">vs</span>`;
    const tags = [];
    if (m.draw) tags.push(esc(T('draw')));
    if (m.walkover) tags.push(esc(T('walkover')));
    if (m.double) tags.push(esc(T('both_absent')));
    tags.push(...replays(m));
    return `<li class="mrow" data-mid="${esc(m.id)}">${nm(m.a, m.winner && m.a && m.winner === m.a.uid)}<span class="sc">${mid}</span>${nm(m.b, m.winner && m.b && m.winner === m.b.uid)}${tags.length ? `<small>${tags.join(' ')}</small>` : ''}</li>`;
  }
  /** Khối có thể thu gọn, nhớ trạng thái mở / đóng qua các lần vẽ lại. */
  function fold(key, title, body, openByDefault) {
    const isOpen = key in D.open ? D.open[key] : openByDefault;
    return `<details class="fold" data-k="${esc(key)}" ${isOpen ? 'open' : ''}><summary>${title}</summary>${body}</details>`;
  }
  function roundsList(key, rounds, label, openLast) {
    return fold(key, esc(T('matches')), rounds.map((r, i) => `<h6>${esc(label(i))}</h6><ul class="mlist">${r.map(matchRow).join('')}</ul>`).join(''), openLast);
  }
  /** Bảng xếp hạng của vòng tròn / Thụy Sĩ. */
  function table(rows, swiss) {
    const head = `<tr><th>#</th><th class="l">${esc(T('col_player'))}</th><th>${esc(T('col_mp'))}</th><th>${esc(T('col_wdl'))}</th><th>${esc(T('col_diff'))}</th>${swiss ? `<th>${esc(T('col_bh'))}</th>` : ''}<th>${esc(T('col_pts'))}</th></tr>`;
    const body = rows.map((x) => `<tr class="${x.adv ? 'adv' : ''} ${x.uid === uidMe() ? 'me' : ''}"><td>${x.rank}</td><td class="l">${esc(x.name)}</td><td>${x.mp}</td><td>${x.w}-${x.d}-${x.l}</td>
      <td>${x.gw - x.gl > 0 ? '+' : ''}${x.gw - x.gl}</td>${swiss ? `<td>${x.bh}</td>` : ''}<td><b>${x.pts}</b></td></tr>`).join('');
    return `<div class="tscroll"><table class="stand"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
  }
  function stageBody(t, v) {
    const key = t.id + ':' + v.index;
    if (v.type === 'single') {
      let html = bracketCols(v.rounds, (r) => roundName(v.rounds.length, r));
      if (v.third) html += `<h5>${esc(T('third_place'))}</h5><div class="bracket"><div class="b-col">${matchBox(v.third)}</div></div>`;
      return html;
    }
    if (v.type === 'double') {
      const gf = (v.gf || []).filter((m) => !m.skipped);
      return `<h5 class="br-h">${esc(T('wb'))}</h5>${bracketCols(v.rounds, (r) => roundName(v.rounds.length, r, 'wb_final'))}
        ${v.lrounds && v.lrounds.length ? `<h5 class="br-h">${esc(T('lb'))}</h5>${bracketCols(v.lrounds, (r) => (r === v.lrounds.length - 1 ? T('lb_final') : T('r_round', { n: r + 1 })))}` : ''}
        <h5 class="br-h">${esc(T('gf'))}</h5><div class="bracket">${gf.map((m, i) => `<div class="b-col">${gf.length > 1 ? `<h5>${esc(i ? T('gf_reset') : T('r_round', { n: 1 }))}</h5>` : ''}${matchBox(m)}</div>`).join('')}</div>`;
    }
    if (v.type === 'roundrobin') {
      return v.groups.map((g, gi) => {
        const head = v.groups.length > 1 ? `<h5>${esc(T('group_name', { name: g.name }))}</h5>` : '';
        const cur = g.rounds.findIndex((r) => r.some((m) => !m.done));
        return head + table(g.table, false) + roundsList(key + ':g' + gi, g.rounds, (i) => T('r_round', { n: i + 1 }), !v.done && cur >= 0);
      }).join('') + `<p class="hint">${esc(T('tb_note_rr'))}</p>`;
    }
    // Thụy Sĩ: vòng mới nhất lên đầu
    const rounds = v.rounds.map((r, i) => ({ r, i })).reverse();
    const want = (t.stages[v.index] || {}).rounds;
    const capped = want > v.totalRounds ? `<p class="hint">${esc(T('swiss_capped', { n: v.totalRounds, m: v.table.length }))}</p>` : '';
    return capped + table(v.table, true)
      + fold(key + ':r', esc(T('matches')), rounds.map(({ r, i }) => `<h6>${esc(T('swiss_round', { n: i + 1, m: v.totalRounds }))}</h6><ul class="mlist">${r.map(matchRow).join('')}</ul>`).join(''), !v.done)
      + `<p class="hint">${esc(T('tb_note_swiss'))}</p>`;
  }
  /** Tất cả giai đoạn của giải (giai đoạn chưa tới thì chỉ ghi cấu hình). */
  function stagesHtml(t) {
    const cfgs = t.stages || [];
    const views = t.stageViews || [];
    const multi = cfgs.length > 1;
    return cfgs.map((c, i) => {
      const v = views[i];
      const info = [stageName(c), 'Bo' + c.bestOf, advText(c)].filter(Boolean).join(' · ');
      const body = v ? stageBody(t, v) : `<p class="hint">${esc(T(i === 0 ? 'stage_draw_at_start' : 'stage_wait'))}</p>`;
      if (!multi) return `<h4>${esc(info)}</h4>${body}`;
      const title = `<b>${esc(T('stage_n', { n: i + 1 }))}</b> <span class="muted">${esc(info)}</span>${v && v.done ? ' ✔' : ''}`;
      const current = t.status === 'finished' ? i === cfgs.length - 1 : i === (t.stage || 0);
      return fold(t.id + ':s' + i, title, body, current);
    }).join('');
  }

  Object.assign(K, { stageName, advText, stagesHtml, fold });
})();
