#!/usr/bin/env node
// 把一个 Canvas 存档（.mhtml / .html）直接转成「可直接导入」的题库 JSON。
// 复用提取器内核（src/lib/canvas-extract.js + testable-core.js）——和提取器 UI 同一套解析、
// 同一套校验闸，比丢给通用 AI 可靠得多（通用 AI 常因文件太大而漏题/复读）。
//
// 用法:
//   node scripts/extract-mhtml.mjs <input.mhtml> [output.json] [--id <bankId>] [--title <label>]
//   npm run extract:mhtml -- "<input.mhtml>"
//
// 输出：一个裸 JSON 数组（目录页「Import your own bank」可直接导入；也可作为站点题库源）。
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';

const argv = process.argv.slice(2);
const positionals = [];
const opts = {};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--id') opts.id = argv[++i];
  else if (a === '--title') opts.title = argv[++i];
  else positionals.push(a);
}
const input = positionals[0];
if (!input) {
  console.error('用法: node scripts/extract-mhtml.mjs <input.mhtml> [output.json] [--id <bankId>] [--title <label>]');
  process.exit(1);
}
if (!fs.existsSync(input)) {
  console.error('找不到输入文件: ' + input);
  process.exit(1);
}

// 提取器内核依赖浏览器 DOM 全局（DOMParser / document / NodeFilter …）——用 jsdom 注入。
const dom = new JSDOM('<!doctype html><html><body></body></html>');
for (const k of ['DOMParser', 'document', 'NodeFilter', 'Node', 'Element', 'HTMLElement']) {
  globalThis[k] = dom.window[k];
}
globalThis.window = dom.window;

const { parseMHTML, parseCanvasHTML } = await import('../src/lib/canvas-extract.js');
const { buildQuestionBank, validateQuestionBankRecords } = await import('../src/lib/testable-core.js');

const baseName = path.basename(input).replace(/\.(mhtml|mht|html?)$/i, '');
const title = opts.title || baseName;
const slug = (opts.id || baseName)
  .toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'bank';
const outPath = positionals[1] || path.join(path.dirname(input), baseName + '.json');

// .mhtml 走 MIME 解码（quoted-printable/base64 需要按字节读，故 latin1）；
// .html 是普通文档，按 UTF-8 读，否则中文/重音/智能引号会乱码。
const isMhtml = /\.(mhtml|mht)$/i.test(input);
const html = isMhtml
  ? parseMHTML(fs.readFileSync(input).toString('latin1')).html
  : fs.readFileSync(input, 'utf8');
if (!html || !html.trim()) {
  console.error('解码后得到空 HTML——文件可能不是 Canvas 存档，或编码异常。');
  process.exit(1);
}

const parsed = parseCanvasHTML(html);
const bank = buildQuestionBank(parsed, slug, title);
const { valid, rejected } = validateQuestionBankRecords(bank);

fs.writeFileSync(outPath, JSON.stringify(valid, null, 2) + '\n');

const kinds = {};
for (const q of parsed) kinds[q.kind] = (kinds[q.kind] || 0) + 1;
console.log('题块识别:    ' + parsed.length + '  ' + JSON.stringify(kinds));
console.log('导出有效题:  ' + valid.length + (rejected.length ? ('  (跳过 ' + rejected.length + ')') : '  (0 跳过)'));
if (rejected.length) {
  console.log('被跳过原因:');
  for (const r of rejected.slice(0, 10)) console.log('  - ' + r.reasons.join('；'));
}
console.log('题库 id:     ' + slug);
console.log('题库标题:    ' + title);
console.log('已写出:      ' + outPath);
console.log('\n下一步：目录页「Import your own bank」拖入该 .json 即可练习；或作为站点题库源发布。');
