# MIN LAB · 自用 Web 测试靶场

一个本地运行的极简 Web 靶场，包含基础业务功能和可切换漏洞 / 修复模式的练习场景。

## 启动

需要 **Node.js 24 或更高版本**。

```sh
npm install
npm run dev
```

打开 http://127.0.0.1:3000 。不需要构建、不需要单独安装数据库。

普通启动使用 `npm start`。Windows PowerShell 如果阻止执行 `npm.ps1`，使用 `npm.cmd` 运行相同命令。

首次启动会建立 `data/site.sqlite` 并写入四篇示例文章。通过页面「创建账号」注册即可使用；没有内置账号或默认密码。

## 功能

- 账号：注册、登录、退出、修改昵称、保留登录状态。
- 内容：首页列表、标题和正文搜索、分类筛选、详情页。
- 管理：登录后发布内容，只能编辑或删除自己发布的内容。
- 评论：文章下留言、删除自己的评论；文章删除时关联评论一并删除。
- 文件：上传、下载和删除个人文件，支持中文名；每账号 20 个文件，每文件 2 MiB。
- 靶场：SQL 注入、对象越权、存储型 XSS，支持漏洞 / 修复模式对照、练习身份切换、请求记录、数据重置。
- 界面：中文、桌面与手机布局、错误提示、空列表、提交状态、删除确认。

文章公开可读，正文按纯文本显示。账号邮箱为登录标识，当前版本不提供邮箱验证、找回密码、邮件发送或管理后台。

## 技术与文件

前端使用 HTML、CSS 和原生 JavaScript；后端使用 Express、Node.js 内置 SQLite、bcryptjs、express-session、session-file-store 和 Multer。会话由服务端保存，密码使用 bcrypt 哈希；普通业务 SQL 使用参数绑定，靶场 SQLi 场景在漏洞模式下刻意使用字符串拼接。写入接口需要同源自定义请求头。

```text
public/             页面、样式和浏览器交互
server/app.js       账号与内容接口、会话、校验
server/database.js  数据表与首次启动示例内容
server/features.js  评论与文件接口
server/lab.js       三种漏洞练习与独立练习数据
server/index.js     HTTP 服务入口
docs/requests.http  可修改重放的 HTTP 请求样例
docs/LAB.md         测试入口、预期现象与对照步骤
tests/              接口和浏览器流程测试
data/               运行时数据库、会话及随机会话密钥（不提交 Git）
```

参考：[Express 会话文档](https://expressjs.com/en/resources/middleware/session/)、[session-file-store](https://github.com/valery-barysok/session-file-store)、[Node.js SQLite 文档](https://nodejs.org/api/sqlite.html)、[Multer 上传中间件](https://expressjs.com/en/resources/middleware/multer/)。

`data/site.sqlite` 存账号、文章、评论和文件；文件原始字节直接保存在 SQLite BLOB 中。`data/lab.sqlite` 只存靶场示例商品、笔记、留言和请求记录。首次使用新版时，原有 v1 数据库会自动升级到 v2，保留已有账号和文章。

## 开始练习

注册并登录后访问 http://127.0.0.1:3000/lab 。默认进入漏洞模式，顶部可以切换到修复模式；页面提供正常表单、原始 JSON 响应和可展开提示，也可以使用浏览器开发者工具或 HTTP 代理修改请求。

| 场景 | 漏洞模式 | 修复模式 |
| --- | --- | --- |
| 商品搜索 | 搜索条件拼接，能够返回隐藏商品 | 参数绑定，保留公开条件 |
| 私人笔记 | 仅按编号读取，Alice 可以读取 Bob 的笔记 | 校验当前练习身份与笔记归属 |
| 留言预览 | 保存的 HTML 原样插入预览页，脚本可以改变预览文字 | HTML 转义，输入作为文字显示 |

练习身份 Alice / Bob 与登录账号分开，选择保存在当前会话中；运行模式作为每次请求的 `mode` 参数传递。练习数据在该站点内共享，请求记录按登录账号显示。XSS 在独立的 iframe 沙箱中执行，使用 DOM 文字变化观察结果，无法访问父页面登录环境。

页面底部输入 `RESET` 可以恢复练习数据。此操作只修改 `lab.sqlite`，不会清空账号、文章、评论或个人文件。具体步骤见 [靶场说明](docs/LAB.md)。

## 配置

| 环境变量 | 默认值 | 用途 |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | 服务监听地址 |
| `PORT` | `3000` | 监听端口 |
| `APP_DATA_DIR` | `data` | 数据、会话与密钥目录 |
| `SESSION_SECRET` | 首次启动生成并保存在数据目录 | 自定义密钥，至少 32 字符 |
| `SECURE_COOKIE` | 未启用 | 设为 `1` 时仅通过 HTTPS 发送会话 Cookie |

默认针对单机本地测试。停止服务后备份整个 `data/` 目录即可保留数据库、会话与密钥。删除该目录会重置所有数据。会话有效期为七天。

## 接口

| 方法 | 路径 | 功能 |
| --- | --- | --- |
| GET | `/api/session` | 当前账号 |
| POST | `/api/auth/register` | 注册：`name, email, password` |
| POST | `/api/auth/login` | 登录：`email, password` |
| POST | `/api/auth/logout` | 退出 |
| PATCH | `/api/account` | 修改昵称：`name` |
| GET | `/api/articles?q=&category=&mine=1` | 内容列表；查询参数均可选 |
| GET | `/api/articles/:id` | 内容详情 |
| POST | `/api/articles` | 发布：`title, body, category, summary`（摘要选填） |
| PATCH | `/api/articles/:id` | 更新自己的内容，字段同发布 |
| DELETE | `/api/articles/:id` | 删除自己的内容 |
| GET / POST | `/api/articles/:id/comments` | 读取 / 发布评论；发布字段为 `body` |
| DELETE | `/api/comments/:id` | 删除自己的评论 |
| GET / POST | `/api/files` | 列出 / 上传个人文件；上传字段为 `file` |
| GET | `/api/files/:id/download` | 下载自己的文件 |
| DELETE | `/api/files/:id` | 删除自己的文件 |
| GET | `/api/lab` | 场景信息与当前练习身份 |
| POST | `/api/lab/actor` | 切换练习身份：`actor` 为 `alice` / `bob` |
| GET | `/api/lab/search?mode=vulnerable&q=` | 商品搜索，`mode` 可改为 `fixed` |
| GET | `/api/lab/notes/:id?mode=vulnerable` | 读取练习笔记 |
| GET / POST | `/api/lab/messages` | 查看 / 保存练习留言；发布字段为 `body` |
| GET | `/api/lab/messages/preview?mode=vulnerable` | HTML 留言预览 |
| GET | `/api/lab/events` | 当前账号最近 30 条练习请求；全站保留最近 500 条 |
| POST | `/api/lab/reset` | 重置练习数据：`confirmation` 必须为 `RESET` |

JSON 写入请求使用 `Content-Type: application/json` 和 `X-Requested-With: min-web-test`；上传改用 `multipart/form-data`，保留同一自定义请求头。登录后携带服务端返回的 `min.sid` Cookie。注册和登录共用每 IP 每 15 分钟 40 次的限流。

## 验证

```sh
npm run check
npm test
npm run test:ui
```

接口测试使用独立临时数据库，覆盖输入校验、密码哈希、会话、权限隔离、评论级联、二进制文件、三类漏洞对照、重置边界、重启持久化与 v1 数据库升级。测试不会操作 `data/` 中的实际数据。

浏览器测试使用本机 Microsoft Edge，在独立端口 `3107` 和 `test-results/` 数据目录中运行，覆盖桌面使用流程、三类漏洞的实际页面效果和手机布局。截图保存在 `test-results/`，包括 `lab-desktop.png` 和 `lab-mobile.png`。其他系统可将 `playwright.config.js` 的 `channel` 改为已安装的浏览器，或安装 Playwright Chromium 后移除该配置。
