import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { createApp } from '../server/app.js';
import { promoteAdmin } from '../server/admin.js';
import { createTestMail } from './mail-fixture.js';

test('账号等级、越级请求、管理员授权和禁用后的会话失效', async t => {
  const tempRoot = resolve(tmpdir()), dataDir = mkdtempSync(join(tempRoot, 'min-web-access-'));
  let runtime, server, base;
  const mail = createTestMail();
  const start = async () => {
    runtime = createApp({ dataDir, sendRegistrationCode: mail.sendRegistrationCode });
    server = runtime.app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    base = `http://127.0.0.1:${server.address().port}`;
  };
  const stop = async () => { await new Promise(resolve => server.close(resolve)); runtime.close(); };
  t.after(async () => {
    if (server.listening) await stop();
    assert.ok(resolve(dataDir).startsWith(tempRoot + sep));
    rmSync(dataDir, { recursive: true, force: true });
  });
  await start();
  const client = () => {
    let cookie;
    const request = async (path, { method = 'GET', body } = {}) => {
      const response = await fetch(base + '/api' + path, { method, headers: {
        'Content-Type': 'application/json', 'X-Requested-With': 'min-web-test', ...(cookie ? { Cookie: cookie } : {}),
      }, body: body === undefined ? undefined : JSON.stringify(body) });
      if (response.headers.has('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
      return { status: response.status, data: await response.json() };
    };
    return request;
  };
  const guest = client(), owner = client(), member = client();
  const password = 'Access-test-2026';
  const register = async (request, email) => {
    await request('/auth/send-code', { method: 'POST', body: { email } });
    return request('/auth/register', { method: 'POST', body: { name: email.split('@')[0], email, password, level: 3, disabled: false, role: 'admin', code: mail.messages.get(email) } });
  };
  const login = (request, email) => request('/auth/login', { method: 'POST', body: { email, password } });
  const ownerResult = await register(owner, 'owner@example.com');
  const memberResult = await register(member, 'member@example.com');
  const ownerId = ownerResult.data.user.id, memberId = memberResult.data.user.id;
  const setMember = body => owner(`/admin/users/${memberId}`, { method: 'PATCH', body });

  await t.test('首个和普通注册账号都为 LV1，提交等级字段不能提权', async () => {
    assert.equal(ownerResult.data.user.level, 1);
    assert.equal(memberResult.data.user.level, 1);
    const response = await member('/account', { method: 'PATCH', body: { name: '尝试提权', level: 3, disabled: false } });
    assert.equal(response.status, 200);
    assert.equal(response.data.user.level, 1);
    assert.equal((await member('/session')).data.user.level, 1);
    assert.ok(!('session_version' in response.data.user));
  });
  await t.test('游客为 401，LV1 对文件、靶场、后台及其写接口为 403', async () => {
    for (const path of ['/files', '/lab', '/lab/search', '/lab/messages/preview', '/admin/users']) {
      assert.equal((await guest(path)).status, 401, path);
      assert.equal((await member(path)).status, 403, path);
    }
    assert.equal((await member('/files', { method: 'POST', body: {} })).status, 403);
    assert.equal((await member('/files/fake/download')).status, 403);
    assert.equal((await member('/files/fake', { method: 'DELETE' })).status, 403);
    assert.equal((await member('/lab/actor', { method: 'POST', body: { actor: 'bob' } })).status, 403);
    assert.equal((await member('/lab/messages', { method: 'POST', body: { body: 'hello' } })).status, 403);
    assert.equal((await member('/lab/reset', { method: 'POST', body: { confirmation: 'RESET' } })).status, 403);
    assert.equal((await member(`/admin/users/${memberId}`, { method: 'PATCH', body: { level: 3 } })).status, 403);
  });
  await t.test('维护命令只提升已存在账号，提升后重新登录取得管理员权限', async () => {
    assert.throws(() => promoteAdmin({ dataDir, email: 'missing@example.com' }), /没有找到/);
    assert.equal(promoteAdmin({ dataDir, email: 'OWNER@EXAMPLE.COM' }).level, 3);
    assert.equal((await owner('/session')).data.user, null);
    assert.equal((await login(owner, 'owner@example.com')).data.user.level, 3);
    const users = await owner('/admin/users');
    assert.equal(users.status, 200);
    assert.equal(users.data.users.length, 2);
    assert.equal(users.data.levels.length, 3);
    assert.ok(users.data.users.every(user => !('password_hash' in user) && !('session_version' in user)));
  });
  await t.test('升级 LV2 后旧登录立即获得功能，仍不能访问后台或重置共享数据', async () => {
    assert.equal((await setMember({ level: 2 })).status, 200);
    assert.equal((await member('/session')).data.user.level, 2);
    assert.equal((await member('/files')).status, 200);
    assert.equal((await member('/lab')).status, 200);
    assert.equal((await member('/lab/search')).status, 200);
    assert.equal((await member('/admin/users')).status, 403);
    assert.equal((await member('/lab/reset', { method: 'POST', body: { confirmation: 'RESET' } })).status, 403);
  });
  await t.test('降级下一请求生效，缓存身份和练习身份不能绕过等级', async () => {
    await member('/lab/actor', { method: 'POST', body: { actor: 'bob' } });
    await setMember({ level: 1 });
    assert.equal((await member('/lab/notes/1002')).status, 403);
    assert.equal((await member('/files')).status, 403);
    assert.equal((await member('/articles/welcome/comments', { method: 'POST', body: { body: 'LV1 仍可评论' } })).status, 201);
  });
  await t.test('禁用后不能登录，重新启用也不会恢复原有会话', async () => {
    assert.equal((await setMember({ disabled: true })).data.user.disabled, 1);
    assert.equal((await login(client(), 'member@example.com')).status, 403);
    assert.equal((await setMember({ disabled: false, level: 2 })).status, 200);
    // No request used the old cookie between disable and enable.
    assert.equal((await member('/session')).data.user, null);
    assert.equal((await member('/lab')).status, 401);
    assert.equal((await login(member, 'member@example.com')).status, 200);
    assert.equal((await member('/lab')).status, 200);
  });
  await t.test('后台字段严格校验，拒绝自我降级、自我禁用与未知账号', async () => {
    for (const level of [0, 4, '3', null]) assert.equal((await setMember({ level })).status, 400);
    assert.equal((await setMember({ disabled: 'false' })).status, 400);
    assert.equal((await setMember({ password_hash: 'forged' })).status, 400);
    assert.equal((await setMember({})).status, 400);
    assert.equal((await owner(`/admin/users/${ownerId}`, { method: 'PATCH', body: { disabled: true } })).status, 400);
    assert.equal((await owner(`/admin/users/${ownerId}`, { method: 'PATCH', body: { level: 1 } })).status, 400);
    assert.equal((await owner('/admin/users/missing', { method: 'PATCH', body: { level: 2 } })).status, 404);
  });
  await t.test('等级与禁用状态在重启后保留，禁用账号会话无效', async () => {
    await setMember({ disabled: true });
    await stop(); await start();
    assert.equal((await owner('/session')).data.user.level, 3);
    assert.equal((await owner('/admin/users')).data.users.find(user => user.id === memberId).disabled, 1);
    assert.equal((await member('/session')).data.user, null);
    assert.equal((await login(member, 'member@example.com')).status, 403);
  });
});
