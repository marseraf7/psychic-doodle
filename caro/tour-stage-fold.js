/*
 * Giải đấu – phần phụ của trình sửa giai đoạn (tour-stage-edit.js) cho form tạo giải Offline gọn hơn:
 *   - RARE / isDefault: ô ít dùng (bridge, đích đội bị loại, trận phụ, vào thẳng, King of the Hill…) đang để mặc định
 *     được chuyển vào khối "Tuỳ chọn nâng cao" thu gọn của giai đoạn;
 *   - open: các khối đang mở (theo số thứ tự giai đoạn), nhớ qua các lần vẽ lại;
 *   - summary(c): một dòng tóm tắt giá trị trong khối thu gọn;
 *   - short(nhãn): lựa chọn dài "A (giải thích)" → [A, giải thích] – hộp chọn không bị cắt ở màn hẹp.
 *   - shift(at, delta): thêm / bỏ giai đoạn thì dời số thứ tự các khối đang mở theo;
 *   K.stageFold = { RARE, isDefault, open, summary, short, shift }. Nạp sau tour.js, trước tour-stage-edit.js.
 */
(function () {
  'use strict';
  const K = window.CaroTourKit;
  if (!K) return;
  const { T } = K;
  const short = (l) => { const m = String(l).length > 30 && /^(.{4,}?)\s*[（(](.+)[)）]$/.exec(String(l)); return m ? [m[1], m[2]] : [l, '']; };

  // Ô ít dùng của giải offline (data-k của ô đầu tiên trong khối)
  const RARE = new Set(['bestNext', 'meetSmall', 'brBoards', 'exitLabel', 'tbm', 'direct', 'pick', 'mtgOn', 'repOn', 'region', 'danishLast', 'kothOn', 'podOn', 'cutOn', 'drawRec']);
  /** Ô đang ở giá trị mặc định: hộp đánh dấu chưa bật, số 0 / trống, chữ trống, hộp chọn đang ở lựa chọn đầu. */
  function isDefault(h) {
    if (/type="checkbox"/.test(h)) return !/\schecked[\s>]/.test(h);
    if (/<select/.test(h)) { const o = h.match(/<option[^>]*>/g) || []; return !o.slice(1).some((x) => /\sselected/.test(x)); }
    const v = (/<input[^>]*\svalue="([^"]*)"/.exec(h) || [])[1];
    return v == null || v === '' || v === '0';
  }
  // Khối "Tuỳ chọn nâng cao" đang mở (theo số thứ tự giai đoạn) – sự kiện toggle không nổi bọt nên nghe ở pha bắt
  const OPEN = new Set();
  if (typeof document !== 'undefined') document.addEventListener('toggle', (e) => {
    const d = e.target;
    if (d && d.classList && d.classList.contains('fold-more')) { if (d.open) OPEN.add(Number(d.dataset.si)); else OPEN.delete(Number(d.dataset.si)); }
  }, true);
  /** Một dòng tóm tắt giá trị đang đặt trong khối thu gọn: chung kết tổng, Bo bán kết / chung kết, cách ghép, chỉ số phụ. */
  function summary(c, { gfOf, tbsOf }) {
    const out = [];
    if (c.type === 'double') out.push(T('gf_' + gfOf(c)));
    if (c.boSemi) out.push(T('opt_bo_semi') + ' Bo' + c.boSemi);
    if (c.boFinal) out.push(T('opt_bo_final') + ' Bo' + c.boFinal);
    if (c.type === 'swiss') out.push(T('pair_' + (c.pairing || 'dutch')));
    if (c.type === 'roundrobin' && c.rankBy && c.rankBy !== 'points') out.push(T('rank_' + c.rankBy));
    if (c.points) out.push(tbsOf(c).slice(0, 3).map((x) => T('tb_' + x)).join(', '));
    return out.filter(Boolean).join(' · ');
  }

  /**
   * Thêm / bỏ giai đoạn (tour-stage-edit.js – click 'add' / 'del'): dời số thứ tự các khối đang mở theo – trước đây khối mở
   * của giai đoạn đã xoá "truyền" sang giai đoạn đứng sau nó. at: chỗ thêm / bỏ, delta: +1 (thêm) | -1 (bỏ).
   */
  function shift(at, delta) {
    const was = [...OPEN];
    OPEN.clear();
    for (const i of was) if (i < at) OPEN.add(i); else if (delta > 0) OPEN.add(i + delta); else if (i > at) OPEN.add(i + delta);
  }

  K.stageFold = { RARE, isDefault, open: OPEN, summary, short, shift };
})();
