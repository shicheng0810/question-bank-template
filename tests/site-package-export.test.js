/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { buildLegacyQuestionBankHtml, buildSitePublishZip } from '../src/services/site-package-export.js';

const questions = [
  {
    id: 'sample-1',
    question: 'Sample question',
    choices: ['A', 'B'],
    answer: 0,
  },
];

describe('site package export', () => {
  it('includes every resource referenced by the exported site index', async () => {
    const result = await buildSitePublishZip({
      questions,
      publishMeta: { id: 'sample', title: 'Sample', mode: 'public' },
      existingManifest: [],
    });
    const zip = await JSZip.loadAsync(result.blob);
    const indexHtml = await zip.file('index.html').async('string');

    expect(indexHtml).toContain('assets/site.css');
    expect(indexHtml).toContain('assets/main.js');
    expect(zip.file('assets/site.css')).toBeTruthy();
    expect(zip.file('assets/main.js')).toBeTruthy();
    expect(zip.file('assets/site-app.js')).toBeTruthy();
    expect(zip.file('assets/site-logic.js')).toBeTruthy();
    expect(zip.file('assets/qbpack.js')).toBeTruthy();
    expect(zip.file('banks/index.json')).toBeTruthy();
    expect(zip.file('banks/sample.json')).toBeTruthy();
  });

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
});
