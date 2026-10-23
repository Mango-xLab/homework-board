# 部署到云服务器

这份文档说的是「自己有台云服务器（VPS）」怎么把作业小站挂上去。
如果不想管服务器，用 [Cloudflare Workers](README.md#方式-a-cloudflare-workers--推荐免费不用信用卡-)
更省事——免费、不用信用卡、也不用备案。

> **服务器上已经装了 1Panel / 宝塔这类面板？** 别用本文的 systemd 脚本，会跟面板打架。
> 看 **[DEPLOY-1PANEL.md](DEPLOY-1PANEL.md)**（1Panel 专用，走它的「编排 + 反向代理」）。

先选一条路：

| 方案 | 适合谁 | 大概花销 | 数据在哪 |
|---|---|---|---|
| **A. 云服务器 + systemd**（本文主推） | 已经有服务器，或者想要完全自己掌控 | 服务器本身的钱 | 服务器硬盘 `/opt/homework-board/data` |
| **B. 云服务器 + 域名 + HTTPS** | 想用 `hb.你的域名.com` 这种网址 | 服务器 + 域名（约 ¥30/年） | 同上 |
| **C. 云服务器 + Docker** | 习惯用容器 | 服务器本身的钱 | 挂载出来的 `./data` |

> **中国大陆的服务器要注意**：用 IP 访问没问题；一旦绑域名走 80/443，
> 按工信部要求域名得先**备案**（在云厂商控制台提交，一般 7～20 天）。
> 不想备案就用香港/新加坡节点，或者干脆用方案 Cloudflare Workers。

---

## 一、先买台服务器、放行端口

### 1. 买

轻量应用服务器就够（一家人用，2 核 2G 都嫌多）：
阿里云「轻量应用服务器」、腾讯云「轻量应用服务器」都有 ¥60～100/年 的活动款。
系统镜像选 **Ubuntu 22.04 或 24.04**。

> 想省钱也可以看看 Oracle Cloud 的永久免费实例，或者 Vultr / DigitalOcean 的 $5 套餐。
> 只是给孩子看作业，**最低配完全够**。

### 2. 放行端口（这步最容易忘）

云厂商的**安全组 / 防火墙**默认只开 22。你至少要让 5173 能进：

- 阿里云：轻量应用服务器 → 防火墙 → 添加规则 → TCP `5173`
- 腾讯云：轻量应用服务器 → 防火墙 → 添加规则 → TCP `5173`
- 如果按方案 B 用 nginx，就放行 `80` 和 `443`（`5173` 不用对外开）

### 3. 连上去

```bash
ssh root@你的服务器公网IP
```

---

## 二、方案 A：一键装好（Ubuntu / Debian）

### 1. 把代码传上去

在**你自己的电脑**上，进到 `homework-board` 的**上一级**目录，然后：

```bash
# 用 scp（Windows 也能用，PowerShell 里直接跑）
scp -r homework-board root@你的服务器IP:/root/
```

或者用 WinSCP / FileZilla 之类的图形工具，把整个 `homework-board` 拖上去。

> 有 GitHub 的话更简单：把文件夹传上去，然后在服务器上 `git clone`。
> 用 `git` 的话，`data/`、`tmp/` 已经被 `.gitignore` 忽略了，不会把数据传上去。

### 2. 跑安装脚本

```bash
cd /root/homework-board
sudo bash deploy/install.sh
```

脚本会做四件事：

1. 装 Node.js 20（已经装了就跳过）
2. 把代码同步到 `/opt/homework-board`（**保留原来的 `data/`**）
3. 建一个专用系统用户 `hb`，注册 systemd 服务并启动
4. 自检一下 `/api/health`，然后把访问地址打印出来

看到这样就成了：

```
==> 服务已启动 ✓
==> 接口自检通过 ✓

  本机访问：   http://127.0.0.1:5173
  外网访问：   http://123.45.67.89:5173
```

### 3. 打开试试

浏览器输 `http://你的公网IP:5173`。

打不开的话按顺序查：

```bash
systemctl status homework-board        # 服务活着吗
journalctl -u homework-board -n 50     # 有没有报错
curl http://127.0.0.1:5173/api/health  # 本机通不通
```

本机通、外网不通 → 十有八九是**安全组没放行端口**。

### 手动装（不想跑脚本的话）

```bash
# 1. 装 Node 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# 2. 放代码
mkdir -p /opt/homework-board
cp -r /root/homework-board/. /opt/homework-board/
mkdir -p /opt/homework-board/data

# 3. 建用户
useradd --system --create-home --home-dir /opt/homework-board --shell /usr/sbin/nologin hb
chown -R hb:hb /opt/homework-board

# 4. 注册服务（把 deploy/homework-board.service 里的占位符换掉）
sed -e "s|__USER__|hb|g" -e "s|__DIR__|/opt/homework-board|g" \
    -e "s|__PORT__|5173|g" -e "s|__NODE__|$(command -v node)|g" \
    /opt/homework-board/deploy/homework-board.service > /etc/systemd/system/homework-board.service

systemctl daemon-reload
systemctl enable --now homework-board
```

---

## 三、方案 B：配域名 + HTTPS（推荐，孩子记得住）

有个 `https://hb.你的域名.com` 会好用很多：孩子平板上加到主屏幕是个正经图标，
家长在公司也不怕被公司网络拦。

### 1. 域名解析

到你买域名的地方（阿里云/腾讯云/Cloudflare 都行）加一条 **A 记录**：

```
主机记录：hb
记录类型：A
记录值：  你的服务器公网IP
```

> ⚠️ **中国大陆的服务器**：域名要先备案，否则 80/443 会被拦。

### 2. 装 nginx，配反向代理

```bash
apt-get install -y nginx
cp /opt/homework-board/deploy/nginx.conf /etc/nginx/sites-available/homework-board

# 把里面的 your.domain.com 换成你的域名
sed -i 's/your.domain.com/hb.你的域名.com/' /etc/nginx/sites-available/homework-board

ln -sf /etc/nginx/sites-available/homework-board /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default      # 去掉默认站点，免得抢 80
nginx -t && systemctl reload nginx
```

现在浏览器开 `http://hb.你的域名.com` 应该能看到了。

同时记得把服务改成**只监听本机**（已经由 install.sh 设好了 `HOST=127.0.0.1`），
这样外面只能通过 nginx 进来，`5173` 端口不用对外开。

### 3. 上 HTTPS

```bash
apt-get install -y certbot python3-certbot-nginx
certbot --nginx -d hb.你的域名.com
```

certbot 会自动申请证书、改好 nginx 配置、加上 HTTP → HTTPS 跳转，
并且注册好自动续期。之后浏览器开 `https://hb.你的域名.com` 就是小绿锁了。

---

## 四、方案 C：Docker

服务器上装了 Docker 的话（`curl -fsSL https://get.docker.com | sh`）：

```bash
cd /root/homework-board
docker compose -f deploy/docker-compose.yml up -d
```

或者不用 compose：

```bash
docker build -f deploy/Dockerfile -t homework-board .
docker run -d --name homework-board --restart unless-stopped \
  -p 5199:5173 -v "$PWD/data:/data" homework-board
```

数据挂在宿主机的 `./data`，容器重建不会丢。

> 想用 80 端口就直接把 `-p 5199:5173` 改成 `-p 80:5173`；
> 想再套 nginx，就把 compose 文件里 `HOST: 127.0.0.1` 那行注释打开。

---

## 五、日常维护

### 改了代码怎么更新

```bash
# 把新的 homework-board 传上来（覆盖旧的）
scp -r homework-board root@你的服务器IP:/root/

# 重新跑一遍安装脚本，它会保留 data/ 并重启服务
cd /root/homework-board && sudo bash deploy/install.sh
```

Docker 的话：

```bash
docker compose -f deploy/docker-compose.yml up -d --build
```

> 更新完，已经打开着的页面顶部会自己弹出「🔄 有新版本了 · 点我刷新」，
> 点一下就行，不用手动清缓存。

### 备份

所有数据就是 `data/` 目录里的一堆 JSON，一个房间一个文件。

```bash
# 手动备份一份
tar czf ~/hb-backup-$(date +%F).tar.gz -C /opt/homework-board data

# 或者拉回自己电脑
scp -r root@你的服务器IP:/opt/homework-board/data ./hb-data-backup
```

想定时自动备份，`crontab -e` 加一行：

```cron
0 3 * * * tar czf /root/hb-backup-$(date +\%F).tar.gz -C /opt/homework-board data && find /root -name 'hb-backup-*.tar.gz' -mtime +30 -delete
```

（每天凌晨 3 点备份，保留最近 30 天。）

家长端 **设置 → 导出备份文件** 也能随时导出一份 JSON。

### 看日志 / 重启 / 停

```bash
journalctl -u homework-board -f          # 实时日志
systemctl restart homework-board         # 重启
systemctl stop homework-board            # 停
systemctl disable homework-board         # 取消开机自启
```

### 升级 Node

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
systemctl restart homework-board
```

---

## 六、常见问题

**Q：外网打不开，但服务器上 `curl 127.0.0.1:5173` 是通的？**
安全组/防火墙没放行端口。阿里云、腾讯云都在「轻量应用服务器 → 防火墙」里加规则。

**Q：`systemctl status` 显示 failed？**
`journalctl -u homework-board -n 50` 看具体报错。最常见的是 Node 路径不对
（重跑一次 `install.sh` 会重新探测）或者 `data/` 权限不对
（`chown -R hb:hb /opt/homework-board`）。

**Q：一家人用，服务器扛得住吗？**
完全够。整个站是零依赖的纯 Node HTTP 服务，空闲内存占用 50MB 上下，
每次请求就是读写一个小 JSON 文件。2 核 2G 跑一百个这样的站都没问题。

**Q：会被别人扫到吗？**
网址是随机的 6 位房间码（约 10 亿种组合），扫到的概率极低。
想更保险的话：① 用 HTTPS；② 在 nginx 里加一段 IP 白名单，或者套一层
Cloudflare Access；③ 定期改房间码（家长端 → 设置 → 全部重来会换新数据，
但房间码不变，要换房间码就重新建一个房间）。

**Q：能不能不用 Node，直接丢到静态托管？**
不行。这个站有服务端（房间码、跨设备同步），必须有能跑 Node 的地方。
真不想管服务器就用 Cloudflare Workers——它也算「云」，只是不用你管机器。

**Q：数据会不会被云厂商看到？**
数据是明文的 JSON，存在你自己服务器的硬盘上。
云厂商能物理接触到磁盘，但不会主动去看。真要加密得自己在应用层做，
对「作业小站」这个场景没必要。

---

## 附：服务器上要记下来的几条命令

```bash
systemctl status homework-board      # 看状态
systemctl restart homework-board     # 改完配置重启
journalctl -u homework-board -f      # 实时日志
ls -l /opt/homework-board/data       # 看有哪些房间
cat /opt/homework-board/data/XXXXXX.json   # 看某个房间的原始数据
```
