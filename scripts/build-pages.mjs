// 方案乙站点构建：纯静态「目录页 + 每个题库一个单文件全平铺播放器」。
//
// - 每个可发布题库 → <id>.html（与提取器导出同模板：全部题目一页、逐题提交、错题/收藏），
//   题库数据构建时内嵌，无需 fetch/manifest，离线可用、任意子路径可托管。
// - index.html → 题库目录页（静态生成，带各题库的本地做题进度提示）。
// - 每个播放器注入独立 localStorage 命名空间（__BANK_STORAGE_NS__ = 题库 id），
//   同域名多题库互不串档。
//
// 输出 docs/（GitHub Pages「Deploy from a branch → /docs」兼容），Cloudflare Pages 用
// `npm run deploy:cf` 直传同一目录。PAGES_OUT 可覆盖输出目录。

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';

// testable-core 的合并 key 归一化要用 DOM 剥 HTML（cleanHTML），Node 下用 jsdom 垫片
const dom = new JSDOM('');
globalThis.document = dom.window.document;
globalThis.DOMParser = dom.window.DOMParser;

const { buildUniqueMergedQuestionBankFromCollections, safeJSONStringForScript } = await import('../src/lib/testable-core.js');

const ROOT = process.cwd();
const OUT = path.resolve(ROOT, process.env.PAGES_OUT || 'docs');
const MARKER = '__QUESTION_BANK_JSON__';
const NS_MARKER = '__BANK_STORAGE_NS__';
const FB_MARKER = '__FEEDBACK_CONFIG_JSON__';
// 反馈配置（构建时由环境变量注入；未设则 endpoint 为空 → 前端降级为 mailto/剪贴板，按钮不失效）
const FEEDBACK_CONFIG = {
  endpoint: process.env.FEEDBACK_ENDPOINT || '',          // 例如 https://question-bank-78u.pages.dev/api/feedback
  email: process.env.FEEDBACK_EMAIL || '',                // mailto 降级收件人
  turnstile_site_key: process.env.TURNSTILE_SITE_KEY || '', // 选填：配了才显示验证码
  app_version: process.env.GIT_SHA || process.env.APP_VERSION || 'site',
};

const template = readFileSync(path.join(ROOT, 'src/templates/question-bank-template.html'), 'utf8');
if (!template.includes(MARKER)) {
  throw new Error('题库模板缺少 __QUESTION_BANK_JSON__ marker');
}

// 从模板里抽出星座粒子 IIFE，复用到目录页 —— 单一来源，两处永不漂移
const CONSTELLATION_MATCH = template.match(/<script>\s*\/\* ===== 星座[\s\S]*?function constellation\(\)[\s\S]*?<\/script>/);
const CONSTELLATION_SCRIPT = CONSTELLATION_MATCH ? CONSTELLATION_MATCH[0] : '';
if (!CONSTELLATION_SCRIPT) console.warn('! 未能从模板抽取星座粒子脚本，目录页将无粒子背景');

function escapeHTML(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function playerHtml(payload, bankId) {
  const ns = /^[A-Za-z0-9_-]{1,64}$/.test(String(bankId)) ? String(bankId) : 'amt';
  // <script> 内联转义的唯一权威实现在 testable-core（不再维护镜像拷贝）
  return template
    .replace(MARKER, safeJSONStringForScript(JSON.stringify(payload)))
    .replace(NS_MARKER, ns)
    .replace(FB_MARKER, safeJSONStringForScript(JSON.stringify(FEEDBACK_CONFIG)));
}

// BANKS_MANIFEST 可注入替代清单（e2e 用测试清单，与作者本地的上/下架状态解耦）
const MANIFEST_PATH = process.env.BANKS_MANIFEST
  ? path.resolve(ROOT, process.env.BANKS_MANIFEST)
  : path.join(ROOT, 'public/banks/index.json');
// BANKS_ROOT：题库数据文件的根目录（清单里 banks/<id>.json 的相对锚点），默认 public/
const BANKS_ROOT = process.env.BANKS_ROOT ? path.resolve(ROOT, process.env.BANKS_ROOT) : path.join(ROOT, 'public');
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));

// 先校验再动 docs/：清单里没有任何可发布题库时立即报错，
// 不能像以前那样先 rmSync 把上一次的好产物清空再报错（失败构建毁掉可用产物）。
const deployableCount = (Array.isArray(manifest) ? manifest : [])
  .filter((e) => e && String(e.id || '').trim() && e.deploy !== false && (e.json || e.payload)).length;
// 有意清空站点（全部解除部署）：ALLOW_EMPTY_SITE=1 放行，目录页会显示「暂无题库」空态
const ALLOW_EMPTY = process.env.ALLOW_EMPTY_SITE === '1';
if (!deployableCount && !ALLOW_EMPTY) {
  throw new Error('banks/index.json 里没有可发布的题库（全部已下架或清单为空）——已保留现有 docs/ 不动。这是防误清空保护；确要清空线上请在提取器部署时确认，或 CLI 加 ALLOW_EMPTY_SITE=1。');
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

mkdirSync(path.join(OUT, 'banks'), { recursive: true });

const generated = [];
const siteManifest = []; // docs/banks/index.json：通用播放器按 ?bank= 查这个清单
const publicBankQuestions = []; // 供「全部题库合并练习」使用
for (const entry of Array.isArray(manifest) ? manifest : []) {
  const id = String(entry && entry.id || '').trim();
  if (!id) continue;
  // Opt-out: real banks publish by default; dev/test fixtures set "deploy": false.
  if (entry.deploy === false) {
    console.log(`· skip ${id} (deploy: false)`);
    continue;
  }
  const isProtected = entry.mode === 'protected';
  const rel = isProtected ? entry.payload : entry.json;
  if (!rel) continue;
  const srcPath = path.join(BANKS_ROOT, rel);
  if (!existsSync(srcPath)) {
    console.warn(`! skip ${id}: missing ${rel}`);
    continue;
  }
  const rawText = readFileSync(srcPath, 'utf8');
  const parsed = JSON.parse(rawText);
  if (!isProtected && Array.isArray(parsed)) publicBankQuestions.push(parsed);

  // 题库数据原样进 banks/ 文件夹（公开 .json / 加密 .qbpack），播放器运行时拉取
  const dataFile = `banks/${id}.${isProtected ? 'qbpack' : 'json'}`;
  writeFileSync(path.join(OUT, dataFile), rawText);

  const count = isProtected ? (entry.question_count || 0) : (Array.isArray(parsed) ? parsed.length : 0);
  siteManifest.push({
    id,
    title: entry.title || id,
    mode: isProtected ? 'protected' : 'public',
    description: entry.description || '',
    tags: Array.isArray(entry.tags) ? entry.tags : [],
    question_count: count,
    has_images: !!entry.has_images,
    ...(isProtected ? { payload: dataFile } : { json: dataFile }),
  });
  generated.push({
    id,
    file: `player.html?bank=${id}`,
    title: entry.title || id,
    description: entry.description || '',
    tags: Array.isArray(entry.tags) ? entry.tags : [],
    count,
    protected: isProtected,
  });
  console.log(`✓ ${dataFile}  (${count} 题${isProtected ? ', 🔒 protected' : ''})`);
}

if (!generated.length && !ALLOW_EMPTY) {
  throw new Error('banks/index.json 里没有可发布的题库');
}
if (!generated.length) console.log('· 空站点构建（全部题库已解除部署）');

// 「多题库一起做」入口：运行时按所选题库现场合并（智能去重：题干+答案），不再预生成文件。
// 页内用「筛选题库」勾选任意组合练习。密码保护题库不参与合并。
let mergedEntry = null;
if (generated.length > 1) {
  // 选择式入口：新播放器打开 all-banks 会先弹「选择题库」，按所选集合现场拉取合并。
  // 仅保留清单条目（含题数）供目录卡片与播放器分流；不再写 all-banks.json。
  // 注意：极旧的缓存播放器曾直接 fetch all-banks.json，删文件后它们会 404；
  // 若要兼容这类旧缓存，恢复下面的 writeFileSync 与 json 字段即可。
  const merged = publicBankQuestions.length
    ? buildUniqueMergedQuestionBankFromCollections(publicBankQuestions)
    : [];
  const mergedCount = merged.length;
  siteManifest.push({
    id: 'all-banks',
    title: 'All Banks · Merged Practice',
    mode: 'public',
    virtual: true,
    description: 'Pick any combination of banks and practice them together.',
    tags: [],
    question_count: mergedCount,
    has_images: merged.some((q) => !!q.image),
  });
  mergedEntry = {
    id: 'all-banks',
    file: 'player.html?bank=all-banks',
    // 目录页 UI 默认英文；这两段文案带 data-i18n，随语言切换（真实题库的标题/描述是内容，不翻译）
    title: 'All Banks · Merged Practice',
    description: 'Pick any combination of banks and practice them together (duplicates merged automatically).',
    tags: [],
    count: mergedCount,
    protected: false,
  };
  console.log(`✓ all-banks 选择式入口（${mergedCount} 题；运行时现场合并，不再生成 all-banks.json）`);
}

// 通用播放器（remote 模式：按 ?bank=<id> 从 banks/ 拉数据）+ 站点题库清单
writeFileSync(path.join(OUT, 'player.html'), playerHtml({ mode: 'remote' }, 'remote'));
writeFileSync(path.join(OUT, 'banks/index.json'), JSON.stringify(siteManifest, null, 2) + '\n');
console.log(`✓ player.html + banks/index.json（${siteManifest.length} 个题库条目）`);

// format.html = 题库 JSON 格式文档（英文在前、中文在后，静态双语页）
function formatHtml() {
  const example = `[
  {
    "id": "demo-1",
    "question": "Which fabric is approved for aircraft covering?",
    "choices": ["Polyester", "Cotton bedsheet", "Nylon tarp", "Canvas drop cloth"],
    "answer": 0,
    "source": "Chapter 3 – Coverings"
  },
  {
    "id": "demo-2",
    "question": "Select ALL tools required for fabric testing. (multiple answers)",
    "choices": ["Punch tester", "Hammer", "Maule tester", "Torque wrench"],
    "answers": [0, 2]
  },
  {
    "id": "demo-3",
    "type": "fill",
    "question": "A hole smaller than ____ inches may be repaired with a doped-on patch.",
    "blanks": [["8", "eight"]]
  },
  {
    "id": "demo-4",
    "question": "Identify the part shown in the image.",
    "image": "https://example.com/part-diagram.png",
    "choices": ["Rib", "Spar", "Longeron"],
    "answer": 1
  }
]`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Question Bank JSON Format / 题库 JSON 格式说明</title>
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <style>
    :root{--ink:#2d3b45;--muted:#6b7280;--border:#e5e7eb;--bg:#f9fafb;--brand:#2563eb;--card:#fff}
    *{box-sizing:border-box}
    body{font-family:system-ui,-apple-system,sans-serif;color:var(--ink);background:var(--bg);max-width:860px;margin:20px auto;line-height:1.7;padding:0 12px}
    h1{font-size:1.4rem;margin:8px 0}
    h2{font-size:1.15rem;margin:28px 0 8px;border-bottom:1px solid var(--border);padding-bottom:6px}
    h3{font-size:1rem;margin:18px 0 6px}
    code{background:#eef2ff;border:1px solid #e0e7ff;border-radius:4px;padding:1px 5px;font-size:13px}
    pre{background:#0f172a;color:#e2e8f0;border-radius:10px;padding:16px;overflow-x:auto;font-size:13px;line-height:1.6}
    pre code{background:none;border:none;color:inherit;padding:0}
    table{border-collapse:collapse;width:100%;font-size:14px}
    th,td{border:1px solid var(--border);padding:8px 10px;text-align:left;vertical-align:top}
    th{background:#f3f4f6}
    .muted{color:var(--muted)}
    .back{display:inline-block;margin-bottom:10px;color:var(--brand);font-weight:600;text-decoration:none}
    .pill{display:inline-block;font-weight:600;font-size:12px;background:#eef2ff;color:#3730a3;border:1px solid #e0e7ff;padding:2px 10px;border-radius:999px}
  </style>
</head>
<body>
  <a class="back" href="./">← Back to catalog / 返回目录</a>
  <h1>Question Bank JSON Format <span class="muted">/ 题库 JSON 格式说明</span></h1>
  <p class="muted">Write your own bank as a <code>.json</code> file (UTF-8), then use “Import your own bank” on the catalog page to practice it — nothing is uploaded; it stays in your browser.</p>

  <h2>English</h2>
  <p>A bank is a <strong>JSON array of question objects</strong>. Three question types are supported: single-choice, multiple-answer, and fill-in-the-blank.</p>

  <h3>Fields</h3>
  <table>
    <tr><th>Field</th><th>Required</th><th>Meaning</th></tr>
    <tr><td><code>id</code></td><td>✅ every question</td><td>Unique string within the file, e.g. <code>"ch3-12"</code>. Progress (wrong/star records) is keyed on it.</td></tr>
    <tr><td><code>question</code></td><td>✅ (unless <code>image</code> present)</td><td>The stem, plain text. <code>\\n</code> makes a line break.</td></tr>
    <tr><td><code>choices</code></td><td>✅ for choice questions</td><td>Array of <strong>at least 2</strong> strings.</td></tr>
    <tr><td><code>answer</code></td><td>single-choice</td><td><strong>0-based</strong> index into <code>choices</code> (first choice = 0).</td></tr>
    <tr><td><code>answers</code></td><td>multiple-answer</td><td>Array of 0-based indexes, e.g. <code>[0,2]</code>. Player switches to checkboxes automatically; all must match.</td></tr>
    <tr><td><code>type</code></td><td>fill-in only</td><td>Set <code>"fill"</code> (or just provide <code>blanks</code>).</td></tr>
    <tr><td><code>blanks</code></td><td>fill-in</td><td>One array per blank, each listing the accepted answers: <code>[["8","eight"]]</code> = 1 blank with 2 accepted spellings; <code>[["a"],["b"]]</code> = 2 blanks.</td></tr>
    <tr><td><code>question_html</code></td><td>optional (fill-in)</td><td>HTML stem with <code>&lt;input data-blank="1"&gt;</code> placed where blanks belong (1-based). Omit it and inputs are appended below the stem.</td></tr>
    <tr><td><code>answer_sets</code></td><td>optional (fill-in)</td><td>Alternative whole-row combinations; any ONE set matching counts as correct.</td></tr>
    <tr><td><code>image</code></td><td>optional</td><td>Image URL or base64 <code>data:image/...</code> string — or an array of them. Shown above the choices.</td></tr>
    <tr><td><code>source</code></td><td>optional</td><td>Where the question came from; shown small under the card.</td></tr>
  </table>

  <h3>Grading rules</h3>
  <ul>
    <li>Fill-in answers ignore case, extra spaces, and spacing differences (<code>check list</code> = <code>checklist</code>).</li>
    <li>Multiple-answer questions require the exact set — no partial credit.</li>
    <li>Files are validated on import; invalid records are skipped with a reason (missing <code>id</code>, fewer than 2 choices, out-of-range <code>answer</code>, fill-in without accepted answers…).</li>
  </ul>

  <h2>中文</h2>
  <p>题库就是一个 <strong>JSON 数组</strong>，每个元素是一道题。支持三种题型：单选、多选、填空。</p>
  <ul>
    <li><code>id</code>：每题必填、文件内唯一（错题/收藏记录靠它存）。</li>
    <li><code>question</code>：题干纯文本（有 <code>image</code> 时可留空）；<code>\\n</code> 换行。</li>
    <li>单选：<code>choices</code>（≥2 个选项）+ <code>answer</code>（正确选项的下标，<strong>从 0 开始</strong>）。</li>
    <li>多选：用 <code>answers: [0,2]</code> 数组代替 <code>answer</code>，播放器自动变复选框，需全对。</li>
    <li>填空：<code>type:"fill"</code> + <code>blanks</code>——每个空一个数组，列出全部可接受答案，如 <code>[["8","eight"]]</code>；判分忽略大小写、多余空格、空格有无（<code>check list</code> = <code>checklist</code>）。</li>
    <li>可选：<code>image</code>（图片 URL 或 base64 data-URI，可数组）、<code>source</code>（来源标注）、<code>question_html</code>（题干内嵌输入框 <code>&lt;input data-blank="1"&gt;</code>）、<code>answer_sets</code>（多组合答案，任一组全匹配即对）。</li>
    <li>导入时自动校验，不合格的题会被跳过并提示原因（缺 id / 选项不足 2 个 / answer 越界 / 填空没有可接受答案等）。</li>
  </ul>

  <h2>Complete example / 完整示例</h2>
  <pre><code>${example}</code></pre>
  <p class="muted">Save as e.g. <code>my-bank.json</code> → catalog page → “Import your own bank”. The Extractor's “导出全部合并 JSON” produces exactly this format. / 保存为 <code>.json</code> 后到目录页导入即可；提取器导出的合并 JSON 就是这个格式。</p>
</body>
</html>
`;
}

// index.html = 题库目录页（点卡片进入对应单文件播放器）。
// UI 默认英文，右上角语言切换（en/zh/es），与播放器共用 qb_ui_lang 偏好；
// 题库标题/描述是内容不翻译，仅合并卡和 UI 文案随语言切换。
function catalogHtml(banks) {
  const cards = banks.map((bank) => `
    <a class="card" href="${escapeHTML(bank.file)}" data-bank-id="${escapeHTML(bank.id)}" data-testid="bank-card">
      <div class="card-head">
        <h2${bank.id === 'all-banks' ? ' data-i18n="merged_title"' : ''}>${escapeHTML(bank.title)}</h2>
        <span class="pill ${bank.protected ? 'locked' : ''}" data-i18n="${bank.protected ? 'badge_protected' : 'badge_public'}">${bank.protected ? '🔒 Protected' : 'Public'}</span>
      </div>
      ${bank.description ? `<p class="desc"${bank.id === 'all-banks' ? ' data-i18n="merged_desc"' : ''}>${escapeHTML(bank.description)}</p>` : ''}
      <div class="meta-row">
        <span class="pill muted" data-qcount="${bank.count}">${bank.count} questions</span>
        <span class="pill muted progress" data-progress-for="${escapeHTML(bank.id)}" hidden></span>
        ${bank.tags.slice(0, 4).map((tag) => `<span class="pill muted">${escapeHTML(tag)}</span>`).join('')}
      </div>
      <span class="go" data-i18n="start">Start practicing →</span>
    </a>`).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>AMT Question Bank Practice</title>
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="color-scheme" content="light dark" />
  <script>(function(){try{var k="qb_theme",s=localStorage.getItem(k),m=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches,t=(s==="dark"||s==="light")?s:(m?"dark":"light");document.documentElement.setAttribute("data-theme",t);}catch(e){}})();</script>
  <style>
    :root{
      color-scheme: light;
      --bg:#eef1f6; --card:#ffffff; --card-2:#f6f8fc;
      --ink:#1e293b; --ink-soft:#3b4860; --muted:#64748b;
      --border:#e4e8f0; --border-strong:#d3d9e4;
      --brand:#2563eb; --brand-strong:#1d4ed8; --glow:rgba(37,99,235,.06); --particle-rgb:37,99,235;
      --badge-bg:#eef2ff; --badge-ink:#3730a3; --badge-border:#e0e7ff;
      --muted-bg:#eef1f6;
      --locked-bg:#fef3c7; --locked-ink:#92400e; --locked-border:#fde68a;
      --ok-bg:#e7f8f0; --ok-ink:#047857; --ok-border:#b6ead2;
      --danger-ink:#b91c1c;
      --shadow-sm:0 1px 2px rgba(16,24,40,.06); --shadow-md:0 12px 30px rgba(16,24,40,.10);
      --radius:16px; --radius-sm:10px; --pill:999px;
    }
    html[data-theme="dark"]{
      color-scheme: dark;
      --bg:#0b1020; --card:#141b2d; --card-2:#0f1626;
      --ink:#e8edf6; --ink-soft:#c4cee0; --muted:#93a0b8;
      --border:#26304a; --border-strong:#33415f;
      --brand:#6f9bff; --brand-strong:#5b8cff; --glow:rgba(111,155,255,.12); --particle-rgb:111,155,255;
      --badge-bg:rgba(99,102,241,.20); --badge-ink:#c7d2fe; --badge-border:rgba(129,140,248,.32);
      --muted-bg:rgba(148,163,184,.12);
      --locked-bg:rgba(245,158,11,.16); --locked-ink:#fcd34d; --locked-border:rgba(245,158,11,.35);
      --ok-bg:rgba(16,185,129,.15); --ok-ink:#6ee7b7; --ok-border:rgba(52,211,153,.34);
      --danger-ink:#fca5a5;
      --shadow-sm:0 1px 2px rgba(0,0,0,.4); --shadow-md:0 16px 38px rgba(0,0,0,.5);
    }
    *{box-sizing:border-box}
    /* 星座粒子背景层：固定全屏、置底(-1)、不挡点击；正文是 body 在流内容、自然在其上 */
    #constellation{position:fixed; inset:0; width:100%; height:100%; pointer-events:none; z-index:-1; display:block}
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif; color:var(--ink); background:radial-gradient(1100px 560px at 100% -12%, var(--glow), transparent 60%), var(--bg); background-attachment:fixed; min-height:100vh; max-width:940px; margin:0 auto; line-height:1.6; padding:22px 16px 64px; -webkit-font-smoothing:antialiased}
    h1{font-size:1.7rem; font-weight:780; letter-spacing:-.02em; margin:0 0 4px}
    .topbar{display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:6px}
    .topbar-controls{display:flex; align-items:center; gap:8px; flex-wrap:wrap}
    .lang{display:flex; align-items:center; gap:8px; color:var(--muted); font-size:13px}
    .lang select{font:inherit; height:36px; padding:8px 10px; border:1px solid var(--border-strong); border-radius:10px; background:var(--card); color:var(--ink); font-size:13px; cursor:pointer; box-shadow:var(--shadow-sm)}
    #theme-toggle{width:36px; height:36px; border-radius:10px; padding:0; border:1px solid var(--border-strong); background:var(--card); color:var(--ink); font-size:16px; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; box-shadow:var(--shadow-sm)}
    #theme-toggle:hover{background:var(--muted-bg)}
    .sub{color:var(--muted); margin:0 0 20px; font-size:14.5px; max-width:70ch}
    .grid{display:grid; gap:14px}
    .card{display:block; background:var(--card); border:1px solid var(--border); border-radius:var(--radius); padding:20px; text-decoration:none; color:inherit; box-shadow:var(--shadow-sm); transition:box-shadow .18s, transform .18s, border-color .18s}
    .card:hover{box-shadow:var(--shadow-md); transform:translateY(-2px); border-color:var(--border-strong)}
    .card-head{display:flex; justify-content:space-between; gap:12px; align-items:flex-start}
    .card h2{font-size:1.18rem; font-weight:720; margin:0; letter-spacing:-.01em}
    .desc{color:var(--muted); font-size:14px; margin:8px 0 0; line-height:1.55}
    .meta-row{display:flex; gap:8px; flex-wrap:wrap; margin-top:14px; align-items:center}
    .pill{display:inline-flex; align-items:center; font-weight:650; font-size:12px; background:var(--badge-bg); color:var(--badge-ink); border:1px solid var(--badge-border); padding:3px 11px; border-radius:var(--pill); white-space:nowrap}
    .pill.muted{background:var(--muted-bg); color:var(--muted); border-color:var(--border)}
    .pill.locked{background:var(--locked-bg); color:var(--locked-ink); border-color:var(--locked-border)}
    .pill.progress{background:var(--ok-bg); color:var(--ok-ink); border-color:var(--ok-border)}
    button.pill{cursor:pointer; font:inherit}
    .go{display:inline-flex; align-items:center; gap:6px; margin-top:14px; color:var(--brand); font-weight:700; font-size:14px}
    .card:hover .go{gap:9px}
    input[type=file]{font:inherit; font-size:13px; color:var(--muted)}
  </style>
</head>
<body>
  <canvas id="constellation" aria-hidden="true"></canvas>
  <div class="topbar">
    <h1 data-i18n="title">AMT Question Bank Practice</h1>
    <div class="topbar-controls">
      <button id="theme-toggle" type="button" onclick="toggleTheme()" title="Toggle theme" aria-label="Toggle theme">🌙</button>
      <label class="lang">🌐
        <select id="ui-lang" onchange="setLang(this.value)" data-testid="ui-lang-select">
          <option value="en">English</option>
          <option value="zh">中文</option>
          <option value="es">Español</option>
        </select>
      </label>
    </div>
  </div>
  <p class="sub" data-i18n="sub">Pick a bank to start — every question on one page, submit one by one; wrong answers and stars are saved on this device.</p>
  <div class="grid" data-testid="bank-list">
${cards}
  </div>
  ${banks.length ? '' : '<div class="desc" data-i18n="catalog_empty" data-testid="catalog-empty" style="padding:18px;text-align:center">No banks are published right now. You can still import your own JSON below.</div>'}

  <div class="grid" id="local-grid" data-testid="local-grid" style="margin-top:14px"></div>

  <section class="card" style="margin-top:14px" data-testid="import-box">
    <div class="card-head">
      <h2 data-i18n="import_title">Import your own bank (local)</h2>
      <span class="pill muted" data-i18n="import_badge">Stays on this device</span>
    </div>
    <p class="desc" data-i18n="import_desc">Pick a question-bank .json file — it is saved in this browser only (nothing is uploaded) and appears above as a Local bank.</p>
    <div class="meta-row" style="margin-top:12px;align-items:center">
      <input type="file" id="import-file" accept=".json,application/json" data-testid="import-file">
      <a class="go" style="margin-top:0" href="format.html" data-i18n="format_link" data-testid="format-link">JSON format guide →</a>
    </div>
    <p class="desc" id="import-msg" style="margin-top:8px" hidden data-testid="import-msg"></p>
  </section>
  <script>
    var I18N = {
      en: { title:"AMT Question Bank Practice", sub:"Pick a bank to start — every question on one page, submit one by one; wrong answers and stars are saved on this device.",
            merged_title:"All Banks · Merged Practice", merged_desc:"Every public bank merged into one page (duplicates removed). Use \\u201CFilter Question Banks\\u201D inside to pick any combination.",
            badge_public:"Public", badge_protected:"\\uD83D\\uDD12 Protected", count:"{n} questions", progress:"{n} practiced", start:"Start practicing \\u2192",
            import_title:"Import your own bank (local)", import_badge:"Stays on this device",
            import_desc:"Pick a question-bank .json file \\u2014 it is saved in this browser only (nothing is uploaded) and appears above as a Local bank.",
            format_link:"JSON format guide \\u2192", local_badge:"Local", local_practice:"Practice \\u2192", local_delete:"Delete",
            import_ok:"Imported \\u201C{t}\\u201D: {n} questions ready.", import_rej:" ({r} invalid skipped \\u2014 see format guide)",
            err_parse:"Not valid JSON \\u2014 check the file.", err_shape:"No valid questions found \\u2014 see the JSON format guide.", err_quota:"Browser storage is full \\u2014 delete a local bank or shrink images.",
            confirm_delete:"Delete this local bank? Its practice records stay until re-imported with the same file name." },
      zh: { title:"AMT \\u9898\\u5E93\\u7EC3\\u4E60", sub:"\\u9009\\u62E9\\u4E00\\u4E2A\\u9898\\u5E93\\u5F00\\u59CB \\u2014 \\u6240\\u6709\\u9898\\u76EE\\u4E00\\u9875\\u5E73\\u94FA\\uFF0C\\u9010\\u9898\\u63D0\\u4EA4\\uFF0C\\u9519\\u9898/\\u6536\\u85CF\\u81EA\\u52A8\\u4FDD\\u5B58\\u5728\\u672C\\u673A\\u3002",
            merged_title:"\\u5168\\u90E8\\u9898\\u5E93 \\u00B7 \\u5408\\u5E76\\u7EC3\\u4E60", merged_desc:"\\u6240\\u6709\\u516C\\u5F00\\u9898\\u5E93\\u5408\\u5E76\\u5230\\u4E00\\u9875\\uFF08\\u91CD\\u590D\\u9898\\u5DF2\\u667A\\u80FD\\u53BB\\u91CD\\uFF09\\u3002\\u6253\\u5F00\\u540E\\u5728\\u300C\\u7B5B\\u9009\\u9898\\u5E93\\u300D\\u91CC\\u52FE\\u9009\\u4EFB\\u610F\\u7EC4\\u5408\\u4E00\\u8D77\\u505A\\u3002",
            badge_public:"\\u516C\\u5F00", badge_protected:"\\uD83D\\uDD12 \\u5BC6\\u7801\\u4FDD\\u62A4", count:"{n} \\u9898", progress:"\\u5DF2\\u505A {n} \\u9898", start:"\\u5F00\\u59CB\\u505A\\u9898 \\u2192",
            import_title:"\\u5BFC\\u5165\\u81EA\\u5DF1\\u7684\\u9898\\u5E93\\uFF08\\u672C\\u5730\\uFF09", import_badge:"\\u4EC5\\u5B58\\u672C\\u8BBE\\u5907",
            import_desc:"\\u9009\\u4E00\\u4E2A\\u9898\\u5E93 .json \\u6587\\u4EF6 \\u2014 \\u53EA\\u5B58\\u5728\\u8FD9\\u4E2A\\u6D4F\\u89C8\\u5668\\u91CC\\uFF08\\u4E0D\\u4E0A\\u4F20\\uFF09\\uFF0C\\u5BFC\\u5165\\u540E\\u5728\\u4E0A\\u65B9\\u4EE5\\u300C\\u672C\\u5730\\u300D\\u5361\\u7247\\u51FA\\u73B0\\u3002",
            format_link:"JSON \\u683C\\u5F0F\\u8BF4\\u660E \\u2192", local_badge:"\\u672C\\u5730", local_practice:"\\u5F00\\u59CB\\u505A\\u9898 \\u2192", local_delete:"\\u5220\\u9664",
            import_ok:"\\u5DF2\\u5BFC\\u5165\\u300C{t}\\u300D\\uFF1A{n} \\u9898\\u53EF\\u7528\\u3002", import_rej:"\\uFF08\\u8DF3\\u8FC7 {r} \\u6761\\u4E0D\\u5408\\u683C\\u8BB0\\u5F55\\uFF0C\\u89C1\\u683C\\u5F0F\\u8BF4\\u660E\\uFF09",
            err_parse:"\\u4E0D\\u662F\\u5408\\u6CD5\\u7684 JSON \\u6587\\u4EF6\\u3002", err_shape:"\\u6CA1\\u6709\\u627E\\u5230\\u53EF\\u7528\\u9898\\u76EE \\u2014 \\u8BF7\\u770B JSON \\u683C\\u5F0F\\u8BF4\\u660E\\u3002", err_quota:"\\u6D4F\\u89C8\\u5668\\u5B58\\u50A8\\u5DF2\\u6EE1 \\u2014 \\u5220\\u4E2A\\u672C\\u5730\\u9898\\u5E93\\u6216\\u51CF\\u5C0F\\u56FE\\u7247\\u3002",
            confirm_delete:"\\u5220\\u9664\\u8FD9\\u4E2A\\u672C\\u5730\\u9898\\u5E93\\uFF1F\\uFF08\\u505A\\u9898\\u8BB0\\u5F55\\u4FDD\\u7559\\uFF0C\\u540C\\u540D\\u91CD\\u65B0\\u5BFC\\u5165\\u53EF\\u63A5\\u7EED\\uFF09" },
      es: { title:"Pr\\u00E1ctica del banco de preguntas AMT", sub:"Elige un banco para empezar: todas las preguntas en una p\\u00E1gina, env\\u00EDa una por una; errores y favoritas se guardan en este dispositivo.",
            merged_title:"Todos los bancos \\u00B7 Pr\\u00E1ctica combinada", merged_desc:"Todos los bancos p\\u00FAblicos en una sola p\\u00E1gina (sin duplicados). Usa \\u201CFiltrar bancos\\u201D dentro para elegir cualquier combinaci\\u00F3n.",
            badge_public:"P\\u00FAblica", badge_protected:"\\uD83D\\uDD12 Protegida", count:"{n} preguntas", progress:"{n} practicadas", start:"Empezar \\u2192",
            import_title:"Importa tu propio banco (local)", import_badge:"Solo en este dispositivo",
            import_desc:"Elige un archivo .json \\u2014 se guarda solo en este navegador (no se sube nada) y aparece arriba como banco Local.",
            format_link:"Gu\\u00EDa del formato JSON \\u2192", local_badge:"Local", local_practice:"Practicar \\u2192", local_delete:"Eliminar",
            import_ok:"Importado \\u201C{t}\\u201D: {n} preguntas listas.", import_rej:" ({r} inv\\u00E1lidas omitidas \\u2014 ver gu\\u00EDa)",
            err_parse:"JSON no v\\u00E1lido.", err_shape:"No se encontraron preguntas v\\u00E1lidas \\u2014 ver la gu\\u00EDa del formato.", err_quota:"Almacenamiento del navegador lleno.",
            confirm_delete:"\\u00BFEliminar este banco local?" }
    };
    var LANG_KEY = "qb_ui_lang"; // 与做题页共用同一偏好
    var lang = (function(){ try{ var v = localStorage.getItem(LANG_KEY); return I18N[v] ? v : "en"; }catch(e){ return "en"; } })();
    function T(k, vars){
      var s = (I18N[lang] && I18N[lang][k]) || I18N.en[k] || k;
      if (vars) Object.keys(vars).forEach(function(key){ s = s.split("{" + key + "}").join(String(vars[key])); });
      return s;
    }
    function escHtml(v){ return String(v == null ? "" : v).replace(/[&<>"']/g, function(m){ return ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[m]; }); }

    /* ---- 本地题库（仅存浏览器，qb_local_banks_v1）---- */
    var LOCAL_KEY = "qb_local_banks_v1";
    function loadLocalBanks(){ try{ var o = JSON.parse(localStorage.getItem(LOCAL_KEY) || "{}"); return (o && typeof o === "object" && !Array.isArray(o)) ? o : {}; }catch(e){ return {}; } }
    function saveLocalBanks(o){ localStorage.setItem(LOCAL_KEY, JSON.stringify(o)); }
    function slugLocal(name){ return String(name || "bank").toLowerCase().replace(/\\.json$/i, "").replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "bank"; }
    // 与发布脚本同规则的轻量校验（导入侧提示用；详见 format.html）
    function validateBank(list){
      var valid = [], rejected = 0;
      (Array.isArray(list) ? list : []).forEach(function(rec){
        if (!rec || typeof rec !== "object" || Array.isArray(rec)) { rejected++; return; }
        var bad = false;
        if (!String(rec.id == null ? "" : rec.id).trim()) bad = true;
        var hasImg = !!(rec.image && (typeof rec.image === "string" || (Array.isArray(rec.image) && rec.image.length)));
        if (!String(rec.question == null ? "" : rec.question).trim() && !hasImg) bad = true;
        var isFill = rec.type === "fill" || Array.isArray(rec.blanks);
        if (isFill){
          var okFill = (Array.isArray(rec.blanks) ? rec.blanks : []).some(function(a){ return Array.isArray(a) && a.some(function(v){ return String(v == null ? "" : v).trim(); }); });
          if (!okFill) bad = true;
        } else if (Array.isArray(rec.choices)){
          var n = rec.choices.length;
          if (n < 2) bad = true;
          else if (Array.isArray(rec.answers)){
            if (!(rec.answers.length >= 1 && rec.answers.every(function(a){ return Number.isInteger(a) && a >= 0 && a < n; }))) bad = true;
          } else if (!(Number.isInteger(rec.answer) && rec.answer >= 0 && rec.answer < n)) bad = true;
        } else bad = true;
        if (bad) rejected++; else valid.push(rec);
      });
      return { valid: valid, rejected: rejected };
    }
    function renderLocalBanks(){
      var grid = document.getElementById("local-grid");
      if (!grid) return;
      var banks = loadLocalBanks();
      var ids = Object.keys(banks);
      grid.innerHTML = ids.map(function(id){
        var b = banks[id] || {};
        var count = Array.isArray(b.questions) ? b.questions.length : 0;
        return '<div class="card" data-testid="local-card" data-local-id="' + escHtml(id) + '">' +
          '<div class="card-head"><h2>' + escHtml(b.title || id) + '</h2><span class="pill progress">' + escHtml(T("local_badge")) + '</span></div>' +
          '<div class="meta-row"><span class="pill muted">' + escHtml(T("count", { n: count })) + '</span>' +
          '<span class="pill muted progress" data-progress-for="local-' + escHtml(id) + '" hidden></span></div>' +
          '<div style="display:flex;gap:14px;align-items:center;margin-top:12px">' +
          '<a class="go" style="margin-top:0" href="local.html?bank=' + encodeURIComponent(id) + '" data-testid="local-practice-link">' + escHtml(T("local_practice")) + '</a>' +
          '<button class="pill muted" style="cursor:pointer" onclick="removeLocalBank(\\'' + escHtml(id) + '\\')" data-testid="local-delete-btn">' + escHtml(T("local_delete")) + '</button>' +
          '</div></div>';
      }).join("");
      scanProgress();
    }
    function removeLocalBank(id){
      if (!confirm(T("confirm_delete"))) return;
      var banks = loadLocalBanks();
      delete banks[id];
      saveLocalBanks(banks);
      renderLocalBanks();
    }
    function importMessage(text, isError){
      var el = document.getElementById("import-msg");
      if (!el) return;
      el.hidden = false;
      el.textContent = text;
      el.style.color = isError ? "var(--danger-ink)" : "var(--ok-ink)";
    }
    (function bindImport(){
      var input = document.getElementById("import-file");
      if (!input) return;
      input.addEventListener("change", function(){
        var file = input.files && input.files[0];
        input.value = "";
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function(){
          var parsed;
          try{ parsed = JSON.parse(String(reader.result || "")); }
          catch(e){ importMessage(T("err_parse"), true); return; }
          var res = validateBank(parsed);
          if (!res.valid.length){ importMessage(T("err_shape"), true); return; }
          var title = String(file.name || "bank").replace(/\\.json$/i, "");
          var id = slugLocal(title);
          var banks = loadLocalBanks();
          try{
            banks[id] = { title: title, questions: res.valid, savedAt: new Date().toISOString() };
            saveLocalBanks(banks);
          }catch(e){ importMessage(T("err_quota"), true); return; }
          renderLocalBanks();
          importMessage(T("import_ok", { t: title, n: res.valid.length }) + (res.rejected ? T("import_rej", { r: res.rejected }) : ""), false);
        };
        reader.readAsText(file);
      });
    })();

    function applyLang(){
      document.documentElement.lang = lang === "zh" ? "zh-CN" : lang;
      renderLocalBanks(); // 本地卡片直接用 T() 重建
      document.querySelectorAll("[data-i18n]").forEach(function(el){ el.textContent = T(el.getAttribute("data-i18n")); });
      document.querySelectorAll("[data-qcount]").forEach(function(el){ el.textContent = T("count", { n: el.getAttribute("data-qcount") }); });
      document.querySelectorAll("[data-progress-for]").forEach(function(el){
        if (el.dataset.done) el.textContent = T("progress", { n: el.dataset.done });
      });
      var sel = document.getElementById("ui-lang"); if (sel) sel.value = lang;
    }
    function setLang(v){ lang = I18N[v] ? v : "en"; try{ localStorage.setItem(LANG_KEY, lang); }catch(e){} applyLang(); }
    // 进度提示：读各题库命名空间下的做题次数表
    function scanProgress(){
      document.querySelectorAll("[data-progress-for]").forEach(function(el){
        try{
          var id = el.getAttribute("data-progress-for");
          var raw = localStorage.getItem(id + "_attempt_count_map_v1");
          if(!raw) return;
          var map = JSON.parse(raw);
          var done = Object.keys(map && typeof map === "object" ? map : {}).length;
          if(done > 0){ el.dataset.done = String(done); el.hidden = false; el.textContent = T("progress", { n: done }); }
        }catch(_e){}
      });
    }
    var THEME_KEY = "qb_theme";
    function currentTheme(){ return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light"; }
    function applyThemeIcon(){
      var b = document.getElementById("theme-toggle");
      if (!b) return;
      var dark = currentTheme() === "dark";
      b.textContent = dark ? "☀️" : "🌙";
      var label = dark ? "Switch to light mode" : "Switch to dark mode";
      b.setAttribute("aria-label", label); b.title = label;
    }
    function setTheme(t){
      t = (t === "dark") ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", t);
      try{ localStorage.setItem(THEME_KEY, t); }catch(e){}
      applyThemeIcon();
      if(window.__constellationThemeUpdate) window.__constellationThemeUpdate(); // 粒子背景跟随主题变色
    }
    function toggleTheme(){ setTheme(currentTheme() === "dark" ? "light" : "dark"); }
    applyLang();
    applyThemeIcon();
    scanProgress();
  </script>
  ${CONSTELLATION_SCRIPT}
</body>
</html>
`;
}

// local.html：本地导入题库的通用播放器（题库存在访问者浏览器的 localStorage 里，
// 由目录页「Import your own bank」写入，?bank=<id> 指定）。命名空间启动时按 id 重设。
writeFileSync(path.join(OUT, 'local.html'), playerHtml({ mode: 'local-bank' }, 'local'));
console.log('✓ local.html  (本地导入播放器)');

// format.html：题库 JSON 格式文档（双语），给想自己写题库的人
writeFileSync(path.join(OUT, 'format.html'), formatHtml());
console.log('✓ format.html (JSON 格式文档)');

const catalogEntries = mergedEntry ? [mergedEntry, ...generated] : generated;
writeFileSync(path.join(OUT, 'index.html'), catalogHtml(catalogEntries));
writeFileSync(path.join(OUT, '.nojekyll'), '');
console.log(`\nindex.html → 目录页（${catalogEntries.length} 个入口 + 本地导入）`);
console.log(`Pages site: ${generated.length} bank page(s) + catalog in ${path.relative(ROOT, OUT) || '.'}/`);
