import { initAiMCQFeature } from './features/ai-mcq.js';
import { slugifyBankId } from '../lib/site-package.js';
import {
  buildPublishMeta as buildPublishMetaHelper,
  canGenerateQuestionBank as canGenerateQuestionBankHelper,
  getPublishButtonState as getPublishButtonStateHelper,
  guessPublishDefaults as guessPublishDefaultsHelper,
} from '../lib/publish-settings.js';
import { buildLegacyQuestionBankHtml } from '../services/site-package-export.js';
import { shouldUseSelectedAnswersAsCorrectFallback } from '../lib/canvas-answer-fallback.js';
import { parseMHTML, rewriteSources, parseCanvasHTML } from '../lib/canvas-extract.js';
import {
  applyAiAnswerSuggestion,
  buildDeepSeekAnswerFillPayload,
  callDeepSeekAnswerFill,
  parseDeepSeekAnswerFillResponse,
  questionCanUseAiAnswer,
} from './features/ai-answer-fill-logic.js';

// Shared, unit-tested core (single source of truth — see src/lib/testable-core.js).
// These were previously duplicated inline below; consolidated here to avoid drift.
import {
  tryParseJSONArray, extractBracketedJSONArray, extractQuestionBankArrayFromText,
  makeSafeJSONForScript, injectQuestionBankJSON, downloadTextAsFile, safeJSONStringForScript,
  countCorrectChoiceAnswers, normalizeChoiceQuestionShape, uniqueNonEmptyStrings,
  getQuestionImages, getMatchingChoicePool, buildMatchingSubQuestionText, buildMatchingChoicesForPair,
  buildQuestionBank, flattenSourceList, normalizeTextForMerge, hashStringForMerge,
  normalizeImageFingerprints, getAnswerSignature, applyAnswerSignature, mergeAnswerSignature,
  makeUniqueQuestionKey, mergeUniqueQuestionRecord, guessMetaFromFilename,
  validateQuestionBankRecords,
  extractIdPrefix, extractIdSuffix, extractSourcePrefix, extractSourceNum,
  normalizeImportedImageList, convertQuestionBankItemToParsed,
  parseHeaders, base64ToBytes, bytesToBase64, qpToBytes, strToBytes, bytesToUTF8,
  parseFillInputToAnswers, cleanHTML, cleanHTMLString,
  buildUniqueMergedQuestionBankFromCollections,
} from '../lib/testable-core.js';

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
const genLegacyQBankBtn = $('#genLegacyQBankBtn');
const publishSiteBtn = $('#publishSiteBtn');
const publishTargetSel = $('#publishTargetSel');
const publishSiteStatusEl = $('#publishSiteStatus');
let publishBridgeAvailable = false; // dev server 本地发布接口是否可用（build/preview 模式下没有）
let publishInFlight = false;
const siteBanksListEl = $('#siteBanksList');
const siteBanksHintEl = $('#siteBanksHint');
const siteBanksOpStatusEl = $('#siteBanksOpStatus');
const siteBanksRefreshBtn = $('#siteBanksRefreshBtn');
const siteDeployTargetSel = $('#siteDeployTargetSel');
const siteDeployBtn = $('#siteDeployBtn');
let lastSiteManifest = [];
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






function guessQBankMeta(arr, fallbackName){
  const guess = guessMetaFromFilename(fallbackName || '');
  const prefix = mostCommonNonEmpty((arr || []).map(x => extractIdPrefix(x && x.id))) || guess.prefix;
  const sourcePrefix = mostCommonNonEmpty((arr || []).map(x => extractSourcePrefix(x && x.source))) || guess.sourcePrefix;
  return { prefix, sourcePrefix };
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
  outDownloadName = 'question_bank_all.json';
  out.dispatchEvent(new Event('input'));
});

exportUniqueBtn.addEventListener('click', () => {
  const merged = buildUniqueMergedQuestionBank();
  out.value = JSON.stringify(merged, null, 2);
  outDownloadName = 'question_bank_merged.json';
  out.dispatchEvent(new Event('input'));
});

downloadOutJsonBtn && downloadOutJsonBtn.addEventListener('click', downloadOutAsJSON);

// 站点发布包（.zip，多文件 SPA）已随方案乙退役：做题站 = build-pages 目录页 + 单文件播放器。
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
      bankId: publishMeta.id,
    });
    const defaults = guessPublishDefaults(arr);
    const fname = buildLegacyExportFilename(defaults.bankId);
    downloadTextAsFile(html, fname, 'text/html;charset=utf-8');
    statusEl.textContent = `已导出做题单 HTML：${fname}（${arr.length} 题，${publishMeta.mode === 'protected' ? '密码保护' : '公开'}）${exportRejectionSuffix()}`;
  }catch(e){
    console.error(e);
    alert('导出做题单 HTML 失败：' + (e && e.message ? e.message : String(e)));
  }
});

/* ---- 「发布到站点」：输出框 JSON 直接写入仓库 + 可选部署 ----
   浏览器写不了文件、跑不了 wrangler，由 dev server 的 /api/local/publish-bank 代办
   （与发布双击命令共用 publish-bank-core，仅 extractor.command / npm run dev 模式可用）。 */
function setPublishSiteStatus(text, isError){
  if (!publishSiteStatusEl) return;
  publishSiteStatusEl.textContent = text || '';
  publishSiteStatusEl.style.color = isError ? '#b91c1c' : '';
}

(async function probePublishBridge(){
  try{
    const res = await fetch('/api/local/publish-bank', { method: 'GET' });
    publishBridgeAvailable = !!res.ok;
  }catch(_e){
    publishBridgeAvailable = false;
  }
  if (!publishBridgeAvailable) setPublishSiteStatus('直接发布需要通过 commands/extractor.command（dev 模式）打开提取器。');
  updateExportButtons();
  refreshSiteBanks();
})();

/* ---- 站点题库管理面板：列表 / 下架·恢复 / 删除 / 公开⇄加密 / 部署 ----
   全部走 /api/local/bank-admin（与双击命令共用 publish-bank-core）。 */
function setSiteBanksOpStatus(text, isError){
  if (!siteBanksOpStatusEl) return;
  siteBanksOpStatusEl.textContent = text || '';
  siteBanksOpStatusEl.style.color = isError ? '#b91c1c' : '';
}

function renderSiteBanksList(manifest){
  if (!siteBanksListEl) return;
  lastSiteManifest = Array.isArray(manifest) ? manifest : [];
  if (!publishBridgeAvailable){
    if (siteBanksHintEl) siteBanksHintEl.textContent = '需要通过 commands/extractor.command（dev 模式）打开才能管理站点题库。';
    siteBanksListEl.innerHTML = '';
    return;
  }
  if (siteBanksHintEl) siteBanksHintEl.textContent = '';
  siteBanksListEl.innerHTML = lastSiteManifest.map(e => {
    const online = e.deploy !== false;
    return `<div class="row" style="gap:8px;align-items:center;flex-wrap:wrap;border-top:1px solid var(--border,#e5e7eb);padding:7px 0" data-bank-row="${escapeHTML(e.id)}">
      <strong style="min-width:150px">${e.mode === 'protected' ? '🔒 ' : ''}${escapeHTML(e.title || e.id)}</strong>
      <span class="meta">${escapeHTML(e.id)} · ${e.question_count ?? '?'} 题 · ${e.mode === 'protected' ? '加密' : '公开'} · ${online ? '在线' : '已下架'}</span>
      <span style="flex:1"></span>
      <button class="btn" data-bank-act="up" data-bank-id="${escapeHTML(e.id)}" title="目录页顺序上移" data-testid="bank-up-btn">↑</button>
      <button class="btn" data-bank-act="down" data-bank-id="${escapeHTML(e.id)}" title="目录页顺序下移" data-testid="bank-down-btn">↓</button>
      <button class="btn" data-bank-act="${online ? 'unlist' : 'restore'}" data-bank-id="${escapeHTML(e.id)}" data-testid="bank-${online ? 'unlist' : 'restore'}-btn">${online ? '下架' : '恢复上架'}</button>
      <button class="btn" data-bank-act="convert" data-bank-id="${escapeHTML(e.id)}" data-testid="bank-convert-btn">${e.mode === 'protected' ? '转公开' : '转加密'}</button>
      <button class="btn danger" data-bank-act="delete" data-bank-id="${escapeHTML(e.id)}" data-testid="bank-delete-btn">删除</button>
    </div>`;
  }).join('') || '<div class="meta">（清单为空）</div>';
}

async function refreshSiteBanks(){
  if (!siteBanksListEl) return;
  if (!publishBridgeAvailable){ renderSiteBanksList([]); return; }
  try{
    const m = await fetch('/api/local/publish-bank').then(r => r.json());
    renderSiteBanksList((m && m.manifest) || []);
  }catch(_e){
    renderSiteBanksList([]);
  }
}

async function bankAdmin(payload){
  const res = await fetch('/api/local/bank-admin', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({ ok: false, error: '响应解析失败' }));
  if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
  if (Array.isArray(data.manifest)) renderSiteBanksList(data.manifest);
  return data;
}

siteBanksRefreshBtn && siteBanksRefreshBtn.addEventListener('click', refreshSiteBanks);

const siteUnlistAllBtn = $('#siteUnlistAllBtn');
siteUnlistAllBtn && siteUnlistAllBtn.addEventListener('click', async () => {
  const online = lastSiteManifest.filter(e => e && e.deploy !== false);
  if (!online.length){ setSiteBanksOpStatus('当前没有在线题库，无需下架。'); return; }
  if (!confirm(`把全部 ${online.length} 个在线题库下架？\n（文件保留，随时可逐个恢复；之后点部署可把线上清空）`)) return;
  try{
    for (const e of online) await bankAdmin({ action: 'unlist', id: e.id });
    setSiteBanksOpStatus(`✅ 已全部下架（${online.length} 个）。点「🚀 部署当前清单」并确认后，线上将清空。`);
  }catch(err){
    setSiteBanksOpStatus(`❌ 批量下架中断：${err && err.message ? err.message : err}`, true);
  }
});

siteBanksListEl && siteBanksListEl.addEventListener('click', async (ev) => {
  const btn = ev.target && ev.target.closest ? ev.target.closest('[data-bank-act]') : null;
  if (!btn) return;
  const id = btn.dataset.bankId;
  const act = btn.dataset.bankAct;
  const entry = lastSiteManifest.find(e => e && e.id === id);
  if (!entry) return;
  try{
    if (act === 'up' || act === 'down'){
      const r = await bankAdmin({ action: 'move', id, delta: act === 'up' ? -1 : 1 });
      setSiteBanksOpStatus(r.moved
        ? `✅ 已${act === 'up' ? '上移' : '下移'}「${id}」。目录页顺序 = 此列表顺序（All Banks 合并卡固定最前），点部署后线上生效。`
        : `「${id}」已经在${act === 'up' ? '最顶' : '最底'}了。`);
    } else if (act === 'delete'){
      if (!confirm(`删除「${entry.title || id}」？\n登记会移除；数据文件会移入回收目录 .bank-trash/（可手动找回）。`)) return;
      const r = await bankAdmin({ action: 'delete', id });
      setSiteBanksOpStatus(`✅ 已删除「${id}」${r.trashedTo ? `（数据已存入 ${r.trashedTo}，可找回）` : ''}。点「🚀 部署当前清单」后线上生效。`);
    } else if (act === 'unlist'){
      if (!confirm(`下架「${entry.title || id}」？站点上将不可见（文件保留，随时可恢复）。`)) return;
      await bankAdmin({ action: 'unlist', id });
      setSiteBanksOpStatus(`✅ 已下架「${id}」。点「🚀 部署当前清单」后线上生效。`);
    } else if (act === 'restore'){
      await bankAdmin({ action: 'restore', id });
      setSiteBanksOpStatus(`✅ 已恢复上架「${id}」。点「🚀 部署当前清单」后线上生效。`);
    } else if (act === 'convert'){
      if (entry.mode === 'protected'){
        const pw = prompt(`「${entry.title || id}」转公开：输入现有密码（用于解密）`);
        if (pw == null || !pw) return;
        await bankAdmin({ action: 'convert', id, password: pw });
        setSiteBanksOpStatus(`✅ 「${id}」已转为公开（任何人可见题目与答案）。点部署后生效。`);
      } else {
        const p1 = prompt(`「${entry.title || id}」转加密：设置密码`);
        if (p1 == null || !p1) return;
        const p2 = prompt('再输一遍确认：');
        if (p1 !== p2){ alert('两次密码不一致，已取消。'); return; }
        await bankAdmin({ action: 'convert', id, newPassword: p1 });
        setSiteBanksOpStatus(`✅ 「${id}」已转为 🔒 加密（不再进入合并练习页）。点部署后生效。`);
      }
    }
  }catch(e){
    setSiteBanksOpStatus(`❌ 操作失败：${e && e.message ? e.message : e}`, true);
  }
});

siteDeployBtn && siteDeployBtn.addEventListener('click', async () => {
  if (!publishBridgeAvailable || publishInFlight) return;
  // 预检查：清单里一个在线题库都没有 = 这次部署会把线上清空——要用户显式确认（防误删保护的放行口）
  const onlineCount = lastSiteManifest.filter(e => e && e.deploy !== false).length;
  let allowEmpty = false;
  if (!onlineCount){
    if (!confirm('当前没有任何在线题库。\n继续部署会把线上站点清空为「暂无题库」状态（目录页保留，访客仍可本地导入 JSON 练习）。\n确定全部解除部署？')) return;
    allowEmpty = true;
  }
  const target = siteDeployTargetSel ? siteDeployTargetSel.value : 'all';
  publishInFlight = true;
  updateExportButtons();
  siteDeployBtn.disabled = true;
  setSiteBanksOpStatus('部署中…（构建 + 上传约需 1 分钟，请勿关闭页面）');
  try{
    const data = await bankAdmin({ action: 'deploy', target, allowEmpty });
    const bits = [allowEmpty ? '✅ 已清空线上站点（全部题库解除部署）' : '✅ 部署完成'];
    if (target !== 'gh') bits.push('Cloudflare：https://question-bank-78u.pages.dev/');
    if (target !== 'cf') bits.push('GitHub：https://shicheng0810.github.io/question-bank/（约 1 分钟生效）');
    setSiteBanksOpStatus(bits.join('　·　'));
  }catch(e){
    setSiteBanksOpStatus(`❌ 部署失败：${e && e.message ? e.message : e}`, true);
  }finally{
    publishInFlight = false;
    siteDeployBtn.disabled = false;
    updateExportButtons();
  }
});

publishSiteBtn && publishSiteBtn.addEventListener('click', async () => {
  try{
    const arr = getExportArrayOrNull();
    if (!arr || !arr.length){
      alert('没有可发布的题库：请先解析并导出 JSON。');
      return;
    }
    const publishMeta = collectPublishMeta(arr);
    if (publishMeta.mode === 'protected' && !publishMeta.password){
      alert('密码保护模式需要先在上方填写发布密码。');
      return;
    }

    // 撞 id 时先确认覆盖
    let existing = null;
    try{
      const m = await fetch('/api/local/publish-bank').then(r => r.json());
      existing = ((m && m.manifest) || []).find(e => e && e.id === publishMeta.id) || null;
    }catch(_e){}
    if (existing && !confirm(`题库「${existing.title || publishMeta.id}」已存在（${existing.question_count} 题，${existing.mode === 'protected' ? '🔒 加密' : '公开'}）。\n覆盖更新它？`)) return;

    const target = publishTargetSel ? publishTargetSel.value : 'all';
    publishInFlight = true;
    updateExportButtons();
    setPublishSiteStatus(target === 'none' ? '写入仓库中…' : '发布中…（构建 + 部署约需 1 分钟，请勿关闭页面）');

    const res = await fetch('/api/local/publish-bank', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        questions: arr,
        id: publishMeta.id,
        title: publishMeta.title,
        description: publishMeta.description,
        tags: publishMeta.tags,
        mode: publishMeta.mode,
        password: publishMeta.password || '',
        target,
      }),
    });
    const data = await res.json().catch(() => ({ ok: false, error: '响应解析失败' }));
    if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);

    const bits = [`✅ 已${data.replaced ? '更新' : '发布'}「${data.id}」（${data.count} 题${data.entry && data.entry.mode === 'protected' ? '，🔒 加密' : ''}${data.rejectedCount ? `，剔除 ${data.rejectedCount} 条不完整` : ''}）`];
    if (data.deploy && data.deploy.deployed){
      if (data.urls && data.urls.cf) bits.push(`Cloudflare：${data.urls.cf}`);
      if (data.urls && data.urls.gh) bits.push(`GitHub：${data.urls.gh}（约 1 分钟生效）`);
    } else if (target === 'none'){
      bits.push('已写入仓库未部署——之后可换目标再发，或跑 npm run deploy:cf');
    }
    if (data.deployError) bits.push(`⚠ 部署失败：${data.deployError}（题库已写入，可重试部署）`);
    setPublishSiteStatus(bits.join('　·　'), !!data.deployError);
    refreshSiteBanks();
  }catch(e){
    console.error(e);
    setPublishSiteStatus(`❌ 发布失败：${e && e.message ? e.message : e}`, true);
  }finally{
    publishInFlight = false;
    updateExportButtons();
  }
});

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
  // 本地时区日期（toISOString 是 UTC：晚上导出会写成“明天”的日期）
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  return `question_bank_${slugifyBankId(bankId || 'question-bank')}_${stamp}.html`;
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
    // latin1 保字节解码：MHTML 是字节格式，按 UTF-8 整体解码会把 QP/base64 体之外的高位字节
    // 折叠成 >0xFF 码点，后续 charCodeAt&0xff 即截坏。文本 part 的真实编码由 part 自身还原。
    const fileBytes = new Uint8Array(await d.file.arrayBuffer());
    const raw = new TextDecoder('latin1').decode(fileBytes);
    const { html, htmlParts, cidMap } = parseMHTML(raw);

    const candidates = [];
    const seen = new Set();
    [html, ...(Array.isArray(htmlParts) ? htmlParts : [])].forEach(part => {
      const normalized = String(part || '');
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      candidates.push(normalized);
    });
    // 非 MHTML（直接保存的 .html 页面）：整个文件按 UTF-8 当 HTML 解析
    if (!candidates.length){
      const plain = new TextDecoder('utf-8').decode(fileBytes);
      if (plain.trim()) candidates.push(plain);
    }

    let bestParsed = [];
    for (const candidate of candidates){
      const htmlWithData = rewriteSources(candidate, cidMap);
      const parsed = parseCanvasHTML(htmlWithData);
      if ((parsed?.length || 0) > (bestParsed?.length || 0)) {
        bestParsed = parsed;
      }
    }

    // 0 题不再静默当成功：明确报出这份存档不是可提取的经典测验页
    if (!bestParsed.length){
      const joined = candidates.join('\n');
      const looksLikeNewQuizzes = /quiz_lti|external_tool|lti_iframe|tool_form/i.test(joined);
      throw new Error(looksLikeNewQuizzes
        ? '该存档是 New Quizzes（LTI/iframe）页面，MHTML 不包含题目内容，无法提取'
        : '未识别到 Canvas 经典测验题块（.display_question）——这可能不是测验结果页');
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
          ? `<span class="badge ${(info.pending || info.missingImgs || info.unsupported || info.conflicts) ? 'wait' : 'ok'}">${info.text}</span>`
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
  if (genLegacyQBankBtn) genLegacyQBankBtn.disabled = buttonState.disableLegacyHtml;
  if (publishSiteBtn) publishSiteBtn.disabled = buttonState.disableLegacyHtml || !publishBridgeAvailable || publishInFlight;

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

// 最近一次导出被校验闸剔除的记录（供导出成功提示补充说明；详单进 console.warn）
let lastExportRejected = [];
function applyExportValidation(merged){
  const { valid, rejected } = validateQuestionBankRecords(merged);
  lastExportRejected = rejected;
  if (rejected.length){
    console.warn('[export] 剔除不完整记录：', rejected.map(r => ({ id: r.record && r.record.id, reasons: r.reasons })));
  }
  return valid;
}
function exportRejectionSuffix(){
  if (!lastExportRejected.length) return '';
  const sample = lastExportRejected[0];
  const why = sample && sample.reasons && sample.reasons[0] ? sample.reasons[0] : '不完整';
  return `；已剔除 ${lastExportRejected.length} 条无法作答的记录（如：${why}，详见控制台）`;
}

function getExportArrayOrNull(){
  // Always merge/dedup before handing off to the publish ZIP or single-file HTML builders,
  // so a published bank never carries duplicate questions (the root cause of duplicated
  // questions in older exports). The merge fuses the same question across sources and keeps
  // every source reference; see buildUniqueMergedQuestionBankFromCollections.
  // 出口统一过 schema 校验闸：不完整记录（缺答案/选项不足/未知结构）不再静默进发布物。
  const direct = tryParseJSONArray(out.value);
  if (direct){
    const merged = applyExportValidation(buildUniqueMergedQuestionBankFromCollections([direct]));
    return merged.length ? merged : null;
  }
  const collections = [];
  for (const d of datasets){
    if (!d.parsedReady) continue;
    collectFromUI(d);
    collections.push(buildQuestionBank(d.parsed, d.prefix, d.sourcePrefix));
  }
  const merged = applyExportValidation(buildUniqueMergedQuestionBankFromCollections(collections));
  return merged.length ? merged : null;
}



function canGenerateQBank(){
  return canGenerateQuestionBankHelper({
    parsedCount: datasets.filter(x=>x.parsedReady).length,
    outValue: out && out.value ? out.value : '',
  });
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
  const parsed = (d && d.parsedReady && Array.isArray(d.parsed)) ? d.parsed : [];
  const unsupported = parsed.reduce((n, q) => n + ((q && q.kind) === 'unknown' ? 1 : 0), 0);
  const essays = parsed.reduce((n, q) => n + ((q && q.kind) === 'essay' ? 1 : 0), 0);
  const conflicts = parsed.reduce((n, q) => n + (q && q.answerConflict ? 1 : 0), 0);
  const parts = [];
  if (d && d.parsedReady) parts.push(`${d.parsed.length} 题`);
  if (pending) parts.push(`缺答 ${pending}`);
  if (missingImgs) parts.push(`缺图 ${missingImgs}`);
  if (conflicts) parts.push(`答案冲突 ${conflicts}（请核对）`);
  if (unsupported) parts.push(`不支持题型 ${unsupported}（不导出）`);
  if (essays) parts.push(`问答 ${essays}（不导出）`);
  return { pending, missingImgs, unsupported, essays, conflicts, text: parts.join(' · ') };
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
  setTopStatus(msg, info.pending > 0 || info.missingImgs > 0 || info.unsupported > 0 || info.conflicts > 0);
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

    const conflictLetters = Array.isArray(q.conflictSelectedIndexes)
      ? q.conflictSelectedIndexes.map(i => String.fromCharCode(65 + i)).join('、')
      : '';
    const badge = q.answerConflict
      ? `<span class="bad" title="该题拿了满分，但你当时勾选的选项（${conflictLetters || '?'}）≠ 页面标注的正确项。已按页面标注保留，请人工核对是哪种情况（regrade/全员给分/标注错误）。">答案冲突：满分但勾选(${conflictLetters || '?'})≠标注，请核对</span>`
      : autoOK ? `<span class="good">已自动识别</span>` : `<span class="bad">待人工确认</span>`;
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
              : (q.qTypeName ? `未知题型（${q.qTypeName}）` : '未知题型');

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

// 图片自动压缩：位图体积 >150KB 时缩到长边 ≤1200px、JPEG 85%，
// 防 base64 撑爆导出 JSON / localStorage。SVG/GIF 保持原样；压缩无收益就保留原图。
const IMG_MAX_DIM = 1200;
const IMG_COMPRESS_THRESHOLD = 150 * 1024;
async function compressImageBlobToDataURL(blob){
  const type = String((blob && blob.type) || '').toLowerCase();
  if (/svg|gif/.test(type) || !blob || blob.size <= IMG_COMPRESS_THRESHOLD) return blobToDataURL(blob);
  try{
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, IMG_MAX_DIM / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
    const compressed = canvas.toDataURL('image/jpeg', 0.85);
    const original = await blobToDataURL(blob);
    return compressed.length < original.length ? compressed : original;
  }catch(_e){
    return blobToDataURL(blob);
  }
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
        return await compressImageBlobToDataURL(blob);
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

    const urls = (await Promise.all(files.map(compressImageBlobToDataURL))).filter(Boolean);
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




/* -------------------- 导出 QUESTION_BANK -------------------- */










function buildUniqueMergedQuestionBank(){
  const collections = [];
  for (const d of datasets){
    if (!d.parsedReady) continue;
    collectFromUI(d);
    collections.push(buildQuestionBank(d.parsed, d.prefix, d.sourcePrefix));
  }
  return buildUniqueMergedQuestionBankFromCollections(collections);
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
