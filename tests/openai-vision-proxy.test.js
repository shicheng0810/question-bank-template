import { Readable } from 'node:stream';

import { describe, expect, it } from 'vitest';

import {
  createOpenAiVisionOcrVitePlugin,
  recognizeQuestionScreenshot,
} from '../src/server/openai-vision-ocr-proxy.js';

describe('OpenAI vision OCR local proxy', () => {
  it('calls OpenAI Responses with the server-side API key and returns extraction JSON', async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url, init });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 'resp_test',
          output_text: JSON.stringify({
            kind: 'choice',
            question: 'What is shown?',
            choices: [
              { label: 'A', text: 'A rivet', is_correct: true },
              { label: 'B', text: 'A bolt', is_correct: false },
            ],
            answer_indices: [0],
            confidence: 0.91,
            needs_review: false,
            review_reasons: [],
            raw_visible_text: 'What is shown? A A rivet B A bolt',
          }),
        }),
      };
    };

    const result = await recognizeQuestionScreenshot({
      imageDataUrl: 'data:image/png;base64,AAA',
      model: 'gpt-5.4-mini',
      detail: 'high',
      apiKey: 'sk-test',
      fetchImpl,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.openai.com/v1/responses');
    expect(calls[0].init.headers.Authorization).toBe('Bearer sk-test');
    const upstreamBody = JSON.parse(calls[0].init.body);
    expect(upstreamBody.input[0].content[1]).toMatchObject({
      type: 'input_image',
      image_url: 'data:image/png;base64,AAA',
      detail: 'high',
    });
    expect(result).toMatchObject({
      responseId: 'resp_test',
      model: 'gpt-5.4-mini',
      extraction: {
        question: 'What is shown?',
        answer_indices: [0],
        confidence: 0.91,
      },
    });
  });

  it('fails before network access when OPENAI_API_KEY is missing', async () => {
    await expect(recognizeQuestionScreenshot({
      imageDataUrl: 'data:image/png;base64,AAA',
      fetchImpl: async () => {
        throw new Error('should not call fetch');
      },
    })).rejects.toThrow('OPENAI_API_KEY');
  });

  it('registers the Vite dev server middleware at the local proxy path', async () => {
    const registered = [];
    const plugin = createOpenAiVisionOcrVitePlugin({ apiKey: '' });
    plugin.configureServer({
      middlewares: {
        use(path, handler) {
          registered.push({ path, handler });
        },
      },
    });

    expect(registered).toHaveLength(1);
    expect(registered[0].path).toBe('/api/openai/vision-ocr');

    const req = Readable.from(['{}']);
    req.method = 'POST';
    const chunks = [];
    const headers = {};
    const res = {
      statusCode: 0,
      setHeader(key, value) {
        headers[key.toLowerCase()] = value;
      },
      end(body) {
        chunks.push(String(body));
      },
    };

    await registered[0].handler(req, res);

    expect(res.statusCode).toBe(500);
    expect(headers['cache-control']).toBe('no-store');
    expect(chunks.join('')).toContain('OPENAI_API_KEY');
  });
});
