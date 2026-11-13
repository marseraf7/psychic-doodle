/*
 * Giải đấu Offline – tuỳ chọn thêm của giai đoạn Thụy Sĩ thường (máy chủ: server/src/hub/stages-pairing.js):
 *   - vòng cuối ghép kiểu Danish (pairingByRound: các vòng trước theo cách ghép đã chọn);
 *   - King of the Hill các vòng cuối (koth.rounds) + Gibsonization (gibson.spots, gibson.swing – kiểu Scrabble);
 *   - cắt theo số thua (advanceMode 'record', cutLosses – kiểu Pokémon VGC X-2): mọi người thua ≤ X trận đi tiếp.
 *   K.swissEdit = { html(i, c, last), change(c, k, el) }   – ô trong form giai đoạn (tour-stage-edit.js gọi)
 *   K.swissNote(v)                                          – ghi chú trên trang giải (điểm ảo Baku, người được cách ly)
 * Nạp sau tour-stage-edit.js.
 */
(function () {
  'use strict';
  const K = window.CaroTourKit;
  if (!K) return;
  const { T, esc } = K;
  const chk = (i, k, on, label) => `<label class="check"><input type="checkbox" data-i="${i}" data-k="${k}" ${on ? 'checked' : ''}> <span>${esc(label)}</span></label>`;
  const num = (i, k, v, min, max) => `<input type="number" data-i="${i}" data-k="${k}" value="${esc(v)}" min="${min}" max="${max}">`;
  const field = (label, inner) => `<label class="field inline"><span>${esc(label)}</span>${inner}</label>`;
  const lastDanish = (c) => Array.isArray(c.pairingByRound) && c.rounds > 0 && c.pairingByRound[c.rounds - 1] === 'danish';

  function html(i, c, last) {
    const f = [];
    if (c.rounds > 1 && !c.koth) f.push(chk(i, 'danishLast', lastDanish(c), T('opt_danish_last')));
    f.push(chk(i, 'kothOn', !!c.koth, T('opt_koth')));
    if (c.koth) {
      f.push(field(T('opt_koth_rounds'), num(i, 'kothRounds', c.koth.rounds || 2, 1, 5)), chk(i, 'gibOn', !!c.gibson, T('opt_gibson')));
      if (c.gibson) f.push(field(T('opt_gib_spots'), num(i, 'gibSpots', c.gibson.spots || 2, 1, 8)), field(T('opt_gib_swing'), num(i, 'gibSwing', c.gibson.swing != null ? c.gibson.swing : 1000, 0, 100000)), `<small class="hint">${esc(T('opt_gibson_hint'))}</small>`);
    }
    // Pod kiểu Magic: The Gathering – ghép cặp trong pod, đổi pod theo bảng xếp hạng sau mỗi N vòng
    f.push(chk(i, 'podOn', !!c.pod, T('opt_pod')));
    if (c.pod) f.push(field(T('opt_pod_size'), num(i, 'podSize', c.pod.size || 8, 4, 16)), field(T('opt_pod_rounds'), num(i, 'podRounds', c.pod.rounds || 3, 1, 5)), `<small class="hint">${esc(T('opt_pod_hint'))}</small>`);
    // Draft kiểu Magic trong mỗi pod: số gói, nộp danh sách bài, vòng đầu ghép đối diện bàn (stages-draft.js)
    if (c.pod) f.push(...(K.mtgEdit ? K.mtgEdit(i, c, true) : []));
    if (!last) {
      f.push(chk(i, 'cutOn', c.advanceMode === 'record', T('opt_cut_losses')));
      if (c.advanceMode === 'record') f.push(field(T('opt_cut_max'), num(i, 'cutLosses', c.cutLosses != null ? c.cutLosses : 2, 0, 10)), `<small class="hint">${esc(T('opt_cut_hint'))}</small>`);
    }
    return f;
  }

  /** Ô của form. Trả true nếu đã xử lý. */
  function change(c, k, el) {
    const n = (lo, hi) => Math.max(lo, Math.min(hi, Math.floor(Number(el.value)) || lo));
    if (k === 'danishLast') {
      if (el.checked && c.rounds > 0) c.pairingByRound = [...Array(c.rounds - 1).fill(null), 'danish']; else delete c.pairingByRound;
    } else if (k === 'kothOn') { if (el.checked) { c.koth = { rounds: 2 }; delete c.pairingByRound; } else { delete c.koth; delete c.gibson; } }
    else if (k === 'kothRounds') c.koth = { rounds: n(1, 5) };
    else if (k === 'gibOn') { if (el.checked) c.gibson = { spots: 2, swing: 1000 }; else delete c.gibson; }
    else if (k === 'gibSpots') c.gibson = { swing: 1000, ...c.gibson, spots: n(1, 8) };
    else if (k === 'gibSwing') c.gibson = { spots: 2, ...c.gibson, swing: n(0, 100000) };
    else if (k === 'cutOn') { if (el.checked) { c.advanceMode = 'record'; c.cutLosses = 2; } else { delete c.advanceMode; delete c.cutLosses; } }
    else if (k === 'cutLosses') c.cutLosses = n(0, 10);
    else if (k === 'podOn') { if (el.checked) c.pod = { size: 8, rounds: 3 }; else { delete c.pod; delete c.draft; } }
    else if (k === 'podSize') c.pod = { rounds: 3, ...c.pod, size: n(4, 16) };
    else if (k === 'podRounds') c.pod = { size: 8, ...c.pod, rounds: n(1, 5) };
    else return false;
    return true;
  }

  /** Ghi chú trên trang giải: điểm ảo Baku của vòng mới nhất, người đã chắc suất được cách ly (Gibsonization). */
  K.swissNote = (v) => {
    const x = [];
    if (v.pp && v.pp.v) x.push(T('baku_note', { r: v.pp.r + 1, v: v.pp.v }));
    if (v.gib && v.gib.length) x.push(T('gib_note', { list: v.gib.join(', ') }));
    if (v.cfg && v.cfg.advanceMode === 'record') x.push(T('cut_note', { n: v.cfg.cutLosses }));
    return x.length ? `<p class="hint">${x.map(esc).join(' ')}</p>` : '';
  };
  K.swissEdit = { html, change };
})();
