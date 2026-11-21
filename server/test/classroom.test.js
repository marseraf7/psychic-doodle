'use strict';
// C2: Lớp học / Nghiên cứu – tạo bài, quyền xem (công khai / link / CLB / riêng), chỉ chủ bài sửa, làm sạch chương + lời bình,
// trần kích thước, theo dõi trực tiếp (clsSync + bản mới khi lưu), xoá bài, xoá tài khoản.
const test = require('node:test');
const assert = require('node:assert');
const { ctx, account, until, Client } = require('./otour-client.js');

const uidOf = (c) => c.msgs.filter((m) => m.t === 'welcome').pop().me.uid;
const errs = (c) => c.msgs.filter((m) => m.t === 'error').map((m) => m.code);
const last = (c, t) => c.msgs.filter((m) => m.t === t).pop();

async function create(c, o) {
  const n = c.msgs.filter((m) => m.t === 'clsCreated').length;
  c.send({ t: 'clsCreate', ...o });
  await until(() => c.msgs.filter((m) => m.t === 'clsCreated').length > n);
  return last(c, 'clsCreated').id;
}

test('Lớp học: tạo, mở, sửa chương (làm sạch), theo dõi trực tiếp, quyền xem, xoá', async () => {
  const hub = ctx.app.hub;
  hub.T.THROTTLE_SCALE = 0;
  const t = await account(), s1 = await account(), guest = await Client.open();
  t.send({ t: 'clsCreate', title: 'ab' });
  await until(() => errs(t).includes('cls_title_short'));
  const id = await create(t, { title: 'Khai cuộc hoa nguyệt', vis: 'unlisted' });
  // Học viên + khách mở bằng link (ai có link)
  for (const c of [t, s1, guest]) c.send({ t: 'clsOpen', id });
  await until(() => [t, s1, guest].every((c) => last(c, 'clsStudy')));
  assert.strictEqual(last(s1, 'clsStudy').study.chapters.length, 1);
  // Người khác không sửa được
  s1.send({ t: 'clsChapter', id, idx: 0, chapter: { name: 'x', root: { ch: [] } } });
  await until(() => errs(s1).includes('cls_not_found'));
  // Chủ bài lưu chương: nước trùng ô bị bỏ, lời bình làm sạch; học viên nhận bản mới
  t.send({ t: 'clsChapter', id, idx: 0, chapter: { name: 'Mở đầu', rule: 'vn', root: { ch: [{ m: [0, 0], c: '**Nước đầu**\u0007', s: [{ k: 'm', x: 1, y: 1 }], ch: [{ m: [0, 0] }, { m: [1, 0], ch: [] }] }] } } });
  await until(() => last(s1, 'clsStudy').study.chapters[0].name === 'Mở đầu');
  const ch = last(s1, 'clsStudy').study.chapters[0];
  assert.strictEqual(ch.root.ch[0].c, '**Nước đầu**');
  assert.deepStrictEqual(ch.root.ch[0].ch.map((n) => n.m), [[1, 0]]);
  // Theo dõi: giáo viên đi tới nước 2 → học viên nhận clsSync; đường không tồn tại → lỗi
  t.send({ t: 'clsSync', id, chapter: 0, path: [0, 0] });
  await until(() => last(s1, 'clsSync') && last(guest, 'clsSync'));
  assert.deepStrictEqual(last(s1, 'clsSync').path, [0, 0]);
  assert.ok(!last(t, 'clsSync'), 'giáo viên không nhận lại tin của mình');
  t.send({ t: 'clsSync', id, chapter: 0, path: [-1] });
  await until(() => errs(t).includes('bad_message'));
  // Người mở sau biết giáo viên đang ở đâu
  const late = await account();
  late.send({ t: 'clsOpen', id });
  await until(() => last(late, 'clsStudy'));
  assert.deepStrictEqual(last(late, 'clsStudy').live, { chapter: 0, path: [0, 0] });
  // Thêm chương, xoá chương (không xoá chương cuối cùng)
  t.send({ t: 'clsChapter', id, idx: 1, chapter: { name: 'Hai' } });
  await until(() => last(s1, 'clsStudy').study.chapters.length === 2);
  t.send({ t: 'clsChapter', id, idx: 5, chapter: {} });
  await until(() => errs(t).filter((e) => e === 'bad_message').length === 2);
  t.send({ t: 'clsChapterDel', id, idx: 1 });
  await until(() => last(s1, 'clsStudy').study.chapters.length === 1);
  t.send({ t: 'clsChapterDel', id, idx: 0 });
  await until(() => errs(t).filter((e) => e === 'bad_message').length === 3);
  // Riêng tư: người khác không mở được, danh sách công khai không có
  t.send({ t: 'clsMeta', id, vis: 'private', desc: 'Mô tả', title: 'Tên mới' });
  await until(() => hub.store.clsGet(id).vis === 'private');
  assert.strictEqual(hub.store.clsGet(id).title, 'Tên mới');
  const n0 = errs(guest).length;
  guest.send({ t: 'clsOpen', id });
  await until(() => errs(guest).length > n0);
  assert.strictEqual(errs(guest).pop(), 'cls_not_found');
  t.send({ t: 'clsMeta', id, vis: 'public' });
  await until(() => hub.store.clsGet(id).vis === 'public');
  guest.send({ t: 'clsList' });
  await until(() => last(guest, 'clsList'));
  assert.ok(last(guest, 'clsList').pub.some((x) => x.id === id && x.chapters === 1 && !('chapters' in x && Array.isArray(x.chapters))));
  assert.deepStrictEqual(last(guest, 'clsList').mine, []);
  // Khách không tạo được
  guest.send({ t: 'clsCreate', title: 'Khách tạo' });
  await until(() => errs(guest).includes('need_account'));
  // Quá lớn: chương ~600 KB lời bình → từ chối, bài giữ nguyên
  const fat = { name: 'to', root: { ch: [] } };
  let node = fat.root;
  for (let i = 0; i < 300; i++) { const k = { m: [i % 20, Math.floor(i / 20) * 2], c: 'z'.repeat(1990), ch: [] }; node.ch.push(k); node = k; }
  const text = JSON.stringify(fat), P = 12000, n = Math.ceil(text.length / P);
  for (let k = 0; k < n; k++) t.send({ t: 'clsChapterPart', id, idx: 0, k, n, d: text.slice(k * P, (k + 1) * P) });
  await until(() => errs(t).includes('cls_too_big'), 5000);
  assert.strictEqual(hub.store.clsGet(id).chapters[0].name, 'Mở đầu', 'bài giữ nguyên');
  // Chương vừa (nhiều phần, ≤ 512 KB): ghép lại và lưu
  const mid = { name: 'Vừa', root: { ch: [] } };
  node = mid.root;
  for (let i = 0; i < 30; i++) { const k = { m: [i % 20, Math.floor(i / 20) * 2], c: 'w'.repeat(1500), ch: [] }; node.ch.push(k); node = k; }
  const mt = JSON.stringify(mid), mn = Math.ceil(mt.length / P);
  assert.ok(mn > 1);
  for (let k = mn - 1; k >= 0; k--) t.send({ t: 'clsChapterPart', id, idx: 0, k, n: mn, d: mt.slice(k * P, (k + 1) * P) }); // thứ tự đảo vẫn ghép đúng
  await until(() => hub.store.clsGet(id).chapters[0].name === 'Vừa', 5000);
  t.send({ t: 'clsChapterPart', id, idx: 0, k: 0, n: 1, d: '{hỏng' });
  await until(() => errs(t).filter((e) => e === 'bad_message').length === 4);
  // Xoá bài: người đang mở nhận clsGone (s1 bị bỏ khỏi danh sách theo dõi khi bài thành riêng tư → mở lại)
  const k0 = s1.msgs.filter((m) => m.t === 'clsStudy').length;
  s1.send({ t: 'clsOpen', id });
  await until(() => s1.msgs.filter((m) => m.t === 'clsStudy').length > k0);
  t.send({ t: 'clsDelete', id });
  await until(() => last(s1, 'clsGone'));
  assert.strictEqual(hub.store.clsGet(id), null);
  [t, s1, guest, late].forEach((c) => c.close());
});

test('Lớp của CLB: chỉ chủ / quản lý CLB tạo được, chỉ thành viên CLB xem; xoá tài khoản xoá bài', async () => {
  const hub = ctx.app.hub;
  const own = await account(), mem = await account(), out = await account();
  const club = { id: 'clbtest01', name: 'CLB Thử', status: 'approved', owner: uidOf(own), members: { [uidOf(own)]: 'owner', [uidOf(mem)]: 'member' } };
  hub.clubs.set(club.id, club);
  own.send({ t: 'clsList' });
  await until(() => last(own, 'clsList'));
  assert.deepStrictEqual(last(own, 'clsList').myClubs, [{ id: club.id, name: 'CLB Thử' }]);
  mem.send({ t: 'clsCreate', title: 'Lớp lén', club: club.id });
  await until(() => errs(mem).includes('club_officers_only'));
  const id = await create(own, { title: 'Lớp thứ Bảy', club: club.id });
  assert.strictEqual(hub.store.clsGet(id).vis, 'club');
  mem.send({ t: 'clsOpen', id });
  await until(() => last(mem, 'clsStudy'));
  out.send({ t: 'clsOpen', id });
  await until(() => errs(out).includes('cls_not_found'));
  mem.send({ t: 'clsList' });
  await until(() => last(mem, 'clsList'));
  assert.ok(last(mem, 'clsList').club.some((x) => x.id === id && x.clubName === 'CLB Thử'));
  // Chủ bài chuyển riêng tư: thành viên CLB không còn thấy tên bài trong danh sách
  own.send({ t: 'clsMeta', id, vis: 'private' });
  await until(() => hub.store.clsGet(id).vis === 'private');
  const nl = mem.msgs.filter((m) => m.t === 'clsList').length;
  await new Promise((r) => setTimeout(r, 350));
  mem.send({ t: 'clsList' });
  await until(() => mem.msgs.filter((m) => m.t === 'clsList').length > nl);
  assert.ok(!last(mem, 'clsList').club.some((x) => x.id === id), 'bài riêng tư không hiện trong danh sách CLB');
  hub.store.clsUserGone(uidOf(own));
  assert.strictEqual(hub.store.clsGet(id), null);
  hub.clubs.delete(club.id);
  [own, mem, out].forEach((c) => c.close());
});

test('Lớp học: chia phần không vượt giới hạn tần suất lưu chương, không đọc lại cả bài mỗi phần', async () => {
  const hub = ctx.app.hub;
  const t = await account();
  hub.T.THROTTLE_SCALE = 0;
  const id = await create(t, { title: 'Bài chia phần', vis: 'unlisted' });
  hub.T.THROTTLE_SCALE = 1;
  const realGet = hub.store.clsGet;
  let reads = 0;
  hub.store.clsGet = function (...a) { reads++; return realGet.apply(this, a); };
  try {
    // Gửi liên tục chương 1 phần (n = 1): chỉ lần đầu được lưu, các lần sau "quá nhanh" (như clsChapter)
    const n0 = errs(t).length;
    for (let i = 0; i < 10; i++) t.send({ t: 'clsChapterPart', id, idx: 0, k: 0, n: 1, d: JSON.stringify({ name: 'Lần ' + i }) });
    await until(() => errs(t).length - n0 >= 9);
    assert.strictEqual(errs(t).slice(n0).filter((e) => e === 'too_fast').length, 9, 'n = 1 liên tục không lưu 10 lần');
    assert.strictEqual(hub.store.clsGet.call(hub.store, id).chapters[0].name, 'Lần 0');
    // Một chương nhiều phần: kiểm chủ bài một lần lúc bắt đầu + một lần lúc lưu, không phải mỗi phần
    await new Promise((r) => setTimeout(r, 200));
    const big = { name: 'Nhiều phần', root: { ch: [{ m: [0, 0], c: 'q'.repeat(1900), ch: [] }] } };
    let node = big.root.ch[0];
    for (let i = 1; i < 40; i++) { const k = { m: [i % 20, Math.floor(i / 20) * 2 + 1], c: 'q'.repeat(1900), ch: [] }; node.ch.push(k); node = k; }
    const text = JSON.stringify(big), P = 12000, n = Math.ceil(text.length / P);
    assert.ok(n >= 6);
    reads = 0;
    for (let k = 0; k < n; k++) t.send({ t: 'clsChapterPart', id, idx: 0, k, n, d: text.slice(k * P, (k + 1) * P) });
    await until(() => realGet.call(hub.store, id).chapters[0].name === 'Nhiều phần', 5000);
    assert.ok(reads <= 3, 'đọc bài ' + reads + ' lần cho ' + n + ' phần');
  } finally {
    hub.store.clsGet = realGet;
    hub.T.THROTTLE_SCALE = 0;
    t.close();
  }
});

test('Lớp học: link /?cls= có thẻ xem trước og khi bài công khai / có link; bài riêng tư không lộ tên', async () => {
  const hub = ctx.app.hub;
  hub.T.THROTTLE_SCALE = 0;
  const t = await account();
  const id = await create(t, { title: 'Bài <Hoa nguyệt>', vis: 'unlisted' });
  const page = async () => (await fetch(`http://127.0.0.1:${ctx.app.server.address().port}/?cls=${id}&lang=en`)).text();
  const html = await page();
  assert.match(html, /<meta property="og:title" content="Bài Hoa nguyệt – /);
  assert.match(html, /og:description" content="Gomoku study · chapters: 1/);
  const s = hub.store.clsGet(id);
  s.vis = 'private';
  hub.store.clsPut(s);
  assert.doesNotMatch(await page(), /Hoa nguyệt/, 'bài riêng tư: không có thẻ og');
  t.close();
});
