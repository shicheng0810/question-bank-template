#!/usr/bin/env node
// 把 docs/ 站点产物镜像推送到公开仓库 shicheng0810/question-bank（GitHub Pages：
// https://shicheng0810.github.io/question-bank/）。2026-06-12 用户决定：站点全面进驻
// question-bank（旧版独立题库 HTML 被替代，仍可在 git 历史找回）；question-bank-template
// 改为跳转壳。完整源码只在本地。
// 由 npm run deploy:cf 在 Cloudflare 部署成功后自动调用；也可单独跑。
import { cpSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = path.join(ROOT, 'docs');
const MIRROR = path.join(ROOT, '.gh-mirror');
const REPO = 'https://github.com/shicheng0810/question-bank.git';
const run = (cmd, cwd = MIRROR) => execSync(cmd, { cwd, stdio: 'pipe' }).toString().trim();

if (!existsSync(DOCS)) {
  console.error('✗ docs/ 不存在，请先 npm run build:pages');
  process.exit(1);
}

try {
  if (!existsSync(MIRROR)) {
    console.log('· 首次使用：克隆镜像仓库…');
    execSync(`git clone --depth 1 ${REPO} .gh-mirror`, { cwd: ROOT, stdio: 'pipe' });
  } else {
    try { run('git pull --ff-only'); } catch (_e) { console.warn('! git pull 失败，继续用本地镜像副本'); }
  }

  // 完全同步：镜像 = docs/ 的精确副本（保留 .git 与 README.md），站点删掉的文件这里也删
  for (const name of readdirSync(MIRROR)) {
    if (name === '.git' || name === 'README.md') continue;
    rmSync(path.join(MIRROR, name), { recursive: true, force: true });
  }
  cpSync(DOCS, MIRROR, { recursive: true });
  run('git add -A');

  let changed = true;
  try { run('git diff --cached --quiet'); changed = false; } catch (_e) { /* 有变更 */ }
  if (!changed) {
    console.log('✓ GitHub 镜像无变化，跳过推送');
    process.exit(0);
  }
  run(`git -c user.name="Shicheng Liu" -c user.email="shichengliu1999@gmail.com" commit -m "publish site ${new Date().toISOString().slice(0, 16)}"`);
  run('git push');
  console.log('✓ 已推送 GitHub 镜像：https://shicheng0810.github.io/question-bank/ （Pages 构建约 1 分钟后生效）');
} catch (e) {
  console.error('✗ GitHub 镜像推送失败：' + (e && e.message ? e.message.split('\n')[0] : e));
  console.error('  Cloudflare 部署不受影响；修好后单独重跑：node scripts/deploy-gh-mirror.mjs');
  process.exit(1);
}
