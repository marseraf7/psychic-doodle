// Chuỗi giao diện: cài ứng dụng (pwa-install.js) – nút Cài ứng dụng, gợi ý iPhone / iPad, trình duyệt trong Zalo / Messenger (A4).
(function () {
  'use strict';
  const X = window.I18N.extend;
  X('vi', {
    inst_title: 'Cài ứng dụng',
    inst_desc: 'Mở nhanh từ màn hình chính, chơi được cả khi mất mạng',
    inst_btn: 'Cài đặt',
    inst_ios: 'Bấm nút Chia sẻ, rồi chọn "Thêm vào MH chính"',
    inst_inapp_title: 'Mở bằng trình duyệt',
    inst_inapp: 'Trình duyệt trong ứng dụng này không cài được. Bấm ⋯ ở góc trên, rồi chọn "Mở bằng trình duyệt"',
    inst_open: 'Mở trình duyệt',
    inst_copy: 'Sao chép link',
    inst_copied: 'Đã sao chép link. Hãy dán vào Chrome hoặc Safari',
    inst_done: 'Đã cài ứng dụng',
    inst_close: 'Ẩn thẻ cài ứng dụng',
  });
  X('en', {
    inst_title: 'Install app',
    inst_desc: 'Open it fast from your home screen and play even offline',
    inst_btn: 'Install',
    inst_ios: 'Tap the Share button, then choose "Add to Home Screen"',
    inst_inapp_title: 'Open in browser',
    inst_inapp: 'This in-app browser cannot install apps. Tap ⋯ at the top, then choose "Open in browser"',
    inst_open: 'Open browser',
    inst_copy: 'Copy link',
    inst_copied: 'Link copied. Paste it into Chrome or Safari',
    inst_done: 'App installed',
    inst_close: 'Hide the install card',
  });
  X('ru', {
    inst_title: 'Установить приложение',
    inst_desc: 'Быстрый запуск с главного экрана и игра без интернета',
    inst_btn: 'Установить',
    inst_ios: 'Нажмите «Поделиться», затем выберите «На экран „Домой“»',
    inst_inapp_title: 'Открыть в браузере',
    inst_inapp: 'Во встроенном браузере приложения установка недоступна. Нажмите ⋯ вверху и выберите «Открыть в браузере»',
    inst_open: 'Открыть браузер',
    inst_copy: 'Скопировать ссылку',
    inst_copied: 'Ссылка скопирована. Вставьте её в Chrome или Safari',
    inst_done: 'Приложение установлено',
    inst_close: 'Скрыть карточку установки',
  });
  X('zh', {
    inst_title: '安装应用',
    inst_desc: '从主屏幕快速打开，离线也能下棋',
    inst_btn: '安装',
    inst_ios: '点击“分享”按钮，然后选择“添加到主屏幕”',
    inst_inapp_title: '在浏览器中打开',
    inst_inapp: '此应用内置浏览器无法安装。请点击顶部的 ⋯，然后选择“在浏览器中打开”',
    inst_open: '打开浏览器',
    inst_copy: '复制链接',
    inst_copied: '链接已复制，请粘贴到 Chrome 或 Safari',
    inst_done: '应用已安装',
    inst_close: '隐藏安装卡片',
  });
})();
