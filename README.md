# Question Bank Template

> 纯前端 · 加密题库 · 静态部署 · 零运维分发

## 简介

一套双 app 的题库制作 + 答题平台。作者用 **Extractor** 在本地浏览器把 MHTML / HTML / 图片转成结构化题目,生成可加密的 `.qbpack` 包和一份完整的静态站点 ZIP;学生用 **Site**(部署到 GitHub Pages)在线练习,受保护题库通过密码在浏览器端解密,题目内容不暴露,密码不出客户端。

整套系统**没有后端**,API key、密码、答题进度全部留在用户自己的浏览器里。

## 特性

- **双 app**:Extractor(作者用,本地浏览器打包)+ Site(学生用,GitHub Pages 答题)
- **题库加密**:`.qbpack` 格式 = PBKDF2 + AES-GCM-256 + gzip,密码不出浏览器
- **两种发布模式**:公开题库(裸 JSON)与受保护题库(`.qbpack`)同站点共存
- **答题模式**:全题 / 错题 / 收藏 / 随机 / 模拟考,进度存 localStorage
- **多语言**:zh-CN, en, es
- **可选 AI 增强**:OCR 修复、自动答题、填空转选择题(用户自带 key)

## 快速开始

```bash
npm install
npm run dev          # http://127.0.0.1:5173            → Site
                     # http://127.0.0.1:5173/extractor/ → Extractor
npm run build        # 产出 dist/(同时构建 site 和 extractor)
npm test             # vitest 单元测试
npm run test:e2e     # playwright 端到端
```

需要 Node ≥ 18(Vite 7 要求)。

## 项目结构

```
src/
  app/           Extractor 编排
    core.js
    shell.html
    features/    AI 功能(answer-fill / mcq / ocr)
  site/          Site 编排
    main.js
    site-app.js
    site-logic.js
    shell.html
  lib/           核心库
    qbpack.js              .qbpack 加解密
    site-package.js        bank id 处理
    publish-settings.js    元数据校验
    testable-core.js       题目解析(可测试核心)
    canvas-answer-fallback.js
  services/
    site-package-export.js 打包流水线(生成发布 ZIP)
  templates/
    question-bank-template.html  单文件题库模板(legacy)
  styles/

public/banks/    示例题库 + 注册表
  index.json
  sample-public.json
  demo-protected.qbpack
  wood-structures.json

extractor/index.html  Extractor 入口
index.html            Site 入口

tests/
  *.test.js      vitest 单元测试
  e2e/           playwright 端到端
  fixtures/

scripts/serve-e2e.mjs
vite.config.js
playwright.config.js
```

## 工作流程

### 作者(Extractor)

1. 打开 `/extractor/`
2. 上传 MHTML / HTML / 图片 → 解析为题目 JSON
3. (可选)调 AI 自动填答案 / 把填空转选择题 / OCR 修复
4. 填元数据:`id`、标题、模式(public / protected)、密码、标签
5. 点击「生成发布 ZIP」→ 下载 → 解压并推到 GitHub repo

### 学生(Site)

1. 打开 GitHub Pages 站点
2. 自动 fetch `banks/index.json` 加载目录
3. 选题库:
   - 公开题库 → 直接进入
   - 受保护题库 → 输入密码 → 浏览器端解密 → 进入
4. 选模式(全题 / 错题 / 收藏 / 随机 / 模拟考)开始答题
5. 进度自动写入 localStorage,下次访问继续

## `.qbpack` 数据格式

加密的 JSON 包,纯浏览器端解密:

```
密码 ──PBKDF2──▶ key
题目 ──gzip──▶ 明文 ──AES-GCM-256(key, iv)──▶ ciphertext

封装:
{
  "format": "qbpack-v1",
  "cipher": "AES-GCM-256",
  "compression": "gzip",
  "kdf": { "name": "PBKDF2", "iterations": ..., "hash": "SHA-256" },
  "salt_b64": "...",
  "iv_b64":   "...",
  "ciphertext_b64": "..."
}
```

实现见 `src/lib/qbpack.js`,作者端调用 `encryptQuestionBankPayload()`,学生端调用 `decryptQuestionBankPayload()`。

## 可选 AI 增强

Extractor 支持调 DeepSeek / OpenAI 兼容接口做 OCR 文本修复、自动答题、填空转选择题。Key 由用户自带,只存浏览器 localStorage。**不要把 key 提交到 repo。**

## 测试

- `npm test` — vitest:打包流水线、加解密、核心解析
- `npm run test:e2e` — playwright:目录加载、密码解锁、做题、会话恢复、多语言、模拟考

## 部署到 GitHub Pages

1. 在 Extractor 里制作题库,点「生成发布 ZIP」
2. 解压 ZIP 到 repo 根,push
3. GitHub repo Settings → Pages → Source = `main` 根目录
4. **追加题库**:在 Extractor 里导入现有 `banks/index.json` → 加新题库 → 重新导出 ZIP 覆盖

## 贡献 / 开发约定

见 [`CONTRIBUTING.md`](./CONTRIBUTING.md)。

## License

[MIT](./LICENSE)

---

<details>
<summary><b>English summary</b></summary>

A pure-frontend question bank platform with two apps sharing one codebase:

- **Extractor** (author tool): runs locally in the browser, parses MHTML / HTML / images into structured questions, optionally enhances with AI (OCR / auto-answer / fill-to-MCQ), then packages everything into a deployable ZIP — including an encrypted `.qbpack` payload for protected banks.
- **Site** (student tool): a static site (GitHub Pages-ready) that loads a `banks/index.json` manifest, lets users open public banks directly or unlock protected banks with a password decrypted entirely client-side.

The `.qbpack` format uses PBKDF2 key derivation, gzip compression, and AES-GCM-256 encryption. Passwords never leave the browser. There is no backend; API keys, passwords, and progress all stay in the user's localStorage.

**Quick start:** `npm install && npm run dev` (Site at `:5173`, Extractor at `:5173/extractor/`). Build: `npm run build`. Tests: `npm test` (vitest) and `npm run test:e2e` (playwright). Requires Node ≥ 18.

See the Chinese sections above for full architecture, dataflow, and deployment details.

</details>
