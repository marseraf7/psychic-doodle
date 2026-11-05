/*
 * Giải đấu Offline – tab Lịch thi đấu: tự xếp lịch, chỉnh lịch, cảnh báo trùng lịch, tải lịch (.ics).
 * Thuật toán dùng chung: caro/otour-sched.js (CaroOTourSched); máy chủ: server/src/hub/otour-sched.js.
 *   K.otSchedUi.html(t)      – cả tab: (ban tổ chức) form tự xếp lịch + dời lượt đấu; cảnh báo trùng; lịch theo ngày;
 *                              các trận hoãn / chưa có giờ
 *   K.otSchedUi.matchBtns(t, m) – nút "Hoãn trận" / "Tìm ngày đá bù" trong khung trận (otour-league.js gọi)
 *   K.otIcs(t)               – lịch dạng iCalendar (otour-export.js – tải về, nhập vào Google Calendar / điện thoại)
 */
(function () {
  'use strict';
  const K = window.CaroTourKit;
  if (!K) return;
  const { O, T, esc, $, D, icon, render } = K;
  const SC = () => window.CaroOTourSched;
  const S = { more: 0, draft: null }; // số trang "xem thêm" của lịch theo ngày; bản nháp form khi đổi kiểu sân ({ id, cfg })
  const PAGE_DAYS = 30;
  const WEEK = [1, 2, 3, 4, 5, 6, 0]; // thứ 2 … Chủ nhật
  const real = (p) => p && p.uid;

  /** Mọi trận đủ hai đội thật của các giai đoạn đang hiện (kèm chỉ số giai đoạn). */
  const allMatches = (t) => (t.stageViews || []).flatMap((v) => [...(v.pre || []), ...(v.rounds || []).flat(), ...(v.lrounds || []).flat(), ...(v.gf || []), ...(v.third ? [v.third] : []),
    ...(v.places || []).flatMap((p) => p.rounds.flat()), ...(v.groups || []).flatMap((g, gi) => (K.roundsOfGroup(t, v, gi) || []).flat())]).filter((m) => m && real(m.a) && real(m.b) && !m.bye);
  const dayKey = (ms) => { const d = new Date(ms); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); };
  // Ngày giờ theo ngôn ngữ của ứng dụng (không theo trình duyệt), giờ 24 tiếng
  const locale = () => ({ vi: 'vi-VN', en: 'en-GB', ru: 'ru-RU', zh: 'zh-CN' }[window.I18N && window.I18N.lang] || undefined);
  const fmtDay = (ms) => new Date(ms).toLocaleDateString(locale(), { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
  const fmtTime = (ms) => new Date(ms).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit', hour12: false });
  const fmtWhen = (ms) => fmtDay(ms) + ' ' + fmtTime(ms);
  const wdName = (d) => new Date(Date.UTC(2024, 0, 7 + d)).toLocaleDateString(locale(), { weekday: 'short', timeZone: 'UTC' }); // 7/1/2024: Chủ nhật
  const isoLocal = (ms) => { const d = new Date(ms), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };

  /** Các trận trùng lịch → Map mã trận → lời cảnh báo. */
  function conflictsOf(t, ms) {
    if (!SC()) return { list: [], ids: new Set() };
    const name = (u) => ((t.players || []).find((p) => p.uid === u) || {}).name || '?';
    const list = SC().conflicts(ms.map((m) => ({ id: m.id, a: m.a.uid, b: m.b.uid, when: m.done ? null : m.when, venue: m.venue })), dayKey)
      .map((c) => ({ ...c, text: c.kind === 'team' ? T('ot_sc_cf_team', { name: name(c.who), day: fmtDay(ms.find((m) => m.id === c.ids[0]).when) })
        : T('ot_sc_cf_venue', { name: c.who, when: fmtWhen(ms.find((m) => m.id === c.ids[0]).when) }) }));
    return { list, ids: new Set(list.flatMap((c) => c.ids)) };
  }

  const row = (m, warn) => `<li class="mrow ${warn ? 'sc-warn' : ''}" data-mid="${esc(m.id)}">
    <small class="muted">${m.when ? esc(fmtTime(m.when)) : ''}${m.venue ? ' · 📍 ' + esc(m.venue) : ''}${warn ? ' · ⚠' : ''}</small>
    <span>${esc(m.a.name)} <b>${m.done ? `${m.wa}–${m.wb}` : 'vs'}</b> ${esc(m.b.name)}</span></li>`;

  /** Form tự xếp lịch (ban tổ chức). */
  function formHtml(t) {
    const raw = (S.draft && S.draft.id === t.id && S.draft.cfg) || t.sched;
    const c = raw && SC() ? SC().cleanSched(raw) : raw || { start: isoLocal(Date.now() + 86400000), days: WEEK, times: ['19:00'], venues: [], home: false, perSlot: 0, rest: 0, skip: [], auto: true };
    const days = new Set(c.days);
    const homes = c.home ? `<div class="field"><span>${esc(T('ot_sc_home'))}</span><div class="sc-homes">${(t.players || []).filter((p) => !p.withdrawn).map((p) => `<label class="field inline"><span>${esc(p.name)}</span>
      <input data-sc-home="${esc(p.uid)}" maxlength="40" value="${esc(p.home || '')}" placeholder="${esc(p.name)}"></label>`).join('')}</div></div>` : '';
    return `<form id="otsched" class="tform sc-form">
      <p class="hint">${esc(T('ot_sc_hint'))}</p>
      <label class="field inline"><span>${esc(T('ot_sc_start'))}</span><input type="date" name="start" value="${esc(c.start)}" required></label>
      <div class="field"><span>${esc(T('ot_sc_days'))}</span><div class="chips">${WEEK.map((d) => `<label class="chip"><input type="checkbox" name="day" value="${d}" ${days.has(d) ? 'checked' : ''}><span>${esc(wdName(d))}</span></label>`).join('')}</div></div>
      <label class="field inline"><span>${esc(T('ot_sc_times'))}</span><input name="times" value="${esc(c.times.join(', '))}" placeholder="19:00, 21:00"></label>
      <label class="field inline"><span>${esc(T('ot_sc_vmode'))}</span><select name="home"><option value="0">${esc(T('ot_sc_vm_list'))}</option><option value="1" ${c.home ? 'selected' : ''}>${esc(T('ot_sc_vm_home'))}</option></select></label>
      ${c.home ? homes : `<label class="field"><span>${esc(T('ot_sc_venues'))}</span><textarea name="venues" rows="3">${esc(c.venues.join('\n'))}</textarea></label>`}
      <label class="field inline"><span>${esc(T('ot_sc_perslot'))}</span><input type="number" name="perSlot" min="0" max="64" value="${c.perSlot || 0}"></label>
      <label class="field inline"><span>${esc(T('ot_sc_rest'))}</span><input type="number" name="rest" min="0" max="30" value="${c.rest || 0}"></label>
      <label class="field"><span>${esc(T('ot_sc_skip'))}</span><textarea name="skip" rows="2" placeholder="2026-12-24">${esc((c.skip || []).join('\n'))}</textarea></label>
      <label class="check"><input type="checkbox" name="auto" ${c.auto ? 'checked' : ''}> <span>${esc(T('ot_sc_auto'))}</span></label>
      <div class="row"><button type="button" class="primary sm" data-act="otSchedRun" data-mode="empty">${esc(T('ot_sc_run'))}</button>
        <button type="button" class="ghost sm" data-act="otSchedRun" data-mode="all">${esc(T('ot_sc_redo'))}</button>
        <button type="button" class="ghost sm danger" data-act="otSchedClear">${esc(T('ot_sc_clear'))}</button></div></form>`;
  }

  /** Dời một lượt đấu: chọn giai đoạn · vòng, số ngày. */
  function shiftHtml(t) {
    const opts = [];
    for (const v of t.stageViews || []) {
      const R = v.groups ? Math.max(0, ...v.groups.map((g, gi) => (K.roundsOfGroup(t, v, gi) || []).length)) : (v.rounds || []).length;
      for (let r = 0; r < R; r++) opts.push(`<option value="${v.index}:${r}">${esc(T('ot_sc_stage_round', { s: v.index + 1, r: r + 1 }))}</option>`);
    }
    if (!opts.length) return '';
    return `<div class="row sc-shift"><select id="otsc-round">${opts.join('')}</select>
      <label class="field inline"><span>${esc(T('ot_sc_shift_days'))}</span><input type="number" id="otsc-days" value="7" min="-366" max="366"></label>
      <button type="button" class="ghost sm" data-act="otSchedShift">${esc(T('ot_sc_shift_go'))}</button></div>`;
  }

  function html(t) {
    const ms = allMatches(t);
    const cf = conflictsOf(t, ms);
    const out = [];
    if (t.canManage && t.status !== 'draft') {
      out.push(K.fold('ot:' + t.id + ':scform', `<b>${esc(T('ot_sched_auto'))}</b>`, () => formHtml(t), !t.sched));
      out.push(K.fold('ot:' + t.id + ':scshift', `<b>${esc(T('ot_sc_shift'))}</b>`, () => shiftHtml(t), false));
    }
    if (cf.list.length) out.push(`<section class="ot-sec sc-cf"><h4>⚠ ${esc(T('ot_sc_conflicts'))}</h4><ul>${cf.list.map((c) => `<li>${esc(c.text)}</li>`).join('')}</ul></section>`);
    // Lịch theo ngày (từ hôm nay; đã qua thì ở cuối, thu gọn)
    const timed = ms.filter((m) => m.when).sort((a, b) => a.when - b.when);
    const today = dayKey(Date.now());
    const byDay = new Map();
    for (const m of timed) { const k = dayKey(m.when); if (!byDay.has(k)) byDay.set(k, []); byDay.get(k).push(m); }
    const keys = [...byDay.keys()];
    const next = keys.filter((k) => k >= today), past = keys.filter((k) => k < today);
    const shown = next.slice(0, PAGE_DAYS * (S.more + 1));
    const dayBlock = (k) => `<h5 class="sc-day">${esc(fmtDay(byDay.get(k)[0].when))}</h5><ul class="mlist ot-sched">${byDay.get(k).map((m) => row(m, cf.ids.has(m.id))).join('')}</ul>`;
    if (shown.length) out.push(`<section class="ot-sec"><h4>${esc(T('ot_schedule'))}</h4>${shown.map(dayBlock).join('')}
      ${next.length > shown.length ? `<button type="button" class="ghost sm" data-act="otSchedMore">${esc(T('ot_sc_more', { n: Math.min(PAGE_DAYS, next.length - shown.length) }))}</button>` : ''}</section>`);
    if (past.length) out.push(K.fold('ot:' + t.id + ':scpast', `<b>${esc(T('ot_sc_past', { n: past.length }))}</b>`, () => past.reverse().map(dayBlock).join(''), !shown.length));
    const pp = ms.filter((m) => !m.done && m.postponed);
    if (pp.length) out.push(`<section class="ot-sec"><h4>⏸ ${esc(T('ot_sc_postponed'))}</h4><ul class="mlist ot-sched">${pp.map((m) => row(m)).join('')}</ul></section>`);
    const none = ms.filter((m) => !m.done && !m.when && !m.postponed).length;
    if (none && timed.length) out.push(`<p class="hint">${esc(T('ot_sc_unsched', { n: none }))}</p>`);
    return out.join('');
  }

  const matchBtns = (t, m) => (t.canManage && !m.done ? `<div class="row sc-mbtns">${m.postponed ? '' : `<button type="button" class="ghost sm" data-act="otPostpone">⏸ ${esc(T('ot_sc_postpone'))}</button>`}
    ${t.sched ? `<button type="button" class="ghost sm" data-act="otMakeup">${icon('cal')}${esc(T('ot_sc_makeup'))}</button>` : ''}</div>` : '');

  // ------------------------------------------------------------ Tải lịch dạng iCalendar
  const icsDate = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const icsText = (s) => String(s || '').replace(/[\\;,]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
  K.otIcs = (t) => {
    const ms = allMatches(t).filter((m) => m.when);
    const ev = ms.map((m) => ['BEGIN:VEVENT', `UID:${m.id}-${t.id}@caro`, `DTSTAMP:${icsDate(Date.now())}`, `DTSTART:${icsDate(m.when)}`, `DTEND:${icsDate(m.when + 2 * 3600000)}`,
      `SUMMARY:${icsText(`${m.a.name} – ${m.b.name}`)}`, ...(m.venue ? [`LOCATION:${icsText(m.venue)}`] : []), `DESCRIPTION:${icsText(t.name)}`, 'END:VEVENT'].join('\r\n'));
    return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Caro x Gomoku//Offline//VI', `X-WR-CALNAME:${icsText(t.name)}`, ...ev, 'END:VCALENDAR'].join('\r\n') + '\r\n';
  };

  // ------------------------------------------------------------ Hành động
  function readForm() {
    const f = $('otsched');
    if (!f) return null;
    const lines = (s) => String(s || '').split(/\n+/).map((x) => x.trim()).filter(Boolean);
    const start = f.elements.start.value;
    return {
      start, days: [...f.querySelectorAll('input[name=day]:checked')].map((x) => Number(x.value)), times: f.elements.times.value,
      tz: new Date(start + 'T12:00').getTimezoneOffset() || 0, home: f.elements.home.value === '1',
      venues: f.elements.venues ? lines(f.elements.venues.value) : (D.ot.sched && D.ot.sched.venues) || [],
      perSlot: Number(f.elements.perSlot.value) || 0, rest: Number(f.elements.rest.value) || 0, skip: lines(f.elements.skip.value), auto: f.elements.auto.checked,
    };
  }
  K.acts.otSchedRun = async (b) => {
    const sched = readForm();
    if (!sched) return;
    if (b.dataset.mode === 'all' && !(await window.CaroConfirm.ask(T('ot_sc_redo_confirm')))) return;
    S.draft = null;
    O.send({ t: 'otSchedAuto', id: D.ot.id, sched, mode: b.dataset.mode });
  };
  K.acts.otSchedClear = async () => { if (await window.CaroConfirm.ask(T('ot_sc_clear_confirm'))) O.send({ t: 'otSchedClear', id: D.ot.id }); };
  K.acts.otSchedShift = () => {
    const [stage, round] = $('otsc-round').value.split(':').map(Number);
    O.send({ t: 'otSchedShift', id: D.ot.id, stage, round, days: Number($('otsc-days').value) || 0 });
  };
  K.acts.otSchedMore = () => { S.more++; render(true); };
  const cur = () => K.otCurMatch && K.otCurMatch();
  K.acts.otPostpone = async () => { if (await window.CaroConfirm.ask(T('ot_sc_postpone_confirm'))) O.send({ t: 'otPostpone', id: D.ot.id, match: cur() }); };
  K.acts.otMakeup = () => O.send({ t: 'otMakeup', id: D.ot.id, match: cur() });

  K.binders.push(() => {
    if (K.V.page !== 'ot' || !D.ot) return;
    const f = $('otsched');
    if (!f) return;
    // Đổi kiểu địa điểm: lưu tạm vào bản đang xem để vẽ lại đúng ô (danh sách sân / sân nhà từng đội)
    f.elements.home.onchange = () => { S.draft = { id: D.ot.id, cfg: readForm() }; render(true); };
    for (const el of f.querySelectorAll('[data-sc-home]')) el.onchange = () => O.send({ t: 'otTeamHome', id: D.ot.id, team: el.dataset.scHome, home: el.value });
  });
  O.on('ot', () => { S.more = 0; });

  K.otSchedUi = { html, matchBtns, conflictsOf };
})();
