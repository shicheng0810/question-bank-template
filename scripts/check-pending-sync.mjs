// 部署前守卫（deploy:cf 第一步）：检测"线上 GitHub 已批准、但本地 public/banks 还没有"的题库改动。
// 来源：访客在站内「提议修正」→ 站主 Telegram 一键批准 → bot 在部署仓库 question-bank 开 PR 改 banks/<id>.json
//       并把"改了什么"记进 PENDING_SYNC.md。若不先同步回本地就 deploy:cf，会用本地旧内容覆盖掉这些改动。
// 行为：有分歧 → 打印"改了什么" + 拦截部署（exit 1），提示先 `npm run sync:from-prod`。
//       想强行部署：SKIP_SYNC_CHECK=1 npm run deploy:cf
// 网络异常 → fail-open（只提示、不拦截），避免离线时卡住部署。
import { readFileSync, readdirSync, existsSync } from 'node:fs';
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
  const diffs = [];
  for (const f of localFiles) {
    const remote = await getText(`${RAW}/banks/${f}`);
    if (remote == null) continue; // 线上没有这个库（本地新库）→ 部署即可，不算分歧
    const local = readFileSync(path.join(LOCAL, f), 'utf8');
    if (normJson(remote) !== normJson(local)) diffs.push(f);
  }
  const note = await getText(`${RAW}/PENDING_SYNC.md`);

  if (!diffs.length) {
    if (note) console.log('ℹ️  线上有 PENDING_SYNC.md，但题库与本地一致（已同步）。');
    process.exit(0);
  }

  console.error('\n⚠️  检测到线上(GitHub)有【已批准】的题库改动，本地 public/banks 还没有：');
  for (const f of diffs) console.error('   • ' + f);
  if (note) { console.error('\n—— PENDING_SYNC.md（改了什么）——'); console.error(note.trim()); }
  console.error('\n现在 deploy:cf 会用本地旧内容【覆盖】这些已批准的改动。');
  console.error('👉 先同步回本地：   npm run sync:from-prod   （然后 git add/commit，再 deploy:cf）');
  console.error('（确实要忽略、强行部署：  SKIP_SYNC_CHECK=1 npm run deploy:cf ）\n');
  process.exit(1);
} catch (e) {
  console.warn('⚠️  同步检查跳过（无法访问线上：' + (e && e.message ? e.message : e) + '），继续部署。');
  process.exit(0);
}
