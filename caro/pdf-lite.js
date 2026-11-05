/*
 * Bộ ghi PDF tối giản (không thư viện ngoài, dùng chung trình duyệt + Node để kiểm thử): mỗi trang là một ảnh JPEG phủ
 * kín khổ giấy. Trang được vẽ sẵn bằng canvas (otour-pdf.js) – chữ tiếng Việt / Trung / Nga hiện đúng như trên màn
 * hình mà không cần nhúng phông chữ vào PDF.
 *   jpegPdf(pages, { title, w, h }) → mảng Uint8Array (ghép thành Blob 'application/pdf')
 *     pages: [{ jpeg: Uint8Array, w, h }] – w, h: số điểm ảnh của ảnh; khổ giấy w × h point (mặc định A4 dọc).
 * Cấu trúc: 1 Catalog, 2 Pages, mỗi trang 3 đối tượng (Page, nội dung, ảnh), cuối cùng Info (tiêu đề UTF-16).
 */
(function (global) {
  'use strict';
  const A4 = [595.28, 841.89];
  const enc = (s) => {
    // Chỉ chữ ASCII trong phần khung PDF (tiêu đề đã đổi sang UTF-16 hex) – không cần TextEncoder
    const b = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff;
    return b;
  };
  /** Chuỗi PDF dạng hex UTF-16BE có BOM: <FEFF…> – đúng mọi ngôn ngữ. */
  const utf16 = (s) => '<FEFF' + [...String(s)].map((ch) => {
    const c = ch.codePointAt(0);
    if (c < 0x10000) return c.toString(16).padStart(4, '0');
    const v = c - 0x10000;
    return ((v >> 10) + 0xd800).toString(16) + ((v & 0x3ff) + 0xdc00).toString(16);
  }).join('').toUpperCase() + '>';

  function jpegPdf(pages, opts = {}) {
    const [W, H] = [opts.w || A4[0], opts.h || A4[1]];
    const parts = [];
    const offs = [];
    let len = 0;
    const push = (x) => { const b = typeof x === 'string' ? enc(x) : x; parts.push(b); len += b.length; };
    const obj = (n, body) => { offs[n] = len; push(`${n} 0 obj\n`); body(); push('\nendobj\n'); };
    push('%PDF-1.4\n');
    push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])); // dòng nhị phân: báo cho công cụ đây là file nhị phân
    const n = pages.length;
    const pageNo = (i) => 3 + 3 * i;
    const info = 3 + 3 * n;
    obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
    obj(2, () => push(`<< /Type /Pages /Count ${n} /Kids [${pages.map((p, i) => `${pageNo(i)} 0 R`).join(' ')}] >>`));
    const f = (x) => Number(x.toFixed(2));
    pages.forEach((p, i) => {
      const P = pageNo(i);
      obj(P, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(W)} ${f(H)}] /Resources << /XObject << /Im0 ${P + 2} 0 R >> >> /Contents ${P + 1} 0 R >>`));
      const cs = `q ${f(W)} 0 0 ${f(H)} 0 0 cm /Im0 Do Q`;
      obj(P + 1, () => push(`<< /Length ${cs.length} >>\nstream\n${cs}\nendstream`));
      obj(P + 2, () => {
        push(`<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`);
        push(p.jpeg);
        push('\nendstream');
      });
    });
    obj(info, () => push(`<< /Title ${utf16(opts.title || '')} /Producer (Caro x Gomoku) >>`));
    const xref = len;
    const size = info + 1;
    // Mỗi dòng xref đúng 20 byte: "0000000123 00000 n \n"
    push(`xref\n0 ${size}\n0000000000 65535 f \n` + offs.slice(1).map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join(''));
    push(`trailer\n<< /Size ${size} /Root 1 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    return parts;
  }

  const api = { jpegPdf, utf16, A4 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.CaroPdf = api;
})(typeof window !== 'undefined' ? window : globalThis);
