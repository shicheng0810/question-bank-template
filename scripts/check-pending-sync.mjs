// 部署前同步守卫（deploy:cf 第一步）——半自动版。
// 访客在站内「提议修正」→ 站主 Telegram 一键批准 → bot 在部署仓库 question-bank 开 PR 改 banks/<id>.json
// 并记进 PENDING_SYNC.md。这些改动比本地源新。本脚本在部署前：
//   ① 检测"线上有、本地没有"的题库改动；无 → 直接放行。
//   ② 有 → 打印改了什么 → 自动拉回本地 public/banks → 自动 git commit（仅题库文件）→ 继续部署。
// 安全闸：本地 public/banks 若有【未提交】改动，则不自动覆盖（怕吃掉你正在改的东西）→ 中止并提示先 commit/stash。
// 想完全跳过：SKIP_SYNC_CHECK=1 npm run deploy:cf
// 网络异常 → fail-open（只提示、不拦截），避免离线卡住部署。
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const OWNER = 'shicheng0810';
const REPO = 'question-bank';
const RAW = `https://raw.githubusercontent.com/${OWNER}/${REPO}/main`;
const LOCAL = 'public/banks';

if (process.env.SKIP_SYNC_CHECK) { console.log('（SKIP_SYNC_CHECK=1，跳过同步检查）'); process.exit(0); }

const normJson = (t) => { try { return JSON.stringify(JSON.parse(t)); } catch { return String(t); } };
async function getText(url) {
  const r = await fetch(url);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return r.text();
}

try {
  const localFiles = existsSync(LOCAL)
    ? readdirSync(LOCAL).filter((f) => f.endsWith('.json') && f !== 'index.json')
    : [];
  const diffs = []; // [{ file, remote }]
  for (const f of localFiles) {
    const remote = await getText(`${RAW}/banks/${f}`);
    if (remote == null) continue; // 线上没有这个库（本地新库）
    if (normJson(remote) !== normJson(readFileSync(path.join(LOCAL, f), 'utf8'))) diffs.push({ file: f, remote });
  }
  if (!diffs.length) process.exit(0); // 一致 → 放行

  const note = await getText(`${RAW}/PENDING_SYNC.md`);
  console.log('\n🔄 线上有【已批准】的题库改动，本地还没有：');
  for (const d of diffs) console.log('   • ' + d.file);
  if (note) { console.log('\n—— 改了什么 ——'); console.log(note.trim()); console.log(''); }

  // 安全闸：本地 public/banks 有未提交改动时，不自动覆盖
  let dirty = '';
  try { dirty = execSync('git status --porcelain -- public/banks', { encoding: 'utf8' }).trim(); } catch (_e) {}
  if (dirty) {
    console.error('⚠️  你本地 public/banks 有未提交改动，自动同步会覆盖它们。请先 git commit / stash 再部署：');
    console.error(dirty + '\n');
    process.exit(1);
  }

  // 自动拉回 + 提交（仅题库文件）
  const synced = [];
  for (const d of diffs) {
    let out = d.remote;
    try { out = JSON.stringify(JSON.parse(d.remote), null, 2) + '\n'; } catch { /* 保持原样 */ }
    writeFileSync(path.join(LOCAL, d.file), out);
    synced.push(path.join(LOCAL, d.file));
    console.log('↓ 已同步: ' + d.file);
  }
  try {
    execSync('git add ' + synced.map((s) => JSON.stringify(s)).join(' '), { stdio: 'pipe' });
    execSync(`git commit -m ${JSON.stringify(`sync: pull ${synced.length} visitor-approved bank edit(s) before deploy`)}`, { stdio: 'pipe' });
    console.log(`✓ 已自动同步并提交 ${synced.length} 个题库，继续部署…\n`);
  } catch (e) {
    const msg = (e && e.message ? String(e.message).split('\n')[0] : String(e));
    console.warn(`⚠️  已同步到本地，但自动 commit 失败（${msg}）。文件已是最新、部署照常；记得稍后手动 git commit。\n`);
  }
  process.exit(0); // 继续部署链
} catch (e) {
  console.warn('⚠️  同步检查跳过（无法访问线上：' + (e && e.message ? e.message : e) + '），继续部署。');
  process.exit(0);
}
