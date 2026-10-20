import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, sep } from 'node:path';
import { once } from 'node:events';
import { createApp } from '../server/app.js';
import { createTestMail } from './mail-fixture.js';

async function fixture(t, options = {}) {
  const root = resolve(tmpdir()), dataDir = mkdtempSync(join(root, 'min-web-register-'));
  const mail = createTestMail();
  let runtime, server, base;
  const start = async () => {
    runtime = createApp({ dataDir, sendRegistrationCode: mail.sendRegistrationCode, ...options });
    server = runtime.app.listen(0, '127.0.0.1'); await once(server, 'listening');
    base = `http://127.0.0.1:${server.address().port}`;
  };
  const stop = async () => { await new Promise(resolve => server.close(resolve)); runtime.close(); };
  await start();
  t.after(async () => {
    if (server.listening) await stop();
    assert.ok(resolve(dataDir).startsWith(root + sep)); rmSync(dataDir, { recursive: true, force: true });
  });
  const request = async (path, body) => {
    const response = await fetch(base + '/api' + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'min-web-test' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, data: await response.json() };
  };
  return { get db() { return runtime.db; }, mail, request, send: email => request('/auth/send-code', { email }), restart: async () => { await stop(); await start(); } };
}
const account = { name: '验证码测试', email: 'verify@example.com', password: 'Verify-test-2026' };
const wrongCode = code => code === '000000' ? '000001' : '000000';

test('未配置 SMTP 时发送失败，注册不允许跳过验证码', async t => {
  const f = await fixture(t, { sendRegistrationCode: undefined });
  assert.equal((await f.request('/session')).data.registration.mailConfigured, false);
  const unavailable = await f.send(account.email);
  assert.equal(unavailable.status, 503);
  assert.match(unavailable.data.error, /尚未配置 SMTP/);
  assert.equal((await f.request('/auth/register', { ...account, code: '000000' })).status, 400);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM users').get().n, 0);
});

test('验证码在数据库仅保存 HMAC，API 不返回验证码，正确验证后创建 LV1', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('/auth/register', account)).status, 400);
  const sent = await f.send(account.email);
  assert.equal(sent.status, 200);
  assert.deepEqual(Object.keys(sent.data).sort(), ['expiresIn', 'message', 'ok', 'retryAfter']);
  const code = f.mail.messages.get(account.email);
  assert.match(code, /^\d{6}$/);
  const saved = f.db.prepare('SELECT * FROM registration_codes').get();
  assert.equal(saved.code_hash.length, 64);
  assert.notEqual(saved.code_hash, code);
  assert.equal(saved.delivered, 1);
  assert.equal((await f.request('/auth/register', { ...account, code: Number(code) })).status, 400);
  const registered = await f.request('/auth/register', { ...account, code, level: 3, email_verified_at: 'forged' });
  assert.equal(registered.status, 201);
  assert.equal(registered.data.user.level, 1);
  assert.ok(registered.data.user.email_verified_at);
  assert.notEqual(registered.data.user.email_verified_at, 'forged');
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM registration_codes').get().n, 0);
  assert.equal((await f.request('/auth/register', { ...account, code })).status, 409);
  assert.equal((await f.send(account.email)).status, 409);
});

test('邮箱绑定与输入校验，其他邮箱不能使用该验证码', async t => {
  const f = await fixture(t);
  for (const email of ['not-an-email', 'a@example.com,b@example.com', 'name <a@example.com>', 'a@example.com\r\nBcc: victim@example.com']) {
    assert.equal((await f.send(email)).status, 400);
  }
  assert.equal((await f.send('VERIFY@EXAMPLE.COM')).status, 200);
  const code = f.mail.messages.get(account.email);
  assert.equal((await f.request('/auth/register', { ...account, email: 'other@example.com', code })).status, 400);
  assert.equal((await f.request('/auth/register', { ...account, code })).status, 201);
});

test('60 秒内拒绝重发，重发会替换旧验证码', async t => {
  let clock = Date.now();
  const f = await fixture(t, { now: () => clock });
  await f.send(account.email);
  const oldCode = f.mail.messages.get(account.email);
  const oldNonce = f.db.prepare('SELECT nonce FROM registration_codes').get().nonce;
  assert.equal((await f.send(account.email)).status, 429);
  clock += 60000;
  assert.equal((await f.send(account.email)).status, 200);
  const code = f.mail.messages.get(account.email);
  assert.notEqual(f.db.prepare('SELECT nonce FROM registration_codes').get().nonce, oldNonce);
  // A six-digit random code can legitimately repeat with probability 1 / 1,000,000.
  if (code !== oldCode) assert.equal((await f.request('/auth/register', { ...account, code: oldCode })).status, 400);
  assert.equal((await f.request('/auth/register', { ...account, code })).status, 201);
});

test('超过 10 分钟的验证码不可用，可以重新发送', async t => {
  let clock = Date.now();
  const f = await fixture(t, { now: () => clock });
  await f.send(account.email);
  const code = f.mail.messages.get(account.email);
  clock += 600000;
  const expired = await f.request('/auth/register', { ...account, code });
  assert.equal(expired.status, 400); assert.match(expired.data.error, /过期/);
  assert.equal((await f.send(account.email)).status, 200);
  assert.equal((await f.request('/auth/register', { ...account, code: f.mail.messages.get(account.email) })).status, 201);
});

test('输错 5 次后锁定该验证码，重新发送后才能继续', async t => {
  let clock = Date.now();
  const f = await fixture(t, { now: () => clock });
  await f.send(account.email);
  const code = f.mail.messages.get(account.email);
  for (let i = 0; i < 5; i++) assert.equal((await f.request('/auth/register', { ...account, code: wrongCode(code) })).status, 400);
  assert.equal((await f.request('/auth/register', { ...account, code })).status, 429);
  clock += 60000;
  await f.send(account.email);
  assert.equal((await f.request('/auth/register', { ...account, code: f.mail.messages.get(account.email) })).status, 201);
});

test('邮件未完成发送时验证码不可用，重复发送请求不会并发投递', async t => {
  let release, notify, payload;
  const pending = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { notify = resolve; });
  const f = await fixture(t, { sendRegistrationCode: async value => { payload = value; notify(); await pending; } });
  const first = f.send(account.email);
  await started;
  try {
    assert.equal((await f.request('/auth/register', { ...account, code: payload.code })).status, 400);
    assert.equal((await f.send(account.email)).status, 429);
  } finally { release(); }
  assert.equal((await first).status, 200);
  assert.equal((await f.request('/auth/register', { ...account, code: payload.code })).status, 201);
});

test('发送失败不显示成功、不保留有效验证码，也不回显 SMTP 凭据', async t => {
  let failDelivery = true, delivered;
  const f = await fixture(t, { sendRegistrationCode: async payload => {
    if (failDelivery) throw Object.assign(new Error('SHOULD_NOT_LEAK'), { code: 'EAUTH' });
    delivered = payload;
  } });
  const failed = await f.send(account.email);
  assert.equal(failed.status, 502);
  assert.match(failed.data.error, /邮件发送失败/);
  assert.ok(!JSON.stringify(failed.data).includes('SHOULD_NOT_LEAK'));
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM registration_codes').get().n, 0);
  failDelivery = false;
  assert.equal((await f.send(account.email)).status, 200);
  assert.equal((await f.request('/auth/register', { ...account, code: delivered.code })).status, 201);
});

test('并发使用同一验证码只能创建一个账号', async t => {
  const f = await fixture(t);
  await f.send(account.email);
  const body = { ...account, code: f.mail.messages.get(account.email) };
  const results = await Promise.all([f.request('/auth/register', body), f.request('/auth/register', body)]);
  assert.equal(results.filter(result => result.status === 201).length, 1);
  assert.ok(results.every(result => [201, 400, 409].includes(result.status)));
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM users').get().n, 1);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM registration_codes').get().n, 0);
});

test('重启后仍可使用未过期验证码', async t => {
  const f = await fixture(t);
  await f.send(account.email);
  const code = f.mail.messages.get(account.email);
  await f.restart();
  assert.equal((await f.request('/auth/register', { ...account, code })).status, 201);
});

test('发送验证码接口按 IP 限流，每 15 分钟最多 10 次', async t => {
  const f = await fixture(t);
  for (let i = 0; i < 10; i++) assert.equal((await f.send(`quota${i}@example.com`)).status, 200);
  assert.equal((await f.send('quota10@example.com')).status, 429);
  assert.equal(f.mail.messages.size, 10);
});
