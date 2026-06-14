#!/bin/bash
# 双击下架/删除题库：列出题库 → 选择 → 下架或删除 → 重新部署
cd "$(dirname "$0")/.." || exit 1
node scripts/remove-bank.mjs
status=$?
echo ""
if [ $status -eq 0 ]; then
  read -r -p "✅ 全部完成。按回车关闭窗口…"
else
  read -r -p "❌ 出错了（见上方日志）。按回车关闭窗口…"
fi
