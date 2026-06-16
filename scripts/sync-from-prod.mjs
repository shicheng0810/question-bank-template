// 把线上(部署仓库 question-bank)已批准的题库改动拉回本地 public/banks。
// 配合 check-pending-sync.mjs：批准的修正先落在线上，跑这个同步回本地源，再 git commit + deploy:cf。
// 用法：npm run sync:from-prod
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const OWNER = 'shicheng0810';
const REPO = 'question-bank';
const RAW = `https://raw.githubusercontent.com/${OWNER}/${REPO}/main`;
const LOCAL = 'public/banks';

const normJson = (t) => { try { return JSON.stringify(JSON.parse(t)); } catch { return String(t); } };
async function getText(url) {
  const r = await fetch(url);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return r.text();
}

const localFiles = existsSync(LOCAL)
  ? readdirSync(LOCAL).filter((f) => f.endsWith('.json') && f !== 'index.json')
  : [];
let n = 0;
for (const f of localFiles) {
  const remote = await getText(`${RAW}/banks/${f}`);
  if (remote == null) continue;
  const lp = path.join(LOCAL, f);
  if (normJson(remote) !== normJson(readFileSync(lp, 'utf8'))) {
    let out = remote;
    try { out = JSON.stringify(JSON.parse(remote), null, 2) + '\n'; } catch { /* 保持原样 */ }
    writeFileSync(lp, out);
    console.log('↓ 已同步: ' + f);
    n++;
  }
}
console.log(n
  ? `\n✓ 同步了 ${n} 个题库到 public/banks。请 git add/commit 后再 npm run deploy:cf。`
  : '本地已与线上一致，无需同步。');
