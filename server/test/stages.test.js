// Kiểm thử các thể thức thi đấu (không cần máy chủ): mô phỏng cả giải với kết quả ngẫu nhiên.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const S = require('../src/hub/stages.js');

const players = (n) => Array.from({ length: n }, (_, i) => 'p' + (i + 1));
const seedOf = (u) => Number(u.slice(1));
/** Chơi hết vòng: kết quả do hàm pick quyết định (mặc định: hạt giống cao hơn thắng). */
function playOut(st, pick = (m) => (seedOf(m.a) < seedOf(m.b) ? m.a : m.b)) {
  for (let guard = 0; guard < 10000 && !st.done; guard++) {
    const ready = S.playable(st);
    if (!ready.length) throw new Error('kẹt: không còn trận nào đấu được nhưng vòng chưa xong');
    for (const m of ready) {
      const w = pick(m);
      m.wins = { [m.a]: w === m.a ? 1 : 0, [m.b]: w === m.b ? 1 : 0 };
      S.recordResult(st, m, w, { seedOf });
    }
  }
  return st;
}
let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

test('chuẩn hoá cấu hình: vòng trước chỉ được vòng tròn / Thụy Sĩ, giới hạn giá trị', () => {
  const st = S.normalizeStages([{ type: 'single' }, { type: 'double', bestOf: 7 }]);
  assert.strictEqual(st[0].type, 'roundrobin');
  assert.strictEqual(st[1].type, 'double');
  assert.strictEqual(st[1].bestOf, 3);
  assert.strictEqual(S.normalizeStages([{ type: 'swiss', rounds: 99 }])[0].rounds, 15);
  assert.strictEqual(S.normalizeStages(null)[0].type, 'single');
  assert.strictEqual(S.normalizeStages([1, 2, 3, 4, 5]).length, 3);
});

test('loại trực tiếp: mọi số người 2..33, có miễn đấu, tranh hạng 3, hạt giống 1 vô địch', () => {
  for (let n = 2; n <= 33; n++) {
    const cfg = S.normalizeStages([{ type: 'single', thirdPlace: true }])[0];
    const st = playOut(S.buildStage(cfg, 0, players(n)));
    const pod = S.podium(st, seedOf);
    assert.strictEqual(pod[0], 'p1', 'n=' + n);
    if (n >= 2) assert.strictEqual(pod[1], 'p2', 'n=' + n);
    if (n >= 4) assert.strictEqual(pod[2], 'p3', 'n=' + n);
    // Mỗi người thua tối đa 1 trận không phải tranh hạng 3
    for (const u of players(n)) {
      const losses = Object.values(st.matches).filter((m) => m.loser === u && !m.third).length;
      assert.ok(losses <= 1);
    }
  }
});

test('nhánh thắng-thua: mọi số người 2..33, thua 2 lần mới bị loại, có / không reset chung kết', () => {
  for (const reset of [true, false]) {
    for (let n = 2; n <= 33; n++) {
      const cfg = S.normalizeStages([{ type: 'double', reset }])[0];
      const st = playOut(S.buildStage(cfg, 0, players(n)), (m) => (rnd() < 0.5 ? m.a : m.b));
      const pod = S.podium(st, seedOf);
      assert.ok(pod.length >= Math.min(n, 3) - (n === 2 ? 1 : 0), `n=${n} podium ${pod}`);
      for (const u of players(n)) {
        const losses = Object.values(st.matches).filter((m) => m.done && m.loser === u).length;
        if (u === pod[0]) assert.ok(losses <= 1, `vô địch thua tối đa 1 trận (n=${n})`);
        else assert.ok(losses >= 1 && losses <= 2, `${u} thua ${losses} trận (n=${n})`);
        // Ai không vô địch và không phải á quân của trận reset thì bị loại đúng sau 2 trận thua
        if (u !== pod[0] && losses === 1) {
          const lostInGf = Object.values(st.matches).some((m) => m.gf && m.loser === u);
          assert.ok(lostInGf, `${u} chỉ thua 1 trận mà không phải ở chung kết (n=${n})`);
        }
      }
    }
  }
});

test('nhánh thắng-thua 8 người: người thắng nhánh thua thắng chung kết 1 thì có trận reset', () => {
  const cfg = S.normalizeStages([{ type: 'double', reset: true }])[0];
  const st = S.buildStage(cfg, 0, players(8));
  // Hạt giống cao thắng mọi trận, trừ chung kết tổng: người từ nhánh thua thắng trận 1, thua trận reset
  playOut(st, (m) => (m.gf === 1 ? m.b : seedOf(m.a) < seedOf(m.b) ? m.a : m.b));
  const [g1, g2] = st.gf.map((id) => st.matches[id]);
  assert.ok(!g2.skipped && g2.done);
  assert.strictEqual(g1.a, 'p1');
  assert.strictEqual(g1.b, 'p2');
  assert.deepStrictEqual(S.podium(st, seedOf).slice(0, 2), ['p1', 'p2']);
});

test('vòng tròn: chia bảng kiểu rắn, mỗi cặp trong bảng gặp nhau đúng 1 (hoặc 2) lần, tính điểm 3/1/0', () => {
  for (const meetings of [1, 2]) {
    const cfg = S.normalizeStages([{ type: 'roundrobin', groups: 2, meetings, points: { w: 3, d: 1, l: 0 } }])[0];
    const st = S.buildStage(cfg, 0, players(7));
    assert.deepStrictEqual(st.groups.map((g) => g.players), [['p1', 'p4', 'p5'], ['p2', 'p3', 'p6', 'p7']]);
    for (const g of st.groups) {
      for (let i = 0; i < g.players.length; i++) {
        for (let j = i + 1; j < g.players.length; j++) {
          const x = g.players[i], y = g.players[j];
          const n = Object.values(st.matches).filter((m) => (m.a === x && m.b === y) || (m.a === y && m.b === x)).length;
          assert.strictEqual(n, meetings);
        }
      }
    }
    // Một người không đấu 2 trận cùng lúc: trận vòng sau chỉ mở khi đã xong vòng trước
    const first = S.playable(st);
    const busy = first.flatMap((m) => [m.a, m.b]);
    assert.strictEqual(new Set(busy).size, busy.length);
    playOut(st, (m) => (m.a === 'p3' && m.b === 'p6' ? null : seedOf(m.a) < seedOf(m.b) ? m.a : m.b));
    const tables = S.standings(st, seedOf);
    assert.deepStrictEqual(tables[1].list, ['p2', 'p3', 'p6', 'p7']);
    const p3 = tables[1].stats.p3;
    assert.strictEqual(p3.pts, meetings === 1 ? 3 + 1 : 6 + 1 + 3); // thắng p7, hoà p6 (lượt đi), thua p2
  }
});

test('vòng tròn: bằng điểm thì xét đối đầu', () => {
  const cfg = S.normalizeStages([{ type: 'roundrobin', groups: 1 }])[0];
  const st = S.buildStage(cfg, 0, players(3));
  // Vòng tròn 3 người: ai cũng thắng 1 thua 1 -> bằng điểm 3 người -> xét hiệu số ván rồi hạt giống
  playOut(st, (m) => {
    const pair = [m.a, m.b].sort().join();
    return { 'p1,p2': 'p1', 'p2,p3': 'p2', 'p1,p3': 'p3' }[pair];
  });
  assert.deepStrictEqual(S.standings(st, seedOf)[0].list, ['p1', 'p2', 'p3']);
  // 2 người bằng điểm: người thắng đối đầu xếp trên dù hạt giống thấp hơn
  const st2 = S.buildStage(cfg, 0, players(4));
  playOut(st2, (m) => {
    const pair = [m.a, m.b].sort().join();
    return { 'p1,p2': 'p2', 'p1,p3': 'p1', 'p1,p4': 'p1', 'p2,p3': 'p3', 'p2,p4': 'p2', 'p3,p4': 'p4' }[pair];
  });
  const list = S.standings(st2, seedOf)[0].list;
  assert.strictEqual(list[0], 'p2', 'p1 và p2 cùng 2 thắng, p2 thắng đối đầu');
});

test('Thụy Sĩ: không gặp lại, miễn đấu cho người thấp nhất chưa được miễn, đủ số vòng', () => {
  for (const n of [4, 5, 8, 9, 16, 21]) {
    const cfg = S.normalizeStages([{ type: 'swiss', rounds: 5, points: { w: 1, d: 0, l: 0 } }])[0];
    const st = S.buildStage(cfg, 0, players(n), { seedOf });
    playOut(st, (m) => (rnd() < 0.15 ? null : rnd() < 0.5 ? m.a : m.b));
    const expRounds = Math.min(5, S.swissMaxRounds(n));
    assert.strictEqual(st.rounds.length, expRounds, 'n=' + n);
    const seen = new Set();
    for (const m of Object.values(st.matches)) {
      if (m.bye) continue;
      const k = [m.a, m.b].sort().join();
      assert.ok(!seen.has(k), `gặp lại ${k} (n=${n})`);
      seen.add(k);
    }
    const byes = Object.values(st.matches).filter((m) => m.bye).map((m) => m.winner);
    assert.strictEqual(new Set(byes).size, byes.length, 'không ai được miễn đấu 2 lần');
    const tab = S.standings(st, seedOf)[0];
    assert.strictEqual(tab.list.length, n);
    for (let i = 1; i < tab.list.length; i++) assert.ok(tab.stats[tab.list[i - 1]].pts >= tab.stats[tab.list[i]].pts);
  }
});

test('nhiều vòng: vòng bảng (2 bảng, nhất nhì đi tiếp) -> playoff, nhất bảng gặp nhì bảng kia', () => {
  const [g, po] = S.normalizeStages([{ type: 'roundrobin', groups: 2, advance: 2 }, { type: 'single', thirdPlace: false }]);
  const st = playOut(S.buildStage(g, 0, players(8)));
  const adv = S.advancers(st, seedOf);
  assert.deepStrictEqual(adv.seeds, ['p1', 'p2', 'p3', 'p4']);
  const playoff = S.buildStage(po, 1, adv.seeds, { groupOf: adv.groupOf });
  const semis = playoff.rounds[0].map((id) => playoff.matches[id]);
  for (const m of semis) assert.notStrictEqual(adv.groupOf[m.a], adv.groupOf[m.b], 'không gặp người cùng bảng ở bán kết');
  playOut(playoff);
  assert.strictEqual(S.podium(playoff, seedOf)[0], 'p1');
});

test('nhiều vòng: Thụy Sĩ (top 4) -> nhánh thắng-thua', () => {
  const [sw, de] = S.normalizeStages([{ type: 'swiss', rounds: 3, advance: 4 }, { type: 'double' }]);
  const st = playOut(S.buildStage(sw, 0, players(10), { seedOf }));
  const adv = S.advancers(st, seedOf);
  assert.strictEqual(adv.seeds.length, 4);
  const d = playOut(S.buildStage(de, 1, adv.seeds));
  assert.strictEqual(S.podium(d, seedOf).length, 3);
});

test('vắng cả hai (vòng tròn): cả hai đều thua, không ai được điểm', () => {
  const cfg = S.normalizeStages([{ type: 'roundrobin' }])[0];
  const st = S.buildStage(cfg, 0, players(2));
  const m = S.playable(st)[0];
  S.recordResult(st, m, null, { double: true });
  const tab = S.standings(st, seedOf)[0];
  assert.strictEqual(tab.stats.p1.pts, 0);
  assert.strictEqual(tab.stats.p1.l, 1);
  assert.ok(st.done);
});

test('Thụy Sĩ: số vòng giới hạn theo số người, không ai gặp lại (mô phỏng 3..24 người, có hoà)', () => {
  for (let n = 3; n <= 24; n++) {
    const max = n <= 4 ? (n % 2 ? n : n - 1) : Math.ceil(n / 2);
    assert.strictEqual(S.swissMaxRounds(n), max);
    for (let k = 0; k < 40; k++) {
      const cfg = S.normalizeStages([{ type: 'swiss', rounds: 15 }])[0];
      const st = playOut(S.buildStage(cfg, 0, players(n), { seedOf }), (m) => (rnd() < 0.25 ? null : rnd() < 0.5 ? m.a : m.b));
      assert.strictEqual(st.rounds.length, Math.min(15, max), 'n=' + n);
      const seen = new Set();
      for (const m of Object.values(st.matches)) {
        if (m.bye) continue;
        const key = [m.a, m.b].sort().join();
        assert.ok(!seen.has(key), `gặp lại ${key} (n=${n})`);
        seen.add(key);
      }
    }
  }
});

test('Thụy Sĩ: buộc phải gặp lại thì chọn cách ghép ít cặp gặp lại nhất', () => {
  // 4 người, p1-p2 và p3-p4 đã gặp nhau, p1-p3 cũng đã gặp: còn p1-p4 / p2-p3 không ai gặp lại
  const played = new Set(['p1|p2', 'p3|p4', 'p1|p3']);
  assert.deepStrictEqual(S.swissPairs(['p1', 'p2', 'p3', 'p4'], played, {}).pairs, [['p1', 'p4'], ['p2', 'p3']]);
  // Mọi cặp đều đã gặp: vẫn ghép đủ người
  const all = new Set(['p1|p2', 'p1|p3', 'p1|p4', 'p2|p3', 'p2|p4', 'p3|p4']);
  assert.strictEqual(S.swissPairs(['p1', 'p2', 'p3', 'p4'], all, {}).pairs.length, 2);
});

test('vòng bảng: chia theo số người mỗi bảng (như Challonge), không bảng nào quá 16 người', () => {
  const sizes = (cfg, n) => S.buildStage(S.normalizeStages([cfg])[0], 0, players(n)).groups.map((g) => g.players.length);
  assert.deepStrictEqual(sizes({ type: 'roundrobin', groupSize: 4 }, 10), [3, 3, 4]); // chia kiểu rắn: người dư vào bảng cuối
  assert.deepStrictEqual(sizes({ type: 'roundrobin', groupSize: 4 }, 16), [4, 4, 4, 4]);
  assert.deepStrictEqual(sizes({ type: 'roundrobin', groupSize: 99 }, 20), [10, 10], 'tối đa 16 người/bảng');
  assert.deepStrictEqual(sizes({ type: 'roundrobin', groups: 1 }, 40), [13, 13, 14], '1 bảng 40 người -> tự chia 3 bảng');
  assert.ok(sizes({ type: 'roundrobin', groups: 1 }, 128).every((x) => x <= 16));
  const cfg = S.normalizeStages([{ type: 'roundrobin', groupSize: 3 }])[0];
  assert.strictEqual(cfg.groupSize, 3);
  assert.strictEqual(cfg.groups, undefined);
  // 30 bảng: tên A..Z rồi AA, AB…
  const many = S.buildStage(S.normalizeStages([{ type: 'roundrobin', groups: 30 }])[0], 0, players(60));
  assert.deepStrictEqual(many.groups.slice(24, 28).map((g) => g.name), ['Y', 'Z', 'AA', 'AB']);
});

test('vòng bảng: ban tổ chức tự xếp bảng; người mới vào bảng ít người nhất; bảng 1 người được gộp', () => {
  const cfg = S.normalizeStages([{ type: 'roundrobin', groups: 2 }])[0];
  // p9 không còn trong giải -> bảng C trống; p6, p7 chưa được xếp -> lần lượt vào bảng ít người nhất
  const plan = [['p1', 'p2', 'p3'], ['p4', 'p5'], ['p9']];
  const st = S.buildStage(cfg, 0, players(7), { groups: plan });
  assert.deepStrictEqual(st.groups.map((g) => g.players), [['p1', 'p2', 'p3'], ['p4', 'p5'], ['p6', 'p7']]);
  playOut(st);
  assert.ok(st.done);
  // Bảng chỉ còn 1 người -> dồn sang bảng khác
  const st2 = S.buildStage(cfg, 0, players(5), { groups: [['p1', 'p2', 'p3', 'p4'], ['p5']] });
  assert.deepStrictEqual(st2.groups.map((g) => g.players), [['p1', 'p2', 'p3', 'p4', 'p5']]);
  // Không có kế hoạch: chia kiểu rắn như cũ
  assert.deepStrictEqual(S.drawGroups(cfg, players(4)), [['p1', 'p4'], ['p2', 'p3']]);
});

test('vòng tròn: danh sách trận đấu được (cách tính nhanh) khớp định nghĩa gốc ở mọi thời điểm', () => {
  // Định nghĩa gốc: trận đấu được khi cả hai không còn trận nào chưa xong ở vòng sớm hơn trong bảng
  const slow = (st) => Object.values(st.matches).filter((m) => !m.done && S.real(m.a) && S.real(m.b) &&
    !Object.values(st.matches).some((x) => !x.done && x.round < m.round && x.group === m.group &&
      (x.a === m.a || x.b === m.a || x.a === m.b || x.b === m.b))).map((m) => m.id).sort();
  for (const [n, groups, meetings] of [[7, 1, 1], [9, 2, 2], [16, 3, 1]]) {
    const st = S.buildStage(S.normalizeStages([{ type: 'roundrobin', groups, meetings }])[0], 0, players(n));
    while (!st.done) {
      assert.deepStrictEqual(S.playable(st).map((m) => m.id).sort(), slow(st));
      const ready = S.playable(st);
      const m = ready[Math.floor(rnd() * ready.length)]; // xong từng trận một, thứ tự ngẫu nhiên
      S.recordResult(st, m, rnd() < 0.3 ? null : m.a, { seedOf });
    }
  }
});

// ------------------------------------------------------------ Đợt 2: tuỳ chọn như Challonge
const ranksOf = (st) => {
  // Hạng đầy đủ từ trận xếp hạng: chung kết của nhánh base → người thắng hạng base, người thua base + 1
  const out = {};
  const fin = (base, id) => { const m = st.matches[id]; if (S.real(m.winner)) out[base] = m.winner; if (S.real(m.loser)) out[base + 1] = m.loser; };
  const R = st.rounds.length;
  fin(1, st.rounds[R - 1][0]);
  if (st.third) fin(3, st.third);
  for (const p of st.places || []) fin(p.base, p.rounds[p.rounds.length - 1][0]);
  return out;
};

test('loại trực tiếp có trận xếp hạng: 8 / 16 người xếp đủ mọi hạng đúng hạt giống, mỗi người đấu log₂ n trận', () => {
  for (const n of [8, 16]) {
    const cfg = S.normalizeStages([{ type: 'single', placement: true }])[0];
    assert.strictEqual(cfg.thirdPlace, true, 'có trận xếp hạng thì luôn có tranh hạng ba');
    const st = playOut(S.buildStage(cfg, 0, players(n)));
    const r = ranksOf(st);
    for (let k = 1; k <= n; k++) assert.strictEqual(r[k], 'p' + k, `n=${n} hạng ${k}`);
    for (const u of players(n)) {
      const played = Object.values(st.matches).filter((m) => m.done && (m.a === u || m.b === u) && S.real(m.a) && S.real(m.b)).length;
      assert.strictEqual(played, Math.log2(n), `n=${n} ${u} đấu ${played} trận`);
    }
    assert.deepStrictEqual(S.podium(st, seedOf), ['p1', 'p2', 'p3']);
  }
  // Số người lẻ (có miễn đấu): chơi hết, không kẹt, bục trao giải đúng
  for (let n = 3; n <= 33; n++) {
    const st = playOut(S.buildStage(S.normalizeStages([{ type: 'single', placement: true }])[0], 0, players(n)), (m) => (rnd() < 0.5 ? m.a : m.b));
    assert.ok(st.done, 'n=' + n);
    assert.strictEqual(S.podium(st, seedOf).length, 3, 'n=' + n);
  }
});

test('nhánh thắng – thua không có chung kết tổng: vô địch nhánh thắng nhất, vô địch nhánh thua nhì', () => {
  for (let n = 3; n <= 33; n++) {
    const cfg = S.normalizeStages([{ type: 'double', gf: 'none' }])[0];
    assert.strictEqual(cfg.reset, false);
    const st = playOut(S.buildStage(cfg, 0, players(n)));
    assert.strictEqual(st.gf.length, 0);
    assert.deepStrictEqual(S.podium(st, seedOf), ['p1', 'p2', 'p3'], 'n=' + n);
    const r = playOut(S.buildStage(cfg, 0, players(n)), (m) => (rnd() < 0.5 ? m.a : m.b));
    const champ = S.podium(r, seedOf)[0];
    assert.strictEqual(Object.values(r.matches).filter((m) => m.done && m.loser === champ).length, 0, 'vô địch chưa thua trận nào');
  }
});

test('nhánh thắng – thua split: nửa dưới hạt giống bắt đầu ở nhánh thua, thua 1 trận nữa là bị loại', () => {
  for (let n = 4; n <= 33; n++) {
    const cfg = S.normalizeStages([{ type: 'double', split: true, gf: '1' }])[0];
    const st = playOut(S.buildStage(cfg, 0, players(n)), (m) => (rnd() < 0.5 ? m.a : m.b));
    const size = 2 ** Math.ceil(Math.log2(n));
    const split = Object.values(st.matches).filter((m) => m.split);
    assert.strictEqual(split.length, n - size / 2, 'n=' + n);
    for (const m of split) assert.ok(seedOf(m.winner) <= size / 2 && seedOf(m.loser) > size / 2, 'hạt giống cao đi tiếp');
    for (const u of players(n)) {
      const real = Object.values(st.matches).filter((m) => m.done && m.loser === u && !m.split).length;
      const startsLow = split.some((m) => m.loser === u);
      assert.ok(real + (startsLow ? 1 : 0) <= 2, `n=${n} ${u} thua quá 2 lần`);
    }
    assert.ok(st.done && S.podium(st, seedOf).length === 3);
  }
});

test('Bo riêng bán kết / chung kết', () => {
  const st = S.buildStage(S.normalizeStages([{ type: 'single', bestOf: 1, boSemi: 3, boFinal: 5, thirdPlace: true }])[0], 0, players(8));
  const R = st.rounds.length;
  assert.strictEqual(S.boOf(st, st.matches[st.rounds[0][0]]), 1);
  assert.strictEqual(S.boOf(st, st.matches[st.rounds[R - 2][0]]), 3);
  assert.strictEqual(S.boOf(st, st.matches[st.rounds[R - 1][0]]), 5);
  assert.strictEqual(S.boOf(st, st.matches[st.third]), 1, 'tranh hạng ba theo Bo cả giai đoạn');
  const d = S.buildStage(S.normalizeStages([{ type: 'double', bestOf: 1, boSemi: 3, boFinal: 5 }])[0], 0, players(8));
  assert.strictEqual(S.boOf(d, d.matches[d.gf[0]]), 5);
  assert.strictEqual(S.boOf(d, d.matches[d.rounds[d.rounds.length - 1][0]]), 3, 'chung kết nhánh thắng');
  assert.strictEqual(S.boOf(d, d.matches[d.lrounds[d.lrounds.length - 1][0]]), 3, 'chung kết nhánh thua');
  assert.strictEqual(S.boOf(d, d.matches[d.lrounds[0][0]]), 1);
  // Không có chung kết tổng: chung kết nhánh thắng quyết định vô địch nên dùng Bo chung kết
  const n = S.buildStage(S.normalizeStages([{ type: 'double', bestOf: 1, boSemi: 3, boFinal: 5, gf: 'none' }])[0], 0, players(8));
  assert.strictEqual(S.boOf(n, n.matches[n.rounds[n.rounds.length - 1][0]]), 5);
  assert.strictEqual(S.boOf(n, n.matches[n.lrounds[n.lrounds.length - 1][0]]), 3);
  // Bản cũ chỉ có reset: false → chung kết tổng 1 trận
  assert.strictEqual(S.normalizeStages([{ type: 'double', reset: false }])[0].gf, '1');
});

/** Vòng tròn 1 bảng với kết quả cho trước: [[a, b, thắng (null = hoà), số ván a, số ván b], …]. */
function rrWith(n, results, cfg = {}) {
  const st = S.buildStage(S.normalizeStages([{ type: 'roundrobin', groups: 1, ...cfg }])[0], 0, players(n));
  for (const [a, b, w, ga, gb] of results) {
    const m = Object.values(st.matches).find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
    m.wins = { [a]: ga, [b]: gb };
    S.recordResult(st, m, w);
  }
  return st;
}

test('xếp hạng: đối đầu 3 người bằng điểm (bảng điểm riêng), xếp theo số trận thắng, điểm ván thắng', () => {
  // p1, p2, p3 thắng vòng tròn nhau (bằng điểm, đối đầu cũng bằng) → hiệu số ván quyết định; p4 thua hết
  const res = [['p1', 'p2', 'p1', 2, 0], ['p2', 'p3', 'p2', 2, 1], ['p3', 'p1', 'p3', 2, 1], ['p1', 'p4', 'p1', 1, 0], ['p2', 'p4', 'p2', 1, 0], ['p3', 'p4', 'p3', 1, 0]];
  const st = rrWith(4, res);
  // hiệu số: p1 = 2+1-1-2... tính: p1 thắng p2 2-0, thua p3 1-2, thắng p4 1-0 → +1; p2: 0-2, 2-1, 1-0 → 0; p3: 1-2, 2-1, 1-0 → +1
  assert.deepStrictEqual(S.standings(st, seedOf)[0].list, ['p1', 'p3', 'p2', 'p4']);
  // Đối đầu khi chỉ 2 người bằng điểm: người thắng trận đối đầu xếp trên dù hiệu số kém hơn
  const st2 = rrWith(3, [['p1', 'p2', 'p2', 0, 1], ['p1', 'p3', 'p1', 5, 0], ['p2', 'p3', null, 1, 1]], { points: { w: 3, d: 1, l: 0 } });
  // p1: 3 điểm (hiệu +4); p2: 3 + 1 = 4 → p2 nhất; đổi sang xếp theo số trận thắng: p1 = p2 = 1 trận → đối đầu: p2 trên
  assert.strictEqual(S.standings(st2, seedOf)[0].list[0], 'p2');
  const st3 = rrWith(3, [['p1', 'p2', 'p2', 0, 1], ['p1', 'p3', 'p1', 5, 0], ['p2', 'p3', null, 1, 1]], { rankBy: 'game_diff' });
  assert.strictEqual(S.standings(st3, seedOf)[0].list[0], 'p1', 'xếp theo hiệu số ván: p1 (+4) nhất');
  // Điểm mỗi ván thắng: p1 thắng nhiều ván nên vượt lên
  const st4 = rrWith(3, [['p1', 'p2', 'p2', 0, 1], ['p1', 'p3', 'p1', 5, 0], ['p2', 'p3', null, 1, 1]], { points: { w: 3, d: 1, l: 0, gw: 1 } });
  const t4 = S.standings(st4, seedOf)[0];
  assert.strictEqual(t4.stats.p1.pts, 3 + 5);
  assert.strictEqual(t4.list[0], 'p1');
  // Tie-break không hợp lệ bị bỏ, tối đa 4, không trùng
  assert.deepStrictEqual(S.normalizeStages([{ type: 'swiss', tiebreaks: ['mbh', 'x', 'mbh', 'sb', 'h2h', 'wins', 'gdiff'] }])[0].tiebreaks, ['mbh', 'sb', 'h2h', 'wins']);
});

test('Thụy Sĩ: điểm miễn đấu riêng, Median-Buchholz, số vòng tự động; vòng tròn gặp nhau 3 lần', () => {
  const sw = playOut(S.buildStage(S.normalizeStages([{ type: 'swiss', rounds: 3, points: { w: 2, d: 1, l: 0, bye: 1 }, tiebreaks: ['mbh'] }])[0], 0, players(5)));
  const tab = S.standings(sw, seedOf)[0];
  const byeP = Object.values(sw.matches).filter((m) => m.bye).map((m) => m.winner);
  assert.strictEqual(byeP.length, 3);
  for (const u of byeP) assert.ok(tab.stats[u].byes >= 1);
  const x = tab.stats[tab.list[0]];
  assert.strictEqual(x.pts, x.w * 2 - x.byes * 1 + x.d, 'miễn đấu được 1 điểm (không phải 2)');
  for (const u of tab.list) { const y = tab.stats[u]; if (y.opps.length >= 3) assert.ok(y.mbh <= y.bh); }
  assert.strictEqual(S.buildStage(S.normalizeStages([{ type: 'swiss', rounds: 0 }])[0], 0, players(16), { seedOf }).cfg.rounds, 4, '16 người: tự động 4 vòng');
  assert.strictEqual(S.buildStage(S.normalizeStages([{ type: 'swiss', rounds: 0 }])[0], 0, players(5), { seedOf }).cfg.rounds, 3);
  const rr = S.buildStage(S.normalizeStages([{ type: 'roundrobin', groups: 1, meetings: 3 }])[0], 0, players(4));
  assert.strictEqual(Object.keys(rr.matches).length, 18);
});
