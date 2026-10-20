import express from 'express';
import session from 'express-session';
import createFileStore from 'session-file-store';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { openDatabase } from './database.js';
import { mountFeatures } from './features.js';
import { createLab } from './lab.js';
import multer from 'multer';
import { createAccess, mountAdmin, USER_COLUMNS, LEVELS } from './access.js';

const FileStore = createFileStore(session);
const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
export const categories = ['入门指南', '使用说明', '更新记录', '随手记录'];
const userColumns = USER_COLUMNS;
const articleQuery = `SELECT a.*, COALESCE(u.name, 'MIN 编辑部') AS author_name
  FROM articles a LEFT JOIN users u ON a.author_id = u.id`;

function fail(status, message) {
  return Object.assign(new Error(message), { status });
}
function field(value, label, min, max) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) {
    throw fail(400, `${label}需要 ${min}–${max} 个字符`);
  }
  return value.trim();
}
function emailField(value) {
  const email = field(value, '邮箱', 3, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail(400, '请输入有效的邮箱地址');
  return email;
}
function passwordField(value) {
  if (typeof value !== 'string' || value.length < 8 || value.length > 64 || Buffer.byteLength(value) > 72) {
    throw fail(400, '密码需要 8–64 个字符，且不能超过 72 字节');
  }
  return value;
}
function articleFields(data) {
  const title = field(data.title, '标题', 1, 100);
  const body = field(data.body, '正文', 1, 20000);
  const summary = data.summary === undefined ? '' : field(data.summary, '摘要', 0, 200);
  if (!categories.includes(data.category)) throw fail(400, '请选择有效的分类');
  return { title, body, summary: summary || body.slice(0, 100), category: data.category };
}

export function createApp({ dataDir, sessionSecret, secureCookie = false } = {}) {
  if (!dataDir) throw new Error('必须指定数据目录');
  const db = openDatabase(dataDir);
  const secretPath = join(dataDir, 'session-secret');
  if (!sessionSecret) {
    if (!existsSync(secretPath)) writeFileSync(secretPath, randomBytes(48).toString('hex'), { mode: 0o600, flag: 'wx' });
    sessionSecret = readFileSync(secretPath, 'utf8').trim();
  }
  if (sessionSecret.length < 32) throw new Error('SESSION_SECRET 至少需要 32 个字符');

  const app = express();
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: { directives: { 'upgrade-insecure-requests': null } } }));
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('X-Requested-With') !== 'min-web-test') {
      return next(fail(403, '请求校验失败，请刷新页面后重试'));
    }
    next();
  });
  app.use('/api', express.json({ limit: '128kb' }));
  const store = new FileStore({ path: join(dataDir, 'sessions'), retries: 0, ttl: 604800, reapInterval: 3600 });
  app.use('/api', session({
    name: 'min.sid', secret: sessionSecret, store, resave: false, saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', secure: secureCookie, maxAge: 7 * 86400000 },
  }));
  app.use('/api', (req, _res, next) => {
    const user = req.session.userId ? db.prepare(`SELECT ${userColumns}, session_version FROM users WHERE id = ?`).get(req.session.userId) : null;
    const valid = user && !user.disabled && user.session_version === (req.session.userVersion ?? 0);
    req.user = valid ? Object.fromEntries(Object.entries(user).filter(([key]) => key !== 'session_version')) : null;
    if (req.session.userId && !valid) { delete req.session.userId; delete req.session.userVersion; }
    next();
  });
  const authLimit = rateLimit({
    windowMs: 15 * 60000, limit: 40, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: '操作过于频繁，请在 15 分钟后重试' },
  });
  const { requireUser, requireTester, requireAdmin } = createAccess(fail);
  const establishSession = (req, userId) => new Promise((resolve, reject) => {
    req.session.regenerate(error => {
      if (error) return reject(error);
      req.session.userId = userId;
      req.session.userVersion = db.prepare('SELECT session_version FROM users WHERE id = ?').get(userId).session_version;
      req.session.save(error => error ? reject(error) : resolve());
    });
  });
  const ownedArticle = req => {
    const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(req.params.id);
    if (!article) throw fail(404, '这篇内容不存在或已被删除');
    if (article.author_id !== req.user.id) throw fail(403, '只能修改自己发布的内容');
    return article;
  };

  app.get('/api/session', (req, res) => res.json({ user: req.user || null, levels: LEVELS }));
  app.post('/api/auth/register', authLimit, async (req, res) => {
    const name = field(req.body?.name, '昵称', 2, 24);
    const email = emailField(req.body?.email);
    const password = passwordField(req.body?.password);
    const hash = await bcrypt.hash(password, 12);
    const id = randomUUID();
    const result = db.prepare('INSERT INTO users (id, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(email) DO NOTHING')
      .run(id, name, email, hash, new Date().toISOString());
    if (!result.changes) throw fail(409, '这个邮箱已经注册，请直接登录');
    await establishSession(req, id);
    res.status(201).json({ user: db.prepare(`SELECT ${userColumns} FROM users WHERE id = ?`).get(id) });
  });
  app.post('/api/auth/login', authLimit, async (req, res) => {
    const email = emailField(req.body?.email);
    const password = passwordField(req.body?.password);
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || !await bcrypt.compare(password, user.password_hash)) throw fail(401, '邮箱或密码不正确');
    if (user.disabled) throw fail(403, '账号已被禁用，请联系管理员');
    await establishSession(req, user.id);
    res.json({ user: db.prepare(`SELECT ${userColumns} FROM users WHERE id = ?`).get(user.id) });
  });
  app.post('/api/auth/logout', requireUser, (req, res, next) => {
    req.session.destroy(error => {
      if (error) return next(error);
      res.clearCookie('min.sid', { path: '/', httpOnly: true, sameSite: 'lax', secure: secureCookie });
      res.json({ ok: true });
    });
  });
  app.patch('/api/account', requireUser, (req, res) => {
    const name = field(req.body?.name, '昵称', 2, 24);
    db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, req.user.id);
    res.json({ user: db.prepare(`SELECT ${userColumns} FROM users WHERE id = ?`).get(req.user.id) });
  });
  app.get('/api/articles', (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
    const category = typeof req.query.category === 'string' ? req.query.category : '';
    const mine = req.query.mine === '1';
    if (mine && !req.user) throw fail(401, '请先登录');
    if (category && !categories.includes(category)) throw fail(400, '分类不存在');
    const conditions = [], values = [];
    if (q) { conditions.push('(instr(a.title, ?) > 0 OR instr(a.body, ?) > 0)'); values.push(q, q); }
    if (category) { conditions.push('a.category = ?'); values.push(category); }
    if (mine) { conditions.push('a.author_id = ?'); values.push(req.user.id); }
    const articles = db.prepare(`${articleQuery}${conditions.length ? ' WHERE ' + conditions.join(' AND ') : ''} ORDER BY a.created_at DESC, a.id DESC`)
      .all(...values).map(({ body, ...article }) => ({ ...article, reading_minutes: Math.max(1, Math.ceil(body.length / 400)) }));
    res.json({ articles, categories });
  });
  app.get('/api/articles/:id', (req, res) => {
    const article = db.prepare(`${articleQuery} WHERE a.id = ?`).get(req.params.id);
    if (!article) throw fail(404, '这篇内容不存在或已被删除');
    res.json({ article });
  });
  app.post('/api/articles', requireUser, (req, res) => {
    const article = articleFields(req.body || {});
    const id = randomUUID(), now = new Date().toISOString();
    db.prepare('INSERT INTO articles VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, article.title, article.summary, article.body, article.category, req.user.id, now, now);
    res.status(201).json({ article: db.prepare(`${articleQuery} WHERE a.id = ?`).get(id) });
  });
  app.patch('/api/articles/:id', requireUser, (req, res) => {
    ownedArticle(req);
    const article = articleFields(req.body || {});
    db.prepare('UPDATE articles SET title = ?, summary = ?, body = ?, category = ?, updated_at = ? WHERE id = ?')
      .run(article.title, article.summary, article.body, article.category, new Date().toISOString(), req.params.id);
    res.json({ article: db.prepare(`${articleQuery} WHERE a.id = ?`).get(req.params.id) });
  });
  app.delete('/api/articles/:id', requireUser, (req, res) => {
    ownedArticle(req);
    db.prepare('DELETE FROM articles WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });
  mountFeatures(app, { db, requireUser, requireTester, field, fail });
  mountAdmin(app, { db, requireAdmin, fail });
  const lab = createLab({ dataDir, requireUser: requireTester, requireAdmin, field, fail });
  app.use('/api/lab', lab.router);
  app.use('/api', (_req, _res, next) => next(fail(404, '接口不存在')));
  app.use(express.static(publicDir));
  app.get(['/', '/login', '/register', '/account', '/write', '/files', '/lab', '/admin', '/articles/:id', '/articles/:id/edit'], (_req, res) => {
    res.sendFile(join(publicDir, 'index.html'));
  });
  app.use((_req, res) => res.status(404).sendFile(join(publicDir, '404.html')));
  app.use((error, _req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof multer.MulterError) {
      return res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? '单个文件不能超过 2 MiB' : '每次只接受一个文件，字段名为 file' });
    }
    const status = error.status || 500;
    if (status >= 500) console.error(error);
    const message = error.type === 'entity.parse.failed' ? '请求 JSON 格式不正确'
      : error.type === 'entity.too.large' ? '提交内容过大'
      : status >= 500 ? '服务器发生错误，请稍后重试' : error.message;
    res.status(status).json({ error: message });
  });
  return { app, db, close() { clearInterval(store.options.reapIntervalObject); lab.close(); db.close(); } };
}
