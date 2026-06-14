# 贡献指南

## 开发环境

- Node.js ≥ 18(Vite 7 要求)
- npm(项目用 npm,不用 pnpm / yarn)

```bash
npm install
npm run dev
```

## 分支与提交

- `main` 永远保持可发布状态
- 新功能:`feat/<short-name>`,bug 修复:`fix/<short-name>`,其他:`chore/*` `docs/*` `test/*`
- 通过 PR 合入 `main`,不直接 push

提交信息建议用 Conventional Commits 的简化版:

```
feat: 新增模拟考时长选择
fix: 解决受保护题库解密失败时无提示
chore: 升级 vite 到 7.1.7
test: 补充 qbpack 解密边界用例
docs: 补充部署说明
```

## PR 前自检

合入前所有命令必须本地通过:

```bash
npm test              # vitest
npm run test:e2e      # playwright
npm run build         # vite 构建,确保两个入口都能产出
```

## 代码风格

- 沿用项目内现有写法(原生 JS,无框架,无 lint 强约束)
- 新文件放对目录:核心库 → `src/lib/`,服务/流水线 → `src/services/`,UI 入口 → `src/app/` 或 `src/site/`
- 测试与被测代码同名:`xxx.js` → `tests/xxx.test.js`

## AI 功能改动须知

- API key **永远不要**提交到 repo 或硬编码
- 用户 key 只存浏览器 localStorage,字段统一使用 `qb_ai_` 前缀(便于一键清除)
- 涉及 key 的 UI 默认 `type="password"`,日志里不打印 key
- 修改 endpoint 默认值时同步更新 README 中的"可选 AI 增强"段

## 不接受的改动

- 引入新 npm 框架(React / Vue / 等)
- 引入后端服务(项目核心卖点就是纯前端)
- 把答题进度 / 用户数据外发到任何服务器
