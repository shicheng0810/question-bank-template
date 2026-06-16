// 共享：本地 public/banks 与部署仓库 question-bank 的题库同步逻辑。
// check-pending-sync.mjs（部署守卫，自动）与 sync-from-prod.mjs（手动）共用，避免两份逻辑漂移。
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';

export const OWNER = 'shicheng0810';
export const REPO = 'question-bank';
export const RAW = `https://raw.githubusercontent.com/${OWNER}/${REPO}/main`;
export const LOCAL = 'public/banks';

export const normJson = (t) => { try { return JSON.stringify(JSON.parse(t)); } catch { return String(t); } };

// 带重试的抓取；404 → null（线上没这个文件）；其它非 2xx 或网络错 → 重试后抛错。
export async function fetchText(url, { tries = 3 } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`${url} -> ${r.status}`);
      return await r.text();
    } catch (e) {
      lastErr = e;
      if (i < tries - 1) await new Promise((s) => setTimeout(s, 400 * (i + 1)));
    }
  }
  throw lastErr;
}

export function localBankFiles() {
  return existsSync(LOCAL) ? readdirSync(LOCAL).filter((f) => f.endsWith('.json') && f !== 'index.json') : [];
}

// 与线上不一致的本地题库：[{ file, remote }]（线上没有的本地新库忽略）。
export async function findDivergent() {
  const out = [];
  for (const f of localBankFiles()) {
    const remote = await fetchText(`${RAW}/banks/${f}`);
    if (remote == null) continue;
    if (normJson(remote) !== normJson(readFileSync(path.join(LOCAL, f), 'utf8'))) out.push({ file: f, remote });
  }
  return out;
}

export function fetchPendingNote() { return fetchText(`${RAW}/PENDING_SYNC.md`); }

// PENDING_SYNC.md 里是否列了这个库（库名被反引号包着）→ 该分歧来自"已批准的访客编辑"。
// 没列出的分歧 = 本地领先（你改了还没部署）→ 不该自动拉、否则会覆盖你的新内容。
export function noteListsBank(note, file) {
  if (!note) return false;
  const bank = file.replace(/\.json$/i, '');
  return note.indexOf('`' + bank + '`') >= 0;
}
