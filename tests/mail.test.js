import test from 'node:test';
import assert from 'node:assert/strict';
import { SMTPServer } from 'smtp-server';
import { createSmtpMailer } from '../server/mail.js';
import { simpleParser } from 'mailparser';

test('SMTP 配置缺失和错误必须明确报错', () => {
  assert.equal(createSmtpMailer({}), null);
  assert.throws(() => createSmtpMailer({ SMTP_HOST: 'localhost' }), /配置不完整/);
  const env = { SMTP_HOST: 'localhost', SMTP_USER: 'test', SMTP_PASS: 'fake-secret', SMTP_FROM: 'sender@example.com' };
  assert.throws(() => createSmtpMailer({ ...env, SMTP_FROM: 'bad' }), /单个有效邮箱/);
  assert.throws(() => createSmtpMailer({ ...env, SMTP_PORT: '0' }), /有效端口/);
  assert.throws(() => createSmtpMailer({ ...env, SMTP_SECURE: 'false' }), /0 或 1/);
});

test('Nodemailer 实际连接本地 SMTP，验证账号并投递验证码，拒收必须失败', { timeout: 15000 }, async t => {
  const received = [];
  const server = new SMTPServer({
    logger: false, disabledCommands: ['STARTTLS'], allowInsecureAuth: true, closeTimeout: 1000,
    onAuth(auth, _session, callback) {
      if (auth.username !== 'smtp-test' || auth.password !== 'smtp-test-secret') return callback(new Error('Invalid test credentials'));
      callback(null, { user: 'smtp-test' });
    },
    onRcptTo(address, _session, callback) {
      if (address.address === 'rejected@example.com') return callback(Object.assign(new Error('Rejected by test fixture'), { responseCode: 550 }));
      callback();
    },
    onData(stream, session, callback) {
      let raw = '';
      stream.on('data', chunk => { raw += chunk.toString('utf8'); });
      stream.on('error', callback);
      stream.on('end', () => { received.push({ to: session.envelope.rcptTo.map(item => item.address), raw }); callback(); });
    },
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const mailer = createSmtpMailer({
    SMTP_HOST: '127.0.0.1', SMTP_PORT: String(server.server.address().port), SMTP_SECURE: '0', SMTP_REQUIRE_TLS: '0',
    SMTP_USER: 'smtp-test', SMTP_PASS: 'smtp-test-secret', SMTP_FROM: 'sender@example.com',
  });
  t.after(async () => { mailer.close(); await new Promise(resolve => server.close(resolve)); });
  await mailer.verify();
  await mailer.sendRegistrationCode({ email: 'recipient@example.com', code: '012345' });
  assert.equal(received.length, 1);
  assert.deepEqual(received[0].to, ['recipient@example.com']);
  const parsed = await simpleParser(received[0].raw);
  assert.equal(parsed.subject, 'MIN LAB 注册邮箱验证码');
  assert.match(parsed.text, /Registration code: 012345/);
  assert.ok(!received[0].raw.includes('smtp-test-secret'));
  await assert.rejects(mailer.sendRegistrationCode({ email: 'rejected@example.com', code: '999999' }));
  assert.equal(received.length, 1);
});
