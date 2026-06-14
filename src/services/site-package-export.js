// 单文件题库导出（方案乙后唯一的发布物形态）。
// 站点发布 = scripts/build-pages.mjs 生成目录页 + 每题库一个单文件播放器；
// 原 buildSitePublishZip（多文件 SPA 打包）已随 SPA 一并退役。
import legacyTemplate from '../templates/question-bank-template.html?raw';
import { encryptQuestionBankPayload } from '../lib/qbpack.js';
import { slugifyBankId } from '../lib/site-package.js';
import { safeJSONStringForScript as escapeJSONForScript } from '../lib/testable-core.js';

function safeJSONStringForScript(value) {
  // Single source of truth for the <script>-literal escaping lives in testable-core.js.
  return escapeJSONForScript(JSON.stringify(value));
}

const LEGACY_MARKER = '__QUESTION_BANK_JSON__';
const NS_MARKER = '__BANK_STORAGE_NS__';
const FB_MARKER = '__FEEDBACK_CONFIG_JSON__';

function assertTemplateMarker(template, marker) {
  if (!template.includes(marker)) {
    throw new Error(`Unable to locate template marker: ${marker}`);
  }
}

export async function buildLegacyQuestionBankHtml(questions, options = {}) {
  assertTemplateMarker(legacyTemplate, LEGACY_MARKER);
  const payload = options.mode === 'protected'
    ? { mode: 'protected', envelope: JSON.parse(await encryptQuestionBankPayload(questions, options.password || '')) }
    : (Array.isArray(questions) ? questions : []);
  // localStorage 命名空间 = 题库 id：同域名/同机器上多个题库单文件互不串档。
  // 没有 bankId 时回退共享的 "amt"（与历史导出兼容；注意 slugifyBankId 对空串有默认值，须先判空）。
  const rawBankId = String(options.bankId || '').trim();
  const ns = rawBankId ? (slugifyBankId(rawBankId) || 'amt') : 'amt';
  // 离线单文件无后端：endpoint 恒空 → 反馈走 mailto（有 feedbackEmail 时）/剪贴板降级
  const feedbackConfig = {
    endpoint: '',
    email: String(options.feedbackEmail || '').trim(),
    turnstile_site_key: '',
    app_version: String(options.appVersion || 'export'),
  };
  return legacyTemplate
    .replace(LEGACY_MARKER, safeJSONStringForScript(payload))
    .replace(NS_MARKER, ns)
    .replace(FB_MARKER, safeJSONStringForScript(JSON.stringify(feedbackConfig)));
}
