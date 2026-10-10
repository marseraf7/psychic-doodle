importScripts('rules.js', 'bots.js', 'analysis.js');
self.onmessage = (e) => {
  const d = e.data;
  if (d.type === 'analyze') {
    let last = 0;
    const res = self.CaroAnalysis.analyzeGame(d.moves, {
      onProgress: (n, total) => { const now = Date.now(); if (now - last > 120) { last = now; self.postMessage({ id: d.id, progress: n / total }); } },
    });
    self.postMessage({ id: d.id, result: res });
    return;
  }
  const b = new self.Caro.Board();
  for (const [x, y, q] of d.moves) b.play(x, y, q);
  const move = d.bot ? self.CaroBots.botMove(b, d.p, d.bot) : self.Caro.chooseMove(b, d.p, d.level);
  self.postMessage({ id: d.id, move });
};
