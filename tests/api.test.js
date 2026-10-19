import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { once } from 'node:events';
import { createApp } from '../server/app.js';

test('账号、内容权限与持久化完整流程', async t => {
  const tempRoot = resolve(tmpdir());
  const dataDir = mkdtempSync(join(tempRoot, 'min-web-test-'));
  let runtime, server, base;
  const start = async () => {
    runtime = createApp({ dataDir });
    server = runtime.app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    base = `http://127.0.0.1:${server.address().port}`;
  };
  const stop = async () => {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    runtime.close();
  };
  t.after(async () => {
    if (server.listening) await stop();
    assert.ok(resolve(dataDir).startsWith(tempRoot + sep));
    assert.ok(dataDir.includes('min-web-test-'));
    rmSync(dataDir, { recursive: true, force: true });
  });
  await start();
  const client = () => {
    let cookie = '';
    return async (path, { method = 'GET', body, csrf = true } = {}) => {
      const headers = { 'Content-Type': 'application/json' };
      if (csrf) headers['X-Requested-With'] = 'min-web-test';
      if (cookie) headers.Cookie = cookie;
      const response = await fetch(`${base}/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      if (response.headers.has('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
      return { status: response.status, data: await response.json(), headers: response.headers };
    };
  };
  const guest = client(), alice = client(), bob = client();
  let articleId;
  const account = { name: '测试用户', email: 'alice@example.com', password: 'Test-pass-2026' };
  const article = { title: '测试内容 <script>', body: '第一段\n\n可搜索的独特文字', summary: '', category: '随手记录' };

  await t.test('公开页面、示例内容与未登录限制', async () => {
    for (const path of ['/', '/login', '/account', '/articles/welcome']) assert.equal((await fetch(base + path)).status, 200);
    assert.equal((await fetch(base + '/missing-page')).status, 404);
    const list = await guest('/articles');
    assert.equal(list.data.articles.length, 4);
    assert.equal((await guest('/session')).data.user, null);
    assert.equal((await guest('/articles', { method: 'POST', body: article })).status, 401);
    assert.equal((await guest('/articles?mine=1')).status, 401);
    assert.equal((await guest('/missing')).status, 404);
  });
  await t.test('校验输入和请求来源标记', async () => {
    assert.equal((await guest('/auth/register', { method: 'POST', csrf: false, body: account })).status, 403);
    assert.equal((await guest('/auth/register', { method: 'POST', body: { ...account, password: '123' } })).status, 400);
    assert.equal((await guest('/auth/register', { method: 'POST', body: { ...account, email: 'invalid' } })).status, 400);
    assert.equal((await guest('/auth/register', { method: 'POST', body: { ...account, password: '密'.repeat(30) } })).status, 400);
  });
  await t.test('注册会话、重复邮箱与密码哈希', async () => {
    const result = await alice('/auth/register', { method: 'POST', body: account });
    assert.equal(result.status, 201);
    assert.equal(result.data.user.email, account.email);
    assert.equal(result.data.user.password_hash, undefined);
    assert.match(result.headers.get('set-cookie'), /HttpOnly/);
    assert.match(result.headers.get('set-cookie'), /SameSite=Lax/);
    assert.equal((await alice('/session')).data.user.name, account.name);
    assert.equal((await guest('/auth/register', { method: 'POST', body: { ...account, email: 'ALICE@EXAMPLE.COM' } })).status, 409);
    const stored = runtime.db.prepare('SELECT password_hash FROM users WHERE email = ?').get(account.email);
    assert.notEqual(stored.password_hash, account.password);
    assert.match(stored.password_hash, /^\$2[aby]\$/);
  });
  await t.test('发布、搜索、分类与内容校验', async () => {
    assert.equal((await alice('/articles', { method: 'POST', body: { ...article, title: ' ' } })).status, 400);
    assert.equal((await alice('/articles', { method: 'POST', body: { ...article, category: '未知分类' } })).status, 400);
    const result = await alice('/articles', { method: 'POST', body: article });
    assert.equal(result.status, 201);
    articleId = result.data.article.id;
    assert.equal(result.data.article.title, article.title);
    assert.equal((await alice('/articles?mine=1')).data.articles.length, 1);
    assert.equal((await guest('/articles?q=' + encodeURIComponent('独特文字'))).data.articles.length, 1);
    assert.equal((await guest('/articles?category=' + encodeURIComponent('随手记录'))).data.articles.length, 1);
    assert.equal((await guest('/articles?q=' + encodeURIComponent("' OR 1=1 --"))).data.articles.length, 0);
    assert.equal((await guest(`/articles/${articleId}`)).data.article.body, article.body);
  });
  await t.test('其他账号无法编辑、删除或冒用作者', async () => {
    await bob('/auth/register', { method: 'POST', body: { ...account, name: '另一用户', email: 'bob@example.com' } });
    assert.equal((await bob('/articles?mine=1')).data.articles.length, 0);
    assert.equal((await bob(`/articles/${articleId}`, { method: 'PATCH', body: article })).status, 403);
    assert.equal((await bob(`/articles/${articleId}`, { method: 'DELETE' })).status, 403);
    const result = await alice(`/articles/${articleId}`, { method: 'PATCH', body: { ...article, title: '更新后的标题', author_id: 'fake' } });
    assert.equal(result.status, 200);
    assert.equal(result.data.article.title, '更新后的标题');
    assert.notEqual(result.data.article.author_id, 'fake');
    assert.equal((await alice('/account', { method: 'PATCH', body: { name: '新昵称' } })).data.user.name, '新昵称');
    assert.equal((await guest(`/articles/${articleId}`)).data.article.author_name, '新昵称');
  });
  await t.test('重启后账号、内容和会话继续有效', async () => {
    await stop();
    await start();
    assert.equal((await alice('/session')).data.user.name, '新昵称');
    assert.equal((await alice('/articles?mine=1')).data.articles[0].title, '更新后的标题');
    assert.equal((await guest('/articles')).data.articles.length, 5);
  });
  await t.test('退出、错误密码、重新登录与删除', async () => {
    assert.equal((await alice('/auth/logout', { method: 'POST' })).status, 200);
    assert.equal((await alice('/session')).data.user, null);
    assert.equal((await alice(`/articles/${articleId}`, { method: 'DELETE' })).status, 401);
    assert.equal((await alice('/auth/login', { method: 'POST', body: { email: account.email, password: 'incorrect-password' } })).status, 401);
    assert.equal((await alice('/auth/login', { method: 'POST', body: account })).status, 200);
    assert.equal((await alice(`/articles/${articleId}`, { method: 'DELETE' })).status, 200);
    assert.equal((await guest(`/articles/${articleId}`)).status, 404);
    assert.equal((await alice('/articles?mine=1')).data.articles.length, 0);
  });
});
