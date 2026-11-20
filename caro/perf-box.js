/*
 * Ô số đo tải trang – chỉ hiện khi mở bằng ?perf=1 (đo trên máy thật, trong trình duyệt của Zalo / Messenger, nơi không
 * mở được công cụ dev). Hiện sau khi trang nạp xong: cách nạp mã (bản gộp của máy chủ hay từng file), TTFB, lần vẽ đầu
 * (FCP), DOMContentLoaded, Load, số file JS + dung lượng tải qua mạng, việc CPU dài nhất, service worker (đang điều khiển trang
 * không; trạng thái đăng ký none / installing / waiting / active, scope – A4), trình duyệt.
 * Hướng dẫn đo: docs/do-toc-do-tai-laplace-19-11-2026.md. Không gửi số đo đi đâu (chỉ hiện để người đo chép lại).
 * window.CaroPerfBox.read() – số đo dạng { key: giá trị } (dùng cho bài thử).
 */
(function () {
  'use strict';
  const T = (k, a) => window.I18N.t(k, a);
  let worst = 0, longOk = false;
  for (const type of ['long-animation-frame', 'longtask']) {
    try {
      new PerformanceObserver((l) => { for (const e of l.getEntries()) worst = Math.max(worst, e.duration); }).observe({ type, buffered: true });
      longOk = true;
      break;
    } catch (e) { /* trình duyệt không hỗ trợ loại này */ }
  }

  function read() {
    const n = performance.getEntriesByType('navigation')[0] || {};
    const fcp = performance.getEntriesByName('first-contentful-paint')[0];
    const js = performance.getEntriesByType('resource').filter((r) => r.initiatorType === 'script');
    return {
      bundle: !!window.CARO_PACKS,
      ttfb: Math.round(n.responseStart || 0), fcp: fcp ? Math.round(fcp.startTime) : 0,
      dcl: Math.round(n.domContentLoadedEventEnd || 0), load: Math.round(n.loadEventEnd || 0),
      jsFiles: js.length, jsKb: Math.round(js.reduce((a, r) => a + (r.transferSize || 0), 0) / 1024),
      longest: longOk ? Math.round(worst) : -1,
      sw: !!(navigator.serviceWorker && navigator.serviceWorker.controller),
      swReg: window.CaroSW ? window.CaroSW.status() : { state: 'off', controller: false, scope: '' }, // sw-boot.js
    };
  }

  function text(m) {
    const ms = (v) => (v > 0 ? v + ' ms' : '—');
    return [
      [T('perf_mode'), m.bundle ? T('perf_bundle') : T('perf_files')],
      ['TTFB', ms(m.ttfb)], [T('perf_fcp'), ms(m.fcp)], ['DOMContentLoaded', ms(m.dcl)], ['Load', ms(m.load)],
      [T('perf_js'), T('perf_js_v', { n: m.jsFiles, kb: m.jsKb })],
      [T('perf_long'), m.longest < 0 ? '—' : ms(m.longest)],
      [T('perf_sw'), m.sw ? T('perf_yes') : T('perf_no')],
      // Chẩn đoán service worker: trạng thái đăng ký, có điều khiển trang này không, phạm vi
      [T('perf_sw_reg'), [T('perf_sw_' + m.swReg.state), T('perf_sw_ctl', { v: m.swReg.controller ? T('perf_yes') : T('perf_no') }), m.swReg.scope ? T('perf_sw_scope', { s: m.swReg.scope }) : ''].filter(Boolean).join(' · ')],
      ['UA', navigator.userAgent],
    ].map(([k, v]) => k + ': ' + v).join('\n');
  }

  function show() {
    const box = document.createElement('div');
    box.className = 'perf-box';
    box.setAttribute('role', 'status');
    const pre = document.createElement('pre');
    pre.textContent = text(read());
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'ghost sm';
    copy.textContent = T('perf_copy');
    copy.onclick = () => {
      const pick = () => { const r = document.createRange(); r.selectNodeContents(pre); const s = getSelection(); s.removeAllRanges(); s.addRange(r); };
      // Trình duyệt trong app (Zalo, Messenger) hay chặn clipboard: chọn sẵn chữ để người đo tự sao chép
      if (navigator.clipboard) navigator.clipboard.writeText(pre.textContent).then(() => { copy.textContent = T('perf_copied'); }, pick);
      else pick();
    };
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'ghost sm';
    close.textContent = '✕';
    close.setAttribute('aria-label', T('perf_close'));
    close.onclick = () => box.remove();
    const bar = document.createElement('div');
    bar.className = 'perf-acts';
    bar.append(copy, close);
    box.append(pre, bar);
    document.body.appendChild(box);
  }

  window.CaroPerfBox = { read };
  if (/[?&]perf=1(&|$)/.test(location.search)) {
    const later = () => setTimeout(show, 1500); // chờ thêm cho FCP / việc CPU sau khi nạp được ghi lại
    if (document.readyState === 'complete') later(); else window.addEventListener('load', later, { once: true });
  }
})();
