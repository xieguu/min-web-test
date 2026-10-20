import express from 'express';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';

const htmlEscape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const exercises = [
  { id: 'sqli', name: '商品搜索', kind: 'SQL 注入', method: 'GET', path: '/api/lab/search', goal: '让搜索结果返回未上架的商品。', fixed: '参数绑定，公开条件始终参与查询。' },
  { id: 'idor', name: '私人笔记', kind: '对象越权', method: 'GET', path: '/api/lab/notes/:id', goal: '使用 Alice 身份读取 Bob 的笔记。', fixed: '校验笔记 owner 与当前练习身份。' },
  { id: 'xss', name: '留言预览', kind: '存储型 XSS', method: 'POST', path: '/api/lab/messages', goal: '保存一条留言，让预览页面执行代码并改变页面文字。', fixed: '对留言做 HTML 转义，再插入页面。' },
];

export function createLab({ dataDir, requireUser, requireAdmin, field, fail }) {
  // Intentionally vulnerable branches below operate on fixtures in a separate database.
  const db = new DatabaseSync(join(dataDir, 'lab.sqlite'));
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  const version = db.prepare('PRAGMA user_version').get().user_version;
  if (![0, 1].includes(version)) { db.close(); throw new Error(`不支持的靶场数据库版本：${version}`); }
  const seed = () => {
    db.exec('BEGIN');
    try {
      db.exec('DELETE FROM products; DELETE FROM notes; DELETE FROM messages; DELETE FROM events;');
      const product = db.prepare('INSERT INTO products VALUES (?, ?, ?, ?)');
      product.run(1, '帆布笔记本', 29, 1);
      product.run(2, '黑色签字笔', 12, 1);
      product.run(3, '桌面收纳盒', 49, 1);
      product.run(4, '未上架样品 · LAB_SQLI_FOUND', 199, 0);
      const note = db.prepare('INSERT INTO notes VALUES (?, ?, ?, ?)');
      note.run(1001, 'alice', 'Alice 的测试计划', '先记录正常请求，再尝试修改对象编号。');
      note.run(1002, 'bob', 'Bob 的私人笔记', 'LAB_IDOR_FOUND：这条笔记只应由 Bob 读取。');
      db.prepare('INSERT INTO messages (author, body, created_at) VALUES (?, ?, ?)').run('MIN LAB', '这是一条普通留言。试着写入一条新的内容，再查看预览。', new Date().toISOString());
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  };
  if (version === 0) {
    db.exec(`
      CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT NOT NULL, price INTEGER NOT NULL, visible INTEGER NOT NULL);
      CREATE TABLE notes (id INTEGER PRIMARY KEY, owner TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL);
      CREATE TABLE messages (id INTEGER PRIMARY KEY AUTOINCREMENT, author TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, actor TEXT NOT NULL, mode TEXT NOT NULL, method TEXT NOT NULL, path TEXT NOT NULL, status INTEGER NOT NULL, created_at TEXT NOT NULL);
    `);
    seed();
    db.exec('PRAGMA user_version = 1;');
  }
  const router = express.Router();
  router.use(requireUser);
  router.use((req, _res, next) => {
    req.labActor = req.session.labActor || 'alice';
    const mode = req.query.mode ?? 'vulnerable';
    if (!['vulnerable', 'fixed'].includes(mode)) return next(fail(400, '模式只能是 vulnerable 或 fixed'));
    req.labMode = mode;
    next();
  });
  router.use((req, res, next) => {
    const userId = req.user.id, actor = req.labActor, mode = req.labMode;
    if (req.path !== '/events' && req.path !== '/') res.on('finish', () => {
      db.prepare('INSERT INTO events (user_id, actor, mode, method, path, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(userId, actor, mode, req.method, '/api/lab' + req.path, res.statusCode, new Date().toISOString());
      db.exec('DELETE FROM events WHERE id NOT IN (SELECT id FROM events ORDER BY id DESC LIMIT 500)');
    });
    next();
  });
  router.get('/', (req, res) => res.json({ actor: req.labActor, mode: req.labMode, exercises, actors: ['alice', 'bob'] }));
  router.post('/actor', (req, res) => {
    if (!['alice', 'bob'].includes(req.body?.actor)) throw fail(400, '练习身份只能是 alice 或 bob');
    req.session.labActor = req.body.actor;
    res.json({ actor: req.session.labActor });
  });
  router.get('/search', (req, res) => {
    const q = field(req.query.q ?? '', '关键词', 0, 200);
    let products;
    if (req.labMode === 'fixed') {
      products = db.prepare('SELECT id, name, price FROM products WHERE visible = 1 AND name LIKE ? ORDER BY id').all(`%${q}%`);
    } else {
      // Training sink: string concatenation is intentional; do not use in normal APIs.
      try {
        products = db.prepare(`SELECT id, name, price FROM products WHERE visible = 1 AND name LIKE '%${q}%' ORDER BY id`).all();
      } catch (error) {
        if (error.code !== 'ERR_SQLITE_ERROR') throw error;
        throw fail(400, `SQL 查询错误：${error.message}`);
      }
    }
    res.json({ mode: req.labMode, products: products.slice(0, 100) });
  });
  router.get('/notes/:id', (req, res) => {
    if (!/^\d{1,8}$/.test(req.params.id)) throw fail(400, '笔记编号必须为整数');
    const note = db.prepare('SELECT * FROM notes WHERE id = ?').get(Number(req.params.id));
    if (!note) throw fail(404, '笔记不存在');
    if (req.labMode === 'fixed' && note.owner !== req.labActor) throw fail(403, '当前练习身份无权读取这条笔记');
    res.json({ mode: req.labMode, actor: req.labActor, note });
  });
  router.get('/messages', (_req, res) => res.json({ messages: db.prepare('SELECT * FROM messages ORDER BY id').all() }));
  router.post('/messages', (req, res) => {
    const body = field(req.body?.body, '留言', 1, 2000);
    if (db.prepare('SELECT count(*) AS count FROM messages').get().count >= 100) throw fail(409, '已达到 100 条留言，请重置练习数据');
    const result = db.prepare('INSERT INTO messages (author, body, created_at) VALUES (?, ?, ?)').run(req.labActor, body, new Date().toISOString());
    res.status(201).json({ message: db.prepare('SELECT * FROM messages WHERE id = ?').get(result.lastInsertRowid) });
  });
  router.get('/messages/preview', (req, res) => {
    const messages = db.prepare('SELECT * FROM messages ORDER BY id').all();
    // Opaque-origin sandbox permits the exercise's scripts but no access to the parent app.
    res.set('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'; sandbox allow-scripts");
    res.type('html').send(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>留言练习预览</title><style>body{font:14px/1.8 system-ui,sans-serif;color:#343e48;padding:14px;margin:0}article{padding:12px;border-bottom:1px solid #e6e8ed;overflow-wrap:anywhere}small{color:#88919c}p{white-space:pre-wrap;margin:8px 0}</style><body><h3>留言板 · ${req.labMode === 'fixed' ? '修复模式' : '漏洞模式'}</h3>${messages.map(message => `<article><small>${htmlEscape(message.author)}</small><p>${req.labMode === 'fixed' ? htmlEscape(message.body) : message.body}</p></article>`).join('')}</body></html>`);
  });
  router.get('/events', (req, res) => res.json({ events: db.prepare('SELECT actor, mode, method, path, status, created_at FROM events WHERE user_id = ? ORDER BY id DESC LIMIT 30').all(req.user.id) }));
  router.post('/reset', requireAdmin, (req, res) => {
    if (req.body?.confirmation !== 'RESET') throw fail(400, '请输入 RESET 确认重置练习数据');
    seed();
    req.session.labActor = 'alice';
    res.json({ ok: true, actor: 'alice' });
  });
  return { router, close: () => db.close() };
}
