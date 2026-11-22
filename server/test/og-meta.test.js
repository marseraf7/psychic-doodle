/*
 * Thẻ xem trước link chia sẻ (A3 – Zalo / Messenger): og-meta.js (chữ 4 ngôn ngữ, thoát HTML, chọn ngôn ngữ),
 * hub/og.js (chỉ phần khách chưa đăng nhập xem được) và web.js (chèn vào trang chính, ảnh chung / ảnh ván đang đấu).
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Og = require('../src/og-meta.js');
const { Og: OgPart } = require('../src/hub/og.js');
const { makeHandler } = require('../src/web.js');
const { Store } = require('../src/store.js');

const PAGE = '<!doctype html><html><head>\n<meta name="description" content="mặc định">\n<title>Caro x Gomoku</title></head><body></body></html>';

test('og-meta: mọi giá trị đều được thoát HTML, chữ người dùng một dòng và bị cắt ngắn', () => {
  const evil = '"><script>alert(1)</script>\n<img src=x onerror=alert(2)>';
  const html = Og.inject(PAGE, { info: { kind: 'tour', name: evil + 'x'.repeat(200), n: 3 }, lang: 'vi', base: 'https://caro.test', url: '/?t=abc"<', image: '/api/og/card.png' });
  assert.ok(!html.includes('<script>alert') && !html.includes('<img src=x'), 'không chèn được thẻ');
  assert.ok(html.includes('&quot;&gt;&lt;script&gt;'), 'đã thoát');
  assert.ok(html.includes('content="https://caro.test/?t=abc&quot;&lt;"'), 'og:url thoát');
  const title = /property="og:title" content="([^"]*)"/.exec(html)[1];
  assert.ok(title.length < 200 && title.includes('…'), 'tên dài bị cắt có dấu …');
  assert.ok(!/\n/.test(title), 'không xuống dòng');
  assert.strictEqual((html.match(/name="description"/g) || []).length, 1, 'thay mô tả sẵn có, không thêm thẻ thứ hai');
  assert.match(html, /<title>[^<]*Caro x Gomoku<\/title>/);
  assert.ok(html.includes('property="og:image" content="https://caro.test/api/og/card.png"'));
  assert.ok(html.includes('summary_large_image'));
  assert.strictEqual(Og.inject(PAGE, { info: null }), PAGE, 'không có dữ liệu: giữ nguyên trang');
});

test('og-meta: chọn ngôn ngữ theo ?lang= rồi Accept-Language, mặc định tiếng Việt; đủ ngôn ngữ, đủ biến', () => {
  const q = (s) => new URLSearchParams(s);
  assert.strictEqual(Og.pickLang(q('lang=ru'), 'en-US'), 'ru');
  assert.strictEqual(Og.pickLang(q(''), 'fr-FR,zh-CN;q=0.8'), 'zh');
  assert.strictEqual(Og.pickLang(q('lang=xx'), ''), 'vi');
  // Theo trọng số q (không theo thứ tự viết); q=0 là "không nhận"; chuỗi rác / quá dài không làm lỗi
  assert.strictEqual(Og.pickLang(q(''), 'en-US;q=0.2, ru;q=0.9'), 'ru');
  assert.strictEqual(Og.pickLang(q(''), 'zh;q=0, en;q=0.5'), 'en');
  assert.strictEqual(Og.pickLang(q(''), 'fr, *;q=0.5'), 'vi');
  assert.strictEqual(Og.pickLang(q(''), ';;;,q=,en;q=abc,' + 'x'.repeat(5000)), 'en');
  // Ngôn ngữ thư mục: ?lang=zh-Hant / zh-TW, Accept-Language ja → mã của langs.js
  assert.strictEqual(Og.pickLang(q('lang=zh-Hant'), ''), 'zh-Hant');
  assert.strictEqual(Og.pickLang(q('lang=zh-TW'), ''), 'zh-Hant');
  assert.strictEqual(Og.pickLang(q(''), 'ja-JP,ja;q=0.9'), 'ja');
  assert.strictEqual(Og.pickLang(q(''), 'zh-HK'), 'zh-Hant');
  const keys = Object.keys(Og.STRINGS.vi);
  // 4 ngôn ngữ gốc đủ khoá; ngôn ngữ thư mục (server/src/i18n/<mã>.js) chưa đủ thì lấy tiếng Anh – bài thử i18n-langs.test.js
  for (const l of ['vi', 'en', 'ru', 'zh']) assert.deepStrictEqual(Object.keys(Og.STRINGS[l]).sort(), [...keys].sort(), 'đủ khoá: ' + l);
  const infos = [
    { kind: 'replay', x: 'An', o: 'Bình', winner: 1, n: 30 }, { kind: 'replay', x: 'An', o: 'Bình', winner: 3, n: 30 },
    { kind: 'replay', x: 'An', o: 'Bình', winner: null, n: 3 }, { kind: 'live', x: 'An', o: 'Bình', n: 7 }, { kind: 'room', code: '123456' },
    { kind: 'tour', name: 'Giải Xuân', n: 8 }, { kind: 'otour', name: 'Cup', n: 16 }, { kind: 'club', name: 'Hà Nội', n: 5 },
    { kind: 'club', name: 'HN', intro: 'Giới thiệu', n: 5 }, { kind: 'user', name: 'An', username: 'an_1', rating: 1500, games: 9 }, null,
  ];
  for (const l of Og.LANGS) for (const info of infos) {
    const { title, desc } = Og.texts(info, l);
    assert.ok(title && desc && !/[{}]|undefined|NaN/.test(title + desc), `${l} ${info && info.kind}: ${title} | ${desc}`);
  }
  assert.match(Og.texts(infos[0], 'vi').desc, /An thắng/);
  assert.match(Og.texts(infos[9], 'en').title, /An \(@an_1\)/);
});

/** Hub giả chỉ đủ cho hub/og.js. */
function fakeHub() {
  const room = (o) => ({ code: o.code, tour: o.tour || null, players: o.players, seats: { 1: 'p1', 2: 'p2' }, board: { moves: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }, rule: 'vn', public: o.public });
  const h = {
    store: {
      gameByShare: (s) => (s === 'AbC123' ? { share: 'AbC123', x_name: 'An', o_name: 'Bình', winner: 2, moves: [[0, 0], [1, 1]] } : null),
      byUsername: new Map([['an_1', { username: 'an_1', name: 'An', rating: 1612.4, stats: { wins: 3, losses: 2, draws: 1 } }]]),
    },
    rooms: new Map([
      ['111111', room({ code: '111111', public: true, players: [{ id: 'p1', name: 'An' }, { id: 'p2', name: 'Bình' }] })],
      ['222222', room({ code: '222222', public: false, players: [{ id: 'p1', name: 'Bí mật' }, { id: 'p2', name: 'Kín' }] })],
      ['333333', room({ code: '333333', public: true, tour: { id: 't' }, players: [] })],
    ]),
    canWatch: (r) => !!r.public,
    tours: new Map([['t1', { id: 't1', name: 'Giải Xuân', players: [1, 2, 3], vis: true }], ['t2', { id: 't2', name: 'Giải kín', players: [] }]]),
    tourBySlug: (s) => (s === 'xuan' ? h.tours.get('t1') : null),
    canSeeTour: (t, uid) => uid === null && !!t.vis,
    otGet: (k) => (k === 'cup' ? { id: 'o1', slug: 'cup', name: 'Cup', status: 'running', players: [1, 2], see: true } : k === 'nhap' ? { id: 'o2', name: 'Nháp', status: 'draft', see: true } : null),
    otCanSee: (t) => !!t.see,
    clubs: new Map([['c1', { id: 'c1', name: 'CLB HN', desc: '**Chào** mọi người', members: { a: 'owner', b: 'member' }, status: 'approved' }], ['c2', { id: 'c2', name: 'Chờ', members: {}, status: 'pending' }]]),
    canSeeClub: (c) => c.status === 'approved',
  };
  Object.setPrototypeOf(h, OgPart.prototype);
  return h;
}

test('hub/og: đúng loại link, chỉ phần khách xem được; phòng riêng không lộ tên người chơi', () => {
  const h = fakeHub();
  const q = (s) => h.ogInfo(new URLSearchParams(s));
  assert.deepStrictEqual(q('replay=AbC123').info, { kind: 'replay', x: 'An', o: 'Bình', winner: 2, n: 2 });
  assert.strictEqual(q('replay=AbC123').image, '/api/replay/AbC123.png');
  assert.strictEqual(q('replay=khong'), null);
  assert.strictEqual(q('replay=<script>'), null, 'mã lạ: bỏ qua');
  const live = q('room=111111');
  assert.strictEqual(live.info.kind, 'live');
  assert.strictEqual(live.image, '/api/og/room/111111.png');
  const priv = q('room=222222');
  assert.deepStrictEqual(priv.info, { kind: 'room', code: '222222' }, 'phòng riêng: chỉ mã phòng');
  assert.ok(!JSON.stringify(priv).includes('Bí mật'));
  assert.strictEqual(q('room=333333'), null, 'phòng của giải: không');
  assert.strictEqual(q('room=999999'), null);
  assert.strictEqual(q('t=t1').info.name, 'Giải Xuân');
  assert.strictEqual(q('t=xuan').url, '/?t=t1');
  assert.strictEqual(q('t=t2'), null, 'giải khách không xem được');
  assert.strictEqual(q('o=cup').url, '/?o=cup');
  assert.strictEqual(q('o=nhap'), null, 'giải nháp');
  assert.strictEqual(q('club=c1').info.n, 2);
  assert.ok(!q('club=c1').info.intro.includes('**'), 'mô tả CLB: bỏ định dạng');
  assert.strictEqual(q('club=c2'), null, 'CLB chưa duyệt');
  assert.deepStrictEqual(q('u=AN_1').info, { kind: 'user', name: 'An', username: 'an_1', rating: 1612, games: 6 });
  assert.strictEqual(q('u=khongco'), null);
  assert.strictEqual(q(''), null);
  assert.deepStrictEqual(h.ogRoomMoves('111111'), { moves: [[0, 0], [1, 1]], rule: 'vn' });
  assert.strictEqual(h.ogRoomMoves('222222'), null, 'ảnh ván phòng riêng: không');
});

test('web: trang chính mở bằng link chia sẻ có thẻ og; ảnh chung + ảnh ván đang đấu', async () => {
  const get = (handle, url, headers = {}) => new Promise((done) => {
    const res = { status: 0, headers: {}, body: Buffer.alloc(0), setHeader(k, v) { this.headers[k] = v; }, removeHeader() {},
      writeHead(s, h) { this.status = s; Object.assign(this.headers, h || {}); return this; },
      end(b) { if (b) this.body = Buffer.concat([this.body, Buffer.from(b)]); done(this); }, on() { return this; }, once() { return this; }, emit() {}, write() { return true; } };
    handle({ method: 'GET', url, headers: { host: 'caro.test', ...headers }, socket: { remoteAddress: '127.0.0.1' } }, res);
  });
  const store = new Store(null);
  const handle = makeHandler({ store, hub: fakeHub(), bundle: false });
  const club = (await get(handle, '/?club=c1', { 'accept-language': 'en-US,en' })).body.toString();
  assert.ok(club.includes('property="og:title" content="CLB HN club – Caro x Gomoku"'), 'tiêu đề theo Accept-Language');
  assert.ok(club.includes('content="http://caro.test/api/og/card.png"'));
  const tour = (await get(handle, '/?t=xuan&lang=zh')).body.toString();
  assert.ok(tour.includes('og:locale" content="zh_CN"') && tour.includes('Giải Xuân'));
  const plain = await get(handle, '/?t=t2');
  assert.ok(!plain.body.toString().includes('og:title'), 'không xem được: trang thường');
  const card = await get(handle, '/api/og/card.png');
  assert.strictEqual(card.status, 200);
  assert.strictEqual(card.headers['content-type'], 'image/png');
  assert.ok(card.body.length > 1000);
  const live = await get(handle, '/api/og/room/111111.png');
  assert.strictEqual(live.status, 200);
  assert.match(live.headers['cache-control'], /max-age=30/);
  assert.strictEqual((await get(handle, '/api/og/room/222222.png')).body.length, card.body.length, 'phòng riêng: ảnh chung');
  assert.strictEqual((await get(handle, '/api/og/khac')).status, 404);
  store.close();
});
