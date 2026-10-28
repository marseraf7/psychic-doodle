/*
 * Thẻ "Trên máy này" của Lịch sử đấu: ván lưu trong máy (local-games.js), mở được cả khi offline / là khách.
 *   - Đầu thẻ: nơi lưu (bộ nhớ trình duyệt của trang / bộ nhớ app trên máy) + số ván + dung lượng đang dùng.
 *   - Mỗi ván: kết quả, đối thủ, giờ, luật, số nước, nhãn "Đã phân tích" + Phân tích · Xem lại · Xoá.
 *   - "Chọn để xoá": hiện ô chọn ở từng ván, Chọn tất cả, Xoá (n) – xoá hẳn khỏi máy ngay, không cần thêm bước nào.
 * Mở ván: CaroApp.openReplay (dữ liệu có lg = id ván); có kết quả phân tích đã lưu thì nạp sẵn cho study.js (prime).
 * API: window.CaroLocalHist = { store, render(), openGame(id, analyze), where(), sizeText(bytes), usageText(), describe(g) }
 */
(function () {
  'use strict';
  const App = window.CaroApp;
  const N = window.CaroOnline;
  const T = window.I18N.t;
  const esc = App.esc;
  const $ = (id) => document.getElementById(id);
  let store;
  try { store = window.CaroLocalGames.create(window.localStorage); } catch (e) { store = window.CaroLocalGames.create({ getItem: () => null, setItem() { throw new Error('x'); }, removeItem() {} }); }

  const box = $('history-local');
  let selecting = false;
  const picked = new Set();

  const locale = () => ({ vi: 'vi-VN', en: 'en-GB', ru: 'ru-RU', zh: 'zh-CN' }[window.I18N.lang]);
  const when = (ms) => {
    try { return new Date(ms).toLocaleString(locale(), { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }); }
    catch (e) { return new Date(ms).toLocaleString(); }
  };
  function sizeText(b) {
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return (b / 1024).toFixed(b < 10240 ? 1 : 0) + ' KB';
    return (b / 1024 / 1024).toFixed(1) + ' MB';
  }
  /** Nơi lưu: app điện thoại hay trình duyệt (kèm tên trang – dữ liệu trang web của tên miền này). */
  function where() {
    const app = window.CaroNative && window.CaroNative.platform && window.CaroNative.platform !== 'web';
    return app ? T('lh_where_app') : T('lh_where_web', { host: location.host || location.protocol.replace(':', '') });
  }
  function usageText() {
    const u = store.usage();
    return T(u.analyzed ? 'lh_usage_an' : 'lh_usage', { n: u.games, a: u.analyzed, size: sizeText(u.bytes) });
  }

  const botName = (id) => (id ? T('bot_' + id) : '');
  /** Tên 2 bên (dịch lúc hiển thị – đổi ngôn ngữ vẫn đúng). */
  function names(g) {
    if (g.kind === 'bot') return g.me === 1 ? { x: T('you'), o: botName(g.bot) } : { x: botName(g.bot), o: T('you') };
    if (g.kind === 'pvp') return { x: 'X', o: 'O' };
    return { x: g.x || T('deleted_player'), o: g.o || T('deleted_player') };
  }
  /** Kết quả nhìn từ phía mình (ván 2 người trên một máy: bên nào thắng). */
  function result(g) {
    if (g.winner === 3) return { cls: 'draw', text: T('res_draw') };
    if (!g.me) return { cls: 'win', text: T(g.winner === 1 ? 'lh_res_x' : 'lh_res_o') };
    return g.winner === g.me ? { cls: 'win', text: T('res_win') } : { cls: 'loss', text: T('res_loss') };
  }
  function opponent(g) {
    if (g.kind === 'pvp') return T('lh_pvp');
    const n = names(g);
    return T('vs', { name: g.me === 1 ? n.o : n.x });
  }

  function render() {
    if (!box) return;
    const list = store.list();
    for (const id of [...picked]) if (!list.some((g) => g.id === id)) picked.delete(id);
    if (!list.length) selecting = false;
    const set = store.settings();
    const head = `<div class="lh-head">
        <svg class="ico" aria-hidden="true"><use href="#i-disk"/></svg>
        <div><b>${esc(T('lh_where'))}:</b> ${esc(where())}<br><small class="lh-usage">${esc(usageText())}</small></div>
      </div>
      ${set.on ? '' : `<p class="hint">${esc(T('lh_off_note'))}</p>`}`;
    const tools = !list.length ? '' : selecting
      ? `<div class="row lh-tools">
          <button type="button" class="ghost sm" data-lh="all">${esc(T(picked.size === list.length ? 'lh_unselect_all' : 'lh_select_all'))}</button>
          <button type="button" class="danger-btn sm" data-lh="del"${picked.size ? '' : ' disabled'}>${esc(T('lh_delete_n', { n: picked.size }))}</button>
          <button type="button" class="ghost sm" data-lh="done">${esc(T('lh_done'))}</button>
        </div>`
      : `<div class="row lh-tools"><button type="button" class="ghost sm" data-lh="select"><svg class="ico i-in" aria-hidden="true"><use href="#i-trash"/></svg>${esc(T('lh_select'))}</button></div>`;
    const items = !list.length ? `<li class="empty">${esc(T('lh_empty'))}</li>` : list.map((g) => {
      const r = result(g);
      const how = g.reason && !['win', 'draw'].includes(g.reason) ? ' · ' + T('end_' + g.reason) : '';
      const check = selecting ? `<input type="checkbox" class="lh-pick" data-pick="${esc(g.id)}"${picked.has(g.id) ? ' checked' : ''} aria-label="${esc(opponent(g))}">` : '';
      return `<li class="${selecting && picked.has(g.id) ? 'picked' : ''}">${check}
        <span class="res ${esc(r.cls)}">${esc(r.text)}</span>
        <div class="pn"><b>${esc(opponent(g))}</b>
          <small>${esc(when(g.at))} · ${esc(window.I18N.tc(g.timeLimit, g.clock))}${esc(window.I18N.ruleTag(g.rule))} · ${esc(T('lh_moves', { n: g.n }))}${esc(how)}${g.an ? ` · <span class="lh-an">${esc(T('lh_analyzed'))}</span>` : ''}</small></div>
        ${selecting ? '' : `<div class="hist-acts">
          <button type="button" class="ghost sm icon" data-del="${esc(g.id)}" title="${esc(T('lh_delete_one'))}" aria-label="${esc(T('lh_delete_one'))}"><svg class="ico" aria-hidden="true"><use href="#i-trash"/></svg></button>
          <button type="button" class="ghost sm" data-analyze="${esc(g.id)}"><svg class="ico i-in" aria-hidden="true"><use href="#i-analyze"/></svg>${esc(T('hist_analyze'))}</button>
          <button type="button" class="primary sm" data-replay="${esc(g.id)}">${esc(T('replay'))}</button>
        </div>`}</li>`;
    }).join('');
    box.innerHTML = `${head}${tools}<ul class="games lh-list${selecting ? ' selecting' : ''}">${items}</ul><p class="hint">${esc(T('lh_delete_note'))}</p>`;
  }

  /** Mở ván đã lưu: xem lại (analyze = mở luôn bảng phân tích). */
  function openGame(id, analyze) {
    if (App.online) { toast(T('replay_leave_room')); return false; } // đang trong phòng online: rời phòng trước
    const g = store.get(id);
    if (!g) { toast(T('lh_gone')); render(); return false; }
    const n = names(g);
    if (g.analysis && window.CaroStudy && window.CaroStudy.prime) window.CaroStudy.prime(g.moves, g.rule, g.analysis);
    if (N && N.isOpen('history')) N.closeDlg('history');
    const ok = App.openReplay({ local: true, lg: g.id, x: n.x, o: n.o, winner: g.winner, reason: g.reason, moves: g.moves, rule: g.rule });
    if (ok && analyze && window.CaroStudy) window.CaroStudy.analyze();
    return ok;
  }

  async function remove(ids) {
    if (!ids.length || !(await window.CaroConfirm.ask(T('lh_confirm_delete', { n: ids.length })))) return;
    const n = store.remove(ids);
    picked.clear();
    selecting = false; // xoá xong: thoát chế độ chọn
    toast(T('lh_deleted', { n }));
    render();
    window.dispatchEvent(new CustomEvent('caro:localhist'));
  }

  const toast = (m, ms) => N && N.toast(m, ms);

  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-lh], [data-replay], [data-analyze], [data-del]');
    if (!b) return;
    const list = store.list();
    if (b.dataset.lh === 'select') { selecting = true; picked.clear(); render(); }
    else if (b.dataset.lh === 'done') { selecting = false; picked.clear(); render(); }
    else if (b.dataset.lh === 'all') {
      if (picked.size === list.length) picked.clear(); else list.forEach((g) => picked.add(g.id));
      render();
    } else if (b.dataset.lh === 'del') remove([...picked]);
    else if (b.dataset.del) remove([b.dataset.del]);
    else if (b.dataset.replay) openGame(b.dataset.replay, false);
    else if (b.dataset.analyze) openGame(b.dataset.analyze, true);
  });
  box.addEventListener('change', (e) => {
    const c = e.target.closest('[data-pick]');
    if (!c) return;
    if (c.checked) picked.add(c.dataset.pick); else picked.delete(c.dataset.pick);
    render();
  });
  // Ván mới lưu / xoá từ Cài đặt khi đang mở danh sách
  window.addEventListener('caro:localhist', () => { if (!box.hidden && N && N.isOpen('history')) render(); });
  window.addEventListener('langchange', () => { if (!box.hidden) render(); });

  /** Tóm tắt một ván (kết quả + đối thủ) – hộp thoại hỏi lưu (local-save.js) dùng chung. */
  function describe(g) {
    const r = result(g);
    return { cls: r.cls, res: r.text, opp: opponent(g) };
  }

  window.CaroLocalHist = { store, render, openGame, where, sizeText, usageText, describe, when };
})();
