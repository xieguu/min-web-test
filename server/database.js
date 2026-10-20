import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const initialArticles = [
  {
    id: 'welcome', title: '从这里开始，少一点复杂。', category: '入门指南',
    summary: '一个账号，一些内容。把日常测试需要的基础功能，放在一个干净的地方。',
    body: '欢迎来到 MIN。\n\n这里是一个简单的测试网站。你可以浏览内容、创建账号，并发布自己的第一篇文章。\n\n开始使用\n\n点击右上角「创建账号」，填写昵称、邮箱和密码。注册成功后会自动登录，接下来就可以点击「发布内容」。\n\n内容会保存在哪里？\n\n账号和文章保存在服务端的本地数据库中。刷新页面或重启服务后，已经保存的内容仍然存在。\n\n保持简单\n\n这里只保留必要的功能。你可以用它验证表单、登录状态、内容操作，以及不同屏幕下的页面表现。',
  },
  {
    id: 'account-guide', title: '你的账号，刚刚好。', category: '使用说明',
    summary: '注册、登录、修改昵称与退出。一个完整而轻量的账号使用流程。',
    body: '创建一个属于你的账号。\n\n注册时填写昵称、邮箱和密码。密码需要 8–64 个字符，最多 72 字节；邮箱用于后续登录。\n\n登录后，点击导航中的「我的账号」即可查看个人资料、修改昵称，以及找到自己发布的内容。\n\n退出登录后仍然可以浏览公开内容，发布和编辑需要重新登录。每个人只能修改或删除自己发布的文章。',
  },
  {
    id: 'writing-guide', title: '把想法写下来。', category: '使用说明',
    summary: '从一个标题开始，添加正文与分类，发布你的第一篇内容。',
    body: '不需要复杂的排版，也可以把事情说清楚。\n\n点击「发布内容」，依次填写标题、摘要、分类和正文。摘要可以留空，列表会展示正文的前一部分。\n\n发布之后\n\n文章会出现在内容列表中。打开详情页，可以继续编辑或删除自己发布的内容。\n\n如何找到内容\n\n在首页搜索标题或正文，也可以按分类筛选。进入「我的内容」，只查看自己发布的文章。\n\n正文使用纯文本显示，段落和换行都会保留。',
  },
  {
    id: 'first-release', title: '小小的开始，版本 1.0。', category: '更新记录',
    summary: '基础账号、内容管理和响应式页面已就位。让测试从简单的地方开始。',
    body: 'MIN 1.0 已准备就绪。\n\n这一版包含：\n\n· 账号注册、登录与退出\n· 个人资料与昵称修改\n· 内容列表、搜索与分类\n· 内容发布、阅读、编辑与删除\n· 适配桌面和手机的页面\n\n这是一个小而完整的起点。你可以在这里检查基础流程，也可以继续扩展需要的功能。',
  },
];

export function openDatabase(dataDir) {
  mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(join(dataDir, 'site.sqlite'));
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  const version = db.prepare('PRAGMA user_version').get().user_version;
  if (version === 0) {
    db.exec(`
      BEGIN;
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL COLLATE NOCASE UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE articles (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        body TEXT NOT NULL,
        category TEXT NOT NULL,
        author_id TEXT REFERENCES users(id),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX articles_author ON articles(author_id);
    `);
    try {
      const insert = db.prepare('INSERT INTO articles VALUES (?, ?, ?, ?, ?, NULL, ?, ?)');
      initialArticles.forEach((article, index) => {
        const date = new Date(Date.now() - index * 86400000).toISOString();
        insert.run(article.id, article.title, article.summary, article.body, article.category, date, date);
      });
      db.exec('PRAGMA user_version = 1; COMMIT;');
    } catch (error) {
      db.exec('ROLLBACK;');
      db.close();
      throw error;
    }
  } else if (version > 4) {
    db.close();
    throw new Error(`不支持的数据库版本：${version}`);
  }
  if (version < 2) {
    try {
      db.exec(`
        BEGIN;
        CREATE TABLE comments (
          id TEXT PRIMARY KEY,
          article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
          author_id TEXT NOT NULL REFERENCES users(id),
          body TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE INDEX comments_article ON comments(article_id, created_at);
        CREATE TABLE files (
          id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL REFERENCES users(id),
          name TEXT NOT NULL,
          mime TEXT NOT NULL,
          size INTEGER NOT NULL,
          content BLOB NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE INDEX files_owner ON files(owner_id);
        PRAGMA user_version = 2;
        COMMIT;
      `);
    } catch (error) {
      db.exec('ROLLBACK;');
      db.close();
      throw error;
    }
  }
  if (version < 3) {
    try {
      db.exec(`
        BEGIN;
        ALTER TABLE users ADD COLUMN level INTEGER NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 3);
        ALTER TABLE users ADD COLUMN disabled INTEGER NOT NULL DEFAULT 0 CHECK (disabled IN (0, 1));
        ALTER TABLE users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0;
        PRAGMA user_version = 3;
        COMMIT;
      `);
    } catch (error) {
      db.exec('ROLLBACK;');
      db.close();
      throw error;
    }
  }
  if (version < 4) {
    try {
      db.exec(`
        BEGIN;
        ALTER TABLE users ADD COLUMN email_verified_at TEXT;
        CREATE TABLE registration_codes (
          email TEXT PRIMARY KEY COLLATE NOCASE,
          nonce TEXT NOT NULL,
          code_hash TEXT NOT NULL,
          expires_at INTEGER NOT NULL,
          resend_at INTEGER NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0,
          delivered INTEGER NOT NULL DEFAULT 0
        );
        PRAGMA user_version = 4;
        COMMIT;
      `);
    } catch (error) {
      db.exec('ROLLBACK;');
      db.close();
      throw error;
    }
  }
  return db;
}
