// 部署前同步守卫（deploy:cf 第一步）——半自动版。
// 访客提议修正 → 站主 Telegram 批准 → bot 在部署仓库改 banks/<id>.json 并记进 PENDING_SYNC.md。
// 本脚本在部署前：
//   ① 找出"线上有、本地没有"的题库分歧；
//   ② 只对【PENDING_SYNC.md 里列出的库】（=已批准的访客编辑）自动拉回 + 提交，再继续部署；
//      没列出的分歧 = 你本地领先（改了还没部署）→ 不动它，让本次部署正常把本地推上去（不会被覆盖）。
// 安全闸：本地 public/banks 若有【未提交】改动，则不自动覆盖 → 中止并提示先 commit/stash。
// fail-CLOSED：拿不到线上状态时【中止】而非盲目放行（宁可拦也别覆盖已批准编辑），可 SKIP_SYNC_CHECK=1 强制。
import { writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { LOCAL, findDivergent, fetchPendingNote, noteListsBank } from './lib/prod-bank-sync.mjs';

if (process.env.SKIP_SYNC_CHECK) { console.log('（SKIP_SYNC_CHECK=1，跳过同步检查）'); process.exit(0); }

let divergent, note;
try {
  divergent = await findDivergent();
  note = await fetchPendingNote();
} catch (e) {
  console.error('\n⛔ 无法确认线上同步状态（' + (e && e.message ? e.message : e) + '）。');
  console.error('为避免覆盖线上【已批准】的编辑，已中止部署。确认无碍可强制：SKIP_SYNC_CHECK=1 npm run deploy:cf\n');
  process.exit(1);
}

// 只拉"已批准"(PENDING_SYNC 列出)的分歧库；本地领先的分歧不动。
const toPull = divergent.filter((d) => noteListsBank(note, d.file));
if (!toPull.length) process.exit(0);

console.log('\n🔄 线上有【已批准】的题库改动，本地还没有：');
for (const d of toPull) console.log('   • ' + d.file);
if (note) { console.log('\n—— 改了什么 ——'); console.log(note.trim()); console.log(''); }

let dirty = '';
try { dirty = execSync('git status --porcelain -- public/banks', { encoding: 'utf8' }).trim(); } catch (_e) {}
if (dirty) {
  console.error('⚠️  你本地 public/banks 有未提交改动，自动同步会覆盖它们。请先 git commit / stash 再部署：');
  console.error(dirty + '\n');
  process.exit(1);
}

const synced = [];
for (const d of toPull) {
  let outTxt = d.remote;
  try { outTxt = JSON.stringify(JSON.parse(d.remote), null, 2) + '\n'; } catch { /* 保持原样 */ }
  writeFileSync(path.join(LOCAL, d.file), outTxt);
  synced.push(path.join(LOCAL, d.file));
  console.log('↓ 已同步: ' + d.file);
}
try {
  const pathspec = synced.map((s) => JSON.stringify(s)).join(' ');
  execSync('git add ' + pathspec, { stdio: 'pipe' });
  // 带 pathspec 只提交这几个题库文件，不裹挟仓库里其它已暂存的改动。
  execSync(`git commit -m ${JSON.stringify(`sync: pull ${synced.length} visitor-approved bank edit(s) before deploy`)} -- ${pathspec}`, { stdio: 'pipe' });
  console.log(`✓ 已自动同步并提交 ${synced.length} 个题库，继续部署…\n`);
} catch (e) {
  const msg = (e && e.message ? String(e.message).split('\n')[0] : String(e));
  console.warn(`⚠️  已同步到本地，但自动 commit 失败（${msg}）。文件已是最新、部署照常；记得稍后手动 git commit。\n`);
}
process.exit(0);
