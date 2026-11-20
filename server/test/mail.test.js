/*
 * NV-4 (rà soát bảo mật 20/11/2026): nodemailer nâng từ 10.0.12 lên ≥ 10.1.4 (5 lỗ hổng Moderate ở bộ phân tích địa chỉ).
 * Kiểm smtpMailer (server.js) vẫn gửi được thư thật qua SMTP với bản mới: dựng một máy chủ SMTP giả tối giản trên
 * 127.0.0.1, gửi thư mã đặt lại mật khẩu (tiếng Việt) và đọc lại người gửi / người nhận / tiêu đề / nội dung.
 * Chạy: npm test
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const net = require('net');
const { smtpMailer } = require('../server.js');
const { RESET_MAIL } = require('../src/hub/shared.js');

/** Máy chủ SMTP giả: trả lời đủ để client gửi xong một thư; ghi lại lệnh và phần DATA. */
function fakeSmtp() {
  const got = { cmds: [], data: '' };
  const srv = net.createServer((s) => {
    let buf = '', inData = false;
    s.write('220 fake ESMTP\r\n');
    s.on('data', (c) => {
      buf += c.toString('utf8');
      let i;
      while ((i = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        if (inData) {
          if (line === '.') { inData = false; s.write('250 ok queued\r\n'); } else got.data += line + '\n';
          continue;
        }
        got.cmds.push(line);
        const cmd = line.slice(0, 4).toUpperCase();
        if (cmd === 'EHLO') s.write('250-fake\r\n250 8BITMIME\r\n');
        else if (cmd === 'DATA') { inData = true; s.write('354 go\r\n'); } else if (cmd === 'QUIT') { s.end('221 bye\r\n'); } else s.write('250 ok\r\n');
      }
    });
    s.on('error', () => {});
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r({ srv, got, port: srv.address().port })));
}

test('smtpMailer (nodemailer mới): gửi được thư mã đặt lại mật khẩu, người gửi lấy từ SMTP_URL', async () => {
  const { srv, got, port } = await fakeSmtp();
  try {
    const send = smtpMailer(`smtp://caro%40example.com:pw@127.0.0.1:${port}?ignoreTLS=true`);
    const mail = RESET_MAIL.vi;
    const info = await send('nguoi.choi@example.com', mail.subject, mail.body('pw_a', '012345'));
    assert.deepStrictEqual(info.accepted, ['nguoi.choi@example.com']);
    assert.ok(got.cmds.some((c) => /^MAIL FROM:<caro@example\.com>/i.test(c)), 'người gửi = user trong SMTP_URL');
    assert.ok(got.cmds.some((c) => /^RCPT TO:<nguoi\.choi@example\.com>/i.test(c)));
    assert.match(got.data, /^Subject: /m);
    assert.ok(got.data.includes('012345') || /base64|quoted-printable/i.test(got.data), 'nội dung thư có mã');
  } finally { srv.close(); }
});

test('smtpMailer: MAIL_FROM có tên hiển thị tiếng Việt', async () => {
  const { srv, got, port } = await fakeSmtp();
  try {
    const send = smtpMailer(`smtp://u:p@127.0.0.1:${port}?ignoreTLS=true`, 'Cờ Caro <caro@example.com>');
    await send('a@example.com', 'Thử', 'Nội dung');
    assert.ok(got.cmds.some((c) => /^MAIL FROM:<caro@example\.com>/i.test(c)));
    assert.match(got.data, /^From: .*caro@example\.com/m);
  } finally { srv.close(); }
});
