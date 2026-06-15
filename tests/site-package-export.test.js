/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest';
import { buildLegacyQuestionBankHtml } from '../src/services/site-package-export.js';

const questions = [
  {
    id: 'sample-1',
    question: 'Sample question',
    choices: ['A', 'B'],
    answer: 0,
  },
];

describe('single-file bank export', () => {
  it('injects public and protected legacy payloads into the template marker', async () => {
    const publicHtml = await buildLegacyQuestionBankHtml(questions, { mode: 'public' });
    expect(publicHtml).not.toContain('__QUESTION_BANK_JSON__');
    expect(publicHtml).toContain('const LEGACY_BANK_PAYLOAD = [{');

    const protectedHtml = await buildLegacyQuestionBankHtml(questions, { mode: 'protected', password: 'secret' });
    expect(protectedHtml).not.toContain('__QUESTION_BANK_JSON__');
    expect(protectedHtml).toContain('"mode":"protected"');
    expect(protectedHtml).toContain('"envelope"');
    expect(protectedHtml).toContain('"format":"qbpack-v1"');
  });

  it('injects the per-bank localStorage namespace (falls back to "amt")', async () => {
    const withId = await buildLegacyQuestionBankHtml(questions, { mode: 'public', bankId: 'AMT205 Coverings' });
    expect(withId).not.toContain('__BANK_STORAGE_NS__');
    expect(withId).toContain('const RAW_STORAGE_NS = "amt205-coverings"');

    const withoutId = await buildLegacyQuestionBankHtml(questions, { mode: 'public' });
    expect(withoutId).toContain('const RAW_STORAGE_NS = "amt"');
  });

  it('offline export turns off feedback + tutorial and locks UI to English (Button Guide kept)', async () => {
    const html = await buildLegacyQuestionBankHtml(questions, { mode: 'public', bankId: 'demo' });
    // marker 必须被替换成真正的 JS 对象（裸 marker 残留会让整个播放器脚本报错）
    expect(html).not.toContain('__UI_FEATURES_JSON__');
    expect(html).toContain('const RAW_UI_FEATURES = {"feedback":false,"tutorial":false,"languages":["en"]}');
    // Button Guide 始终保留（用户要这个）
    expect(html).toContain('id="guide-btn"');
    // 反馈端点为空对象注入（不再因双重编码而变成字符串）——回归保护
    expect(html).toContain('const RAW_FEEDBACK_CONFIG = {');
    expect(html).not.toContain('const RAW_FEEDBACK_CONFIG = "');
  });

  it('honours an explicit options.uiFeatures override', async () => {
    const html = await buildLegacyQuestionBankHtml(questions, {
      mode: 'public', bankId: 'demo',
      uiFeatures: { feedback: true, languages: ['en', 'zh'] },
    });
    expect(html).toContain('"feedback":true');
    expect(html).toContain('"languages":["en","zh"]');
    expect(html).toContain('"tutorial":false'); // 未覆盖项保留离线默认
  });
});
