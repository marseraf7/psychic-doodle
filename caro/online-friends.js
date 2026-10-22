/*
 * Online – bạn bè và lời mời: danh sách bạn bè (kết bạn, chấp nhận, huỷ, nhắn tin, xem, thách đấu), hộp thoại
 * thách đấu, thẻ lời mời nổi (thách đấu nhận / gửi, lời xin hoà, thẻ của gamex.js / match.js).
 * online.js gọi window.CaroOnlineFriends(ctx) một lần; trả về { renderFriends, renderInvites }.
 */
(function () {
  'use strict';
  window.CaroOnlineFriends = function (ctx) {
    const App = window.CaroApp;
    const esc = App.esc;
    const T = window.I18N.t;
    const $ = (id) => document.getElementById(id);
    const parseTc = (v) => window.CaroTimeCtl.fromValue(v); // 't20' / 'c5+3' (bộ chọn thời gian, tc-picker.js)
    const { S, send, openDlg } = ctx;

    const statusText = (st) => T('st_' + st);

    // Gõ tên vào ô kết bạn: gợi ý kỳ thủ (player-search.js), chọn thì điền @tên đăng nhập. Tin bạn bè có thể tới trước khi
    // player-search.js chạy (trình duyệt xử lý tin WebSocket trong lúc chờ tải các thẻ <script> phía sau) → gắn khi trang nạp xong.
    let searchWait = false;
    function attachSearch() {
      const form = $('add-friend');
      if (!form) return;
      if (window.CaroPlayerSearch) { window.CaroPlayerSearch.attach(form.u, { onPick: (u) => { $('add-friend').u.value = '@' + u.username; } }); return; }
      if (searchWait) return; // đã hẹn: lúc đó gắn vào ô đang có (ô vẽ lại sau cùng)
      searchWait = true;
      window.addEventListener('DOMContentLoaded', () => { searchWait = false; attachSearch(); }, { once: true });
    }

    function renderFriends() {
      const el = $('friends');
      if (!S.me || S.me.guest) {
        el.innerHTML = `<h3>${esc(T('friends'))}</h3><p class="hint">${esc(T('friends_login_hint'))}</p>`;
        return;
      }
      const f = S.friends;
      const order = { online: 0, playing: 1, offline: 2 };
      const list = [...f.friends].sort((a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name));
      const person = (p, extra) => {
        const h = p.h2h && p.h2h.wins + p.h2h.losses + p.h2h.draws
          ? ` · <span title="${esc(T('h2h_title'))}">${p.h2h.wins}–${p.h2h.losses}–${p.h2h.draws}</span>` : '';
        return `
        <li><span class="av-st">${window.CaroAvatar.html(p, 'sm')}<span class="st ${p.status}" title="${esc(statusText(p.status))}"></span></span>
          <div class="pn"><b><a href="#" class="plink" data-profile="${esc(p.id)}">${esc(p.name)}</a>${p.rating ? ` <span class="rating">${esc(String(p.rating))}</span>` : ''}</b><small>@${esc(p.username)} · ${esc(window.CaroPresence ? window.CaroPresence.text(p) : statusText(p.status))}${h}</small></div>${extra}</li>`;
      };
      const onlineCount = f.friends.filter((p) => p.status !== 'offline').length;
      el.innerHTML = `
        <h3>${esc(T('friends'))} <small>${esc(T('friends_online', { on: onlineCount, all: f.friends.length }))}</small></h3>
        <form class="row" id="add-friend">
          <input name="u" placeholder="${esc(T('friend_username_ph'))}" autocapitalize="none" autocomplete="off" spellcheck="false" maxlength="21" required>
          <button class="primary">${esc(T('add_friend'))}</button>
        </form>
        ${f.incoming.length ? `<h4>${esc(T('friend_requests'))}</h4><ul class="people">${f.incoming.map((p) => person(p,
          `<button type="button" class="ghost sm" data-deny="${esc(p.id)}">${esc(T('decline'))}</button><button type="button" class="primary sm" data-accept="${esc(p.id)}">${esc(T('accept'))}</button>`)).join('')}</ul>` : ''}
        <ul class="people">${list.map((p) => person(p,
          `<button type="button" class="ghost sm icon chat-btn" data-chat="${esc(p.id)}" title="${esc(T('chat'))}" aria-label="${esc(T('chat'))}">💬${p.unread ? `<i class="count">${p.unread > 99 ? '99+' : p.unread}</i>` : ''}</button>
           ${p.status === 'playing' ? `<button type="button" class="ghost sm" data-watch-uid="${esc(p.id)}">${esc(T('watch'))}</button>` : `<button type="button" class="primary sm" data-challenge="${esc(p.id)}" ${p.status === 'online' ? '' : 'disabled'}>${esc(T('challenge'))}</button>`}
           <button type="button" class="ghost sm icon" data-remove="${esc(p.id)}" title="${esc(T('unfriend'))}">✕</button>`)).join('') ||
          `<li class="empty">${esc(T('no_friends'))}</li>`}</ul>
        ${f.outgoing.length ? `<p class="hint">${esc(T('pending_friends', { names: f.outgoing.map((p) => p.name).join(', ') }))}</p>` : ''}`;
      attachSearch();
      $('add-friend').onsubmit = (e) => {
        e.preventDefault();
        const u = e.target.u.value.trim();
        if (u && send({ t: 'friendAdd', username: u })) e.target.reset();
      };
      el.querySelectorAll('[data-accept]').forEach((b) => { b.onclick = () => send({ t: 'friendRespond', id: b.dataset.accept, accept: true }); });
      el.querySelectorAll('[data-deny]').forEach((b) => { b.onclick = () => send({ t: 'friendRespond', id: b.dataset.deny, accept: false }); });
      el.querySelectorAll('[data-remove]').forEach((b) => {
        b.onclick = () => {
          const p = f.friends.find((x) => x.id === b.dataset.remove);
          if (p && confirm(T('confirm_unfriend', { name: p.name }))) send({ t: 'friendRemove', id: p.id });
        };
      });
      el.querySelectorAll('[data-chat]').forEach((b) => {
        b.onclick = () => window.CaroSocial && window.CaroSocial.openChat(f.friends.find((x) => x.id === b.dataset.chat));
      });
      el.querySelectorAll('[data-challenge]').forEach((b) => {
        b.onclick = () => {
          const p = f.friends.find((x) => x.id === b.dataset.challenge);
          S.challengeTo = p;
          $('ch-title').textContent = T('challenge_title', { name: p.name });
          openDlg('challenge');
        };
      });
    }

    $('challenge-form').onsubmit = (e) => {
      e.preventDefault();
      const f = e.target;
      if (S.challengeTo) send({ t: 'challenge', to: S.challengeTo.id, bestOf: Number(f.bo.value), first: f.first.value, ...parseTc(f.tc.value), opening: f.opening.value, rule: f.rule.value });
    };

    // ------------------------------------------------------------ Lời thách đấu
    function renderInvites() {
      let box = $('invites');
      if (!box) {
        box = document.createElement('div');
        box.id = 'invites';
        box.className = 'invites';
        document.body.appendChild(box);
      }
      // Thông tin trận: Bo3 · ai đi trước · thời gian mỗi nước
      const details = (inv, first) => [`Bo${inv.bestOf}`, first, inv.timeLimit || inv.clock ? '⏱ ' + window.I18N.tc(inv.timeLimit, inv.clock) : '',
        inv.opening === 'swap2' ? 'Swap2' : '', inv.rule && inv.rule !== 'vn' ? T('grule_s_' + inv.rule) : ''].filter(Boolean).join(' · ');
      let html = '';
      for (const inv of S.invites.values()) {
        const first = inv.first === 'random' ? T('first_random') : inv.first === 'me' ? T('first_name', { name: inv.from.name }) : T('first_you');
        html += `<div class="invite"><div><b>${esc(T('invite_from', { name: inv.from.name }))}</b><small>${esc(details(inv, first))}</small></div>
          <button type="button" class="ghost sm" data-no="${esc(inv.id)}">${esc(T('decline'))}</button>
          <button type="button" class="primary sm" data-yes="${esc(inv.id)}">${esc(T('receive'))}</button></div>`;
      }
      if (S.sent) {
        const s = S.sent;
        const first = s.first === 'random' ? T('first_random') : s.first === 'me' ? T('first_you') : T('first_name', { name: s.to.name });
        html += `<div class="invite"><div>${esc(T('waiting_accept', { name: s.to.name }))}<small>${esc(details(s, first))}</small></div>
          <button type="button" class="ghost sm" data-cancel-sent>${esc(T('cancel'))}</button></div>`;
      }
      const r = S.room;
      if (r && S.me && r.drawOffer && r.drawOffer !== S.me.id && !r.winner) {
        const opp = r.players.find((p) => p.id === r.drawOffer);
        html += `<div class="invite"><div><b>🤝 ${esc(T('draw_ask', { name: opp ? opp.name : T('opponent') }))}</b></div>
          <button type="button" class="ghost sm" data-draw="no">${esc(T('decline'))}</button>
          <button type="button" class="primary sm" data-draw="yes">${esc(T('accept'))}</button></div>`;
      }
      // Hiện cả trong bảng Online (hộp thoại đang mở che mất thẻ lời mời phía dưới)
      const inner = $('dlg-invites');
      box.innerHTML = html + ((window.CaroGameX && window.CaroGameX.floatHtml()) || '') + ((window.CaroMatch && window.CaroMatch.floatHtml()) || '');
      inner.innerHTML = html;
      inner.hidden = !html;
      const all = (sel) => [...box.querySelectorAll(sel), ...inner.querySelectorAll(sel)];
      all('[data-draw]').forEach((b) => { b.onclick = () => send({ t: 'drawAnswer', accept: b.dataset.draw === 'yes' }); });
      all('[data-yes]').forEach((b) => {
        b.onclick = () => {
          if (ctx.roomActive() && !confirm(T('confirm_accept_busy'))) return;
          send({ t: 'challengeRespond', id: b.dataset.yes, accept: true });
        };
      });
      all('[data-no]').forEach((b) => {
        b.onclick = () => { send({ t: 'challengeRespond', id: b.dataset.no, accept: false }); S.invites.delete(b.dataset.no); renderInvites(); ctx.render(); };
      });
      box.querySelectorAll('[data-qm-cancel]').forEach((b) => { b.onclick = () => send({ t: 'quickCancel' }); });
      box.querySelectorAll('[data-qm-open]').forEach((b) => { b.onclick = () => $('btn-online').click(); });
      all('[data-cancel-sent]').forEach((c) => { c.onclick = () => { send({ t: 'challengeCancel', id: S.sent.id }); S.sent = null; renderInvites(); }; });
    }

    return { renderFriends, renderInvites };
  };
})();
