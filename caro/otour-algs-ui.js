/*
 * Giải đấu Offline – phần kiểu ALGS của giai đoạn sinh tồn tính điểm (máy chủ: server/src/hub/stages-race-lobby.js):
 *   - Draft điểm hạ cánh (cfg.poi): mỗi bản đồ một bảng – thứ tự chọn theo bảng điểm hiện tại, POI của từng đội (ban tổ chức chọn
 *     trong danh sách; POI đã có đội khác thì không chọn được – máy chủ chặn lại);
 *   - Legend bị cấm (cfg.legendBan): sau mỗi trận, Legend được nhiều đội chọn nhất bị cấm khỏi các trận sau.
 * K.algsHtml(t, v, can) – gọi từ otour-race.js (K.raceHtml). Nạp sau otour-race.js.
 * K.lobbyEdit = { html(i, c), change(c, k, el), clean(c) } – ô trong form giai đoạn (otour-route-edit.js gọi qua móc): xếp lại
 *   lobby sau mỗi N trận (cfg.reseed, kiểu TFT), cấm Legend, draft POI (mỗi dòng một bản đồ: "Tên: POI 1, POI 2, …").
 */
(function () {
  'use strict';
  const K = window.CaroTourKit;
  if (!K) return;
  const { T, esc, O, D } = K;

  K.algsHtml = (t, v, can) => {
    let html = '';
    if (v.bans) {
      html += `<h5>${esc(T('algs_bans'))}</h5>` + (v.bans.length
        ? `<ul class="algs-bans">${v.bans.map((b) => `<li><b>${esc(b.legend)}</b> <small class="muted">${esc(T('algs_ban_from', { n: b.ev, k: b.n }))}</small></li>`).join('')}</ul>`
        : `<p class="hint">${esc(T('algs_no_ban'))}</p>`);
      // Gợi ý tên Legend đã nhập (ô nhập kết quả dùng datalist)
      const names = new Set();
      for (const e of v.events || []) for (const r of e.rows || []) if (r.pick) names.add(r.pick);
      html += `<datalist id="algs-legends">${[...names].map((x) => `<option value="${esc(x)}">`).join('')}</datalist>`;
    }
    if (v.poi) {
      html += `<h5>${esc(T('algs_poi'))}</h5><p class="hint">${esc(T('algs_poi_note'))}</p>` + v.poi.map((m, k) => {
        const of = new Map(m.picks.map((p) => [p.uid, p.poi])), taken = new Set(m.picks.map((p) => p.poi));
        const rows = m.order.map((p, j) => {
          const cur = of.get(p.uid) || '';
          const cell = can ? `<select data-poi-map="${k}" data-poi-team="${esc(p.uid)}"><option value="">—</option>${m.pois.map((x) => `<option value="${esc(x)}" ${x === cur ? 'selected' : ''} ${taken.has(x) && x !== cur ? 'disabled' : ''}>${esc(x)}</option>`).join('')}</select>` : esc(cur || '—');
          return `<tr><td>${j + 1}</td><td class="l">${esc(p.name)}</td><td>${cell}</td></tr>`;
        }).join('');
        return K.fold(`${t.id}:poi${v.index}:${k}`, `<b>${esc(m.name)}</b> <small class="muted">${esc(T('algs_poi_n', { n: m.picks.length, k: m.pois.length }))}</small>`,
          () => `<div class="tscroll"><table class="stand"><tbody>${rows}</tbody></table></div>`, k === 0);
      }).join('');
    }
    return html;
  };

  // ---- Form giai đoạn
  const num = (i, k, v, min, max) => `<input type="number" data-i="${i}" data-k="${k}" value="${v}" min="${min}" max="${max}">`;
  const chk = (i, k, v, label) => `<label class="check"><input type="checkbox" data-i="${i}" data-k="${k}" ${v ? 'checked' : ''}> <span>${esc(label)}</span></label>`;
  const field = (label, inner) => `<label class="field inline"><span>${esc(label)}</span>${inner}</label>`;
  const points = (c) => c.type === 'race' && (!c.score || c.score === 'points');
  /** "Tên: a, b, c" mỗi dòng ↔ [{ name, pois }] (tối đa 4 bản đồ × 40 POI như máy chủ). */
  const mapsText = (P) => ((P && P.maps) || []).map((m) => `${m.name}: ${m.pois.join(', ')}`).join('\n');
  const parseMaps = (txt) => String(txt || '').split(/\n+/).map((ln) => {
    const at = ln.indexOf(':');
    const name = (at > 0 ? ln.slice(0, at) : '').replace(/[<>|]/g, '').trim().slice(0, 30);
    const pois = [...new Set((at > 0 ? ln.slice(at + 1) : ln).split(',').map((x) => x.replace(/[<>|]/g, '').trim().slice(0, 30)).filter(Boolean))].slice(0, 40);
    return { name: name || '?', pois };
  }).filter((m) => m.pois.length).slice(0, 4);

  K.lobbyEdit = {
    html(i, c) {
      if (!points(c)) return [];
      const f = [];
      if (c.heat >= 2) f.push(field(T('opt_reseed'), num(i, 'reseed', c.reseed || 0, 0, 10)), `<small class="hint">${esc(T('opt_reseed_hint'))}</small>`);
      f.push(chk(i, 'legendBan', !!c.legendBan, T('opt_legend_ban')), chk(i, 'poiOn', !!c.poi, T('opt_poi')));
      if (c.poi) {
        const o = c.poi.order === 'snake' ? 'snake' : 'seed';
        f.push(field(T('opt_poi_order'), `<select data-i="${i}" data-k="poiOrder">${['seed', 'snake'].map((x) => `<option value="${x}" ${x === o ? 'selected' : ''}>${esc(T('opt_poi_' + x))}</option>`).join('')}</select>`),
          `<label class="field"><span>${esc(T('opt_poi_maps'))}</span><textarea data-i="${i}" data-k="poiMaps" rows="3">${esc(mapsText(c.poi))}</textarea><small class="hint">${esc(T('opt_poi_hint'))}</small></label>`);
      }
      return f;
    },
    change(c, k, el) {
      if (k === 'reseed') { const n = Math.max(0, Math.min(10, Math.floor(Number(el.value)) || 0)); if (n) c.reseed = n; else delete c.reseed; return true; }
      if (k === 'legendBan') { if (el.checked) c.legendBan = true; else delete c.legendBan; return true; }
      if (k === 'poiOn') { if (el.checked) c.poi = { order: 'seed', maps: [{ name: T('algs_map1'), pois: Array.from({ length: 20 }, (_, j) => 'POI ' + (j + 1)) }] }; else delete c.poi; return true; }
      if (k === 'poiOrder' && c.poi) { c.poi = { ...c.poi, order: el.value === 'snake' ? 'snake' : 'seed' }; return true; }
      if (k === 'poiMaps' && c.poi) { const maps = parseMaps(el.value); if (maps.length) c.poi = { ...c.poi, maps }; return true; }
      return false;
    },
    clean(c) {
      if (!points(c)) { delete c.reseed; delete c.poi; delete c.legendBan; return; }
      if (c.reseed && !(c.heat >= 2)) delete c.reseed;
    },
  };

  K.binders.push((body) => {
    body.querySelectorAll('select[data-poi-map]').forEach((s) => {
      s.onchange = () => O.send({ t: 'otPoi', id: D.ot.id, map: Number(s.dataset.poiMap), team: s.dataset.poiTeam, poi: s.value || null });
    });
  });
})();
