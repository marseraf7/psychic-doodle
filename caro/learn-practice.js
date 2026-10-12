/*
 * Nút "Luyện ngay" của phần Học: mỗi mục giải thích có một cách luyện tương ứng.
 *   Luật Việt Nam / tự do / tiêu chuẩn – ván mới với máy theo luật đó
 *   Renju, Nón lá                      – bài thực hành (learn.js)
 *   Swap2                              – mở Trang chủ, thẻ Phòng chờ, chọn sẵn khai cuộc Swap2 khi tạo phòng
 *   26 thế khai cuộc, Hoa / Phố Nguyệt – ván với máy theo luật Renju, bày sẵn 3 quân của một thế (bạn cầm X)
 *   VCF, VCT                           – giải đố theo chủ đề
 *   4 lối đánh                         – mở bảng chọn đối thủ (Ván mới)
 * learn.js hỏi has(id) để hiện nút và gọi run(id).
 */
(function () {
  'use strict';
  const T = window.I18N.t;
  const App = window.CaroApp;
  const N = window.CaroOnline;
  const D = window.CaroLearnDemos;
  const { X } = window.Caro;

  const toast = (msg) => N && N.toast(msg, 5000);
  /** Bày thế khai cuộc which ('direct' | 'indirect') số n (1…13), toạ độ quanh tâm (0, 0). */
  function playOpening(which, n) {
    const o = D.OPENINGS[which];
    const [x3, y3] = o.x3[n - 1];
    App.startPreset({ rule: 'renju', human: X, moves: [[0, 0], [o.o2[0] - 4, o.o2[1] - 4], [x3 - 4, y3 - 4]] });
    toast(T('pr_opening', { name: T('open_names_' + which).split('|')[n - 1] }));
  }
  const lesson = (id) => {
    const L = window.CaroLearn;
    const i = L.LESSONS.findIndex((x) => x.id === id);
    if (i >= 0) L.start(i);
  };
  const game = (rule) => { App.startPreset({ rule, human: X, moves: [] }); toast(T('pr_rule', { rule: T('grule_' + rule) })); };

  const ACTIONS = {
    vn: () => game('vn'),
    free: () => game('free'),
    std: () => game('std'),
    renju: () => lesson('renju43'),
    swap2: () => {
      window.CaroShell.open('home');
      if (window.CaroHome) window.CaroHome.pane('lobby');
      const sel = document.getElementById('room-opening');
      if (sel) { sel.value = 'swap2'; sel.dispatchEvent(new Event('change')); }
      toast(T('pr_swap2'));
    },
    open26: () => {
      const which = Math.random() < 0.5 ? 'direct' : 'indirect';
      playOpening(which, 1 + Math.floor(Math.random() * 13));
    },
    moon: () => (Math.random() < 0.5 ? playOpening('direct', 4) : playOpening('indirect', 7)),
    nonla: () => lesson('nonla'),
    vcf: () => window.CaroStudy.startMode('vcf'),
    vct: () => window.CaroStudy.startMode('vct'),
    styles: () => document.getElementById('btn-new').click(),
  };

  window.CaroLearnPractice = {
    has: (id) => !!ACTIONS[id],
    run: (id) => { if (ACTIONS[id]) ACTIONS[id](); },
    playOpening,
  };
})();
