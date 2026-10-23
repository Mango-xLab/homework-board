#!/usr/bin/env bash
cd "$(dirname "$0")"
echo
echo "  正在启动作业小站..."
echo
exec node server.js
