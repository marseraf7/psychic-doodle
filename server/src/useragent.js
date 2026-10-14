/*
 * Đọc chuỗi User-Agent thành tên dễ hiểu cho mục Thiết bị (hub/devices.js): hệ điều hành, trình duyệt, đời máy (nếu có).
 * Chỉ cần đúng với các trình duyệt / hệ điều hành phổ biến; không nhận ra thì để trống (máy khách hiện "Thiết bị lạ").
 */
'use strict';

/** platform: 'web' | 'android' | 'ios' (app điện thoại tự báo khi kết nối). */
function parseUA(ua, platform) {
  ua = String(ua || '');
  let os = '', browser = '', model = '';
  let m;
  if ((m = /Android\s*([\d.]+)?(?:;\s*([^;)]+))?/.exec(ua))) {
    os = 'Android' + (m[1] ? ' ' + m[1].split('.')[0] : '');
    // Chrome mới giấu đời máy ("K"); Samsung Internet / app WebView cũ vẫn ghi (vd. "SM-S918B")
    const dev = (m[2] || '').replace(/\s*Build\/.*$/, '').trim();
    if (dev && dev !== 'K' && !/^(Linux|U|wv|Mobile)$/i.test(dev)) model = dev.slice(0, 40);
  } else if ((m = /(iPhone|iPad|iPod).*?OS (\d+)/.exec(ua))) {
    os = (m[1] === 'iPad' ? 'iPadOS ' : 'iOS ') + m[2];
    model = m[1];
  } else if (/Windows NT/.test(ua)) os = 'Windows';
  else if (/CrOS/.test(ua)) os = 'ChromeOS';
  else if (/Mac OS X|Macintosh/.test(ua)) os = 'macOS';
  else if (/Linux/.test(ua)) os = 'Linux';

  if (/EdgA?\/|EdgiOS\//.test(ua)) browser = 'Edge';
  else if (/OPR\/|Opera/.test(ua)) browser = 'Opera';
  else if (/SamsungBrowser\//.test(ua)) browser = 'Samsung Internet';
  else if (/coc_coc_browser|CocCoc/i.test(ua)) browser = 'Cốc Cốc';
  else if (/Firefox\/|FxiOS\//.test(ua)) browser = 'Firefox';
  else if (/CriOS\/|Chrome\//.test(ua)) browser = 'Chrome';
  else if (/Safari\//.test(ua)) browser = 'Safari';

  // App điện thoại (Capacitor): chạy trong WebView – tên trình duyệt không có ý nghĩa
  const app = platform === 'android' || platform === 'ios';
  if (app) {
    browser = '';
    if (!os) os = platform === 'ios' ? 'iOS' : 'Android';
  }
  const mobile = app || /Mobi|Android|iPhone|iPad|iPod/.test(ua);
  return { os, browser, model, app, mobile };
}

module.exports = { parseUA };
