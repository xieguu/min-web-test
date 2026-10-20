import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from './database.js';

export function promoteAdmin({ dataDir, email }) {
  if (typeof email !== 'string' || !email.trim()) throw new Error('请提供已注册账号的邮箱');
  if (!existsSync(join(dataDir, 'site.sqlite'))) throw new Error('该数据目录中没有数据库，请确认 APP_DATA_DIR，并先通过网站注册账号');
  const db = openDatabase(dataDir);
  try {
    const result = db.prepare('UPDATE users SET level = 3, disabled = 0, session_version = session_version + 1 WHERE email = ? COLLATE NOCASE').run(email.trim());
    if (!result.changes) throw new Error('没有找到这个邮箱，请先在网站注册该账号');
    return db.prepare('SELECT email, level FROM users WHERE email = ? COLLATE NOCASE').get(email.trim());
  } finally { db.close(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const user = promoteAdmin({ dataDir: resolve(process.env.APP_DATA_DIR || 'data'), email: process.argv[2] });
    console.log(`${user.email} 已设为 LV${user.level} 管理员。请在网站重新登录。`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
