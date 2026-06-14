# 题库项目全面提升研究报告

日期：2026-06-09　|　方法：3 路并行审计（提取边界 / 架构 / 播放器统一），全部论断带 file:line 证据，高危项已人工复核　|　测试基线：39/39 绿

---

## TL;DR

1. **做题方式**：统一到「单文件全平铺播放器」（你现在导出用的那个）作为唯一答题内核；SPA 翻页播放器（src/site，上一题/下一题模式）**退役改纯目录页**。你嫌烦的翻页从此不存在。
2. **特殊边界依赖**：审计出 **25 处特判**（清单见 §1.3），其中 5 处高危会**静默写错答案/静默丢题**。根因：代码从不读 Canvas 每个题块都有的 `<span class="question_type">` 权威字段，全靠 class 正则 + 图标启发式 + 得分推断层层兜底——每遇到新形态就只能再加一个特判。系统性解法是「5 件套」（§1.6），做完后大部分特判可以删掉而不是继续堆。
3. **线上 404 根因**：仓库 **6 月 2 日被转成私有**，免费计划私有仓库不能用 GitHub Pages，平台自动下线了站点（不是配置坏了）。去向三选一见 §4。
4. **产物新鲜度坑**：`docs/`（线上页面源）和 `dist/`（打包版提取器）都停在 **5 月 29 日**，不含 filter 课程分组等后续修复；只有 dev 模式导出是实时的（你 6/9 导出的文件已验证带上了修复）。改了模板 ≠ 改了线上，目前无任何护栏。
5. **现行即影响你的 bug**：①导出文件名日期用 UTC（晚上导出日期+1，`core.js:646`）；②模板播放器的错题/收藏 localStorage **不分题库**——同源下打开第二个题库会把第一个题库的错题/收藏清掉（`sanitizeSavedSets`，template:577-593；Chrome 下本地 file:// 也共享存储，同样中招）。

---

## §1 提取管线：为什么"特别依赖特殊边界"

### 1.1 根因画像

- Canvas Classic Quiz 结果页 DOM 是唯一输入契约，但解析靠 **class 正则 + 图标词表 + 得分推断**，从不读每个题块自带的 `<span class="question_type">multiple_choice_question</span>`（实测 6 份存档每块都有）。
- 实测 6 份真实存档（205×2、215×1、235×2、237×1）：DOM 结构**零差异**、且全是满分存档。意味着现有特判没炸只是因为输入恰好同质；第一份非满分/regrade/New Quizzes 存档进来就会踩雷。
- 215 与 205 存档结构一致，**215 没有引入新 DOM 边界**；215 的真实风险是图片（懒加载未内嵌，见 §1.5）和非满分尝试（触发 A1/回退链）。

### 1.2 Top 5 高危边界（已人工复核）

| # | 位置 | 问题 | 触发输入 | 修法 |
|---|------|------|---------|------|
| A1 | core.js:1869-1890 | 满分时若勾选≠页面标注，**用用户勾选覆盖标准答案**（代码注释自认是特判） | regrade 全员给分、survey、fudge points → 错误选项被写成正确答案 | 冲突时标记 `answerConflict` 强制人工确认；explicit class 永远优先 |
| A2 | core.js:1776-1781 | 题块选择器只认 Classic Quiz；New Quizzes/非测验页 → **"解析完成 0 题"静默成功** | 教师改用 New Quizzes、误投普通网页存档 | 加 `detectQuizEngine()`：非 classic 显式报错 |
| A3 | testable-core.js:260-271 + core.js:1107-1113 | 不认识的题型落 default 分支，导出 `{choices:[],answer:-1}` 坏记录，**且不计入"缺答"统计** | 任何 multiple_dropdowns / calculated / file_upload 题 | 导出口 schema 校验：不合格进 `rejected[]` 并 UI 红标 |
| A4 | core.js:1619-1623 | matching 取不到选中项时 `options[0]` 兜底 → **第一项被当正确答案**（错答而非缺答） | 未作答/不显示答案的配对题 | 删 `options[0]` 兜底，置空进缺答审核 |
| A5 | core.js:1830-1845 | 图标启发式：词表含 `arrow/check/right`，li 内第一个图标命中即判正确 | 任何含 "arrow" 的装饰图标（下拉箭头等） | 删宽松词表；实测全部样本由 `.correct_answer` class 覆盖，此特判从未真正需要 |

### 1.3 完整特判清单（25 项，按风险降序）

| # | 位置 | 依赖的边界假设 | 破坏输入 |
|---|------|--------------|---------|
| A1-A5 | 见上表 | | |
| A6 | core.js:1849-1857,1768-1773 | Canvas 界面=英文（"this was the correct answer" 文案匹配） | 中文/西语界面账号 |
| A7 | core.js:1931 | 填空识别靠 class 正则词典 | `calculated_question` 不命中→A3 |
| A8 | core.js:1992,2060,2227-2239 | 多空题必有 `.answer-group-heading` | 无 heading 渲染→不同空答案混入同一空（应改用每个 answer 自带的 `.blank_id`） |
| A9 | testable-core.js:344-373 | merge key 含图片 base64 指纹；有/无答案时 key 不对称 | 同图不同压缩→不合并；一份有答案一份没有→同题双份并存 |
| A10 | testable-core.js:283 ↔ site-logic.js:176 ↔ template:351 | 归一化**三处手抄**靠注释约定同步 | template 版已漂移（不剥 HTML） |
| A11 | core.js:1784,1966-1984 | 题名永远是 "Question N" 且 N 唯一（byNum 去重） | 教师自定义题名撞号→**整题被吞**（应改用 DOM id `question_2013…`） |
| A12 | testable-core.js:534 + core.js:865 | MHTML 正文全 ASCII（UTF-8 解码后 `&0xff` 当字节） | 8bit/binary part 的 – ' ° 变乱码（应 arrayBuffer+按 charset 解码） |
| A13 | core.js:1678-1686 | Chrome 风格单层 multipart，boundary 不出现在正文 | 嵌套 multipart |
| A14 | core.js:2300-2322 | Canvas 文件 URL 形态固定（instructure.com / `/files/\d+/`） | 自定义域/S3 签名直链不重写 |
| A15 | testable-core.js:55-78 | 再导入 token 词典硬编码且依赖顺序 | 改导出变量名忘同步→再导入空库 |
| A16 | testable-core.js:393-521 | 文件名= "类型+序号+AMT课号" 英文模式 | 非 AMT/中文文件名→退化 id（低危） |
| A17 | core.js:2245-2278 | "题干末尾混入选项行"剥离启发式 | 题干本来就引用选项原文→误删题干 |
| A18 | screenshot-ocr-logic.js:223-231（×2 处重复实现） | OCR 行"数字开头=选项" | "14 CFR Part 43…" 开头的题干行被切成选项（215 大量此类） |
| A19 | screenshot-ocr.js:1281,1236 | 绿色高亮 HSV 阈值=Canvas 浅色主题 | 深色模式/蓝色选中→静默缺答 |
| A20 | screenshot-ocr-logic.js:34-52 | 截图排版魔法常量（行数/字数/x 对齐） | 手机/缩放截图 |
| A21 | screenshot-ocr-logic.js:130-148 | DeepSeek 边界修复协议（stray fragment 删槽） | 真选项恰为单介词（有回退，低危） |
| A22 | screenshot-ocr-logic.js:254-269 | Tesseract 碎 token 特定模式词典 | 低危，建议集中成 ocr-quirks.js |
| A23 | ai-answer-fill-logic.js:36 / ai-mcq.js:274 | AI prompt 硬编码 "aviation maintenance" 领域 | 其它学科答案质量降 |
| A24 | ai-mcq.js:368-385 | 干扰项生成靠词形变换（flight↔operating 等字面替换） | 非英语/数字答案→怪异干扰项 |
| A25 | core.js:1737-1745 | 图片只走 `<img src>`（含 2 行死代码） | srcset/CSS 背景图（实测未见，低危） |

### 1.4 题型支持矩阵

| 题型 | 支持度 | 失败模式 |
|---|---|---|
| multiple_choice / true_false | 完整 | A1 满分覆盖、A5 图标误判 |
| multiple_answers | 完整 | 只剩 1 个正确项时被**降级成单选**（testable-core.js:146-151，丢"多选"语义） |
| matching | 部分 | A4 第一项当正确答案；导出拆成 N 道单选 |
| short_answer / 多空填空 | 部分 | A8 无 heading 时空位混血 |
| numerical | 部分 | 区间答案（between X and Y）只抓到单值，`.numerical_range_answer` 元数据被忽略 |
| essay | 无 | **静默丢弃**：不渲染不导出不计数，题号有洞无人知 |
| multiple_dropdowns / calculated / file_upload / text_only | 无 | A3 坏记录且全绿 |
| OCR 截图题 | 部分 | A18-A22；三级引擎（RapidOCR→Tesseract→Vision）代理路由只在 dev 可用 |

### 1.5 图片管线 6 个事实

1. **cid:/data: 内嵌管线基本闲置**：实测 6 份存档 0 张题图内嵌——Canvas 题图 `loading="lazy"`，Chrome 存 MHTML 时未渲染就不存。实际 100% 走"缺图→运行时网络抓取"路径。
2. 网络抓取四连（core.js:1346-1369）依赖浏览器已登录 Canvas + CORS 放行（通常不放）→ 实际靠手动上传兜底；掉登录后批量补图全军覆没。
3. `expectedImageCount` 选择器把**选项图/反馈图都算成题图**（core.js:1795），造成永远清不掉的"缺图 N 题"；且没有选项级图片模型。
4. 图片去重=base64 字符串全等（同图不同压缩即判不同）；**无任何压缩**，大题库会撑爆导出体积。
5. 图片 base64 参与 merge key（A9）→ 一边有图一边缺图的同题不合并。
6. 丢图导出时 JSON 里无 `missing_images` 标记，发布后不可追溯。

### 1.6 系统性加固 5 件套（做完可删特判而不是继续堆）

1. **金样本回归测试集**（最高优先）：6 门课各取 1-2 份真实 MHTML 入 `tests/fixtures/archives/` + 期望输出 JSON。前置：把 parseMHTML/parseCanvasHTML 等约 600 行从 `init()` 闭包提出为独立模块（只依赖 DOMParser，jsdom 可跑——审计时已在 Node 重放成功验证可行）。**此后每修一个边界先加 fixture。**
2. **导出 schema 校验层**：buildQuestionBank 出口校验（choice：choices≥2 且 answer∈范围；fill：blanks 非全空；id 唯一），不合格进 `rejected[]` + 状态栏计数。essay/unknown 丢弃量纳入状态栏。直接消 A3/A4 的"静默"。
3. **引擎检测 + question_type 直读**：`detectQuizEngine(html)` 区分 classic/new-quizzes/非测验页并显式报错（消 A2）；题型判定第一信号改读 `question_type` span，class 正则降为兜底（消 A3/A7 大半正则）。
4. **答案信号优先级表**：isCorrect 改为有序信号源 `correct_answer class > answer_arrow.correct > score 推断 > 图标(默认关)`，每题导出 `answerSource` 字段，score 推断/冲突题 UI 黄标，A1 的覆盖只在用户确认后生效。
5. **merge key 单一来源**：归一化+keying 抽成 `src/lib/question-key.js`，SPA import、模板构建时内联同一份（注入机制已有）；key 去掉图片指纹维度、加"无答案→有答案"二段合并；配 property 测试。

---

## §2 架构：一套逻辑三份手抄

```
Canvas .mhtml ─▶ parseMHTML(core.js:1677, 零测试) ─▶ datasets.parsed
                  ─▶ buildQuestionBank(testable-core.js:210) ─▶ 题库 JSON（隐式契约）
                       ├─▶ 提取器导出单文件（site-package-export.js:88，?raw 实时注入模板）★你在用的
                       ├─▶ build-pages.mjs ─▶ docs/（同模板另一条注入路径，手动跑，已停 5/29）
                       └─▶ 手写 public/banks/*.json ─▶ SPA(src/site，翻页播放器，未部署)
```

| 级别 | 发现 | 证据 |
|---|---|---|
| 🔴 | docs/ 与模板永久漂移，无护栏（改模板≠改线上） | docs/ grep courseOf=0，模板=2 |
| 🔴 | 部署配置不在版本控制里（无 CI，README 口头步骤），仓库设置一变即丢 | `.github/workflows/` 不存在 |
| 🔴 | 题目 schema 无权威定义：`section/tags/answer_sets/explanation` 生产者从不产出、消费者各读各的、**re-import 静默丢字段**（core.js:359-408） | 4 处不一致 |
| 🔴 | parseMHTML 约 600 行困在 init() 闭包，0 测试 0 金样本 | tests/fixtures 无 .mhtml |
| 🟡 | dedup 三份手抄已漂移；三套 id 哈希互不相同 → 播放器间进度天然不可迁移 | testable-core:344 / site-logic:239 / template:351 |
| 🟡 | 注入/转义 4 份拷贝，marker 字符串硬编码在 4 个文件 | build-pages.mjs:31 等 |
| 🟡 | 模板 localStorage `amt_*` 不分题库：同源开第二个库会**清掉第一个库的错题/收藏** | template:577-593 |
| 🟡 | 多空填空 `data-blank` 三处基准不一致（0 基/1 基混用） | core.js:2118/2154/2177 |
| 🟢 | core→testable-core 的下沉方向正确；qbpack 是全项目唯一带版本号的契约（schema 应学它） | |

**还该下沉 testable-core 的**：parseMHTML 全家（解 0 测试）、convertQuestionBankItemToParsed（与 buildQuestionBank 配对做 round-trip 测试）、extractIdSuffix 等纯字符串函数。

---

## §3 做题方式统一（翻页问题的根治）

**✅ 最终落地：方案乙（2026-06-09 深夜）**。时间线：先按用户"保留 SPA 只改翻页"做了方案甲（SPA 平铺化），用户看了部署页面后表示"确实不行"，拍板**全面改方案乙**：

- **SPA 整体退役删除**（src/site/ 四个文件 + 约 2700 行；提取器共用的 styles/site.css 保留）
- **站点 = 静态目录页 + 每题库一个单文件全平铺播放器**（build-pages.mjs 生成：目录卡片带题数/进度提示/密码徽章，播放器与提取器导出同模板）
- **localStorage 按题库命名空间**（模板注入 `__BANK_STORAGE_NS__`=题库 id，旧 amt_* 共享档一次性迁移，同域多题库互不串档）——方案乙原清单里的"必修项"
- **buildSitePublishZip（多文件 SPA 打包导出）随之删除**，提取器只留"导出做题单 HTML"，并注入命名空间
- vite 只剩提取器；e2e 重写为目录页/平铺播放器/存储隔离三用例；提取器 bundle 414KB→191KB
- 已部署 Cloudflare Pages 并线上实测（目录 → amt205 133 题平铺 → 答题 → 错题计数 → 命名空间存储 ✓）

理由：①你要的"全题平铺+逐题提交"模板本来就是，SPA 的翻页与需求相反，改 SPA（2-4 天重写渲染层）不如直接不用；②线上发布的本来就是模板产物，SPA 从未被部署，纯属第三份维护负担；③SPA 唯一不可替代的是"题库目录/最近题库"，留目录即可。

改动清单（1-1.5 天，以删码为主）：
1. site-app.js 删 player 整块（约 1400 行），`openBankById` 改为记录 recent 后跳转 `<id>.html`；
2. shell.html 删 playerView/passwordModal/lightbox；
3. build-pages.mjs：index.html 从"第一个题库的副本"改为**目录页**（列出所有题库卡片）；
4. **模板必修**：localStorage key 加题库命名空间（新 marker 注入 bankId），否则多库同源互删错题/收藏（连本地 file:// 都受影响）+ 旧 `amt_*` 一次性迁移；
5. e2e：SPA player 测试删除，换成"目录→单文件页"+ 单文件页做题/解锁的新 spec（目前单文件播放器 e2e 完全缺失）。

反方案（改 SPA 为平铺）不推荐：要在 SPA 里重写模板已验证的全部判分/渲染，2-4 天，且做完仍是两套实现。

---

## §4 部署去向（已定：Cloudflare Pages，2026-06-09）

用户拍板：② Cloudflare Pages。git 推送仍由用户自行处理（与 CF 直传无关）。
已就绪：`npm run deploy:cf`（= SITE_ONLY 构建 `dist-site/`（SPA+banks，无提取器）+ wrangler 直传）。
首次需要：`npx wrangler login`（浏览器 OAuth，用户执行）。可选：Cloudflare Access 给 *.pages.dev 加邮箱锁。

（原选项对比留档备查）

根因：仓库 2026-06-02 转私有 → 免费计划私有仓库不支持 GitHub Pages，站点被平台下线（恢复 API 返回 "Your current plan does not support GitHub Pages"）。

| 选项 | 成本 | 隐私 | 备注 |
|---|---|---|---|
| ① 仓库转回公开 + GitHub Pages | 一键 | **题库=课程测验答案，全网可见**（学术诚信暴露面） | 恢复原状最快 |
| ② **Cloudflare Pages（推荐）** | `wrangler pages deploy docs/` 一条命令 | 仓库保持私有；站点可加 Cloudflare Access 锁邮箱 | 你最初就提过 Cloudflare；免费额度足够 |
| ③ 不部署，纯本地单文件 | 0 | 最私密 | 你现在事实上的用法；配合目录页体验也不差 |

---

## §5 路线图

**✅ P0 已于 2026-06-09 当晚全部完成**（53 单测 + 8 e2e + 浏览器实测全绿），明细：

| 完成项 | 落点 |
|---|---|
| ✅ 解析家族提出 init() 闭包 → 独立模块 | `src/lib/canvas-extract.js`（约 650 行，core.js 2413→1791） |
| ✅ 金样本回归测试（3 份真实存档脱敏重封装：205/215/235） | `tests/fixtures/archives/*.mhtml` + `tests/canvas-extract.test.js`（14 测）+ 生成器 `scripts/build-archive-fixture.mjs` |
| ✅ A2：0 题不再静默成功，显式报"非经典测验页/New Quizzes"；新增 plain-HTML 回退 | core.js parseOne（浏览器实测：失败徽章 + 原因） |
| ✅ A3：unknown 题型不再导出 `{choices:[],answer:-1}`；状态栏新增"不支持题型 N（不导出）" | testable-core buildQuestionBank 守卫 + core.js formatDatasetStatus |
| ✅ A4：配对题只认显式 selected 属性（含 select 默认首项陷阱），"[ Choose ]"占位不进选项池 | canvas-extract extractMatchingQuestionData |
| ✅ A5：图标启发式收紧（`arrow/right` 装饰图标不再误标正确答案） | canvas-extract parseCanvasHTML |
| ✅ A12：MHTML 改 latin1 保字节读取（多字节字符不再截坏） | core.js parseOne |
| ✅ essay 可见化：保留进预览（"问答题"卡片）+ 计数，不导出 | canvas-extract + formatDatasetStatus |
| ✅ 选项区/反馈区图片不再计入题图（清不掉的"缺图"消失） | canvas-extract（closest('.answers') 过滤） |
| ✅ 导出 schema 校验闸：不完整记录剔除 + 导出提示 + console 详单 | testable-core validateQuestionBankRecords + core.js getExportArrayOrNull |
| ✅ 文件名 UTC→本地时区 | core.js buildLegacyExportFilename |
| ✅ 模板 localStorage 互删修复（sanitizeSavedSets 改非破坏性） | question-bank-template.html |
| ✅ 死代码清理（testable-core 坏引用的 canGenerateQBank、rewriteSources 死分支） | |
| ✅ docs/ + dist/ 本地重建（带上全部修复；`.nojekyll` 已补回） | 未提交，推送由用户自行处理 |

后续阶段（未做，待拍板）：

| 阶段 | 项 | 工作量 |
|---|---|---|
| **P1 收敛** | ✅ A1 已完成（2026-06-09）：满分冲突不再覆盖标注，answerConflict 黄标 + 状态栏计数 + 导出 answer_source（conflict/score/canvas-correct-block） | done |
| | ✅ question_type 直读已完成（2026-06-10）：matching/fill/essay/multi 优先读权威 span，class 正则降为兜底（引擎检测此前已做） | done |
| | ✅ merge key 收敛已完成（2026-06-10）：key 去图片指纹、无答案条目二段吸收（题干+选项集合唯一命中才并）；模板内联实现同步镜像修改 | done |
| | ✅ 注入/转义收敛已完成（2026-06-10）：build-pages 改用 testable-core 的 safeJSONStringForScript，镜像拷贝删除 | done |
| | ✅ re-import 透传已完成（2026-06-10）：answer_sets/explanation/section/tags/answer_source 全程保留；convert 家族下沉 testable-core 并配 round-trip 测试 | done |
| **P2 演进** | ✅ 播放器统一已完成（方案乙 → 后又按用户决定演进为「通用播放器+banks/ 外挂数据」v3 架构） | done |
| | ✅ 部分完成（2026-06-10）：A11 撞号吞题修复（DOM id 去重+id 消歧）、blank_id 分组、numerical 取 answer_exact 元数据、essay 计数此前已做。剩：numerical 区间判分（需播放器格式扩展） | 大半 done |
| | ✅ 压缩 + missing_images 已完成（2026-06-10）：>150KB 位图自动缩到 1200px/JPEG85（补传+网络抓图两路），导出带 missing_images 计数。剩：选项级图片模型 | 大半 done |
| | New Quizzes 预研（JSON API 路线，非 MHTML） | 调研级 |

---

## §6 需要你拍板的 3 件事

1. **部署去向**：①转公开 GH Pages / ②Cloudflare Pages（推荐）/ ③纯本地。
2. **方案乙**（SPA 退役为目录页）是否执行。
3. **P0 五项**是否现在开工（全做约 1.5 天；其中文件名 bug 和 localStorage 命名空间最影响你日常使用）。
