import { describe, expect, it } from 'vitest';

import {
  buildOpenAiVisionOcrRequest,
  openAiVisionExtractionToParsedQuestion,
  parseOpenAiVisionOcrResponse,
  shouldUseOpenAiVisionFallback,
} from '../src/app/features/openai-vision-ocr-logic.js';

describe('OpenAI vision OCR helpers', () => {
  it('builds a Responses API request with image input and strict JSON schema', () => {
    const request = buildOpenAiVisionOcrRequest({
      imageDataUrl: 'data:image/png;base64,AAA',
      model: 'gpt-5.4-mini',
      detail: 'high',
      reasoningEffort: 'low',
    });

    expect(request.model).toBe('gpt-5.4-mini');
    expect(request.reasoning).toEqual({ effort: 'low' });
    expect(request.input[0].content).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'input_text' }),
      {
        type: 'input_image',
        image_url: 'data:image/png;base64,AAA',
        detail: 'high',
      },
    ]));
    expect(request.text.format.type).toBe('json_schema');
    expect(request.text.format.strict).toBe(true);
    expect(request.text.format.schema.required).toContain('choices');
  });

  it('parses Responses API output into the extractor question shape', () => {
    const response = {
      output_text: JSON.stringify({
        kind: 'choice',
        question: 'Which bolt has the correct edge distance?',
        choices: [
          { label: 'A', text: 'Bolt A', is_correct: false },
          { label: 'B', text: 'Bolt B', is_correct: true },
          { label: 'C', text: 'Bolt C', is_correct: false },
        ],
        confidence: 0.94,
        needs_review: false,
        review_reasons: [],
        raw_visible_text: 'Which bolt has the correct edge distance? A Bolt A B Bolt B C Bolt C',
      }),
    };

    const extraction = parseOpenAiVisionOcrResponse(response);
    const parsed = openAiVisionExtractionToParsedQuestion(extraction, {
      dataUrl: 'data:image/png;base64,AAA',
      debug: true,
      model: 'gpt-5.4-mini',
    });

    expect(parsed).toMatchObject({
      kind: 'choice',
      qtext: 'Which bolt has the correct edge distance?',
      isMulti: false,
      choices: [
        { text: 'Bolt A', isCorrect: false },
        { text: 'Bolt B', isCorrect: true },
        { text: 'Bolt C', isCorrect: false },
      ],
      ocrMeta: {
        questionKind: 'openai-vision',
        aiVisionUsed: true,
        aiVisionModel: 'gpt-5.4-mini',
        aiVisionConfidence: 0.94,
        aiVisionNeedsReview: false,
      },
    });
    expect(parsed.ocrSourceImage).toBe('data:image/png;base64,AAA');
    expect(parsed.ocrText).toContain('Which bolt');
  });

  it('uses OpenAI fallback only when local OCR output looks weak', () => {
    expect(shouldUseOpenAiVisionFallback([{
      kind: 'choice',
      qtext: '(OCR 未提取出题干)',
      choices: [
        { text: 'A', isCorrect: false },
        { text: 'B', isCorrect: false },
      ],
      ocrMeta: { questionKind: 'choice-fallback' },
    }])).toBe(true);

    expect(shouldUseOpenAiVisionFallback([{
      kind: 'choice',
      qtext: 'Which item is inspected before installation?',
      choices: [
        { text: 'Rivet head', isCorrect: false },
        { text: 'Bolt thread', isCorrect: true },
        { text: 'Washer face', isCorrect: false },
        { text: 'Cotter pin', isCorrect: false },
      ],
      ocrMeta: { questionKind: 'choice' },
    }])).toBe(false);
  });
});
