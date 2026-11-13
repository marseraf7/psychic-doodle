/*
 * Giải đấu Offline – chuyển đội theo dải hạng và các tuỳ chọn sinh tồn kiểu PGC trong form giai đoạn
 * (tour-stage-edit.js gọi qua móc; máy chủ: stages.js – routes, directLast; stages-race.js – gate, carry, rot N):
 *   K.routeEdit.html(i, c, st)        → mảng HTML: các dải hạng vào thẳng giai đoạn sau nữa (mỗi dải: số đội → giai đoạn),
 *                                       "đội vào thẳng xếp sau" (hàng chờ của cổng thắng trận)
 *   K.routeEdit.race(i, c, st)        → mảng HTML cho sinh tồn tính điểm: số bảng xoay vòng, hệ Circuit (số vòng, số ngày,
 *                                       số đội giữ lại, nhóm vào muộn), cổng thắng trận (số chỗ mỗi trận), mang nguyên điểm
 *   K.routeEdit.change(stages, i, k, el) → true nếu đã xử lý ô k ('rtN', 'rtTo', 'rotN', 'gateOn', 'gateSeats', 'carry',
 *                                       'directLast', hệ Circuit: 'ciOn', 'ciN', 'ciDays', 'ciKeep', 'ciLate')
 *   K.routeEdit.clean(stages)         → bỏ tuỳ chọn không còn hợp lệ (sau mỗi thay đổi của form)
 *   K.routeEdit.shift(stages, at, d)  → thêm (d = 1, trước giai đoạn at) / bỏ (d = −1, giai đoạn at): dời đích các dải hạng
 *   K.routeEdit.flow(c)               → chữ ghi thêm ở dòng mũi tên ("8 đội vào thẳng giai đoạn 4")
 * Ví dụ PGC 2022: nhánh thua 1 – 8 đội đầu vào nhánh thua 2, hạng 9–15 vào Grand Survival, đi tiếp giai đoạn kế: 0.
 */
(function () {
  'use strict';
  const K = window.CaroTourKit;
  if (!K) return;
  const { T, esc } = K;
  const MAX_ROUTES = 4; // như máy chủ (stages.js)
  const MAX_SEATS = 64; // như MAX_RACE của máy chủ
  const ELIM = ['single', 'double', 'kings'];
  /** Vạch hạng thêm của trận phụ (tbmTop cũ = [1]). */
  const tbmLinesOf = (c) => (Array.isArray(c.tbmLines) ? c.tbmLines : c.tbmTop ? [1] : []);

  const num = (i, k, v, min, max, n) => `<input type="number" data-i="${i}" data-k="${k}"${n != null ? ` data-n="${n}"` : ''} value="${v}" min="${min}" max="${max}">`;
  const chk = (i, k, v, label) => `<label class="check"><input type="checkbox" data-i="${i}" data-k="${k}" ${v ? 'checked' : ''}> <span>${esc(label)}</span></label>`;
  const field = (label, inner) => `<label class="field inline"><span>${esc(label)}</span>${inner}</label>`;

  /** Giai đoạn i chuyển đội thẳng được không (như normalizeStages: không phải loại trực tiếp, còn ít nhất 2 giai đoạn sau). */
  const canRoute = (c, i, st) => i + 2 < st.length && !ELIM.includes(c.type) && !(c.type === 'swiss' && c.record) && !c.season;
  /** Các giai đoạn đích chọn được (chỉ số mảng): từ i + 2, không phải playoff kiểu Mỹ. */
  const targets = (i, st) => st.map((_, k) => k).filter((k) => k >= i + 2 && !st[k].playoff);

  function html(i, c, st) {
    const out = [];
    if (canRoute(c, i, st) && !c.skip) {
      const rs = Array.isArray(c.routes) ? c.routes : [];
      const rows = rs.length < MAX_ROUTES ? [...rs, { n: 0, to: i + 2 }] : rs;
      const tg = targets(i, st);
      out.push(`<div class="field route-list"><span>${esc(T('opt_routes'))}</span><small class="hint">${esc(T('opt_routes_hint'))}</small>${rows.map((r, j) => `<div class="route-row">${num(i, 'rtN', r.n, 0, 256, j)}<span>${esc(T('opt_route_to'))}</span><select data-i="${i}" data-k="rtTo" data-n="${j}">${tg.map((k) => `<option value="${k}" ${k === r.to ? 'selected' : ''}>${esc(T('stage_n', { n: k + 1 }))}</option>`).join('')}</select><select data-i="${i}" data-k="rtAfter" data-n="${j}" aria-label="${esc(T('opt_route_pos'))}"><option value="0">${esc(T('route_top'))}</option><option value="1" ${r.after ? 'selected' : ''}>${esc(T('route_after'))}</option></select></div>`).join('')}</div>`);
    }
    // Đợt 16 – kiểu MSI: bảng ít đội gặp nhau nhiều lượt hơn; trận phụ cả ở hạng nhất; hạt giống 1 chọn đối thủ bán kết
    if (c.type === 'roundrobin' && !c.league && !c.season && ((c.groups || 1) > 1 || c.groupSize)) {
      out.push(`<label class="field inline"><span>${esc(T('opt_meet_small'))}</span><select data-i="${i}" data-k="meetSmall">${[0, 1, 2, 3, 4].map((x) => `<option value="${x}" ${(c.meetSmall || 0) === x ? 'selected' : ''}>${esc(x ? T('meet_' + x) : T('meet_small_same'))}</option>`).join('')}</select></label>`);
    }
    // Các vạch hạng khác cũng phân định bằng trận phụ (vd. 1 – hạng nhất; Rumble 2021: 1 2); vạch đi tiếp luôn có
    if (c.type === 'roundrobin' && c.tbm) out.push(`<label class="field"><span>${esc(T('opt_tbm_lines'))}</span><input data-i="${i}" data-k="tbmLines" value="${esc(tbmLinesOf(c).join(' '))}" inputmode="numeric" placeholder="1 2"><small class="hint">${esc(T('opt_tbm_lines_hint'))}</small></label>`);
    if (c.type === 'single' && !c.playoff && c.draw !== 'record') out.push(chk(i, 'pick', !!c.pick, T('opt_pick')));
    // Vòng tròn sau giai đoạn trước, có đội vào thẳng: ghép đội đi tiếp với đội vào thẳng (MSI Play-In vòng 2)
    if (i > 0 && c.type === 'roundrobin' && c.direct) {
      const fm = c.drawFresh ? 'draw' : c.slotFresh ? 'slot' : 'seed';
      out.push(`<label class="field inline"><span>${esc(T('opt_fresh'))}</span><select data-i="${i}" data-k="freshMode">${['seed', 'draw', 'slot'].map((x) => `<option value="${x}" ${fm === x ? 'selected' : ''}>${esc(T('fresh_' + x))}</option>`).join('')}</select></label>`);
    }
    // Thụy Sĩ thắng / thua: Bo riêng chỉ cho trận 2–2 (FACEIT 2018) thay vì mọi trận quyết định
    if (c.type === 'swiss' && c.record && c.record.bo) out.push(chk(i, 'recBoLast', !!c.record.boLast, T('opt_rec_bo_last')));
    // Đợt 23 – kiểu BLAST Groups: bảng GSL không loại ai (mọi hạng đều có đích); đích ra ngoài giải của đội không đi tiếp
    // The Split (kiểu giải Scotland): vòng tròn sau một vòng tròn – chia nhóm trên / dưới theo hạng, mang nguyên thành tích
    if (c.type === 'roundrobin' && i > 0 && !c.league && !c.season) {
      out.push(chk(i, 'splitOn', !!c.split, T('opt_split')));
      if (c.split) out.push(field(T('opt_split_top'), num(i, 'splitTop', c.split.top || 6, 2, 64)), `<small class="hint">${esc(T('opt_split_hint'))}</small>`);
    }
    // Bridge đồng đội: số ván mỗi trận (nhập điểm từng ván → IMP → VP – caro/otour-bridge.js)
    if (['roundrobin', 'swiss', 'single'].includes(c.type) && !c.record) out.push(field(T('opt_boards'), num(i, 'brBoards', c.boards || 0, 0, 64)), ...(c.boards ? [`<small class="hint">${esc(T('opt_boards_hint'))}</small>`] : []));
    if (c.type === 'gsl' && i < st.length - 1) out.push(chk(i, 'gslKeep', c.eliminates === false || !!c.keepAll, T('opt_gsl_keep')));
    if (i < st.length - 1) out.push(`<label class="field inline"><span>${esc(T('opt_exit'))}</span><input data-i="${i}" data-k="exitLabel" maxlength="40" value="${esc(c.exit || '')}" placeholder="${esc(T('opt_exit_ph'))}"></label>`);
    // Có đội được chuyển thẳng vào giai đoạn này: chọn đội vào thẳng đứng sau đội đi tiếp (hàng chờ Grand Survival)
    if (i > 0 && (c.direct || st.some((x, j) => j < i - 1 && ((x.routes || []).some((r) => r.to === i) || (x.skip && i === 2))))) out.push(chk(i, 'directLast', !!c.directLast, T('opt_direct_last')));
    return out;
  }

  function race(i, c, st) {
    const out = [], last = i === st.length - 1;
    if (c.rot) out.push(field(T('opt_br_rot_n'), num(i, 'rotN', c.rot === true ? 3 : c.rot, 3, 8)), field(T('opt_rot_block'), num(i, 'rotBlock', c.rotBlock || 1, 1, 30)));
    // Hệ Circuit (kiểu PGC 2024): n vòng × số ngày, giữ `keep` đội mỗi ngày, các nhóm hạng cao vào muộn
    // Vòng tuần (kiểu PGC 2021): Survival → Weekly Final → Bottom, lặp nhiều tuần
    if (!c.circuit) {
      out.push(chk(i, 'wkOn', !!c.weekly, T('opt_weekly')));
      if (c.weekly) {
        const W = c.weekly;
        out.push(field(T('opt_wk_weeks'), num(i, 'wkWeeks', W.weeks, 1, 5)), field(T('opt_wk_seats'), num(i, 'wkSeats', W.seats, 2, 64)), field(T('opt_wk_final'), num(i, 'wkFinal', W.final, 1, 30)),
          field(T('opt_wk_bottom'), num(i, 'wkBottom', W.bottom, 0, 30)), field(T('opt_wk_sit'), num(i, 'wkSit', W.sit || 0, 0, 8)), `<small class="hint">${esc(T('opt_wk_hint'))}</small>`);
        return out;
      }
    }
    out.push(chk(i, 'ciOn', !!c.circuit, T('opt_circuit')));
    if (c.circuit) {
      const C = c.circuit;
      out.push(field(T('opt_ci_n'), num(i, 'ciN', C.n, 1, 5)), field(T('opt_ci_days'), num(i, 'ciDays', C.days, 2, 4)), field(T('opt_ci_keep'), num(i, 'ciKeep', C.keep, 1, 200)),
        `<label class="field"><span>${esc(T('opt_ci_late'))}</span><input data-i="${i}" data-k="ciLate" value="${esc((C.late || []).join(' '))}" inputmode="numeric"><small class="hint">${esc(T('opt_ci_hint'))}</small></label>`);
      return out;
    }
    if (!last) {
      out.push(chk(i, 'gateOn', !!c.gate, T('opt_gate')));
      if (c.gate) out.push(field(T('opt_gate_seats'), num(i, 'gateSeats', c.gate.seats || 16, 2, MAX_SEATS)), `<small class="hint">${esc(T('opt_gate_hint'))}</small>`);
    }
    if (i > 0 && !c.gate && st[i - 1].type === 'race') out.push(chk(i, 'carry', !!c.carry, T('opt_carry')));
    out.push(chk(i, 'dmg', !!c.dmg, T('opt_dmg'))); // nhập tổng sát thương (chỉ số phụ cuối kiểu PUBG 2022–2023)
    if (K.lobbyEdit) out.push(...K.lobbyEdit.html(i, c)); // xếp lại lobby, cấm Legend, draft POI (otour-algs-ui.js)
    return out;
  }

  function change(stages, i, k, el) {
    const c = stages[i];
    if (k === 'gslKeep') { if (el.checked) c.eliminates = false; else { delete c.eliminates; delete c.keepAll; } c.advance = (c.size === 8 ? 8 : 4) / (el.checked ? 1 : 2); return true; }
    if (K.lobbyEdit && K.lobbyEdit.change(c, k, el)) return true;
    if (k === 'brBoards') { const b = Math.max(0, Math.min(64, Math.floor(Number(el.value)) || 0)); if (b) { c.boards = b; c.bestOf = 1; } else { delete c.boards; delete c.vpTable; } return true; }
    if (k === 'splitOn') { if (el.checked) { c.split = { top: 6 }; c.groups = 2; delete c.groupSize; } else { delete c.split; c.groups = 1; } return true; }
    if (k === 'splitTop' && c.split) { c.split = { top: Math.max(2, Math.min(64, Math.floor(Number(el.value)) || 6)) }; return true; }
    if (k === 'exitLabel') { const v = String(el.value || '').replace(/[<>]/g, '').trim().slice(0, 40); if (v) c.exit = v; else delete c.exit; return true; }
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.floor(Number(v)) || 0));
    if (k === 'rtN' || k === 'rtTo' || k === 'rtAfter') {
      const j = Number(el.dataset.n), rs = [...(c.routes || [])];
      if (k === 'rtN') {
        const n = clamp(el.value, 0, 256);
        if (n > 0 && j < rs.length) rs[j] = { ...rs[j], n };
        else if (n > 0) rs.push({ n, to: i + 2 });
        else rs.splice(j, 1);
      } else if (j < rs.length && k === 'rtTo') rs[j] = { ...rs[j], to: Number(el.value) };
      else if (j < rs.length) { rs[j] = { ...rs[j] }; if (el.value === '1') rs[j].after = true; else delete rs[j].after; } // dải nằm sau nhóm đi tiếp
      if (rs.length) { c.routes = rs; delete c.skip; } else delete c.routes;
    } else if (k === 'rotN') { const g = clamp(el.value, 3, 8); c.rot = g === 3 ? true : g; }
    else if (k === 'gateOn') {
      if (el.checked) { c.gate = { seats: 16 }; for (const x of ['groups', 'rot', 'mp', 'head', 'carry', 'heat', 'routes', 'skip']) delete c[x]; } else delete c.gate;
    } else if (k === 'gateSeats') c.gate = { seats: clamp(el.value, 2, MAX_SEATS) };
    else if (k === 'ciOn') {
      if (el.checked) { c.circuit = { n: 3, days: 3, keep: 12, late: [4, 4] }; for (const x of ['groups', 'rot', 'mp', 'head', 'carry', 'heat', 'gate']) delete c[x]; } else delete c.circuit;
    } else if (k === 'wkOn') {
      if (el.checked) { c.weekly = { weeks: 3, seats: 16, final: 10, bottom: 6, sit: 0 }; for (const x of ['groups', 'rot', 'rotBlock', 'mp', 'head', 'carry', 'heat', 'gate', 'circuit']) delete c[x]; } else delete c.weekly;
    } else if (/^wk(Weeks|Seats|Final|Bottom|Sit)$/.test(k)) {
      const key = { wkWeeks: 'weeks', wkSeats: 'seats', wkFinal: 'final', wkBottom: 'bottom', wkSit: 'sit' }[k];
      const lim = { weeks: [1, 5], seats: [2, 64], final: [1, 30], bottom: [0, 30], sit: [0, 8] }[key];
      c.weekly = { ...c.weekly, [key]: clamp(el.value, lim[0], lim[1]) };
    } else if (k === 'ciN' || k === 'ciDays' || k === 'ciKeep') {
      const C = { ...c.circuit };
      if (k === 'ciN') C.n = clamp(el.value, 1, 5);
      else if (k === 'ciKeep') C.keep = clamp(el.value, 1, 200);
      else { C.days = clamp(el.value, 2, 4); C.late = Array.from({ length: C.days - 1 }, (_, j) => (C.late || [])[j] != null ? C.late[j] : 4); }
      c.circuit = C;
    } else if (k === 'ciLate') {
      const xs = String(el.value).split(/[\s,;]+/).filter(Boolean).map((x) => clamp(x, 0, 64));
      c.circuit = { ...c.circuit, late: Array.from({ length: c.circuit.days - 1 }, (_, j) => (xs[j] != null ? xs[j] : 4)) };
    } else if (k === 'meetSmall') { const m = clamp(el.value, 0, 4); if (m) c.meetSmall = m; else delete c.meetSmall; }
    else if (k === 'rotBlock') { const b = clamp(el.value, 1, 30); if (b > 1) c.rotBlock = b; else delete c.rotBlock; }
    else if (k === 'freshMode') { delete c.drawFresh; delete c.slotFresh; if (el.value === 'draw') c.drawFresh = true; else if (el.value === 'slot') c.slotFresh = true; }
    else if (k === 'recBoLast') { c.record = { ...c.record }; if (el.checked) c.record.boLast = true; else delete c.record.boLast; }
    else if (k === 'tbmLines') {
      const ls = [...new Set(String(el.value).split(/[\s,;]+/).filter(Boolean).map((x) => clamp(x, 1, 63)))].sort((a, b) => a - b).slice(0, 8);
      delete c.tbmTop;
      if (ls.length) c.tbmLines = ls; else delete c.tbmLines;
    } else if (k === 'carry' || k === 'directLast' || k === 'tbmTop' || k === 'pick' || k === 'dmg') { if (el.checked) c[k] = true; else delete c[k]; }
    else return false;
    return true;
  }

  function clean(stages) {
    stages.forEach((c, i) => {
      const last = i === stages.length - 1;
      if (c.routes) {
        const ok = canRoute(c, i, stages) ? c.routes.filter((r) => r.n > 0 && targets(i, stages).includes(r.to)).slice(0, MAX_ROUTES) : [];
        if (ok.length) c.routes = ok; else delete c.routes;
      }
      if (!c.routes && !last && c.advance === 0) c.advance = 1; // hết dải hạng: phải có đội đi tiếp
      if (c.gate && (last || c.type !== 'race' || (c.score && c.score !== 'points'))) delete c.gate;
      if (c.gate) c.advance = c.events || 1; // cổng thắng trận: mỗi trận một đội đi tiếp
      if (c.carry && !(i > 0 && c.type === 'race' && stages[i - 1].type === 'race' && !c.gate)) delete c.carry;
      if (c.directLast && i === 0) delete c.directLast;
      if (c.rot && c.type !== 'race') delete c.rot;
      if (c.rotBlock && !c.rot) delete c.rotBlock;
      if (c.tbmTop && !c.tbm) delete c.tbmTop;
      if (c.tbmLines && !c.tbm) delete c.tbmLines;
      if (c.pick && (c.type !== 'single' || c.playoff)) delete c.pick;
      if (c.meetSmall && c.type !== 'roundrobin') delete c.meetSmall;
      if ((c.drawFresh || c.slotFresh) && (c.type !== 'roundrobin' || !c.direct || i === 0)) { delete c.drawFresh; delete c.slotFresh; }
      if (c.circuit && (c.type !== 'race' || (c.score && c.score !== 'points'))) delete c.circuit;
      if (c.dmg && (c.type !== 'race' || (c.score && c.score !== 'points'))) delete c.dmg;
      if (c.weekly && (c.type !== 'race' || (c.score && c.score !== 'points') || c.circuit)) delete c.weekly;
      if (K.lobbyEdit) K.lobbyEdit.clean(c);
    });
  }

  function shift(stages, at, d) {
    stages.forEach((c) => {
      if (!c.routes) return;
      c.routes = c.routes.filter((r) => !(d < 0 && r.to === at)).map((r) => ({ ...r, to: r.to >= at ? r.to + d : r.to }));
    });
  }

  const flow = (c) => (c.routes || []).map((r) => T('adv_route', { n: r.n, k: r.to + 1 })).join(' ');

  K.routeEdit = { html, race, change, clean, shift, flow, MAX_ROUTES };
})();
