// server/src/site.js: tên miền chính, PUBLIC_URL / MOVED_TO / MOVED_FROM, nhận ra tên miền cũ.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const S = require('../src/site.js');

function withEnv(env, fn) {
  const old = {};
  for (const k of Object.keys(env)) { old[k] = process.env[k]; if (env[k] == null) delete process.env[k]; else process.env[k] = env[k]; }
  try { return fn(); } finally { for (const k of Object.keys(env)) { if (old[k] === undefined) delete process.env[k]; else process.env[k] = old[k]; } }
}

test('site.js: mặc định là tên miền chính; PUBLIC_URL thay được; địa chỉ sai bị bỏ', () => {
  withEnv({ PUBLIC_URL: null, MOVED_TO: null, MOVED_FROM: null }, () => {
    assert.strictEqual(S.publicOrigin(), 'https://' + S.DEFAULT_HOST);
    assert.strictEqual(S.canonicalOrigin(), S.DEFAULT_ORIGIN);
    assert.strictEqual(S.movedTo(), '');
    assert.strictEqual(S.isOldHost(S.DEFAULT_HOST), false, 'chưa chuyển: không có tên cũ');
    assert.deepStrictEqual(S.siteHosts(), [S.DEFAULT_HOST]);
  });
  withEnv({ PUBLIC_URL: 'https://caro.example.org/', MOVED_TO: 'ftp://x' }, () => {
    assert.strictEqual(S.publicOrigin(), 'https://caro.example.org');
    assert.strictEqual(S.publicHost(), 'caro.example.org');
    assert.strictEqual(S.movedTo(), '', 'chỉ nhận http(s)');
  });
  withEnv({ PUBLIC_URL: 'not a url' }, () => assert.strictEqual(S.publicOrigin(), S.DEFAULT_ORIGIN));
  assert.strictEqual(S.hostName('A.B:443'), 'a.b');
  assert.strictEqual(S.hostName('[::1]:80'), '[::1]');
  assert.strictEqual(S.hostName('bad/host'), '');
  assert.strictEqual(S.originOf(''), '');
});

test('site.js: đã chuyển (MOVED_TO) – tên cũ theo MOVED_FROM, không khai thì mọi tên khác trừ máy này', () => {
  withEnv({ PUBLIC_URL: 'https://new.example', MOVED_TO: 'https://new.example', MOVED_FROM: null }, () => {
    assert.strictEqual(S.canonicalOrigin(), 'https://new.example');
    assert.strictEqual(S.isOldHost('new.example'), false);
    assert.strictEqual(S.isOldHost('NEW.example:443'), false);
    assert.strictEqual(S.isOldHost(S.DEFAULT_HOST), true);
    assert.strictEqual(S.isOldHost('127.0.0.1:8080'), false, 'update.sh hỏi 127.0.0.1: không chuyển hướng');
    assert.strictEqual(S.isOldHost('localhost'), false);
    assert.strictEqual(S.isOldHost(''), false);
  });
  withEnv({ PUBLIC_URL: 'https://new.example', MOVED_TO: 'https://new.example', MOVED_FROM: 'https://old.example/, old2.example:443' }, () => {
    assert.deepStrictEqual(S.movedFrom(), ['old.example', 'old2.example']);
    assert.strictEqual(S.isOldHost('old2.example'), true);
    assert.strictEqual(S.isOldHost('other.example'), false, 'có MOVED_FROM: chỉ các tên đã khai');
    assert.deepStrictEqual(S.siteHosts(), ['new.example', 'old.example', 'old2.example']);
  });
  withEnv({ MOVED_TO: 'http://localhost:9000', MOVED_FROM: '127.0.0.1' }, () => {
    assert.strictEqual(S.isOldHost('127.0.0.1:9000'), true, 'khai thẳng thì cả 127.0.0.1 (bài thử e2e)');
    assert.strictEqual(S.isOldHost('localhost:9000'), false);
  });
});
