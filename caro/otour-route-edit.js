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
      out.push(`<div class="field route-list"><span>${esc(T('opt_routes'))}</span><small class="hint">${esc(T('opt_routes_hint'))}</small>${rows.map((r, j) => `<div class="route-row">${num(i, 'rtN', r.n, 0, 256, j)}<span>${esc(T('opt_route_to'))}</span><select data-i="${i}" data-k="rtTo" data-n="${j}">${tg.map((k) => `<option value="${k}" ${k === r.to ? 'selected' : ''}>${esc(T('stage_n', { n: k + 1 }))}</option>`).join('')}</select></div>`).join('')}</div>`);
    }
    // Có đội được chuyển thẳng vào giai đoạn này: chọn đội vào thẳng đứng sau đội đi tiếp (hàng chờ Grand Survival)
    if (i > 0 && (c.direct || st.some((x, j) => j < i - 1 && ((x.routes || []).some((r) => r.to === i) || (x.skip && i === 2))))) out.push(chk(i, 'directLast', !!c.directLast, T('opt_direct_last')));
    return out;
  }

  function race(i, c, st) {
    const out = [], last = i === st.length - 1;
    if (c.rot) out.push(field(T('opt_br_rot_n'), num(i, 'rotN', c.rot === true ? 3 : c.rot, 3, 8)));
    // Hệ Circuit (kiểu PGC 2024): n vòng × số ngày, giữ `keep` đội mỗi ngày, các nhóm hạng cao vào muộn
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
    return out;
  }

  function change(stages, i, k, el) {
    const c = stages[i];
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.floor(Number(v)) || 0));
    if (k === 'rtN' || k === 'rtTo') {
      const j = Number(el.dataset.n), rs = [...(c.routes || [])];
      if (k === 'rtN') {
        const n = clamp(el.value, 0, 256);
        if (n > 0 && j < rs.length) rs[j] = { ...rs[j], n };
        else if (n > 0) rs.push({ n, to: i + 2 });
        else rs.splice(j, 1);
      } else if (j < rs.length) rs[j] = { ...rs[j], to: Number(el.value) };
      if (rs.length) { c.routes = rs; delete c.skip; } else delete c.routes;
    } else if (k === 'rotN') { const g = clamp(el.value, 3, 8); c.rot = g === 3 ? true : g; }
    else if (k === 'gateOn') {
      if (el.checked) { c.gate = { seats: 16 }; for (const x of ['groups', 'rot', 'mp', 'head', 'carry', 'heat', 'routes', 'skip']) delete c[x]; } else delete c.gate;
    } else if (k === 'gateSeats') c.gate = { seats: clamp(el.value, 2, MAX_SEATS) };
    else if (k === 'ciOn') {
      if (el.checked) { c.circuit = { n: 3, days: 3, keep: 12, late: [4, 4] }; for (const x of ['groups', 'rot', 'mp', 'head', 'carry', 'heat', 'gate']) delete c[x]; } else delete c.circuit;
    } else if (k === 'ciN' || k === 'ciDays' || k === 'ciKeep') {
      const C = { ...c.circuit };
      if (k === 'ciN') C.n = clamp(el.value, 1, 5);
      else if (k === 'ciKeep') C.keep = clamp(el.value, 1, 200);
      else { C.days = clamp(el.value, 2, 4); C.late = Array.from({ length: C.days - 1 }, (_, j) => (C.late || [])[j] != null ? C.late[j] : 4); }
      c.circuit = C;
    } else if (k === 'ciLate') {
      const xs = String(el.value).split(/[\s,;]+/).filter(Boolean).map((x) => clamp(x, 0, 64));
      c.circuit = { ...c.circuit, late: Array.from({ length: c.circuit.days - 1 }, (_, j) => (xs[j] != null ? xs[j] : 4)) };
    } else if (k === 'carry' || k === 'directLast') { if (el.checked) c[k] = true; else delete c[k]; }
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
      if (c.circuit && (c.type !== 'race' || (c.score && c.score !== 'points'))) delete c.circuit;
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
