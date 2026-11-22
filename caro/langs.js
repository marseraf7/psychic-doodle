/*
 * Danh sách ngôn ngữ giao diện – một chỗ duy nhất cho trình duyệt (i18n.js, ô chọn ngôn ngữ, định dạng ngày giờ) và máy chủ
 * (server/src/langs.js → bản gộp web-bundle.js, og-meta.js, seo.js hreflang, thư, widget MCP). Dạng UMD: window.CaroLangs
 * hoặc module.exports. Nạp ngay trước i18n.js ở mọi trang có i18n.js (index.html, embed.html, broadcast.html).
 *
 * Hai loại ngôn ngữ:
 *   – "gốc" (vi, en, ru, zh = giản thể): chuỗi nằm chung trong caro/i18n.js + caro/i18n-<chủ đề>.js (đủ 4 ngôn ngữ mỗi file).
 *   – "thư mục" (zh-Hant = phồn thể, ja, ko, cs – có `dir`): mỗi ngôn ngữ một thư mục caro/i18n/<mã>/, mỗi file một chủ
 *     đề, cùng tên với file gốc: i18n-<chủ đề>.js → i18n/<mã>/<chủ đề>.js; chuỗi lõi của i18n.js → i18n/<mã>/core.js.
 *     Khoá còn thiếu lấy theo `fallback` (tiếng Anh), rồi tiếng Việt. Quy trình: docs/van-phong-4-ngon-ngu.md.
 * Mã ngôn ngữ dùng đúng như nhau ở mọi nơi: caro.lang đã lưu, ?lang=, tên gói b/i18n-<mã>-<băm>.js, thư mục caro/i18n/<mã>/,
 * server/src/i18n/<mã>.js. Tiếng Trung phồn thể dùng mã BCP 47 "zh-Hant" (hreflang, <html lang>, Intl hiểu luôn).
 */
(function (root) {
  'use strict';
  // code: mã · name: tên tự gọi (ô chọn ngôn ngữ) · html: <html lang> / hreflang · intl: định dạng ngày giờ, số (Intl)
  // google: nút đăng nhập Google · og: og:locale · fallback: ngôn ngữ dự phòng khi thiếu khoá · dir: chuỗi ở caro/i18n/<mã>/
  const LIST = [
    { code: 'vi', name: 'Tiếng Việt', html: 'vi', intl: 'vi-VN', google: 'vi', og: 'vi_VN' },
    { code: 'en', name: 'English', html: 'en', intl: 'en-GB', google: 'en', og: 'en_US' },
    { code: 'ru', name: 'Русский', html: 'ru', intl: 'ru-RU', google: 'ru', og: 'ru_RU' },
    { code: 'zh', name: '简体中文', html: 'zh-CN', hreflang: 'zh-Hans', intl: 'zh-CN', google: 'zh_CN', og: 'zh_CN' },
    { code: 'zh-Hant', name: '繁體中文', html: 'zh-Hant', intl: 'zh-TW', google: 'zh_TW', og: 'zh_TW', fallback: 'en', dir: true },
    { code: 'ja', name: '日本語', html: 'ja', intl: 'ja-JP', google: 'ja', og: 'ja_JP', fallback: 'en', dir: true },
    { code: 'ko', name: '한국어', html: 'ko', intl: 'ko-KR', google: 'ko', og: 'ko_KR', fallback: 'en', dir: true },
    { code: 'cs', name: 'Čeština', html: 'cs', intl: 'cs-CZ', google: 'cs', og: 'cs_CZ', fallback: 'en', dir: true },
  ];
  for (const x of LIST) x.hreflang = x.hreflang || x.html;
  const CODES = LIST.map((x) => x.code);
  const BY = Object.fromEntries(LIST.map((x) => [x.code, x]));

  /**
   * Thẻ ngôn ngữ (navigator.languages, Accept-Language, hostContext.locale…) → mã của game, hoặc null.
   * zh-TW / zh-HK / zh-MO / zh-Hant* / yue → zh-Hant; zh / zh-CN / zh-SG / zh-Hans* → zh; ja-JP → ja; en_US → en.
   * codes: các mã đang có (mặc định: tất cả). Viết không dùng biến ngoài: bản gộp chép nguyên hàm này vào boot.js.
   */
  function fromTag(tag, codes) {
    const all = codes || ['vi', 'en', 'ru', 'zh', 'zh-Hant', 'ja', 'ko', 'cs'];
    const t = String(tag || '').trim().replace(/_/g, '-').toLowerCase();
    if (!t) return null;
    for (let i = 0; i < all.length; i++) if (all[i].toLowerCase() === t) return all[i];
    const parts = t.split('-');
    let code = parts[0];
    if (code === 'zh' || code === 'yue') {
      const sub = parts.slice(1);
      const hant = code === 'yue' || (sub.indexOf('hans') < 0 && (sub.indexOf('hant') >= 0 || sub.indexOf('tw') >= 0 || sub.indexOf('hk') >= 0 || sub.indexOf('mo') >= 0));
      code = hant && all.indexOf('zh-Hant') >= 0 ? 'zh-Hant' : 'zh'; // chưa có phồn thể: giản thể
    }
    return all.indexOf(code) >= 0 ? code : null;
  }

  /** Accept-Language → mã có trọng số q cao nhất (q=0 là không nhận; bằng nhau giữ cái viết trước), hoặc null. */
  function fromAccept(header, codes) {
    let best = null, bestQ = 0;
    for (const part of String(header || '').slice(0, 1000).split(',').slice(0, 30)) {
      const [tag, ...params] = part.split(';');
      const l = fromTag(tag, codes);
      const qp = params.map((x) => /^\s*q\s*=\s*([\d.]+)\s*$/i.exec(x)).find(Boolean);
      const w = qp ? Number(qp[1]) : 1;
      if (l && Number.isFinite(w) && w > bestQ) { best = l; bestQ = w; }
    }
    return best;
  }

  /** Ngôn ngữ dự phòng của l (thiếu khoá thì lấy chữ ở đây) – null với ngôn ngữ gốc. */
  const fallback = (l) => (BY[l] && BY[l].fallback) || null;

  const api = {
    LIST, CODES, BY, fromTag, fromAccept, fallback,
    /** Ngôn ngữ gốc (chuỗi trong caro/i18n*.js) và ngôn ngữ thư mục (caro/i18n/<mã>/). */
    INLINE: LIST.filter((x) => !x.dir).map((x) => x.code),
    DIR: LIST.filter((x) => x.dir).map((x) => x.code),
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CaroLangs = api;
})(typeof window !== 'undefined' ? window : globalThis);
