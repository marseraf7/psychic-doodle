/*
 * Giải đấu Offline – thư viện mẫu giải nổi tiếng dạng ô gọn ở form tạo giải + hộp xem (toàn màn hình trên điện thoại,
 * hộp giữa màn hình trên máy tính). Thay lưới thẻ dài trước đây (otour-tpl.js vẫn giữ việc áp mẫu: K.acts.otTpl).
 *   - Ô gọn: "Mẫu giải nổi tiếng · N mẫu", vài biểu tượng, một dòng gợi ý → bấm mở hộp.
 *   - Danh sách: nhóm theo mục (Bóng đá, Thể thao điện tử, Sinh tồn…), ô tìm (bỏ dấu), nút lọc mục.
 *   - Chi tiết: sơ đồ từng giai đoạn (SVG vẽ từ thông số mẫu – otour-tpl-art.js), luật chơi (tpl_<id>_d), từng giai
 *     đoạn bằng lời (otour-spec-io.js – describeSpec, cùng nguồn với giải sẽ tạo), link giải thích thể thức (mở tab mới),
 *     nút "Dùng mẫu này" = bấm thẻ mẫu như trước (K.acts.otTpl).
 * Hộp là <dialog> gốc: Esc đóng, giữ focus trong hộp, đóng xong trả focus về ô gọn. Không dùng confirm() / alert() gốc.
 *   K.otTplTile(d) – gọi từ otour-tpl.js (K.otTplHtml).
 */
(function () {
  'use strict';
  const K = window.CaroTourKit;
  const TP = window.CaroOTourTemplates;
  const SP = window.CaroOTourSports;
  const IO = window.CaroOTourSpecIO;
  const ART = window.CaroOTourTplArt;
  if (!K || !TP || !SP || !IO || !ART) return;
  const { T, esc } = K;
  const S = { dlg: null, cat: '', q: '', from: null };

  /** Bỏ dấu, chữ thường – để tìm "bong da" vẫn ra "Bóng đá". */
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase();
  const lang = () => String(document.documentElement.lang || 'vi').slice(0, 2).toLowerCase();
  const name = (x) => T('tpl_' + x.id);
  const kindLabel = (c, f) => (ART.kind(c) === 'rr' && f && f.groups > 1 ? T('otl_k_groups', { n: f.groups }) : T('otl_k_' + ART.kind(c)));

  // ------------------------------------------------------------ Ô gọn trên form
  K.otTplTile = () => {
    const icons = [...new Set(TP.TEMPLATES.map((x) => x.icon))].slice(0, 6).map((i) => `<span>${i}</span>`).join('');
    return `<button type="button" class="tpl-tile" data-act="otTplLib" aria-haspopup="dialog">
      <span class="tt-ic" aria-hidden="true">${icons}</span>
      <span class="tt-tx"><b>${esc(T('otl_tile', { n: TP.TEMPLATES.length }))}</b><small>${esc(T('otl_tile_h'))}</small></span>
      <span class="tt-go" aria-hidden="true">›</span></button>`;
  };
  K.acts.otTplLib = (b) => open(null, b);
  K.acts.otTplInfo = (b) => open(b.dataset.id, b);

  // ------------------------------------------------------------ Hộp
  function dialog() {
    if (S.dlg && document.body.contains(S.dlg)) return S.dlg;
    const d = document.createElement('dialog');
    d.className = 'tpl-lib';
    d.setAttribute('aria-labelledby', 'tpl-lib-h');
    d.addEventListener('click', onClick);
    d.addEventListener('input', (e) => { if (e.target.id === 'tpl-q') { S.q = e.target.value; filter(); } });
    d.addEventListener('close', () => { const f = S.from; S.from = null; if (f && document.body.contains(f)) f.focus(); });
    document.body.appendChild(d);
    S.dlg = d;
    return d;
  }
  function open(id, from) {
    const d = dialog();
    S.from = from || document.activeElement;
    if (id) showDetail(id); else { S.q = ''; S.cat = ''; showList(); } // mở từ ô gọn: danh sách đầy đủ
    if (!d.open) { if (d.showModal) d.showModal(); else d.setAttribute('open', ''); }
    focusFirst(id);
  }
  function close() { if (S.dlg && S.dlg.open) S.dlg.close(); }
  function focusFirst(id) {
    const d = S.dlg;
    // Điện thoại: không tự focus ô tìm (bàn phím ảo che nửa danh sách) – focus tiêu đề hộp
    const fine = window.matchMedia && matchMedia('(pointer: fine)').matches;
    const el = id || !fine ? d.querySelector('#tpl-lib-h') : d.querySelector('#tpl-q');
    if (el) el.focus({ preventScroll: true });
  }
  const head = (title, back) => `<header class="tpl-head">
    ${back ? `<button type="button" class="ghost sm icon" data-lib="back" aria-label="${esc(T('otl_back'))}" title="${esc(T('otl_back'))}">‹</button>` : ''}
    <h2 id="tpl-lib-h" tabindex="-1"><span class="ellip">${title}</span></h2>
    <button type="button" class="ghost sm icon" data-lib="close" aria-label="${esc(T('otl_close'))}" title="${esc(T('otl_close'))}">✕</button></header>`;

  // ------------------------------------------------------------ Danh sách
  function item(x) {
    const st = x.stages || [];
    const fl = ART.flow(x);
    const path = st.map((c, i) => kindLabel(c, fl[i])).filter((s, i, a) => s !== a[i - 1]).join(' → ');
    const hay = norm([name(x), x.id, T('sport_' + x.sport), T('otl_cat_' + ART.category(x)), path].join(' '));
    return `<li data-q="${esc(hay)}"><button type="button" class="tpl-item" data-lib="info" data-id="${esc(x.id)}">
      <span class="ti" aria-hidden="true">${x.icon}</span>
      <span class="tx"><b class="ellip">${esc(name(x))}</b><small class="ellip">${esc(T('tpl_n', { n: x.n }))} · ${esc(path)}</small></span>
      <span class="go" aria-hidden="true">›</span></button></li>`;
  }
  function showList() {
    const d = dialog();
    d.dataset.view = 'list';
    const by = {};
    for (const x of TP.TEMPLATES) (by[ART.category(x)] = by[ART.category(x)] || []).push(x);
    const cats = ART.CATS.filter((c) => by[c]);
    const chip = (c, label, n) => `<button type="button" class="chip ${S.cat === c ? 'on' : ''}" data-lib="cat" data-cat="${c}" aria-pressed="${S.cat === c}">${esc(label)} <small>${n}</small></button>`;
    d.innerHTML = `${head(esc(T('otl_title')), false)}
      <div class="tpl-tools"><input id="tpl-q" type="search" autocomplete="off" value="${esc(S.q)}" placeholder="${esc(T('otl_search'))}" aria-label="${esc(T('otl_search'))}">
        <div class="tpl-chips" role="group" aria-label="${esc(T('otl_title'))}">${chip('', T('otl_all'), TP.TEMPLATES.length)}${cats.map((c) => chip(c, T('otl_cat_' + c), by[c].length)).join('')}</div></div>
      <div class="tpl-body">${cats.map((c) => `<section class="tpl-cat" data-cat="${c}"><h3>${esc(T('otl_cat_' + c))} <small>${by[c].length}</small></h3>
        <ul class="tpl-items">${by[c].map(item).join('')}</ul></section>`).join('')}<p class="hint tpl-none" hidden>${esc(T('otl_none'))}</p></div>`;
    filter();
  }
  /** Lọc theo ô tìm + mục đang chọn; mục không còn mẫu nào thì ẩn. */
  function filter() {
    const d = S.dlg;
    if (!d || d.dataset.view !== 'list') return;
    const q = norm(S.q).trim().split(/\s+/).filter(Boolean);
    let any = 0;
    d.querySelectorAll('.tpl-cat').forEach((sec) => {
      let n = 0;
      sec.querySelectorAll('li[data-q]').forEach((li) => {
        const show = (!S.cat || S.cat === sec.dataset.cat) && q.every((w) => li.dataset.q.includes(w));
        li.hidden = !show;
        if (show) n++;
      });
      sec.hidden = !n;
      any += n;
    });
    d.querySelector('.tpl-none').hidden = !!any;
    d.querySelectorAll('.tpl-chips .chip').forEach((b) => { const on = b.dataset.cat === S.cat; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  }

  // ------------------------------------------------------------ Chi tiết
  /** Luật chơi bằng lời: đoạn giới thiệu của mẫu + từng câu của bản cấu hình thật (giống "Xem trước bằng lời"). */
  K.otTplRules = (x) => ({ intro: T('tpl_' + x.id + '_d'), lines: IO.describeSpec({ ...TP.specOf(x, SP.SPORTS), n: x.n }, T) });
  function flowHtml(x) {
    const st = x.stages || [];
    const fl = ART.flow(x);
    return st.map((c, i) => {
      const f = fl[i];
      const lab = kindLabel(c, f);
      const meta = [f.n ? T('tpl_n', { n: f.n }) : '', f.direct ? T('otl_direct', { n: f.direct }) : '', f.out ? T('otl_out', { n: f.out }) : ''].filter(Boolean).join(' · ');
      return `<figure class="tpl-stage">${ART.stageSvg(c, f, T('otl_st', { n: i + 1 }) + ': ' + lab)}
        <figcaption><b>${esc(T('otl_st', { n: i + 1 }))}</b><span>${esc(lab)}</span>${meta ? `<small>${esc(meta)}</small>` : ''}</figcaption></figure>`;
    }).join('');
  }
  function showDetail(id) {
    const x = TP.byId(id);
    if (!x) return showList();
    const d = dialog();
    d.dataset.view = 'detail';
    d.dataset.id = id;
    const R = K.otTplRules(x);
    const lk = ART.links(x.stages, lang()).map((k) => `<li><a href="${esc(k.url)}" target="_blank" rel="noopener noreferrer">${esc(T('otl_wiki_' + k.key))}</a>${k.lang !== lang() ? ` <small class="muted">${esc(T('otl_link_en'))}</small>` : ''} <small class="muted">Wikipedia ↗</small></li>`).join('');
    d.innerHTML = `${head(`${x.icon} ${esc(name(x))}`, true)}
      <div class="tpl-body">
        <p class="tpl-meta"><span class="pill">${esc(T('tpl_n', { n: x.n }))}</span> <span class="pill">${esc(T('otl_stages', { n: (x.stages || []).length }))}</span> <span class="pill">${esc(SP.SPORTS[x.sport] ? SP.SPORTS[x.sport].icon + ' ' + T('sport_' + x.sport) : T('otl_cat_' + ART.category(x)))}</span></p>
        <section class="tpl-sec"><h3>${esc(T('otl_fig'))}</h3><div class="tpl-flow">${flowHtml(x)}</div>
          <p class="hint">${esc(T('otl_fig_note', { n: x.n }))}</p></section>
        <section class="tpl-sec tpl-rules"><h3>${esc(T('otl_rules'))}</h3><p>${esc(R.intro)}</p></section>
        <section class="tpl-sec"><h3>${esc(T('otl_detail'))}</h3><ul class="tpl-lines">${R.lines.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></section>
        ${lk ? `<section class="tpl-sec"><h3>${esc(T('otl_links'))}</h3><ul class="tpl-links">${lk}</ul></section>` : ''}
      </div>
      <footer class="tpl-foot"><button type="button" class="ghost" data-lib="back">${esc(T('otl_back'))}</button>
        <button type="button" class="primary" data-lib="use" data-id="${esc(x.id)}">${esc(T('otl_use'))}</button></footer>`;
  }

  function onClick(e) {
    const d = S.dlg;
    if (e.target === d) { close(); return; } // bấm nền mờ ngoài hộp
    const b = e.target.closest('[data-lib]');
    if (!b) return;
    const a = b.dataset.lib;
    if (a === 'close') close();
    else if (a === 'cat') { S.cat = b.dataset.cat; filter(); }
    else if (a === 'info') { showDetail(b.dataset.id); focusFirst(true); }
    else if (a === 'back') {
      const id = d.dataset.id;
      showList();
      const it = d.querySelector(`.tpl-item[data-id="${CSS.escape(id || '')}"]`);
      if (it) { it.focus(); it.scrollIntoView({ block: 'nearest' }); } else focusFirst(false);
    } else if (a === 'use') {
      const id = b.dataset.id;
      S.from = null; // form vẽ lại – focus chuyển sang ô gọn mới
      close();
      K.acts.otTpl({ dataset: { id } });
      const tile = document.querySelector('.tpl-tile');
      if (tile) tile.focus({ preventScroll: true });
    }
  }
})();
