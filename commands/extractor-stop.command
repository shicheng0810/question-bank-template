#!/bin/bash
# 双击关闭题库提取器的本地服务器（extractor.command 的配对关闭器）。
# 关键：-sTCP:LISTEN 只选「监听」端口的服务器进程——浏览器对该端口的连接
# 也会出现在 lsof 里，绝不能误杀。

PIDS=$(lsof -ti tcp:5173 -sTCP:LISTEN 2>/dev/null)

if [ -z "$PIDS" ]; then
  echo "提取器本来就没有在运行（端口 5173 空闲）。"
else
  kill $PIDS 2>/dev/null
  sleep 1
  for p in $PIDS; do
    if kill -0 "$p" 2>/dev/null; then
      kill -9 "$p" 2>/dev/null
    fi
  done
  sleep 1
  if [ -z "$(lsof -ti tcp:5173 -sTCP:LISTEN 2>/dev/null)" ]; then
    echo "✅ 提取器已关闭。"
  else
    echo "❌ 没杀干净，请手动检查：lsof -i tcp:5173 -sTCP:LISTEN"
  fi
fi

read -r -p "按回车关闭窗口…"
