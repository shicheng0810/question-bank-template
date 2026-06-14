#!/bin/bash
# 双击发布新题库：自动找最新导出的 JSON → 校验 → 登记 → 部署上线
cd "$(dirname "$0")/.." || exit 1
node scripts/publish-bank.mjs
status=$?
echo ""
if [ $status -eq 0 ]; then
  read -r -p "✅ 全部完成。按回车关闭窗口…"
else
  read -r -p "❌ 出错了（见上方日志）。按回车关闭窗口…"
fi
