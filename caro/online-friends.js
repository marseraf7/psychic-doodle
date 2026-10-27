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

    // Lời thách đấu gửi đi sống 5 phút (Issue #128, khớp TTL máy chủ INVITE_TTL_MS):
    // thẻ chờ hiện sang bên phải + đếm ngược, hết giờ tự hủy.
    const SENT_MS = 5 * 60 * 1000;
    let clockTicker = 0;
    const minimized = new Set(); // id lời mời đang thu gọn thành bong bóng
    const dismissed = new Set(); // id lời mời đã tắt thẻ nổi (lời mời vẫn còn, chỉ ẩn thẻ)
    const inviteAt = new Map(); // id -> ms nhận được (đếm ngược bong bóng thu gọn)
    const fmtClock = (ms) => {
      const left = Math.max(0, ms);
      return Math.floor(left / 60000) + ':' + String(Math.floor(left / 1000) % 60).padStart(2, '0');
    };
    const sentLeft = () => (S.sent ? SENT_MS - (Date.now() - (S.sent.sentAt || Date.now())) : 0);
    const sentClock = () => fmtClock(sentLeft());
    const invClock = (id) => fmtClock(SENT_MS - (Date.now() - (inviteAt.get(id) || Date.now())));

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
      // M-F6: render chạy mỗi khi có tin bạn bè/hiện diện mới — giữ lại nội dung đang gõ
      // trong ô thêm bạn (chữ, focus, vùng chọn) qua lần dựng lại, kẻo người dùng gõ dở
      // là mất sạch. Khôi phục ở cuối hàm, sau khi form mới đã gắn xong.
      const oldIn = el.querySelector('#add-friend input[name="u"]');
      const draft = oldIn ? { v: oldIn.value, f: document.activeElement === oldIn, s: oldIn.selectionStart, e: oldIn.selectionEnd } : null;
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
        <li><span class="av-st">${window.CaroAvatar.html(p, 'sm')}<span class="st ${esc(p.status)}" title="${esc(statusText(p.status))}"></span></span>
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
      // M-F6: khôi phục bản nháp ô thêm bạn đã lưu ở đầu hàm (nếu có)
      if (draft && draft.v) {
        const inp = $('add-friend').u;
        inp.value = draft.v;
        if (draft.f) { inp.focus(); try { inp.setSelectionRange(draft.s, draft.e); } catch (err) { /* ô không hỗ trợ chọn vùng */ } }
      }
      $('add-friend').onsubmit = (e) => {
        e.preventDefault();
        const u = e.target.u.value.trim();
        if (u && send({ t: 'friendAdd', username: u })) e.target.reset();
      };
      el.querySelectorAll('[data-accept]').forEach((b) => { b.onclick = () => send({ t: 'friendRespond', id: b.dataset.accept, accept: true }); });
      el.querySelectorAll('[data-deny]').forEach((b) => { b.onclick = () => send({ t: 'friendRespond', id: b.dataset.deny, accept: false }); });
      el.querySelectorAll('[data-remove]').forEach((b) => {
        b.onclick = async () => {
          const p = f.friends.find((x) => x.id === b.dataset.remove);
          // Hỏi bằng hộp xác nhận trong app (CaroConfirm) thay confirm() gốc — đồng bộ với các thao tác khác
          if (p && (await window.CaroConfirm.ask(T('confirm_unfriend', { name: p.name })))) send({ t: 'friendRemove', id: p.id });
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
      // Dọn mục đã biến mất + đóng dấu thời gian nhận (đếm ngược bong bóng thu gọn).
      for (const id of [...minimized]) if (!S.invites.has(id)) minimized.delete(id);
      for (const id of [...dismissed]) if (!S.invites.has(id)) dismissed.delete(id);
      for (const id of [...inviteAt.keys()]) if (!S.invites.has(id)) inviteAt.delete(id);
      for (const id of S.invites.keys()) if (!inviteAt.has(id)) inviteAt.set(id, Date.now());
      // Thẻ nổi (box) gọn sang phải + có nút thu gọn/tắt; bản trong hộp thoại Online giữ
      // nguyên dạng danh sách đầy đủ (không thu gọn, không nút góc) để vẫn nhận/từ chối được.
      let floatHtml = '', dlgHtml = '';
      for (const inv of S.invites.values()) {
        const first = inv.first === 'random' ? T('first_random') : inv.first === 'me' ? T('first_name', { name: inv.from.name }) : T('first_you');
        const body = `<div><b>${esc(T('invite_from', { name: inv.from.name }))}</b><small>${esc(details(inv, first))} · <span data-inv-clock="${esc(inv.id)}">⏳ ${esc(invClock(inv.id))}</span></small></div>
          <span class="invite-btns"><button type="button" class="ghost sm" data-no="${esc(inv.id)}">${esc(T('decline'))}</button>
          <button type="button" class="primary sm" data-yes="${esc(inv.id)}">${esc(T('receive'))}</button></span>`;
        dlgHtml += `<div class="invite">${body}</div>`;
        if (minimized.has(inv.id)) {
          floatHtml += `<button type="button" class="invite invite-mini invite-right" data-restore="${esc(inv.id)}" title="${esc(T('invite_from', { name: inv.from.name }))}">💬 <span data-inv-clock="${esc(inv.id)}">⏳ ${esc(invClock(inv.id))}</span></button>`;
        } else if (!dismissed.has(inv.id)) {
          floatHtml += `<div class="invite invite-right has-ctl">${body}
          <span class="invite-ctl"><button type="button" data-min="${esc(inv.id)}" title="${esc(T('invite_minimize'))}">−</button><button type="button" data-dismiss="${esc(inv.id)}" title="${esc(T('invite_dismiss'))}">×</button></span></div>`;
        }
      }
      if (S.sent) {
        const s = S.sent;
        const first = s.first === 'random' ? T('first_random') : s.first === 'me' ? T('first_you') : T('first_name', { name: s.to.name });
        const det = details(s, first);
        // ⏳ = còn lại (khác ⏱ của thời gian mỗi nước). Đồng hồ nằm trong span riêng để
        // ticker chỉ cập nhật chữ, không vẽ lại thẻ (xem dưới).
        const small = `${det ? esc(det) + ' · ' : ''}<span data-sent-clock>⏳ ${esc(sentClock())}</span>`;
        const body = `<div>${esc(T('waiting_accept', { name: s.to.name }))}<small>${small}</small></div>
          <span class="invite-btns"><button type="button" class="ghost sm" data-cancel-sent>${esc(T('cancel'))}</button></span>`;
        floatHtml += `<div class="invite invite-right">${body}</div>`;
        dlgHtml += `<div class="invite">${body}</div>`;
      }
      const r = S.room;
      if (r && S.me && r.drawOffer && r.drawOffer !== S.me.id && !r.winner) {
        const opp = r.players.find((p) => p.id === r.drawOffer);
        const draw = `<div class="invite"><div><b>🤝 ${esc(T('draw_ask', { name: opp ? opp.name : T('opponent') }))}</b></div>
          <span class="invite-btns"><button type="button" class="ghost sm" data-draw="no">${esc(T('decline'))}</button>
          <button type="button" class="primary sm" data-draw="yes">${esc(T('accept'))}</button></span></div>`;
        floatHtml += draw;
        dlgHtml += draw;
      }
      // Hiện cả trong bảng Online (hộp thoại đang mở che mất thẻ lời mời phía dưới)
      const inner = $('dlg-invites');
      box.innerHTML = floatHtml + ((window.CaroGameX && window.CaroGameX.floatHtml()) || '') + ((window.CaroMatch && window.CaroMatch.floatHtml()) || '');
      inner.innerHTML = dlgHtml;
      inner.hidden = !dlgHtml;
      const all = (sel) => [...box.querySelectorAll(sel), ...inner.querySelectorAll(sel)];
      all('[data-draw]').forEach((b) => { b.onclick = () => send({ t: 'drawAnswer', accept: b.dataset.draw === 'yes' }); });
      all('[data-yes]').forEach((b) => {
        b.onclick = async () => {
          if (ctx.roomActive() && !(await window.CaroConfirm.ask(T('confirm_accept_busy')))) return;
          send({ t: 'challengeRespond', id: b.dataset.yes, accept: true });
        };
      });
      all('[data-no]').forEach((b) => {
        b.onclick = () => { send({ t: 'challengeRespond', id: b.dataset.no, accept: false }); S.invites.delete(b.dataset.no); renderInvites(); ctx.render(); };
      });
      box.querySelectorAll('[data-qm-cancel]').forEach((b) => { b.onclick = () => send({ t: 'quickCancel' }); });
      box.querySelectorAll('[data-qm-open]').forEach((b) => { b.onclick = () => $('btn-online').click(); });
      all('[data-cancel-sent]').forEach((c) => { c.onclick = () => { send({ t: 'challengeCancel', id: S.sent.id }); S.sent = null; renderInvites(); }; });
      // Thu gọn thành bong bóng / tắt thẻ nổi (chỉ thẻ nổi, không đụng bản trong hộp thoại
      // và không đụng lời mời: tắt thẻ KHÔNG gửi từ chối, không xóa khỏi S.invites — thẻ
      // trong đoạn chat vẫn vẽ nút Nhận/Từ chối vì nó kiểm tra S.invites, hộp thoại Online
      // vẫn còn lời mời, huy hiệu vẫn đếm. Tắt hẳn lời mời thì bấm Từ chối.
      box.querySelectorAll('[data-min]').forEach((b) => { b.onclick = () => { minimized.add(b.dataset.min); renderInvites(); }; });
      box.querySelectorAll('[data-restore]').forEach((b) => { b.onclick = () => { minimized.delete(b.dataset.restore); renderInvites(); }; });
      box.querySelectorAll('[data-dismiss]').forEach((b) => { b.onclick = () => { dismissed.add(b.dataset.dismiss); renderInvites(); }; });
      // Đếm ngược: mỗi giây chỉ cập nhật chữ đồng hồ, KHÔNG vẽ lại thẻ — vẽ lại làm
      // animation pop chạy lại mỗi giây nên thẻ nhấp nháy. Đổi trạng thái (hết giờ, hủy,
      // thu gọn, tắt...) mới vẽ lại.
      // Ticker chạy khi còn đồng hồ nào hiển thị: lời gửi, bong bóng thu gọn, hoặc thẻ
      // nhận hiện đầy đủ (thẻ nhận cũng có đếm ngược 5 phút).
      const needClock = !!(S.sent || minimized.size || S.invites.size);
      if (needClock && !clockTicker) {
        clockTicker = setInterval(() => {
          for (const el of [box, inner]) {
            if (!el) continue;
            const sc = el.querySelector('[data-sent-clock]');
            if (sc && S.sent) sc.textContent = '⏳ ' + sentClock();
            el.querySelectorAll('[data-inv-clock]').forEach((sp) => { sp.textContent = '⏳ ' + invClock(sp.dataset.invClock); });
          }
          if (S.sent && sentLeft() <= 0) { send({ t: 'challengeCancel', id: S.sent.id }); S.sent = null; renderInvites(); return; }
        }, 1000);
      } else if (!needClock && clockTicker) {
        clearInterval(clockTicker);
        clockTicker = 0;
      }
    }

    return { renderFriends, renderInvites };
  };
})();
