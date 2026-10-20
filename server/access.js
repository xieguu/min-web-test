export const USER_COLUMNS = 'id, name, email, created_at, level, disabled, email_verified_at';
export const LEVELS = [
  { level: 1, name: '普通用户', description: '发布和管理自己的文章、发表评论。' },
  { level: 2, name: '测试员', description: '包含 LV1 权限，并可管理自己的文件和进入自测靶场。' },
  { level: 3, name: '管理员', description: '包含 LV2 权限，并可管理账号等级、禁用账号、重置共享练习数据。' },
];

export function createAccess(fail) {
  const requireUser = (req, _res, next) => next(req.user ? undefined : fail(401, '请先登录'));
  const minimumLevel = minimum => (req, _res, next) => {
    if (!req.user) return next(fail(401, '请先登录'));
    if (req.user.level < minimum) return next(fail(403, `此功能需要 LV${minimum} ${LEVELS[minimum - 1].name}权限，请联系管理员升级`));
    next();
  };
  return { requireUser, requireTester: minimumLevel(2), requireAdmin: minimumLevel(3) };
}

export function mountAdmin(app, { db, requireAdmin, fail }) {
  app.get('/api/admin/users', requireAdmin, (_req, res) => {
    res.json({ users: db.prepare(`SELECT ${USER_COLUMNS} FROM users ORDER BY created_at DESC, id`).all(), levels: LEVELS });
  });
  app.patch('/api/admin/users/:id', requireAdmin, (req, res) => {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body) || !Object.keys(body).length || Object.keys(body).some(key => !['level', 'disabled'].includes(key))) {
      throw fail(400, '仅支持修改 level 和 disabled');
    }
    if (body.level !== undefined && (!Number.isInteger(body.level) || body.level < 1 || body.level > 3)) throw fail(400, '等级必须为 1、2 或 3');
    if (body.disabled !== undefined && typeof body.disabled !== 'boolean') throw fail(400, 'disabled 必须为布尔值');
    const target = db.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`).get(req.params.id);
    if (!target) throw fail(404, '账号不存在');
    const level = body.level ?? target.level;
    const disabled = body.disabled === undefined ? target.disabled : Number(body.disabled);
    if (target.id === req.user.id && (disabled || level !== 3)) throw fail(400, '不能禁用或降低当前管理员自己的等级');
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('UPDATE users SET level = ?, disabled = ?, session_version = session_version + CASE WHEN disabled <> ? THEN 1 ELSE 0 END WHERE id = ?')
        .run(level, disabled, disabled, target.id);
      if (!db.prepare('SELECT count(*) AS count FROM users WHERE level = 3 AND disabled = 0').get().count) throw fail(400, '至少需要保留一个可用的管理员账号');
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    res.json({ user: db.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`).get(target.id) });
  });
}
