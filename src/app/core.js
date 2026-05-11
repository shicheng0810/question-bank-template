import { initAiMCQFeature } from './features/ai-mcq.js';
import { slugifyBankId } from '../lib/site-package.js';
import {
  buildPublishMeta as buildPublishMetaHelper,
  canGenerateQuestionBank as canGenerateQuestionBankHelper,
  getPublishButtonState as getPublishButtonStateHelper,
  guessPublishDefaults as guessPublishDefaultsHelper,
  parseManifestText as parseManifestTextHelper,
} from '../lib/publish-settings.js';
import { buildLegacyQuestionBankHtml, buildSitePublishZip } from '../services/site-package-export.js';
import { shouldUseSelectedAnswersAsCorrectFallback } from '../lib/canvas-answer-fallback.js';
import {
  applyAiAnswerSuggestion,
  buildDeepSeekAnswerFillPayload,
  callDeepSeekAnswerFill,
  parseDeepSeekAnswerFillResponse,
  questionCanUseAiAnswer,
} from './features/ai-answer-fill-logic.js';

export let appContext = null;

export function init() {
const $  = s => document.querySelector(s);
const fileInput = $('#file');
const qbankFileInput = $('#qbankFile');
const extractQBankBtn = $('#extractQBankBtn');
const parseAllBtn = $('#parseAllBtn');
const parseActiveBtn = $('#parseActiveBtn');
const statusEl = $('#status');
const qbankStatusEl = $('#qbankStatus');
const fileTableBody = $('#fileTable tbody');

const list = $('#list');
const out = $('#out');
out && out.addEventListener('input', () => { try{ updateExportButtons(); }catch(e){} try{ updateDownloadOutBtn(); }catch(e){} });

let outDownloadName = "question_bank.json";
function updateDownloadOutBtn(){
  if(!downloadOutJsonBtn) return;
  const raw = (out && out.value ? String(out.value) : "").trim();
  if(!raw){ downloadOutJsonBtn.disabled = true; return; }
  try{ JSON.parse(raw); downloadOutJsonBtn.disabled = false; }
  catch(e){ downloadOutJsonBtn.disabled = true; }
}
function downloadTextFile(filename, text, mime){
  const blob = new Blob([text], { type: mime || "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "output.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1200);
}
function downloadOutAsJSON(){
  const raw = (out && out.value ? String(out.value) : "").trim();
  if(!raw){ alert("输出框为空，无法下载。"); return; }
  try{ JSON.parse(raw); }
  catch(e){ alert("输出框内容不是有效 JSON，无法下载。\n\n请先点击“导出…JSON”或修正输出内容。"); return; }
  downloadTextFile(outDownloadName || "question_bank.json", raw, "application/json;charset=utf-8");
}
const exportActiveBtn = $('#exportActiveBtn');
const exportAllBtn = $('#exportAllBtn');
const exportUniqueBtn = $('#exportUniqueBtn');
const genQBankBtn = $('#genQBankBtn');
const genLegacyQBankBtn = $('#genLegacyQBankBtn');
const downloadOutJsonBtn = $('#downloadOutJsonBtn');
const publishBankIdEl = $('#publishBankId');
const publishTitleEl = $('#publishTitle');
const publishModeEl = $('#publishMode');
const publishDescriptionEl = $('#publishDescription');
const publishTagsEl = $('#publishTags');
const publishCoverEl = $('#publishCover');
const publishPasswordEl = $('#publishPassword');
const publishPasswordHintEl = $('#publishPasswordHint');
const rememberPublishPasswordEl = $('#rememberPublishPassword');
const includeLegacyHtmlEl = $('#includeLegacyHtml');
const manifestFileEl = $('#manifestFile');
// AI MCQ controls
const apiKeyEl = $('#apiKey');
const rememberKeyEl = $('#rememberKey');
const apiBaseUrlEl = $('#apiBaseUrl');
const apiModelEl = $('#apiModel');
const nDistractorsEl = $('#nDistractors');
const temperatureEl = $('#temperature');
const replaceFillEl = $('#replaceFill');
const keepFillCopyEl = $('#keepFillCopy');
const runAiMCQEl = $('#runAiMCQ');
const dryRunAiMCQEl = $('#dryRunAiMCQ');
const aiStatusEl = $('#aiStatus');
const aiAnswerCurrentBtn = $('#aiAnswerCurrentBtn');
const aiAnswerMissingBtn = $('#aiAnswerMissingBtn');
const aiAnswerStatusEl = $('#aiAnswerStatus');
const ocrAiApiKeyEl = $('#ocrAiApiKey');
const ocrAiBaseUrlEl = $('#ocrAiBaseUrl');
const ocrAiModelEl = $('#ocrAiModel');
const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com/chat/completions';
const DEFAULT_DEEPSEEK_MODEL = 'deepseek-v4-flash';

initAiMCQFeature({
  apiKeyEl,
  rememberKeyEl,
  apiBaseUrlEl,
  apiModelEl,
  nDistractorsEl,
  temperatureEl,
  replaceFillEl,
  keepFillCopyEl,
  runAiMCQEl,
  dryRunAiMCQEl,
  aiStatusEl,
  out,
  getExportArrayOrNull,
  updateExportButtons,
});

const btnSelectAll = $('#selectAll');
const btnClearAll = $('#clearAll');
const activeNameEl = $('#activeName');
const editModeToggle = $('#editModeToggle');
let editMode = false;
if (editModeToggle) {
  editModeToggle.addEventListener('change', () => {
    editMode = !!editModeToggle.checked;
    renderFileTable();
    const active = datasets[activeIdx];
    if (active && active.parsedReady) renderQuestions(active);
  });
}
const PUBLISH_SETTINGS_KEY = 'question_bank_publish_settings_v2';
const PUBLISH_PASSWORD_KEY = 'question_bank_publish_password_v1';

[ocrAiApiKeyEl, ocrAiBaseUrlEl, ocrAiModelEl].forEach((el) => {
  if (!el) return;
  el.addEventListener('input', () => updateAiAnswerButtons());
  el.addEventListener('change', () => updateAiAnswerButtons());
});

if (aiAnswerCurrentBtn) {
  aiAnswerCurrentBtn.addEventListener('click', () => {
    void runAiAnswerForCurrentMissingQuestion();
  });
}

if (aiAnswerMissingBtn) {
  aiAnswerMissingBtn.addEventListener('click', () => {
    void runAiAnswerForActiveDataset();
  });
}

initPublishSettings();

function initPublishSettings(){
  try{
    const saved = JSON.parse(localStorage.getItem(PUBLISH_SETTINGS_KEY) || '{}');
    if (publishBankIdEl && saved.bankId) publishBankIdEl.value = String(saved.bankId);
    if (publishTitleEl && saved.title) publishTitleEl.value = String(saved.title);
    if (publishModeEl && (saved.mode === 'protected' || saved.mode === 'public')) publishModeEl.value = saved.mode;
    if (publishDescriptionEl && saved.description) publishDescriptionEl.value = String(saved.description);
    if (publishTagsEl && saved.tags) publishTagsEl.value = String(saved.tags);
    if (publishCoverEl && saved.cover) publishCoverEl.value = String(saved.cover);
    if (publishPasswordHintEl && saved.passwordHint) publishPasswordHintEl.value = String(saved.passwordHint);
    if (includeLegacyHtmlEl) includeLegacyHtmlEl.checked = !!saved.includeLegacyHtml;
  }catch(_e){}

  try{
    const savedPassword = localStorage.getItem(PUBLISH_PASSWORD_KEY) || '';
    if (publishPasswordEl && savedPassword) publishPasswordEl.value = savedPassword;
    if (rememberPublishPasswordEl) rememberPublishPasswordEl.checked = !!savedPassword;
  }catch(_e){}

  [
    publishBankIdEl,
    publishTitleEl,
    publishModeEl,
    publishDescriptionEl,
    publishTagsEl,
    publishCoverEl,
    publishPasswordHintEl,
    includeLegacyHtmlEl,
  ].forEach((el) => {
    if (!el) return;
    el.addEventListener('input', () => {
      savePublishSettings();
      syncPublishModeUI();
      updateExportButtons();
    });
    el.addEventListener('change', () => {
      savePublishSettings();
      syncPublishModeUI();
      updateExportButtons();
    });
  });

  if (publishPasswordEl){
    publishPasswordEl.addEventListener('input', () => {
      if (rememberPublishPasswordEl && rememberPublishPasswordEl.checked){
        localStorage.setItem(PUBLISH_PASSWORD_KEY, publishPasswordEl.value || '');
      }
      updateExportButtons();
    });
  }

  if (rememberPublishPasswordEl){
    rememberPublishPasswordEl.addEventListener('change', () => {
      if (!rememberPublishPasswordEl.checked){
        localStorage.removeItem(PUBLISH_PASSWORD_KEY);
      }else if (publishPasswordEl && publishPasswordEl.value){
        localStorage.setItem(PUBLISH_PASSWORD_KEY, publishPasswordEl.value || '');
      }
    });
  }

  syncPublishModeUI();
}

function syncPublishModeUI(){
  const protectedMode = !!(publishModeEl && publishModeEl.value === 'protected');
  if (publishPasswordEl) publishPasswordEl.disabled = !protectedMode;
  if (publishPasswordHintEl) publishPasswordHintEl.disabled = !protectedMode;
}

function savePublishSettings(){
  try{
    localStorage.setItem(PUBLISH_SETTINGS_KEY, JSON.stringify({
      bankId: publishBankIdEl && publishBankIdEl.value ? publishBankIdEl.value.trim() : '',
      title: publishTitleEl && publishTitleEl.value ? publishTitleEl.value.trim() : '',
      mode: publishModeEl && publishModeEl.value ? publishModeEl.value : 'public',
      description: publishDescriptionEl && publishDescriptionEl.value ? publishDescriptionEl.value.trim() : '',
      tags: publishTagsEl && publishTagsEl.value ? publishTagsEl.value.trim() : '',
      cover: publishCoverEl && publishCoverEl.value ? publishCoverEl.value.trim() : '',
      passwordHint: publishPasswordHintEl && publishPasswordHintEl.value ? publishPasswordHintEl.value.trim() : '',
      includeLegacyHtml: !!(includeLegacyHtmlEl && includeLegacyHtmlEl.checked),
    }));
  }catch(_e){}
}

// datasets: [{origin:'mhtml'|'qbank', file, name, prefix, sourcePrefix, parsed:[], parsedReady:boolean, parsing:boolean, err?:string}]
let datasets = [];
let activeIdx = -1;

function datasetKey(d){
  return `${(d && d.origin) || 'mhtml'}::${(d && d.name) || ''}`;
}

function upsertDatasets(entries, opts = {}){
  const items = Array.isArray(entries) ? entries.filter(Boolean) : [];
  if (!items.length) return;

  const currentKey = activeIdx >= 0 && datasets[activeIdx] ? datasetKey(datasets[activeIdx]) : '';
  const touchedKeys = [];
  const indexMap = new Map(datasets.map((d, i) => [datasetKey(d), i]));

  items.forEach(item => {
    const key = datasetKey(item);
    touchedKeys.push(key);
    if (indexMap.has(key)) {
      datasets[indexMap.get(key)] = item;
    } else {
      datasets.push(item);
      indexMap.set(key, datasets.length - 1);
    }
  });

  const preferredKey = opts.keepActive ? currentKey : (touchedKeys[0] || currentKey);
  const nextIdx = preferredKey ? datasets.findIndex(d => datasetKey(d) === preferredKey) : -1;
  activeIdx = nextIdx >= 0 ? nextIdx : (datasets.length ? 0 : -1);
}

function makeMHTMLDataset(file){
  const guess = guessMetaFromFilename(file.name);
  return {
    origin: 'mhtml',
    file,
    name: file.name,
    prefix: guess.prefix,
    sourcePrefix: guess.sourcePrefix,
    parsed: [],
    parsedReady: false,
    parsing: false,
    err: ''
  };
}

function mostCommonNonEmpty(arr){
  const freq = new Map();
  (arr || []).forEach(v => {
    const key = String(v || '').trim();
    if (!key) return;
    freq.set(key, (freq.get(key) || 0) + 1);
  });
  let best = '';
  let bestCount = 0;
  freq.forEach((count, key) => {
    if (count > bestCount){
      best = key;
      bestCount = count;
    }
  });
  return best;
}

function extractIdPrefix(id){
  const s = String(id || '').trim();
  const m = s.match(/^(.+?)-(.+)$/);
  return m ? m[1].trim() : '';
}

function extractIdSuffix(id, prefix){
  const s = String(id || '').trim();
  if (!s) return '';
  if (prefix && s.startsWith(prefix + '-')) return s.slice(prefix.length + 1).trim();
  const m = s.match(/^.+?-(.+)$/);
  return m ? m[1].trim() : s;
}

function extractSourcePrefix(src){
  const s = String(src || '').trim();
  const m = s.match(/^(.*?)\s*[–-]\s*Q\s*.+$/i);
  return m ? m[1].trim() : '';
}

function extractSourceNum(src){
  const s = String(src || '').trim();
  const m = s.match(/[–-]\s*Q\s*(.+)$/i);
  return m ? m[1].trim() : '';
}

function normalizeImportedImageList(item){
  const raw = item && item.image;
  if (Array.isArray(raw)) return raw.map(v => String(v || '').trim()).filter(Boolean);
  if (raw) return [String(raw).trim()].filter(Boolean);
  return [];
}

function guessQBankMeta(arr, fallbackName){
  const guess = guessMetaFromFilename(fallbackName || '');
  const prefix = mostCommonNonEmpty((arr || []).map(x => extractIdPrefix(x && x.id))) || guess.prefix;
  const sourcePrefix = mostCommonNonEmpty((arr || []).map(x => extractSourcePrefix(x && x.source))) || guess.sourcePrefix;
  return { prefix, sourcePrefix };
}

function convertQuestionBankItemToParsed(item, idx, meta){
  const images = normalizeImportedImageList(item);
  const prefix = meta && meta.prefix ? meta.prefix : '';
  const idSuffix = extractIdSuffix(item && item.id, prefix) || String(idx + 1);
  const sourceNum = extractSourceNum(item && item.source) || idSuffix;
  const displayNum = sourceNum || idSuffix || String(idx + 1);
  const base = {
    num: displayNum,
    idSuffix,
    sourceNum,
    qtext: String((item && (item.question || item.qtext)) || '').trim(),
    qhtml: String((item && item.question_html) || '').trim(),
    images,
    uploadedImages: [],
    expectedImageCount: images.length,
    missingImageSources: [],
    importedId: String((item && item.id) || '').trim(),
    importedSource: String((item && item.source) || '').trim(),
    preserveOriginalMeta: true
  };

  if ((item && item.type === 'fill') || Array.isArray(item && item.blanks)){
    const blanks = Array.isArray(item && item.blanks) && item.blanks.length
      ? item.blanks.map(ans => Array.isArray(ans)
          ? ans.map(v => String(v || '').trim()).filter(Boolean)
          : [String(ans || '').trim()].filter(Boolean))
      : [[]];
    return { kind: 'fill', blanks, ...base };
  }

  const answers = Array.isArray(item && item.answers)
    ? item.answers.map(v => Number(v)).filter(v => Number.isInteger(v))
    : [];
  const singleAnswer = Number.isInteger(item && item.answer) ? Number(item.answer) : -1;
  const correctSet = new Set(answers.length ? answers : (singleAnswer >= 0 ? [singleAnswer] : []));
  const choiceTexts = Array.isArray(item && item.choices)
    ? item.choices
    : (Array.isArray(item && item.options) ? item.options : []);
  const choices = choiceTexts.map((text, i) => ({
    text: String(text || ''),
    isCorrect: correctSet.has(i)
  }));

  return {
    kind: 'choice',
    isMulti: correctSet.size > 1,
    choices,
    ...base
  };
}

function makeQBankDataset(file, arr){
  const meta = guessQBankMeta(arr, file && file.name);
  return {
    origin: 'qbank',
    file,
    name: file && file.name ? file.name : 'imported_question_bank.json',
    prefix: meta.prefix,
    sourcePrefix: meta.sourcePrefix,
    parsed: (arr || []).map((item, idx) => convertQuestionBankItemToParsed(item, idx, meta)),
    parsedReady: true,
    parsing: false,
    err: ''
  };
}

fileInput.addEventListener('change', () => {
  const files = Array.from(fileInput.files || []);
  const items = files.map(makeMHTMLDataset);
  upsertDatasets(items, { keepActive: false });
  renderFileTable();
  updateActiveUI();
  parseAllBtn.disabled = datasets.length === 0;
  parseActiveBtn.disabled = datasets.length === 0;
  setTopStatus(files.length ? `已加入 ${files.length} 个 MHTML 文件` : '', false);
});

qbankFileInput && qbankFileInput.addEventListener('change', () => {
  const files = Array.from(qbankFileInput.files || []);
  extractQBankBtn.disabled = files.length === 0;
  if (qbankStatusEl) qbankStatusEl.textContent = files.length ? `已选择 ${files.length} 个题库文件` : '';
});

extractQBankBtn && extractQBankBtn.addEventListener('click', async () => {
  const files = Array.from((qbankFileInput && qbankFileInput.files) || []);
  if (!files.length) return;
  extractQBankBtn.disabled = true;
  if (qbankStatusEl) qbankStatusEl.textContent = '提取中…';
  try{
    const imported = [];
    const detail = [];
    let total = 0;
    for (const f of files){
      const raw = await f.text();
      const arr = extractQuestionBankArrayFromText(raw);
      imported.push(makeQBankDataset(f, arr));
      total += arr.length;
      detail.push(`${f.name}: ${arr.length} 题`);
    }
    upsertDatasets(imported, { keepActive: false });
    renderFileTable();
    updateActiveUI();
    parseAllBtn.disabled = datasets.length === 0;
    parseActiveBtn.disabled = datasets.length === 0;
    if (qbankStatusEl) qbankStatusEl.textContent = `提取完成：${files.length} 个文件，共 ${total} 题，已加入文件列表`;
    setTopStatus(`已从已生成题库加入 ${total} 题到文件列表`, false);
    console.log('Imported question banks:', detail.join(' | '));
  }catch(e){
    console.error(e);
    if (qbankStatusEl) qbankStatusEl.textContent = '提取失败';
    alert('提取已生成题库失败：' + (e && e.message ? e.message : String(e)));
  }finally{
    extractQBankBtn.disabled = ((qbankFileInput && qbankFileInput.files && qbankFileInput.files.length) || 0) === 0;
  }
});

parseAllBtn.addEventListener('click', async () => {
  if (!datasets.length) return;
  setTopStatus('批量解析中…', false);
  // 顺序解析，避免浏览器卡死
  for (let i=0;i<datasets.length;i++){
    await parseOne(i);
  }

  const autoImportSummary = { files: 0, questions: 0, attempted: 0, imported: 0, failed: 0, errors: [] };
  const datasetsNeedAutoImport = datasets.filter(d => d && d.parsedReady && countImageUploadNeeded(d.parsed) > 0);
  if (datasetsNeedAutoImport.length){
    let fileNo = 0;
    for (const d of datasetsNeedAutoImport){
      fileNo += 1;
      setTopStatus(`解析完成，正在自动补图（${fileNo}/${datasetsNeedAutoImport.length}）：${d.name}`, false);
      const res = await autoImportMissingImagesForDataset(d, {
        onQuestionStart({ index, total }){
          setTopStatus(`解析完成，正在自动补图（${fileNo}/${datasetsNeedAutoImport.length}） ${d.name} · 题目 ${index + 1}/${total}`, false);
        }
      });
      autoImportSummary.files += res.questionCount ? 1 : 0;
      autoImportSummary.questions += res.questionCount;
      autoImportSummary.attempted += res.attempted;
      autoImportSummary.imported += res.imported;
      autoImportSummary.failed += res.failed;
      if (res.errors && res.errors.length) autoImportSummary.errors.push(...res.errors);
      renderFileTable();
      if (activeIdx >= 0 && datasets[activeIdx] === d) updateActiveUI();
    }
  }

  const okFiles = datasets.filter(d=>d.parsedReady).length;
  const missing = datasets.reduce((n, d) => n + (d.parsedReady ? countPendingAnswers(d.parsed) : 0), 0);
  const missingImgs = datasets.reduce((n, d) => n + (d.parsedReady ? countImageUploadNeeded(d.parsed) : 0), 0);
  let msg = `解析完成：${okFiles}/${datasets.length} 个文件`;
  if (autoImportSummary.imported > 0) msg += `；自动补图成功 ${autoImportSummary.imported} 张`;
  if (missing > 0) msg += `；未成功提取答案 ${missing} 题`;
  if (missingImgs > 0) msg += `；仍缺少可导出图片 ${missingImgs} 题`;
  else if (autoImportSummary.questions > 0) msg += '；缺图题已自动处理完成';
  setTopStatus(msg, missing > 0 || missingImgs > 0);
  renderFileTable();
  updateActiveUI();
});

parseActiveBtn.addEventListener('click', async () => {
  if (activeIdx < 0) return;
  await parseOne(activeIdx);
  const d = datasets[activeIdx];
  const missing = d && d.parsedReady ? countPendingAnswers(d.parsed) : 0;
  const missingImgs = d && d.parsedReady ? countImageUploadNeeded(d.parsed) : 0;
  let msg = d && d.parsedReady ? `解析完成：${d.name}` : (d && d.err ? `解析失败：${d.name}` : '');
  if (d && d.parsedReady && missing > 0) msg += `；未成功提取答案 ${missing} 题`;
  if (d && d.parsedReady && missingImgs > 0) msg += `；缺少可导出图片 ${missingImgs} 题`;
  setTopStatus(msg, missing > 0 || missingImgs > 0 || !!(d && d.err));
  renderFileTable();
  updateActiveUI();
});

exportActiveBtn.addEventListener('click', () => {
const d = datasets[activeIdx];
  if (!d || !d.parsedReady) return;
  collectFromUI(d);
  out.value = JSON.stringify(buildQuestionBank(d.parsed, d.prefix, d.sourcePrefix), null, 2);
  outDownloadName = (d.prefix ? (d.prefix + '.json') : 'question_bank.json');
  out.dispatchEvent(new Event('input'));
});

exportAllBtn.addEventListener('click', () => {
const all = [];
  for (const d of datasets){
    if (!d.parsedReady) continue;
    collectFromUI(d);
    all.push(...buildQuestionBank(d.parsed, d.prefix, d.sourcePrefix));
  }
  out.value = JSON.stringify(all, null, 2);
  outDownloadName = 'question_bank_merged.json';
  out.dispatchEvent(new Event('input'));
});

exportUniqueBtn.addEventListener('click', () => {
  const merged = buildUniqueMergedQuestionBank();
  out.value = JSON.stringify(merged, null, 2);
  outDownloadName = 'question_bank_unique_merged.json';
  out.dispatchEvent(new Event('input'));
});

downloadOutJsonBtn && downloadOutJsonBtn.addEventListener('click', downloadOutAsJSON);
genQBankBtn && genQBankBtn.addEventListener('click', async () => {
  try{
    const arr = getExportArrayOrNull();
    if (!arr || !arr.length){
      alert('没有可发布的题库：请先解析并导出 JSON。');
      return;
    }
    const publishMeta = collectPublishMeta(arr);
    const existingManifest = await readImportedManifest();
    const includeLegacyHtml = !!(includeLegacyHtmlEl && includeLegacyHtmlEl.checked);
    const result = await buildSitePublishZip({
      questions: arr,
      publishMeta,
      existingManifest,
      includeLegacyHtml,
    });
    downloadBlobAsFile(result.blob, result.filename || 'site_publish.zip');
    statusEl.textContent = `已导出站点发布包：${result.filename}（${result.entry.mode === 'protected' ? '密码保护' : '公开'}，${arr.length} 题）`;
  }catch(e){
    console.error(e);
    alert('导出站点发布包失败：' + (e && e.message ? e.message : String(e)));
  }
});

genLegacyQBankBtn && genLegacyQBankBtn.addEventListener('click', async () => {
  try{
    const arr = getExportArrayOrNull();
    if (!arr || !arr.length){
      alert('没有可导出的题库：请先解析并导出 JSON。');
      return;
    }
    const publishMeta = collectPublishMeta(arr);
    const html = await buildLegacyQuestionBankHtml(arr, {
      mode: publishMeta.mode,
      password: publishMeta.password,
    });
    const defaults = guessPublishDefaults(arr);
    const fname = buildLegacyExportFilename(defaults.bankId);
    downloadTextAsFile(html, fname, 'text/html;charset=utf-8');
    statusEl.textContent = `已导出兼容单 HTML：${fname}（${arr.length} 题，${publishMeta.mode === 'protected' ? '密码保护' : '公开'}）`;
  }catch(e){
    console.error(e);
    alert('导出兼容单 HTML 失败：' + (e && e.message ? e.message : String(e)));
  }
});

async function readImportedManifest(){
  const file = manifestFileEl && manifestFileEl.files && manifestFileEl.files[0];
  if (!file) return [];
  const raw = await file.text();
  return parseManifestTextHelper(raw);
}

function collectPublishMeta(arr){
  const defaults = guessPublishDefaults(arr);
  const meta = buildPublishMetaHelper({
    bankId: publishBankIdEl && publishBankIdEl.value ? publishBankIdEl.value.trim() : '',
    title: publishTitleEl && publishTitleEl.value ? publishTitleEl.value.trim() : '',
    mode: publishModeEl && publishModeEl.value ? publishModeEl.value : 'public',
    description: publishDescriptionEl && publishDescriptionEl.value ? publishDescriptionEl.value.trim() : '',
    tags: publishTagsEl && publishTagsEl.value ? publishTagsEl.value : '',
    cover: publishCoverEl && publishCoverEl.value ? publishCoverEl.value.trim() : '',
    passwordHint: publishPasswordHintEl && publishPasswordHintEl.value ? publishPasswordHintEl.value.trim() : '',
    password: publishPasswordEl && publishPasswordEl.value ? publishPasswordEl.value : '',
  }, arr, {
    activePrefix: defaults.bankId,
    activeSourcePrefix: defaults.title,
  });

  if (publishBankIdEl) publishBankIdEl.value = meta.id;
  if (publishTitleEl && !publishTitleEl.value.trim()) publishTitleEl.value = meta.title;
  savePublishSettings();
  return meta;
}

function guessPublishDefaults(arr){
  const fromActive = datasets[activeIdx] || null;
  return guessPublishDefaultsHelper(arr, {
    activePrefix: fromActive && fromActive.prefix ? fromActive.prefix : '',
    activeSourcePrefix: fromActive && fromActive.sourcePrefix ? fromActive.sourcePrefix : '',
  });
}

function buildLegacyExportFilename(bankId){
  const stamp = new Date().toISOString().slice(0,10).replaceAll('-','');
  return `question_bank_${slugifyBankId(bankId || 'question-bank')}_${stamp}.html`;
}

function tryParseJSONArray(s){
  const t = (s || '').trim();
  if (!t) return null;
  try{
    const obj = JSON.parse(t);
    if (Array.isArray(obj)) return obj;
    if (obj && typeof obj === 'object') return [obj];
    return null;
  }catch{
    return null;
  }
}

function extractBracketedJSONArray(source, startIndex){
  const start = String(source || '').indexOf('[', Math.max(0, startIndex || 0));
  if (start < 0) return '';
  let depth = 0;
  let inStr = false;
  let quote = '';
  let esc = false;
  for (let i = start; i < source.length; i++){
    const ch = source[i];
    if (inStr){
      if (esc){ esc = false; continue; }
      if (ch === '\\'){ esc = true; continue; }
      if (ch === quote){ inStr = false; quote = ''; }
      continue;
    }
    if (ch === '"' || ch === "'"){
      inStr = true;
      quote = ch;
      continue;
    }
    if (ch === '[') depth++;
    else if (ch === ']'){
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return '';
}

function extractQuestionBankArrayFromText(raw){
  const text = String(raw || '').trim();
  if (!text) throw new Error('文件为空');

  const direct = tryParseJSONArray(text);
  if (direct) return direct;

  const candidates = [
    'RAW_QUESTION_BANK',
    'QUESTION_BANK',
    'const data =',
    'window.__QUESTION_BANK__',
    'window.QUESTION_BANK'
  ];
  for (const token of candidates){
    const idx = text.indexOf(token);
    if (idx >= 0){
      const arrText = extractBracketedJSONArray(text, idx);
      const parsed = tryParseJSONArray(arrText);
      if (parsed) return parsed;
    }
  }

  const scripts = Array.from(new DOMParser().parseFromString(text, 'text/html').querySelectorAll('script'));
  for (const script of scripts){
    const body = script.textContent || '';
    for (const token of candidates){
      const idx = body.indexOf(token);
      if (idx >= 0){
        const arrText = extractBracketedJSONArray(body, idx);
        const parsed = tryParseJSONArray(arrText);
        if (parsed) return parsed;
      }
    }
  }

  throw new Error('未能从该文件中定位题库 JSON 数组');
}

function makeSafeJSONForScript(jsonStr){
  // 防止生成的题库网页在 <script> 内注入 JSON 时被某些字符截断或导致语法错误：
  // 1) <\/script> 会提前结束 script 标签
  // 2) U+2028 / U+2029 在 JS 字符串里会被当成换行，导致语法错误（JSON.stringify 可能原样输出）
  return (jsonStr || '')
    .replace(/<\/script>/gi, '<\\/script>')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function injectQuestionBankJSON(tpl, jsonStr){
  // Template uses a marker literal: __QUESTION_BANK_JSON__
  const marker = '__QUESTION_BANK_JSON__';
  if (!tpl.includes(marker)){
    throw new Error('无法在题库模板中定位 QUESTION_BANK marker（__QUESTION_BANK_JSON__）。');
  }
  return tpl.replace(marker, jsonStr);
}

function downloadTextAsFile(text, filename, mime){
  const blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'download.html';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 8000);
}

function downloadBlobAsFile(blob, filename){
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'download.zip';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 8000);
}

function safeJSONStringForScript(jsonStr){
  // Make JSON safe to inline into <script> as JS literal (no literal closing-tag sequences here).
  return (jsonStr || '')
    .replace(/<\/script>/gi, '<\\/script>')
    .replace(/<\//g, '<\\/')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

btnSelectAll.addEventListener('click', () => {
  const d = datasets[activeIdx];
  if (!d || !d.parsedReady) return;
  // 对没有正确项的单选题补第一个
  d.parsed.forEach((q, qi) => {
    if ((q.kind||'choice') !== 'choice') return;
    if (q.isMulti) return;
    const hasCorrect = (q.choices||[]).some(c=>c.isCorrect);
    if (!hasCorrect && (q.choices||[]).length){
      q.choices.forEach((c,i)=> c.isCorrect = (i===0));
    }
  });
  renderQuestions(d);
  renderFileTable();
  setDatasetStatusMessage(d);
  updateExportButtons();
});

btnClearAll.addEventListener('click', () => {
  const d = datasets[activeIdx];
  if (!d || !d.parsedReady) return;
  d.parsed.forEach(q => {
    if ((q.kind||'choice') !== 'choice') return;
    (q.choices||[]).forEach(c=>c.isCorrect=false);
  });
  renderQuestions(d);
  renderFileTable();
  setDatasetStatusMessage(d);
  updateExportButtons();
});

function getDeepSeekAnswerSettings(){
  return {
    apiKey: ocrAiApiKeyEl && ocrAiApiKeyEl.value ? ocrAiApiKeyEl.value.trim() : '',
    baseUrl: (ocrAiBaseUrlEl && ocrAiBaseUrlEl.value ? ocrAiBaseUrlEl.value.trim() : '') || DEFAULT_DEEPSEEK_BASE_URL,
    model: (ocrAiModelEl && ocrAiModelEl.value ? ocrAiModelEl.value.trim() : '') || DEFAULT_DEEPSEEK_MODEL
  };
}

function setAiAnswerStatus(message, warn){
  if (!aiAnswerStatusEl) return;
  aiAnswerStatusEl.textContent = message || '';
  aiAnswerStatusEl.style.color = warn ? '#b91c1c' : '';
}

function getAiAnswerableQuestionIndexes(d){
  if (!d || !d.parsedReady) return [];
  return (d.parsed || [])
    .map((q, index) => ({ q, index, usable: questionCanUseAiAnswer(q) }))
    .filter(item => item.usable && item.usable.ok)
    .map(item => item.index);
}

function updateAiAnswerButtons(){
  const d = datasets[activeIdx];
  const settings = getDeepSeekAnswerSettings();
  const indexes = getAiAnswerableQuestionIndexes(d);
  const disabled = !(d && d.parsedReady) || !settings.apiKey || !indexes.length;
  if (aiAnswerCurrentBtn) aiAnswerCurrentBtn.disabled = disabled;
  if (aiAnswerMissingBtn) aiAnswerMissingBtn.disabled = disabled;
}

function getQuestionSourceForAi(d, q){
  return String((q && q.importedSource) || (d && d.sourcePrefix ? `${d.sourcePrefix} – Q${(q && (q.sourceNum || q.num)) || ''}` : '') || '').trim();
}

async function runAiAnswerForQuestion(d, qIndex, settings){
  const q = d && d.parsed ? d.parsed[qIndex] : null;
  const usable = questionCanUseAiAnswer(q);
  if (!usable.ok) {
    return { applied: false, reason: usable.reason };
  }
  const source = getQuestionSourceForAi(d, q);
  const payload = buildDeepSeekAnswerFillPayload(q, {
    model: settings.model,
    source
  });
  const respJson = await callDeepSeekAnswerFill(settings.baseUrl, settings.apiKey, payload);
  const suggestion = parseDeepSeekAnswerFillResponse(respJson, q);
  return applyAiAnswerSuggestion(q, suggestion, {
    provider: 'deepseek',
    model: settings.model
  });
}

async function runAiAnswerForCurrentMissingQuestion(){
  const d = datasets[activeIdx];
  if (!d || !d.parsedReady) return;
  collectFromUI(d);
  const settings = getDeepSeekAnswerSettings();
  if (!settings.apiKey){
    setAiAnswerStatus('请先填写 DeepSeek API Key。', true);
    updateAiAnswerButtons();
    return;
  }
  const indexes = getAiAnswerableQuestionIndexes(d);
  if (!indexes.length){
    setAiAnswerStatus('当前文件没有可由 AI 补全的缺答案题。', false);
    updateAiAnswerButtons();
    return;
  }

  const qIndex = indexes[0];
  setAiAnswerStatus(`DeepSeek 正在补全 Q${(d.parsed[qIndex] && d.parsed[qIndex].num) || qIndex + 1}…`, false);
  aiAnswerCurrentBtn && (aiAnswerCurrentBtn.disabled = true);
  aiAnswerMissingBtn && (aiAnswerMissingBtn.disabled = true);
  try{
    const result = await runAiAnswerForQuestion(d, qIndex, settings);
    if (result.applied){
      setAiAnswerStatus(`已补全 Q${(d.parsed[qIndex] && d.parsed[qIndex].num) || qIndex + 1}`, false);
    }else{
      setAiAnswerStatus(`未补全 Q${(d.parsed[qIndex] && d.parsed[qIndex].num) || qIndex + 1}：${result.reason}`, true);
    }
  }catch(err){
    const q = d.parsed[qIndex];
    if (q) {
      q.aiAnswerMeta = {
        provider: 'deepseek',
        model: settings.model,
        confidence: null,
        explanation: '',
        error: String(err && err.message ? err.message : err).slice(0, 300)
      };
    }
    setAiAnswerStatus(`AI 补答案失败：${err && err.message ? err.message : err}`, true);
  }
  renderQuestions(d);
  renderFileTable();
  setDatasetStatusMessage(d);
  updateExportButtons();
}

async function runAiAnswerForActiveDataset(){
  const d = datasets[activeIdx];
  if (!d || !d.parsedReady) return;
  collectFromUI(d);
  const settings = getDeepSeekAnswerSettings();
  if (!settings.apiKey){
    setAiAnswerStatus('请先填写 DeepSeek API Key。', true);
    updateAiAnswerButtons();
    return;
  }
  const indexes = getAiAnswerableQuestionIndexes(d);
  if (!indexes.length){
    setAiAnswerStatus('当前文件没有可由 AI 补全的缺答案题。', false);
    updateAiAnswerButtons();
    return;
  }

  aiAnswerCurrentBtn && (aiAnswerCurrentBtn.disabled = true);
  aiAnswerMissingBtn && (aiAnswerMissingBtn.disabled = true);
  let applied = 0;
  let failed = 0;
  let skipped = 0;
  for (let i = 0; i < indexes.length; i += 1){
    const qIndex = indexes[i];
    const q = d.parsed[qIndex];
    setAiAnswerStatus(`DeepSeek 正在补全 ${i + 1}/${indexes.length}：Q${(q && q.num) || qIndex + 1}`, false);
    try{
      const result = await runAiAnswerForQuestion(d, qIndex, settings);
      if (result.applied) applied += 1;
      else skipped += 1;
    }catch(err){
      failed += 1;
      if (q) {
        q.aiAnswerMeta = {
          provider: 'deepseek',
          model: settings.model,
          confidence: null,
          explanation: '',
          error: String(err && err.message ? err.message : err).slice(0, 300)
        };
      }
    }
  }
  setAiAnswerStatus(`AI 补答案完成：已补全 ${applied}，跳过 ${skipped}，失败 ${failed}`, failed > 0);
  renderQuestions(d);
  renderFileTable();
  setDatasetStatusMessage(d);
  updateExportButtons();
}

async function parseOne(i){
  const d = datasets[i];
  if (!d) return;
  if (d.origin === 'qbank'){
    d.err = '';
    d.parsing = false;
    d.parsedReady = true;
    if (i === activeIdx) updateActiveUI();
    return;
  }
  d.parsing = true; d.err = '';
  renderFileTable();

  try{
    setTopStatus(`解析：${d.name}`, false);
    const raw = await d.file.text();
    const { html, htmlParts, cidMap } = parseMHTML(raw);

    const candidates = [];
    const seen = new Set();
    [html, ...(Array.isArray(htmlParts) ? htmlParts : [])].forEach(part => {
      const normalized = String(part || '');
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      candidates.push(normalized);
    });

    let bestParsed = [];
    for (const candidate of candidates){
      const htmlWithData = rewriteSources(candidate, cidMap);
      const parsed = parseCanvasHTML(htmlWithData);
      if ((parsed?.length || 0) > (bestParsed?.length || 0)) {
        bestParsed = parsed;
      }
    }

    d.parsed = bestParsed;
    d.parsedReady = true;
  }catch(e){
    d.err = String(e && e.message ? e.message : e);
    d.parsedReady = false;
  }finally{
    d.parsing = false;
  }

  // 如果正在预览这个文件，刷新右侧
  if (i === activeIdx) updateActiveUI();
}

/* --------- 文件表格 --------- */
function renderFileTable(){
  fileTableBody.innerHTML = '';
  datasets.forEach((d, idx) => {
    const tr = document.createElement('tr');
    tr.dataset.testid = 'dataset-row';
    tr.dataset.datasetIndex = String(idx);
    tr.dataset.origin = String((d && d.origin) || 'mhtml');

    const info = formatDatasetStatus(d);
    const statusBadge = d.parsing
      ? `<span class="badge">解析中…</span>`
      : d.err
        ? `<span class="badge wait">失败</span>`
        : d.parsedReady
          ? `<span class="badge ${(info.pending || info.missingImgs) ? 'wait' : 'ok'}">${info.text}</span>`
          : `<span class="badge">未解析</span>`;

    tr.innerHTML = `
      <td>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <button class="btn ${idx===activeIdx?'primary':''}" data-act="preview" data-idx="${idx}" data-testid="preview-dataset-btn">预览</button>
          ${editMode ? `<button class="btn danger" data-act="delete-dataset" data-idx="${idx}" data-testid="delete-dataset-btn" title="删除该题库">删除</button>` : ''}
          <div style="min-width:240px">
            <div style="font-weight:600;word-break:break-word">${escapeHTML(d.name)}</div>
            ${d.err ? `<div class="meta" style="color:#b91c1c">Error: ${escapeHTML(d.err)}</div>` : ``}
          </div>
        </div>
      </td>
      <td>
        <input class="small" type="text" value="${escapeHTML(d.prefix)}" data-act="prefix" data-idx="${idx}" data-testid="dataset-prefix-input">
      </td>
      <td>
        <input type="text" value="${escapeHTML(d.sourcePrefix)}" data-act="source" data-idx="${idx}" data-testid="dataset-source-input">
      </td>
      <td>${statusBadge}</td>
    `;
    fileTableBody.appendChild(tr);
  });
}

fileTableBody.addEventListener('click', (e) => {
  const delBtn = e.target.closest('button[data-act="delete-dataset"]');
  if (delBtn) {
    const idx = Number(delBtn.dataset.idx);
    const d = datasets[idx];
    if (!d) return;
    if (!confirm(`确定删除题库「${d.name}」？此操作不可撤销。`)) return;
    const wasActive = activeIdx === idx;
    datasets.splice(idx, 1);
    if (wasActive) {
      activeIdx = datasets.length ? Math.min(idx, datasets.length - 1) : -1;
    } else if (activeIdx > idx) {
      activeIdx -= 1;
    }
    renderFileTable();
    updateActiveUI();
    updateExportButtons();
    return;
  }
  const btn = e.target.closest('button[data-act="preview"]');
  if (!btn) return;
  const idx = Number(btn.dataset.idx);
  if (Number.isNaN(idx)) return;
  activeIdx = idx;
  renderFileTable();
  updateActiveUI();
});

fileTableBody.addEventListener('input', (e) => {
  const inp = e.target;
  if (!(inp instanceof HTMLInputElement)) return;
  const act = inp.dataset.act;
  const idx = Number(inp.dataset.idx);
  const d = datasets[idx];
  if (!d) return;
  if (act === 'prefix') d.prefix = inp.value.trim();
  if (act === 'source') d.sourcePrefix = inp.value.trim();
  updateExportButtons();
});

/* --------- 右侧预览 --------- */
function updateActiveUI(){
  const d = datasets[activeIdx];
  activeNameEl.textContent = d ? d.name : '(未选择)';
  if (!d || !d.parsedReady){
    list.innerHTML = '';
    setDatasetStatusMessage(d || null);
    maybePrefillPublishFields();
    updateExportButtons();
    return;
  }
  renderQuestions(d);
  setDatasetStatusMessage(d);
  maybePrefillPublishFields();
  updateExportButtons();
}

function updateExportButtons(){
  const d = datasets[activeIdx];
  const parsedCount = datasets.filter(x=>x.parsedReady).length;

  exportActiveBtn.disabled = !(d && d.parsedReady);
  exportAllBtn.disabled = parsedCount === 0;
  if (exportUniqueBtn) exportUniqueBtn.disabled = parsedCount === 0;

  const buttonState = getPublishButtonStateHelper({
    parsedCount,
    outValue: out && out.value ? out.value : '',
    publishMode: publishModeEl && publishModeEl.value ? publishModeEl.value : 'public',
    publishPassword: publishPasswordEl && publishPasswordEl.value ? publishPasswordEl.value : '',
    apiBaseUrl: apiBaseUrlEl && apiBaseUrlEl.value ? apiBaseUrlEl.value : '',
    apiKey: apiKeyEl && apiKeyEl.value ? apiKeyEl.value : '',
  });
  if (genQBankBtn) genQBankBtn.disabled = buttonState.disableSiteZip;
  if (genLegacyQBankBtn) genLegacyQBankBtn.disabled = buttonState.disableLegacyHtml;

  if (dryRunAiMCQEl) dryRunAiMCQEl.disabled = buttonState.disableAiDryRun;
  if (runAiMCQEl) runAiMCQEl.disabled = buttonState.disableAiRun;
  updateAiAnswerButtons();
}

function maybePrefillPublishFields(){
  const arr = getExportArrayOrNull();
  if (!arr || !arr.length) return;
  const defaults = guessPublishDefaults(arr);
  if (publishBankIdEl && !publishBankIdEl.value.trim()) publishBankIdEl.value = defaults.bankId;
  if (publishTitleEl && !publishTitleEl.value.trim()) publishTitleEl.value = defaults.title;
  savePublishSettings();
}

function getExportArrayOrNull(){
  let arr = tryParseJSONArray(out.value);
  if (!arr){
    arr = [];
    for (const d of datasets){
      if (!d.parsedReady) continue;
      collectFromUI(d);
      arr.push(...buildQuestionBank(d.parsed, d.prefix, d.sourcePrefix));
    }
  }
  return (arr && arr.length) ? arr : null;
}

function countCorrectChoiceAnswers(q){
  return ((q && q.choices) || []).reduce((n,c)=> n + (c && c.isCorrect ? 1 : 0), 0);
}

function normalizeChoiceQuestionShape(q){
  if (!q || q.kind !== 'choice') return q;
  if (!q.isMulti) return q;
  if (countCorrectChoiceAnswers(q) === 1) q.isMulti = false;
  return q;
}

function canGenerateQBank(){
  return canGenerateQuestionBankHelper({
    parsedCount: datasets.filter(x=>x.parsedReady).length,
    outValue: out && out.value ? out.value : '',
  });
}


function uniqueNonEmptyStrings(arr){
  return Array.from(new Set((arr || []).map(v => String(v || '').trim()).filter(Boolean)));
}

function getQuestionImages(q){
  const base = Array.isArray(q && q.images) ? q.images : [];
  const uploaded = Array.isArray(q && q.uploadedImages) ? q.uploadedImages : [];
  return [...base, ...uploaded].filter(Boolean);
}

function getQuestionSourceScreenshot(q){
  return String((q && q.ocrSourceImage) || '').trim();
}

function questionNeedsImageUpload(q){
  const expected = Number((q && q.expectedImageCount) || 0);
  if (!expected) return false;
  return getQuestionImages(q).length < expected;
}

function countImageUploadNeeded(parsed){
  return ((parsed || []).reduce((n, q) => n + (questionNeedsImageUpload(q) ? 1 : 0), 0));
}

function formatDatasetStatus(d){
  const pending = d && d.parsedReady ? countPendingAnswers(d.parsed) : 0;
  const missingImgs = d && d.parsedReady ? countImageUploadNeeded(d.parsed) : 0;
  const parts = [];
  if (d && d.parsedReady) parts.push(`${d.parsed.length} 题`);
  if (pending) parts.push(`缺答 ${pending}`);
  if (missingImgs) parts.push(`缺图 ${missingImgs}`);
  return { pending, missingImgs, text: parts.join(' · ') };
}

function setDatasetStatusMessage(d){
  if (!d) {
    setTopStatus('', false);
    return;
  }
  if (d.err) {
    setTopStatus(`解析失败：${d.name}`, true);
    return;
  }
  if (!d.parsedReady) {
    setTopStatus(`未解析：${d.name}`, false);
    return;
  }
  const info = formatDatasetStatus(d);
  const head = d.origin === 'qbank' ? '已导入' : '解析完成';
  const msg = info.text ? `${head}：${d.name} · ${info.text}` : `${head}：${d.name}`;
  setTopStatus(msg, info.pending > 0 || info.missingImgs > 0);
}

function getMatchingChoicePool(q){
  const pool = [];
  (q && q.choicePool || []).forEach(v => pool.push(v));
  (q && q.pairs || []).forEach(p => {
    if (p && p.right) pool.push(p.right);
  });
  return uniqueNonEmptyStrings(pool);
}

function buildMatchingSubQuestionText(q, pair){
  const stem = String((q && q.qtext) || '').trim();
  const left = String((pair && pair.left) || '').trim();
  if (!stem) return left || '(配对题子项)';
  if (!left) return stem;
  return `${stem} [${left}]`;
}

function questionNeedsAnswerReview(q){
  const kind = (q && q.kind) || 'choice';
  if (kind === 'choice') return !((q.choices || []).some(c => c && c.isCorrect));
  if (kind === 'fill') return !((q.blanks || []).some(arr => Array.isArray(arr) && arr.some(v => String(v || '').trim())));
  if (kind === 'matching') return !((q.pairs || []).length && (q.pairs || []).every(p => String((p && p.right) || '').trim()));
  return false;
}

function countPendingAnswers(parsed){
  return ((parsed || []).reduce((n, q) => n + (questionNeedsAnswerReview(q) ? 1 : 0), 0));
}

function renderAiAnswerMeta(q){
  const meta = q && q.aiAnswerMeta;
  if (!meta) return '';
  const parts = [];
  if (meta.model) parts.push(`model: ${meta.model}`);
  if (meta.confidence != null) parts.push(`confidence: ${Math.round(Number(meta.confidence) * 100)}%`);
  if (meta.explanation) parts.push(meta.explanation);
  if (meta.error) parts.push(`error: ${meta.error}`);
  if (!parts.length) return '';
  const warn = meta.error ? ' style="color:#b91c1c"' : '';
  return `<div class="meta"${warn}>AI 答案诊断：${escapeHTML(parts.join(' · '))}</div>`;
}

function setTopStatus(message, hasWarn){
  statusEl.textContent = message || '';
  statusEl.style.color = hasWarn ? '#b91c1c' : '';
  statusEl.dataset.kind = hasWarn ? 'warning' : 'neutral';
}

function renderQuestions(d){
  list.innerHTML = '';
  d.parsed.forEach((q, qIndex) => {
    normalizeChoiceQuestionShape(q);
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.testid = 'question-editor-card';
    card.dataset.questionIndex = String(qIndex);
    card.dataset.questionKind = String((q && q.kind) || 'choice');

    const kind = q.kind || 'choice';

    const autoOK =
      kind === 'choice'
        ? (q.choices || []).some(c=>c.isCorrect)
        : kind === 'fill'
          ? (q.blanks || []).some(b => (b||[]).length)
          : kind === 'matching'
            ? (q.pairs || []).length > 0 && (q.pairs || []).every(p => String((p && p.right) || '').trim())
            : false;

    const badge = autoOK ? `<span class="good">已自动识别</span>` : `<span class="bad">待人工确认</span>`;
    const mergedImages = getQuestionImages(q);
    const sourceScreenshot = getQuestionSourceScreenshot(q);
    const compareImg = sourceScreenshot
      ? `<div class="panel" style="margin-top:10px;padding:10px">
           <div class="meta" style="margin-bottom:6px;font-weight:600">识别对比图（仅预览，不导出）</div>
           <div class="img"><img src="${sourceScreenshot}" alt="OCR source screenshot"></div>
         </div>`
      : '';
    const imgs = mergedImages.map(src=>`<div class="img"><img src="${src}" alt=""></div>`).join('');
    const imageWarnNeeded = questionNeedsImageUpload(q);
    const remainingImageCount = Math.max(0, Number(q.expectedImageCount || 0) - mergedImages.length);

    const typeLabel =
      kind === 'choice'
        ? (q.isMulti ? '多选题' : '单选题')
        : kind === 'fill'
          ? '填空题'
          : kind === 'matching'
            ? '配对题（将拆成多道单选）'
            : kind === 'essay'
              ? '问答题'
              : '未知题型';

    card.innerHTML = `
      <div class="qhead">
        <span class="qid">Q${q.num}</span>
        <span class="meta">${typeLabel} · ${badge}</span>
        ${editMode ? `<button class="btn danger" data-act="delete-question" data-qidx="${qIndex}" data-testid="delete-question-btn" title="删除此题">删除</button>` : ''}
      </div>
      <div class="qtext">${escapeHTML(q.qtext || '(无题干)')}</div>
      ${compareImg}
      ${imgs}
      ${imageWarnNeeded || ((q.uploadedImages || []).length > 0) ? `
        <div class="warnbox">
          <div class="title">检测到该题原始 HTML 有图片，但缺少可导出的 data 图片</div>
          <div class="meta">原始图片位数：${Number(q.expectedImageCount || 0)}；当前可导出：${mergedImages.length}；仍需补传：${remainingImageCount}。这里上传的图片会转成 base64 写入 JSON。</div>
          ${renderMissingImageSourceLinks(q.missingImageSources, qIndex)}
          <div class="row" style="margin-top:8px">
            <input type="file" accept="image/*" multiple data-kind="imgupload" data-testid="imgupload-input" data-qidx="${qIndex}">
            ${(q.uploadedImages || []).length ? `<button type="button" class="btn" data-act="clear-uploaded-images" data-testid="clear-uploaded-images-btn" data-qidx="${qIndex}">清空补传</button>` : ''}
          </div>
        </div>
      ` : ''}
      <div class="qbody"></div>
      <div class="meta">Source: ${escapeHTML((q.importedSource || `${d.sourcePrefix} – Q${q.sourceNum || q.num}`))}</div>
      ${renderAiAnswerMeta(q)}
    `;

    const body = card.querySelector('.qbody');

    if (kind === 'choice'){
      const ol = document.createElement('ol');
      ol.className = 'choices';
      (q.choices || []).forEach((c, aidx) => {
        const li = document.createElement('li');
        li.className = 'choice';
        const inputType = q.isMulti ? 'checkbox' : 'radio';
        const name = `f${activeIdx}_q${qIndex}`;
        li.innerHTML = `
          <label>
            <input type="${inputType}"
                   name="${name}"
                   data-testid="choice-correct-input"
                    data-qidx="${qIndex}"
                    data-aidx="${aidx}"
                    ${c.isCorrect ? 'checked' : ''}>
            <span>${String.fromCharCode(65+aidx)}. ${escapeHTML(c.text)}</span>
          </label>
        `;
        ol.appendChild(li);
      });
      body.appendChild(ol);
    }else if (kind === 'fill'){
      const wrap = document.createElement('div');
      wrap.innerHTML = `<div class="meta" style="margin-top:8px">填空答案：同一空多个可用 <code>|</code> 分隔</div>`;
      const blanks = (q.blanks && q.blanks.length) ? q.blanks : [[]];

      blanks.forEach((ansArr, bidx) => {
        const row = document.createElement('div');
        row.className = 'row';
        row.style.gap = '8px';
        row.style.marginTop = '8px';
        row.innerHTML = `
          <span class="badge">${bidx+1}</span>
          <input type="text"
                 data-kind="fill"
                 data-testid="fill-answer-input"
                 data-qidx="${qIndex}"
                 data-bidx="${bidx}"
                 value="${escapeHTML((ansArr||[]).join(' | '))}"
                  style="flex:1;min-width:200px">
        `;
        wrap.appendChild(row);
      });

      body.appendChild(wrap);
    }else if (kind === 'matching'){
      const wrap = document.createElement('div');
      const pool = getMatchingChoicePool(q);
      wrap.innerHTML = `<div class="meta" style="margin-top:8px">将导出为 ${(q.pairs || []).length} 道单选题；每个左侧子项拆成 1 题，并继承原题图片。选项池大小：${pool.length}</div>`;
      const ol = document.createElement('ol');
      ol.className = 'choices';
      (q.pairs || []).forEach((pair, midx) => {
        const li = document.createElement('li');
        li.className = 'choice';
        li.innerHTML = `<div><strong>${escapeHTML((pair && pair.left) || `子项 ${midx+1}`)}</strong> <span class="meta">→ ${escapeHTML((pair && pair.right) || '(未识别)')}</span></div>`;
        ol.appendChild(li);
      });
      wrap.appendChild(ol);
      body.appendChild(wrap);
    }else{
      body.innerHTML = `<div class="meta" style="margin-top:8px">（此题型暂无标准答案可抽取）</div>`;
    }

    card.dataset.fileidx = String(activeIdx);
    list.appendChild(card);
  });
}

function readFileAsDataURL(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('读取图片失败'));
    reader.readAsDataURL(file);
  });
}

function blobToDataURL(blob){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('读取图片失败'));
    reader.readAsDataURL(blob);
  });
}

function isLikelyImageBlob(blob, href){
  const type = String((blob && blob.type) || '').toLowerCase();
  if (/^image\//.test(type)) return true;
  if (/octet-stream|binary/.test(type)) return true;
  const path = String(href || '').split('?')[0].toLowerCase();
  return /\.(png|jpe?g|webp|gif|bmp|svg|avif)(?:$|#)/i.test(path);
}

async function fetchBlobOnce(href, opts){
  const res = await fetch(href, Object.assign({ method:'GET', credentials:'include', redirect:'follow', cache:'no-store' }, opts || {}));
  if (!res.ok) throw new Error(`下载失败（HTTP ${res.status}）`);
  const blob = await res.blob();
  if (!blob || !blob.size) throw new Error('返回内容为空');
  if (!isLikelyImageBlob(blob, href)){
    throw new Error(`返回内容不是图片：${String(blob.type || 'unknown')}`);
  }
  return blob;
}

function xhrBlobOnce(href, withCredentials){
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', href, true);
    xhr.responseType = 'blob';
    xhr.withCredentials = !!withCredentials;
    xhr.timeout = 20000;
    try{ xhr.setRequestHeader('Accept', 'image/*,*/*;q=0.8'); }catch(_e){}
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300){
        reject(new Error(`下载失败（HTTP ${xhr.status || 0}）`));
        return;
      }
      const blob = xhr.response;
      if (!blob || !blob.size){
        reject(new Error('返回内容为空'));
        return;
      }
      if (!isLikelyImageBlob(blob, href)){
        reject(new Error(`返回内容不是图片：${String(blob.type || 'unknown')}`));
        return;
      }
      resolve(blob);
    };
    xhr.onerror = () => reject(new Error('XHR 下载失败'));
    xhr.ontimeout = () => reject(new Error('XHR 下载超时'));
    xhr.send();
  });
}

async function importImageFromSourceURL(rawUrl){
  const candidates = buildImportImageUrlCandidates(rawUrl);
  if (!candidates.length) throw new Error('无效图片链接');
  if (/^data:image\//i.test(candidates[0])) return candidates[0];

  let lastErr = null;
  for (const href of candidates){
    const attempts = [
      () => fetchBlobOnce(href, { credentials:'include', mode:'cors' }),
      () => fetchBlobOnce(href, { credentials:'omit', mode:'cors' }),
      () => xhrBlobOnce(href, true),
      () => xhrBlobOnce(href, false)
    ];
    for (const run of attempts){
      try{
        const blob = await run();
        return await blobToDataURL(blob);
      }catch(err){
        lastErr = err;
      }
    }
  }
  throw lastErr || new Error('无法直接抓取图片');
}

async function tryAutoImportMissingImagesForQuestion(q){
  if (!q || !questionNeedsImageUpload(q)) {
    return { attempted: 0, imported: 0, failed: 0, errors: [] };
  }

  const sources = uniqueNonEmptyStrings(q.missingImageSources || []);
  if (!sources.length) {
    return { attempted: 0, imported: 0, failed: 0, errors: [] };
  }

  const uploaded = Array.isArray(q.uploadedImages) ? q.uploadedImages.slice() : [];
  const errors = [];
  let attempted = 0;
  let imported = 0;
  let failed = 0;

  for (const rawUrl of sources){
    if (!questionNeedsImageUpload({ ...q, uploadedImages: uploaded })) break;
    attempted += 1;
    try{
      const dataUrl = await importImageFromSourceURL(rawUrl);
      if (!uploaded.includes(dataUrl)) {
        uploaded.push(dataUrl);
        imported += 1;
      }
    }catch(err){
      failed += 1;
      errors.push({
        url: rawUrl,
        message: err && err.message ? String(err.message) : '未知错误'
      });
    }
  }

  q.uploadedImages = uploaded;
  return { attempted, imported, failed, errors };
}

async function autoImportMissingImagesForDataset(d, hooks = {}){
  if (!d || !d.parsedReady) {
    return { questionCount: 0, attempted: 0, imported: 0, failed: 0, errors: [] };
  }

  const questions = (d.parsed || []).filter(q => questionNeedsImageUpload(q) && uniqueNonEmptyStrings(q.missingImageSources || []).length > 0);
  let attempted = 0;
  let imported = 0;
  let failed = 0;
  const errors = [];

  for (let i = 0; i < questions.length; i++){
    const q = questions[i];
    if (typeof hooks.onQuestionStart === 'function') {
      try{ hooks.onQuestionStart({ dataset: d, question: q, index: i, total: questions.length }); }catch(_e){}
    }
    const res = await tryAutoImportMissingImagesForQuestion(q);
    attempted += res.attempted;
    imported += res.imported;
    failed += res.failed;
    if (res.errors && res.errors.length) errors.push(...res.errors.map(e => ({ ...e, dataset: d.name, qnum: q.num })));
    if (typeof hooks.onQuestionDone === 'function') {
      try{ hooks.onQuestionDone({ dataset: d, question: q, index: i, total: questions.length, result: res }); }catch(_e){}
    }
  }

  return { questionCount: questions.length, attempted, imported, failed, errors };
}

/* 事件：改答案 / 补传图片 */
list.addEventListener('change', async (e) => {
  const t = e.target;
  if (!(t instanceof HTMLInputElement)) return;

  const fileCard = t.closest('.card');
  if (!fileCard) return;
  const fidx = Number(fileCard.dataset.fileidx);
  const d = datasets[fidx];
  if (!d || !d.parsedReady) return;

  if (t.dataset.kind === 'imgupload'){
    const qidx = Number(t.dataset.qidx);
    const q = d.parsed[qidx];
    if (!q) return;
    const files = Array.from(t.files || []).filter(file => {
      return /^image\//i.test(file.type || '') || /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(file.name || '');
    });
    if (!files.length) return;

    const urls = (await Promise.all(files.map(readFileAsDataURL))).filter(Boolean);
    q.uploadedImages = urls;
    renderQuestions(d);
    renderFileTable();
    if (fidx === activeIdx) setDatasetStatusMessage(d);
    return;
  }

  if (t.type !== 'radio' && t.type !== 'checkbox') return;

  const qidx = Number(t.dataset.qidx);
  const aidx = Number(t.dataset.aidx);
  const q = d.parsed[qidx];
  if (!q || q.kind !== 'choice') return;

  if (q.isMulti){
    q.choices[aidx].isCorrect = t.checked;
    normalizeChoiceQuestionShape(q);
    if (!q.isMulti) renderQuestions(d);
  }else{
    q.choices.forEach((c,i)=> c.isCorrect = (i===aidx));
    const group = list.querySelectorAll(`input[name="${t.name}"]`);
    group.forEach((el,i)=> el.checked = (i===aidx));
  }
});

list.addEventListener('click', async (e) => {
  const importLink = e.target.closest('a[data-act="import-missing-image"]');
  if (importLink){
    e.preventDefault();
    const fileCard = importLink.closest('.card');
    if (!fileCard) return;
    const fidx = Number(fileCard.dataset.fileidx);
    const d = datasets[fidx];
    if (!d || !d.parsedReady) return;
    const qidx = Number(importLink.dataset.qidx);
    const q = d.parsed[qidx];
    if (!q) return;

    const rawUrl = String(importLink.dataset.src || importLink.getAttribute('href') || '');
    const oldText = importLink.textContent;
    importLink.textContent = '正在导入图片…';
    importLink.style.pointerEvents = 'none';
    try{
      const dataUrl = await importImageFromSourceURL(rawUrl);
      const uploaded = Array.isArray(q.uploadedImages) ? q.uploadedImages.slice() : [];
      if (!uploaded.includes(dataUrl)) uploaded.push(dataUrl);
      q.uploadedImages = uploaded;
      renderQuestions(d);
      renderFileTable();
      if (fidx === activeIdx) setDatasetStatusMessage(d);
    }catch(err){
      console.warn('import missing image failed:', err);
      const msg = err && err.message ? String(err.message) : '未知错误';
      importLink.textContent = `${oldText}（自动导入失败）`;
      importLink.style.pointerEvents = '';
      importLink.title = `自动导入失败：${msg}`;
      if (fidx === activeIdx) {
        setTopStatus(`自动导入图片失败：${msg}。该站点可能允许浏览器下载，但阻止脚本直接读取；请改用下方上传框导入刚下载的图片。`, true);
      }
    }
    return;
  }

  const delQBtn = e.target.closest('button[data-act="delete-question"]');
  if (delQBtn) {
    const qidx = Number(delQBtn.dataset.qidx);
    const d = datasets[activeIdx];
    if (!d || !Array.isArray(d.parsed) || !d.parsed[qidx]) return;
    const qNum = d.parsed[qidx].num || (qidx + 1);
    if (!confirm(`确定删除 Q${qNum}？此操作不可撤销。`)) return;
    d.parsed.splice(qidx, 1);
    renderQuestions(d);
    renderFileTable();
    updateExportButtons();
    return;
  }

  const btn = e.target.closest('button[data-act="clear-uploaded-images"]');
  if (!btn) return;
  const qidx = Number(btn.dataset.qidx);
  const fileCard = btn.closest('.card');
  if (!fileCard) return;
  const fidx = Number(fileCard.dataset.fileidx);
  const d = datasets[fidx];
  if (!d || !d.parsedReady) return;
  const q = d.parsed[qidx];
  if (!q) return;
  q.uploadedImages = [];
  renderQuestions(d);
  renderFileTable();
  if (fidx === activeIdx) setDatasetStatusMessage(d);
});

list.addEventListener('input', (e) => {
  const t = e.target;
  if (!(t instanceof HTMLInputElement)) return;
  if (t.dataset.kind !== 'fill') return;

  const qidx = Number(t.dataset.qidx);
  const bidx = Number(t.dataset.bidx);
  const fileCard = t.closest('.card');
  if (!fileCard) return;
  const fidx = Number(fileCard.dataset.fileidx);
  const d = datasets[fidx];
  if (!d || !d.parsedReady) return;

  const q = d.parsed[qidx];
  if (!q || q.kind !== 'fill') return;

  q.blanks = q.blanks || [];
  q.blanks[bidx] = parseFillInputToAnswers(t.value);
});

function collectFromUI(d){
  if (!d || datasets[activeIdx] !== d) return;

  // 选择题
  list.querySelectorAll('input[type=radio],input[type=checkbox]').forEach(inp=>{
    const qidx = Number(inp.dataset.qidx);
    const aidx = Number(inp.dataset.aidx);
    const q = d.parsed[qidx];
    if (!q || q.kind !== 'choice') return;

    if (q.isMulti){
      q.choices[aidx].isCorrect = inp.checked;
    }else if (inp.checked){
      q.choices.forEach((c,i)=> c.isCorrect = (i===aidx));
    }
  });

  // 填空题
  list.querySelectorAll('input[data-kind="fill"]').forEach(inp=>{
    const qidx = Number(inp.dataset.qidx);
    const bidx = Number(inp.dataset.bidx);
    const q = d.parsed[qidx];
    if (!q || q.kind !== 'fill') return;
    q.blanks = q.blanks || [];
    q.blanks[bidx] = parseFillInputToAnswers(inp.value);
  });
}


function extractMatchingQuestionData(blk){
  const rows = Array.from(blk.querySelectorAll('.answer .answer_match'));
  if (!rows.length) return null;

  const pairs = [];
  const pool = [];

  rows.forEach(row => {
    let left = '';
    const leftHtml = row.querySelector('.answer_match_left_html');
    if (leftHtml) left = cleanHTML(leftHtml).trim();
    if (!left){
      const leftText = row.querySelector('.answer_match_left');
      if (leftText) left = cleanHTML(leftText).trim();
    }

    const select = row.querySelector('.answer_match_right select');
    const options = select ? Array.from(select.querySelectorAll('option')) : [];
    const selected =
      (select && select.selectedOptions && select.selectedOptions[0]) ||
      options.find(opt => opt.hasAttribute('selected')) ||
      options[0] ||
      null;

    const right = cleanHTMLString(selected ? (selected.textContent || selected.value || '') : '').trim();

    options.forEach(opt => {
      const t = cleanHTMLString(opt.textContent || opt.value || '').trim();
      if (t) pool.push(t);
    });
    if (right) pool.push(right);

    if (left || right) pairs.push({ left, right });
  });

  if (!pairs.length) return null;
  return { pairs, choicePool: uniqueNonEmptyStrings(pool) };
}

function buildMatchingChoicesForPair(pair, pool){
  const correct = String((pair && pair.right) || '').trim();
  const arr = uniqueNonEmptyStrings([correct, ...(pool || [])]);
  if (correct){
    const idx = arr.indexOf(correct);
    if (idx > 0){
      arr.splice(idx, 1);
      arr.unshift(correct);
    }
  }
  return arr;
}

/* -------------------- 导出 QUESTION_BANK -------------------- */
function buildQuestionBank(data, prefix, sourcePrefix){
  const arr = [];
  data.forEach(q=>{
    normalizeChoiceQuestionShape(q);
    const computedId = `${prefix}-${q.idSuffix || q.num}`;
    const computedSource = `${sourcePrefix} – Q${q.sourceNum || q.num}`;
    const id = q && q.preserveOriginalMeta && q.importedId ? q.importedId : computedId;
    const src = q && q.preserveOriginalMeta && q.importedSource ? q.importedSource : computedSource;
    const qImages = getQuestionImages(q);
    const imgField = qImages.length
      ? (qImages.length===1 ? { image:qImages[0] } : { image:qImages })
      : {};

    const kind = q.kind || 'choice';

    if (kind === 'fill'){
      const blanks = (q.blanks && q.blanks.length) ? q.blanks : [[]];
      const obj = { id, question:q.qtext, blanks, source:src, type:'fill', ...imgField };
      if (q.qhtml) obj.question_html = q.qhtml; // 题干里带输入框的位置（后续 question_bank 用）
      arr.push(obj);
      return;
    }

    if (kind === 'essay'){
      // 忽略问答/主观题：不导出到题库
      return;
    }

    if (kind === 'matching'){
      const pairs = q.pairs || [];
      const pool = getMatchingChoicePool(q);
      pairs.forEach((pair, idx) => {
        const subId = `${id}_m${idx+1}`;
        const subSrc = `${sourcePrefix} – Q${q.num}.${idx+1}`;
        const choices = buildMatchingChoicesForPair(pair, pool);
        const correctText = String((pair && pair.right) || '').trim();
        const answer = choices.findIndex(c => c === correctText);
        arr.push({
          id: subId,
          question: buildMatchingSubQuestionText(q, pair),
          choices,
          answer,
          source: subSrc,
          ...imgField,
        });
      });
      return;
    }

    // 默认：选择题
    const choices = (q.choices || []).map(c=>c.text);

    if (q.isMulti){
      const answers = (q.choices || []).reduce((acc,c,i)=> c.isCorrect ? acc.concat(i) : acc, []);
      if (answers.length === 1){
        arr.push({ id, question:q.qtext, choices, answer:answers[0], source:src, ...imgField });
      }else{
        arr.push({ id, question:q.qtext, choices, answers, source:src, ...imgField });
      }
    }else{
      const answer = (q.choices || []).findIndex(c=>c.isCorrect);
      arr.push({ id, question:q.qtext, choices, answer, source:src, ...imgField });
    }
  });
  return arr;
}

function flattenSourceList(src){
  if (Array.isArray(src)) return src.flatMap(flattenSourceList);
  const s = String(src || '').trim();
  return s ? [s] : [];
}

function normalizeTextForMerge(v){
  return cleanHTMLString(String(v || '')).replace(/\s+/g, ' ').trim();
}

function hashStringForMerge(str){
  const s = String(str || '');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++){
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36) + '_' + s.length;
}

function normalizeImageFingerprints(image){
  const arr = Array.isArray(image) ? image : (image ? [image] : []);
  return arr
    .map(v => String(v || '').trim())
    .filter(Boolean)
    .map(v => hashStringForMerge(v))
    .sort();
}

function getAnswerSignature(item){
  if (Array.isArray(item && item.answers)){
    return item.answers
      .map(v => Number(v))
      .filter(v => Number.isInteger(v) && v >= 0)
      .sort((a,b)=>a-b);
  }
  if (Number.isInteger(item && item.answer) && item.answer >= 0) return [Number(item.answer)];
  return [];
}

function applyAnswerSignature(item, sig){
  const arr = Array.from(new Set((sig || []).filter(v => Number.isInteger(v) && v >= 0))).sort((a,b)=>a-b);
  delete item.answer;
  delete item.answers;
  if (!arr.length) return item;
  if (arr.length === 1) item.answer = arr[0];
  else item.answers = arr;
  return item;
}

function mergeAnswerSignature(baseSig, nextSig){
  const a = Array.from(new Set(baseSig || [])).sort((x,y)=>x-y);
  const b = Array.from(new Set(nextSig || [])).sort((x,y)=>x-y);
  if (!a.length) return b;
  if (!b.length) return a;
  const aSet = new Set(a);
  const bSet = new Set(b);
  const aInB = a.every(v => bSet.has(v));
  const bInA = b.every(v => aSet.has(v));
  if (aInB && !bInA) return b;
  if (bInA) return a;
  if (a.length === b.length && a.every((v,i)=>v===b[i])) return a;
  return a;
}

function makeUniqueQuestionKey(item){
  const type = item && (item.type === 'fill' || Array.isArray(item.blanks))
    ? 'fill'
    : (item && item.type === 'essay')
      ? 'essay'
      : Array.isArray(item && item.answers)
        ? 'multi'
        : 'single';
  const choices = Array.isArray(item && item.choices) ? item.choices.map(normalizeTextForMerge) : [];
  const answerIndexes = getAnswerSignature(item).filter(index => index >= 0 && index < choices.length);
  const answerTexts = answerIndexes.map(index => choices[index]).filter(Boolean).sort();
  const blanks = Array.isArray(item && item.blanks)
    ? item.blanks.map(arr => Array.isArray(arr) ? arr.map(normalizeTextForMerge).filter(Boolean).sort() : [])
    : [];
  return JSON.stringify({
    q: normalizeTextForMerge(item && item.question),
    type,
    choices: type === 'single' || type === 'multi' ? choices.slice().sort() : [],
    answers: type === 'single' || type === 'multi' ? answerTexts : [],
    blanks,
    images: normalizeImageFingerprints(item && item.image),
  });
}

function mergeUniqueQuestionRecord(base, incoming){
  const mergedSources = uniqueNonEmptyStrings([
    ...flattenSourceList(base && base.source),
    ...flattenSourceList(incoming && incoming.source),
  ]);
  base.source = mergedSources;

  if (!base.question_html && incoming && incoming.question_html) base.question_html = incoming.question_html;
  if (!base.image && incoming && incoming.image) base.image = Array.isArray(incoming.image) ? incoming.image.slice() : incoming.image;
  if (!Array.isArray(base.blanks) && Array.isArray(incoming && incoming.blanks)) base.blanks = JSON.parse(JSON.stringify(incoming.blanks));

  const mergedSig = mergeAnswerSignature(getAnswerSignature(base), getAnswerSignature(incoming));
  applyAnswerSignature(base, mergedSig);
  return base;
}

function buildUniqueMergedQuestionBank(){
  const all = [];
  for (const d of datasets){
    if (!d.parsedReady) continue;
    collectFromUI(d);
    all.push(...buildQuestionBank(d.parsed, d.prefix, d.sourcePrefix));
  }

  const seen = new Map();
  const merged = [];
  all.forEach(item => {
    const key = makeUniqueQuestionKey(item);
    if (!seen.has(key)){
      const cloned = JSON.parse(JSON.stringify(item));
      cloned.source = uniqueNonEmptyStrings(flattenSourceList(cloned.source));
      seen.set(key, cloned);
      merged.push(cloned);
      return;
    }
    mergeUniqueQuestionRecord(seen.get(key), item);
  });

  return merged;
}

/* -------------------- 自动从文件名抽取前缀 -------------------- */
function guessMetaFromFilename(name){
  const base = String(name || '').replace(/\.[^.]+$/,'').trim();

  const simpleUnderscoreMatch = base.match(/^(.+?)\s*_\s*([A-Za-z0-9]{1,8})$/);
  if (simpleUnderscoreMatch) {
    const bankPrefix = String(simpleUnderscoreMatch[1] || '').trim();
    const suffixToken = String(simpleUnderscoreMatch[2] || '').trim();
    if (bankPrefix && suffixToken) {
      return {
        prefix: bankPrefix,
        sourcePrefix: `Test_${bankPrefix}_${suffixToken}`
      };
    }
  }

  const left = base.split('_')[0].trim();
  const normalizedLeft = left
    .replace(/[–—]/g, '-')
    .replace(/[_]+/g, ' ')
    .replace(/\s*-\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const courseMatch = base.match(/AMT[&]?\s*(\d{3})/i);
  const courseDigits = courseMatch ? courseMatch[1] : '';
  const courseCode = courseDigits ? `AMT${courseDigits}` : '';

  const word2num = {
    one:1,two:2,three:3,four:4,five:5,
    six:6,seven:7,eight:8,nine:9,ten:10,
    eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,
    sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20
  };
  const numWordsPattern = Object.keys(word2num).join('|');

  const slugify = s => String(s || '')
    .toLowerCase()
    .replace(/&/g,'and')
    .replace(/[^a-z0-9]+/g,'_')
    .replace(/^_+|_+$/g,'')
    .replace(/_+/g,'_');

  const toNum = token => {
    const t = String(token || '').trim().toLowerCase();
    if (!t) return '';
    if (/^\d+$/.test(t)) return String(parseInt(t, 10));
    return word2num[t] ? String(word2num[t]) : '';
  };

  const pickNumber = s => {
    if (!s) return '';
    const m = s.match(new RegExp(`\\b(?:#\\s*)?(\\d+|${numWordsPattern})\\b`, 'i'));
    return m ? toNum(m[1]) : '';
  };

  const pickDay = s => {
    if (!s) return '';
    const m = s.match(new RegExp(`\\b(?:d|day)\\s*[-#]?\\s*(\\d+|${numWordsPattern})\\b`, 'i'));
    const n = m ? toNum(m[1]) : '';
    return n ? `d${n}` : '';
  };

  let typePrefix = 'quiz';
  let typeLabel = 'Quiz';
  let typePattern = /\bquiz\b/i;
  if (/\bhomework\b/i.test(normalizedLeft)) {
    typePrefix = 'hw';
    typeLabel = 'Homework';
    typePattern = /\bhomework\b/i;
  } else if (/\blab\s+quiz\b/i.test(normalizedLeft)) {
    typePrefix = 'labq';
    typeLabel = 'Lab Quiz';
    typePattern = /\blab\s+quiz\b/i;
  } else if (/\blecture\b.*\bquiz\b|\bquiz\b.*\blecture\b/i.test(normalizedLeft)) {
    typePrefix = 'lecq';
    typeLabel = 'Lecture Quiz';
    typePattern = /\blecture\b.*\bquiz\b|\bquiz\b.*\blecture\b/i;
  } else if (/\bpractice\b.*\bquiz\b|\bquiz\b.*\bpractice\b/i.test(normalizedLeft)) {
    typePrefix = 'pquiz';
    typeLabel = 'Practice Quiz';
    typePattern = /\bpractice\b.*\bquiz\b|\bquiz\b.*\bpractice\b/i;
  } else if (/\bassignment\b/i.test(normalizedLeft)) {
    typePrefix = 'ass';
    typeLabel = 'Assignment';
    typePattern = /\bassignment\b/i;
  } else if (/\btest\b/i.test(normalizedLeft)) {
    typePrefix = 'test';
    typeLabel = 'Test';
    typePattern = /\btest\b/i;
  } else if (/\bexam\b/i.test(normalizedLeft)) {
    typePrefix = 'exam';
    typeLabel = 'Exam';
    typePattern = /\bexam\b/i;
  } else if (/\bquiz\b/i.test(normalizedLeft)) {
    typePrefix = 'quiz';
    typeLabel = 'Quiz';
    typePattern = /\bquiz\b/i;
  }

  const dayToken = pickDay(normalizedLeft);
  const noDay = normalizedLeft.replace(new RegExp(`\\b(?:d|day)\\s*[-#]?\\s*(\\d+|${numWordsPattern})\\b`, 'ig'), ' ');
  const numberToken = pickNumber(noDay);

  let sequenceToken = '';
  if (dayToken) sequenceToken = String(dayToken).replace(/^d/i, '');
  else if (numberToken) sequenceToken = numberToken;

  const prefixParts = [typePrefix];
  if (sequenceToken) prefixParts.push(sequenceToken);
  if (courseDigits) prefixParts.push(courseDigits);

  let prefix = prefixParts.filter(Boolean).join('_');
  if (!prefix) prefix = courseDigits ? `bank_${courseDigits}` : 'question_bank';

  let descriptor = normalizedLeft;
  descriptor = descriptor.replace(typePattern, ' ');
  descriptor = descriptor.replace(new RegExp(`\\b(?:d|day)\\s*[-#]?\\s*(\\d+|${numWordsPattern})\\b`, 'ig'), ' ');
  descriptor = descriptor.replace(new RegExp(`\\b(?:#\\s*)?(\\d+|${numWordsPattern})\\b`, 'ig'), ' ');
  descriptor = descriptor.replace(/^[\s\-_:]+|[\s\-_:]+$/g, '');
  descriptor = descriptor.replace(/\s+/g, ' ').trim();

  const sourceBits = [typeLabel];
  if (descriptor) sourceBits.push(descriptor);
  if (sequenceToken) sourceBits.push(`#${sequenceToken}`);
  const sourceLabel = sourceBits.join(' – ').replace(/\s+/g, ' ').trim() || normalizedLeft || 'Question Bank';
  const sourcePrefix = courseCode ? `${courseCode} – ${sourceLabel}` : sourceLabel;

  return { prefix, sourcePrefix };
}

/* -------------------- MHTML 解析（内嵌图片） -------------------- */
function scoreMHTMLHtmlCandidate(html, loc=''){
  const src = String(html || '');
  const where = String(loc || '');
  let score = 0;
  if (/display_question\s+question/i.test(src)) score += 10000;
  if (/question_text|original_question_text|question_name/i.test(src)) score += 6000;
  if (/assessment_results|id=["']questions["']/i.test(src)) score += 4000;
  if (/quiz-submission|quiz_sortable|question_holder/i.test(src)) score += 2500;
  if (/Question\s+1/i.test(src)) score += 1200;
  if (/\/quizzes\/|headless=1/i.test(where)) score += 1500;
  score += Math.min(src.length, 200000) / 1000;
  return score;
}

function parseMHTML(text){
  const firstHeaderEnd = text.indexOf('\r\n\r\n') >= 0 ? text.indexOf('\r\n\r\n') : text.indexOf('\n\n');
  if (firstHeaderEnd < 0) return { html:'', htmlParts:[], cidMap:{} };
  const head = text.slice(0, firstHeaderEnd + 2);
  const m = head.match(/boundary="?([^"\r\n]+)"?/i);
  if(!m) return { html:'', htmlParts:[], cidMap:{} };

  const boundary = m[1];
  const sep = '--' + boundary;
  const parts = text.split(sep).slice(1).filter(p => !p.startsWith('--'));

  const cidMap = {};
  const htmlParts = [];
  let html = '';
  let bestHtmlScore = -Infinity;

  for (let raw of parts){
    raw = raw.replace(/^\s+|\s+$/g,'').replace(/--\s*$/,'').trim();
    const split = raw.search(/\r?\n\r?\n/);
    if (split < 0) continue;

    const headerText = raw.slice(0, split);
    const bodyText   = raw.slice(split).replace(/^\r?\n/,'');

    const h = parseHeaders(headerText);
    const ctype = (h['content-type']||'').toLowerCase();
    const enc   = (h['content-transfer-encoding']||'').toLowerCase();
    const cid   = (h['content-id']||'').replace(/[<>]/g,'').trim();
    const loc   = (h['content-location']||'').trim();

    let bytes;
    if (enc.includes('base64')){
      const b64 = bodyText.replace(/\s+/g,'');
      bytes = base64ToBytes(b64);
    }else if (enc.includes('quoted-printable')){
      bytes = qpToBytes(bodyText);
    }else{
      bytes = strToBytes(bodyText);
    }

    if (ctype.startsWith('text/html')){
      const htmlDecoded = bytesToUTF8(bytes);
      if (htmlDecoded) {
        htmlParts.push(htmlDecoded);
        const score = scoreMHTMLHtmlCandidate(htmlDecoded, loc);
        if (score > bestHtmlScore) {
          bestHtmlScore = score;
          html = htmlDecoded;
        }
      }
    }else if (ctype.startsWith('image/') || ctype.startsWith('application/')){
      const b64 = bytesToBase64(bytes);
      const dataURL = `data:${ctype};base64,${b64}`;
      if (cid) cidMap['cid:'+cid] = dataURL;
      if (loc) cidMap[loc] = dataURL;
    }
  }
  return { html, htmlParts, cidMap };
}
function parseHeaders(h){
  const out = {};
  h.split(/\r?\n/).forEach(line=>{
    const m=line.match(/^([\w\-]+):\s*(.*)$/);
    if (m) out[m[1].toLowerCase()]=m[2];
  });
  return out;
}
function base64ToBytes(b64){const bin=atob(b64);const len=bin.length;const bytes=new Uint8Array(len);for(let i=0;i<len;i++)bytes[i]=bin.charCodeAt(i)&0xff;return bytes;}
function bytesToBase64(bytes){let bin='';for(let i=0;i<bytes.length;i++)bin+=String.fromCharCode(bytes[i]);return btoa(bin);}
function qpToBytes(qp){qp=qp.replace(/=\r?\n/g,'');const out=[];for(let i=0;i<qp.length;i++){if(qp[i]==='='&&/^[0-9A-Fa-f]{2}$/.test(qp.substr(i+1,2))){out.push(parseInt(qp.substr(i+1,2),16));i+=2;}else{out.push(qp.charCodeAt(i)&0xff);}}return new Uint8Array(out);}
function strToBytes(str){const arr=new Uint8Array(str.length);for(let i=0;i<str.length;i++)arr[i]=str.charCodeAt(i)&0xff;return arr;}
function bytesToUTF8(bytes){try{return new TextDecoder('utf-8').decode(bytes);}catch{ return String.fromCharCode.apply(null, bytes);} }

function rewriteSources(html, map){
  return html.replace(/(<img[^>]+src=["'])([^"']+)(["'][^>]*>)/gi,(m,p1,src,p3)=>{
    const key=(src||'').replace(/&amp;/g,'&');
    if(map[key]) return p1+map[key]+p3;
    if(key.startsWith('cid:') && map[key]) return p1+map[key]+p3;
    if(key.startsWith('cid:') && map[key.slice(4)]) return p1+map[key.slice(4)]+p3;
    return m;
  });
}

function parseQuestionScore(blk){
  const holder = blk.querySelector('.user_points');
  if (!holder) return null;
  const txt = cleanHTML(holder).replace(/pts?\b/gi, '').trim();
  const m = txt.match(/(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)/);
  if (!m) return null;
  const earned = Number(m[1]);
  const possible = Number(m[2]);
  if (!Number.isFinite(earned) || !Number.isFinite(possible)) return null;
  return { earned, possible };
}

function hasFullCredit(scoreInfo){
  return !!(scoreInfo && Number.isFinite(scoreInfo.earned) && Number.isFinite(scoreInfo.possible) && scoreInfo.possible > 0 && Math.abs(scoreInfo.earned - scoreInfo.possible) < 1e-9);
}

function hasAnyBlankAnswers(blanks){
  if (!Array.isArray(blanks) || !blanks.length) return false;
  return blanks.some(arr => Array.isArray(arr) && arr.some(v => String(v || '').trim()));
}

function extractSelectedChoiceInfo(li){
  const cls = li.className || '';
  const input = li.querySelector('input[type="radio"],input[type="checkbox"]');
  const titleStr = li.getAttribute('title') || '';
  return /\bselected_answer\b/i.test(cls) || !!(input && input.checked) || /\byou selected this answer\b/i.test(titleStr);
}

/* -------------------- Canvas HTML 解析（灰箭头=正确） -------------------- */
function parseCanvasHTML(html){
  const dom = new DOMParser().parseFromString(html,'text/html');
  const blocks = dom.querySelectorAll('.display_question.question');
  const tmp = [];

  blocks.forEach((blk, idx)=>{
    const nameEl = blk.querySelector('.question_name');
    const scoreInfo = parseQuestionScore(blk);
    const numStr = nameEl ? (nameEl.textContent.match(/\d+/)||[])[0] : (idx+1);
    const num = Number(numStr);

    let qtext = '';
    const visibleText = blk.querySelector('.question_text.user_content') || blk.querySelector('.question_text');
    if (visibleText) qtext = cleanHTML(visibleText).trim();
    if (!qtext){
      const ta = blk.querySelector('.original_question_text textarea');
      if (ta) qtext = cleanHTMLString(ta.value || ta.textContent || '').trim();
    }

    const rawImageSources = Array.from(blk.querySelectorAll('.question_text img, .text img'))
      .map(img=>(img.getAttribute('src')||'').trim())
      .filter(s=>{
        if (!s) return false;
        if (/^(javascript:|about:blank)/i.test(s)) return false;
        return true;
      });
    const images = rawImageSources.filter(s => /^(data:image\/|data:application\/)/i.test(s));
    const missingImageSources = rawImageSources.filter(s => !/^(data:image\/|data:application\/)/i.test(s));
    const expectedImageCount = rawImageSources.length;
    const missingImageCount = missingImageSources.length;

    const clsAll = blk.className || '';

    // -------- 选择题：带 answer 类且含 radio/checkbox --------
    const rawItems = Array.from(blk.querySelectorAll('li,div')).filter(el=>{
      const cls = el.className || '';
      if (!/\banswer\b/i.test(cls)) return false;
      return !!el.querySelector('input[type="radio"],input[type="checkbox"]');
    });

    if (rawItems.length){
      const isMulti =
        /\bmultiple_answers_question\b/i.test(clsAll) ||
        rawItems.some(li => !!li.querySelector('input[type="checkbox"]'));

      const choices = rawItems.map(li=>{
        let txt = '';
        const at = li.querySelector('.answer_text');
        if (at) txt = cleanHTML(at).trim();
        if (!txt) txt = cleanHTML(li).trim();

        const cls = li.className || '';
        const hasCorrectClass = /\bcorrect\b/i.test(cls) || /\bcorrect_answer\b/i.test(cls);

        const icon = li.querySelector('[class*="icon-"], .ic-Icon, svg, [data-icon], [data-testid]');
        let iconStr = '';
        if (icon){
          iconStr = [
            icon.className || '',
            icon.getAttribute && (icon.getAttribute('aria-label')||''),
            icon.getAttribute && (icon.getAttribute('title')||''),
            icon.getAttribute && (icon.getAttribute('data-icon')||''),
            icon.getAttribute && (icon.getAttribute('data-testid')||''),
            icon.getAttribute && (icon.getAttribute('name')||''),
          ].join(' ');
        }

        const iconCorrect =
          /correct|check|right|arrow|success/i.test(iconStr) &&
          !/wrong|error|incorrect|cross|x_icon|x(?![a-z])/i.test(iconStr);

        // NOTE: do NOT treat option text containing the word "correct" as correctness signal
        // (e.g. choice text itself may include "correct", which caused false positives).
        const titleStr = li.getAttribute('title') || '';
        const hintCorrect =
          /\b(correct|正确)\b/i.test(li.getAttribute('aria-label')||'') ||
          !!li.querySelector(
            '.answer_arrow.correct, .answer_indicator.correct,' +
            ' .answer_arrow[aria-label*="Correct"], .answer_arrow[aria-label*="正确"],' +
            ' .answer_indicator[aria-label*="Correct"], .answer_indicator[aria-label*="正确"]'
          ) ||
          /(this was the correct answer|was the correct answer|正确答案)/i.test(titleStr);

        const isCorrect = !!(hasCorrectClass || iconCorrect || hintCorrect);
        const isSelected = extractSelectedChoiceInfo(li);

        return { text: txt, isCorrect, isSelected };
      });

      let answerDerivedFromScore = false;
      let answerDerivedFromCanvasCorrectBlock = false;
      const selectedIndexes = choices.map((c,i)=> c.isSelected ? i : -1).filter(i => i >= 0);
      const explicitCorrectIndexes = choices.map((c,i)=> c.isCorrect ? i : -1).filter(i => i >= 0);
      if (hasFullCredit(scoreInfo)) {
        const sameAnswerSet =
          selectedIndexes.length === explicitCorrectIndexes.length &&
          selectedIndexes.every((idx, pos) => idx === explicitCorrectIndexes[pos]);

        // 特殊类型：页面可能显示红叉/灰箭头，但题目实际拿满分。
        // 这时应以“你原本勾选的选项”为准，并覆盖页面展示出来的灰箭头正确项。
        if (selectedIndexes.length && !sameAnswerSet) {
          answerDerivedFromScore = true;
          if (isMulti){
            choices.forEach((c,i)=>{ c.isCorrect = selectedIndexes.includes(i); });
          }else{
            choices.forEach((c,i)=> c.isCorrect = (i === selectedIndexes[0]));
          }
        } else if (!explicitCorrectIndexes.length && selectedIndexes.length) {
          answerDerivedFromScore = true;
          if (isMulti){
            choices.forEach((c,i)=>{ c.isCorrect = selectedIndexes.includes(i); });
          }else{
            choices.forEach((c,i)=> c.isCorrect = (i === selectedIndexes[0]));
          }
        }
      } else if (shouldUseSelectedAnswersAsCorrectFallback({ clsAll, explicitCorrectIndexes, selectedIndexes })) {
        answerDerivedFromCanvasCorrectBlock = true;
        if (isMulti){
          choices.forEach((c,i)=>{ c.isCorrect = selectedIndexes.includes(i); });
        }else{
          choices.forEach((c,i)=> c.isCorrect = (i === selectedIndexes[0]));
        }
      }

      choices.forEach(c=>{ delete c.isSelected; });
      tmp.push({ num, qtext, images, uploadedImages: [], expectedImageCount, missingImageCount, missingImageSources, kind:'choice', isMulti, choices, scoreInfo, answerDerivedFromScore, answerDerivedFromCanvasCorrectBlock });
      return;
    }


    // -------- 配对题：matching_question -> 每个左侧子项后续导出为 1 道单选题 --------
    const isMatching = /matching_question/i.test(clsAll);
    if (isMatching){
      const matchData = extractMatchingQuestionData(blk);
      if (matchData && matchData.pairs && matchData.pairs.length){
        tmp.push({
          num,
          qtext,
          images,
          uploadedImages: [],
          expectedImageCount,
          missingImageCount,
          missingImageSources,
          kind:'matching',
          pairs: matchData.pairs,
          choicePool: matchData.choicePool,
          scoreInfo,
        });
        return;
      }
    }

    // -------- 填空题：short_answer / fill_in / numerical / fill_in_multiple_blanks --------
    const isFill =
      /short_answer_question|fill_in.*question|numerical_question/i.test(clsAll);

    if (isFill){
      // 优先处理“多空题 Answer 1/2/3...”这种结构（每空可能有多个可接受答案）
      const groupBlanks = extractFillBlanksFromAnswerGroups(blk);
      let blanks = (groupBlanks && groupBlanks.length)
        ? groupBlanks
        : normalizeBlankSets(extractTextAnswerSets(blk));

      let answerDerivedFromScore = false;
      if (!hasAnyBlankAnswers(blanks) && hasFullCredit(scoreInfo)) {
        const selectedBlanks = extractSelectedFillAnswers(blk);
        if (hasAnyBlankAnswers(selectedBlanks)) {
          blanks = selectedBlanks;
          answerDerivedFromScore = true;
        }
      }

      // 生成可用于题库做题的「带空格输入框」HTML（后续 question_bank 用）
      const qhtml = buildFillQuestionHTML(blk, blanks.length);

      tmp.push({ num, qtext, images, uploadedImages: [], expectedImageCount, missingImageCount, missingImageSources, kind:'fill', blanks, qhtml, scoreInfo, answerDerivedFromScore });
      return;
    }

    // -------- 问答题（无标准答案）--------
    const isEssay = /essay_question/i.test(clsAll);
    if (isEssay){
      // 这类主观题直接忽略，不进入预览与导出
      return;
    }

    tmp.push({ num, qtext, images, uploadedImages: [], expectedImageCount, missingImageCount, missingImageSources, kind:'unknown', scoreInfo });
  });

  const byNum = new Map();
  const score = (q) => {
    const base =
      q.kind === 'choice'
        ? (q.choices?.length||0)
        : q.kind === 'fill'
          ? (q.blanks?.reduce((s,b)=>s+(b?.length||0),0) || 0)
          : q.kind === 'matching'
            ? (q.pairs?.length || 0)
            : 0;
    return base + getQuestionImages(q).length;
  };

  for (const q of tmp){
    const old = byNum.get(q.num);
    if (!old) byNum.set(q.num, q);
    else if (score(q) > score(old)) byNum.set(q.num, q);
  }

  return Array.from(byNum.values()).sort((a,b)=>a.num-b.num);
}

function extractSelectedFillBlanksFromAnswerGroups(blk){
  const groups = Array.from(blk.querySelectorAll('.answers .answer_group'));
  if (!groups.length) return null;

  const hasHeading = groups.some(g => !!g.querySelector('.answer-group-heading'));
  if (!hasHeading) return null;

  const blanks = [];
  groups.forEach(g=>{
    const set = new Set();

    g.querySelectorAll('.answer.selected_answer .answer_type.short_answer input[name="answer_text"], .answer.selected_answer .answer_type.short_answer textarea[name="answer_text"]').forEach(el=>{
      const v = (el.value || el.getAttribute('value') || '').trim();
      if (v) set.add(v);
    });

    g.querySelectorAll('.answer.selected_answer .select_answer .answer_text, .answer.selected_answer .answer_text').forEach(el=>{
      const t = cleanAnswerText(el);
      if (t) set.add(t);
    });

    blanks.push(Array.from(set));
  });

  return blanks;
}

function extractSelectedTextAnswerSets(blk){
  const nodes = Array.from(blk.querySelectorAll('.answers .answer.selected_answer'));
  const sets = [];

  nodes.forEach(node=>{
    const vals = [];
    node.querySelectorAll('input[type="text"], textarea').forEach(el=>{
      const v = (el.value || el.getAttribute('value') || el.textContent || '').trim();
      if (!v) return;
      if (!vals.includes(v)) vals.push(v);
    });

    if (!vals.length){
      const txts = Array.from(node.querySelectorAll('.answer_text, .answer_html'))
        .map(el=>cleanHTML(el).trim())
        .filter(Boolean);
      if (txts.length) vals.push(txts[0]);
    }

    if (vals.length) sets.push(vals);
  });

  const seen = new Set();
  const out = [];
  for (const s of sets){
    const key = s.join('||');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

function extractSelectedFillAnswers(blk){
  const groupBlanks = extractSelectedFillBlanksFromAnswerGroups(blk);
  if (groupBlanks && groupBlanks.length) return groupBlanks;
  return normalizeBlankSets(extractSelectedTextAnswerSets(blk));
}

// 多空填空题（Answer 1/2/3...）抽取：每个空独立收集可接受答案（含“灰箭头”给的替代答案）
function extractFillBlanksFromAnswerGroups(blk){
  const groups = Array.from(blk.querySelectorAll('.answers .answer_group'));
  if (!groups.length) return null;

  // 只有存在 Answer 1/2/... heading 才认为是“多空题分组结构”
  const hasHeading = groups.some(g => !!g.querySelector('.answer-group-heading'));
  if (!hasHeading) return null;

  const blanks = [];
  groups.forEach(g=>{
    const set = new Set();

    // 1) Canvas 给出的 canonical correct（灰箭头）——只抓 answer_text
    g.querySelectorAll('.answer.correct_answer .select_answer .answer_text').forEach(el=>{
      const t = cleanAnswerText(el);
      if (t) set.add(t);
    });

    // 2) 有些页面正确值在 input/textarea value 里
    g.querySelectorAll('.answer.correct_answer .answer_type.short_answer input[name="answer_text"], .answer.correct_answer .answer_type.short_answer textarea[name="answer_text"]').forEach(el=>{
      const v = (el.value || el.getAttribute('value') || '').trim();
      if (v) set.add(v);
    });

    // 3) 如果“你填写的答案”本身也判对（绿色✅），也作为可接受答案（排除 answer_for_* 元数据容器）
    g.querySelectorAll('.answer.selected_answer.correct_answer .select_answer .answer_text, .answer.selected_answer.correct_answer .answer_text').forEach(el=>{
      const t = cleanAnswerText(el);
      if (t) set.add(t);
    });

    blanks.push(Array.from(set));
  });

  return blanks;
}

// 清洗答案文本：去掉 icon / hidden / screenreader-only / arrow 等，只保留可见文字
function cleanAnswerText(el){
  if (!el) return '';
  const clone = el.cloneNode(true);
  clone.querySelectorAll('.hidden,.screenreader-only,span.hidden,span.id,.id,.answer_arrow,[class*="icon-"],svg,i').forEach(n=>n.remove());
  return (clone.textContent || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// 生成“题干里带输入框”的 HTML：把 Canvas 原来的 input（含正确答案 value）替换成空白输入框
// 这个字段会导出为 question_html，之后更新 question_bank 用它把输入框放在正确位置
function buildFillQuestionHTML(blk, expectedBlankCount){
  const qt = blk.querySelector('.question_text.user_content') || blk.querySelector('.question_text');
  if (!qt) return '';

  const clone = qt.cloneNode(true);
  clone.querySelectorAll('script,style,button,a,.links,.move,.regrade_option').forEach(n=>n.remove());

  // 1) 如果题干里本身就有 input/textarea（少见，但存在），直接替换成 qb-blank
  let i = 1;
  const rawInputs = Array.from(clone.querySelectorAll('input.question_input, input[type="text"], textarea'));
  rawInputs.forEach(inp=>{
    const el = document.createElement('input');
    el.type = 'text';
    el.className = 'qb-blank';
    el.setAttribute('data-blank', String(i));
    el.setAttribute('autocomplete', 'off');
    el.setAttribute('spellcheck', 'false');
    el.setAttribute('placeholder', '_____');
    el.value = '';
    inp.replaceWith(el);
    i++;
  });

  // 2) 题干里没有 input 的场景：用“_____/---”占位替换成 qb-blank（典型：单空短答题）
  if (!rawInputs.length && expectedBlankCount && expectedBlankCount > 0){
    const placeholderRe = /_{3,}|\[\s*\]|\(\s*\)|[‐‑‒–—―-]{3,}/; // 3+ underscores or long dashes
    let inserted = 0;

    const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT, null);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);

    for (const tn of textNodes){
      if (inserted >= expectedBlankCount) break;
      const original = tn.textContent || '';
      if (!placeholderRe.test(original)) continue;

      // 逐段拆分：每次只替换一个占位，剩余部分再作为新的 text node 继续处理（while 循环）
      let rest = original;
      const frag = document.createDocumentFragment();

      while (inserted < expectedBlankCount){
        const m = rest.match(placeholderRe);
        if (!m) break;
        const idx = rest.search(placeholderRe);
        if (idx > 0) frag.appendChild(document.createTextNode(rest.slice(0, idx)));

        const el = document.createElement('input');
        el.type = 'text';
        el.className = 'qb-blank';
        el.setAttribute('data-blank', String(inserted + 1));
        el.setAttribute('autocomplete', 'off');
        el.setAttribute('spellcheck', 'false');
        el.setAttribute('placeholder', '_____');
        el.value = '';
        frag.appendChild(el);

        rest = rest.slice(idx + m[0].length);
        inserted += 1;
      }

      if (rest) frag.appendChild(document.createTextNode(rest));
      tn.parentNode.replaceChild(frag, tn);
    }

    // 3) 如果题干里没有足够占位，则把剩余空补到末尾（不中断流程）
    if (inserted < expectedBlankCount){
      const p = document.createElement('p');
      p.textContent = ' ';
      for (let k=inserted+1;k<=expectedBlankCount;k++){
        const el = document.createElement('input');
        el.type = 'text';
        el.className = 'qb-blank';
        el.setAttribute('data-blank', String(k));
        el.setAttribute('placeholder', '_____');
        el.value = '';
        p.appendChild(el);
        p.appendChild(document.createTextNode(' '));
      }
      clone.appendChild(p);
    }
  }

  return clone.innerHTML;
}

// 从 Canvas 回顾页抽取填空题的正确答案（兼容 multiple blanks）
function extractTextAnswerSets(blk){
  // 优先：正确答案区域
  const nodes = Array.from(blk.querySelectorAll('.answers .answer.correct_answer'));
  const sets = [];

  nodes.forEach(node=>{
    const vals = [];
    node.querySelectorAll('input[type="text"], textarea').forEach(el=>{
      const v = (el.value || el.getAttribute('value') || el.textContent || '').trim();
      if (!v) return;
      if (!vals.includes(v)) vals.push(v);
    });
    if (vals.length) sets.push(vals);
  });

  // 兜底：部分页面可能没有 input/textarea，而是纯文本
  if (!sets.length){
    const txts = Array.from(blk.querySelectorAll('.answers .answer.correct_answer .answer_text, .answers .answer.correct_answer .answer_html'))
      .map(el=>cleanHTML(el).trim())
      .filter(Boolean);
    if (txts.length) sets.push([txts[0]]);
  }

  // 去重（按整组）
  const seen = new Set();
  const out = [];
  for (const s of sets){
    const key = s.join('||');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

// 把「每一组可接受答案」归并成「每一空的可接受答案集合」：blanks[blankIndex] = [a,b,c...]
function normalizeBlankSets(sets){
  const max = Math.max(0, ...sets.map(s=>s.length));
  if (!max) return [];
  const blanks = Array.from({length:max}, ()=>[]);
  sets.forEach(s=>{
    for (let i=0;i<max;i++){
      const v = (s[i]||'').trim();
      if (!v) continue;
      if (!blanks[i].includes(v)) blanks[i].push(v);
    }
  });
  return blanks;
}

function parseFillInputToAnswers(str){
  const parts = (str||'').split('|').map(s=>s.trim()).filter(Boolean);
  return Array.from(new Set(parts));
}

function cleanHTML(el){
  const clone = el.cloneNode(true);
  clone.querySelectorAll('script,style,button,.links,.move,.regrade_option').forEach(n=>n.remove());
  return (clone.textContent||'')
    .replace(/\s+\n/g,'\n')
    .replace(/\u00a0/g,' ')
    .replace(/[ \t]{2,}/g,' ')
    .trim();
}
function cleanHTMLString(s){
  const tmp=document.createElement('div');
  tmp.innerHTML=s;
  return cleanHTML(tmp);
}

function sanitizeDisplayHref(raw){
  const s = String(raw || '').trim();
  if (!s) return '';
  if (/^javascript:/i.test(s)) return '';
  return s;
}

function buildImportImageUrlCandidates(raw){
  const href = sanitizeDisplayHref(raw);
  if (!href) return [];
  const out = [];
  const push = (u) => {
    const s = sanitizeDisplayHref(u);
    if (!s) return;
    if (!out.includes(s)) out.push(s);
  };
  push(href);
  try{
    const u = new URL(href, location.href);
    const path = u.pathname || '';
    const isCanvasLike = /(?:^|\.)instructure\.com$/i.test(u.hostname) || /\/files\/\d+\//.test(path);
    if (isCanvasLike){
      const mScopedPreview = path.match(/^(.*\/files\/\d+)\/preview\/?$/i);
      if (mScopedPreview){
        const scoped = new URL(u.href);
        scoped.pathname = `${mScopedPreview[1]}/download`;
        if (!scoped.searchParams.has('download_frd')) scoped.searchParams.set('download_frd', '1');
        push(scoped.toString());
      }
      const mAnyFile = path.match(/\/files\/(\d+)(?:\/(preview|download))?\/?$/i);
      if (mAnyFile){
        const fileId = mAnyFile[1];
        const direct = new URL(u.origin + `/files/${fileId}/download`);
        if (u.searchParams.has('verifier')) direct.searchParams.set('verifier', u.searchParams.get('verifier'));
        direct.searchParams.set('download_frd', '1');
        push(direct.toString());
      }
      if (/\/preview\/?$/i.test(path)){
        const alt = new URL(u.href);
        alt.pathname = alt.pathname.replace(/\/preview\/?$/i, '/download');
        if (!alt.searchParams.has('download_frd')) alt.searchParams.set('download_frd', '1');
        push(alt.toString());
      }
    }
  }catch(_e){}
  return out;
}

function renderMissingImageSourceLinks(sources, qIndex){
  const arr = Array.isArray(sources) ? sources.filter(Boolean) : [];
  if (!arr.length) return '';
  const items = arr.map(src => {
    const text = escapeHTML(src);
    const href = sanitizeDisplayHref(src);
    return href
      ? `<div><a href="${escapeHTML(href)}" data-act="import-missing-image" data-qidx="${qIndex}" data-src="${escapeHTML(href)}" title="点击后优先尝试直接导入到当前题目；Canvas 的 /preview 链接会自动改写成可抓取的 /download 链接；若目标站点仍禁止脚本读取，则不会再自动打开下载链接，请改用下方上传框导入刚下载的图片">${text}</a></div>`
      : `<div>${text}</div>`;
  }).join('');
  return `<details style="margin-top:6px"><summary class="meta">查看缺失图片来源</summary><div class="meta" style="margin-top:6px;word-break:break-all">${items}</div></details>`;
}

function escapeHTML(s){
  return (s||'').replace(/[&<>"']/g,m=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[m]));
}

/* -------------------- 拖拽调整宽度逻辑 -------------------- */
(function(){
  const split = document.querySelector('.split');
  const resizer = document.getElementById('dragHandle');
  let isResizing = false;

  if(!split || !resizer) return;

  resizer.addEventListener('mousedown', (e) => {
    isResizing = true;
    resizer.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const splitRect = split.getBoundingClientRect();
    let newWidth = e.clientX - splitRect.left;
    if (newWidth < 300) newWidth = 300;
    if (newWidth > 800) newWidth = 800;
    split.style.setProperty('--lw', newWidth + 'px');
  });

  document.addEventListener('mouseup', () => {
    if(isResizing){
      isResizing = false;
      resizer.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  });
})();






appContext = {
  get datasets() { return datasets; },
  get activeIdx() { return activeIdx; },
  set activeIdx(value) { activeIdx = value; },
  get list() { return list; },
  get fileTableBody() { return fileTableBody; },
  get out() { return out; },
  get datasetKey() { return datasetKey; },
  set datasetKey(value) { datasetKey = value; },
  get parseOne() { return parseOne; },
  set parseOne(value) { parseOne = value; },
  get renderQuestions() { return renderQuestions; },
  set renderQuestions(value) { renderQuestions = value; },
  get updateActiveUI() { return updateActiveUI; },
  set updateActiveUI(value) { updateActiveUI = value; },
  get renderFileTable() { return renderFileTable; },
  set renderFileTable(value) { renderFileTable = value; },
  upsertDatasets,
  updateExportButtons,
  setTopStatus,
  guessMetaFromFilename,
  escapeHTML,
};

if (typeof window !== 'undefined') {
  window.__QB_EXTRACTOR_READY__ = true;
}
}
