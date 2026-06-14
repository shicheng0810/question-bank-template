#!/usr/bin/env node
// 一键发布新题库：找最新导出的 JSON → schema 校验 → 收进 public/banks/ 并登记
// index.json → npm run deploy:cf 上线。供 publish-bank.command 双击调用；
// 也可命令行：node scripts/publish-bank.mjs [--file <path>] [--id <slug>] [--title <t>] [--dry-run]
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { validateQuestionBankRecords } from '../src/lib/testable-core.js';
import { slugifyBankId } from '../src/lib/site-package.js';
import { publishBankToRepo, readBankManifest, runDeploy, DEPLOY_SCRIPTS } from '../src/server/publish-bank-core.js';

// 注意用 fileURLToPath：项目路径带空格，URL.pathname 会变成 %20 导致路径失效
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOWNLOADS = path.join(os.homedir(), 'Downloads');
const INDEX_PATH = path.join(ROOT, 'public/banks/index.json');

const args = process.argv.slice(2);
const getArg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : '';
};
const DRY_RUN = args.includes('--dry-run');
const NO_DEPLOY = args.includes('--no-deploy'); // 只写盘登记，不部署（连发多个库时最后手动 deploy 一次）

// 带缓冲的 ask：管道输入时整批行会先于提问到达，rl.question 会把它们丢掉；
// 这里把多余的行排队，保证 TTY 交互与管道自动化都能逐题消费。
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const pendingLines = [];
const waiters = [];
rl.on('line', (l) => { const w = waiters.shift(); if (w) w(l.trim()); else pendingLines.push(l.trim()); });
rl.on('close', () => { while (waiters.length) waiters.shift()(''); });
const ask = (q) => new Promise((resolve) => {
  process.stdout.write(q);
  const buffered = pendingLines.shift();
  if (buffered !== undefined) { process.stdout.write(buffered + '\n'); resolve(buffered); }
  else waiters.push(resolve);
});

// 按内容嗅探而不是按文件名猜：任何「能解析成题目数组」的 .json 都算候选
// （以前只认 question_bank*.json，用户改个名就找不到了）。
function looksLikeBankJson(filePath) {
  try {
    const stat = statSync(filePath);
    if (!stat.isFile() || stat.size === 0 || stat.size > 80 * 1024 * 1024) return false;
    const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
    if (!Array.isArray(parsed) || !parsed.length) return false;
    const sample = parsed[0];
    return !!(sample && typeof sample === 'object' &&
      (sample.question || sample.qtext || Array.isArray(sample.choices) || Array.isArray(sample.blanks)));
  } catch (_e) {
    return false;
  }
}

function findRecentBankJsons() {
  try {
    return readdirSync(DOWNLOADS)
      .filter((f) => /\.json$/i.test(f))
      .map((f) => ({ file: path.join(DOWNLOADS, f), mtime: statSync(path.join(DOWNLOADS, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, 12) // 只嗅探最近 12 个，避免逐个解析太多大文件
      .filter((c) => looksLikeBankJson(c.file))
      .slice(0, 5);
  } catch (_e) {
    return [];
  }
}

console.log('═══ 发布新题库到练习站 ═══\n');

// ① 选文件
let filePath = getArg('--file');
if (!filePath) {
  const candidates = findRecentBankJsons();
  if (candidates.length) {
    console.log('在「下载」里找到这些题库 JSON（新→旧）：');
    candidates.forEach((c, i) => {
      const when = new Date(c.mtime).toLocaleString('zh-CN');
      console.log(`  [${i + 1}] ${path.basename(c.file)}  (${when})`);
    });
    const pick = await ask(`\n用哪个？回车 = [1] 最新的；输入编号或直接粘贴文件路径：`);
    if (!pick) filePath = candidates[0].file;
    else if (/^\d+$/.test(pick) && candidates[Number(pick) - 1]) filePath = candidates[Number(pick) - 1].file;
    else filePath = pick.replace(/^['"]|['"]$/g, '');
  } else {
    filePath = (await ask('「下载」里没找到 question_bank*.json，请粘贴 JSON 文件路径：')).replace(/^['"]|['"]$/g, '');
  }
}
if (!existsSync(filePath)) {
  console.error(`✗ 文件不存在：${filePath}`);
  process.exit(1);
}

// ② 解析 + 校验
let questions;
try {
  questions = JSON.parse(readFileSync(filePath, 'utf8'));
} catch (e) {
  console.error(`✗ 不是合法 JSON：${e.message}`);
  process.exit(1);
}
if (!Array.isArray(questions) || !questions.length) {
  console.error('✗ JSON 不是非空题目数组（请用提取器的「导出全部合并 JSON」）');
  process.exit(1);
}
const { valid, rejected } = validateQuestionBankRecords(questions);
console.log(`\n✓ 读取 ${questions.length} 题；校验通过 ${valid.length} 题${rejected.length ? `，剔除 ${rejected.length} 条不完整记录` : ''}`);
if (rejected.length) {
  rejected.slice(0, 5).forEach((r) => console.log(`   · ${r.record && r.record.id}: ${r.reasons.join('；')}`));
  if (rejected.length > 5) console.log(`   · …共 ${rejected.length} 条`);
}
if (!valid.length) {
  console.error('✗ 没有可发布的有效题目');
  process.exit(1);
}

// ③ id / 标题 / 描述
const baseName = path.basename(filePath, '.json').replace(/^question_bank_?/i, '').replace(/_\d{8}.*$/, '');
let id = getArg('--id') || slugifyBankId(await ask(`\n题库 id（小写短横线，回车 = "${slugifyBankId(baseName) || 'new-bank'}"）：`) || baseName) || 'new-bank';
id = slugifyBankId(id);
const manifest = readBankManifest(ROOT);
const existing = manifest.find((e) => e && e.id === id);
if (existing) {
  const yn = await ask(`⚠ id "${id}" 已存在（${existing.title}，${existing.question_count} 题）。覆盖更新它吗？[y/N] `);
  if (!/^y(es)?$/i.test(yn)) { console.log('已取消。'); process.exit(0); }
}
const title = getArg('--title') || (await ask(`标题（回车 = "${existing ? existing.title : id}"）：`)) || (existing ? existing.title : id);
const description = (await ask(`描述（可选，回车跳过${existing && existing.description ? `；回车沿用旧描述` : ''}）：`)) || (existing ? existing.description : '') || '';

// ④ 公开 / 密码保护
let isProtected = args.includes('--protected');
let password = getArg('--password');
if (!isProtected && !password) {
  const modePick = await ask(`\n发布方式：[1] 公开（默认） [2] 密码保护（访问者需输密码解锁）：`);
  isProtected = modePick === '2';
}
if (isProtected && !password) {
  password = await ask('设置题库密码：');
  const again = await ask('再输一遍确认：');
  if (!password || password !== again) {
    console.error('✗ 两次密码不一致（或为空），已取消。');
    process.exit(1);
  }
}

// ⑤ 落盘 + 登记（与提取器「发布到站点」共用 publish-bank-core）
if (DRY_RUN) {
  console.log(`\n[dry-run] 将${isProtected ? '加密后' : ''}写入 public/banks/${id}.${isProtected ? 'qbpack' : 'json'}（${valid.length} 题）并登记 index.json`);
  rl.close();
  process.exit(0);
}
const result = await publishBankToRepo({
  root: ROOT,
  questions: valid,
  id,
  title,
  description,
  mode: isProtected ? 'protected' : 'public',
  password,
});
if (result.removedOld) console.log(`✓ 已清理旧文件 public/${result.removedOld}`);
console.log(`\n✓ 已写入 public/${result.bankRel} 并登记 index.json（${result.replaced ? '更新' : '新增'}：${title}，${result.count} 题${isProtected ? '，🔒 密码保护' : ''}）`);
if (isProtected) console.log('   注意：密码保护题库不会进入合并练习页（内容是加密的，无法合并）。');

// ⑥ 选择部署目标（两端的 banks/index.json 清单都会随构建自动更新）
let target = String(getArg('--target') || '').toLowerCase(); // all | cf | gh | none
if (NO_DEPLOY) target = 'none';
if (!['all', 'cf', 'gh', 'none'].includes(target)) {
  const pick = await ask(`\n部署到哪里？[1] Cloudflare + GitHub（默认） [2] 仅 Cloudflare [3] 仅 GitHub [4] 暂不部署：`);
  target = pick === '2' ? 'cf' : pick === '3' ? 'gh' : pick === '4' ? 'none' : 'all';
}
rl.close();
if (target === 'none') {
  console.log('\n已登记但未部署。之后可跑：npm run deploy:cf（双端）/ deploy:cloudflare / deploy:github');
  process.exit(0);
}
console.log(`\n开始构建并部署（${target === 'all' ? 'Cloudflare + GitHub' : target === 'cf' ? '仅 Cloudflare' : '仅 GitHub'}）…\n`);
try {
  runDeploy(ROOT, target);
} catch (_e) {
  console.error(`\n✗ 部署失败（上面有日志）。题库文件已就位，修好后可手动重跑：npm run ${DEPLOY_SCRIPTS[target]}`);
  process.exit(1);
}
console.log(`\n🎉 完成！站点清单 banks/index.json 已随构建自动更新。`);
if (target !== 'gh') console.log(`   Cloudflare：https://question-bank-78u.pages.dev/player.html?bank=${id}`);
if (target !== 'cf') console.log(`   GitHub：   https://shicheng0810.github.io/question-bank/player.html?bank=${id} （约 1 分钟后生效）`);
console.log(`   （合并练习库 all-banks 也已自动包含它）`);
