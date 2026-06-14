#!/bin/bash
# 双击转换题库加密模式：公开 ⇄ 密码保护（原地转换，转换后自动重新部署）
cd "$(dirname "$0")/.." || exit 1
node scripts/convert-bank.mjs
status=$?
echo ""
if [ $status -eq 0 ]; then
  read -r -p "✅ 全部完成。按回车关闭窗口…"
else
  read -r -p "❌ 出错了（见上方日志）。按回车关闭窗口…"
fi
