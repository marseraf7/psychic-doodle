// Bản vá cập nhật trang giải: áp bản vá vào bản trước phải ra đúng bản đầy đủ mới, ở mọi bước của giải.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { start } = require('../server.js');
const ST = require('../src/hub/stages.js');
const { viewParts, diffParts } = require('../src/hub/tourpush.js');
const TourPatch = require('../../caro/tour-patch.js');

let app;
test.before(() => { app = start({ port: 0, dataFile: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'caro-push-')), 'c.db') }); });
test.after(() => app.stop());

let seed = 11;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const net = (x) => JSON.parse(JSON.stringify(x)); // như gửi qua mạng

/** Giải giả (không cần kết nối): người chơi + giai đoạn đầu đã bốc thăm. */
function fakeTour(id, stages, n) {
  const uids = Array.from({ length: n }, (_, i) => 'u_' + id + i);
  const t = { id, name: id, format: 'bracket', status: 'running', creator: 'x', stages: ST.normalizeStages(stages), stage: 0, games: [],
    players: uids.map((u, i) => ({ uid: u, name: 'P' + i, rating: 1500 - i, seed: i + 1, score: 0, wins: 0, draws: 0, losses: 0, games: 0, streak: 0 })),
    access: 'public', maxPlayers: 512, timeLimit: 20, startsAt: Date.now(), created: Date.now(), seeding: 'rating' };
  app.hub.tours.set(id, t);
  t.st = [ST.buildStage(t.stages[0], 0, uids, { seedOf: app.hub.seedOf(t), isActive: () => true })];
  return t;
}

/** Đánh từng trận (có lúc nhiều trận một lần), sau mỗi bước so bản vá với bản đầy đủ. */
function checkWholeTournament(t) {
  let view = net(app.hub.tourShared(t));
  let parts = viewParts(app.hub.tourShared(t));
  let steps = 0, small = 0;
  while (t.status === 'running' && steps < 5000) {
    const st = app.hub.curStage(t);
    const ready = ST.playable(st);
    assert.ok(ready.length, 'giải bị kẹt');
    for (const m of ready.slice(0, 1 + Math.floor(rnd() * 3))) {
      if (rnd() < 0.3) m.room = 'R' + steps; // trận "đang đấu" (đổi trạng thái hiển thị)
      const draw = !ST.isElim(st.type) && rnd() < 0.2;
      m.wins = { [m.a]: draw ? 0 : 1, [m.b]: 0 };
      app.hub.finishMatch(t, st, m, draw ? null : m.a);
    }
    if (rnd() < 0.1) t.players[Math.floor(rnd() * t.players.length)].name += '*'; // đổi tên người chơi
    const shared = app.hub.tourShared(t);
    const next = viewParts(shared);
    const patch = net(diffParts(parts, next, shared));
    assert.ok(TourPatch.apply(view, patch));
    const want = net(shared);
    view.now = want.now;
    assert.deepStrictEqual(view, want, `bước ${steps}`);
    if (JSON.stringify(patch).length < JSON.stringify(want).length / 4) small++;
    parts = next;
    steps++;
  }
  assert.strictEqual(t.status, 'finished');
  return { steps, small };
}

for (const [name, stages, n] of [
  ['vòng bảng 3 bảng (2 lượt) -> loại trực tiếp có tranh hạng 3', [{ type: 'roundrobin', groups: 3, meetings: 2, advance: 2 }, { type: 'single', thirdPlace: true }], 11],
  ['Thụy Sĩ -> nhánh thắng-thua (có reset)', [{ type: 'swiss', rounds: 4, advance: 6 }, { type: 'double', reset: true }], 13],
  ['vòng bảng chia theo 4 người/bảng -> Thụy Sĩ -> loại trực tiếp', [{ type: 'roundrobin', groupSize: 4, advance: 2 }, { type: 'swiss', rounds: 3, advance: 4 }, { type: 'single' }], 16],
  ['nhánh thắng-thua 20 người', [{ type: 'double' }], 20],
]) {
  test('bản vá trang giải đúng ở mọi bước: ' + name, () => {
    const r = checkWholeTournament(fakeTour('t' + n, stages, n));
    assert.ok(r.small > r.steps / 2, `phần lớn bản vá phải nhỏ hơn nhiều so với bản đầy đủ (${r.small}/${r.steps})`);
  });
}
