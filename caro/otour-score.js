/*
 * Giải đấu Offline – nhập kết quả trên trang giải (máy chủ: server/src/hub/otour-run.js). Ban tổ chức bấm một trận đang
 * chờ (nhánh đấu hoặc danh sách) → khung nhập theo kiểu kết quả của giải:
 *   'score'  – hai ô tỉ số + ô "có hiệp phụ"; ô luân lưu ở loại trực tiếp (và vòng tròn có điểm thắng / thua sát – khúc côn cầu).
 *   'sets'   – điểm từng set (thêm / bớt set, tối đa Bo của trận), nhắc luật set của giải; kiểm luật trước khi gửi
 *              (otour-rules.js – máy chủ kiểm lại).
 *   'winner' – nút chọn người thắng (+ Hoà ở vòng tròn / Thụy Sĩ).
 * Trận đã có kết quả: hiện kết quả + nút Huỷ kết quả (nhập lại). Dưới cùng: giờ / sân / sự kiện / biên bản
 * (otour-league.js – K.otMatchExtra). K.otScoreHtml(t) – gọi từ otour.js.
 */
(function () {
  'use strict';
  const K = window.CaroTourKit;
  const SP = window.CaroOTourSports;
  const RU = window.CaroOTourRules;
  if (!K || !SP || !RU) return;
  const { O, T, esc, $, D, icon, render } = K;
  const S = { tour: null, match: null, sets: [['', '']], pens: [['', '']] }; // pens: luân lưu từng trận (loạt Bo kiểu tỉ số)

  /** Trận theo mã trong các giai đoạn đang hiện (kèm giai đoạn). */
  function find(t, id) {
    for (const v of t.stageViews || []) {
      const all = [...(v.rounds || []).flat(), ...(v.lrounds || []).flat(), ...(v.pre || []), ...(v.gf || []), ...(v.third ? [v.third] : []),
        ...(v.places || []).flatMap((p) => p.rounds.flat()), ...(v.groups || []).flatMap((g, gi) => (K.roundsOfGroup(t, v, gi) || []).flat())]; // bảng tải lười: bản đã tải
      const m = all.find((x) => x && x.id === id);
      if (m) return { m, v };
    }
    return null;
  }
  const canScore = (t) => t && t.canManage && t.status === 'running';
  // Mở xem chi tiết trận (giờ, sân, diễn biến, in biên bản): mọi người xem, khi giải đã bốc thăm; ban tổ chức vẫn sửa
  // giờ / sân / sự kiện sau khi giải kết thúc (otour-league.js)
  const canOpen = (t) => t && t.status !== 'draft';
  // Không có hoà: loại trực tiếp, Thụy Sĩ theo số thắng / thua (kiểu LoL)
  // (bảng GSL, vòng tranh hạt giống, nhánh đồ thị cũng không có hoà – máy chủ: stages-kinds.js)
  const elimType = (v) => ['single', 'double', 'gsl', 'kings', 'graph'].includes(v.type) || !!(v.cfg && v.cfg.record);
  const boOf = (m, v) => m.bo || (v.cfg && v.cfg.bestOf) || 1;
  // Ô luân lưu: loại trực tiếp (hoà phải có) hoặc vòng tròn có điểm thắng / thua sát (khúc côn cầu: hoà → luân lưu)
  // Kiểu tỉ số + loại trực tiếp + Bo > 1 (không phải 2 lượt): nhập cả loạt trận (otour-run.js)
  // Loạt có trận tặng sẵn / hoà loạt (thang leo bậc kiểu KBO / NPB – otour-graph.js): luôn nhập từng trận
  const series = (m, v) => elimType(v) && (boOf(m, v) > 1 || !!m.start || !!m.tie) && !m.legs;
  const penOn = (v) => elimType(v) || !!(v.cfg && v.cfg.points && v.cfg.points.wx != null);
  /** Câu nhắc luật set: "Bo3 · mỗi set tới 21 điểm, cách 2 · chạm 30 là thắng" (+ " · set quyết định tới 15"). */
  function ruleText(r, bo) {
    if (!r) return T('ot_set_free', { bo });
    return T('ot_set_rule', { to: r.to, by: r.by, bo }) + (r.cap ? T('ot_set_cap', { cap: r.cap }) : '') + (r.last ? T('ot_set_last', { last: r.last }) : '');
  }
  K.otRuleText = ruleText;
  K.otCurMatch = () => S.match; // trận đang mở (otour-league.js – giờ, sân, sự kiện)
  K.otFindMatch = (t, id) => { const x = find(t, id); return x ? x.m : null; }; // otour-games-ui.js
  const games = (t, m, v) => (K.otGamesHtml ? K.otGamesHtml(t, m, v) : ''); // esports: chi tiết từng ván
  const extra = (t, m) => (K.otMatchExtra ? K.otMatchExtra(t, m) : '');

  K.otScoreHtml = (t) => {
    if (S.tour !== t.id) { S.tour = t.id; S.match = null; }
    if (!canOpen(t)) return '';
    const x = S.match && find(t, S.match);
    if (!x) return canScore(t) ? `<p class="hint score-tools">${esc(T('score_tap_hint'))}</p>` : '';
    const { m, v } = x;
    const head = `<div class="sp-head"><b>${esc(m.a.name)}</b> <span class="muted">vs</span> <b>${esc(m.b.name)}</b>
      <button type="button" class="ghost sm icon" data-act="otScoreClose" aria-label="${esc(T('close'))}">${icon('close')}</button></div>`;
    const res = () => {
      const r = m.sets ? (K.setsText ? K.setsText({ ...m, extra: null }) : m.sets.map((s) => s.join('-')).join(' · ')) : `${m.wa}–${m.wb}`;
      const more = [m.aet ? T('ot_aet_tag') : '', m.extra ? T('ot_pen_tag', { s: m.extra.join('-') }) : ''].filter(Boolean).join(', ');
      return `<p class="hint">${esc(T('score_current', { s: r + (more ? ` (${more})` : '') }))}</p>`;
    };
    // Không nhập kết quả được (người xem, hoặc giải đã kết thúc): chỉ xem – ban tổ chức vẫn sửa giờ / sân / sự kiện
    if (!canScore(t)) {
      const info = t.canManage ? extra(t, m) : K.otMatchView ? K.otMatchView(t, m) : '';
      return `<div class="score-panel">${head}${m.done ? res() : ''}${games(t, m, v)}${info}</div>`;
    }
    if (m.done) {
      return `<div class="score-panel">${head}${res()}
        <div class="row"><button type="button" class="ghost sm danger" data-act="otUndo">${esc(T('score_undo'))}</button></div>${games(t, m, v)}${extra(t, m)}</div>`;
    }
    const sp = SP.SPORTS[t.sport] || SP.SPORTS.other;
    let body;
    if (t.result === 'winner') {
      body = `<div class="row">${[m.a, m.b].map((p) => `<button type="button" class="ghost" data-act="otWin" data-uid="${esc(p.uid)}">${esc(T('score_win_for', { name: p.name }))}</button>`).join('')}
        ${elimType(v) ? '' : `<button type="button" class="ghost" data-act="otWin" data-uid="">${esc(T('draw'))}</button>`}</div>`;
      return `<div class="score-panel">${head}${body}${extra(t, m)}</div>`;
    }
    if (t.result === 'sets') {
      const bo = boOf(m, v);
      // Môn đấu loạt Bo theo trận (bóng rổ, bóng chày, khúc côn cầu…) mà không có luật set: mỗi dòng là một trận
      const games = !t.set && sp.unit === 'game';
      const rule = `<p class="hint">${esc(games ? T(bo > 1 ? 'ot_series_rule' : 'ot_game_one') : ruleText(t.set, bo))}</p>`;
      const del = (i) => (S.sets.length > 1 ? `<button type="button" class="ghost sm icon" data-act="otSetDel" data-i="${i}" aria-label="${esc(T('score_set_del'))}">${icon('close')}</button>` : '');
      body = `${rule}<div class="sets" id="ots-sets">${S.sets.map((s, i) => `<div class="set-row"><span class="muted">${esc(T(games ? 'ot_game_n' : 'score_set_n', { n: i + 1 }))}</span>
        <input type="number" min="0" max="999" inputmode="numeric" data-set="${i}" data-side="0" value="${esc(s[0])}"><span>–</span><input type="number" min="0" max="999" inputmode="numeric" data-set="${i}" data-side="1" value="${esc(s[1])}">${del(i)}</div>`).join('')}</div>
        ${S.sets.length < bo ? `<button type="button" class="ghost sm" data-act="otSetAdd">${icon('plus')}${esc(T(games ? 'ot_game_add' : 'score_set_add'))}</button>` : ''}`;
    } else if (series(m, v)) {
      // Loạt Bo ở loại trực tiếp với kiểu tỉ số (vd. vòng 1 playoff MLS Bo3): mỗi dòng một trận, hoà thì nhập luân lưu
      const bo = boOf(m, v);
      const del = (i) => (S.sets.length > 1 ? `<button type="button" class="ghost sm icon" data-act="otSetDel" data-i="${i}" aria-label="${esc(T('score_set_del'))}">${icon('close')}</button>` : '');
      const num = (i, side, k, val, max) => `<input type="number" min="0" max="${max}" inputmode="numeric" data-${k}="${i}" data-side="${side}" value="${esc(val)}">`;
      const gift = m.start || m.tie ? ` ${T('gr_series_hint', { a: (m.start || [0])[0], need: Math.floor(bo / 2) + 1 })}${m.tie ? ' ' + T('gr_series_tie') : ''}` : '';
      body = `<p class="hint">${esc(T('ot_series_rule', { bo }))}${esc(gift)} ${esc(T(m.tie ? 'gr_series_draw' : 'ot_series_pen'))}</p><div class="sets" id="ots-sets">${S.sets.map((s, i) => `<div class="set-row"><span class="muted">${esc(T('ot_game_n', { n: i + 1 }))}</span>
        ${num(i, 0, 'set', s[0], 999)}<span>–</span>${num(i, 1, 'set', s[1], 999)}<span class="muted sm">${esc(T('ot_pen'))}</span>${num(i, 0, 'pen', (S.pens[i] || [])[0] || '', 99)}<span>–</span>${num(i, 1, 'pen', (S.pens[i] || [])[1] || '', 99)}${del(i)}</div>`).join('')}</div>
        ${S.sets.length < bo ? `<button type="button" class="ghost sm" data-act="otSetAdd">${icon('plus')}${esc(T('ot_game_add'))}</button>` : ''}`;
    } else {
      const ex = sp.extra === 'ot' ? 'ot' : 'aet';
      const row = (label, a, b) => `<div class="set-row"><span class="muted">${esc(label)}</span><input type="number" min="0" max="999" inputmode="numeric" id="${a}"><span>–</span><input type="number" min="0" max="999" inputmode="numeric" id="${b}"></div>`;
      // Knock-out 2 lượt: tỉ số từng lượt (cột trái luôn là đội ô trên), tổng tỉ số quyết định, hoà thì luân lưu
      body = (m.legs ? row(T('ot_leg1', { name: m.a.name }), 'ots-a', 'ots-b') + row(T('ot_leg2', { name: m.b.name }), 'ots-a2', 'ots-b2') + `<p class="hint">${esc(T('ot_legs_hint'))}</p>`
        : row(T('ot_score'), 'ots-a', 'ots-b')) + `
        <label class="check"><input type="checkbox" id="ots-aet"> <span>${esc(T('ot_aet_' + ex))}</span></label>
        ${penOn(v) ? `<div class="set-row"><span class="muted">${esc(T('ot_pen'))}</span><input type="number" min="0" max="99" inputmode="numeric" id="ots-pa"><span>–</span><input type="number" min="0" max="99" inputmode="numeric" id="ots-pb"></div><p class="hint">${esc(T(elimType(v) ? 'ot_pen_hint' : 'ot_pen_hint_rr'))}</p>` : ''}`;
    }
    // Giờ / sân / sự kiện nằm ngoài form tỉ số (Enter trong các ô đó không lưu tỉ số)
    return `<div class="score-panel"><form id="ots" class="score-form">${head}${body}<p class="err" id="ots-err"></p><div class="row"><button class="primary">${esc(T('score_save'))}</button></div></form>${games(t, m, v)}${extra(t, m)}</div>`;
  };

  const readSets = () => {
    document.querySelectorAll('#ots-sets [data-set]').forEach((el) => { S.sets[el.dataset.set][el.dataset.side] = el.value; });
    document.querySelectorAll('#ots-sets [data-pen]').forEach((el) => { (S.pens[el.dataset.pen] = S.pens[el.dataset.pen] || ['', ''])[el.dataset.side] = el.value; });
  };
  K.acts.otScoreClose = () => { S.match = null; render(true); };
  K.acts.otSetAdd = () => { readSets(); if (S.sets.length < 25) { S.sets.push(['', '']); S.pens.push(['', '']); } render(true); };
  K.acts.otSetDel = (b) => { readSets(); if (S.sets.length > 1) { S.sets.splice(Number(b.dataset.i), 1); S.pens.splice(Number(b.dataset.i), 1); } render(true); };
  K.acts.otWin = (b) => O.send({ t: 'otScore', id: D.ot.id, match: S.match, ...(b.dataset.uid ? { winner: b.dataset.uid } : { draw: true }) });
  K.acts.otUndo = () => window.CaroConfirm.ask(T('score_undo_confirm')).then((ok) => { if (ok) O.send({ t: 'otUndo', id: D.ot.id, match: S.match }); });

  K.binders.push((body) => {
    const t = D.ot;
    if (K.V.page !== 'ot' || !canOpen(t)) return;
    // Bấm một trận đủ hai đội: ban tổ chức (giải đang chạy) mở khung nhập; còn lại mở khung xem chi tiết
    body.querySelectorAll('.b-match[data-mid], .mrow[data-mid]').forEach((el) => {
      const x = find(t, el.dataset.mid);
      if (!x || !x.m.a || !x.m.a.uid || !x.m.b || !x.m.b.uid || x.m.bye) return;
      el.classList.add(canScore(t) ? 'scorable' : 'viewable');
      el.onclick = (e) => {
        if (e.target.closest('a, button')) return;
        S.match = el.dataset.mid;
        S.sets = [['', '']];
        S.pens = [['', '']];
        render(true);
        const p = document.querySelector('.score-panel');
        if (p) { p.scrollIntoView({ block: 'nearest' }); const f = p.querySelector('input'); if (f) f.focus(); }
      };
    });
    const f = $('ots');
    if (!f) return;
    f.addEventListener('input', readSets);
    f.onsubmit = (e) => {
      e.preventDefault();
      const err = (k) => { $('ots-err').textContent = T(k); };
      if (t.result === 'sets') {
        readSets();
        const sets = S.sets.filter((s) => s[0] !== '' || s[1] !== '');
        if (!sets.length || sets.some((s) => s[0] === '' || s[1] === '')) return err('score_need_sets');
        const list = sets.map((s) => s.map(Number));
        // Kiểm luật set ngay (máy chủ kiểm lại): báo đúng set sai
        const x = find(t, S.match);
        const bad = x && RU.setsError(t.set || null, list, boOf(x.m, x.v));
        if (bad) { $('ots-err').textContent = T('srv_' + bad.code, bad.args); return; }
        O.send({ t: 'otScore', id: t.id, match: S.match, sets: list });
        return;
      }
      const x = find(t, S.match);
      if (x && series(x.m, x.v)) {
        readSets();
        const rows = S.sets.map((s, i) => [s, S.pens[i] || ['', '']]).filter(([s]) => s[0] !== '' || s[1] !== '');
        if (!rows.length || rows.some(([s]) => s[0] === '' || s[1] === '')) return err('ot_need_score');
        const sets = rows.map(([s]) => s.map(Number));
        const pens = rows.map(([s, p]) => (Number(s[0]) === Number(s[1]) && p[0] !== '' && p[1] !== '' ? p.map(Number) : null));
        O.send({ t: 'otScore', id: t.id, match: S.match, sets, ...(pens.some(Boolean) ? { pens } : {}) });
        return;
      }
      const a = $('ots-a').value, b = $('ots-b').value;
      if (a === '' || b === '') return err('ot_need_score');
      const two = $('ots-a2');
      if (two && ($('ots-a2').value === '' || $('ots-b2').value === '')) return err('ot_need_score');
      const pa = $('ots-pa') ? $('ots-pa').value : '', pb = $('ots-pb') ? $('ots-pb').value : '';
      const aet = !!($('ots-aet') && $('ots-aet').checked);
      const res = two ? { legs: [[Number(a), Number(b)], [Number($('ots-a2').value), Number($('ots-b2').value)]] } : { score: [Number(a), Number(b)] };
      O.send({ t: 'otScore', id: t.id, match: S.match, ...res, aet, ...(pa !== '' && pb !== '' ? { pen: [Number(pa), Number(pb)] } : {}) });
    };
  });
  // Lưu xong (trận đã có kết quả trong bản cập nhật): đóng khung; lỗi: hiện trong khung
  O.on('otPatch', () => { const x = S.match && D.ot && find(D.ot, S.match); if (x && x.m.done && document.getElementById('ots')) { S.match = null; render(true); } });
  O.on('error', (m) => { if ((m.ctx === 'otScore' || m.ctx === 'otUndo') && $('ots-err')) $('ots-err').textContent = T('srv_' + m.code, m.args || {}); });
})();
