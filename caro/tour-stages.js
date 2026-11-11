/*
 * Giải đấu – vẽ các giai đoạn của giải: nhánh loại trực tiếp, nhánh thắng – thua + chung kết tổng,
 * bảng vòng tròn (từng bảng), bảng Thụy Sĩ (Buchholz), danh sách trận theo vòng.
 * Dữ liệu là tourView().stageViews của máy chủ (server/src/hub/bracket.js); trước giờ đấu: tourView().preview – nhánh xem
 * trước (bốc thăm thử theo danh sách hiện tại – server/src/hub/tour-opts.js). Ô trận có nút ảnh chia sẻ kết quả và số đính
 * kèm (tour-match-extra.js). Nạp sau tour.js.
 */
(function () {
  'use strict';
  const K = window.CaroTourKit;
  if (!K) return;
  const { T, esc, D, me, icon } = K;

  /** Tên ngắn của một giai đoạn: "Vòng tròn (4 bảng)", "Thụy Sĩ (5 vòng)"… */
  function stageName(c) {
    const x = [];
    if (c.type === 'roundrobin' && c.league) return T('fmt_league', { n: c.league.games }); // giải offline: league phase
    if (c.type === 'roundrobin' && c.season) return T(c.season.divs > 1 ? 'fmt_season_div' : 'fmt_season', { c: c.season.confs, d: c.season.divs }); // mùa giải kiểu Mỹ
    if (c.type === 'single' && c.playoff) return T(c.playoff.mode === 'div' ? 'fmt_playoff_div' : 'fmt_playoff', { n: c.playoff.per || 8 }) + (c.playoff.playin && c.playoff.playin !== 'none' ? ` (${T('tag_playin')})` : ''); // playoff kiểu Mỹ
    if (c.type === 'race' && c.score === 'golf') return T('race_name_golf', { n: c.events }); // golf đấu gậy
    if (c.type === 'race' && c.score === 'gt') return T('race_name_gt', { n: c.events }); // xe đạp nhiều chặng
    if (c.type === 'race') return T(c.score === 'time' ? 'race_name_tt' : c.events > 1 ? 'race_name_gp' : 'race_name_single', { n: c.events }); // hệ Race
    if (c.type === 'roundrobin' && c.groupSize) x.push(T('group_size_n', { n: c.groupSize }));
    else if (c.type === 'roundrobin' && c.groups > 1) x.push(T('groups_n', { n: c.groups }));
    if (c.type === 'swiss' && c.record) x.push(T('tag_record', { w: c.record.win, l: c.record.lose })); // giải offline: kiểu LoL
    else if (c.type === 'swiss') x.push(c.rounds ? T('rounds_n', { n: c.rounds }) : T('rounds_auto'));
    if (c.legs) x.push(T('tag_legs'));
    if (c.type === 'single' && (c.placement || (c.places || []).some((p) => p > 3))) x.push(T('tag_placement'));
    if (c.type === 'double' && c.gf === 'none') x.push(T('tag_no_gf'));
    if (c.type === 'double' && c.split) x.push(T('tag_split'));
    return T('fmt_' + c.type) + (x.length ? ` (${x.join(', ')})` : '');
  }
  /** Ai đi tiếp sau giai đoạn này (chỉ giai đoạn trước vòng cuối). */
  const advText = (c) => {
    if (c.type === 'swiss' && c.record) return T('adv_record', { n: c.record.win }); // giải offline: đủ số thắng
    if (!c.advance) return '';
    const s = T(c.season ? 'adv_conf_n' : c.type === 'gsl' || (c.type === 'roundrobin' && !c.league) ? 'adv_group_n' : 'adv_n', { n: c.advance });
    return c.bestNext ? s + ' ' + T('adv_best_next', { n: c.bestNext }) : s;
  };

  /** Mùa giải kiểu Mỹ: bảng xếp hạng từng bảng con (thứ hạng trong bảng con, theo thứ tự của bảng xếp hạng miền). */
  function divTables(key, g, cfg, table) {
    if (!g.divs || !g.divs.length) return '';
    const pos = new Map(g.table.map((x, i) => [x.uid, i]));
    const body = () => g.divs.map((d, j) => {
      const rows = d.filter((u) => pos.has(u)).sort((a, b) => pos.get(a) - pos.get(b)).map((u, i) => ({ ...g.table[pos.get(u)], rank: i + 1, adv: false }));
      return `<h6>${esc(T('div_name', { name: g.name + (j + 1) }))}</h6>` + table(rows, cfg);
    }).join('');
    return fold(key, `<b>${esc(T('div_tables'))}</b>`, body, false);
  }

  // ---- Các giai đoạn: nhánh đấu, nhánh thắng-thua, bảng vòng tròn, Thụy Sĩ
  /** Tên vòng của nhánh loại trực tiếp (đếm từ cuối): Chung kết, Bán kết, Tứ kết, Vòng n. */
  function roundName(n, r, finalKey = 'r_final') {
    if (r === n - 1) return T(finalKey);
    if (r === n - 2) return T('r_semi');
    if (r === n - 3) return T('r_quarter');
    return T('r_round', { n: r + 1 });
  }
  const uidMe = () => me() && me().uid;
  const replays = (m) => m.games.map((g, i) => `<a href="#" data-act="replay" data-share="${esc(g)}">${icon('play')}${i + 1}</a>`);
  /** Giải đang vẽ (cho nút ảnh chia sẻ / đính kèm của từng trận). */
  let cur = null;
  /** Nhãn hạt giống theo miền của nhánh đang vẽ (playoff kiểu Mỹ: "A1", "B8"… – server stages-playoff.js). */
  let seedLab = null;
  /** Tên trận play-in theo tag (playoff kiểu Mỹ). */
  const preName = (m) => T(m && m.tag ? m.tag : 'pi_title');
  /** Giải đấu Offline kiểu tỉ số: sau hiệp phụ, tỉ số luân lưu (kiểu set đã ghi luân lưu trong setsText). */
  const otTags = (m) => [...(m.sets ? [] : [m.aet ? esc(T('ot_aet_tag')) : '', m.extra ? esc(T('ot_pen_tag', { s: m.extra.join('-') })) : ''].filter(Boolean)),
    ...(K.otMatchTags ? K.otMatchTags(m) : [])]; // giờ / sân / số bàn ghi nhận (otour-league.js)
  /** Nút của trận: ảnh chia sẻ kết quả (trận đã xong, có hai người thật), đính kèm (tour-match-extra.js). */
  function matchTools(m) {
    const out = [];
    const real = m.a && m.a.uid && m.b && m.b.uid;
    if (cur && cur.shareImages && m.done && real && !m.preview && K.matchImgBtn) out.push(K.matchImgBtn(m));
    if (cur && K.matchAttBtn && !m.preview && (m.att || (cur.attachments && real && (cur.canManage || [m.a.uid, m.b.uid].includes(uidMe()))))) out.push(K.matchAttBtn(m));
    return out;
  }
  function matchBox(m) {
    const row = (p, w, isWin) => p && p.uid
      ? `<div class="b-p ${isWin ? 'win' : ''} ${p.uid === uidMe() ? 'me' : ''}">${seedLab && seedLab[p.uid] ? `<span class="seed lab">${esc(seedLab[p.uid])}</span>` : `<span class="seed">${p.seed || ''}</span>`}<span class="nm">${esc(p.name)}</span><b>${m.bye ? '' : w}</b></div>`
      : `<div class="b-p empty"><span class="seed"></span><span class="nm">${esc(p && p.bye ? T('bye') : '—')}</span><b></b></div>`;
    const extra = [];
    if (m.live) extra.push(m.room ? `<a href="#" class="pill live" data-watch="${esc(m.room)}" title="${esc(T('watch'))}">● ${esc(T('live'))} ${icon('eye')}</a>` : `<span class="pill live">● ${esc(T('live'))}</span>`);
    if (m.held) extra.push(`<span class="pill held">⏸ ${esc(T('dispute_held'))}</span>`);
    if (m.walkover) extra.push(esc(T('walkover')));
    if (m.double) extra.push(esc(T('both_absent')));
    if (m.bo) extra.push(`<span class="pill bo">Bo${m.bo}</span>`); // Bo riêng bán kết / chung kết
    if (m.sets && K.setsText) extra.push(`<span class="sets">${esc(K.setsText(m))}</span>`); // tỉ số từng set (giải offline)
    extra.push(...otTags(m));
    if (m.override) extra.push(esc(T('score_override_tag')));
    extra.push(...replays(m), ...matchTools(m));
    return `<div class="b-match ${m.live ? 'live' : ''}" data-mid="${esc(m.id)}">${row(m.a, m.wa, m.winner && m.a && m.winner === m.a.uid)}${row(m.b, m.wb, m.winner && m.b && m.winner === m.b.uid)}${extra.length ? `<small>${extra.join(' ')}</small>` : ''}</div>`;
  }
  /** Giờ / địa điểm ban tổ chức đặt cho vòng (tour-manage.js), "" nếu chưa đặt. */
  const slot = (t, si, r) => (K.slotOf ? K.slotOf(t, si, r) : '');
  /** Tên vòng: nhãn ban tổ chức đặt (vd. "Vòng loại") khi bật "Hiện nhãn vòng tự đặt", không có thì tên mặc định. */
  const label = (t, si, r, def) => (t.roundLabels !== false && K.roundLabel && K.roundLabel(t, si, r)) || def;
  /**
   * Các cột của một nhánh đấu; name(r) là tên cột; sl(r): giờ / địa điểm của vòng (tuỳ chọn); bkey: khoá của khối –
   * có thì thêm thanh công cụ phóng to / toàn màn hình / PNG và đường nối (tour-bracket-view.js).
   */
  const bracketCols = (rounds, name, sl, bkey) => {
    const cols = `<div class="bracket">${rounds.map((round, r) => { const s = sl ? sl(r) : ''; return `<div class="b-col"><h5>${esc(name(r))}${s ? `<small class="slot">${esc(s)}</small>` : ''}</h5>${round.map(matchBox).join('')}</div>`; }).join('')}</div>`;
    return bkey && K.bracketTools && rounds.length > 1 ? `<div class="b-wrap">${K.bracketTools(bkey)}${cols}</div>` : cols;
  };
  /** Một dòng trận (vòng tròn / Thụy Sĩ): A  2–1  B. */
  function matchRow(m) {
    const nm = (p, win) => (p && p.uid ? `<span class="nm ${win ? 'win' : ''} ${p.uid === uidMe() ? 'me' : ''}">${esc(p.name)}</span>`
      : `<span class="nm muted">${esc(p && p.bye ? T('bye') : '—')}</span>`);
    let mid;
    if (m.bye) mid = '';
    else if (m.live) mid = m.room ? `<a href="#" class="pill live" data-watch="${esc(m.room)}" title="${esc(T('watch'))}">● ${m.wa}–${m.wb} ${icon('eye')}</a>` : `<span class="pill live">● ${m.wa}–${m.wb}</span>`;
    else if (m.held) mid = `<span class="pill held" title="${esc(T('dispute_held'))}">⏸ ${m.wa}–${m.wb}</span>`;
    else if (m.done) mid = `<b>${m.wa}–${m.wb}</b>`;
    else mid = `<span class="muted">vs</span>`;
    const tags = [];
    if (m.draw) tags.push(esc(T('draw')));
    if (m.sets && K.setsText) tags.push(`<span class="sets">${esc(K.setsText(m))}</span>`); // tỉ số từng set (giải offline)
    tags.push(...otTags(m));
    if (m.override) tags.push(esc(T('score_override_tag')));
    if (m.walkover) tags.push(esc(T('walkover')));
    if (m.double) tags.push(esc(T('both_absent')));
    tags.push(...replays(m), ...matchTools(m));
    return `<li class="mrow" data-mid="${esc(m.id)}">${nm(m.a, m.winner && m.a && m.winner === m.a.uid)}<span class="sc">${mid}</span>${nm(m.b, m.winner && m.b && m.winner === m.b.uid)}${tags.length ? `<small>${tags.join(' ')}</small>` : ''}</li>`;
  }
  /** Khối có thể thu gọn, nhớ trạng thái mở / đóng qua các lần vẽ lại. */
  /**
   * Khối có thể thu gọn, nhớ trạng thái mở / đóng qua các lần vẽ lại. body có thể là hàm: chỉ dựng khi khối đang mở
   * (giải 512 người có hàng nghìn trận – dựng hết mỗi lần cập nhật thì điện thoại bị giật); mở ra thì vẽ lại trang.
   */
  function fold(key, title, body, openByDefault) {
    const isOpen = key in D.open ? D.open[key] : openByDefault;
    const lazy = typeof body === 'function';
    return `<details class="fold" data-k="${esc(key)}" ${isOpen ? 'open' : ''} ${lazy && !isOpen ? 'data-lazy="1"' : ''}><summary>${title}</summary>${
      lazy ? (isOpen ? body() : '') : body}</details>`;
  }
  const roundsHtml = (list, label) => list.map(({ r, i }) => `<h6>${esc(label(i))}</h6><ul class="mlist">${r.map(matchRow).join('')}</ul>`).join('');
  function roundsList(key, rounds, label, openLast) {
    return fold(key, esc(T('matches')), () => roundsHtml(rounds.map((r, i) => ({ r, i })), label), openLast);
  }
  // Tie-break đang dùng (giải tạo từ bản trước chưa có danh sách: mặc định – tour-stage-edit.js, nạp sau file này)
  const tbsOf = (c) => (c ? K.stageEdit.tbsOf(c) : []);
  /** Dải phong độ: ô màu cho 5 trận gần nhất (cũ → mới), chữ T / H / B theo ngôn ngữ để đọc được cả khi không phân biệt màu. */
  const formHtml = (f) => [...(f || '')].map((c) => `<i class="fm ${esc(c)}" title="${esc(T('form_' + c))}">${esc(T('form_' + c + '1'))}</i>`).join('');
  /**
   * Bảng xếp hạng của vòng tròn / Thụy Sĩ: thêm một cột cho mỗi tie-break đang dùng (giá trị x.tb do máy chủ tính,
   * cùng thứ tự cfg.tiebreaks; máy chủ cũ chỉ có Buchholz / Median-Buchholz / SB). Đối đầu, hiệu số không có cột riêng.
   */
  function standTable(rows, cfg) {
    const list = tbsOf(cfg);
    const hasTb = rows.some((x) => Array.isArray(x.tb));
    // Đối đầu không có cột; hiệu số (gdiff = gw − gl) đã có cột +/- cố định – không lặp lại
    const cols = hasTb ? list.map((k, i) => ({ k, i })).filter((c) => c.k !== 'h2h' && c.k !== 'gdiff') : ['bh', 'mbh', 'sb'].filter((k) => list.includes(k)).map((k) => ({ k }));
    const val = (x, c) => (hasTb ? x.tb[c.i] : x[c.k]);
    const fmt = (v) => (v == null ? '' : Number.isInteger(v) ? v : v.toFixed(Math.abs(v) < 10 ? 2 : 1));
    const form = rows.some((x) => x.form); // dải phong độ (máy chủ cũ không gửi: ẩn cột)
    const head = `<tr><th>#</th><th class="l">${esc(T('col_player'))}</th><th>${esc(T('col_mp'))}</th><th>${esc(T('col_wdl'))}</th><th>${esc(T('col_diff'))}</th><th>${esc(T('col_pts'))}</th>${cols.map((c) => `<th title="${esc(T('tb_' + c.k))}">${esc(T('tbc_' + c.k))}</th>`).join('')}${form ? `<th title="${esc(T('col_form_t'))}">${esc(T('col_form'))}</th>` : ''}</tr>`;
    const body = rows.map((x) => `<tr class="${x.adv ? 'adv' : ''} ${x.bye ? 'bye' : ''} ${x.uid === uidMe() ? 'me' : ''}"><td>${x.rank}</td><td class="l">${esc(x.name)}</td><td>${x.mp}</td><td>${x.w}-${x.d}-${x.l}</td>
      <td>${x.gw - x.gl > 0 ? '+' : ''}${x.gw - x.gl}</td><td><b>${x.pts}</b></td>${cols.map((c) => `<td>${fmt(val(x, c))}</td>`).join('')}${form ? `<td class="form">${formHtml(x.form)}</td>` : ''}</tr>`).join('');
    return `<div class="tscroll"><table class="stand"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
  }
  /** Quy tắc xếp hạng lấy đúng từ cấu hình: "Xếp theo: điểm → đối đầu → hiệu số ván → hạt giống". */
  function rulesNote(cfg, rr) {
    const by = T('rank_' + ((rr && cfg.rankBy) || 'points'));
    const list = [by, ...tbsOf(cfg).map((k) => T('tb_' + k)), T('tb_seed')].join(' → ');
    // tb_rank_rule (không dùng tb_rule – trùng khoá với Team Battle ở i18n-club-battle.js)
    // Giải offline: dải được miễn vòng đầu loại trực tiếp (league phase hạng 1–8…) – vạch đậm hơn
    return `<p class="hint">${esc(T('tb_rank_rule', { list }))}${rr ? ' ' + esc(T('tb_adv_mark')) : ''}${cfg.byes ? ' ' + esc(T('ot_bye_mark', { n: cfg.byes })) : ''}</p>`;
  }
  function stageBody(t, v) {
    cur = t;
    if (v.type === 'race') return K.raceHtml ? K.raceHtml(t, v) : ''; // giải offline: hệ Race (otour-race.js)
    const key = t.id + ':' + v.index;
    // Tắt "Hiện bảng xếp hạng" (tab Khác): người xem không thấy bảng điểm vòng tròn / Thụy Sĩ, vẫn thấy các trận
    const table = (rows, cfg) => (t.showStandings === false && !t.canManage ? '' : standTable(rows, cfg));
    if (v.type === 'single') {
      seedLab = v.seedLabel || null;
      let html = '';
      // Play-in (playoff kiểu Mỹ): cột 1 các trận đầu, cột 2 trận quyết định (NBA: thua 7–8 gặp thắng 9–10)
      if (v.pre && v.pre.length) {
        const cols = [v.pre.filter((m) => m.tag !== 'pi_last'), v.pre.filter((m) => m.tag === 'pi_last')].filter((c) => c.length);
        html += `<h5 class="br-h">${esc(T('pi_title'))}</h5><p class="hint">${esc(T(v.pre.some((m) => m.tag === 'pi_last') ? 'pi_hint_nba' : 'pi_hint_one'))}</p><div class="bracket pi">${cols.map((c, i) => `<div class="b-col"><h5>${esc(T(i ? 'pi_last' : 'pi_title'))}</h5>${c.map(matchBox).join('')}</div>`).join('')}</div>`
          + `<h5 class="br-h">${esc(T('pi_main'))}</h5>`;
      }
      html += bracketCols(v.rounds, (r) => label(t, v.index, r, roundName(v.rounds.length, r)), (r) => slot(t, v.index, r), key + ':m');
      if (v.third) html += `<h5>${esc(T('third_place'))}</h5><div class="bracket"><div class="b-col">${matchBox(v.third)}</div></div>`;
      // Trận xếp hạng các vị trí sau (5–8, 9–16…): mỗi nhánh một khối thu gọn
      if (v.places && v.places.length) {
        html += `<h5 class="br-h">${esc(T('places_title'))}</h5>` + v.places.map((p) => fold(key + ':p' + p.base, esc(T('place_range', { a: p.base, b: p.base + p.size - 1 })),
          () => bracketCols(p.rounds, (r) => (p.rounds[r].length === 1 ? T('place_final', { a: p.base, b: p.base + 1 }) : T('r_round', { n: r + 1 })), null, key + ':p' + p.base), false)).join('');
      }
      seedLab = null;
      return html;
    }
    if (v.type === 'double') {
      const gf = (v.gf || []).filter((m) => !m.skipped);
      // Split: nửa dưới hạt giống bắt đầu ở nhánh thua nên nhánh thắng bắt đầu từ vòng 2
      return `${v.split ? `<p class="hint">${esc(T('split_note'))}</p>` : ''}<h5 class="br-h">${esc(T('wb'))}</h5>${bracketCols(v.rounds, (r) => label(t, v.index, r, roundName(v.rounds.length, r, 'wb_final')), (r) => slot(t, v.index, r), key + ':w')}
        ${v.lrounds && v.lrounds.length ? `<h5 class="br-h">${esc(T('lb'))}</h5>${bracketCols(v.lrounds, (r) => (r === v.lrounds.length - 1 ? T('lb_final') : T('r_round', { n: r + 1 })), null, key + ':l')}` : ''}
        ${gf.length ? `<h5 class="br-h">${esc(T('gf'))}</h5><div class="bracket">${gf.map((m, i) => `<div class="b-col">${gf.length > 1 ? `<h5>${esc(i ? T('gf_reset') : T('r_round', { n: 1 }))}</h5>` : ''}${matchBox(m)}</div>`).join('')}</div>`
          : `<p class="hint">${esc(T('no_gf_note'))}</p>`}`;
    }
    if (v.type === 'gsl') { // giải offline: bảng đấu loại kép 4 đội (máy chủ: stages-gsl.js)
      // Lượt 1: mở màn; lượt 2: nửa đầu là trận nhánh thắng, nửa sau nhánh thua; lượt 3: trận quyết định
      const tagOf = (ri, mi, n) => (ri === 0 ? 'gsl_open' : ri === 2 ? 'gsl_dec' : mi < n / 2 ? 'gsl_win' : 'gsl_lose');
      const many = v.groups.length > 4;
      return `<p class="hint">${esc(T(v.cfg.size === 8 ? 'gsl_note8' : 'gsl_note'))}</p>` + v.groups.map((g, gi) => {
        const inner = () => `<div class="tscroll"><table class="stand gsl-tab"><thead><tr><th>#</th><th></th><th>${esc(T('gsl_wl'))}</th><th></th></tr></thead><tbody>${g.table.map((x) => `<tr class="${x.adv ? 'adv' : ''}${x.out ? ' dnf' : ''}">
          <td>${x.rank || ''}</td><td class="nm">${esc(x.name)}</td><td><b>${x.w}–${x.l}</b></td><td>${x.skip ? `<span class="pill">${esc(T('adv_skip_tag'))}</span>` : x.adv || x.out ? `<span class="pill">${esc(T(x.adv ? 'gsl_through' : 'gsl_out'))}</span>` : ''}</td></tr>`).join('')}</tbody></table></div>`
          + g.rounds.map((r, ri) => r.map((m, mi) => `<h6>${esc(T(tagOf(ri, mi, r.length)))}${m.bo ? ` · Bo${m.bo}` : ''}</h6><ul class="mlist">${matchRow(m)}</ul>`).join('')).join('');
        const name = esc(T('group_name', { name: g.name }));
        if (!many) return `<h5>${name}</h5>` + inner();
        const mine = g.table.some((x) => x.uid === uidMe());
        return fold(key + ':gg' + gi, `<b>${name}</b>${mine ? icon('star', 'star') : ''} <span class="muted">${esc(g.table.filter((x) => x.adv).map((x) => x.name).join(', '))}</span>`, inner, mine || gi === 0);
      }).join('');
    }
    if (v.type === 'roundrobin') {
      // Nhiều bảng (> 4): mỗi bảng thu gọn được, mặc định chỉ mở bảng của mình
      const many = v.groups.length > 4;
      return v.groups.map((g, gi) => {
        // Giải offline nhiều bảng: các trận tải khi mở bảng (otour.js – K.otGroupRounds); chưa có thì báo đang tải
        const rounds = roundsOfGroup(t, v, gi);
        const cur = rounds ? rounds.findIndex((r) => r.some((m) => !m.done)) : -1;
        const inner = () => table(g.table, v.cfg) + divTables(key + ':d' + gi, g, v.cfg, table) + (rounds ? roundsList(key + ':g' + gi, rounds, (i) => [label(t, v.index, i, T('r_round', { n: i + 1 })), slot(t, v.index, i)].filter(Boolean).join(' · '), !v.done && cur >= 0 && !many)
          : K.embed ? `<p class="hint">${esc(T('ot_group_embed'))}</p>` // trang nhúng: không tải được các trận của bảng (giải rất nhiều bảng)
            : `<p class="hint">${esc(T('ot_group_loading'))}</p>${K.otGroupNeed ? (K.otGroupNeed(t, v.index, gi), '') : ''}`);
        const name = esc(T(v.cfg.season ? 'conf_name' : 'group_name', { name: g.name }));
        if (!many) return (v.groups.length > 1 ? `<h5>${name}</h5>` : '') + inner();
        const mine = g.table.some((x) => x.uid === uidMe());
        return fold(key + ':gg' + gi, `<b>${name}</b>${mine ? icon('star', 'star') : ''} <span class="muted">${esc(g.table.slice(0, 2).map((x) => x.name).join(', '))}</span>`, inner, mine);
      }).join('') + rulesNote({ ...v.cfg, byes: v.byes }, true);
    }
    // Thụy Sĩ: vòng mới nhất lên đầu
    const rounds = v.rounds.map((r, i) => ({ r, i })).reverse();
    const want = (t.stages[v.index] || {}).rounds;
    const capped = want > v.totalRounds ? `<p class="hint">${esc(T('swiss_capped', { n: v.totalRounds, m: v.table.length }))}</p>` : '';
    const rlabel = (i) => [label(t, v.index, i, T('swiss_round', { n: i + 1, m: v.totalRounds })), slot(t, v.index, i)].filter(Boolean).join(' · ');
    // Vòng mới nhất hiện sẵn; các vòng trước nằm trong khối riêng (chỉ dựng khi mở)
    const older = rounds.slice(1);
    return capped + table(v.table, v.cfg)
      + fold(key + ':r', esc(T('matches')), () => roundsHtml(rounds.slice(0, 1), rlabel)
        + (older.length ? fold(key + ':ro', esc(T('earlier_rounds', { n: older.length })), () => roundsHtml(older, rlabel), false) : ''), !v.done)
      + rulesNote({ ...v.cfg, byes: v.byes }, false);
  }
  /**
   * Nhánh xem trước (trước giờ đấu – như bracket preview của Challonge): vòng đầu theo danh sách hiện tại; vòng tròn: các
   * bảng dự kiến. Ẩn với người xem nếu ban tổ chức bật "Ẩn nhánh xem trước".
   */
  function previewHtml(t, v) {
    const mark = (r) => r.map((m) => ({ ...m, preview: true }));
    let body;
    if (v.type === 'roundrobin') {
      body = `<div class="pv-groups">${v.groups.map((g) => `<div class="pv-g"><h5>${esc(T('group_name', { name: g.name }))}</h5><ol>${g.players.map((p) => `<li>${esc(p.name)}</li>`).join('')}</ol></div>`).join('')}</div>`;
    } else if (v.type === 'swiss') body = `<ul class="mlist">${mark(v.rounds[0]).map(matchRow).join('')}</ul>`;
    else {
      body = bracketCols(v.rounds.map(mark), (r) => label(t, 0, r, roundName(v.rounds.length, r, v.type === 'double' ? 'wb_final' : 'r_final')), null, t.id + ':pv');
      if (v.lrounds && v.lrounds.length) body += `<h5 class="br-h">${esc(T('lb'))}</h5>` + bracketCols(v.lrounds.map(mark), (r) => (r === v.lrounds.length - 1 ? T('lb_final') : T('r_round', { n: r + 1 })), null, t.id + ':pvl');
    }
    return `<p class="hint">${esc(T(t.hideBracket ? 'pv_hidden_note' : 'pv_note'))}</p>${body}`;
  }

  /** Các trận của bảng gi (giải offline tải lười: lấy bản đã tải – otour.js; chưa tải: null). */
  function roundsOfGroup(t, v, gi) {
    const g = v.groups[gi];
    if (g.rounds) return g.rounds;
    return K.otGroupRounds ? K.otGroupRounds(t, v.index, gi) : null;
  }

  /**
   * Giải offline – nhánh theo vị trí trong bảng (cfg.path, otour-path.js): trước khi vòng bảng xong đã biết đường đi
   * ("1E – 3 A/B/C/D/F"), hiện theo đúng thứ tự trên nhánh.
   */
  function pathPreview(t, i) {
    const P = window.CaroOTourPath, c = (t.stages || [])[i], pc = (t.stages || [])[i - 1], pv = (t.stageViews || [])[i - 1];
    if (!P || !c || c.path !== 'groups' || !pc || !pv || !pv.groups || pv.groups.length < 2) return '';
    const pairs = P.template(pv.groups.length, pc.advance || 2, pc.bestNext || 0);
    if (!pairs) return '';
    const list = P.labels(pairs, (g) => (pv.groups[g] ? pv.groups[g].name : '?'));
    return `<h5>${esc(T('ot_path_preview'))}</h5><ol class="ot-path">${list.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>`;
  }

  /** Tất cả giai đoạn của giải (giai đoạn chưa tới thì chỉ ghi cấu hình; giai đoạn đầu trước giờ đấu: nhánh xem trước). */
  function stagesHtml(t) {
    cur = t;
    const cfgs = t.stages || [];
    const views = t.stageViews || [];
    const multi = cfgs.length > 1;
    return cfgs.map((c, i) => {
      const v = views[i];
      const info = [stageName(c), c.type === 'race' ? '' : 'Bo' + c.bestOf, advText(c)].filter(Boolean).join(' · ');
      const pv = !v && i === 0 && t.preview;
      const body = v ? stageBody(t, v) : pv ? fold(t.id + ':pv0', esc(T('pv_title')), () => previewHtml(t, t.preview), true)
        : `<p class="hint">${esc(T(i === 0 ? 'stage_draw_at_start' : 'stage_wait'))}</p>${pathPreview(t, i)}`;
      if (!multi) return `<h4>${esc(info)}</h4>${body}`;
      const title = `<b>${esc(T('stage_n', { n: i + 1 }))}</b> <span class="muted">${esc(info)}</span>${v && v.done ? icon('check', 'ok') : ''}`;
      const current = t.status === 'finished' ? i === cfgs.length - 1 : i === (t.stage || 0);
      return fold(t.id + ':s' + i, title, body, current);
    }).join('');
  }

  Object.assign(K, { stageName, advText, stagesHtml, fold, roundName, roundsOfGroup, preName });
})();
