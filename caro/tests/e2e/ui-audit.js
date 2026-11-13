/*
 * Soát giao diện tự động (dùng chung cho các bài thử trình duyệt – docs/chuan-giao-dien.md):
 * audit(page, scope) trả danh sách lỗi hiển thị đang thấy trên trang:
 *   clip        – chữ bị cắt mà không có dấu "…" (tràn ngang trong khung overflow ẩn, hoặc text-overflow: ellipsis đặt trên
 *                 khung flex / grid – ở đó trình duyệt KHÔNG vẽ "…");
 *   placeholder – gợi ý trong ô nhập dài hơn ô (bị cắt giữa từ);
 *   select      – lựa chọn đang chọn của hộp chọn dài hơn hộp;
 *   token       – chuỗi mẫu chưa thay biến còn hiện ra: {bo}, {n}, %s, undefined, NaN, [object Object];
 *   overlap     – nút / ô nhập đè lên chữ (cùng khối cha, hoặc tràn sang khối khác);
 *   stale-sr    – vùng đọc màn hình (#sr-live) còn thông báo cũ của bàn cờ khi đang ở một trang;
 *   cover       – phần tử dính (sticky / fixed) che lên ô nhập / nút đang được cuộn tới (coverAt).
 * Chỉ xét phần tử đang hiện (có kích thước, không ẩn). scope: CSS selector giới hạn vùng soát (mặc định cả trang).
 */
'use strict';

/** Chạy trong trang. */
function auditInPage(scope) {
  const root = scope ? document.querySelector(scope) : document.body;
  const out = [];
  if (!root) return out;
  const vis = (el) => {
    if (!el.getClientRects().length) return false;
    for (let x = el; x; x = x.parentElement) {
      const s = getComputedStyle(x);
      if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) return false;
    }
    return true;
  };
  const label = (el) => {
    const id = el.id ? '#' + el.id : '';
    const cls = el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    return el.tagName.toLowerCase() + id + cls;
  };
  const cv = document.createElement('canvas').getContext('2d');
  const textW = (el, text) => { const s = getComputedStyle(el); cv.font = `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`; return cv.measureText(text).width; };
  // 1. Chữ bị cắt
  for (const el of root.querySelectorAll('*')) {
    if (['SCRIPT', 'STYLE', 'SVG', 'svg', 'INPUT', 'SELECT', 'TEXTAREA', 'OPTION', 'CANVAS', 'IMG'].includes(el.tagName)) continue;
    const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!ownText || el.closest('.sr-only')) continue; // .sr-only: cố ý ẩn cho trình đọc màn hình
    const s = getComputedStyle(el);
    const clipX = ['hidden', 'clip'].includes(s.overflowX);
    if (!clipX || el.scrollWidth <= el.clientWidth + 1 || !vis(el)) continue;
    const flexy = /flex|grid/.test(s.display);
    if (s.textOverflow !== 'ellipsis' || flexy) out.push({ kind: 'clip', el: label(el), text: el.textContent.trim().slice(0, 80), why: flexy ? 'ellipsis trên flex/grid' : 'không có …' });
  }
  // 2. Gợi ý ô nhập dài hơn ô
  for (const el of root.querySelectorAll('input[placeholder], textarea[placeholder]')) {
    if (!el.placeholder || el.value || !vis(el)) continue;
    const s = getComputedStyle(el);
    const inner = el.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight);
    if (el.tagName === 'INPUT' && textW(el, el.placeholder) > inner + 1) out.push({ kind: 'placeholder', el: label(el), text: el.placeholder });
  }
  // 3. Hộp chọn: lựa chọn đang chọn dài hơn hộp (trừ chỗ mũi tên ~24px)
  for (const el of root.querySelectorAll('select')) {
    if (!vis(el) || el.selectedIndex < 0) continue;
    const s = getComputedStyle(el), opt = el.options[el.selectedIndex];
    const inner = el.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight) - 20;
    if (opt && textW(el, opt.text) > inner + 1) out.push({ kind: 'select', el: label(el), text: opt.text });
  }
  // 4. Nút / ô nhập đè lên chữ cùng khối cha (vd. nút "Sửa đội hình" che chữ "0 cầu thủ")
  for (const c of root.querySelectorAll('button, input:not([type=checkbox]):not([type=radio]), select, a.btn')) {
    if (!vis(c) || !c.parentElement) continue;
    const r = c.getBoundingClientRect();
    for (const sib of c.parentElement.children) {
      // Bỏ qua: nút / ô cạnh nhau (thanh công cụ), huy hiệu đặt đè có chủ ý (position absolute / fixed), tiền tố dính liền ô nhập
      // trong nhóm ô có viền chung (.slug-pre "…/?o=" + ô link riêng; quy ước chung: class .addon)
      if (sib === c || sib.contains(c) || c.contains(sib) || !sib.textContent.trim() || !vis(sib) || sib.matches('button, input, select, a.btn, .addon, .slug-pre') || ['absolute', 'fixed'].includes(getComputedStyle(sib).position)) continue;
      const q = sib.getBoundingClientRect();
      const ov = Math.min(r.right, q.right) - Math.max(r.left, q.left), oh = Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top);
      // ov âm = khoảng hở ngang; dưới 3px coi như dính (viền nút chạm dấu thanh của chữ – "0 cầu thủ")
      if (ov > -3 && oh > 2) out.push({ kind: 'overlap', el: label(c), text: (c.textContent || c.value || '').trim().slice(0, 30) + ' ⟂ ' + sib.textContent.trim().slice(0, 40) });
    }
  }
  // 4b. Nút / ô nhập ở khối khác nằm đè lên chữ (vd. nút "Giải đấu" tràn khỏi cột 48px đè lên tên giải trên điện thoại):
  //     lấy vùng chữ thật (Range) của các phần tử có chữ dưới mỗi điểm giữa nút, phần tử đó không phải cha / con của nút
  for (const c of root.querySelectorAll('button, input:not([type=checkbox]):not([type=radio]), select, a.btn')) {
    if (!vis(c)) continue;
    const r = c.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue; // ngoài khung nhìn: elementsFromPoint không thấy
    // Nút nằm trong lớp nổi có chủ ý (thanh dưới cố định, thanh tab dính, huy hiệu absolute): nội dung cuộn bên dưới là bình thường
    let floating = false;
    for (let x = c; x && x !== document.body; x = x.parentElement) if (['absolute', 'fixed', 'sticky'].includes(getComputedStyle(x).position)) { floating = true; break; }
    if (floating) continue;
    const y = r.top + r.height / 2;
    for (const x of [r.left + 2, r.left + r.width / 2, r.right - 2]) {
      const stack = document.elementsFromPoint(x, y);
      const k = stack.findIndex((e) => e === c || c.contains(e));
      // Nút bị lớp khác che ở điểm này (vd. cuộn dưới tiêu đề dính): không phải nút đè chữ
      if (k < 0 || stack.slice(0, k).some((e) => !e.contains(c))) continue;
      for (const under of stack.slice(k + 1)) {
        if (under.contains(c) || under.closest('button, select, a.btn, input')) continue;
        for (const n of under.childNodes) {
          if (n.nodeType !== 3 || !n.textContent.trim()) continue;
          const rg = document.createRange(); rg.selectNodeContents(n);
          if ([...rg.getClientRects()].some((q) => x > q.left + 1 && x < q.right - 1 && y > q.top + 1 && y < q.bottom - 1)) {
            out.push({ kind: 'overlap', el: label(c), text: (c.textContent || c.value || '').trim().slice(0, 30) + ' đè lên ' + n.textContent.trim().slice(0, 40) });
          }
        }
      }
    }
  }
  // 5. Thông báo cũ của bàn cờ còn trong vùng đọc màn hình khi đang ở một trang (E2 / N5: "Lượt X (bạn)", "X thắng!")
  const sr = document.getElementById('sr-live');
  if (sr && sr.textContent.trim() && document.body.classList.contains('shell-on')) out.push({ kind: 'stale-sr', el: '#sr-live', text: sr.textContent.trim().slice(0, 80) });
  // 6. Chuỗi mẫu chưa thay biến
  const BAD = /\{[a-zA-Z_][a-zA-Z0-9_]*\}|%s|\bundefined\b|\bNaN\b|\[object Object\]/;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (BAD.test(n.textContent) && n.parentElement && vis(n.parentElement) && !n.parentElement.closest('textarea, code, pre')) out.push({ kind: 'token', el: label(n.parentElement), text: n.textContent.trim().slice(0, 80) });
  }
  for (const el of root.querySelectorAll('[placeholder], [title], [aria-label]')) {
    for (const a of ['placeholder', 'title', 'aria-label']) {
      const v = el.getAttribute(a);
      if (v && BAD.test(v) && vis(el)) out.push({ kind: 'token', el: label(el) + '@' + a, text: v.slice(0, 80) });
    }
  }
  return out;
}

/**
 * Phần tử dính / cố định che phần tử el (đang trong khung nhìn): trả { by, overlap } hoặc null. Dùng sau khi cuộn tới / tự cuộn.
 */
function coverInPage(sel) {
  const el = typeof sel === 'string' ? document.querySelector(sel) : sel;
  if (!el) return { missing: true };
  const r = el.getBoundingClientRect();
  for (const x of document.querySelectorAll('*')) {
    if (x === el || x.contains(el) || el.contains(x)) continue;
    const s = getComputedStyle(x);
    if (!['sticky', 'fixed'].includes(s.position) || s.visibility === 'hidden' || s.display === 'none') continue;
    if (x.closest('dialog') && !el.closest('dialog')) continue;
    const q = x.getBoundingClientRect();
    if (!q.width || !q.height) continue;
    const ov = Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top), oh = Math.min(r.right, q.right) - Math.max(r.left, q.left);
    if (ov > 2 && oh > 2) {
      // Phần tử dính vẽ dưới phần tử cần thấy thì không che (z-index / thứ tự trong cây)
      const top = document.elementFromPoint(Math.max(r.left, q.left) + oh / 2, Math.max(r.top, q.top) + ov / 2);
      if (top && (x === top || x.contains(top))) return { by: x.className || x.tagName, overlap: Math.round(ov) };
    }
  }
  return null;
}

const audit = (page, scope) => page.evaluate(auditInPage, scope || null);
const coverAt = (page, sel) => page.evaluate(coverInPage, sel);
module.exports = { audit, coverAt, auditInPage, coverInPage };
