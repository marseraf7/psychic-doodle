/*
 * Văn bản có định dạng cho mô tả giải (như trình soạn "Description" của Challonge):
 *   CaroRich.render(src)            – dựng HTML an toàn từ văn bản đánh dấu (mọi chữ được thoát trước, chỉ sinh các thẻ
 *                                     trong danh sách; link chỉ http / https / mailto; ảnh chỉ ảnh đã tải lên máy chủ).
 *   CaroRich.editor(name, value, o) – ô soạn: thanh công cụ + textarea (name) + khung xem trước. o: { rows, max }.
 *   CaroRich.plain(src)             – bỏ đánh dấu (dòng tóm tắt, ảnh poster…).
 * Cú pháp (gần Markdown, ghi thẳng trong textarea – không lưu HTML nên không thể chèn mã độc):
 *   ## Tiêu đề · ### Tiêu đề nhỏ · > Trích dẫn · - Danh sách · 1. Danh sách số · --- kẻ ngang
 *   **đậm** · *nghiêng* · ~~gạch ngang~~ · [chữ](https://…) · ![chú thích](timg:<mã ảnh>)
 *   :::center / :::right / :::justify … ::: – căn giữa / phải / đều hai bên các dòng bên trong
 * Ảnh: nút "Chèn ảnh" thu nhỏ ảnh ngay trên máy (≤ 1600 px, ≤ 110 KB) rồi gửi lên thành nhiều phần (server/src/hub/tour-img.js).
 */
(function () {
  'use strict';
  const T = (k, a) => window.I18N.t(k, a);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const IMG_SIDE = 1600;
  const IMG_BYTES = 110 * 1024; // máy chủ nhận tối đa 120 KB
  const PART = 12000; // ký tự base64 mỗi phần (như PART_CHARS ở máy chủ)

  // ------------------------------------------------------------ Dựng HTML
  const base = () => ((window.CaroOnline && window.CaroOnline.base) || '');
  const LINK_RE = /^(https?:\/\/|mailto:)[^\s]+$/i;
  /** Định dạng trong dòng – s đã được thoát HTML. */
  function inline(s) {
    // Ảnh đã tải lên máy chủ; ảnh nơi khác (CSP không cho hiện) thành link
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (all, alt, src) => {
      const m = /^timg:([0-9a-f]{16})$/.exec(src);
      if (m) return `<img class="rt-img" src="${esc(base())}/api/timg/${m[1]}" alt="${alt}" loading="lazy" decoding="async">`;
      return LINK_RE.test(src) ? `<a href="${src}" target="_blank" rel="noopener noreferrer nofollow ugc">🖼 ${alt || esc(T('rt_image'))}</a>` : all;
    });
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (all, text, href) => (LINK_RE.test(href)
      ? `<a href="${href}" target="_blank" rel="noopener noreferrer nofollow ugc">${text}</a>` : all));
    // Link trần (không nằm trong thuộc tính / thẻ <a> vừa tạo)
    s = s.replace(/(^|[\s(])(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, (all, pre, href) => `${pre}<a href="${href}" target="_blank" rel="noopener noreferrer nofollow ugc">${href}</a>`);
    s = s.replace(/\*\*(?=\S)([^*]+?)\*\*/g, '<b>$1</b>');
    s = s.replace(/(^|[^*\w])\*(?=\S)([^*]+?)\*(?!\w)/g, '$1<i>$2</i>');
    s = s.replace(/~~(?=\S)(.+?)~~/g, '<s>$1</s>');
    return s;
  }
  const ALIGN = { center: 'c', right: 'r', justify: 'j', left: '' };

  /** Dựng HTML từ văn bản đánh dấu. Văn bản cũ (một dòng, không đánh dấu) hiện như đoạn văn thường. */
  function render(src) {
    const lines = String(src || '').replace(/\r\n?/g, '\n').split('\n');
    const out = [];
    let para = [], list = null, quote = [];
    const flushPara = () => { if (para.length) out.push(`<p>${para.map((l) => inline(esc(l))).join('<br>')}</p>`); para = []; };
    const flushList = () => { if (list) out.push(`<${list.tag}>${list.items.map((x) => `<li>${inline(esc(x))}</li>`).join('')}</${list.tag}>`); list = null; };
    const flushQuote = () => { if (quote.length) out.push(`<blockquote>${quote.map((l) => inline(esc(l))).join('<br>')}</blockquote>`); quote = []; };
    const flush = () => { flushPara(); flushList(); flushQuote(); };
    let depth = 0; // khối căn lề đang mở
    for (const raw of lines) {
      const line = raw.replace(/\s+$/, '');
      const al = /^:::\s*(center|right|justify|left)?\s*$/.exec(line);
      if (al) {
        flush();
        if (al[1]) { out.push(`<div class="rt-al ${ALIGN[al[1]] ? 'rt-' + ALIGN[al[1]] : ''}">`); depth++; } else if (depth) { out.push('</div>'); depth--; }
        continue;
      }
      let m;
      if (!line.trim()) { flush(); continue; }
      if (/^(-{3,}|\*{3,})$/.test(line.trim())) { flush(); out.push('<hr>'); continue; }
      if ((m = /^(#{2,3})\s+(.*)$/.exec(line))) { flush(); out.push(`<${m[1].length === 2 ? 'h4' : 'h5'} class="rt-h">${inline(esc(m[2]))}</${m[1].length === 2 ? 'h4' : 'h5'}>`); continue; }
      if ((m = /^>\s?(.*)$/.exec(line))) { flushPara(); flushList(); quote.push(m[1]); continue; }
      if ((m = /^\s*[-•]\s+(.*)$/.exec(line)) || (m = /^\s*(\d{1,3})[.)]\s+(.*)$/.exec(line))) {
        flushPara(); flushQuote();
        const tag = m.length === 3 ? 'ol' : 'ul';
        if (!list || list.tag !== tag) { flushList(); list = { tag, items: [] }; }
        list.items.push(m[m.length - 1]);
        continue;
      }
      flushList(); flushQuote();
      para.push(line);
    }
    flush();
    while (depth-- > 0) out.push('</div>');
    return out.join('');
  }

  /** Bỏ đánh dấu, giữ chữ. */
  function plain(src) {
    return String(src || '').replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/^:::.*$/gm, '')
      .replace(/^(#{2,3}|>|\s*[-•]|\s*\d{1,3}[.)])\s+/gm, '').replace(/^(-{3,}|\*{3,})$/gm, '').replace(/\*\*|~~/g, '')
      .replace(/(^|[^*\w])\*(?=\S)([^*]+?)\*(?!\w)/g, '$1$2').replace(/\n{2,}/g, '\n').trim();
  }

  // ------------------------------------------------------------ Ô soạn
  const BTN = [
    ['bold', 'B'], ['italic', 'I'], ['strike', 'S'], null, ['ul', '•≡'], ['ol', '1≡'], null, ['link', '🔗'], ['image', '🖼'], null,
    ['left', '⇤'], ['center', '≡'], ['right', '⇥'], ['justify', '☰'], null, ['hr', '—'], ['clear', 'Tx'], null, ['preview', '<>'],
  ];
  function editor(name, value, o = {}) {
    const bar = BTN.map((b) => (b ? `<button type="button" class="rt-b rt-${b[0]}" data-rt="${b[0]}" title="${esc(T('rt_' + b[0]))}" aria-label="${esc(T('rt_' + b[0]))}">${esc(b[1])}</button>` : '<span class="rt-sep"></span>')).join('');
    const para = `<select class="rt-para" data-rt="para" aria-label="${esc(T('rt_para'))}" title="${esc(T('rt_para'))}">${['p', 'h', 'sh', 'quote'].map((k) => `<option value="${k}">${esc(T('rt_para_' + k))}</option>`).join('')}</select>`;
    return `<div class="rt-ed" data-rt-ed="${esc(name)}">
      <div class="rt-bar" role="toolbar" aria-label="${esc(T('rt_toolbar'))}">${para}${bar}</div>
      <div class="rt-pop" hidden></div>
      <textarea name="${esc(name)}" rows="${o.rows || 6}" maxlength="${o.max || 4000}" spellcheck="true">${esc(value || '')}</textarea>
      <div class="rt-view rich" hidden></div>
      <input type="file" accept="image/png,image/jpeg,image/webp" class="rt-file" hidden>
    </div>`;
  }

  /** Thay vùng [a, b) của textarea bằng text, chọn lại phần [selA, selB) tính từ a; báo 'input' để form lưu nháp. */
  function replace(ta, a, b, text, selA = text.length, selB = selA) {
    ta.focus();
    ta.setRangeText(text, a, b, 'end');
    ta.setSelectionRange(a + selA, a + selB);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function wrap(ta, l, r) {
    const { selectionStart: a, selectionEnd: b, value } = ta;
    const sel = value.slice(a, b) || T('rt_sample');
    replace(ta, a, b, l + sel + r, l.length, l.length + sel.length);
  }
  /** Các dòng đang chọn (mở rộng tới đầu / cuối dòng). */
  function lineRange(ta) {
    const v = ta.value;
    const a = v.lastIndexOf('\n', ta.selectionStart - 1) + 1;
    let b = v.indexOf('\n', Math.max(ta.selectionEnd - (ta.selectionEnd > ta.selectionStart && v[ta.selectionEnd - 1] === '\n' ? 1 : 0), a));
    if (b < 0) b = v.length;
    return [a, b];
  }
  const PREFIX_RE = /^(#{2,3}\s+|>\s?|\s*[-•]\s+|\s*\d{1,3}[.)]\s+)/;
  function prefixLines(ta, fn) {
    const [a, b] = lineRange(ta);
    const text = ta.value.slice(a, b).split('\n').map((l, i) => fn(l.replace(PREFIX_RE, ''), i)).join('\n');
    replace(ta, a, b, text, 0, text.length);
  }
  function align(ta, how) {
    const [a, b] = lineRange(ta);
    const v = ta.value;
    // Đang nằm trong một khối căn lề liền kề: bỏ khối cũ trước
    const before = v.slice(0, a), after = v.slice(b);
    const open = /(^|\n):::(center|right|justify)\n$/.exec(before), close = /^\n:::(\n|$)/.exec(after);
    const s = open ? a - open[0].length + open[1].length : a, e = close ? b + close[0].length - close[1].length : b;
    const body = v.slice(a, b);
    const text = how === 'left' ? body : `:::${how}\n${body}\n:::`;
    replace(ta, s, e, text, how === 'left' ? 0 : how.length + 4, how === 'left' ? body.length : how.length + 4 + body.length);
  }
  function clear(ta) {
    const { selectionStart: a, selectionEnd: b } = ta;
    const [la, lb] = a === b ? lineRange(ta) : [a, b];
    const text = plain(ta.value.slice(la, lb));
    replace(ta, la, lb, text, 0, text.length);
  }

  /** Khung nhỏ dưới thanh công cụ: nhập link (chữ + địa chỉ). */
  function linkPop(ed, ta) {
    const pop = ed.querySelector('.rt-pop');
    const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd);
    const [a, b] = [ta.selectionStart, ta.selectionEnd];
    pop.innerHTML = `<input class="rt-l-text" placeholder="${esc(T('rt_link_text'))}" value="${esc(sel)}" maxlength="120">
      <input class="rt-l-url" type="url" placeholder="https://…" maxlength="300"><button type="button" class="primary sm rt-l-ok">${esc(T('rt_insert'))}</button>
      <button type="button" class="ghost sm rt-l-no">${esc(T('cancel'))}</button><small class="err"></small>`;
    pop.hidden = false;
    pop.querySelector('.rt-l-url').focus();
    pop.querySelector('.rt-l-no').onclick = () => { pop.hidden = true; ta.focus(); };
    // Enter trong ô link: chèn (không gửi cả form tạo giải)
    pop.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); pop.querySelector('.rt-l-ok').click(); } };
    pop.querySelector('.rt-l-ok').onclick = () => {
      const url = pop.querySelector('.rt-l-url').value.trim();
      if (!LINK_RE.test(url)) { pop.querySelector('.err').textContent = T('rt_link_bad'); return; }
      const text = pop.querySelector('.rt-l-text').value.trim().replace(/[[\]]/g, '') || url;
      pop.hidden = true;
      replace(ta, a, b, `[${text}](${url})`);
    };
  }

  // ---- Ảnh: thu nhỏ trên máy rồi gửi từng phần
  const blobOf = (canvas, type, q) => new Promise((res) => canvas.toBlob(res, type, q));
  const b64 = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = rej; r.readAsDataURL(blob); });
  async function shrink(file) {
    const bmp = await createImageBitmap(file);
    let scale = Math.min(1, IMG_SIDE / Math.max(bmp.width, bmp.height));
    for (let k = 0; k < 6; k++, scale *= 0.8) {
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(bmp.width * scale));
      c.height = Math.max(1, Math.round(bmp.height * scale));
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      for (const q of [0.85, 0.7, 0.55]) {
        let blob = await blobOf(c, 'image/webp', q);
        if (!blob || blob.type !== 'image/webp') blob = await blobOf(c, 'image/jpeg', q); // Safari cũ: không xuất được WebP
        if (blob && blob.size <= IMG_BYTES) return blob;
      }
    }
    return null;
  }
  const waiting = new Map(); // mã tải lên → { resolve, reject }
  function upload(data) {
    const O = window.CaroOnline;
    const up = Math.random().toString(16).slice(2, 10).padEnd(8, '0');
    const n = Math.ceil(data.length / PART) || 1;
    return new Promise((resolve, reject) => {
      waiting.set(up, { resolve, reject });
      for (let i = 0; i < n; i++) O.send({ t: 'tourImg', up, i, n, data: data.slice(i * PART, (i + 1) * PART) });
      setTimeout(() => { if (waiting.delete(up)) reject(new Error('timeout')); }, 30000);
    });
  }
  async function pickImage(ed, ta, file) {
    const pop = ed.querySelector('.rt-pop');
    const [a, b] = [ta.selectionStart, ta.selectionEnd];
    pop.hidden = false;
    pop.innerHTML = `<small>${esc(T('rt_img_uploading'))}</small>`;
    try {
      const blob = await shrink(file);
      if (!blob) throw new Error('big');
      const id = await upload(await b64(blob));
      pop.hidden = true;
      const alt = (file.name || '').replace(/\.[a-z0-9]+$/i, '').replace(/[[\]()]/g, '').slice(0, 60);
      replace(ta, a, b, `${a && ta.value[a - 1] !== '\n' ? '\n' : ''}![${alt}](timg:${id})\n`);
    } catch (e) {
      pop.innerHTML = `<small class="err">${esc(e && e.message === 'big' ? T('rt_img_big') : T('rt_img_fail'))}</small>`;
    }
  }
  if (window.CaroOnline && window.CaroOnline.on) {
    window.CaroOnline.on('tourImgSaved', (m) => { const w = waiting.get(m.up); if (w) { waiting.delete(m.up); w.resolve(m.id); } });
    // Máy chủ từ chối ảnh (sai loại, quá lớn, tải quá nhiều): dừng chờ ngay, không đợi hết 30 giây
    window.CaroOnline.on('error', (m) => {
      if (m.ctx !== 'tourImg') return;
      for (const [up, w] of waiting) { waiting.delete(up); w.reject(new Error(m.code === 'tour_img_too_big' ? 'big' : m.code)); }
    });
  }

  function act(ed, k, el) {
    const ta = ed.querySelector('textarea');
    if (!ta) return;
    if (k === 'preview') {
      const view = ed.querySelector('.rt-view');
      const on = view.hidden;
      view.hidden = !on;
      ta.hidden = on;
      if (on) view.innerHTML = render(ta.value) || `<p class="muted">${esc(T('rt_empty'))}</p>`;
      el.classList.toggle('on', on);
      ed.querySelectorAll('.rt-b:not(.rt-preview), .rt-para').forEach((b) => { b.disabled = on; });
      return;
    }
    if (k === 'bold') wrap(ta, '**', '**');
    else if (k === 'italic') wrap(ta, '*', '*');
    else if (k === 'strike') wrap(ta, '~~', '~~');
    else if (k === 'ul') prefixLines(ta, (l) => '- ' + l);
    else if (k === 'ol') prefixLines(ta, (l, i) => `${i + 1}. ${l}`);
    else if (k === 'hr') replace(ta, ta.selectionEnd, ta.selectionEnd, '\n---\n');
    else if (k === 'clear') clear(ta);
    else if (k === 'link') linkPop(ed, ta);
    else if (k === 'image') ed.querySelector('.rt-file').click();
    else if (ALIGN[k] !== undefined) align(ta, k);
    else if (k === 'para') {
      const pre = { p: '', h: '## ', sh: '### ', quote: '> ' }[el.value] || '';
      prefixLines(ta, (l) => pre + l);
      el.value = 'p';
    }
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('.rt-b');
    const ed = b && b.closest('.rt-ed');
    if (ed) { e.preventDefault(); act(ed, b.dataset.rt, b); }
  });
  document.addEventListener('change', (e) => {
    const ed = e.target.closest && e.target.closest('.rt-ed');
    if (!ed) return;
    if (e.target.classList.contains('rt-para')) { e.stopPropagation(); act(ed, 'para', e.target); }
    if (e.target.classList.contains('rt-file') && e.target.files[0]) {
      e.stopPropagation();
      pickImage(ed, ed.querySelector('textarea'), e.target.files[0]);
      e.target.value = '';
    }
  }, true);

  /** Thu nhỏ rồi tải một ảnh lên máy chủ (đính kèm trận – tour-match-extra.js): Promise<mã ảnh>. */
  async function uploadImage(file) {
    const blob = await shrink(file);
    if (!blob) throw new Error('big');
    return upload(await b64(blob));
  }
  const imgUrl = (id) => `${base()}/api/timg/${id}`;

  window.CaroRich = { render, plain, editor, esc, uploadImage, imgUrl };
  if (typeof module !== 'undefined') module.exports = window.CaroRich;
})();
