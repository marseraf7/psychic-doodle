/* Máy tính nước đi trong luồng riêng để bàn cờ không bị khựng khi AI suy nghĩ lâu. */
importScripts('rules.js');
self.onmessage = (e) => {
  const { id, moves, p, level } = e.data;
  const b = new self.Caro.Board();
  for (const [x, y, q] of moves) b.play(x, y, q);
  self.postMessage({ id, move: self.Caro.chooseMove(b, p, level) });
};
