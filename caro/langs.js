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
  // code: mã · name: tên tự gọi (ô chọn ngôn ngữ; ngôn ngữ mới lấy từ CLDR) · html: <html lang> / hreflang · intl: định dạng
  // ngày giờ, số (Intl) · google: nút đăng nhập Google · og: og:locale · fallback: ngôn ngữ dự phòng khi thiếu khoá
  // dir: chuỗi ở caro/i18n/<mã>/ (KHÔNG phải hướng chữ) · script: chữ viết ISO 15924 (Latn, Cyrl, Arab, Deva…)
  // rtl: viết từ phải sang trái → <html dir="rtl"> · font: phông theo chữ viết trong caro/lang-scripts.css (không có: phông chung)
  // status – mức tin cậy của bản dịch (docs/quy-trinh-them-ngon-ngu.md):
  //   'reviewed' – người dùng tiếng đó đã soát trong game;
  //   'mt-draft' – bản dịch máy / AI chưa có người bản xứ soát: ô chọn ngôn ngữ ghi nhãn "Bản dịch máy";
  //   'hidden'   – mới có khung hoặc đang dịch dở: KHÔNG có trong ô chọn, không tự nhận theo trình duyệt, không có trong
  //                hreflang / sitemap; vẫn mở được bằng ?lang=<mã> để người dịch xem thử.
  const LIST = [
    { code: 'vi', name: 'Tiếng Việt', html: 'vi', intl: 'vi-VN', google: 'vi', og: 'vi_VN', script: 'Latn', status: 'reviewed' },
    { code: 'en', name: 'English', html: 'en', intl: 'en-GB', google: 'en', og: 'en_US', script: 'Latn', status: 'reviewed' },
    { code: 'ru', name: 'Русский', html: 'ru', intl: 'ru-RU', google: 'ru', og: 'ru_RU', script: 'Cyrl', status: 'reviewed' },
    { code: 'zh', name: '简体中文', html: 'zh-CN', hreflang: 'zh-Hans', intl: 'zh-CN', google: 'zh_CN', og: 'zh_CN', script: 'Hans', status: 'reviewed' },
    { code: 'zh-Hant', name: '繁體中文', html: 'zh-Hant', intl: 'zh-TW', google: 'zh_TW', og: 'zh_TW', fallback: 'en', dir: true, script: 'Hant', status: 'mt-draft' },
    { code: 'ja', name: '日本語', html: 'ja', intl: 'ja-JP', google: 'ja', og: 'ja_JP', fallback: 'en', dir: true, script: 'Jpan', status: 'mt-draft' },
    { code: 'ko', name: '한국어', html: 'ko', intl: 'ko-KR', google: 'ko', og: 'ko_KR', fallback: 'en', dir: true, script: 'Kore', status: 'mt-draft' },
    { code: 'cs', name: 'Čeština', html: 'cs', intl: 'cs-CZ', google: 'cs', og: 'cs_CZ', fallback: 'en', dir: true, script: 'Latn', status: 'mt-draft' },
    { code: 'es', name: 'Español', html: 'es', intl: 'es-ES', google: 'es', og: 'es_ES', fallback: 'en', dir: true, script: 'Latn', status: 'hidden' },
    { code: 'pt', name: 'Português', html: 'pt', intl: 'pt-BR', google: 'pt', og: 'pt_BR', fallback: 'en', dir: true, script: 'Latn', status: 'hidden' },
    { code: 'fr', name: 'Français', html: 'fr', intl: 'fr-FR', google: 'fr', og: 'fr_FR', fallback: 'en', dir: true, script: 'Latn', status: 'hidden' },
    { code: 'de', name: 'Deutsch', html: 'de', intl: 'de-DE', google: 'de', og: 'de_DE', fallback: 'en', dir: true, script: 'Latn', status: 'hidden' },
    // @new-lang – server/scripts/new-lang.js chèn ngôn ngữ mới ngay trên dòng này (giữ nguyên dòng)
  ];
  for (const x of LIST) x.hreflang = x.hreflang || x.html;
  const CODES = LIST.map((x) => x.code);
  const BY = Object.fromEntries(LIST.map((x) => [x.code, x]));

  /**
   * Thẻ ngôn ngữ (navigator.languages, Accept-Language, hostContext.locale…) → mã của game, hoặc null.
   * zh-TW / zh-HK / zh-MO / zh-Hant* / yue → zh-Hant; zh / zh-CN / zh-SG / zh-Hans* → zh; ja-JP → ja; en_US → en.
   * codes: các mã được nhận (mặc định: ngôn ngữ đang hiện = SHOWN – không tự nhận ngôn ngữ 'hidden'; bài thử
   * server/test/i18n-langs.test.js bắt danh sách này khớp SHOWN). Viết không dùng biến ngoài: bản gộp chép nguyên hàm vào boot.js.
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

  /** Hướng chữ của ngôn ngữ l: 'rtl' | 'ltr'. */
  const dirOf = (l) => (BY[l] && BY[l].rtl ? 'rtl' : 'ltr');

  const api = {
    LIST, CODES, BY, fromTag, fromAccept, fallback, dirOf,
    /** Ngôn ngữ người dùng thấy (ô chọn, tự nhận theo trình duyệt, hreflang / sitemap): mọi ngôn ngữ trừ status 'hidden'. */
    SHOWN: LIST.filter((x) => x.status !== 'hidden').map((x) => x.code),
    /** Ngôn ngữ gốc (chuỗi trong caro/i18n*.js) và ngôn ngữ thư mục (caro/i18n/<mã>/). */
    INLINE: LIST.filter((x) => !x.dir).map((x) => x.code),
    DIR: LIST.filter((x) => x.dir).map((x) => x.code),
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CaroLangs = api;
})(typeof window !== 'undefined' ? window : globalThis);
