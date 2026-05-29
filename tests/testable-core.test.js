/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest';
import {
  base64ToBytes,
  buildQuestionBank,
  buildUniqueMergedQuestionBankFromCollections,
  bytesToBase64,
  bytesToUTF8,
  extractQuestionBankArrayFromText,
  getAnswerSignature,
  guessMetaFromFilename,
  injectQuestionBankJSON,
  makeSafeJSONForScript,
  parseFillInputToAnswers,
  parseHeaders,
  qpToBytes,
  safeJSONStringForScript,
  shouldUseSelectedAnswersAsCorrectFallback,
} from '../src/lib/testable-core.js';

function parseChoiceFallbackFixture(html) {
  const dom = new DOMParser().parseFromString(html, 'text/html');
  const blk = dom.querySelector('.display_question.question');
  const choices = Array.from(blk.querySelectorAll('.answer')).map((answer) => {
    const cls = answer.className || '';
    const input = answer.querySelector('input[type="radio"],input[type="checkbox"]');
    const title = answer.getAttribute('title') || '';
    return {
      text: answer.querySelector('.answer_text')?.textContent.trim() || '',
      isCorrect: /\bcorrect_answer\b|\bcorrect\b/i.test(cls),
      isSelected: /\bselected_answer\b/i.test(cls) || !!(input && input.checked) || /\byou selected this answer\b/i.test(title),
    };
  });

  const selectedIndexes = choices.map((choice, index) => (choice.isSelected ? index : -1)).filter((index) => index >= 0);
  const explicitCorrectIndexes = choices.map((choice, index) => (choice.isCorrect ? index : -1)).filter((index) => index >= 0);
  if (shouldUseSelectedAnswersAsCorrectFallback({
    clsAll: blk.className || '',
    explicitCorrectIndexes,
    selectedIndexes,
  })) {
    choices.forEach((choice, index) => { choice.isCorrect = selectedIndexes.includes(index); });
  }
  choices.forEach((choice) => { delete choice.isSelected; });
  return buildQuestionBank([
    {
      kind: 'choice',
      num: 1,
      idSuffix: '1',
      sourceNum: '1',
      qtext: 'When cold setting glues are used, apply pressure in an',
      isMulti: false,
      choices,
    },
  ], 'woods-review', 'Woods Review');
}

describe('question bank import helpers', () => {
  it('extracts a direct JSON array payload', () => {
    const arr = extractQuestionBankArrayFromText('[{"id":"a-1","question":"Q1"}]');
    expect(arr).toHaveLength(1);
    expect(arr[0].id).toBe('a-1');
  });

  it('extracts embedded QUESTION_BANK arrays from HTML scripts', () => {
    const html = `
      <html>
        <body>
          <script>
            const QUESTION_BANK = [
              {"id":"bank-1","question":"Hello","choices":["A","B"],"answer":1}
            ];
          </script>
        </body>
      </html>
    `;
    const arr = extractQuestionBankArrayFromText(html);
    expect(arr).toHaveLength(1);
    expect(arr[0].question).toBe('Hello');
  });

  it('extracts LEGACY_BANK_PAYLOAD and ignores the empty RAW_QUESTION_BANK placeholder', () => {
    // Single-file exports declare `let RAW_QUESTION_BANK = []` (filled at runtime) and hold the
    // real questions in LEGACY_BANK_PAYLOAD. Re-importing such a file must skip the empty
    // placeholder and find the populated array, so the export/import round-trip works.
    const html = `
      <html><body><script>
        let RAW_QUESTION_BANK = [];
        const LEGACY_BANK_PAYLOAD = [
          {"id":"amt-1","question":"Stripper can be used to remove old dope.","choices":["True","False"],"answer":1,"source":"AMT205 – Q1"}
        ];
      </script></body></html>
    `;
    const arr = extractQuestionBankArrayFromText(html);
    expect(arr).toHaveLength(1);
    expect(arr[0].id).toBe('amt-1');
  });

  it('escapes unsafe script content before template injection', () => {
    const raw = '{"question":"</script>\\u2028\\u2029"}';
    const safe = makeSafeJSONForScript(raw);
    expect(safe).toContain('<\\/script>');
    expect(safe).toContain('\\u2028');
    expect(safe).toContain('\\u2029');

    const injected = injectQuestionBankJSON('<script>const RAW = __QUESTION_BANK_JSON__;</script>', safe);
    expect(injected).toContain('const RAW = {"question":"<\\/script>');
  });

  it('keeps JSON safe for inline script literals', () => {
    const safe = safeJSONStringForScript('{"html":"</script></div>"}');
    expect(safe).toContain('<\\/script>');
    expect(safe).toContain('<\\/div>');
  });
});

describe('metadata and parsing helpers', () => {
  it('infers prefix and sourcePrefix from simple underscore filenames', () => {
    expect(guessMetaFromFilename('Brake Systems_A.html')).toEqual({
      prefix: 'Brake Systems',
      sourcePrefix: 'Test_Brake Systems_A',
    });
  });

  it('infers quiz-style prefixes from ordinary file names', () => {
    expect(guessMetaFromFilename('Lecture Quiz 3.mhtml')).toEqual({
      prefix: 'lecq_3',
      sourcePrefix: 'Lecture Quiz – #3',
    });
  });

  it('parses headers and binary helpers consistently', () => {
    expect(parseHeaders('Content-Type: text/html\r\nX-Test: yes')).toEqual({
      'content-type': 'text/html',
      'x-test': 'yes',
    });

    const bytes = base64ToBytes('SGVsbG8=');
    expect(Array.from(bytes)).toEqual([72, 101, 108, 108, 111]);
    expect(bytesToBase64(bytes)).toBe('SGVsbG8=');
    expect(bytesToUTF8(bytes)).toBe('Hello');

    expect(bytesToUTF8(qpToBytes('Hello=20World'))).toBe('Hello World');
  });

  it('deduplicates fill answers from pipe-delimited input', () => {
    expect(parseFillInputToAnswers(' checklist | checklist | check list ')).toEqual([
      'checklist',
      'check list',
    ]);
  });
});

describe('export shaping and unique merge', () => {
  it('builds the compatible question bank schema for choice/fill/matching questions', () => {
    const exported = buildQuestionBank([
      {
        kind: 'choice',
        num: 1,
        idSuffix: '1',
        sourceNum: '1',
        qtext: 'What is correct?',
        choices: [
          { text: 'A', isCorrect: false },
          { text: 'B', isCorrect: true },
        ],
        isMulti: false,
        images: ['data:image/png;base64,AAA'],
      },
      {
        kind: 'choice',
        num: 2,
        idSuffix: '2',
        sourceNum: '2',
        qtext: 'Pick all',
        choices: [
          { text: 'A', isCorrect: true },
          { text: 'B', isCorrect: false },
          { text: 'C', isCorrect: true },
        ],
        isMulti: true,
      },
      {
        kind: 'fill',
        num: 3,
        idSuffix: '3',
        sourceNum: '3',
        qtext: 'Fill me',
        qhtml: 'Fill <input>',
        blanks: [['answer']],
      },
      {
        kind: 'matching',
        num: 4,
        idSuffix: '4',
        sourceNum: '4',
        qtext: 'Match item',
        pairs: [{ left: 'Left', right: 'Right' }],
        choicePool: ['Right', 'Other'],
      },
    ], 'bank', 'Source');

    expect(exported).toEqual([
      {
        id: 'bank-1',
        question: 'What is correct?',
        choices: ['A', 'B'],
        answer: 1,
        source: 'Source – Q1',
        image: 'data:image/png;base64,AAA',
      },
      {
        id: 'bank-2',
        question: 'Pick all',
        choices: ['A', 'B', 'C'],
        answers: [0, 2],
        source: 'Source – Q2',
      },
      {
        id: 'bank-3',
        question: 'Fill me',
        blanks: [['answer']],
        source: 'Source – Q3',
        type: 'fill',
        question_html: 'Fill <input>',
      },
      {
        id: 'bank-4_m1',
        question: 'Match item [Left]',
        choices: ['Right', 'Other'],
        answer: 0,
        source: 'Source – Q4.1',
      },
    ]);
  });

  it('merges duplicate exported questions with reordered choices and the same correct answer text', () => {
    const merged = buildUniqueMergedQuestionBankFromCollections([
      [
        {
          id: 'bank-1',
          question: 'According to AC 43.13-1B, what species of wood is considered a Standard for aircraft construction?',
          choices: ['A', 'B', 'C'],
          answer: 2,
          source: 'Source A – Q1',
        },
      ],
      [
        {
          id: 'bank-9',
          question: 'According to AC 43.13-1B, what species of wood is considered a Standard for aircraft construction?',
          choices: ['C', 'A', 'B'],
          answer: 0,
          source: ['Source B – Q9', 'Source A – Q1'],
          question_html: '<p>According to AC 43.13-1B, what species of wood is considered a Standard for aircraft construction?</p>',
        },
      ],
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0].source).toEqual(['Source A – Q1', 'Source B – Q9']);
    expect(merged[0].choices).toEqual(['A', 'B', 'C']);
    expect(getAnswerSignature(merged[0])).toEqual([2]);
    expect(merged[0].question_html).toBe('<p>According to AC 43.13-1B, what species of wood is considered a Standard for aircraft construction?</p>');
  });

  it('does not merge same stem and choices when correct answer text differs', () => {
    const merged = buildUniqueMergedQuestionBankFromCollections([
      [
        {
          id: 'bank-1',
          question: 'Pick the correct answer',
          choices: ['A', 'B', 'C'],
          answer: 0,
          source: 'Source A – Q1',
        },
      ],
      [
        {
          id: 'bank-2',
          question: 'Pick the correct answer',
          choices: ['A', 'B', 'C'],
          answer: 2,
          source: 'Source B – Q2',
        },
      ],
    ]);

    expect(merged).toHaveLength(2);
    expect(merged.map((item) => item.answer)).toEqual([0, 2]);
  });

  it('merges the same question across sources when only the distractor wording differs', () => {
    // The same question imported from two quizzes often has reworded wrong options (OCR/source
    // variation). Smart merge keys on stem + correct-answer text, so these still fuse.
    const merged = buildUniqueMergedQuestionBankFromCollections([
      [
        {
          id: 'a-1',
          question: 'What must be done before repairing tears in fabric?',
          choices: ['remove the finishes down to the clear dope', 'nothing, put a patch on', 'remove the paint but not the aluminum dope'],
          answer: 0,
          source: 'Lecture Quiz – Q2',
        },
      ],
      [
        {
          id: 'b-4',
          question: 'What must be done before repairing tears in fabric?',
          choices: ['Remove the finishes down to the clear dope', 'remove the paint but not the aluminum pigment', 'put on a patch over blue paint'],
          answer: 0,
          source: 'Homework – Q4',
        },
      ],
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0].source).toEqual(['Lecture Quiz – Q2', 'Homework – Q4']);
  });

  it('keeps same-stem questions separate when the correct answer text differs (generic stems)', () => {
    // Guards the "Which statement is true?" trap: identical generic stem, identical answer index,
    // but different correct-answer text — these are distinct questions and must not be merged.
    const merged = buildUniqueMergedQuestionBankFromCollections([
      [{ id: 'a', question: 'Which statement is true?', choices: ['cotton burns to ash', 'cotton melts', 'polyester burns to ash'], answer: 0, source: 'S1' }],
      [{ id: 'b', question: 'Which statement is true?', choices: ['the seine knot attaches fabric', 'the paris knot attaches fabric', 'the splice knot attaches fabric'], answer: 0, source: 'S2' }],
    ]);

    expect(merged).toHaveLength(2);
  });
});

describe('Canvas selected-answer fallback', () => {
  it('uses a selected gray-arrow answer when Canvas marks the question block correct', () => {
    const exported = parseChoiceFallbackFixture(`
      <div id="questions" class="assessment_results survey_results show_correct_answers">
        <div class="display_question question multiple_choice_question correct">
          <div class="answers">
            <div class="answer"><input type="radio"><div class="answer_text">free exposure.</div></div>
            <div class="answer selected_answer" title="open assembly.. You selected this answer.">
              <span class="answer_arrow info" aria-label="You Answered"></span>
              <input type="radio" checked>
              <div class="answer_text">open assembly.</div>
            </div>
            <div class="answer"><input type="radio"><div class="answer_text">closed assembly.</div></div>
          </div>
        </div>
      </div>
    `);

    expect(exported[0]).toMatchObject({
      choices: ['free exposure.', 'open assembly.', 'closed assembly.'],
      answer: 1,
    });
  });

  it('does not use selected answers as correct when the question block is not correct', () => {
    const exported = parseChoiceFallbackFixture(`
      <div class="display_question question multiple_choice_question incorrect">
        <div class="answers">
          <div class="answer"><input type="radio"><div class="answer_text">free exposure.</div></div>
          <div class="answer selected_answer" title="open assembly.. You selected this answer.">
            <span class="answer_arrow info" aria-label="You Answered"></span>
            <input type="radio" checked>
            <div class="answer_text">open assembly.</div>
          </div>
        </div>
      </div>
    `);

    expect(exported[0]).toMatchObject({
      choices: ['free exposure.', 'open assembly.'],
      answer: -1,
    });
  });

  it('keeps explicit correct_answer ahead of selected fallback', () => {
    const exported = parseChoiceFallbackFixture(`
      <div class="display_question question multiple_choice_question correct">
        <div class="answers">
          <div class="answer correct_answer"><input type="radio"><div class="answer_text">free exposure.</div></div>
          <div class="answer selected_answer" title="open assembly.. You selected this answer.">
            <span class="answer_arrow info" aria-label="You Answered"></span>
            <input type="radio" checked>
            <div class="answer_text">open assembly.</div>
          </div>
        </div>
      </div>
    `);

    expect(exported[0]).toMatchObject({
      choices: ['free exposure.', 'open assembly.'],
      answer: 0,
    });
  });
});
