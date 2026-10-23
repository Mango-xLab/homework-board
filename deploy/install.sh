#!/usr/bin/env bash
#
# 作业小站 · 云服务器一键安装（Ubuntu / Debian，需要 root）
#
# 用法：把整个 homework-board 文件夹传到服务器上，cd 进去，然后
#   sudo bash deploy/install.sh
#
# 它会：
#   1. 需要的话装 Node.js 20
#   2. 把代码放到 /opt/homework-board（保留原来的 data/）
#   3. 建一个专用系统用户 hb，注册并启动 systemd 服务
#
# 可选环境变量：
#   PORT=5173          服务监听端口（默认 5173，只监听 127.0.0.1）
#   APP_DIR=/opt/homework-board
#   APP_USER=hb
#   SKIP_NODE=1        跳过 Node 安装（自己已经装好了）

set -euo pipefail

PORT="${PORT:-5173}"
APP_DIR="${APP_DIR:-/opt/homework-board}"
APP_USER="${APP_USER:-hb}"
SKIP_NODE="${SKIP_NODE:-0}"
SERVICE=/etc/systemd/system/homework-board.service

say()  { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
warn() { printf '\n\033[1;33m!!  %s\033[0m\n' "$*"; }
die()  { printf '\n\033[1;31mxx  %s\033[0m\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "请用 root 运行：sudo bash deploy/install.sh"

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[[ -f "$SRC_DIR/server.js" ]] || die "没找到 server.js，请在 homework-board 目录里运行这个脚本"

# ---------------------------------------------------------------- 1. Node

if [[ "$SKIP_NODE" != "1" ]]; then
  if command -v node >/dev/null 2>&1 && [[ "$(node -p 'process.versions.node.split(".")[0]')" -ge 18 ]]; then
    say "已经有 Node $(node -v)，跳过安装"
  else
    say "安装 Node.js 20"
    if command -v apt-get >/dev/null 2>&1; then
      export DEBIAN_FRONTEND=noninteractive
      apt-get update -qq
      apt-get install -y -qq curl ca-certificates rsync
      curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
      apt-get install -y -qq nodejs
    else
      die "这个脚本目前只支持 apt 系（Ubuntu / Debian）。其它发行版请手动装 Node 18+ 再跑 SKIP_NODE=1 bash deploy/install.sh"
    fi
  fi
fi
NODE_BIN="$(command -v node)"
say "使用 Node：$NODE_BIN ($(node -v))"

# ------------------------------------------------------- 2. 建用户 + 拷代码

if ! id "$APP_USER" >/dev/null 2>&1; then
  say "创建系统用户 $APP_USER"
  useradd --system --create-home --home-dir "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
fi

say "把代码同步到 $APP_DIR（不动原来的 data/）"
mkdir -p "$APP_DIR/data"
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete \
    --exclude 'data/' \
    --exclude 'tmp/' \
    --exclude '.git/' \
    --exclude 'node_modules/' \
    "$SRC_DIR"/ "$APP_DIR"/
else
  # 没 rsync 就退化成 cp：先备份 data，拷完再放回去
  TMP_DATA="$(mktemp -d)"
  cp -a "$APP_DIR/data/." "$TMP_DATA/" 2>/dev/null || true
  find "$APP_DIR" -mindepth 1 -maxdepth 1 ! -name data -exec rm -rf {} +
  cp -a "$SRC_DIR"/. "$APP_DIR"/
  rm -rf "$APP_DIR/data"
  mkdir -p "$APP_DIR/data"
  cp -a "$TMP_DATA/." "$APP_DIR/data/" 2>/dev/null || true
  rm -rf "$TMP_DATA"
fi
mkdir -p "$APP_DIR/data"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# --------------------------------------------------------------- 3. systemd

say "注册 systemd 服务"
sed -e "s|__USER__|$APP_USER|g" \
    -e "s|__DIR__|$APP_DIR|g" \
    -e "s|__PORT__|$PORT|g" \
    -e "s|__NODE__|$NODE_BIN|g" \
    "$SRC_DIR/deploy/homework-board.service" > "$SERVICE"

systemctl daemon-reload
systemctl enable homework-board >/dev/null
systemctl restart homework-board
sleep 2

if systemctl is-active --quiet homework-board; then
  say "服务已启动 ✓"
else
  warn "服务没起来，看看日志：journalctl -u homework-board -n 50 --no-pager"
  systemctl status homework-board --no-pager || true
  exit 1
fi

# --------------------------------------------------------------- 4. 自检

if command -v curl >/dev/null 2>&1; then
  if curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null; then
    say "接口自检通过 ✓"
  else
    warn "接口没响应，看看 journalctl -u homework-board -n 50 --no-pager"
  fi
fi

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
cat <<EOF

------------------------------------------------------------------
  装好了 🎉

  本机访问：   http://127.0.0.1:$PORT
  外网访问：   http://${IP:-<服务器公网IP>}:$PORT
                （如果打不开，去云厂商控制台的「安全组 / 防火墙」
                  放行 $PORT 端口，或者按 DEPLOY.md 配 nginx 用 80）

  常用命令：
    systemctl status homework-board     看状态
    systemctl restart homework-board    重启
    journalctl -u homework-board -f     实时看日志
    数据在 $APP_DIR/data

  想用域名 + HTTPS、或者用 Docker，看 DEPLOY.md
------------------------------------------------------------------
EOF
