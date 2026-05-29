// Build the deployed GitHub Pages site = the single-file, "all questions on one page"
// player (the same proven template the Extractor exports), one self-contained HTML per bank.
//
// Why not the multi-file SPA: the answering experience requested is the single-file layout
// where every question is visible at once. Each generated page embeds its bank inline, so it
// needs no fetch, no manifest, and works under any sub-path (GitHub project pages) or offline.
//
// index.html = the first public bank in banks/index.json (the primary bank). Every bank is
// also emitted as <id>.html so it is reachable by direct URL.
//
// The multi-file SPA (src/site) and the Extractor stay in the repo for local use; this only
// controls what gets published to Pages. Run with: npm run build:pages

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
// Output to docs/ so GitHub Pages can serve it via "Deploy from a branch → /docs"
// (no Actions workflow needed). Override with PAGES_OUT if you wire up CI instead.
const OUT = path.resolve(ROOT, process.env.PAGES_OUT || 'docs');
const MARKER = '__QUESTION_BANK_JSON__';

const template = readFileSync(path.join(ROOT, 'src/templates/question-bank-template.html'), 'utf8');
if (!template.includes(MARKER)) {
  throw new Error('题库模板缺少 __QUESTION_BANK_JSON__ marker');
}

// Mirror of testable-core safeJSONStringForScript: make JSON safe to inline in a <script>.
const LINE_SEP = new RegExp(String.fromCharCode(0x2028), 'g');
const PARA_SEP = new RegExp(String.fromCharCode(0x2029), 'g');
function escapeForScript(jsonStr) {
  return String(jsonStr)
    .replace(/<\/script>/gi, '<\\/script>')
    .replace(/<\//g, '<\\/')
    .replace(LINE_SEP, '\\u2028')
    .replace(PARA_SEP, '\\u2029');
}

function playerHtml(payload) {
  return template.replace(MARKER, escapeForScript(JSON.stringify(payload)));
}

const manifest = JSON.parse(readFileSync(path.join(ROOT, 'public/banks/index.json'), 'utf8'));

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const generated = [];
for (const entry of Array.isArray(manifest) ? manifest : []) {
  const id = String(entry && entry.id || '').trim();
  if (!id) continue;
  // Opt-out: real banks publish by default; dev/test fixtures set "deploy": false.
  if (entry.deploy === false) {
    console.log(`· skip ${id} (deploy: false)`);
    continue;
  }
  const isProtected = entry.mode === 'protected';
  const rel = isProtected ? entry.payload : entry.json;
  if (!rel) continue;
  const srcPath = path.join(ROOT, 'public', rel);
  if (!existsSync(srcPath)) {
    console.warn(`! skip ${id}: missing ${rel}`);
    continue;
  }
  const raw = JSON.parse(readFileSync(srcPath, 'utf8'));
  // public bank → the questions array; protected bank → { mode, envelope } the template can unlock.
  const payload = isProtected ? { mode: 'protected', envelope: raw } : raw;
  const file = `${id}.html`;
  writeFileSync(path.join(OUT, file), playerHtml(payload));
  const count = isProtected ? (entry.question_count || '?') : (Array.isArray(raw) ? raw.length : '?');
  generated.push({ id, file, title: entry.title || id, count, protected: isProtected });
  console.log(`✓ ${file}  (${count} 题${isProtected ? ', 🔒 protected' : ''})`);
}

if (!generated.length) {
  throw new Error('banks/index.json 里没有可发布的题库');
}

// index.html = the primary bank's all-at-once player (first entry in the manifest).
const primary = generated[0];
writeFileSync(path.join(OUT, 'index.html'), readFileSync(path.join(OUT, primary.file), 'utf8'));
console.log(`\nindex.html → ${primary.file} (${primary.title})`);
console.log(`Pages site: ${generated.length} bank page(s) in ${path.relative(ROOT, OUT) || '.'}/`);
