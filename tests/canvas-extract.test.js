// @vitest-environment jsdom
// 提取管线的金样本回归 + 边界单测。
// 金样本：tests/fixtures/archives/*.mhtml（真实 Canvas 存档脱敏重封装，
// 由 scripts/build-archive-fixture.mjs 生成）。任何解析逻辑改动先过这关。
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  parseMHTML, parseCanvasHTML, rewriteSources, extractMatchingQuestionData,
} from '../src/lib/canvas-extract.js';
import { buildQuestionBank, validateQuestionBankRecords } from '../src/lib/testable-core.js';

const ARCHIVES = path.join(__dirname, 'fixtures', 'archives');
const readArchive = (name) => fs.readFileSync(path.join(ARCHIVES, name)).toString('latin1');
const parseArchive = (name) => {
  const { html } = parseMHTML(readArchive(name));
  return parseCanvasHTML(html);
};
const parseBlocks = (innerHtml) => parseCanvasHTML(`<html><body>${innerHtml}</body></html>`);

describe('golden archives (真实存档回归)', () => {
  const cases = [
    { file: 'amt205-coverings-quiz7.mhtml', questions: 10, firstStem: 'A major alteration requires what document?' },
    { file: 'amt215-helicopter-assignment1.mhtml', questions: 10, firstStem: 'Torque causes a helicopter to rotate' },
    { file: 'amt235-commnav-quiz2.mhtml', questions: 20, firstStem: 'What does RA in TCAS stand for?' },
  ];

  for (const c of cases) {
    it(`${c.file}: ${c.questions} 题、全部识别出正确答案、可整库导出`, () => {
      const parsed = parseArchive(c.file);
      expect(parsed.length).toBe(c.questions);
      expect(parsed[0].qtext.startsWith(c.firstStem)).toBe(true);
      for (const q of parsed) {
        expect(q.kind).toBe('choice');
        expect(q.choices.length).toBeGreaterThanOrEqual(2);
        expect(q.choices.some(ch => ch.isCorrect)).toBe(true);
      }
      // 端到端：parse → buildQuestionBank → 校验闸全部通过
      const bank = buildQuestionBank(parsed, 'fx', 'Fixture');
      expect(bank.length).toBe(c.questions);
      const { valid, rejected } = validateQuestionBankRecords(bank);
      expect(rejected).toEqual([]);
      expect(valid.length).toBe(c.questions);
    });
  }
});

describe('parseMHTML（MIME 层）', () => {
  const boundary = '----TestBoundary----';
  const mhtml = [
    'From: <test>',
    'MIME-Version: 1.0',
    `Content-Type: multipart/related; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: quoted-printable',
    'Content-Location: https://example.instructure.com/quizzes/1',
    '',
    '<html><body><div class=3D"display_question question">=E9=A2=98</div>' +
      '<img src=3D"https://host/img.png"><img src=3D"cid:abc"></body></html>',
    `--${boundary}`,
    'Content-Type: image/png',
    'Content-Transfer-Encoding: base64',
    'Content-ID: <abc>',
    'Content-Location: https://host/img.png',
    '',
    'iVBORw0KGgo=',
    `--${boundary}--`,
    '',
  ].join('\r\n');

  it('QP 解码 + cid/location 双索引 + rewriteSources 改写', () => {
    const { html, cidMap } = parseMHTML(mhtml);
    expect(html).toContain('题'); // quoted-printable 多字节解码正确
    expect(cidMap['cid:abc']).toMatch(/^data:image\/png;base64,/);
    expect(cidMap['https://host/img.png']).toMatch(/^data:image\/png;base64,/);
    const rewritten = rewriteSources(html, cidMap);
    expect(rewritten).not.toContain('src="https://host/img.png"');
    expect(rewritten).not.toContain('src="cid:abc"');
    expect((rewritten.match(/data:image\/png;base64/g) || []).length).toBe(2);
  });

  it('非 MHTML 输入返回空结果（上层据此走 plain-HTML 回退）', () => {
    expect(parseMHTML('<html><body>plain</body></html>').html).toBe('');
  });
});

describe('边界回归（曾经的静默错答/丢题模式）', () => {
  it('装饰性箭头图标不再被当成正确答案信号', () => {
    const parsed = parseBlocks(`
      <div class="display_question question multiple_choice_question">
        <span class="question_name">Question 1</span>
        <div class="text">
          <div class="question_text user_content">Pick one?</div>
          <div class="answers">
            <div class="answer"><input type="radio"><i class="icon-arrow-down"></i><div class="answer_text">A</div></div>
            <div class="answer"><input type="radio"><div class="answer_text">B</div></div>
          </div>
        </div>
      </div>`);
    expect(parsed.length).toBe(1);
    // 旧逻辑 /arrow/ 命中 icon-arrow-down → A 被误标正确；现在两项都应是“未识别答案”
    expect(parsed[0].choices.every(c => !c.isCorrect)).toBe(true);
  });

  it('真正的 correct_answer class 仍然有效', () => {
    const parsed = parseBlocks(`
      <div class="display_question question multiple_choice_question">
        <span class="question_name">Question 1</span>
        <div class="text">
          <div class="question_text user_content">Pick one?</div>
          <div class="answers">
            <div class="answer correct_answer"><input type="radio"><div class="answer_text">A</div></div>
            <div class="answer"><input type="radio"><div class="answer_text">B</div></div>
          </div>
        </div>
      </div>`);
    expect(parsed[0].choices[0].isCorrect).toBe(true);
    expect(parsed[0].choices[1].isCorrect).toBe(false);
  });

  it('配对题：select 没有显式 selected 属性时不再把第一项当正确答案', () => {
    const block = new DOMParser().parseFromString(`
      <div class="display_question question matching_question">
        <div class="answers"><div class="answer"><div class="answer_match">
          <div class="answer_match_left">Left 1</div>
          <div class="answer_match_right"><select>
            <option value="">[ Choose ]</option>
            <option value="1">Right A</option>
            <option value="2">Right B</option>
          </select></div>
        </div></div></div>
      </div>`, 'text/html').querySelector('.display_question');
    const data = extractMatchingQuestionData(block);
    expect(data.pairs[0].right).toBe(''); // 缺答，而不是错答 "[ Choose ]"/"Right A"
    expect(data.choicePool).toEqual(['Right A', 'Right B']); // 占位符不进选项池
  });

  it('配对题：显式 selected 属性正常取值', () => {
    const block = new DOMParser().parseFromString(`
      <div class="display_question question matching_question">
        <div class="answers"><div class="answer"><div class="answer_match">
          <div class="answer_match_left">Left 1</div>
          <div class="answer_match_right"><select>
            <option value="">[ Choose ]</option>
            <option value="1" selected="selected">Right A</option>
            <option value="2">Right B</option>
          </select></div>
        </div></div></div>
      </div>`, 'text/html').querySelector('.display_question');
    expect(extractMatchingQuestionData(block).pairs[0].right).toBe('Right A');
  });

  it('问答题保留进解析结果（kind=essay），且 buildQuestionBank 不导出它', () => {
    const parsed = parseBlocks(`
      <div class="display_question question essay_question">
        <span class="question_name">Question 4</span>
        <div class="text"><div class="question_text user_content">Explain fabric covering.</div></div>
      </div>`);
    expect(parsed.length).toBe(1);
    expect(parsed[0].kind).toBe('essay');
    expect(buildQuestionBank(parsed, 'p', 'S')).toEqual([]);
  });

  it('未知题型（如 multiple_dropdowns）不再导出 {choices:[],answer:-1} 坏记录', () => {
    const parsed = parseBlocks(`
      <div class="display_question question multiple_dropdowns_question">
        <span class="question_name">Question 5</span>
        <div class="text"><div class="question_text user_content">Dropdown stem.</div></div>
      </div>`);
    expect(parsed.length).toBe(1);
    expect(parsed[0].kind).toBe('unknown');
    expect(buildQuestionBank(parsed, 'p', 'S')).toEqual([]);
  });

  it('选项区/反馈区图片不计入题干图片数（不再造成清不掉的“缺图”）', () => {
    const parsed = parseBlocks(`
      <div class="display_question question multiple_choice_question">
        <span class="question_name">Question 6</span>
        <div class="text">
          <div class="question_text user_content">Stem <img src="https://x/files/1/preview"></div>
          <div class="answers">
            <div class="answer correct_answer"><input type="radio"><div class="answer_text">A <img src="https://x/files/2/preview"></div></div>
            <div class="answer"><input type="radio"><div class="answer_text">B</div></div>
          </div>
        </div>
      </div>`);
    expect(parsed[0].expectedImageCount).toBe(1);
    expect(parsed[0].missingImageSources).toEqual(['https://x/files/1/preview']);
  });
});

describe('A1：满分覆盖（满分时勾选与页面标注的关系）', () => {
  const fullCreditBlock = (answersHtml) => `
    <div class="display_question question multiple_choice_question">
      <span class="question_name">Question 1</span>
      <div class="user_points">1 / 1 pts</div>
      <div class="text">
        <div class="question_text user_content">Pick one?</div>
        <div class="answers">${answersHtml}</div>
      </div>
    </div>`;

  it('满分 + 勾选≠标注：保留页面标注为正确答案，并打 answerConflict（不再静默覆盖）', () => {
    const parsed = parseBlocks(fullCreditBlock(`
      <div class="answer selected_answer"><input type="radio" checked><div class="answer_text">A picked</div></div>
      <div class="answer correct_answer"><input type="radio"><div class="answer_text">B marked</div></div>
    `));
    const q = parsed[0];
    expect(q.choices[0].isCorrect).toBe(false); // 勾选项不再被强写为正确
    expect(q.choices[1].isCorrect).toBe(true);  // 页面标注保留
    expect(q.answerConflict).toBe(true);
    expect(q.answerSource).toBe('conflict');
    expect(q.conflictSelectedIndexes).toEqual([0]);

    const bank = buildQuestionBank(parsed, 'p', 'S');
    expect(bank[0].answer).toBe(1);
    expect(bank[0].answer_source).toBe('conflict');
  });

  it('满分 + 页面无任何标注：勾选项作为答案（score 推断），导出 answer_source=score', () => {
    const parsed = parseBlocks(fullCreditBlock(`
      <div class="answer selected_answer"><input type="radio" checked><div class="answer_text">A picked</div></div>
      <div class="answer"><input type="radio"><div class="answer_text">B other</div></div>
    `));
    const q = parsed[0];
    expect(q.choices[0].isCorrect).toBe(true);
    expect(q.answerDerivedFromScore).toBe(true);
    expect(q.answerConflict).toBe(false);
    expect(q.answerSource).toBe('score');

    const bank = buildQuestionBank(parsed, 'p', 'S');
    expect(bank[0].answer).toBe(0);
    expect(bank[0].answer_source).toBe('score');
  });

  it('满分 + 勾选=标注：一切如常，answer_source 不写入导出', () => {
    const parsed = parseBlocks(fullCreditBlock(`
      <div class="answer selected_answer correct_answer"><input type="radio" checked><div class="answer_text">A both</div></div>
      <div class="answer"><input type="radio"><div class="answer_text">B other</div></div>
    `));
    const q = parsed[0];
    expect(q.choices[0].isCorrect).toBe(true);
    expect(q.answerConflict).toBe(false);
    expect(q.answerSource).toBe('explicit');
    const bank = buildQuestionBank(parsed, 'p', 'S');
    expect(bank[0].answer_source).toBeUndefined();
  });
});

describe('validateQuestionBankRecords（导出校验闸）', () => {
  it('放行完整记录，剔除缺答案/选项不足/未知结构', () => {
    const { valid, rejected } = validateQuestionBankRecords([
      { id: 'ok-1', question: 'Q1', choices: ['a', 'b'], answer: 1, source: 's' },
      { id: 'ok-2', question: 'Q2', choices: ['a', 'b', 'c'], answers: [0, 2], source: 's' },
      { id: 'ok-3', question: 'Q3', type: 'fill', blanks: [['ans']], source: 's' },
      { id: 'bad-answer', question: 'Q4', choices: ['a', 'b'], answer: -1, source: 's' },
      { id: 'bad-few', question: 'Q5', choices: ['only'], answer: 0, source: 's' },
      { id: 'bad-fill', question: 'Q6', type: 'fill', blanks: [[]], source: 's' },
      { id: 'bad-shape', question: 'Q7', source: 's' },
    ]);
    expect(valid.map(r => r.id)).toEqual(['ok-1', 'ok-2', 'ok-3']);
    expect(rejected.length).toBe(4);
    expect(rejected.find(r => r.record.id === 'bad-answer').reasons[0]).toContain('正确答案');
  });

  it('图片题允许空题干', () => {
    const { valid } = validateQuestionBankRecords([
      { id: 'img-1', question: '', image: 'data:image/png;base64,x', choices: ['a', 'b'], answer: 0 },
    ]);
    expect(valid.length).toBe(1);
  });
});

describe('解析核心强化（A11 / 题型直读 / blank_id / numerical）', () => {
  it('A11：教师自定义题名撞号不再吞题，导出 id 自动消歧', () => {
    const parsed = parseBlocks(`
      <div class="display_question question multiple_choice_question" id="question_111">
        <span class="question_name">Part 2 Review</span>
        <div class="text"><div class="question_text user_content">First stem?</div>
        <div class="answers"><div class="answer correct_answer"><input type="radio"><div class="answer_text">A</div></div>
        <div class="answer"><input type="radio"><div class="answer_text">B</div></div></div></div>
      </div>
      <div class="display_question question multiple_choice_question" id="question_222">
        <span class="question_name">Question 2</span>
        <div class="text"><div class="question_text user_content">Second stem?</div>
        <div class="answers"><div class="answer correct_answer"><input type="radio"><div class="answer_text">C</div></div>
        <div class="answer"><input type="radio"><div class="answer_text">D</div></div></div></div>
      </div>`);
    expect(parsed.length).toBe(2); // 以前 byNum 撞号会吞掉一道
    const bank = buildQuestionBank(parsed, 'p', 'S');
    const ids = bank.map(r => r.id);
    expect(new Set(ids).size).toBe(2); // 导出 id 唯一（撞号者拿 2_2 后缀）
  });

  it('question_type 直读：class 缺失时凭 span 仍能识别 matching', () => {
    const parsed = parseBlocks(`
      <div class="display_question question" id="question_301">
        <span class="question_type">matching_question</span>
        <div class="text"><div class="question_text user_content">Match.</div>
        <div class="answers"><div class="answer"><div class="answer_match">
          <div class="answer_match_left">L1</div>
          <div class="answer_match_right"><select><option value="1" selected="selected">R1</option><option value="2">R2</option></select></div>
        </div></div></div></div>
      </div>`);
    expect(parsed[0].kind).toBe('matching');
    expect(parsed[0].pairs[0].right).toBe('R1');
  });

  it('blank_id 分组：没有 Answer 1/2 heading 的多空题不再混血', () => {
    const parsed = parseBlocks(`
      <div class="display_question question short_answer_question" id="question_401">
        <span class="question_type">fill_in_multiple_blanks_question</span>
        <div class="text"><div class="question_text user_content">Two blanks here.</div>
        <div class="answers">
          <div class="answer correct_answer"><span class="blank_id">b1</span><div class="answer_text">alpha</div></div>
          <div class="answer correct_answer"><span class="blank_id">b1</span><div class="answer_text">alfa</div></div>
          <div class="answer correct_answer"><span class="blank_id">b2</span><div class="answer_text">beta</div></div>
        </div></div>
      </div>`);
    expect(parsed[0].kind).toBe('fill');
    expect(parsed[0].blanks).toEqual([['alpha', 'alfa'], ['beta']]);
  });

  it('numerical：input 取不到值时回退到 answer_exact 元数据', () => {
    const parsed = parseBlocks(`
      <div class="display_question question numerical_question" id="question_501">
        <span class="question_type">numerical_question</span>
        <div class="text"><div class="question_text user_content">How many inches?</div>
        <div class="answers"><div class="answer correct_answer">
          <div class="numerical_exact_answer"><span class="answer_exact">8</span></div>
        </div></div></div>
      </div>`);
    expect(parsed[0].kind).toBe('fill');
    expect(parsed[0].blanks).toEqual([['8']]);
  });
});
