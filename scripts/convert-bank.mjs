#!/usr/bin/env node
// 题库加密模式转换：公开(.json) ⇄ 密码保护(.qbpack)，原地转换无需原始导出文件。
//   公开 → 加密：读 public/banks/<id>.json → 设密码加密成 .qbpack → 更新登记 → 删旧 .json
//   加密 → 公开：输入现有密码解密 .qbpack → 写回明文 .json → 更新登记 → 删 .qbpack
// 供 convert-bank.command 双击调用；也可命令行：
//   node scripts/convert-bank.mjs [--id <slug>] [--password <pw>] [--dry-run] [--no-deploy]
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { convertBankInRepo, readBankManifest, runDeploy, DEPLOY_SCRIPTS } from '../src/server/publish-bank-core.js';

// 注意用 fileURLToPath：项目路径带空格，URL.pathname 会变成 %20 导致路径失效
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INDEX_PATH = path.join(ROOT, 'public/banks/index.json');

const args = process.argv.slice(2);
const getArg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : '';
};
const DRY_RUN = args.includes('--dry-run');
const NO_DEPLOY = args.includes('--no-deploy');

// 带缓冲的 ask（管道输入兼容，见 publish-bank.mjs 同款）
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

console.log('═══ 题库加密模式转换（公开 ⇄ 密码保护）═══\n');

const manifest = readBankManifest(ROOT);
if (!Array.isArray(manifest) || !manifest.length) {
  console.error('✗ public/banks/index.json 里没有题库');
  process.exit(1);
}

console.log('当前题库：');
manifest.forEach((e, i) => {
  const state = e.deploy === false ? '·已下架' : '·在线';
  console.log(`  [${i + 1}] ${e.id} — ${e.title || ''} · ${e.mode === 'protected' ? '🔒 加密' : '公开'} ${state}`);
});

let id = getArg('--id');
if (!id) {
  const pick = await ask('\n转换哪个？输入编号或 id：');
  if (/^\d+$/.test(pick) && manifest[Number(pick) - 1]) id = manifest[Number(pick) - 1].id;
  else id = pick;
}
const entry = manifest.find((e) => e && e.id === id);
if (!entry) {
  console.error(`✗ 找不到 id "${id}"`);
  process.exit(1);
}

const toProtected = entry.mode !== 'protected';
console.log(`\n「${entry.title || id}」当前是${toProtected ? '公开' : '🔒 加密'}，将转换为 ${toProtected ? '🔒 密码保护' : '公开（任何人可见题目与答案）'}。`);

// 密码收集（解密/加密所需），其余交给核心
let password = getArg('--password');
if (toProtected) {
  if (!password) {
    password = await ask('设置题库密码：');
    const again = await ask('再输一遍确认：');
    if (!password || password !== again) { console.error('✗ 两次密码不一致（或为空），已取消。'); process.exit(1); }
  }
} else if (!password) {
  password = await ask('输入该题库的现有密码（用于解密）：');
}

const confirm = await ask(`\n确认转换？[y/N] `);
if (!/^y(es)?$/i.test(confirm)) { console.log('已取消。'); process.exit(0); }

if (DRY_RUN) {
  console.log(`\n[dry-run] 将转换 "${id}" 为 ${toProtected ? '🔒 密码保护' : '公开'}；之后重新部署。`);
  rl.close();
  process.exit(0);
}
const result = await convertBankInRepo({
  root: ROOT,
  id,
  password: toProtected ? '' : password,
  newPassword: toProtected ? password : '',
});
console.log(`\n✓ 已转换：public/${result.entry.json || result.entry.payload}（${result.count} 题，${toProtected ? '🔒 密码保护' : '公开'}）`);
if (toProtected) console.log('   提醒：转加密后该库不再进入合并练习页；历史明文版本无法从已公开的记录中收回。');

// 选择部署目标（所选端的 banks/index.json 清单随构建自动更新）
let target = String(getArg('--target') || '').toLowerCase(); // all | cf | gh | none
if (NO_DEPLOY) target = 'none';
if (!['all', 'cf', 'gh', 'none'].includes(target)) {
  const pick = await ask(`\n部署到哪里？[1] Cloudflare + GitHub（默认） [2] 仅 Cloudflare [3] 仅 GitHub [4] 暂不部署：`);
  target = pick === '2' ? 'cf' : pick === '3' ? 'gh' : pick === '4' ? 'none' : 'all';
}
rl.close();
if (target === 'none') {
  console.log('\n已转换但未部署。之后可跑：npm run deploy:cf（双端）/ deploy:cloudflare / deploy:github');
  process.exit(0);
}
console.log(`\n重新构建并部署（${target === 'all' ? 'Cloudflare + GitHub' : target === 'cf' ? '仅 Cloudflare' : '仅 GitHub'}）…\n`);
try {
  runDeploy(ROOT, target);
} catch (_e) {
  console.error(`\n✗ 部署失败（上面有日志）。转换已完成，修好后手动重跑：npm run ${DEPLOY_SCRIPTS[target]}`);
  process.exit(1);
}
console.log('\n🎉 完成！站点清单 banks/index.json 已自动更新。');
if (target !== 'gh') console.log('   Cloudflare：https://question-bank-78u.pages.dev/');
if (target !== 'cf') console.log('   GitHub：   https://shicheng0810.github.io/question-bank/ （约 1 分钟后生效）');
