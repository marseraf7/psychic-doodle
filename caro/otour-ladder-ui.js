/*
 * Giải đấu Offline – giao diện "thang ván" của trận (cfg.matchLadder – otour-ladder.js; máy chủ otour-run.js on_otScore / on_otBid):
 *   K.ladderForm(t, m, v) – các cấp lần lượt, mỗi ván một ô kết quả (ô trên thắng / hoà / ô dưới thắng) kèm màu quân; cấp
 *                           Armageddon ghi "Đen hoà là thắng"; cấp đấu giá có ô giá thầu của hai bên (lưu từng bên, ẩn
 *                           với người xem tới khi đủ hai giá)
 *   K.ladderRead(form)    – đọc các ô → [[cấp, 1 / 0 / −1], …] theo thứ tự
 *   K.ladderTag(m)        – nhãn trên ô trận: "thắng ở Blitz"
 *   K.ladderEdit          – ô chọn thang trong form giai đoạn (FIDE World Cup / Norway Chess / có Armageddon đấu giá)
 * Nạp sau otour-score.js.
 */
(function () {
  'use strict';
  const K = window.CaroTourKit;
  if (!K) return;
  const { T, esc } = K;
  const L = () => window.CaroOTourLadder;
  const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const tcLabel = (l) => T('lad_tc_' + l.tc) + (l.base ? ` ${l.base / 60}+${l.inc || 0}` : '') + (l.arm && (l.white || l.black) ? ` (${T('lad_white')} ${mmss(l.white || 0)}${l.black ? ` · ${T('lad_black')} ${mmss(l.black)}` : ''})` : '');

  K.ladderForm = (t, m, v) => {
    const levels = v.cfg.matchLadder, keep = !!v.cfg.ladderKeep;
    const done = (m.lad && m.lad.g) || [];
    let gi = 0;
    const blocks = levels.map((l, lv) => {
      const rows = [];
      for (let i = 0; i < l.games; i++) {
        let white = L().whiteOf(lv, i, !keep);
        if (l.bid && Array.isArray(m.bids) && m.bids.every((x) => typeof x === 'number')) white = L().bidBlack(l, m.bids) === 'a' ? 'b' : 'a';
        const name = (s) => (s === 'a' ? m.a.name : m.b.name);
        const cur = done[gi] && done[gi][0] === lv ? done[gi][1] : '';
        if (done[gi] && done[gi][0] === lv) gi++;
        rows.push(`<div class="set-row lad-g"><span class="muted">${esc(T('lad_game', { n: i + 1 }))} · ${esc(T('lad_white'))}: ${esc(name(white))}</span>
          <select data-lv="${lv}"><option value=""></option><option value="1" ${cur === 1 ? 'selected' : ''}>${esc(T('lad_win', { name: m.a.name }))}</option><option value="0" ${cur === 0 ? 'selected' : ''}>${esc(T(l.arm ? 'lad_draw_arm' : 'lad_draw'))}</option><option value="-1" ${cur === -1 ? 'selected' : ''}>${esc(T('lad_win', { name: m.b.name }))}</option></select></div>`);
      }
      const bid = l.bid ? `<div class="set-row lad-bid"><span class="muted">${esc(T('lad_bid'))}</span>${['a', 'b'].map((s, k) => {
        const val = Array.isArray(m.bids) ? m.bids[k] : null;
        return `<label class="field inline"><span>${esc(s === 'a' ? m.a.name : m.b.name)}</span><input type="number" min="${l.minBid}" max="${l.maxBid}" data-bid="${s}" value="${typeof val === 'number' ? val : ''}" placeholder="${val === true ? esc(T('lad_bid_hidden')) : ''}"></label>`;
      }).join('')}<button type="button" class="ghost sm" data-act="otBidSave">${esc(T('lad_bid_save'))}</button></div><small class="hint">${esc(T('lad_bid_hint', { a: mmss(l.minBid), b: mmss(l.maxBid), w: mmss(l.white) }))}${m.rebid ? ' ' + esc(T('lad_rebid')) : ''}</small>` : '';
      return `<fieldset class="lad-lv"><legend>${esc(T('lad_level', { n: lv + 1 }))} · ${esc(tcLabel(l))}</legend>${lv ? `<small class="hint">${esc(T('lad_only_if_tie'))}</small>` : ''}${bid}${rows.join('')}</fieldset>`;
    }).join('');
    return `<p class="hint">${esc(T('lad_hint'))}</p>${blocks}`;
  };

  /** Đọc các ván đã chọn theo thứ tự cấp, bỏ ô trống. */
  K.ladderRead = (form) => [...form.querySelectorAll('select[data-lv]')].filter((s) => s.value !== '').map((s) => [Number(s.dataset.lv), Number(s.value)]);

  /** Lưu giá thầu của từng bên đã nhập. */
  K.ladderBids = (t, mid, form) => {
    for (const inp of form.querySelectorAll('input[data-bid]')) if (inp.value !== '') K.O.send({ t: 'otBid', id: t.id, match: mid, side: inp.dataset.bid, sec: Number(inp.value) });
  };

  /** Nhãn trên ô trận: cấp đã quyết định trận (từ cấp 2 trở đi). */
  K.ladderTag = (m) => (m.lad && m.lad.at > 0 ? T('lad_won_at', { x: T('lad_tc_' + m.lad.tc), n: m.lad.at + 1 }) : '');

  /** Playoff từng chặng của mùa giải vòng tròn (máy chủ: stages-splits.js): mỗi chặng một nhánh, ghi nhà vô địch chặng. */
  K.splitsHtml = (t, v) => `<h5 class="br-h">${esc(T('splits_title'))}</h5><p class="hint">${esc(T('splits_note', { n: v.cfg.splits.take }))}</p>` + v.splits.map((s) =>
    `<h5>${esc(T('split_n', { n: s.b + 1 }))}${s.champ ? ` · ${esc(T('split_champ', { name: s.champ.name }))}` : ''}</h5>` + K.bracketCols(s.rounds, (r) => K.roundName(s.rounds.length, r), null, null)).join('');

  // ---- Form giai đoạn: chọn thang ván
  const PRESET_OF = (c) => (!c.matchLadder ? '' : c.matchLadder.some((l) => l.bid) ? 'bid' : c.matchLadder.length === 2 && c.matchLadder[1].arm && c.matchLadder[0].games === 1 ? 'norway' : 'fide');
  K.ladderEdit = {
    html(i, c) {
      const sel = `<select data-i="${i}" data-k="ladPreset">${['', 'fide', 'norway', 'bid'].map((x) => `<option value="${x}" ${PRESET_OF(c) === x ? 'selected' : ''}>${esc(T('lad_preset_' + (x || 'none')))}</option>`).join('')}</select>`;
      const chk = (k, on, label) => `<label class="check"><input type="checkbox" data-i="${i}" data-k="${k}" ${on ? 'checked' : ''}> <span>${esc(T(label))}</span></label>`;
      // Đủ số ván (kiểu Overwatch League): vòng tròn / Thụy Sĩ thường – Bo4 luôn đấu đủ, 2–2 thì ván 5 quyết định
      const fx = c.type !== 'single' ? [chk('fixedOn', !!c.fixed, 'opt_fixed'), ...(c.fixed ? [chk('deciderOn', !!c.decider, 'opt_decider')] : [])] : [];
      // Chặng mùa giải có playoff riêng (kiểu OWL): vòng tròn một bảng
      const num = (k, v, lo, hi) => `<input type="number" data-i="${i}" data-k="${k}" value="${v}" min="${lo}" max="${hi}">`;
      const sp = c.type === 'roundrobin' && !c.league && !c.season && !c.groupSize && (c.groups || 1) === 1
        ? [chk('splitsOn', !!c.splits, 'opt_splits'), ...(c.splits ? [`<span class="field inline"><span>${esc(T('opt_splits_n'))}</span>${num('spN', c.splits.n, 2, 6)}</span>`, `<span class="field inline"><span>${esc(T('opt_splits_take'))}</span>${num('spTake', c.splits.take, 2, 16)}</span>`, `<span class="field inline"><span>Bo</span>${num('spBo', c.splits.bo, 1, 25)}</span>`, `<small class="hint">${esc(T('opt_splits_hint'))}</small>`] : [])] : [];
      return [`<label class="field inline"><span>${esc(T('opt_ladder'))}</span>${sel}</label>`, ...(c.matchLadder ? [`<small class="hint">${esc(T('lad_note_' + PRESET_OF(c)))}</small>`] : []), ...fx, ...sp];
    },
    change(c, k, el) {
      if (k === 'fixedOn') { if (el.checked) { c.fixed = true; c.bestOf = 4; } else { delete c.fixed; delete c.decider; c.bestOf = 1; } return true; }
      if (k === 'deciderOn') { if (el.checked) c.decider = true; else delete c.decider; return true; }
      if (k === 'splitsOn') { if (el.checked) c.splits = { n: 4, take: 3, bo: 5 }; else delete c.splits; return true; }
      if (/^sp(N|Take|Bo)$/.test(k) && c.splits) { const n = Math.floor(Number(el.value)) || 0; c.splits = { ...c.splits, [{ spN: 'n', spTake: 'take', spBo: 'bo' }[k]]: n }; return true; }
      if (k !== 'ladPreset') return false;
      const P = L() && L().PRESETS[el.value];
      if (P) { c.matchLadder = JSON.parse(JSON.stringify(P)); if (el.value === 'norway') { c.ladderKeep = true; c.points = { ...(c.points || {}), w: 3, l: 0, wx: 1.5, lx: 1 }; } else delete c.ladderKeep; } else { delete c.matchLadder; delete c.ladderKeep; }
      return true;
    },
  };
})();
