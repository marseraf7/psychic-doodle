/*
 * Giải đấu Offline – giao diện giai đoạn "loại trực tiếp dựng từng vòng" (type 'knock' – máy chủ: stages-knock.js, stages-bounty.js):
 *   - Shoot Out: các vòng bốc thăm lại (danh sách cặp theo vòng, không vẽ đường nối), người đi tiếp không đấu; hạt giống bốc
 *     thăm công khai khi giải xong.
 *   - BLAST Bounty: bảng tiền thưởng (đã nhận / trên đầu / tổng), sổ bút toán; vòng chưa có kết quả: ban tổ chức đổi đối thủ
 *     cho đội nồi dưới (otKnockPick).
 * Đăng ký K.kinds.knock (name, adv, html, def, edit, change). Nạp sau tour-stages.js.
 */
(function () {
  'use strict';
  const K = window.CaroTourKit;
  if (!K) return;
  const { T, esc, O, D } = K;
  const sel = (i, k, items, v) => `<select data-i="${i}" data-k="${k}">${items.map(([x, l]) => `<option value="${esc(x)}" ${String(x) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  const field = (label, inner) => `<label class="field inline"><span>${esc(label)}</span>${inner}</label>`;
  const num = (i, k, v, min, max) => `<input type="number" data-i="${i}" data-k="${k}" value="${v}" min="${min}" max="${max}">`;
  const fmt = (n) => Number(n).toLocaleString();

  /** Chọn đối thủ (bounty): mỗi đội nồi dưới một ô chọn trong số đội nồi trên của vòng hiện tại. */
  function picks(t, v, ms) {
    const can = t.canManage && t.status === 'running' && v.index === (t.stage || 0);
    if (!can || v.mode !== 'bounty' || ms.some((m) => m.done)) return '';
    const high = ms.map((m) => m.a);
    return `<div class="kn-pick"><p class="hint">${esc(T('kn_pick_hint'))}</p>${ms.map((m) => `<label class="field inline"><span>${esc(m.b.name)}</span><select data-kn-picker="${esc(m.b.uid)}">${
      high.map((h) => `<option value="${esc(h.uid)}" ${h.uid === m.a.uid ? 'selected' : ''}>${esc(h.name)}</option>`).join('')}</select></label>`).join('')}</div>`;
  }

  function bounty(v) {
    const B = v.bounty;
    if (!B) return '';
    const rows = B.teams.map((x, k) => `<tr><td>${k + 1}</td><td class="l">${esc(x.name)}</td><td>${fmt(x.start)}</td><td><b>${fmt(x.bank)}</b></td><td>${fmt(x.head)}</td></tr>`).join('');
    const led = B.ledger.length ? K.fold(`kn-led:${v.index}`, `<b>${esc(T('kn_ledger'))}</b>`, () => `<ol class="kn-ledger">${B.ledger.map((x) => `<li>${esc(T('kn_led_' + x.kind, { from: x.from ? x.from.name : '', to: x.to.name, n: fmt(x.amount) }))}</li>`).join('')}</ol>`, false) : '';
    return `<h5>${esc(T('kn_bounty'))}</h5><p class="hint">${esc(T('kn_bounty_note', { p: B.claim }))}</p><div class="tscroll"><table class="stand"><thead><tr><th>#</th><th class="l">${esc(T('col_player'))}</th><th>${esc(T('kn_start'))}</th><th>${esc(T('kn_bank'))}</th><th>${esc(T('kn_head'))}</th></tr></thead><tbody>${rows}</tbody></table></div>${led}`;
  }

  function html(t, v) {
    const rounds = v.rounds || [];
    const cols = rounds.map((ms, r) => {
      const name = ms.length === 1 && ms[0].final ? T('r_final') : T('r_round', { n: r + 1 });
      const bye = v.byes[r] ? `<p class="hint">${esc(T('kn_bye', { name: v.byes[r].name }))}</p>` : '';
      return `<h5 class="br-h">${esc(name)}</h5>${r === rounds.length - 1 ? picks(t, v, ms) : ''}<div class="kn-round">${ms.map((m) => K.matchBox(m)).join('')}</div>${bye}`;
    }).join('');
    const rows = (v.table || []).map((x) => `<tr><td>${x.place}</td><td class="l">${esc(x.name)}</td></tr>`).join('');
    const tab = rows ? `<h5>${esc(T('gr_places'))}</h5><div class="tscroll"><table class="stand"><thead><tr><th>#</th><th class="l">${esc(T('col_player'))}</th></tr></thead><tbody>${rows}</tbody></table></div>` : '';
    const rng = v.rng ? `<p class="hint">${esc(T('kn_rng', { n: v.rng }))}</p>` : '';
    return `<p class="hint">${esc(T(v.mode === 'bounty' ? 'kn_note_bounty' : 'kn_note_shootout'))}</p>${bounty(v)}${cols}${tab}${rng}`;
  }

  function edit(i, c) {
    const f = [field(T('kn_mode'), sel(i, 'knMode', [['shootout', T('kn_mode_shootout')], ['bounty', T('kn_mode_bounty')]], c.mode || 'shootout')),
      `<small class="hint">${esc(T(c.mode === 'bounty' ? 'kn_note_bounty' : 'kn_note_shootout'))}</small>`];
    if (c.mode === 'bounty') {
      const B = c.bounty || {};
      f.push(`<label class="field"><span>${esc(T('kn_ladder'))}</span><input data-i="${i}" data-k="knLadder" value="${esc((B.ladder || [{ to: 4, amount: 60000 }, { to: 8, amount: 30000 }, { to: 12, amount: 20000 }, { to: 16, amount: 15000 }]).map((x) => `${x.to}:${x.amount}`).join(' '))}"><small class="hint">${esc(T('kn_ladder_hint'))}</small></label>`,
        field(T('kn_claim'), num(i, 'knClaim', B.claim != null ? B.claim : 50, 0, 100)),
        field(T('kn_seeding'), sel(i, 'knSeeding', [['fixed', T('kn_seed_fixed')], ['inherit', T('kn_seed_inherit')]], B.seeding || 'fixed')));
    }
    return f;
  }

  function change(stages, i, k, el) {
    const c = stages[i];
    if (k === 'knMode') { c.mode = el.value === 'bounty' ? 'bounty' : 'shootout'; if (c.mode === 'bounty') c.bounty = c.bounty || {}; else delete c.bounty; return true; }
    if (k === 'knLadder') {
      const ladder = String(el.value).split(/[\s,;]+/).map((x) => x.split(':').map(Number)).filter(([to, a]) => to >= 1 && a >= 0).map(([to, amount]) => ({ to: Math.floor(to), amount: Math.floor(amount) })).slice(0, 16);
      c.bounty = { ...c.bounty, ladder };
      return true;
    }
    if (k === 'knClaim') { c.bounty = { ...c.bounty, claim: Math.max(0, Math.min(100, Math.floor(Number(el.value)) || 0)) }; return true; }
    if (k === 'knSeeding') { c.bounty = { ...c.bounty, seeding: el.value === 'inherit' ? 'inherit' : 'fixed' }; return true; }
    return false;
  }

  K.kinds = K.kinds || {};
  K.kinds.knock = {
    name: (c) => T('fmt_knock_' + (c.mode || 'shootout')),
    adv: (c) => (c.advance ? T('adv_n', { n: c.advance }) : ''),
    html,
    def: () => ({ type: 'knock', mode: 'shootout', bestOf: 1 }),
    edit,
    change,
  };

  K.binders.push((body) => {
    body.querySelectorAll('select[data-kn-picker]').forEach((s) => {
      s.onchange = () => O.send({ t: 'otKnockPick', id: D.ot.id, picker: s.dataset.knPicker, target: s.value });
    });
  });
})();
