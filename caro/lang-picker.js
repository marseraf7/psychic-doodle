/*
 * Ô chọn ngôn ngữ (trang con "Ngôn ngữ" của Cài đặt) – window.CaroLangPicker. Danh sách ở caro/langs.js.
 *  – Mỗi hàng: tên tự gọi (bằng chính thứ tiếng đó, lang="…" để đọc đúng kiểu chữ / trình đọc màn hình đọc đúng; <bdi>: tên
 *    chữ Ả Rập trong giao diện LTR – hay tên chữ Latin trong giao diện RTL – không đảo thứ tự, vẫn căn theo hướng trang); dòng nhỏ:
 *    tên theo ngôn ngữ giao diện đang dùng (Intl.DisplayNames – CLDR) và nhãn "Bản dịch máy" khi status 'mt-draft'.
 *  – Không dùng cờ (cờ là quốc gia, không phải ngôn ngữ – W3C).
 *  – Ngôn ngữ 'hidden' (đang dịch dở) không có trong danh sách, trừ khi đang dùng (mở bằng ?lang=<mã>).
 *  – Trên SEARCH_MIN ngôn ngữ: thêm ô tìm (tìm theo tên tự gọi, tên theo ngôn ngữ giao diện, hoặc mã).
 * Hàm thuần (kiểm thử trên Node – server/test/i18n-script.test.js): items, norm, matches.
 */
(function (root) {
  'use strict';
  const SEARCH_MIN = 20;

  /** Các ngôn ngữ hiện trong ô chọn: status khác 'hidden', hoặc là ngôn ngữ đang dùng. */
  const items = (list, cur) => list.filter((x) => x.status !== 'hidden' || x.code === cur);
  /** Chuẩn hoá để tìm: chữ thường, bỏ dấu (Tiếng Việt → tieng viet, Čeština → cestina). */
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  /** Hàng x (kèm `local` – tên theo ngôn ngữ giao diện) có khớp chuỗi tìm q không. */
  function matches(x, q) {
    const k = norm(q);
    return !k || norm(x.name).includes(k) || norm(x.local).includes(k) || x.code.toLowerCase().startsWith(k);
  }

  const api = { items, norm, matches, SEARCH_MIN };
  if (typeof module === 'object' && module.exports) { module.exports = api; return; }

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  /** Vẽ danh sách vào el (div.list chứa các radio name="lang") rồi chọn sẵn ngôn ngữ đang dùng. */
  function render(el) {
    if (!el) return;
    const I = root.I18N, L = root.CaroLangs, T = (k) => I.t(k);
    let dn = null;
    try { dn = new Intl.DisplayNames([I.locale], { type: 'language' }); } catch (e) { dn = null; }
    const rows = items(L.LIST, I.lang).map((x) => {
      let local = '';
      try { local = dn ? dn.of(x.html) : ''; } catch (e) { local = ''; }
      return { ...x, local: local && norm(local) !== norm(x.name) ? local : '' };
    });
    const sub = (x) => [x.local, x.status === 'mt-draft' ? T('lang_mt') : ''].filter(Boolean).map(esc).join(' · ');
    const search = rows.length > SEARCH_MIN
      ? `<div class="li lang-q-row"><input type="search" class="lang-q" autocomplete="off" placeholder="${esc(T('lang_search'))}" aria-label="${esc(T('lang_search'))}"></div>`
      : '';
    el.innerHTML = search + rows.map((x) => `<label class="li" data-code="${esc(x.code)}"><span class="li-t"><span lang="${esc(x.html)}"><bdi>${esc(x.name)}</bdi></span>${sub(x) ? `<small>${sub(x)}</small>` : ''}</span><input type="radio" name="lang" value="${esc(x.code)}"><svg class="ico tick" aria-hidden="true"><use href="#i-check"/></svg></label>`).join('')
      + `<p class="hint lang-none" hidden>${esc(T('lang_none'))}</p>`;
    const r = el.querySelector(`input[name="lang"][value="${CSS.escape(I.lang)}"]`);
    if (r) r.checked = true;
    const q = el.querySelector('.lang-q');
    if (q) {
      q.addEventListener('input', () => {
        let any = false;
        for (const x of rows) {
          const show = matches(x, q.value);
          el.querySelector(`[data-code="${CSS.escape(x.code)}"]`).hidden = !show;
          any = any || show;
        }
        el.querySelector('.lang-none').hidden = any;
      });
      // Ô tìm nằm trong biểu mẫu Cài đặt: Enter không nộp biểu mẫu, sự kiện change không làm áp dụng lại Cài đặt
      q.addEventListener('keydown', (e) => { if (e.key === 'Enter') e.preventDefault(); });
      q.addEventListener('change', (e) => e.stopPropagation());
    }
  }

  root.CaroLangPicker = { ...api, render };
})(this);
