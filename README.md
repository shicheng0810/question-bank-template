# Question Bank Template

> 纯前端 · 加密题库 · 静态部署 · 零运维分发

## 简介

一套双 app 的题库制作 + 答题平台。作者用 **Extractor** 在本地浏览器把 MHTML / HTML / 图片转成结构化题目,生成可加密的 `.qbpack` 包和一份完整的静态站点 ZIP;学生用 **Site**(部署到 GitHub Pages)在线练习,受保护题库通过密码在浏览器端解密,题目内容不暴露,密码不出客户端。

整套系统**没有后端**,API key、密码、答题进度全部留在用户自己的浏览器里。

## 特性

- **双 app**:Extractor(作者用,本地浏览器打包)+ Site(学生用,GitHub Pages 答题)
- **题库加密**:`.qbpack` 格式 = PBKDF2 + AES-GCM-256 + gzip,密码不出浏览器
- **两种发布模式**:公开题库(裸 JSON)与受保护题库(`.qbpack`)同站点共存
- **自动去重融合**:跨来源的重复题按「题干 + 正确答案」融合,来源合并进 `source`;导出端与加载端行为一致(详见下文)
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

### RapidOCR PP-OCRv5 本地截图识别

如果浏览器内置 Tesseract.js 对截图识别不稳,可以启用本机 RapidOCR 服务。它在你的电脑上运行 RapidOCR + PP-OCRv5 ONNX,不调用云端 API,不需要 OpenAI key。

首次安装:

```bash
npm run rapidocr:install
```

每次使用前先启动本地 OCR 服务:

```bash
npm run rapidocr:server
```

然后另开一个终端启动 Extractor:

```bash
npm run dev
```

打开 `http://127.0.0.1:5173/extractor/`,在「截图识别设置」里勾选「使用 RapidOCR PP-OCRv5 本地识别」。流程是 RapidOCR 优先;如果本地 RapidOCR 服务没有启动或识别失败,会自动回退到浏览器 Tesseract OCR。默认 RapidOCR 服务地址是 `http://127.0.0.1:8765`,可在 `.env` 里用 `RAPIDOCR_URL=` 覆盖。

### OpenAI Vision 截图识别

截图识别支持两种 AI 路径:

- **DeepSeek 文本修复**:先用浏览器内 Tesseract.js 做 OCR,再把 OCR 文本和选项发给 DeepSeek 修正。
- **OpenAI Vision 本地代理**:Extractor 通过本地 Vite middleware 调 OpenAI Responses API,直接把截图识别成题目 JSON。API key 只在本地 Node 进程读取,不会写进浏览器 localStorage。

启用 OpenAI Vision:

```bash
cp .env.example .env
# 在 .env 填入 OPENAI_API_KEY
npm run dev
```

打开 `http://127.0.0.1:5173/extractor/`,在「截图识别设置」里勾选「使用本地 OpenAI Vision 直接识别截图」。默认同时勾选「仅在本地 OCR 弱时调用（省钱）」,也就是先跑本地 OCR,只有题干/选项/答案识别明显不可靠时才调用 OpenAI。取消该省钱选项后,每张截图都会优先走 OpenAI Vision。

## 测试

- `npm test` — vitest:打包流水线、加解密、核心解析
- `npm run test:e2e` — playwright:目录加载、密码解锁、做题、会话恢复、多语言、模拟考

## 部署到 GitHub Pages

公开站点只发布**做题(练习)**部分 —— 一个「一页看到全部题目」的自包含单文件播放器(放在 `docs/`)。**提取器(Extractor)和多文件 SPA 不发布**,只在本地用(`npm run dev`)。

部署产物由 `public/banks/index.json` 生成:

```bash
npm run build:pages   # 为每个题库生成自包含单文件 HTML 到 docs/
```

- `docs/index.html` = 第一个题库的全题练习页;每个题库另存为 `docs/<id>.html`。
- 单文件自包含(题目内嵌、无外部依赖),任意子路径 / 离线都能用。
- 想让某个题库**不发布**,在 `index.json` 那条加 `"deploy": false`(示例 / 测试题库已标记)。

**上线步骤:**

1. `npm run build:pages` 生成 `docs/`,`git add docs && git commit && git push`。
2. 仓库 **Settings → Pages → Build and deployment → Source = Deploy from a branch**;分支选 `main`,目录选 **`/docs`**,Save。
3. 约 1 分钟后访问 `https://<user>.github.io/<repo>/`,即所选题库的全题练习页。

> **改用 CI 自动构建(可选):** 加一个 GitHub Actions workflow 跑 `npm run build:pages` 即可,但推送 `.github/workflows/` 需要 token 带 `workflow` scope(`gh auth refresh -h github.com -s workflow`)。**Cloudflare Pages** 也行:Build command `npm run build:pages`、输出目录 `docs`。

### 追加 / 更新题库

1. 本地 `npm run dev` → `/extractor/`,用提取器做题库并导出 JSON。
2. 把 `<id>.json` 放进 `public/banks/`,在 `public/banks/index.json` 加一条(公开题库写 `"json"`,加密写 `"payload"`;不想发布加 `"deploy": false`)。
3. `npm run build:pages` 重新生成 `docs/`,提交 push,Pages 自动更新。

## 去重融合(题目唯一性)

同一道题常会出现在多个来源(讲义测验、作业、作业本……),导入后会被自动**去重融合**:判定标准是 **题干 + 正确答案文本**(忽略干扰项的措辞差异、大小写、选项顺序),融合后只保留一题,并把所有来源合并进 `source` 数组。题干相同但**正确答案不同**的题目(例如多道共用「Which statement is true?」题干)会被保留为不同题目,不会被误并。

去重在两处生效且行为一致:作者端导出时(`buildUniqueMergedQuestionBankFromCollections`)、学生端加载时(站点 `normalizeQuestionBankForRuntime` 与单文件模板 `dedupeQuestionBank`)。核心实现集中在 `src/lib/testable-core.js`,有单元测试覆盖。

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
