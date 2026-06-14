#!/bin/bash
# 双击打开题库提取器（本地工具，不上线）。
# 启动 Vite dev server（OCR/AI 代理只在 dev 模式可用）并自动打开浏览器。
cd "$(dirname "$0")/.." || exit 1

URL="http://127.0.0.1:5173/extractor/"

if curl -s -o /dev/null --max-time 1 "$URL"; then
  echo "提取器已在运行，直接打开浏览器…"
  open "$URL"
  exit 0
fi

echo "启动提取器（Vite dev server）…"
npx vite --host 127.0.0.1 --port 5173 --strictPort >/tmp/qb-extractor-dev.log 2>&1 &
SERVER_PID=$!

for i in $(seq 1 60); do
  sleep 0.5
  if curl -s -o /dev/null --max-time 1 "$URL"; then
    break
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "❌ 启动失败（端口被占用或依赖问题），日志：/tmp/qb-extractor-dev.log"
    tail -5 /tmp/qb-extractor-dev.log
    read -r -p "按回车关闭窗口…"
    exit 1
  fi
done

open "$URL"
echo ""
echo "✅ 提取器已打开：$URL"
echo "   这个终端窗口保持服务器运行——做完导出后关闭本窗口即可停止。"
wait "$SERVER_PID"
