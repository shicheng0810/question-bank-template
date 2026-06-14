#!/usr/bin/env node
// 下架/删除题库：列出 index.json 里的题库 → 选一个 → 「仅下架（可恢复）」或
// 「彻底删除」→ 重新部署。供 remove-bank.command 双击调用；
// 也可命令行：node scripts/remove-bank.mjs [--id <slug>] [--mode unlist|delete] [--dry-run]
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { removeBankFromRepo, readBankManifest, runDeploy, DEPLOY_SCRIPTS } from '../src/server/publish-bank-core.js';

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

console.log('═══ 下架 / 删除题库 ═══\n');

const manifest = readBankManifest(ROOT);
if (!Array.isArray(manifest) || !manifest.length) {
  console.error('✗ public/banks/index.json 里没有题库');
  process.exit(1);
}

console.log('当前登记的题库：');
manifest.forEach((e, i) => {
  const state = e.deploy === false ? '（已下架）' : '（在线）';
  console.log(`  [${i + 1}] ${e.id} — ${e.title || ''} · ${e.question_count ?? '?'} 题 ${state}`);
});

// ① 选题库
let id = getArg('--id');
if (!id) {
  const pick = await ask('\n要处理哪个？输入编号或 id：');
  if (/^\d+$/.test(pick) && manifest[Number(pick) - 1]) id = manifest[Number(pick) - 1].id;
  else id = pick;
}
const entry = manifest.find((e) => e && e.id === id);
if (!entry) {
  console.error(`✗ 找不到 id "${id}"`);
  process.exit(1);
}

// ② 选方式
let mode = getArg('--mode');
if (!mode) {
  const pick = await ask(`\n「${entry.title || id}」怎么处理？\n  [1] 仅下架（站点上消失，文件保留，以后可改回 deploy:true 恢复）\n  [2] 删除（登记移除；数据文件移入 .bank-trash/ 回收目录，可手动找回）\n选择 [1/2]：`);
  mode = pick === '2' ? 'delete' : 'unlist';
}
const confirm = await ask(`\n确认${mode === 'delete' ? '彻底删除' : mode === 'restore' ? '恢复上架' : '下架'}「${entry.title || id}」？[y/N] `);
if (!/^y(es)?$/i.test(confirm)) { console.log('已取消。'); process.exit(0); }

// ③ 执行（与提取器站点管理面板共用 publish-bank-core）
if (DRY_RUN) {
  console.log(`\n[dry-run] ${mode === 'delete' ? '将删除登记与数据文件' : '将标记 deploy:false'}；之后重新部署。`);
  rl.close();
  process.exit(0);
}
const result = removeBankFromRepo({ root: ROOT, id, mode });
console.log(`\n✓ ${mode === 'delete' ? `已删除登记；数据文件移入 ${result.trashedTo || '(无数据文件)'}（可手动找回）` : mode === 'restore' ? '已恢复上架（deploy 标记移除）' : '已标记 deploy:false（文件保留）'}`);

// ④ 选择部署目标并重新部署（所选端的 banks/index.json 清单随构建自动更新）
let target = String(getArg('--target') || '').toLowerCase(); // all | cf | gh | none
if (NO_DEPLOY) target = 'none';
if (!['all', 'cf', 'gh', 'none'].includes(target)) {
  const pick = await ask(`\n部署到哪里？[1] Cloudflare + GitHub（默认） [2] 仅 Cloudflare [3] 仅 GitHub [4] 暂不部署：`);
  target = pick === '2' ? 'cf' : pick === '3' ? 'gh' : pick === '4' ? 'none' : 'all';
}
rl.close();
if (target === 'none') {
  console.log('\n登记已修改但未部署。之后可跑：npm run deploy:cf（双端）/ deploy:cloudflare / deploy:github');
  process.exit(0);
}
console.log(`\n重新构建并部署（${target === 'all' ? 'Cloudflare + GitHub' : target === 'cf' ? '仅 Cloudflare' : '仅 GitHub'}）…\n`);
try {
  runDeploy(ROOT, target);
} catch (_e) {
  console.error(`\n✗ 部署失败（上面有日志）。登记已改好，修好后可手动重跑：npm run ${DEPLOY_SCRIPTS[target]}`);
  process.exit(1);
}
console.log('\n🎉 完成！站点清单与合并练习库已自动更新。');
if (target !== 'gh') console.log('   Cloudflare：https://question-bank-78u.pages.dev/');
if (target !== 'cf') console.log('   GitHub：   https://shicheng0810.github.io/question-bank/ （约 1 分钟后生效）');
