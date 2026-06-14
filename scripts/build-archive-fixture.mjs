#!/usr/bin/env node
// 把真实 Canvas MHTML 存档变成可入库的金样本 fixture：
//   node scripts/build-archive-fixture.mjs "<input.mhtml>" tests/fixtures/archives/<name>.mhtml
// 处理：选出最佳 HTML part → 剥 <script>（去掉 Canvas ENV 里的学生身份）→ 替换姓名 →
// 重封装为 base64 单 part MHTML（与 Chrome 导出同构，可直接喂 parseMHTML）。
// 末尾打印解析摘要（题数/题型/首题干），用于在 tests/canvas-extract.test.js 里写断言。
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('');
globalThis.DOMParser = dom.window.DOMParser;
globalThis.document = dom.window.document;
globalThis.NodeFilter = dom.window.NodeFilter;

const { parseMHTML, parseCanvasHTML } = await import('../src/lib/canvas-extract.js');

const [, , inputPath, outputPath] = process.argv;
if (!inputPath || !outputPath) {
  console.error('usage: build-archive-fixture.mjs <input.mhtml> <output.mhtml>');
  process.exit(1);
}

const raw = fs.readFileSync(inputPath).toString('latin1'); // 保字节载体，与提取器一致
const { html } = parseMHTML(raw);
if (!html) { console.error('no html part found'); process.exit(1); }

let clean = html
  .replace(/<script\b[\s\S]*?<\/script>/gi, '') // Canvas ENV/JS：含学生 id、姓名，全部剥掉
  .replace(/Shicheng\s+Liu/gi, 'Sample Student')
  .replace(/Shicheng/gi, 'Sample')
  .replace(/shichengliu\d*/gi, 'samplestudent');

const b64 = Buffer.from(clean, 'utf-8').toString('base64').replace(/(.{76})/g, '$1\r\n');
const boundary = '----MultipartBoundary--fixture-archive-0001----';
const out = [
  'From: <Saved by fixture builder>',
  'Subject: sanitized canvas archive fixture',
  'MIME-Version: 1.0',
  `Content-Type: multipart/related; type="text/html"; boundary="${boundary}"`,
  '',
  `--${boundary}`,
  'Content-Type: text/html; charset=utf-8',
  'Content-Transfer-Encoding: base64',
  'Content-Location: https://everettcc.instructure.com/courses/00000/quizzes/00000?headless=1',
  '',
  b64,
  `--${boundary}--`,
  '',
].join('\r\n');

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, out);

// 用 fixture 本身（而非原件）回放一遍，打印测试可断言的摘要
const replay = parseMHTML(fs.readFileSync(outputPath).toString('latin1'));
const parsed = parseCanvasHTML(replay.html);
const kinds = {};
for (const q of parsed) kinds[q.kind] = (kinds[q.kind] || 0) + 1;
const allChoicesAnswered = parsed
  .filter(q => q.kind === 'choice')
  .every(q => q.choices.some(c => c.isCorrect));
console.log(JSON.stringify({
  fixture: path.basename(outputPath),
  bytes: out.length,
  questions: parsed.length,
  kinds,
  allChoicesAnswered,
  firstStem: (parsed[0] && parsed[0].qtext || '').slice(0, 60),
  identityLeak: /Sample Student/.test(clean) ? 'replaced' : (/(Shicheng|shichengliu)/i.test(clean) ? 'LEAK!' : 'none-found'),
}, null, 2));
