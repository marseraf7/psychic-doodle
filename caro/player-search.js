/*
 * Ô tìm kỳ thủ có gợi ý: gõ ≥ 2 ký tự thì hỏi máy chủ (lệnh userSearch – server/src/hub/lobby.js) và hiện danh sách
 * tên gợi ý ngay dưới ô (ảnh, tên, @tên đăng nhập, điểm, trạng thái). Lên / xuống để chọn, Enter để mở, Esc để đóng.
 *
 *   CaroPlayerSearch.attach(input, { onPick(u) }) – gắn vào một ô nhập; onPick: chọn một người
 *     (mặc định: mở hồ sơ người đó – profile.js). Gắn lại cho ô mới được (ô do JS vẽ lại).
 */
(function () {
  'use strict';
  const T = (k, a) => window.I18N.t(k, a);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const DEBOUNCE_MS = 220; // máy chủ nhận tối đa 5 lần / giây mỗi kết nối
  let rid = 0;
  const waiting = new Map(); // rid -> hàm nhận kết quả
  let hooked = false;

  function hook() {
    if (hooked || !window.CaroOnline) return;
    hooked = true;
    window.CaroOnline.on('userSearch', (m) => {
      const fn = waiting.get(m.rid);
      if (fn) { waiting.delete(m.rid); fn(m.users || []); }
    });
  }

  function attach(input, opts = {}) {
    hook();
    const onPick = opts.onPick || ((u) => window.CaroProfile && window.CaroProfile.open(u.id));
    const wrap = input.parentElement;
    wrap.classList.add('ps-wrap');
    let box = wrap.querySelector(':scope > .ps-list');
    if (!box) {
      box = document.createElement('ul');
      box.className = 'ps-list';
      box.setAttribute('role', 'listbox');
      wrap.appendChild(box);
    }
    box.hidden = true;
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
    let users = [], sel = -1, timer = 0, mine = 0;

    function show(html) {
      box.innerHTML = html;
      box.hidden = !html;
      input.setAttribute('aria-expanded', String(!!html));
    }
    function draw() {
      if (!users.length) return show(`<li class="ps-empty">${esc(T('ps_none'))}</li>`);
      show(users.map((u, i) => `<li role="option" data-i="${i}" class="${i === sel ? 'on' : ''}" aria-selected="${i === sel}">
        ${window.CaroAvatar.html(u, 'sm')}<span class="ps-t"><b>${esc(u.name)}</b><small>@${esc(u.username)}</small></span>
        ${u.rating ? `<span class="rating">${esc(String(u.rating))}</span>` : ''}<span class="st ${esc(u.status)}" title="${esc(T('st_' + u.status))}"></span></li>`).join(''));
    }
    function query() {
      const q = input.value.trim().replace(/^@/, '');
      if (q.length < 2) { users = []; return show(q ? `<li class="ps-empty">${esc(T('ps_min'))}</li>` : ''); }
      const O = window.CaroOnline;
      if (!O || !O.connected) return show(`<li class="ps-empty">${esc(T('ps_offline'))}</li>`);
      const id = mine = ++rid;
      waiting.set(id, (list) => {
        if (id !== mine || document.activeElement !== input) return; // kết quả cũ (đã gõ tiếp) / đã rời ô
        users = list;
        sel = -1;
        draw();
      });
      O.send({ t: 'userSearch', q, rid: id });
      if (waiting.size > 20) waiting.delete(waiting.keys().next().value);
    }
    function pick(i) {
      const u = users[i];
      if (!u) return;
      show('');
      input.blur();
      onPick(u);
    }

    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(query, DEBOUNCE_MS); });
    input.addEventListener('focus', () => { if (input.value.trim()) query(); });
    input.addEventListener('blur', () => setTimeout(() => show(''), 150)); // để kịp nhận lần bấm vào gợi ý
    input.addEventListener('keydown', (e) => {
      if (box.hidden || !users.length) { if (e.key === 'Escape') show(''); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        sel = (sel + (e.key === 'ArrowDown' ? 1 : users.length - 1 + (sel < 0 ? 1 : 0))) % users.length;
        draw();
      } else if (e.key === 'Enter' && sel >= 0) {
        e.preventDefault();
        pick(sel);
      } else if (e.key === 'Escape') show('');
    });
    box.onpointerdown = (e) => {
      const li = e.target.closest('li[data-i]');
      if (!li) return;
      e.preventDefault(); // giữ ô nhập không mất tiêu điểm trước khi chọn
      pick(Number(li.dataset.i));
    };
  }

  window.CaroPlayerSearch = { attach };
})();
