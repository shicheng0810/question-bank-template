import { execFileSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

describe('RapidOCR Python server script', () => {
  it('passes its dependency-free self test', () => {
    const output = execFileSync('python3', ['scripts/rapidocr_server.py', '--self-test'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });

    expect(output).toContain('rapidocr_server self-test ok');
  });

  it('normalizes RapidOCR v3 to_json txt fields', () => {
    const output = execFileSync('python3', [
      '-c',
      [
        'from scripts.rapidocr_server import normalize_rapidocr_output',
        'lines = normalize_rapidocr_output([{"txt":"Hello","score":0.9,"box":[[1,2],[3,2],[3,4],[1,4]]}])',
        'print(lines[0]["text"])',
      ].join('; '),
    ], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });

    expect(output.trim()).toBe('Hello');
  });
});
