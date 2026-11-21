/* Chuỗi dịch của perf-box.js (ô số đo tải trang, mở bằng ?perf=1) – 4 ngôn ngữ. */
(function () {
  'use strict';
  const I = window.I18N;
  I.extend('vi', {
    perf_sw_reg: 'Đăng ký SW', perf_sw_none: 'chưa đăng ký', perf_sw_installing: 'đang cài', perf_sw_waiting: 'chờ kích hoạt', perf_sw_active: 'đang chạy', perf_sw_off: 'không dùng', perf_sw_ctl: 'điều khiển trang: {v}', perf_sw_scope: 'phạm vi {s}',
    perf_mode: 'Cách nạp mã', perf_bundle: 'Bản gộp', perf_files: 'Từng file', perf_fcp: 'Lần vẽ đầu (FCP)',
    perf_js: 'File JS', perf_js_v: '{n} file · {kb} KB qua mạng', perf_long: 'Việc CPU dài nhất', perf_sw: 'Service worker',
    perf_yes: 'Có', perf_no: 'Không', perf_copy: 'Sao chép', perf_copied: 'Đã sao chép', perf_close: 'Đóng ô số đo',
  });
  I.extend('en', {
    perf_sw_reg: 'SW registration', perf_sw_none: 'not registered', perf_sw_installing: 'installing', perf_sw_waiting: 'waiting', perf_sw_active: 'active', perf_sw_off: 'not used', perf_sw_ctl: 'controls page: {v}', perf_sw_scope: 'scope {s}',
    perf_mode: 'Script loading', perf_bundle: 'Bundled', perf_files: 'Separate files', perf_fcp: 'First paint (FCP)',
    perf_js: 'JS files', perf_js_v: '{n} files · {kb} KB over the network', perf_long: 'Longest CPU task', perf_sw: 'Service worker',
    perf_yes: 'Yes', perf_no: 'No', perf_copy: 'Copy', perf_copied: 'Copied', perf_close: 'Close the timing box',
  });
  I.extend('ru', {
    perf_sw_reg: 'Регистрация SW', perf_sw_none: 'не зарегистрирован', perf_sw_installing: 'устанавливается', perf_sw_waiting: 'ожидает', perf_sw_active: 'работает', perf_sw_off: 'не используется', perf_sw_ctl: 'управляет страницей: {v}', perf_sw_scope: 'область {s}',
    perf_mode: 'Загрузка кода', perf_bundle: 'Сборка', perf_files: 'Отдельные файлы', perf_fcp: 'Первая отрисовка (FCP)',
    perf_js: 'Файлы JS', perf_js_v: 'Файлов: {n} · {kb} КБ по сети', perf_long: 'Самая долгая задача ЦП', perf_sw: 'Service worker',
    perf_yes: 'Да', perf_no: 'Нет', perf_copy: 'Копировать', perf_copied: 'Скопировано', perf_close: 'Закрыть окно замеров',
  });
  I.extend('zh', {
    perf_sw_reg: 'SW 注册', perf_sw_none: '未注册', perf_sw_installing: '正在安装', perf_sw_waiting: '等待激活', perf_sw_active: '运行中', perf_sw_off: '未使用', perf_sw_ctl: '控制页面：{v}', perf_sw_scope: '范围 {s}',
    perf_mode: '代码加载方式', perf_bundle: '合并包', perf_files: '单独文件', perf_fcp: '首次绘制（FCP）',
    perf_js: 'JS 文件', perf_js_v: '{n} 个文件 · 网络传输 {kb} KB', perf_long: '最长 CPU 任务', perf_sw: 'Service worker',
    perf_yes: '是', perf_no: '否', perf_copy: '复制', perf_copied: '已复制', perf_close: '关闭测速框',
  });
})();
