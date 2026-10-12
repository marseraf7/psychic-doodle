importScripts('rules.js', 'book-data.js', 'book.js', 'bots.js', 'engine.js', 'analysis.js');
// Phân tích ngầm lúc chơi (live-analysis.js): giữ bảng nhớ của engine suốt ván để thế sau chấm nhanh hơn
let live = { gid: null, shared: null };
self.onmessage = (e) => {
  const d = e.data;
  if (d.type === 'eval') {
    if (live.gid !== d.gid) live = { gid: d.gid, shared: { tt: new Map(), qtt: new Map(), vtt: new Map(), rule: d.rule } };
    live.shared.ms = d.ms;
    live.shared.strict = d.ms < 60; // lượt phân tích nhanh: xem giờ chặt (engine.js)
    const r = self.CaroEngine.analyse(d.moves, live.shared);
    self.postMessage({ id: d.id, ev: self.CaroAnalysis.slim(r, d.ms) });
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
