import { Readable } from 'node:stream';

import { describe, expect, it } from 'vitest';

import {
  createRapidOcrVitePlugin,
  recognizeWithRapidOcr,
} from '../src/server/local-rapidocr-proxy.js';

describe('RapidOCR local proxy', () => {
  it('calls the local RapidOCR server and returns parser-ready OCR data', async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url, init });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          engine: 'rapidocr',
          model: 'PP-OCRv5-mobile',
          lines: [{
            text: 'Question text',
            confidence: 0.92,
            box: [[10, 10], [300, 10], [300, 40], [10, 40]],
          }],
        }),
      };
    };

    const result = await recognizeWithRapidOcr({
      imageDataUrl: 'data:image/png;base64,AAA',
      serverUrl: 'http://127.0.0.1:8765',
      fetchImpl,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('http://127.0.0.1:8765/ocr');
    expect(calls[0].init.method).toBe('POST');
    expect(JSON.parse(calls[0].init.body)).toEqual({
      imageDataUrl: 'data:image/png;base64,AAA',
    });
    expect(result).toMatchObject({
      engine: 'rapidocr',
      model: 'PP-OCRv5-mobile',
      data: {
        text: 'Question text',
        rapidOcrMeta: {
          lineCount: 1,
        },
      },
    });
  });

  it('registers a Vite middleware at the local RapidOCR path', async () => {
    const registered = [];
    const plugin = createRapidOcrVitePlugin({
      serverUrl: 'http://rapid.local',
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => ({ lines: [] }),
      }),
    });
    plugin.configureServer({
      middlewares: {
        use(path, handler) {
          registered.push({ path, handler });
        },
      },
    });

    expect(registered).toHaveLength(1);
    expect(registered[0].path).toBe('/api/local/rapidocr');

    const req = Readable.from(['{"imageDataUrl":"data:image/png;base64,AAA"}']);
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

    expect(res.statusCode).toBe(200);
    expect(headers['cache-control']).toBe('no-store');
    expect(JSON.parse(chunks.join(''))).toMatchObject({
      engine: 'rapidocr',
      data: {
        rapidOcrMeta: {
          lineCount: 0,
        },
      },
    });
  });

  it('reports a clear error when the local RapidOCR service is unavailable', async () => {
    await expect(recognizeWithRapidOcr({
      imageDataUrl: 'data:image/png;base64,AAA',
      fetchImpl: async () => {
        throw new Error('connect ECONNREFUSED 127.0.0.1:8765');
      },
    })).rejects.toThrow('RapidOCR local service is not reachable');
  });
});
