# 在 1Panel 上部署作业小站

服务器上已经装了 [1Panel](https://1panel.pro/) 的话，**不要用 [DEPLOY.md](DEPLOY.md) 里的一键脚本**——
1Panel 自己管着 Docker、OpenResty 和防火墙，另起一套 systemd 服务会打架。

1Panel 有两条路，先选一条：

| 路线 | 怎么做 | 适合 | 域名 / HTTPS |
|---|---|---|---|
| **一、Docker 编排**（推荐） | 容器 → 编排 贴一份 compose | 想省事、想随时改代码 | 后面用「网站 → 反向代理」挂上去 |
| **二、Node.js 运行环境** | 运行环境 → Node.js，再建网站 | 想让 1Panel 原生管进程和日志 | 创建网站时直接勾 HTTPS |

**推荐路线一**：代码放在宿主机上（1Panel 文件管理器随时能改），容器只是跑它，
升级、回滚、备份都比路线二直观。

---

## ⚠️ 先搞清楚：代码放哪儿

这是最容易绕进去的地方：**1Panel 的「网站根目录」不用放代码。**

反向代理网站的根目录是给静态文件准备的，但你配了 `proxy_pass` 之后，
所有请求都被转走了，nginx 的 `root` 指令**根本不生效**。
所以那个目录（`/opt/1panel/www/sites/xxx/index`）留空就行，放东西只会白占一份磁盘。

| | 路线一：Docker 编排（推荐） | 路线二：Node.js 运行环境 |
|---|---|---|
| **代码目录** | `/opt/homework-board` —— 你自己建的，**跟网站根目录毫无关系** | **就是** 1Panel 给那个网站分配的运行目录 |
| 网站根目录 | 空着，用不到 | 就是代码目录 |
| 谁在跑 Node | 编排起的容器 | 1Panel 的运行环境容器 |
| 改完代码 | 重启容器 | 重启运行环境 |

```
/opt/homework-board/                      ← 路线一：代码放这儿
├── public/
│   └── index.html
└── server.js

/opt/1panel/www/sites/hb.你的域名.com/     ← 网站根目录，空着不用管
```

路线二正好相反——那种模式 1Panel 会把网站运行目录挂进 Node 容器，代码**必须**放那儿。
这也是推荐路线一的原因之一：代码和网站解耦，改代码、备份、迁移都更直观。

---

## 路线一：Docker 编排

### 1. 把代码传到服务器

1Panel 面板 → 左侧 **主机 → 文件**（有些版本叫「文件管理」）

1. 进到 `/opt`，点「新建目录」，名字填 `homework-board`
2. 进去，把 `homework-board` 里的**这些**传上去：

```
public/          整个文件夹（必传）
server.js        必传
worker.js        可选（用不到 Cloudflare 就别传）
package.json     可选
deploy/          可选
DEPLOY.md        可选
README.md        可选
```

**不用传**：`data/`（服务器会自己建）、`tmp/`、`dist/`、`scripts/`、`docs/`、`node_modules/`。

> 传完检查一下 `/opt/homework-board/server.js` 和 `/opt/homework-board/public/index.html` 在。

嫌麻烦也可以在服务器终端里 `git clone`，或者用 1Panel 的 **终端** 跑 `scp`／`curl`。
只要最后代码在 `/opt/homework-board` 就行。

### 2. 创建编排

面板 → **容器 → 编排 → 创建编排**，来源选 **编辑**。

- **名称**：`homework-board`
- **编辑区**：把 [`deploy/1panel-compose.yml`](deploy/1panel-compose.yml) 里
  `services:` 开始的内容整段粘进去

点 **确认**。1Panel 会拉 `node:20-alpine` 镜像并启动容器。

### 3. 看看跑起来没有

面板 → **容器 → 容器**，应该能看到 `homework-board`，状态是**运行中**。

点它的名字 → **日志**，正常的话能看到：

```
  📚 作业小站已经启动
  ------------------------------------------
  打开网址：  http://localhost:5173
  存储方式：  本地文件 /app/data
```

再点 **终端**（1Panel 容器详情里有），跑一句自检：

```bash
node -e "fetch('http://127.0.0.1:5173/api/health').then(r=>r.text()).then(console.log)"
```

应该打印 `{"ok":true,"storage":"local-file",...}`。

> 想看网页的话，先在 **系统 → 防火墙** 里临时放行 `5199`，
> 浏览器开 `http://服务器IP:5199`。确认没问题后**建议把这条规则删掉**，
> 后面统一走反向代理的 80/443。

### 4. 建反向代理（用域名访问）

面板 → **网站 → 网站 → 创建网站**，创建方式选 **反向代理**：

| 字段 | 填什么 |
|---|---|
| 主域名 | `hb.你的域名.com`（先在域名商那边加一条 A 记录指向服务器 IP） |
| 端口 | `80` |
| 代理地址 | `http://127.0.0.1:5199` |
| 启用 HTTPS | 先不勾，等第 5 步 |

点确认。然后浏览器开 `http://hb.你的域名.com` 应该就能看到了。

> **「房间管理口令」是可选的，不用提前配**：它只用在**删除房间**时确认一下，
> 平时浏览房间列表、切换房间、改房间名都不要。
> 想设就在 **家长 → 设置 → 🏠 房间 → 🔓 设个删除口令**，
> 服务器只存 scrypt 哈希在 `/opt/homework-board/data/_admin.json`，文件里没有明文。
> 想用环境变量统一管，就把 [`deploy/1panel-compose.yml`](deploy/1panel-compose.yml)
> 里 `HB_ADMIN_KEY` 那行注释打开。

> **没有域名**也能建：主域名填服务器公网 IP，一样能用。
> 只是没法申请免费证书，走 HTTPS 得自己传证书。

**如果 502 / 连不上**：把代理地址里的 `127.0.0.1` 换成 `host.docker.internal`
或者服务器的内网 IP（`ip addr` 里那个 `eth0` 的地址）再试。
1Panel 的 OpenResty 一般是 host 网络，`127.0.0.1` 就能通。

### 5. 上 HTTPS

面板 → **网站 → SSL 证书 → 申请证书**：

- 类型：**Let's Encrypt**（免费）
- 域名：`hb.你的域名.com`
- 验证方式：**HTTP 校验**（域名已解析到这台服务器就行）
- 邮箱：填你自己的

申请成功后回到 **网站 → 网站**，点那个站点 → **HTTPS** → 打开开关 → 选刚申请的证书 → 保存。

再顺手打开 **强制 HTTPS**。之后浏览器开 `https://hb.你的域名.com` 就是小绿锁了。

证书 1Panel 会自动续期，不用管。

> ⚠️ **中国大陆的服务器**：用 IP 访问没问题，但绑域名走 80/443 前，域名得先**备案**，
> 否则会被拦。不想备案就用香港 / 新加坡节点。

### 6. 完事之后建议做的

- **系统 → 防火墙**：把临时放行的 `5199` 删掉，只留 `22 / 80 / 443`
- 云厂商控制台的**安全组**也照这个改（1Panel 的防火墙管不到云厂商那一层）

### 7. 部署完自检

哪一步不确定就跑到一半卡住了，用这个脚本一次性查完：

```bash
# 只查本机：磁盘余量、代码传没传全、容器起没起、端口通不通
bash deploy/1panel-check.sh

# 顺便查域名
bash deploy/1panel-check.sh hb.你的域名.com
```

它按「磁盘 → 代码 → 容器 → 端口 → 域名 → 防火墙」的顺序查，
每一项 ✗ 后面都跟着 `→` 的修复提示，比如：

```
【2】代码在不在 /opt/homework-board
  ✓ 目录存在
  ✓ server.js
  ✗ public/app.js 不在
      → public/ 整个文件夹都要传，别只传 index.html
```

只读，不改任何东西。处理完再跑一遍，全绿就说明整条链路通了。

---

## 路线二：用 1Panel 的 Node.js 运行环境

这条更"原生"，但步骤多一些，而且 1Panel 各小版本的界面字段不完全一样。

1. **网站 → 运行环境 → Node.js → 创建运行环境**，选 Node 版本（18 及以上都行），起个名字比如 `hb`
2. **网站 → 网站 → 创建网站**，创建方式选 **运行环境**
   - 类型：**Node.js**
   - 运行环境：选刚建的 `hb`
   - 端口：`5173`
   - 主域名：填你的域名
   - **启用 HTTPS**：这里可以一步到位勾上
3. 建好之后，1Panel 会给这个站点一个**运行目录**（在网站详情里能看到）。
   用 **主机 → 文件** 把 `public/`、`server.js` 传进那个目录
4. 回到运行环境，在 **运行目录 / 启动命令** 那里填：
   - 运行目录：第 3 步那个目录
   - 启动命令：`node server.js`
   - 环境变量（如果有这一栏）：
     ```
     PORT=5173
     HOST=0.0.0.0
     DATA_DIR=<运行目录>/data
     # 附件单个文件的最大 MB 数，默认 25。作业照片/短视频够用，
     # 想传更长的视频可以调大（磁盘和上行带宽也要跟得上）
     # HB_MAX_UPLOAD_MB=25
     ```
5. 启动，然后在 **运行环境 → 查看日志** 里确认打印出了「📚 作业小站已经启动」

数据会落在运行目录的 `data/` 里，**附件在 `data/uploads/<房间码>/`**。
备份就直接备份整个 `data/` 目录（附件跟着一起走）。

> 附件走 `data/` 下面的子目录，所以**只要 `data/` 能持久化，附件就能持久化** ——
> 上面两种装法都是把 `data/` 挂成卷的，不用额外配置。

> 这条路我没法在自己的环境里替你验证，界面字段以你面板上实际显示的为准。
> 卡住了就换路线一，那条是纯 Docker，跟 1Panel 版本无关。

---

## 日常维护

### 改了代码怎么更新

**要传哪几个文件？整个 `public/` 文件夹，一个都别漏。**

不是"只传你改过的那几个"。因为这个项目一直在加新文件
（比如后来加的 `public/ui.js`），只挑着传很容易出现
「页面白屏」或者「某个功能没生效、但又看不出哪错了」。

| 传什么 | 什么时候要传 |
|---|---|
| `public/` **整个文件夹** | 每次更新都传（里面有 `index.html` / `style.css` / `app.js` / `ui.js` / `core.js`） |
| `server.js` | 后端也改过的时候（只用前端功能的话可以不传） |
| `worker.js` / `worker/` | 用 Cloudflare 那条路才需要，1Panel 不用 |

> ⚠️ **别只传 `app.js`。** `app.js` 里 `import './ui.js'`，
> 万一 `ui.js` 没传上去，浏览器加载不到它，**整个页面白屏**。

传完之后**重启容器**（代码是挂载进去的，静态文件立刻生效；
`server.js` 的改动要重启才生效）：

面板 → **容器 → 容器 → homework-board → 重启**

#### 怎么确认真的更新上了

**最省事的办法**：进 **家长 → 设置**，页面最底下会写着

```
前端版本 25c3aeae
```

然后在你本机（有代码的那台电脑）跑：

```bash
node scripts/version.mjs
```

**两个指纹一样** = 服务器上跑的就是你手上这份代码，更新成功了。
**不一样** = 有文件没传上去，或者传的是旧的。

想直接问服务器（不用手动对）：

```bash
BASE=https://你的域名 node scripts/version.mjs --online
```

它会自己比，并对不上的时候告诉你**缺了哪个文件**。

> 指纹是拿 `public/` 里每个文件的**内容**算的，跟文件时间无关，
> 所以本机和服务器上算出来的可以直接比。
>
> 如果服务器上那份太旧（还没有这个指纹功能），
> `/api/version` 会只返回一个 `v`、没有 `files` 字段 ——
> 那就说明你传上去的还是老版本，整个 `public/` 重传一遍即可。

更新完，已经打开着的页面顶部会自己弹出「🔄 有新版本了 · 点我刷新」，
点一下就行，不用清缓存。

### 备份

数据就是 `/opt/homework-board/data/` 里的几个 JSON：

- **手动**：主机 → 文件 → 进 `data` → 勾选文件 → 下载
- **自动**：面板 → **计划任务 → 创建计划任务**
  - 类型：**备份目录**
  - 目录：`/opt/homework-board/data`
  - 备份到：本地 / 或者你已经接的对象存储（阿里云 OSS、腾讯云 COS、S3、WebDAV）
  - 执行周期：每天一次
  - 保留份数：30

家长端 **设置 → 导出备份文件** 也能随时导出一份 JSON，双保险。

### 看日志

容器 → homework-board → **日志**。

### 开机自启

compose 里已经写了 `restart: unless-stopped`，服务器重启后容器会自己起来，
不用额外设置。

---

## 1Panel 上容易踩的坑

### 建反向代理时报 `invalid port in upstream`

```
[emerg] invalid port in upstream "http://127.0.0.1:5199" in
/www/sites/xxx/proxy/root.conf:2
nginx: configuration file ... test failed
```

**原因**：nginx 的 `upstream` 段里**不能写 `http://` 协议头**。
1Panel 把带协议的地址原样塞进了 `upstream { server ... }`：

```nginx
upstream xxx {
    server http://127.0.0.1:5199;   # ← 非法
}
```

nginx 把 `http` 当主机名、把 `//127.0.0.1:5199` 当端口，于是报 `invalid port`。

**修法一（治本，改字段）**：回反向代理编辑框，「代理地址」填**不带协议**的：

- 有单独的端口框 → 地址 `127.0.0.1`，端口 `5199`
- 只有一个框 → `127.0.0.1:5199`（去掉 `http://`）

**修法二（立刻能通，直接改配置）**：
网站 → 点站点 → **配置文件**，把 `proxy/root.conf` 整个换成：

```nginx
location ^~ / {
    proxy_pass http://127.0.0.1:5199;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_http_version 1.1;
}
```

关键是**不要 `upstream` 段**——`proxy_pass` 里直接写 `http://ip:port` 才合法。

改完先单独确认后端通不通，免得改完还是 502：

```bash
curl -i http://127.0.0.1:5199/api/health
```

**还是 502**：说明 OpenResty 不在 host 网络，`127.0.0.1` 指的是它自己。
`ip addr show | grep 'inet '` 找到内网 IP（如 `172.20.3.15`），
`proxy_pass http://172.20.3.15:5199;` 或者用 `host.docker.internal`。

### 磁盘满了（`no space left on device`）

如果看到这种报错：

```
Error response from daemon: failed to create prepare snapshot dir:
failed to create temp dir: mkdir /var/lib/containerd/io.containerd.snapshotter.v1.overlayfs/snapshots/new-xxx:
no space left on device
```

说明**服务器磁盘满了**，1Panel 连自己的 OpenResty 容器都建不出来（网站会全挂）。
这跟作业小站无关，得先把磁盘清出来。仓库里带了个体检脚本：

```bash
# 只看，什么都不动
bash deploy/disk-check.sh

# 确认没问题后再做安全清理（不会删数据卷、不会删你的备份）
bash deploy/disk-check.sh --clean
```

它按收益顺序查：根分区容量和 **inode**、`/var/lib/docker`、容器日志、
systemd 日志、1Panel 备份，然后把安全的那些清掉。

最常见的三个大头：

| 占空间的 | 怎么处理 |
|---|---|
| 容器日志 `/var/lib/docker/containers/*/*-json.log` | 脚本会截断；**一定要**顺手配上日志上限，不然还会涨回来 |
| 悬空镜像和 build 缓存 | 脚本会 `docker image prune -a` + `builder prune` |
| 1Panel 的备份 | 去 **计划任务 → 备份** 里挑旧的删，顺便加上「保留份数」 |

给 Docker 日志设上限（治本）：

```bash
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<'JSON'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" }
}
JSON
systemctl restart docker
```

> ⚠️ 重启 docker 会让所有容器停几秒，1Panel 的 OpenResty 也在内。

**「容量够但还报 no space」**：多半是 **inode 用光了**（小文件太多）。
`df -i` 看那一栏，`IUse%` 到 100% 就是它。清理方法同上。

**清完还是紧张**：挂一块数据盘把 `/var/lib/docker` 搬过去，或者直接在云控制台扩容系统盘。

### 其它常见问题

**Q：编排里写的 `/opt/homework-board` 要改成 1Panel 的目录吗？**
不用。这是**宿主机**的绝对路径，跟 1Panel 自己的目录无关。
你只要保证代码真的在那个位置（第 1 步传对了）。

**Q：登录页面能打开，但接口 502？**
容器没起来或者崩了。去看容器日志。最常见的两个原因：
① 代码没传全（少了 `server.js` 或 `public/`）；② `/opt/homework-board` 权限不对，
容器里的 node 用户读不了。可以 `chmod -R 755 /opt/homework-board` 试试。

**Q：反向代理填 `127.0.0.1:5199` 报 502？**
说明 1Panel 的 OpenResty 不在 host 网络。改成服务器的内网 IP
（终端里 `ip addr` 看 `eth0` 那个）或者 `host.docker.internal`。

**Q：改了文件，页面上还是旧的？**
① 先确认重启过容器；② 页面顶部等 8 秒看有没有「有新版本」提示条；
③ 都没有就 `Ctrl + F5` 强制刷新。

**Q：1Panel 的应用商店里搜不到这个？**
它不在商店里（商店是别人做的开源应用）。就用「编排」这条路，
本质也是 Docker，跟商店里的应用一样好管。

**Q：能不能用 1Panel 的「一键部署」？**
那是给商店里的应用用的。作业小站是自己写的，走编排。

---

## 一句话总结

```
传代码到 /opt/homework-board
  → 容器 → 编排 → 贴 deploy/1panel-compose.yml
  → 网站 → 创建网站 → 反向代理 → http://127.0.0.1:5199
  → SSL 证书 → 申请 Let's Encrypt → 网站里启用 HTTPS
```

搞完把 `https://hb.你的域名.com` 发给家里的平板，加到主屏幕就是个图标了。
