/*
 * Lịch sử đấu (như Lichess): ván của mình hoặc của người khác, xem lại từng nước và phân tích.
 *   - Của mình: chọn ai xem được – Công khai · Bạn bè · Chỉ mình tôi (máy chủ: server/src/hub/history.js).
 *   - Của người khác: mở từ hồ sơ; nếu họ để riêng tư thì hiện thông báo.
 *   - Mỗi ván: Xem lại, Phân tích (mở xem lại rồi bật bảng phân tích – chạy trên máy mình, không tốn máy chủ), Chia sẻ.
 *   - Mỗi lần tải 20 ván, nút "Tải thêm" lấy trang sau.
 * Lịch sử của mình có 2 thẻ: "Trên máy này" (ván lưu trong máy – local-history.js, mở được cả khi offline / là khách)
 * và "Online" (ván lưu trên máy chủ – cần đăng nhập + có mạng). Mặc định: Online nếu đã đăng nhập và có mạng.
 * API: window.CaroHistory = { open(uid?, name?), openTab('local' | 'online') }
 */
(function () {
  'use strict';
  const N = window.CaroOnline;
  if (!N) return;
  const App = window.CaroApp;
  const esc = App.esc;
  const T = window.I18N.t;
  const $ = (id) => document.getElementById(id);
  const S = N.state;
  const VIS = ['public', 'friends', 'private'];

  const locale = () => ({ vi: 'vi-VN', en: 'en-GB', ru: 'ru-RU', zh: 'zh-CN' }[window.I18N.lang]);
  const when = (ms) => {
    try { return new Date(ms).toLocaleString(locale(), { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }); }
    catch (e) { return new Date(ms).toLocaleString(); }
  };

  // Đang xem: { uid (null = của mình), name, owner, games, more, hidden, loading }
  let V = null;

  const canOnline = () => !!(N.connected && S.me && !S.me.guest);

  function open(uid, name) {
    const self = !uid || (S.me && uid === S.me.uid);
    if (self) return openTab(canOnline() ? 'online' : 'local');
    if (!N.connected) return N.send({ t: 'noop' }); // báo chưa kết nối và thử kết nối lại
    showTab('online', false);
    V = { uid, name: name || '', owner: null, games: [], more: false, hidden: false, loading: true };
    render();
    N.openDlg('history');
    N.send({ t: 'history', uid });
  }

  /** Lịch sử của mình, mở ở thẻ tab. */
  function openTab(tab) {
    N.openDlg('history');
    showTab(tab, true);
    $('history-title').textContent = T('history_title');
    if (tab === 'local') { V = null; if (window.CaroLocalHist) window.CaroLocalHist.render(); return; }
    if (!canOnline()) {
      // Khách / không có mạng: giải thích, ván đã lưu trên máy ở thẻ bên cạnh
      V = null;
      const note = $('history-note');
      note.hidden = false;
      note.textContent = T(N.connected ? 'lh_online_need' : 'lh_online_offline');
      $('history-vis').hidden = true;
      $('history-list').innerHTML = '';
      $('history-more').hidden = true;
      if (!N.connected) N.connect();
      return;
    }
    V = { uid: null, name: '', owner: null, games: [], more: false, hidden: false, loading: true };
    render();
    N.send({ t: 'history' });
  }

  /** Hiện thẻ tab; tabs = có thanh chọn thẻ (chỉ ở lịch sử của mình). */
  function showTab(tab, tabs) {
    $('history-tabs').hidden = !tabs;
    const r = document.querySelector(`input[name="hist-tab"][value="${tab}"]`);
    if (r) r.checked = true;
    $('history-local').hidden = tab !== 'local';
    $('history-online').hidden = tab !== 'online';
    $('history-note').hidden = true;
  }
  document.querySelectorAll('input[name="hist-tab"]').forEach((r) => { r.onchange = () => openTab(r.value); });
  function loadMore() {
    if (!V || V.loading || !V.more || !V.games.length) return;
    V.loading = true;
    render();
    N.send({ t: 'history', ...(V.uid ? { uid: V.uid } : {}), before: V.games[V.games.length - 1].id });
  }

  N.on('history', (m) => {
    if (!V) return;
    const ownerId = m.owner && m.owner.id;
    if (V.uid && ownerId !== V.uid) return; // trả lời của lần mở trước
    V.owner = m.owner;
    V.hidden = !!m.hidden;
    V.games = m.before ? V.games.concat(m.games) : m.games;
    V.more = !!m.more;
    V.loading = false;
    render();
  });
  N.on('histVis', (m) => {
    if (S.me) S.me.histVis = m.vis;
    if (V && V.owner && V.owner.self) V.owner.vis = m.vis;
    N.toast(T('hist_vis_saved', { v: T('hist_vis_' + m.vis) }));
    if (V) render();
  });

  function render() {
    const o = V.owner;
    const name = (o && o.name) || V.name;
    $('history-title').textContent = !o || o.self ? T('history_title') : T('hist_of', { name });
    // Của mình: chọn ai xem được lịch sử đấu
    const vis = $('history-vis');
    vis.hidden = !(o && o.self);
    if (o && o.self) {
      vis.innerHTML = `<span class="hint">${esc(T('hist_vis'))}</span><div class="seg">${VIS.map((v) =>
        `<label><input type="radio" name="hist-vis" value="${v}"${o.vis === v ? ' checked' : ''}> <span>${esc(T('hist_vis_' + v))}</span></label>`).join('')}</div>`;
    }
    const el = $('history-list');
    // Của mình: lưu ván online về máy (Lịch sử đấu trên máy này – local-history.js), từng ván hoặc tất cả ván đang hiện
    const LH = window.CaroLocalHist;
    const mine = !!(o && o.self);
    $('history-save-all').hidden = !(mine && LH && V.games.some((g) => !LH.store.findShare(g.share)));
    if (V.hidden) el.innerHTML = `<li class="empty">${esc(T('hist_hidden', { name }))}</li>`;
    else if (V.loading && !V.games.length) el.innerHTML = '<li class="empty">…</li>';
    else if (!V.games.length) el.innerHTML = `<li class="empty">${esc(T('no_history'))}</li>`;
    else {
      el.innerHTML = V.games.map((g, i) => {
        const how = g.reason && !['win', 'draw'].includes(g.reason) ? ' · ' + T('end_' + g.reason) : '';
        return `<li>
          <span class="res ${esc(g.result)}">${esc(T('res_' + g.result))}</span>
          <div class="pn"><b>${esc(T('vs', { name: g.opponent || T('deleted_player') }))}</b>
            <small>${esc(when(g.created))} · ${esc(window.I18N.tc(g.timeLimit, g.clock))}${esc(window.I18N.ruleTag(g.rule))} · ${esc(T('n_moves', { n: g.moves }))}${esc(how)}</small></div>
          <div class="hist-acts">
            ${mine && LH ? (LH.store.findShare(g.share)
    ? `<span class="lh-an lh-saved" title="${esc(T('lh_saved_dev'))}"><svg class="ico" aria-hidden="true"><use href="#i-check"/></svg></span>`
    : `<button type="button" class="ghost sm icon" data-save="${i}" title="${esc(T('lh_save_dev'))}" aria-label="${esc(T('lh_save_dev'))}"><svg class="ico" aria-hidden="true"><use href="#i-disk"/></svg></button>`) : ''}
            <button type="button" class="ghost sm icon" data-share="${i}" title="${esc(T('share_game'))}" aria-label="${esc(T('share_game'))}"><svg class="ico" aria-hidden="true"><use href="#i-share"/></svg></button>
            <button type="button" class="ghost sm" data-analyze="${i}"><svg class="ico i-in" aria-hidden="true"><use href="#i-analyze"/></svg>${esc(T('hist_analyze'))}</button>
            <button type="button" class="primary sm" data-replay="${i}">${esc(T('replay'))}</button>
          </div></li>`;
      }).join('');
    }
    const more = $('history-more');
    more.hidden = !V.more || V.hidden;
    more.disabled = V.loading;
  }

  // Tên 2 bên của ván (để chia sẻ ảnh / link) nhìn từ chủ lịch sử
  function names(g) {
    const ownerName = (V.owner && V.owner.name) || '';
    const opp = g.opponent || T('deleted_player');
    return g.mySide === 1 ? { x: ownerName, o: opp } : { x: opp, o: ownerName };
  }

  /** Lưu các ván online (của mình) về máy: tải nước đi từ máy chủ rồi ghi vào Lịch sử đấu trên máy này. */
  async function saveLocal(games) {
    const LH = window.CaroLocalHist;
    if (!LH || saving) return;
    saving = true;
    let n = 0, fail = false;
    for (const g of games) {
      if (LH.store.findShare(g.share)) continue;
      const d = await N.fetchReplay(g.share);
      if (!d) { fail = true; break; }
      if (d === 'missing') continue;
      const id = LH.store.add({
        at: g.created, kind: 'online', account: true, me: g.mySide, x: d.x, o: d.o, winner: d.winner, reason: d.reason,
        rule: d.rule, timeLimit: d.timeLimit, clock: d.clock, moves: d.moves, share: g.share,
      });
      if (id) n++; else if (d.moves && d.moves.length) { N.toast(T('lh_full'), 4500); break; }
    }
    saving = false;
    if (fail) N.toast(T('replay_offline'));
    if (n) { N.toast(T('lh_saved_n', { n })); window.dispatchEvent(new CustomEvent('caro:localhist')); }
    if (V) render();
  }
  let saving = false;
  $('history-save-all').onclick = () => { if (V) saveLocal(V.games); };

  $('history-list').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-replay], [data-analyze], [data-share], [data-save]');
    if (!b || !V) return;
    const g = V.games[Number(b.dataset.replay ?? b.dataset.analyze ?? b.dataset.share ?? b.dataset.save)];
    if (!g) return;
    if (b.dataset.save !== undefined) return saveLocal([g]);
    if (b.dataset.share !== undefined) return N.shareReplay({ share: g.share, ...names(g) });
    const ok = await N.openReplay(g.share);
    // Phân tích: chạy trên máy người xem (Web Worker), máy chủ chỉ gửi danh sách nước
    if (ok && b.dataset.analyze !== undefined && window.CaroStudy) window.CaroStudy.analyze();
  });
  $('history-vis').addEventListener('change', (e) => {
    if (e.target.name === 'hist-vis') N.send({ t: 'setHistVis', vis: e.target.value });
  });
  $('history-more').onclick = loadMore;
  window.addEventListener('langchange', () => {
    if (!N.isOpen('history')) return;
    if (V) render();
    else if (!$('history-online').hidden) openTab('online');
  });

  window.CaroHistory = { open, openTab };
})();
