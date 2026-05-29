import { describe, expect, it } from 'vitest';

import { rapidOcrResultToTesseractData } from '../src/app/features/rapidocr-logic.js';

describe('RapidOCR result conversion', () => {
  it('converts PP-OCRv5 line boxes into the local OCR parser shape', () => {
    const data = rapidOcrResultToTesseractData({
      engine: 'rapidocr',
      model: 'PP-OCRv5-mobile',
      lines: [
        {
          text: 'To prevent fuel from flowing away from the boost pumps.',
          confidence: 0.96,
          box: [[14, 236], [740, 236], [740, 260], [14, 260]],
        },
        {
          text: 'What is the purpose of flapper type check valves in integral fuel tanks?',
          confidence: 0.98,
          box: [[14, 48], [890, 48], [890, 93], [14, 93]],
        },
      ],
    });

    expect(data.text).toBe([
      'What is the purpose of flapper type check valves in integral fuel tanks?',
      'To prevent fuel from flowing away from the boost pumps.',
    ].join('\n'));
    expect(data.lines).toEqual([
      expect.objectContaining({
        text: 'What is the purpose of flapper type check valves in integral fuel tanks?',
        confidence: 98,
        bbox: expect.objectContaining({ x0: 14, y0: 48, x1: 890, y1: 93 }),
      }),
      expect.objectContaining({
        text: 'To prevent fuel from flowing away from the boost pumps.',
        confidence: 96,
        bbox: expect.objectContaining({ x0: 14, y0: 236, x1: 740, y1: 260 }),
      }),
    ]);
    expect(data.words.map((word) => word.text).slice(0, 13)).toEqual([
      'What',
      'is',
      'the',
      'purpose',
      'of',
      'flapper',
      'type',
      'check',
      'valves',
      'in',
      'integral',
      'fuel',
      'tanks?',
    ]);
    expect(data.rapidOcrMeta).toMatchObject({
      engine: 'rapidocr',
      model: 'PP-OCRv5-mobile',
      lineCount: 2,
      wordCount: 23,
    });
  });

  it('accepts RapidOCR API dictionary output', () => {
    const data = rapidOcrResultToTesseractData({
      '0': {
        rec_txt: 'Question text',
        dt_boxes: [[10, 10], [300, 10], [300, 40], [10, 40]],
        score: '0.91',
      },
      '1': {
        rec_txt: 'Answer option',
        dt_boxes: [[10, 100], [220, 100], [220, 130], [10, 130]],
        score: '0.82',
      },
    });

    expect(data.text).toBe('Question text\nAnswer option');
    expect(data.lines[0].confidence).toBe(91);
    expect(data.lines[1].confidence).toBe(82);
  });

  it('builds row-ordered raw text when RapidOCR returns word-level fragments', () => {
    const data = rapidOcrResultToTesseractData({
      lines: [
        { text: 'the', confidence: 1, box: [[141, 29], [209, 29], [209, 73], [141, 73]] },
        { text: 'What is', confidence: 1, box: [[17, 30], [147, 30], [147, 69], [17, 69]] },
        { text: 'purpose', confidence: 1, box: [[204, 33], [348, 33], [348, 75], [204, 75]] },
        { text: 'To prevent fuel from flowing', confidence: 1, box: [[12, 162], [470, 162], [470, 211], [12, 211]] },
        { text: 'away', confidence: 1, box: [[469, 171], [567, 171], [567, 206], [469, 206]] },
      ],
    });

    expect(data.text).toBe([
      'What is the purpose',
      'To prevent fuel from flowing away',
    ].join('\n'));
    expect(data.lines).toEqual([
      expect.objectContaining({
        text: 'What is the purpose',
        bbox: expect.objectContaining({ x0: 17, y0: 29, x1: 348, y1: 75 }),
      }),
      expect.objectContaining({
        text: 'To prevent fuel from flowing away',
        bbox: expect.objectContaining({ x0: 12, y0: 162, x1: 567, y1: 211 }),
      }),
    ]);
    expect(data.words.map((word) => word.text)).toEqual([
      'What',
      'is',
      'the',
      'purpose',
      'To',
      'prevent',
      'fuel',
      'from',
      'flowing',
      'away',
    ]);
    expect(data.words.filter((word) => word.forceSpaceBefore)).toHaveLength(8);
    expect(data.rapidOcrMeta).toMatchObject({
      lineCount: 2,
      wordCount: 10,
    });
  });

  it('drops duplicate single-letter OCR fragments from synthesized words', () => {
    const data = rapidOcrResultToTesseractData({
      lines: [
        { text: 'from t the boost pumps.', confidence: 1, box: [[10, 10], [300, 10], [300, 40], [10, 40]] },
        { text: 'defueling g of tanks s by suction.', confidence: 1, box: [[10, 70], [390, 70], [390, 100], [10, 100]] },
        { text: 'the t boost', confidence: 1, box: [[10, 130], [170, 130], [170, 160], [10, 160]] },
      ],
    });

    expect(data.words.map((word) => word.text)).toEqual([
      'from',
      'the',
      'boost',
      'pumps.',
      'defueling',
      'of',
      'tanks',
      'by',
      'suction.',
      'the',
      'boost',
    ]);
    expect(data.rapidOcrMeta).toMatchObject({
      lineCount: 3,
      wordCount: 11,
    });
  });
});
