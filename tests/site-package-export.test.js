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
});
