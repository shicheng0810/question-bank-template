// 把线上(部署仓库)已批准的题库改动手动拉回本地 public/banks（不提交，你自己 commit）。
// 与守卫一致：只拉 PENDING_SYNC.md 列出的（已批准的）库，避免覆盖你本地领先、还没部署的改动。
// 用法：npm run sync:from-prod
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { LOCAL, findDivergent, fetchPendingNote, noteListsBank } from './lib/prod-bank-sync.mjs';

const divergent = await findDivergent();
const note = await fetchPendingNote();
const toPull = divergent.filter((d) => noteListsBank(note, d.file));

let n = 0;
for (const d of toPull) {
  let outTxt = d.remote;
  try { outTxt = JSON.stringify(JSON.parse(d.remote), null, 2) + '\n'; } catch { /* 保持原样 */ }
  writeFileSync(path.join(LOCAL, d.file), outTxt);
  console.log('↓ 已同步: ' + d.file);
  n++;
}
if (n) {
  console.log(`\n✓ 同步了 ${n} 个题库到 public/banks。请 git add/commit 后再 npm run deploy:cf。`);
} else if (divergent.length) {
  console.log('本地与线上有差异，但都不是 PENDING_SYNC 里的已批准编辑（多半是你本地领先、还没部署）——未改动本地。');
} else {
  console.log('本地已与线上一致，无需同步。');
}
