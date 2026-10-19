importScripts('rules.js', 'rules-ai.js', 'book-data.js', 'book.js', 'bots.js', 'policy-data.js', 'engine-patterns.js', 'engine-position.js', 'engine-renju.js', 'engine-eval.js', 'engine-moves.js', 'engine-search.js', 'engine-vct.js', 'engine.js', 'analysis.js');
self.onmessage = (e) => {
  const d = e.data;
  if (d.type === 'eval') {
    // Chấm một thế (phân tích ngầm lúc chơi – live-analysis.js, phân tích song song – an-pool.js): theo số nút, bảng nhớ
    // mới mỗi thế (analysis.js evaluate) nên Worker nào chấm, theo thứ tự nào cũng ra cùng kết quả
    self.postMessage({ id: d.id, ev: self.CaroAnalysis.evaluate(d.moves, d.ms, d.rule) });
    return;
  }
  if (d.type === 'safe') {
    // Lọc phòng thủ ở gốc như analyse (cùng quỹ số nút) – "Nước duy nhất" cho phân tích bằng Rapfi (rapfi-analysis.js)
    self.postMessage({ id: d.id, safe: self.CaroEngine.safeMoves(d.moves, self.CaroAnalysis.evalOpts(d.ms, d.rule)) });
    return;
  }
  if (d.type === 'analyze') {
    let last = 0;
    const res = self.CaroAnalysis.analyzeGame(d.moves, {
      rule: d.rule, ms: d.ms, evals: d.evals,
      onProgress: (n, total) => { const now = Date.now(); if (now - last > 120) { last = now; self.postMessage({ id: d.id, progress: n / total }); } },
    });
    self.postMessage({ id: d.id, result: res });
    return;
  }
  const b = new self.Caro.Board(d.rule);
  for (const [x, y, q] of d.moves) b.play(x, y, q);
  const move = d.bot ? self.CaroBots.botMove(b, d.p, d.bot) : self.Caro.chooseMove(b, d.p, d.level);
  self.postMessage({ id: d.id, move });
};
