import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '../server/app.js';

test('评论、文件与隔离靶场', async t => {
  const root = resolve(tmpdir()), dataDir = mkdtempSync(join(root, 'min-web-features-'));
  let runtime, server, base;
  const start = async () => {
    runtime = createApp({ dataDir });
    server = runtime.app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    base = `http://127.0.0.1:${server.address().port}`;
  };
  const stop = async () => { await new Promise(resolve => server.close(resolve)); runtime.close(); };
  t.after(async () => {
    if (server.listening) await stop();
    assert.ok(resolve(dataDir).startsWith(root + sep));
    rmSync(dataDir, { recursive: true, force: true });
  });
  await start();
  const client = () => {
    let cookie = '';
    return async (path, { method = 'GET', body, csrf = true } = {}) => {
      const multipart = body instanceof FormData;
      const headers = { ...(multipart ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}) };
      if (csrf) headers['X-Requested-With'] = 'min-web-test';
      const response = await fetch(`${base}/api${path}`, { method, headers, body: body === undefined ? undefined : multipart ? body : JSON.stringify(body) });
      if (response.headers.has('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
      const type = response.headers.get('content-type') || '';
      const data = type.includes('json') ? await response.json() : type.includes('octet-stream') ? Buffer.from(await response.arrayBuffer()) : await response.text();
      return { status: response.status, headers: response.headers, data };
    };
  };
  const alice = client(), bob = client(), guest = client();
  const register = (request, email) => request('/auth/register', { method: 'POST', body: { name: email.split('@')[0], email, password: 'Practice-test-2026' } });
  const upload = (bytes, filename = '测试文件.txt') => { const data = new FormData(); data.append('file', new Blob([bytes]), filename); return data; };
  await register(alice, 'alice@example.com');
  await register(bob, 'bob@example.com');
  let commentId, fileId;
  const fileBytes = Buffer.from([0, 1, 2, 127, 128, 255]);
  const xss = "<script>document.body.append('XSS 已执行')</script>";

  await t.test('评论校验、作者权限及文章删除级联', async () => {
    assert.equal((await guest('/articles/welcome/comments', { method: 'POST', body: { body: 'test' } })).status, 401);
    assert.equal((await alice('/articles/missing/comments')).status, 404);
    assert.equal((await alice('/articles/welcome/comments', { method: 'POST', body: { body: ' ' } })).status, 400);
    const comment = await alice('/articles/welcome/comments', { method: 'POST', body: { body: xss } });
    assert.equal(comment.status, 201);
    commentId = comment.data.comment.id;
    assert.equal((await guest('/articles/welcome/comments')).data.comments[0].body, xss);
    assert.equal((await bob(`/comments/${commentId}`, { method: 'DELETE' })).status, 403);
    const article = await alice('/articles', { method: 'POST', body: { title: '临时文章', body: '临时正文', category: '随手记录' } });
    await alice(`/articles/${article.data.article.id}/comments`, { method: 'POST', body: { body: '级联删除测试' } });
    await alice(`/articles/${article.data.article.id}`, { method: 'DELETE' });
    assert.equal(runtime.db.prepare('SELECT count(*) AS n FROM comments WHERE article_id = ?').get(article.data.article.id).n, 0);
  });
  await t.test('文件上传、中文名、二进制下载及归属检查', async () => {
    assert.equal((await guest('/files')).status, 401);
    assert.equal((await alice('/files', { method: 'POST', body: upload('a'), csrf: false })).status, 403);
    const file = await alice('/files', { method: 'POST', body: upload(fileBytes) });
    assert.equal(file.status, 201);
    assert.equal(file.data.file.name, '测试文件.txt');
    fileId = file.data.file.id;
    const download = await alice(`/files/${fileId}/download`);
    assert.equal(download.status, 200);
    assert.deepEqual(download.data, fileBytes);
    assert.match(download.headers.get('content-disposition'), /^attachment;/);
    assert.equal(download.headers.get('x-content-type-options'), 'nosniff');
    assert.equal((await bob(`/files/${fileId}/download`)).status, 403);
    assert.equal((await bob(`/files/${fileId}`, { method: 'DELETE' })).status, 403);
    assert.equal((await bob('/files')).data.files.length, 0);
    assert.equal((await alice('/files', { method: 'POST', body: upload(Buffer.alloc(2 * 1024 * 1024 + 1)) })).status, 413);
    assert.equal((await alice('/files', { method: 'POST', body: {} })).status, 400);
  });
  await t.test('SQL 注入漏洞模式与参数绑定对照', async () => {
    assert.equal((await guest('/lab')).status, 401);
    assert.equal((await alice('/lab?mode=unknown')).status, 400);
    assert.equal((await alice('/lab/search')).data.products.length, 3);
    const attack = encodeURIComponent("%' OR 1=1 --");
    const vulnerable = await alice(`/lab/search?mode=vulnerable&q=${attack}`);
    assert.equal(vulnerable.data.products.length, 4);
    assert.ok(vulnerable.data.products.some(row => row.name.includes('LAB_SQLI_FOUND')));
    assert.equal((await alice(`/lab/search?mode=fixed&q=${attack}`)).data.products.length, 0);
    assert.equal((await alice('/lab/search?mode=fixed&q=%25')).data.products.length, 3);
    assert.equal((await alice('/lab/search?q=%27')).status, 400);
    // Main application tables are not present in the training database.
    const crossDatabase = await alice('/lab/search?q=' + encodeURIComponent("%' UNION SELECT 1,email,password_hash FROM users --"));
    assert.equal(crossDatabase.status, 400);
    assert.match(crossDatabase.data.error, /no such table/);
  });
  await t.test('对象越权、练习身份切换及会话隔离', async () => {
    assert.equal((await alice('/lab/notes/1002?mode=vulnerable')).data.note.owner, 'bob');
    assert.equal((await alice('/lab/notes/1002?mode=fixed')).status, 403);
    assert.equal((await alice('/lab/notes/1001?mode=fixed')).status, 200);
    await alice('/lab/actor', { method: 'POST', body: { actor: 'bob' } });
    assert.equal((await alice('/lab/notes/1002?mode=fixed')).status, 200);
    assert.equal((await bob('/lab')).data.actor, 'alice');
    assert.equal((await alice('/lab/notes/9999')).status, 404);
    assert.equal((await alice('/lab/notes/not-a-number')).status, 400);
  });
  await t.test('存储型 XSS 原文与转义预览、沙箱范围', async () => {
    const saved = await alice('/lab/messages', { method: 'POST', body: { body: xss } });
    assert.equal(saved.status, 201);
    const vulnerable = await alice('/lab/messages/preview?mode=vulnerable');
    assert.ok(vulnerable.data.includes(xss));
    assert.match(vulnerable.headers.get('content-security-policy'), /sandbox allow-scripts/);
    assert.doesNotMatch(vulnerable.headers.get('content-security-policy'), /allow-same-origin/);
    const fixed = await alice('/lab/messages/preview?mode=fixed');
    assert.ok(fixed.data.includes('&lt;script&gt;'));
    assert.ok(!fixed.data.includes(xss));
    assert.equal((await alice('/lab/messages', { method: 'POST', body: { body: ' ' } })).status, 400);
  });
  await t.test('重启后评论、文件、留言和练习身份保留', async () => {
    await stop(); await start();
    assert.equal((await alice('/articles/welcome/comments')).data.comments[0].id, commentId);
    assert.deepEqual((await alice(`/files/${fileId}/download`)).data, fileBytes);
    assert.equal((await alice('/lab')).data.actor, 'bob');
    assert.ok((await alice('/lab/messages')).data.messages.some(message => message.body === xss));
  });
  await t.test('请求记录按登录账号隔离且不含凭据正文', async () => {
    const events = (await alice('/lab/events')).data.events;
    assert.ok(events.length > 0);
    assert.ok(events.some(event => event.status === 403));
    assert.deepEqual(Object.keys(events[0]).sort(), ['actor', 'created_at', 'method', 'mode', 'path', 'status']);
    assert.ok(!JSON.stringify(events).includes('Practice-test-2026'));
    assert.equal((await bob('/lab/events')).data.events.length, 0);
  });
  await t.test('重置仅作用于练习数据，业务数据完整保留', async () => {
    assert.equal((await alice('/lab/reset', { method: 'POST', body: {} })).status, 400);
    assert.equal((await alice('/lab/reset', { method: 'POST', body: { confirmation: 'RESET' } })).status, 200);
    assert.equal((await alice('/lab/messages')).data.messages.length, 1);
    assert.equal((await alice('/lab')).data.actor, 'alice');
    assert.equal((await alice('/articles/welcome/comments')).data.comments.length, 1);
    assert.equal((await alice('/files')).data.files.length, 1);
    assert.equal((await alice('/session')).data.user.email, 'alice@example.com');
    assert.equal((await alice('/articles')).data.articles.length, 4);
    assert.equal((await alice(`/comments/${commentId}`, { method: 'DELETE' })).status, 200);
    assert.equal((await alice(`/files/${fileId}`, { method: 'DELETE' })).status, 200);
    assert.equal((await alice(`/files/${fileId}/download`)).status, 404);
  });
});

test('v1 数据库升级为 v2 时保留已有账号和文章', () => {
  const root = resolve(tmpdir()), dataDir = mkdtempSync(join(root, 'min-web-migrate-'));
  const original = new DatabaseSync(join(dataDir, 'site.sqlite'));
  original.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT, email TEXT UNIQUE, password_hash TEXT, created_at TEXT);
    CREATE TABLE articles (id TEXT PRIMARY KEY, title TEXT, summary TEXT, body TEXT, category TEXT, author_id TEXT REFERENCES users(id), created_at TEXT, updated_at TEXT);
    INSERT INTO users VALUES ('original-user', '原账号', 'original@example.com', 'original-hash', '2026-10-17');
    INSERT INTO articles VALUES ('original-article', '原文章', '原摘要', '原正文', '随手记录', 'original-user', '2026-10-17', '2026-10-17');
    PRAGMA user_version = 1;
  `);
  original.close();
  const runtime = createApp({ dataDir });
  try {
    assert.equal(runtime.db.prepare('PRAGMA user_version').get().user_version, 2);
    assert.equal(runtime.db.prepare('SELECT name FROM users').get().name, '原账号');
    assert.equal(runtime.db.prepare('SELECT body FROM articles').get().body, '原正文');
    assert.equal(runtime.db.prepare('SELECT count(*) AS n FROM comments').get().n, 0);
    assert.equal(runtime.db.prepare('SELECT count(*) AS n FROM files').get().n, 0);
  } finally {
    runtime.close();
    assert.ok(resolve(dataDir).startsWith(root + sep));
    rmSync(dataDir, { recursive: true, force: true });
  }
});
