/*
 * Giải đấu – khu "Nhúng vào website" của tab Quản lý (như Challonge / MyLeague): chọn kiểu xem + giao diện → mã
 * <iframe> để dán vào WordPress / Blogger / Google Sites, và link dữ liệu JSON công khai (/api/tour/<mã>.json).
 * Trang nhúng là caro/embed.html (embed-run.js). Không nhúng được giải riêng tư / chỉ CLB, nháp, chờ duyệt.
 *   K.embedHtml(t) – khu nhúng (tour-manage.js đặt vào tab Quản lý). Nạp sau tour.js.
 */
(function () {
  'use strict';
  const K = window.CaroTourKit;
  if (!K) return;
  const { T, esc, icon } = K;
  const E = { view: 'bracket', theme: '' }; // lựa chọn đang dùng (giữ qua các lần vẽ lại)
  const VIEWS = ['bracket', 'standings', 'players'], THEMES = ['', 'light', 'dark'];
  const base = () => (window.CARO_SERVER || location.origin).replace(/\/+$/, '');

  function src(t) {
    const u = new URL(base() + '/embed.html');
    u.searchParams.set('t', t.id);
    if (E.view !== 'bracket') u.searchParams.set('view', E.view);
    if (E.theme) u.searchParams.set('theme', E.theme);
    u.searchParams.set('lang', window.I18N.lang);
    return u.toString();
  }
  const code = (t) => `<iframe src="${esc(src(t))}" title="${esc(t.name)}" width="100%" height="${E.view === 'players' ? 480 : 640}" style="border:0;max-width:100%" loading="lazy" allowfullscreen></iframe>`;
  const jsonUrl = (t) => `${base()}/api/tour/${t.id}.json`;

  K.embedHtml = (t) => {
    const head = `<h4>${esc(T('mg_embed'))}</h4>`;
    if (t.access === 'private' || t.access === 'club') return `<section class="mg-sec">${head}<p class="hint">${esc(T('mg_embed_private'))}</p></section>`;
    if (['draft', 'pending', 'rejected'].includes(t.status)) return `<section class="mg-sec">${head}<p class="hint">${esc(T('mg_embed_wait'))}</p></section>`;
    const sel = (name, list, cur, label) => `<label class="em-opt"><span class="muted">${esc(T(label))}</span><select data-embed="${name}">${list.map((v) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${esc(T('mg_embed_' + (v || 'auto')))}</option>`).join('')}</select></label>`;
    return `<section class="mg-sec embed-sec">${head}<p class="hint">${esc(T('mg_embed_hint'))}</p>
      <div class="row em-opts">${sel('view', VIEWS, E.view, 'mg_embed_view')}${sel('theme', THEMES, E.theme, 'mg_embed_theme')}</div>
      <textarea id="embed-code" class="em-code" rows="3" readonly aria-label="${esc(T('mg_embed_code'))}">${esc(code(t))}</textarea>
      <div class="row"><button type="button" class="primary sm" data-act="embedCopy">${icon('link')}${esc(T('mg_embed_copy'))}</button>
        <a class="em-json" href="${esc(jsonUrl(t))}" target="_blank" rel="noopener">${esc(T('mg_embed_json'))}</a></div></section>`;
  };

  K.acts.embedCopy = (b) => {
    const box = document.getElementById('embed-code');
    if (!box) return;
    const done = () => { b.textContent = T('mg_embed_copied'); setTimeout(() => { b.innerHTML = icon('link') + esc(T('mg_embed_copy')); }, 1500); };
    const old = () => { box.select(); try { document.execCommand('copy'); done(); } catch (e) { /* trình duyệt chặn: người dùng tự chép */ } };
    if (navigator.clipboard) navigator.clipboard.writeText(box.value).then(done, old);
    else old();
  };
  // Đổi kiểu xem / giao diện: chỉ cập nhật mã (không vẽ lại cả trang)
  K.binders.push((body) => body.querySelectorAll('[data-embed]').forEach((el) => {
    el.onchange = () => {
      E[el.dataset.embed] = el.value;
      const box = document.getElementById('embed-code');
      if (box && K.D.tour) box.value = code(K.D.tour);
    };
  }));
})();
