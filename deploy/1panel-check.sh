#!/usr/bin/env bash
#
# 作业小站 · 1Panel 部署自检
#
#   bash deploy/1panel-check.sh                    # 查本机（代码 + 容器 + 端口）
#   bash deploy/1panel-check.sh hb.你的域名.com     # 顺便查域名通不通
#
# 部署完跑一遍，一次就能看出是卡在
#   代码没传全 / 容器没起来 / 端口没通 / 反向代理没配。
#
# 只读，不改任何东西。

set -uo pipefail

APP_DIR="${APP_DIR:-/opt/homework-board}"
CONTAINER="${CONTAINER:-homework-board}"
HOST_PORT="${HOST_PORT:-5199}"
DOMAIN="${1:-}"

PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); printf '  \033[1;32m✓\033[0m %s\n' "$*"; }
bad()  { FAIL=$((FAIL+1)); printf '  \033[1;31m✗\033[0m %s\n' "$*"; }
hint() { printf '      \033[2m→ %s\033[0m\n' "$*"; }
hr()   { printf '\n\033[1;36m%s\033[0m\n' "$*"; }

echo
echo "作业小站 · 部署自检   $(date '+%F %T')"

# ------------------------------------------------------------ 1. 磁盘

hr "【1】磁盘还有多少余量"

ROOT_USE=$(df -h / 2>/dev/null | awk 'NR==2{print $5}' | tr -d '%')
ROOT_AVAIL=$(df -h / 2>/dev/null | awk 'NR==2{print $4}')
ROOT_AVAIL_MB=$(df -m / 2>/dev/null | awk 'NR==2{print $4}')
INODE_USE=$(df -i / 2>/dev/null | awk 'NR==2{print $5}' | tr -d '%')

if [ "${ROOT_AVAIL_MB:-0}" -ge 500 ]; then
  ok "根分区剩余 ${ROOT_AVAIL}（已用 ${ROOT_USE}%）"
else
  bad "根分区只剩 ${ROOT_AVAIL}（已用 ${ROOT_USE}%），Docker 可能又会报 no space"
  hint "先跑 bash deploy/disk-check.sh --clean"
fi
if [ "${INODE_USE:-0}" -ge 90 ]; then
  bad "inode 已用 ${INODE_USE}%，小文件太多"
  hint "df -i 看一下，清理方法同 disk-check.sh"
else
  ok "inode 已用 ${INODE_USE}%"
fi

# ------------------------------------------------------------ 2. 代码

hr "【2】代码在不在 $APP_DIR"

if [ -d "$APP_DIR" ]; then
  ok "目录存在"
else
  bad "目录不存在"
  hint "1Panel → 主机 → 文件 → 进 /opt → 新建目录 homework-board，再把 public/ 和 server.js 传进去"
fi

missing=0
for f in server.js public/index.html public/app.js public/core.js public/style.css; do
  if [ -f "$APP_DIR/$f" ]; then
    ok "$f"
  else
    bad "$f 不在"
    missing=$((missing+1))
  fi
done

# app.js 里 import 的每个模块都必须真的在 —— 少一个就是打开页面白屏。
# 这里**故意不写死清单**（写死过一次：加了 ui.js 忘了同步，自检还是全绿，
# 用户传完打开就是白屏）。改成直接读 app.js 的 import 语句，以后加模块不用改这里。
if [ -f "$APP_DIR/public/app.js" ]; then
  deps=$(sed -n "s/.*from[[:space:]]*'\.\/\([A-Za-z0-9_.-]*\)'.*/\1/p" "$APP_DIR/public/app.js" | sort -u)
  for m in $deps; do
    if [ -f "$APP_DIR/public/$m" ]; then
      ok "public/$m（app.js 依赖）"
    else
      bad "public/$m 不在 —— app.js import 不到它，打开页面会白屏"
      missing=$((missing+1))
    fi
  done
fi

[ "$missing" -gt 0 ] && hint "public/ 整个文件夹都要传，别只传 index.html"

if [ -d "$APP_DIR/data" ]; then
  ok "data/ 目录存在（$(ls -1 "$APP_DIR/data" 2>/dev/null | wc -l) 个房间）"
else
  hint "data/ 还没有，容器第一次启动会自己建，正常"
fi

# 容器里的 node 用户（uid 1000）得能读
if [ -d "$APP_DIR" ] && [ ! -r "$APP_DIR/server.js" ]; then
  bad "$APP_DIR/server.js 当前用户读不了"
  hint "chmod -R 755 $APP_DIR"
fi

# ------------------------------------------------------------ 3. 容器

hr "【3】容器状态"

if ! command -v docker >/dev/null 2>&1; then
  bad "没找到 docker 命令"
else
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$CONTAINER"; then
    ok "容器 $CONTAINER 正在运行"
    echo "      $(docker ps --filter "name=^${CONTAINER}$" --format '{{.Status}}  {{.Ports}}')"
  elif docker ps -a --format '{{.Names}}' 2>/dev/null | grep -qx "$CONTAINER"; then
    bad "容器 $CONTAINER 存在但没在运行"
    hint "docker start $CONTAINER   或者去 1Panel → 容器 → 编排 里看"
  else
    bad "没有叫 $CONTAINER 的容器"
    hint "1Panel → 容器 → 编排 → 创建编排 → 编辑，贴 deploy/1panel-compose.yml"
    hint "编排名称要填 homework-board（跟 CONTAINER 对上）"
  fi

  echo
  echo "  最近 15 行日志："
  docker logs --tail 15 "$CONTAINER" 2>&1 | sed 's/^/    /' || true
fi

# ------------------------------------------------------------ 4. 端口

hr "【4】宿主机能不能连上服务"

if command -v curl >/dev/null 2>&1; then
  if BODY=$(curl -fsS --max-time 5 "http://127.0.0.1:$HOST_PORT/api/health" 2>&1); then
    ok "http://127.0.0.1:$HOST_PORT/api/health 通了"
    echo "      $BODY"
  else
    bad "连不上 http://127.0.0.1:$HOST_PORT/api/health"
    hint "看上面的容器日志；容器没起来的话这里必然不通"
  fi

  # 前端指纹：跟本机 `node scripts/version.mjs` 的输出对一下，
  # 就知道传上去的到底是不是最新代码（以前这里只能靠肉眼猜）。
  VER=$(curl -fsS --max-time 5 "http://127.0.0.1:$HOST_PORT/api/version" 2>/dev/null) || VER=""
  if [ -n "$VER" ]; then
    V=$(printf '%s' "$VER" | sed -n 's/.*"v":"\([^"]*\)".*/\1/p')
    F=$(printf '%s' "$VER" | sed -n 's/.*"files":\[\([^]]*\)\].*/\1/p')
    ok "服务报出来的前端指纹：$V"
    [ -n "$F" ] && echo "      前端文件：$F"
    if [ -z "$F" ]; then
      hint "这个版本还没报 files 字段 —— 服务器上跑的是老代码，整个 public/ 重传一遍"
    fi
    hint "本机跑 node scripts/version.mjs，指纹一样才算传全了"
  else
    hint "读不到 /api/version（服务没起来？）"
  fi
else
  bad "没找到 curl，跳过"
fi

# ------------------------------------------------------------ 5. 域名

hr "【5】反向代理 / 域名"

if [ -z "$DOMAIN" ]; then
  hint "没传域名，跳过。想查就：bash deploy/1panel-check.sh hb.你的域名.com"
else
  for SCHEME in http https; do
    CODE=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 -L "$SCHEME://$DOMAIN" 2>/dev/null)
    if [ "$CODE" = "200" ]; then
      ok "$SCHEME://$DOMAIN → 200"
    else
      bad "$SCHEME://$DOMAIN → ${CODE:-连不上}"
      hint "1Panel → 网站 → 看那个站点在不在；反代地址填 http://127.0.0.1:$HOST_PORT"
      hint "如果 502：把反代地址里的 127.0.0.1 换成服务器内网 IP 或 host.docker.internal"
    fi
  done

  CODE=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "$DOMAIN/api/health" 2>/dev/null)
  [ "$CODE" = "200" ] && ok "域名下的接口也通" || hint "$DOMAIN/api/health → ${CODE:-连不上}（反代可能只转发了静态文件）"
fi

# ------------------------------------------------------------ 6. 防火墙

hr "【6】防火墙提醒"

hint "确认 $HOST_PORT 没有对公网放行（1Panel 防火墙 + 云厂商安全组各查一遍）"
hint "外面统一走 OpenResty 的 80 / 443，只留 22 / 80 / 443 三条规则最干净"

# ------------------------------------------------------------ 结论

echo
echo "------------------------------------------------------------------"
if [ "$FAIL" -eq 0 ]; then
  printf '  \033[1;32m全部通过（%d 项）\033[0m\n' "$PASS"
  echo
  echo "  把 https://$DOMAIN 发到家里的平板，加到主屏幕就是个图标了。"
else
  printf '  \033[1;33m%d 项通过，%d 项有问题\033[0m\n' "$PASS" "$FAIL"
  echo
  echo "  按上面每个 ✗ 后面的 → 提示处理，处理完再跑一遍这个脚本。"
fi
echo "------------------------------------------------------------------"
echo

exit 0
