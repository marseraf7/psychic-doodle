/*
 * Ô nhập ngày giờ thống nhất cho cả app (thay <input type="datetime-local"> – ô gốc hiện theo ngôn ngữ trình duyệt, máy
 * cài tiếng Anh ra "10/29/2026, 09:00 AM" và dễ bị cắt chữ khi hẹp): ngày dạng 29/10/2026 (gõ tay hoặc bấm nút lịch để
 * chọn), giờ 24h dạng 09:00. Giá trị thật nằm trong ô ẩn (name / data-f) dạng "2026-10-29T09:00" như datetime-local,
 * nên code đọc form giữ nguyên; mỗi lần sửa ô ẩn được cập nhật và phát sự kiện change (nổi lên form).
 *   CaroDt.html(name, value, { attrs, required }) – value: "YYYY-MM-DDTHH:MM" hoặc ''
 *   CaroDt.bind(root) – gắn sự kiện cho mọi ô ngày giờ trong root (gọi sau mỗi lần vẽ)
 *   CaroDt.parse(date, time) → "YYYY-MM-DDTHH:MM" | '' (chưa nhập đủ ngày và giờ) | null (sai)
 */
(function () {
  'use strict';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const T = (k) => (window.I18N ? window.I18N.t(k) : k);
  const pad = (n) => String(n).padStart(2, '0');

  /** "2026-10-29T09:05" → ["29/10/2026", "09:05"]. */
  function split(value) {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(value || ''));
    return m ? [`${m[3]}/${m[2]}/${m[1]}`, `${m[4]}:${m[5]}`] : ['', ''];
  }

  /** Ngày "29/10", "29/10/2026", "29-10-26"; giờ "9", "9:5", "0930", "21h15". Không có năm: năm nay. */
  function parse(date, time) {
    const d = String(date || '').trim(), t = String(time || '').trim();
    if (!d || !t) return ''; // chưa nhập đủ ngày và giờ: coi như trống
    const dm = /^(\d{1,2})[/.\-](\d{1,2})(?:[/.\-](\d{2}|\d{4}))?$/.exec(d);
    if (!dm) return null;
    let y = dm[3] ? Number(dm[3]) : new Date().getFullYear();
    if (y < 100) y += 2000;
    const day = Number(dm[1]), mon = Number(dm[2]);
    // "9", "9:5", "09:05", "0905", "21h15"
    const tm = /^(\d{1,2})(?:[:hH.](\d{1,2})|(\d{2}))?$/.exec(t);
    if (!tm) return null;
    const h = Number(tm[1]), mi = Number(tm[2] || tm[3] || 0);
    const x = new Date(y, mon - 1, day, h, mi);
    if (x.getFullYear() !== y || x.getMonth() !== mon - 1 || x.getDate() !== day || h > 23 || mi > 59) return null;
    return `${y}-${pad(mon)}-${pad(day)}T${pad(h)}:${pad(mi)}`;
  }

  function html(name, value, opts = {}) {
    const [d, t] = split(value);
    const nameAttr = name ? `name="${esc(name)}"` : '';
    return `<span class="dt" data-dt>
      <input type="hidden" ${nameAttr} ${opts.attrs || ''} value="${esc(value || '')}">
      <input class="dt-d" inputmode="numeric" maxlength="10" placeholder="dd/mm/yyyy" value="${esc(d)}" aria-label="${esc(T('dt_date'))}" ${opts.required ? 'required' : ''}>
      <button type="button" class="ghost sm icon dt-cal" aria-label="${esc(T('dt_pick'))}" title="${esc(T('dt_pick'))}"><svg class="ico" aria-hidden="true"><use href="#i-cal"/></svg></button>
      <input type="date" class="dt-native" tabindex="-1" aria-hidden="true">
      <input class="dt-t" inputmode="numeric" maxlength="5" placeholder="hh:mm" value="${esc(t)}" aria-label="${esc(T('dt_time'))}">
    </span>`;
  }

  function bind(root) {
    (root || document).querySelectorAll('[data-dt]').forEach((box) => {
      if (box.dataset.bound) return;
      box.dataset.bound = '1';
      const hid = box.querySelector('input[type=hidden]'), dd = box.querySelector('.dt-d'), tt = box.querySelector('.dt-t'), nat = box.querySelector('.dt-native');
      const update = () => {
        const v = parse(dd.value, tt.value);
        box.classList.toggle('bad', v === null);
        const next = v === null ? '' : v;
        if (hid.value === next) return;
        hid.value = next;
        hid.dispatchEvent(new Event('change', { bubbles: true }));
      };
      // Gõ xong một ô (rời ô hoặc Enter) thì chuẩn hoá đúng ô đó: 29/10 → 29/10/2026, 9:5 → 09:05
      const tidy = (which) => () => {
        update();
        if (which === 'd') { const v = parse(dd.value, '0:00'); if (v) dd.value = split(v)[0]; }
        else { const v = parse('1/1/2000', tt.value); if (v) tt.value = split(v)[1]; }
      };
      dd.addEventListener('input', update);
      tt.addEventListener('input', update);
      dd.addEventListener('change', tidy('d'));
      tt.addEventListener('change', tidy('t'));
      box.querySelector('.dt-cal').onclick = () => {
        const v = hid.value || parse(dd.value, '0:00') || '';
        nat.value = v ? v.slice(0, 10) : '';
        try { nat.showPicker(); } catch (e) { nat.click(); }
      };
      nat.onchange = () => {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(nat.value);
        if (!m) return;
        dd.value = `${m[3]}/${m[2]}/${m[1]}`;
        if (!tt.value) tt.value = '09:00';
        update();
      };
    });
  }

  window.CaroDt = { html, bind, parse, split };
})();
