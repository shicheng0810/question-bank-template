import { describe, expect, it } from 'vitest';

import {
  buildRapidOcrDebugMeta,
  findUnlabeledChoiceRowSplit,
  ocrBinaryPixelValue,
  repairOcrChoiceText,
} from '../src/app/features/screenshot-ocr-logic.js';

describe('screenshot OCR preprocessing helpers', () => {
  it('keeps pastel quiz row backgrounds white while preserving dark text ink', () => {
    expect(ocrBinaryPixelValue(213, 245, 218)).toBe(255);
    expect(ocrBinaryPixelValue(223, 242, 249)).toBe(255);
    expect(ocrBinaryPixelValue(245, 245, 245)).toBe(255);

    expect(ocrBinaryPixelValue(42, 42, 42)).toBe(0);
    expect(ocrBinaryPixelValue(49, 117, 58)).toBe(0);
  });

  it('keeps a long first option out of the question stem for unlabeled quiz screenshots', () => {
    const rows = [
      row('What is the purpose of flapper type check valves in integral fuel tanks?', 14, 48, 93),
      row('To allow the engine driven pumps to draw fuel directly from the tank if the boost pump fails.', 14, 166, 190),
      row('To prevent fuel from flowing away from the boost pumps.', 14, 236, 260),
      row('To allow defueling of the tanks by suction.', 14, 305, 329),
    ];

    const split = findUnlabeledChoiceRowSplit(rows, { imageWidth: 1280 });

    expect(split.questionRows.map((item) => item.text)).toEqual([
      'What is the purpose of flapper type check valves in integral fuel tanks?',
    ]);
    expect(split.optionRows.map((item) => item.text)).toEqual([
      'To allow the engine driven pumps to draw fuel directly from the tank if the boost pump fails.',
      'To prevent fuel from flowing away from the boost pumps.',
      'To allow defueling of the tanks by suction.',
    ]);
  });

  it('does not treat a wrapped second question line as the first option', () => {
    const rows = [
      row('Which inspection should be performed when an aircraft fuel tank', 14, 40, 64),
      row('has been opened for maintenance?', 14, 70, 94),
      row('Use approved lighting and ventilation.', 14, 168, 192),
      row('Seal the tank immediately after opening.', 14, 238, 262),
      row('Drain all fuel through suction only.', 14, 308, 332),
    ];

    const split = findUnlabeledChoiceRowSplit(rows, { imageWidth: 1280 });

    expect(split.questionRows.map((item) => item.text)).toEqual([
      'Which inspection should be performed when an aircraft fuel tank',
      'has been opened for maintenance?',
    ]);
    expect(split.optionRows.map((item) => item.text)).toEqual([
      'Use approved lighting and ventilation.',
      'Seal the tank immediately after opening.',
      'Drain all fuel through suction only.',
    ]);
  });

  it('removes RapidOCR word-fragment duplicate tokens from option text', () => {
    expect(repairOcrChoiceText('To prevent fuel from t the boost pumps.')).toBe(
      'To prevent fuel from the boost pumps.',
    );
    expect(repairOcrChoiceText('To allow defueling g of the tanks s by suction.')).toBe(
      'To allow defueling of the tanks by suction.',
    );
    expect(repairOcrChoiceText('purpose of1 flapper type')).toBe('purpose of flapper type');
  });

  it('keeps RapidOCR word fragments separate for OCR debugging', () => {
    const meta = buildRapidOcrDebugMeta({
      rapidOcr: true,
      model: 'PP-OCRv5-mobile',
      data: {
        rapidOcrMeta: { lineCount: 2, wordCount: 5 },
        lines: [
          { text: 'What is the purpose' },
          { text: 'To prevent fuel' },
        ],
        words: [
          { text: 'What is' },
          { text: 'the' },
          { text: 'purpose' },
          { text: 'To prevent' },
          { text: 'fuel' },
        ],
      },
    });

    expect(meta).toMatchObject({
      rapidOcrUsed: true,
      rapidOcrModel: 'PP-OCRv5-mobile',
      rapidOcrLineCount: 2,
      rapidOcrWordCount: 5,
      rapidOcrLineText: ['What is the purpose', 'To prevent fuel'],
      rapidOcrWordText: ['What is', 'the', 'purpose', 'To prevent', 'fuel'],
    });
  });
});

function row(text, x0, y0, y1) {
  return {
    text,
    bbox: {
      x0,
      y0,
      x1: 1100,
      y1,
      w: 1100 - x0,
      h: y1 - y0,
      cx: (1100 + x0) / 2,
      cy: (y0 + y1) / 2,
    },
  };
}
