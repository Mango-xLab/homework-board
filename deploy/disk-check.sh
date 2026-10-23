#!/usr/bin/env bash
#
# 服务器磁盘体检 / 清理（1Panel + Docker 版）
#
#   bash deploy/disk-check.sh            # 只看，不动任何东西
#   bash deploy/disk-check.sh --clean    # 顺便做「安全清理」（不会删数据）
#
# 什么时候用：
#   Error response from daemon: ... no space left on device
#   Error response from daemon: failed to create prepare snapshot dir ...
#
# --clean 做的事（都不碰你的数据）：
#   * 删掉已停止的容器
#   * 删掉没有被任何容器使用的镜像
#   * 清空 build 缓存
#   * 把容器日志截断成 0（日志本身没有保留价值）
#   * 压缩 systemd 日志到 200M
#   * 清 apt 缓存
#
# --clean 故意不做的事（需要你自己确认）：
#   * docker volume prune —— 会删掉停止容器挂载的数据卷，可能丢数据
#   * 删 1Panel 的备份 —— 那是你自己的备份，去面板里挑着删

set -uo pipefail

CLEAN=0
[[ "${1:-}" == "--clean" ]] && CLEAN=1

hr() { printf '\n\033[1;36m===== %s =====\033[0m\n' "$*"; }
warn() { printf '\033[1;33m%s\033[0m\n' "$*"; }
ok() { printf '\033[1;32m%s\033[0m\n' "$*"; }

# ------------------------------------------------------------ 1. 磁盘概况

hr "磁盘用量（按容量）"
df -h | grep -vE '^(tmpfs|devtmpfs|overlay|shm)' || df -h

hr "磁盘用量（按 inode —— 小文件太多也会满）"
df -i | grep -vE '^(tmpfs|devtmpfs|overlay|shm)' || df -i

ROOT_USE=$(df -h / | awk 'NR==2{print $5}' | tr -d '%')
ROOT_AVAIL=$(df -h / | awk 'NR==2{print $4}')
echo
if [[ "${ROOT_USE:-0}" -ge 90 ]]; then
  warn ">>> 根分区已用 ${ROOT_USE}%，只剩 ${ROOT_AVAIL}。这就是那个报错的原因。"
elif [[ "${ROOT_USE:-0}" -ge 75 ]]; then
  warn ">>> 根分区已用 ${ROOT_USE}%，只剩 ${ROOT_AVAIL}，该清了。"
else
  ok ">>> 根分区用量 ${ROOT_USE}%，还剩 ${ROOT_AVAIL}，容量本身没问题。"
  warn "    如果还是报 no space left，重点看上面的 inode 那一栏。"
fi

# ------------------------------------------------------------ 2. 谁占的

hr "根目录下各目录占用（只看本机文件系统）"
du -xh --max-depth=1 / 2>/dev/null | sort -rh | head -12

hr "/var/lib 明细"
du -xh --max-depth=2 /var/lib 2>/dev/null | sort -rh | head -12

hr "/opt 明细（1Panel 装在这儿）"
du -xh --max-depth=2 /opt 2>/dev/null | sort -rh | head -12

# ------------------------------------------------------------ 3. Docker

if command -v docker >/dev/null 2>&1; then
  hr "Docker 占用概况"
  docker system df 2>/dev/null || warn "docker 命令没响应"

  hr "最大的容器日志（前 10）"
  find /var/lib/docker/containers -name '*-json.log' -size +10M 2>/dev/null \
    | xargs -r du -h 2>/dev/null | sort -rh | head -10 \
    || echo "（没有超过 10M 的日志，或者路径不在这里）"
  echo
  echo "容器日志总计：$(du -sh /var/lib/docker/containers 2>/dev/null | cut -f1)"

  hr "悬空镜像 / 停止的容器"
  echo "停止的容器：$(docker ps -aq --filter status=exited 2>/dev/null | wc -l) 个"
  echo "悬空镜像：  $(docker images -q --filter dangling=true 2>/dev/null | wc -l) 个"
  echo "数据卷：    $(docker volume ls -q 2>/dev/null | wc -l) 个（清理脚本不动它们）"
else
  warn "没找到 docker 命令，跳过 Docker 检查"
fi

# ------------------------------------------------------------ 4. 其它

hr "systemd 日志占用"
journalctl --disk-usage 2>/dev/null || echo "（读不到）"

hr "/tmp 占用"
du -sh /tmp 2>/dev/null || echo "（读不到）"

hr "1Panel 备份占用"
if [[ -d /opt/1panel/backup ]]; then
  du -sh /opt/1panel/backup/* 2>/dev/null | sort -rh | head -10
  echo "备份总计：$(du -sh /opt/1panel/backup 2>/dev/null | cut -f1)"
  echo "（去 1Panel → 计划任务 → 备份 里挑旧的删）"
else
  echo "（没有 /opt/1panel/backup，或者 1Panel 装在别处）"
fi

hr "有没有别的挂载点可以用"
df -h | grep -vE '^(tmpfs|devtmpfs|overlay|shm)' | awk '$6 != "/" && NR>1 {print "  " $6 "  可用 " $4}'

# ------------------------------------------------------------ 5. 清理

if [[ "$CLEAN" != "1" ]]; then
  cat <<'EOF'

------------------------------------------------------------------
  这只是体检，什么都没动。

  确认要清理的话，再跑一次加 --clean：

      bash deploy/disk-check.sh --clean

  它不会碰你的数据（不删数据卷、不删 1Panel 备份）。
------------------------------------------------------------------
EOF
  exit 0
fi

hr "开始安全清理"

if command -v docker >/dev/null 2>&1; then
  echo "-- 删掉已停止的容器"
  docker container prune -f 2>&1 | tail -2

  echo "-- 删掉没人用的镜像"
  docker image prune -a -f 2>&1 | tail -2

  echo "-- 清 build 缓存"
  docker builder prune -a -f 2>&1 | tail -2

  echo "-- 把容器日志截断成 0（日志没有保留价值，1Panel 面板里也能看实时日志）"
  find /var/lib/docker/containers -name '*-json.log' -exec truncate -s 0 {} \; 2>/dev/null
  ok "容器日志已清空"
fi

echo "-- 压缩 systemd 日志到 200M"
journalctl --vacuum-size=200M 2>&1 | tail -2

if command -v apt-get >/dev/null 2>&1; then
  echo "-- 清 apt 缓存"
  apt-get clean 2>&1 | tail -1
  echo "-- 删掉不再需要的依赖和旧内核"
  DEBIAN_FRONTEND=noninteractive apt-get autoremove --purge -y 2>&1 | tail -3
fi

hr "清理后"
df -h / | awk 'NR==1 || NR==2'
echo
ok "搞定。如果根分区还是紧张，看下面「长期方案」："
cat <<'EOF'

  1. 给 Docker 日志设上限（一劳永逸，不然还会涨回来）
       mkdir -p /etc/docker
       cat > /etc/docker/daemon.json <<'JSON'
       {
         "log-driver": "json-file",
         "log-opts": { "max-size": "10m", "max-file": "3" }
       }
       JSON
       systemctl restart docker
     ⚠️ 重启 docker 会短暂停掉所有容器（1Panel 的 OpenResty 也会停几秒）

  2. 1Panel → 计划任务 → 备份：给备份加上「保留份数」和自动删除

  3. 挂一块数据盘，把 Docker 数据目录搬过去：
       systemctl stop docker
       mv /var/lib/docker /data/docker
       ln -s /data/docker /var/lib/docker
       systemctl start docker

  4. 云控制台直接扩容系统盘（大部分厂商支持在线扩容，扩完
     growpart + resize2fs 就能用上）
EOF
