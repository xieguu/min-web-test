# MIN LAB · 自用 Web 测试靶场

一个本地运行的极简 Web 靶场，包含基础业务功能和可切换漏洞 / 修复模式的练习场景。

## 从哪里开始

| 运行方式 | 操作位置 | 浏览器访问地址 |
| --- | --- | --- |
| 部署到 Ubuntu 服务器 | 按下面「服务器部署」操作 | 建立 SSH 转发后访问 `http://127.0.0.1:3001` |
| 在 Windows 电脑运行 | 按「本地启动」操作 | `http://127.0.0.1:3000` |
| 已经打开网站 | 从「第一次使用」开始 | 导航中的「自测靶场」 |

## 服务器部署：从 GitHub 下载

适用于 Ubuntu 22.04，以下安装命令使用 root 账号。看到 `root@...:~#` 的是服务器窗口；看到 `C:\Users\...>` 或 `PS C:\...>` 的是 Windows 窗口。

### 1. 在服务器窗口下载代码

SSH 登录服务器后执行：

```bash
apt-get update
apt-get install -y git
git clone https://github.com/xieguu/min-web-test.git /opt/min-web-test/app
```

之前只执行过 `mkdir -p /opt/min-web-test/app`、该目录仍为空，可以直接运行上面的克隆命令。通过 GitHub 下载代码后，不需要上传或解压 `min-web-test.tar.gz`。

如果该目录已经是本项目的 Git 仓库，改用更新命令：

```bash
git -C /opt/min-web-test/app pull --ff-only
```

### 2. 在服务器窗口安装并启动

```bash
bash /opt/min-web-test/app/deploy/install.sh
```

脚本会安装独立的 Node.js 24.22.0 和生产依赖，创建 `minweb` 运行账号，配置 systemd 后台运行和开机自启。正常结束时会显示：

```text
MIN LAB is running at http://127.0.0.1:3000
Database and sessions: /var/lib/min-web-test
```

检查是否启动成功：

```bash
curl http://127.0.0.1:3000/api/session
systemctl status min-web-test --no-pager
```

未登录时，第一个命令应返回 `{"user":null}`，服务状态应为 `active (running)`。

### 3. 在 Windows 新开终端，建立访问通道

在自己的 Windows 电脑上执行下面的命令，将 `SERVER_IP` 替换为服务器公网 IP：

```powershell
ssh -N -L 127.0.0.1:3001:127.0.0.1:3000 -o ExitOnForwardFailure=yes -o ServerAliveInterval=60 root@SERVER_IP
```

例如本次部署的服务器：

```powershell
ssh -N -L 127.0.0.1:3001:127.0.0.1:3000 -o ExitOnForwardFailure=yes -o ServerAliveInterval=60 root@8.217.97.238
```

输入密码后没有继续输出是正常现象，保持这个窗口运行。浏览器打开：

- 首页：http://127.0.0.1:3001
- 靶场：http://127.0.0.1:3001/lab

本机的 `3001` 会转发到服务器的 `3000`，网站和数据库实际运行在服务器上。原来的 `ssh -D 1080` 是 SOCKS 代理；这里的 `-L` 用于网站端口转发。上述部署无需另外开放服务器的 3000 或 3001 端口。

## 本地启动

本机需要安装 **Git 和 Node.js 24 或更高版本**。Windows PowerShell 中可以先检查：

```powershell
git --version
node --version
npm.cmd --version
```

首次下载项目，在准备存放代码的目录中执行：

```powershell
git clone https://github.com/xieguu/min-web-test.git
cd min-web-test
npm.cmd ci
npm.cmd run dev
```

已经有项目代码时，直接进入项目目录执行最后两个命令即可。`npm.cmd` 可以避免 PowerShell 对 `npm.ps1` 的执行限制。Linux / macOS 使用相同流程，将 `npm.cmd` 换成 `npm`。

终端显示启动地址后，打开 http://127.0.0.1:3000 。保持终端运行，按 `Ctrl+C` 停止服务。`run dev` 会在修改后端代码时自动重启；普通运行也可以使用 `npm.cmd start`。

首次启动会自动建立数据库并加入四篇示例文章，不需要另外安装数据库服务。

## 第一次使用

1. 打开网站，点击右上角「创建账号」。
2. 填写昵称、邮箱和密码。昵称 2–24 字；密码 8–64 个字符，最多 72 字节。
3. 注册成功后自动登录。邮箱用作登录账号，当前不发送验证邮件。
4. 点击「发布内容」，填写标题、分类和正文，摘要可以留空。保存后可以继续编辑或删除。
5. 打开文章详情，在底部发表评论，测试输入与展示。
6. 进入「我的文件」上传一个文件，再尝试下载、删除。
7. 进入「自测靶场」，按照下面的步骤练习。

没有默认账号和密码。本地与服务器各自保存数据，首次访问另一套部署时需要重新注册。

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

注册并登录后点击导航中的「自测靶场」。本地入口为 http://127.0.0.1:3000/lab ，通过上述 SSH 转发访问服务器时使用 http://127.0.0.1:3001/lab 。默认进入漏洞模式，顶部可以切换到修复模式；页面提供表单、原始 JSON 响应和可展开提示。

| 场景 | 漏洞模式 | 修复模式 |
| --- | --- | --- |
| 商品搜索 | 搜索条件拼接，能够返回隐藏商品 | 参数绑定，保留公开条件 |
| 私人笔记 | 仅按编号读取，Alice 可以读取 Bob 的笔记 | 校验当前练习身份与笔记归属 |
| 留言预览 | 保存的 HTML 原样插入预览页，脚本可以改变预览文字 | HTML 转义，输入作为文字显示 |

### 练习一：SQL 注入

1. 保持「漏洞模式」，在商品关键词中输入 `笔记本`，点击「搜索商品」，先观察正常结果。
2. 将关键词改成下面的内容，再次搜索：

   ```text
   %' OR 1=1 --
   ```

3. 在 JSON 响应中查找 `LAB_SQLI_FOUND`。出现该标记，说明未上架商品也被返回了。
4. 保持相同输入，切换「修复模式」：同一输入应返回空商品列表。

对应接口：`GET /api/lab/search?mode=vulnerable&q=关键词`；修复模式参数是 `mode=fixed`。

### 练习二：对象越权

1. 选择「漏洞模式」和练习身份「Alice」。
2. 笔记编号输入 `1001`，点击「读取笔记」：这是 Alice 自己的笔记。
3. 将编号改为 `1002` 再读取：可以读到 Bob 的笔记，正文包含 `LAB_IDOR_FOUND`。
4. 切换「修复模式」：同一个请求应返回 `403`。
5. 将练习身份切换为「Bob」，此时读取 `1002` 会成功，因为笔记属于 Bob。

对应接口：`GET /api/lab/notes/1002?mode=vulnerable`。也可以在自己的 HTTP 代理中修改路径里的编号来观察结果。

### 练习三：存储型 XSS

1. 保持「漏洞模式」，在留言内容中输入：

   ```html
   <script>document.body.append('XSS 已执行')</script>
   ```

2. 点击「保存留言」，右侧预览中应出现新增的 `XSS 已执行` 文字。
3. 点击「刷新预览」，标记仍会出现，说明输入已经保存到数据库。
4. 切换「修复模式」：输入作为文本显示，不再执行。

练习身份 Alice / Bob 与登录账号分开，选择保存在当前会话中；运行模式作为每次请求的 `mode` 参数传递。练习数据在该站点内共享，请求记录按登录账号显示。XSS 在独立的 iframe 沙箱中执行，使用 DOM 文字变化观察结果，无法访问父页面登录环境。

页面底部输入 `RESET` 可以恢复练习数据。此操作只修改 `lab.sqlite`，不会清空账号、文章、评论或个人文件。具体步骤见 [靶场说明](docs/LAB.md)。

### 使用 HTTP 客户端或代理

先在页面正常操作一次，按 `F12` 打开浏览器 Network 面板，查看和复制对应请求，再用自己的 HTTP 客户端或代理修改参数、路径、Cookie 和正文。

[HTTP 请求样例](docs/requests.http) 可以直接作为练习参考：

1. 修改 `@base`：本地用 `http://127.0.0.1:3000`，上述服务器转发用 `http://127.0.0.1:3001`。
2. 注册或登录自己的测试账号。
3. 从登录响应 `Set-Cookie` 中取出 `min.sid=` 后的值，填入 `@cookie`；不要包含后面的 `; Path=...` 等属性。
4. JSON 写请求保留 `Content-Type: application/json` 和 `X-Requested-With: min-web-test`；上传改用 `multipart/form-data`。

### 基础业务测试入口

| 功能 | 测试操作 | 正常预期 |
| --- | --- | --- |
| 注册 / 登录 | 重复邮箱、过短密码、错误密码、退出后请求 | 对应的 409 / 400 / 401 |
| 文章 | 未登录发布；账号 B 修改账号 A 的文章 | 401 / 403 |
| 评论 | 空输入、超过 2000 字、HTML 输入、删除他人评论 | 输入错误返回 400；HTML 按文本显示；越权返回 403 |
| 文件上传 | 字段名 `file`、中文文件名、超过 2 MiB | 正常上传返回 201；超出大小返回 413 |
| 文件权限 | 账号 A 上传，账号 B 下载或删除同一个文件 ID | 403 |
| 文件下载 | 比对下载文件与原文件的字节 | 内容一致 |
| 写入请求 | 移除 `X-Requested-With: min-web-test` 后重放 | 403 |

普通业务按照正常权限和输入规则运行，预置漏洞集中在 `/api/lab/`。

## 数据、更新与日常管理

### 数据存在哪里

| 数据 | 本地运行 | 使用部署脚本运行 |
| --- | --- | --- |
| 账号、文章、评论、个人文件 | `data/site.sqlite` | `/var/lib/min-web-test/site.sqlite` |
| 靶场商品、笔记、留言、请求记录 | `data/lab.sqlite` | `/var/lib/min-web-test/lab.sqlite` |
| 登录会话 | `data/sessions/` | `/var/lib/min-web-test/sessions/` |
| 自动生成的会话密钥 | `data/session-secret` | `/var/lib/min-web-test/session-secret` |

数据保存在运行后端的电脑或服务器磁盘上。刷新网页、关闭浏览器或重启服务不会清空数据库。数据目录被 Git 忽略，下载代码不会下载另一套部署的账号和内容。

### 服务器更新到 GitHub 最新代码

适用于前面通过 Git 克隆的部署，在服务器窗口执行：

```bash
systemctl stop min-web-test
git -C /opt/min-web-test/app pull --ff-only
bash /opt/min-web-test/app/deploy/install.sh
```

代码目录与 `/var/lib/min-web-test` 数据目录分开，安装脚本会更新依赖并重新启动服务。

### 查看状态和日志

以下命令在服务器窗口执行：

```bash
# 查看运行状态
systemctl status min-web-test --no-pager

# 重启 / 停止 / 启动
systemctl restart min-web-test
systemctl stop min-web-test
systemctl start min-web-test

# 最近 100 行日志
journalctl -u min-web-test -n 100 --no-pager

# 持续看日志，Ctrl+C 退出查看
journalctl -u min-web-test -f
```

### 备份

在服务器窗口执行：

```bash
systemctl stop min-web-test
tar -czf /root/min-web-test-data-$(date +%Y%m%d-%H%M%S).tar.gz -C /var/lib min-web-test
systemctl start min-web-test
```

本地运行则先按 `Ctrl+C` 停止服务，再复制整个 `data/` 目录。备份包含数据库、会话目录和会话密钥。

## 常见问题

| 现象 | 处理方法 |
| --- | --- |
| `/root/min-web-test.tar.gz: No such file or directory` | 部署包未上传；可以直接按上面的 GitHub 克隆方式部署，无需该压缩包。 |
| `git clone` 提示目标目录非空 | 若该目录已是本项目仓库，使用 `git -C /opt/min-web-test/app status` 检查后更新。若是其他文件，先在另一个空目录检出并确认内容。 |
| SSH 转发后网页打不开 | 先在服务器执行 `curl http://127.0.0.1:3000/api/session`；服务正常后，检查 Windows 转发窗口是否仍在运行，浏览器是否访问本机 3001。 |
| SSH 提示本地端口被占用 | 将转发命令中的第一个 `3001` 改成 `3002`，浏览器相应访问 `http://127.0.0.1:3002`。 |
| 本地启动提示 `EADDRINUSE` | 3000 端口已有程序监听，先确认是否已经运行本站，或通过 `PORT` 配置其他端口。 |
| PowerShell 无法执行 `npm.ps1` | 使用文中的 `npm.cmd` 命令。 |
| 找不到 `node:sqlite` | 本地使用 Node.js 24 或更高版本；服务器使用安装脚本提供的运行时。 |
| 登录返回 429 | 注册和登录共用每 IP 每 15 分钟 40 次限额，等待当前限流窗口结束。 |
| 找不到默认账号或密码找回 | 点击「创建账号」注册；当前未提供密码找回、邮件发送或管理后台。 |

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
