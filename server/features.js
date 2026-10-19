import multer from 'multer';
import { randomUUID } from 'node:crypto';

export function mountFeatures(app, { db, requireUser, field, fail }) {
  const commentSelect = `SELECT c.*, u.name AS author_name FROM comments c JOIN users u ON c.author_id = u.id`;
  const fileColumns = 'id, owner_id, name, mime, size, created_at';
  const articleExists = id => {
    if (!db.prepare('SELECT id FROM articles WHERE id = ?').get(id)) throw fail(404, '文章不存在');
  };
  app.get('/api/articles/:id/comments', (req, res) => {
    articleExists(req.params.id);
    res.json({ comments: db.prepare(`${commentSelect} WHERE article_id = ? ORDER BY created_at, id`).all(req.params.id) });
  });
  app.post('/api/articles/:id/comments', requireUser, (req, res) => {
    articleExists(req.params.id);
    const body = field(req.body?.body, '评论', 1, 2000);
    const id = randomUUID();
    db.prepare('INSERT INTO comments VALUES (?, ?, ?, ?, ?)').run(id, req.params.id, req.user.id, body, new Date().toISOString());
    res.status(201).json({ comment: db.prepare(`${commentSelect} WHERE c.id = ?`).get(id) });
  });
  app.delete('/api/comments/:id', requireUser, (req, res) => {
    const comment = db.prepare('SELECT author_id FROM comments WHERE id = ?').get(req.params.id);
    if (!comment) throw fail(404, '评论不存在');
    if (comment.author_id !== req.user.id) throw fail(403, '只能删除自己的评论');
    db.prepare('DELETE FROM comments WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  const upload = multer({
    storage: multer.memoryStorage(), defParamCharset: 'utf8',
    limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 0, parts: 1 },
  }).single('file');
  app.get('/api/files', requireUser, (req, res) => {
    res.json({ files: db.prepare(`SELECT ${fileColumns} FROM files WHERE owner_id = ? ORDER BY created_at DESC`).all(req.user.id), limits: { count: 20, bytes: 2 * 1024 * 1024 } });
  });
  app.post('/api/files', requireUser, upload, (req, res) => {
    if (!req.file) throw fail(400, '请选择一个文件，表单字段名为 file');
    if (db.prepare('SELECT count(*) AS count FROM files WHERE owner_id = ?').get(req.user.id).count >= 20) {
      throw fail(409, '最多保留 20 个文件，请先删除不需要的文件');
    }
    const name = field(req.file.originalname, '文件名', 1, 180);
    if (/[\x00-\x1f\x7f/\\]/.test(name)) throw fail(400, '文件名包含无效字符');
    const id = randomUUID();
    db.prepare('INSERT INTO files VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, req.user.id, name, req.file.mimetype, req.file.size, req.file.buffer, new Date().toISOString());
    res.status(201).json({ file: db.prepare(`SELECT ${fileColumns} FROM files WHERE id = ?`).get(id) });
  });
  const ownedFile = req => {
    const file = db.prepare('SELECT * FROM files WHERE id = ?').get(req.params.id);
    if (!file) throw fail(404, '文件不存在');
    if (file.owner_id !== req.user.id) throw fail(403, '只能访问自己的文件');
    return file;
  };
  app.get('/api/files/:id/download', requireUser, (req, res) => {
    const file = ownedFile(req);
    res.attachment(file.name).type('application/octet-stream').send(Buffer.from(file.content));
  });
  app.delete('/api/files/:id', requireUser, (req, res) => {
    ownedFile(req);
    db.prepare('DELETE FROM files WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });
}
