# Ubuntu 22.04 部署

部署包将应用代码装入 `/opt/min-web-test/app`，独立 Node.js 24.22.0 运行时装入 `/opt/min-web-test/runtime`，数据存入 `/var/lib/min-web-test`。systemd 以 `minweb` 用户运行并设置开机自启。

## Windows 上传

在 Windows 新开一个终端，执行：

```powershell
cd C:\Users\29718\Desktop\locall\min-web-test
scp data\deploy\min-web-test.tar.gz root@8.217.97.238:/root/
```

该包不含本机数据库、会话、密钥或 node_modules。服务器首次启动会建立自己的数据库和示例数据，网页上重新注册账号即可使用。

## 服务器安装

在 `root@...:~#` 的 SSH 窗口执行：

```bash
mkdir -p /opt/min-web-test/app
tar -xzf /root/min-web-test.tar.gz -C /opt/min-web-test/app
bash /opt/min-web-test/app/deploy/install.sh
```

脚本从 Node.js 官方下载运行时并验证 SHA-256，按锁文件安装生产依赖，配置服务，最后检查 `/api/session`。现有服务器 Node.js 不受影响。

## 本机访问

在 Windows 新开终端，保持下列命令运行：

```powershell
ssh -N -L 127.0.0.1:3001:127.0.0.1:3000 -o ExitOnForwardFailure=yes -o ServerAliveInterval=60 root@8.217.97.238
```

浏览器打开 http://127.0.0.1:3001/lab 。本机 3001 转发到服务器 3000，便于与本机原来运行的 3000 区分。

`ssh -D 1080` 是 SOCKS 代理；`-L` 才是这里的网站端口转发。二者可以在不同 SSH 连接中同时使用。本部署只需要现有 SSH 端口，应用监听服务器回环地址。

## 管理

```bash
systemctl status min-web-test --no-pager
systemctl restart min-web-test
journalctl -u min-web-test -n 100 --no-pager
journalctl -u min-web-test -f
```

## 备份

停止服务后备份整个数据目录，再启动：

```bash
systemctl stop min-web-test
tar -czf /root/min-web-test-data-$(date +%Y%m%d-%H%M%S).tar.gz -C /var/lib min-web-test
systemctl start min-web-test
```

`site.sqlite` 保存账号、内容、评论和文件，`lab.sqlite` 保存练习数据，`sessions/` 与 `session-secret` 保存会话和会话密钥。

## 更新代码

重新上传部署包；服务器上停止服务，解压后重跑安装脚本：

```bash
systemctl stop min-web-test
tar -xzf /root/min-web-test.tar.gz -C /opt/min-web-test/app
bash /opt/min-web-test/app/deploy/install.sh
```

数据目录在应用目录之外，更新包不会覆盖数据。现有数据库在应用启动时按版本迁移。
