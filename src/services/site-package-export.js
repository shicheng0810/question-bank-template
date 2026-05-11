import JSZip from 'jszip';
import siteHtml from '../site/shell.html?raw';
import siteAppSource from '../site/site-app.js?raw';
import siteLogicSource from '../site/site-logic.js?raw';
import siteCss from '../styles/site.css?raw';
import legacyTemplate from '../templates/question-bank-template.html?raw';
import qbpackSource from '../lib/qbpack.js?raw';
import { encryptQuestionBankPayload } from '../lib/qbpack.js';
import { slugifyBankId } from '../lib/site-package.js';

function safeJSONStringForScript(value) {
  return JSON.stringify(value)
    .replace(/<\/script>/gi, '<\\/script>')
    .replace(/<\//g, '<\\/')
    .replaceAll(String.fromCharCode(0x2028), '\\u2028')
    .replaceAll(String.fromCharCode(0x2029), '\\u2029');
}

function normalizeManifestEntry(entry) {
  return entry && typeof entry === 'object' ? { ...entry } : null;
}

function buildEntry(questions, publishMeta, bankPath) {
  return {
    id: publishMeta.id,
    title: publishMeta.title || publishMeta.id,
    mode: publishMeta.mode === 'protected' ? 'protected' : 'public',
    description: publishMeta.description || '',
    tags: Array.isArray(publishMeta.tags) ? publishMeta.tags : [],
    question_count: Array.isArray(questions) ? questions.length : 0,
    has_images: (questions || []).some((question) => !!question && !!question.image),
    ...(publishMeta.cover ? { cover: publishMeta.cover } : {}),
    ...(publishMeta.mode === 'protected'
      ? { payload: bankPath, password_hint: publishMeta.passwordHint || '' }
      : { json: bankPath }),
  };
}

const LEGACY_MARKER = '__QUESTION_BANK_JSON__';

function assertTemplateMarker(template, marker) {
  if (!template.includes(marker)) {
    throw new Error(`Unable to locate template marker: ${marker}`);
  }
}

function buildSiteIndexHtml() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Question Bank Template</title>
  <link rel="stylesheet" href="assets/site.css">
</head>
<body>
  <div id="app"></div>
  <script type="module" src="assets/main.js"></script>
</body>
</html>
`;
}

function buildSiteMainModule() {
  return `import { initQuestionBankSite } from './site-app.js';

const shellHtml = ${JSON.stringify(siteHtml)};
const app = document.getElementById('app');

if (!app) {
  throw new Error('Missing #app mount point');
}

app.innerHTML = shellHtml;

try {
  await initQuestionBankSite();
} catch (error) {
  console.error(error);
  app.innerHTML = \`
    <div style="max-width:720px;margin:48px auto;padding:24px;border:1px solid rgba(31,41,51,.12);border-radius:20px;background:#fffaf3">
      <h1 style="margin:0 0 12px;font:700 28px/1.1 'Segoe UI',sans-serif;color:#143a52">题库站初始化失败</h1>
      <p style="margin:0;color:#5b6471;line-height:1.7">\${String(error && error.message ? error.message : error)}</p>
    </div>
  \`;
}
`;
}

export async function buildLegacyQuestionBankHtml(questions, options = {}) {
  assertTemplateMarker(legacyTemplate, LEGACY_MARKER);
  const payload = options.mode === 'protected'
    ? { mode: 'protected', envelope: JSON.parse(await encryptQuestionBankPayload(questions, options.password || '')) }
    : (Array.isArray(questions) ? questions : []);
  return legacyTemplate.replace(LEGACY_MARKER, safeJSONStringForScript(payload));
}

export async function buildSitePublishZip({ questions = [], publishMeta, existingManifest = [], includeLegacyHtml = false } = {}) {
  const meta = { ...(publishMeta || {}) };
  meta.id = slugifyBankId(meta.id || meta.bankId || 'question-bank');
  meta.mode = meta.mode === 'protected' ? 'protected' : 'public';

  const zip = new JSZip();
  const bankExt = meta.mode === 'protected' ? 'qbpack' : 'json';
  const bankPath = `banks/${meta.id}.${bankExt}`;
  const bankPayload = meta.mode === 'protected'
    ? await encryptQuestionBankPayload(questions, meta.password || '')
    : JSON.stringify(questions, null, 2);
  const entry = buildEntry(questions, meta, bankPath);
  const manifest = (Array.isArray(existingManifest) ? existingManifest : [])
    .map(normalizeManifestEntry)
    .filter(Boolean)
    .filter((item) => String(item.id || '') !== entry.id);
  manifest.push(entry);

  zip.file('index.html', buildSiteIndexHtml());
  zip.file('assets/main.js', buildSiteMainModule());
  zip.file('assets/site-app.js', siteAppSource);
  zip.file('assets/site-logic.js', siteLogicSource);
  zip.file('assets/qbpack.js', qbpackSource);
  zip.file('assets/site.css', siteCss);
  zip.file(bankPath, bankPayload);
  zip.file('banks/index.json', JSON.stringify(manifest, null, 2));
  if (includeLegacyHtml) {
    zip.file(`legacy/${meta.id}.html`, await buildLegacyQuestionBankHtml(questions, { mode: meta.mode, password: meta.password || '' }));
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  return {
    blob,
    filename: `${meta.id}_site_publish.zip`,
    entry,
    manifest,
  };
}
