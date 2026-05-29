export {
  isCanvasCorrectQuestionBlockClass,
  shouldUseSelectedAnswersAsCorrectFallback,
} from './canvas-answer-fallback.js';

// Derived from the extractor core for automated tests.


export function tryParseJSONArray(s){
  const t = (s || '').trim();
  if (!t) return null;
  try{
    const obj = JSON.parse(t);
    if (Array.isArray(obj)) return obj;
    if (obj && typeof obj === 'object') return [obj];
    return null;
  }catch{
    return null;
  }
}

export function extractBracketedJSONArray(source, startIndex){
  const start = String(source || '').indexOf('[', Math.max(0, startIndex || 0));
  if (start < 0) return '';
  let depth = 0;
  let inStr = false;
  let quote = '';
  let esc = false;
  for (let i = start; i < source.length; i++){
    const ch = source[i];
    if (inStr){
      if (esc){ esc = false; continue; }
      if (ch === '\\'){ esc = true; continue; }
      if (ch === quote){ inStr = false; quote = ''; }
      continue;
    }
    if (ch === '"' || ch === "'"){
      inStr = true;
      quote = ch;
      continue;
    }
    if (ch === '[') depth++;
    else if (ch === ']'){
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return '';
}

// Variable names that may hold an embedded question-bank array, in priority order.
// LEGACY_BANK_PAYLOAD is the current single-file export format and must be tried first,
// because those files also declare `let RAW_QUESTION_BANK = []` (an empty placeholder that
// is filled at runtime) — matching that first would wrongly yield an empty bank.
const QUESTION_BANK_TOKENS = [
  'LEGACY_BANK_PAYLOAD',
  'RAW_QUESTION_BANK',
  'QUESTION_BANK',
  'const data =',
  'window.__QUESTION_BANK__',
  'window.QUESTION_BANK',
];

function findQuestionBankArrayByTokens(source){
  const text = String(source || '');
  for (const token of QUESTION_BANK_TOKENS){
    let from = 0;
    let idx;
    while ((idx = text.indexOf(token, from)) >= 0){
      const arrText = extractBracketedJSONArray(text, idx);
      const parsed = tryParseJSONArray(arrText);
      // Skip empty placeholder declarations; keep scanning for a populated array.
      if (parsed && parsed.length) return parsed;
      from = idx + token.length;
    }
  }
  return null;
}

export function extractQuestionBankArrayFromText(raw){
  const text = String(raw || '').trim();
  if (!text) throw new Error('文件为空');

  const direct = tryParseJSONArray(text);
  if (direct && direct.length) return direct;

  const fromText = findQuestionBankArrayByTokens(text);
  if (fromText) return fromText;

  const scripts = Array.from(new DOMParser().parseFromString(text, 'text/html').querySelectorAll('script'));
  for (const script of scripts){
    const fromScript = findQuestionBankArrayByTokens(script.textContent || '');
    if (fromScript) return fromScript;
  }

  // A directly-parsed but empty array is still a valid (empty) bank.
  if (direct) return direct;

  throw new Error('未能从该文件中定位题库 JSON 数组');
}

export function makeSafeJSONForScript(jsonStr){
  // 防止生成的题库网页在 <script> 内注入 JSON 时被某些字符截断或导致语法错误：
  // 1) <\/script> 会提前结束 script 标签
  // 2) U+2028 / U+2029 在 JS 字符串里会被当成换行，导致语法错误（JSON.stringify 可能原样输出）
  return (jsonStr || '')
    .replace(/<\/script>/gi, '<\\/script>')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function injectQuestionBankJSON(tpl, jsonStr){
  // Template uses a marker literal: __QUESTION_BANK_JSON__
  const marker = '__QUESTION_BANK_JSON__';
  if (!tpl.includes(marker)){
    throw new Error('无法在题库模板中定位 QUESTION_BANK marker（__QUESTION_BANK_JSON__）。');
  }
  return tpl.replace(marker, jsonStr);
}

export function downloadTextAsFile(text, filename, mime){
  const blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'download.html';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 8000);
}

export function safeJSONStringForScript(jsonStr){
  // Make JSON safe to inline into <script> as JS literal (no literal closing-tag sequences here).
  return (jsonStr || '')
    .replace(/<\/script>/gi, '<\\/script>')
    .replace(/<\//g, '<\\/')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function countCorrectChoiceAnswers(q){
  return ((q && q.choices) || []).reduce((n,c)=> n + (c && c.isCorrect ? 1 : 0), 0);
}

export function normalizeChoiceQuestionShape(q){
  if (!q || q.kind !== 'choice') return q;
  if (!q.isMulti) return q;
  if (countCorrectChoiceAnswers(q) === 1) q.isMulti = false;
  return q;
}

export function canGenerateQBank(){
  const hasParsed = datasets.filter(x=>x.parsedReady).length > 0;
  if (hasParsed) return true;

  const t = (out && out.value ? out.value.trim() : '');
  if (!t) return false;
  try{
    const obj = JSON.parse(t);
    if (Array.isArray(obj) && obj.length) return true;
    if (obj && typeof obj === 'object') return true;
  }catch{}
  return false;
}


export function uniqueNonEmptyStrings(arr){
  return Array.from(new Set((arr || []).map(v => String(v || '').trim()).filter(Boolean)));
}

export function getQuestionImages(q){
  const base = Array.isArray(q && q.images) ? q.images : [];
  const uploaded = Array.isArray(q && q.uploadedImages) ? q.uploadedImages : [];
  return [...base, ...uploaded].filter(Boolean);
}

export function getMatchingChoicePool(q){
  const pool = [];
  (q && q.choicePool || []).forEach(v => pool.push(v));
  (q && q.pairs || []).forEach(p => {
    if (p && p.right) pool.push(p.right);
  });
  return uniqueNonEmptyStrings(pool);
}

export function buildMatchingSubQuestionText(q, pair){
  const stem = String((q && q.qtext) || '').trim();
  const left = String((pair && pair.left) || '').trim();
  if (!stem) return left || '(配对题子项)';
  if (!left) return stem;
  return `${stem} [${left}]`;
}


export function buildMatchingChoicesForPair(pair, pool){
  const correct = String((pair && pair.right) || '').trim();
  const arr = uniqueNonEmptyStrings([correct, ...(pool || [])]);
  if (correct){
    const idx = arr.indexOf(correct);
    if (idx > 0){
      arr.splice(idx, 1);
      arr.unshift(correct);
    }
  }
  return arr;
}

/* -------------------- 导出 QUESTION_BANK -------------------- */
export function buildQuestionBank(data, prefix, sourcePrefix){
  const arr = [];
  data.forEach(q=>{
    normalizeChoiceQuestionShape(q);
    const computedId = `${prefix}-${q.idSuffix || q.num}`;
    const computedSource = `${sourcePrefix} – Q${q.sourceNum || q.num}`;
    const id = q && q.preserveOriginalMeta && q.importedId ? q.importedId : computedId;
    const src = q && q.preserveOriginalMeta && q.importedSource ? q.importedSource : computedSource;
    const qImages = getQuestionImages(q);
    const imgField = qImages.length
      ? (qImages.length===1 ? { image:qImages[0] } : { image:qImages })
      : {};

    const kind = q.kind || 'choice';

    if (kind === 'fill'){
      const blanks = (q.blanks && q.blanks.length) ? q.blanks : [[]];
      const obj = { id, question:q.qtext, blanks, source:src, type:'fill', ...imgField };
      if (q.qhtml) obj.question_html = q.qhtml; // 题干里带输入框的位置（后续 question_bank 用）
      arr.push(obj);
      return;
    }

    if (kind === 'essay'){
      // 忽略问答/主观题：不导出到题库
      return;
    }

    if (kind === 'matching'){
      const pairs = q.pairs || [];
      const pool = getMatchingChoicePool(q);
      pairs.forEach((pair, idx) => {
        const subId = `${id}_m${idx+1}`;
        const subSrc = `${sourcePrefix} – Q${q.num}.${idx+1}`;
        const choices = buildMatchingChoicesForPair(pair, pool);
        const correctText = String((pair && pair.right) || '').trim();
        const answer = choices.findIndex(c => c === correctText);
        arr.push({
          id: subId,
          question: buildMatchingSubQuestionText(q, pair),
          choices,
          answer,
          source: subSrc,
          ...imgField,
        });
      });
      return;
    }

    // 默认：选择题
    const choices = (q.choices || []).map(c=>c.text);

    if (q.isMulti){
      const answers = (q.choices || []).reduce((acc,c,i)=> c.isCorrect ? acc.concat(i) : acc, []);
      if (answers.length === 1){
        arr.push({ id, question:q.qtext, choices, answer:answers[0], source:src, ...imgField });
      }else{
        arr.push({ id, question:q.qtext, choices, answers, source:src, ...imgField });
      }
    }else{
      const answer = (q.choices || []).findIndex(c=>c.isCorrect);
      arr.push({ id, question:q.qtext, choices, answer, source:src, ...imgField });
    }
  });
  return arr;
}

export function flattenSourceList(src){
  if (Array.isArray(src)) return src.flatMap(flattenSourceList);
  const s = String(src || '').trim();
  return s ? [s] : [];
}

export function normalizeTextForMerge(v){
  // Case-insensitive: matches the runtime players (site-logic normalizeForKey + the legacy
  // template normText both lowercase), so export-time dedup and load-time dedup agree.
  return cleanHTMLString(String(v || '')).replace(/\s+/g, ' ').trim().toLowerCase();
}

export function hashStringForMerge(str){
  const s = String(str || '');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++){
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36) + '_' + s.length;
}

export function normalizeImageFingerprints(image){
  const arr = Array.isArray(image) ? image : (image ? [image] : []);
  return arr
    .map(v => String(v || '').trim())
    .filter(Boolean)
    .map(v => hashStringForMerge(v))
    .sort();
}

export function getAnswerSignature(item){
  if (Array.isArray(item && item.answers)){
    return item.answers
      .map(v => Number(v))
      .filter(v => Number.isInteger(v) && v >= 0)
      .sort((a,b)=>a-b);
  }
  if (Number.isInteger(item && item.answer) && item.answer >= 0) return [Number(item.answer)];
  return [];
}

export function applyAnswerSignature(item, sig){
  const arr = Array.from(new Set((sig || []).filter(v => Number.isInteger(v) && v >= 0))).sort((a,b)=>a-b);
  delete item.answer;
  delete item.answers;
  if (!arr.length) return item;
  if (arr.length === 1) item.answer = arr[0];
  else item.answers = arr;
  return item;
}

export function mergeAnswerSignature(baseSig, nextSig){
  const a = Array.from(new Set(baseSig || [])).sort((x,y)=>x-y);
  const b = Array.from(new Set(nextSig || [])).sort((x,y)=>x-y);
  if (!a.length) return b;
  if (!b.length) return a;
  const aSet = new Set(a);
  const bSet = new Set(b);
  const aInB = a.every(v => bSet.has(v));
  const bInA = b.every(v => aSet.has(v));
  if (aInB && !bInA) return b;
  if (bInA) return a;
  if (a.length === b.length && a.every((v,i)=>v===b[i])) return a;
  return a;
}

export function makeUniqueQuestionKey(item){
  const type = item && (item.type === 'fill' || Array.isArray(item.blanks))
    ? 'fill'
    : (item && item.type === 'essay')
      ? 'essay'
      : Array.isArray(item && item.answers)
        ? 'multi'
        : 'single';
  const choices = Array.isArray(item && item.choices) ? item.choices.map(normalizeTextForMerge) : [];
  const answerIndexes = getAnswerSignature(item).filter(index => index >= 0 && index < choices.length);
  const answerTexts = answerIndexes.map(index => choices[index]).filter(Boolean).sort();
  const blanks = Array.isArray(item && item.blanks)
    ? item.blanks.map(arr => Array.isArray(arr) ? arr.map(normalizeTextForMerge).filter(Boolean).sort() : [])
    : [];
  const isChoice = type === 'single' || type === 'multi';
  // Smart merge: a question's identity is its stem + correct-answer text, independent of
  // distractor wording. The same question imported from two sources often has reworded /
  // reordered wrong options (OCR or source variation); those should still fuse. We only
  // fall back to the full choice set when the correct answer is unknown, so that distinct
  // unanswered questions sharing a stem are not over-merged.
  const hasAnswer = isChoice && answerTexts.length > 0;
  return JSON.stringify({
    q: normalizeTextForMerge(item && item.question),
    type,
    choices: isChoice && !hasAnswer ? choices.slice().sort() : [],
    answers: isChoice ? answerTexts : [],
    blanks,
    images: normalizeImageFingerprints(item && item.image),
  });
}

export function mergeUniqueQuestionRecord(base, incoming){
  const mergedSources = uniqueNonEmptyStrings([
    ...flattenSourceList(base && base.source),
    ...flattenSourceList(incoming && incoming.source),
  ]);
  base.source = mergedSources;

  if (!base.question_html && incoming && incoming.question_html) base.question_html = incoming.question_html;
  if (!base.image && incoming && incoming.image) base.image = Array.isArray(incoming.image) ? incoming.image.slice() : incoming.image;
  if (!Array.isArray(base.blanks) && Array.isArray(incoming && incoming.blanks)) base.blanks = JSON.parse(JSON.stringify(incoming.blanks));

  const mergedSig = mergeAnswerSignature(getAnswerSignature(base), getAnswerSignature(incoming));
  applyAnswerSignature(base, mergedSig);
  return base;
}


/* -------------------- 自动从文件名抽取前缀 -------------------- */
export function guessMetaFromFilename(name){
  const base = String(name || '').replace(/\.[^.]+$/,'').trim();

  const simpleUnderscoreMatch = base.match(/^(.+?)\s*_\s*([A-Za-z0-9]{1,8})$/);
  if (simpleUnderscoreMatch) {
    const bankPrefix = String(simpleUnderscoreMatch[1] || '').trim();
    const suffixToken = String(simpleUnderscoreMatch[2] || '').trim();
    if (bankPrefix && suffixToken) {
      return {
        prefix: bankPrefix,
        sourcePrefix: `Test_${bankPrefix}_${suffixToken}`
      };
    }
  }

  const left = base.split('_')[0].trim();
  const normalizedLeft = left
    .replace(/[–—]/g, '-')
    .replace(/[_]+/g, ' ')
    .replace(/\s*-\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const courseMatch = base.match(/AMT[&]?\s*(\d{3})/i);
  const courseDigits = courseMatch ? courseMatch[1] : '';
  const courseCode = courseDigits ? `AMT${courseDigits}` : '';

  const word2num = {
    one:1,two:2,three:3,four:4,five:5,
    six:6,seven:7,eight:8,nine:9,ten:10,
    eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,
    sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20
  };
  const numWordsPattern = Object.keys(word2num).join('|');

  const slugify = s => String(s || '')
    .toLowerCase()
    .replace(/&/g,'and')
    .replace(/[^a-z0-9]+/g,'_')
    .replace(/^_+|_+$/g,'')
    .replace(/_+/g,'_');

  const toNum = token => {
    const t = String(token || '').trim().toLowerCase();
    if (!t) return '';
    if (/^\d+$/.test(t)) return String(parseInt(t, 10));
    return word2num[t] ? String(word2num[t]) : '';
  };

  const pickNumber = s => {
    if (!s) return '';
    const m = s.match(new RegExp(`\\b(?:#\\s*)?(\\d+|${numWordsPattern})\\b`, 'i'));
    return m ? toNum(m[1]) : '';
  };

  const pickDay = s => {
    if (!s) return '';
    const m = s.match(new RegExp(`\\b(?:d|day)\\s*[-#]?\\s*(\\d+|${numWordsPattern})\\b`, 'i'));
    const n = m ? toNum(m[1]) : '';
    return n ? `d${n}` : '';
  };

  let typePrefix = 'quiz';
  let typeLabel = 'Quiz';
  let typePattern = /\bquiz\b/i;
  if (/\bhomework\b/i.test(normalizedLeft)) {
    typePrefix = 'hw';
    typeLabel = 'Homework';
    typePattern = /\bhomework\b/i;
  } else if (/\blab\s+quiz\b/i.test(normalizedLeft)) {
    typePrefix = 'labq';
    typeLabel = 'Lab Quiz';
    typePattern = /\blab\s+quiz\b/i;
  } else if (/\blecture\b.*\bquiz\b|\bquiz\b.*\blecture\b/i.test(normalizedLeft)) {
    typePrefix = 'lecq';
    typeLabel = 'Lecture Quiz';
    typePattern = /\blecture\b.*\bquiz\b|\bquiz\b.*\blecture\b/i;
  } else if (/\bpractice\b.*\bquiz\b|\bquiz\b.*\bpractice\b/i.test(normalizedLeft)) {
    typePrefix = 'pquiz';
    typeLabel = 'Practice Quiz';
    typePattern = /\bpractice\b.*\bquiz\b|\bquiz\b.*\bpractice\b/i;
  } else if (/\bassignment\b/i.test(normalizedLeft)) {
    typePrefix = 'ass';
    typeLabel = 'Assignment';
    typePattern = /\bassignment\b/i;
  } else if (/\btest\b/i.test(normalizedLeft)) {
    typePrefix = 'test';
    typeLabel = 'Test';
    typePattern = /\btest\b/i;
  } else if (/\bexam\b/i.test(normalizedLeft)) {
    typePrefix = 'exam';
    typeLabel = 'Exam';
    typePattern = /\bexam\b/i;
  } else if (/\bquiz\b/i.test(normalizedLeft)) {
    typePrefix = 'quiz';
    typeLabel = 'Quiz';
    typePattern = /\bquiz\b/i;
  }

  const dayToken = pickDay(normalizedLeft);
  const noDay = normalizedLeft.replace(new RegExp(`\\b(?:d|day)\\s*[-#]?\\s*(\\d+|${numWordsPattern})\\b`, 'ig'), ' ');
  const numberToken = pickNumber(noDay);

  let sequenceToken = '';
  if (dayToken) sequenceToken = String(dayToken).replace(/^d/i, '');
  else if (numberToken) sequenceToken = numberToken;

  const prefixParts = [typePrefix];
  if (sequenceToken) prefixParts.push(sequenceToken);
  if (courseDigits) prefixParts.push(courseDigits);

  let prefix = prefixParts.filter(Boolean).join('_');
  if (!prefix) prefix = courseDigits ? `bank_${courseDigits}` : 'question_bank';

  let descriptor = normalizedLeft;
  descriptor = descriptor.replace(typePattern, ' ');
  descriptor = descriptor.replace(new RegExp(`\\b(?:d|day)\\s*[-#]?\\s*(\\d+|${numWordsPattern})\\b`, 'ig'), ' ');
  descriptor = descriptor.replace(new RegExp(`\\b(?:#\\s*)?(\\d+|${numWordsPattern})\\b`, 'ig'), ' ');
  descriptor = descriptor.replace(/^[\s\-_:]+|[\s\-_:]+$/g, '');
  descriptor = descriptor.replace(/\s+/g, ' ').trim();

  const sourceBits = [typeLabel];
  if (descriptor) sourceBits.push(descriptor);
  if (sequenceToken) sourceBits.push(`#${sequenceToken}`);
  const sourceLabel = sourceBits.join(' – ').replace(/\s+/g, ' ').trim() || normalizedLeft || 'Question Bank';
  const sourcePrefix = courseCode ? `${courseCode} – ${sourceLabel}` : sourceLabel;

  return { prefix, sourcePrefix };
}


export function parseHeaders(h){
  const out = {};
  h.split(/\r?\n/).forEach(line=>{
    const m=line.match(/^([\w\-]+):\s*(.*)$/);
    if (m) out[m[1].toLowerCase()]=m[2];
  });
  return out;
}
export function base64ToBytes(b64){const bin=atob(b64);const len=bin.length;const bytes=new Uint8Array(len);for(let i=0;i<len;i++)bytes[i]=bin.charCodeAt(i)&0xff;return bytes;}
export function bytesToBase64(bytes){let bin='';for(let i=0;i<bytes.length;i++)bin+=String.fromCharCode(bytes[i]);return btoa(bin);}
export function qpToBytes(qp){qp=qp.replace(/=\r?\n/g,'');const out=[];for(let i=0;i<qp.length;i++){if(qp[i]==='='&&/^[0-9A-Fa-f]{2}$/.test(qp.substr(i+1,2))){out.push(parseInt(qp.substr(i+1,2),16));i+=2;}else{out.push(qp.charCodeAt(i)&0xff);}}return new Uint8Array(out);}
export function strToBytes(str){const arr=new Uint8Array(str.length);for(let i=0;i<str.length;i++)arr[i]=str.charCodeAt(i)&0xff;return arr;}
export function bytesToUTF8(bytes){try{return new TextDecoder('utf-8').decode(bytes);}catch{ return String.fromCharCode.apply(null, bytes);} }


export function parseFillInputToAnswers(str){
  const parts = (str||'').split('|').map(s=>s.trim()).filter(Boolean);
  return Array.from(new Set(parts));
}

export function cleanHTML(el){
  const clone = el.cloneNode(true);
  clone.querySelectorAll('script,style,button,.links,.move,.regrade_option').forEach(n=>n.remove());
  return (clone.textContent||'')
    .replace(/\s+\n/g,'\n')
    .replace(/\u00a0/g,' ')
    .replace(/[ \t]{2,}/g,' ')
    .trim();
}
export function cleanHTMLString(s){
  const tmp=document.createElement('div');
  tmp.innerHTML=s;
  return cleanHTML(tmp);
}

export function buildUniqueMergedQuestionBankFromCollections(collections) {
  const all = [];
  for (const items of collections || []) {
    for (const item of items || []) all.push(item);
  }

  const seen = new Map();
  const merged = [];
  all.forEach(item => {
    const key = makeUniqueQuestionKey(item);
    if (!seen.has(key)) {
      const cloned = JSON.parse(JSON.stringify(item));
      cloned.source = uniqueNonEmptyStrings(flattenSourceList(cloned.source));
      seen.set(key, cloned);
      merged.push(cloned);
      return;
    }
    mergeUniqueQuestionRecord(seen.get(key), item);
  });

  return merged;
}
