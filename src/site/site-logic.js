export function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function uniqueStrings(values) {
  return Array.from(new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean)));
}

export function sanitizeIdList(value) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

export function sanitizeAttemptMap(value) {
  const safe = asRecord(value) || {};
  const next = {};
  Object.entries(safe).forEach(([id, count]) => {
    const normalized = Math.max(0, Number(count || 0));
    if (!Number.isFinite(normalized) || normalized <= 0) return;
    next[String(id)] = normalized;
  });
  return next;
}

export function sanitizePlayerPrefs(value) {
  const safe = asRecord(value) || {};
  return {
    focusMode: !!safe.focusMode,
    autoSubmit: !!safe.autoSubmit,
  };
}

export function createSeededRng(seed = 1) {
  let state = (Number(seed) || 1) >>> 0;
  if (!state) state = 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export function createSiteRuntime(source = globalThis) {
  const config = source && typeof source === 'object' ? source.__QB_TEST__ || {} : {};
  const rng = typeof config.random === 'function'
    ? config.random
    : Number.isFinite(Number(config.seed))
      ? createSeededRng(Number(config.seed))
      : () => Math.random();

  const now = typeof config.now === 'function'
    ? config.now
    : Number.isFinite(Number(config.now))
      ? () => Number(config.now)
      : () => Date.now();

  const random150Limit = Math.max(1, Number(config.random150Limit || 150) || 150);

  return { rng, now, random150Limit };
}

export function makeEmptySession() {
  return {
    mode: 'all',
    ids: [],
    currentId: '',
    answers: {},
    filters: {
      search: '',
      imagesOnly: false,
      unansweredOnly: false,
      type: 'all',
      tag: 'all',
      section: 'all',
    },
    exam: {
      active: false,
      submitted: false,
      questionCount: 20,
      startedAt: 0,
      finishedAt: 0,
    },
    random150: {
      sourceIds: [],
      ids: [],
    },
  };
}

export function sanitizeSession(raw) {
  const fallback = makeEmptySession();
  const safe = asRecord(raw) || fallback;
  const safeFilters = asRecord(safe.filters) || {};
  const safeExam = asRecord(safe.exam) || {};
  const safeRandom150 = asRecord(safe.random150) || {};
  return {
    mode: ['all', 'wrong', 'starred', 'random', 'random150', 'exam'].includes(safe.mode) ? safe.mode : 'all',
    ids: sanitizeIdList(safe.ids),
    currentId: String(safe.currentId || ''),
    answers: asRecord(safe.answers) || {},
    filters: {
      search: String(safeFilters.search || ''),
      imagesOnly: !!safeFilters.imagesOnly,
      unansweredOnly: !!safeFilters.unansweredOnly,
      type: ['all', 'single', 'multi', 'fill'].includes(safeFilters.type) ? safeFilters.type : 'all',
      tag: String(safeFilters.tag || 'all'),
      section: String(safeFilters.section || 'all'),
    },
    exam: {
      active: !!safeExam.active,
      submitted: !!safeExam.submitted,
      questionCount: Math.max(1, parseInt(safeExam.questionCount || '20', 10) || 20),
      startedAt: Math.max(0, Number(safeExam.startedAt || 0)) || 0,
      finishedAt: Math.max(0, Number(safeExam.finishedAt || 0)) || 0,
    },
    random150: {
      sourceIds: sanitizeIdList(safeRandom150.sourceIds),
      ids: sanitizeIdList(safeRandom150.ids),
    },
  };
}

export function isMultiQuestion(question) {
  return Array.isArray(question && question.answers) && question.answers.length > 1;
}

export function getQuestionType(question) {
  if (Array.isArray(question && question.blanks) || (question && question.type === 'fill')) return 'fill';
  if (isMultiQuestion(question)) return 'multi';
  return 'single';
}

export function getQuestionImages(question) {
  const image = question && question.image;
  if (Array.isArray(image)) return image.filter(Boolean);
  return image ? [image] : [];
}

export function stripHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildSearchBlob(question) {
  return [
    question && question.question,
    stripHtml(question && question.question_html),
    ...asArray(question && question.choices),
    question && question.source,
    question && question.section,
    ...asArray(question && question.tags),
  ].join('\n').toLowerCase();
}

export function questionMatchesFilters(question, filters, { isQuestionTouched = () => false } = {}) {
  const search = String((filters && filters.search) || '').trim().toLowerCase();
  const tag = String((filters && filters.tag) || 'all');
  const section = String((filters && filters.section) || 'all');
  const type = String((filters && filters.type) || 'all');

  if (filters && filters.imagesOnly && !getQuestionImages(question).length) return false;
  if (filters && filters.unansweredOnly && isQuestionTouched(String((question && question.id) || ''))) return false;
  if (type !== 'all' && getQuestionType(question) !== type) return false;
  if (tag !== 'all' && !asArray(question && question.tags).map(String).includes(tag)) return false;
  if (section !== 'all' && String((question && question.section) || '') !== section) return false;
  if (!search) return true;
  return buildSearchBlob(question).includes(search);
}

function normalizeForKey(value) {
  return stripHtml(String(value || ''))
    .replace(/\u00a0/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function collapseForKey(value) {
  return normalizeForKey(value).replace(/\s+/g, '');
}

function getAnswerSignature(question) {
  if (Array.isArray(question && question.answers)) {
    return question.answers
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value >= 0)
      .sort((a, b) => a - b);
  }
  if (Number.isInteger(question && question.answer) && question.answer >= 0) return [Number(question.answer)];
  return [];
}

function normalizeImageList(image) {
  const values = Array.isArray(image) ? image : (image ? [image] : []);
  return values.map((value) => String(value || '').trim()).filter(Boolean);
}

function getBanks(question) {
  const out = [];
  if (Array.isArray(question && question.banks)) out.push(...question.banks);
  const id = String((question && question.id) || '');
  if (id.includes('-')) out.push(id.split('-')[0]);
  return uniqueStrings(out);
}

function mergeSource(left, right) {
  return uniqueStrings([
    ...(Array.isArray(left) ? left : (left ? [left] : [])),
    ...(Array.isArray(right) ? right : (right ? [right] : [])),
  ]);
}

function setImageField(question, images) {
  const unique = uniqueStrings(images);
  if (!unique.length) {
    delete question.image;
  } else {
    question.image = unique.length === 1 ? unique[0] : unique;
  }
}

function fnv1a64(value) {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const input = String(value || '');
  for (let index = 0; index < input.length; index += 1) {
    hash ^= BigInt(input.charCodeAt(index));
    hash = (hash * prime) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, '0');
}

export function makeRuntimeQuestionKey(question) {
  const type = getQuestionType(question);
  const choices = asArray(question && question.choices).map(normalizeForKey);
  const answerTexts = getAnswerSignature(question)
    .filter((index) => index >= 0 && index < choices.length)
    .map((index) => choices[index])
    .filter(Boolean)
    .sort();
  const blanks = Array.isArray(question && question.blanks)
    ? question.blanks.map((blank) => asArray(blank).map(normalizeForKey).filter(Boolean).sort())
    : [];
  return JSON.stringify({
    question: normalizeForKey((question && question.question) || stripHtml(question && question.question_html)),
    type,
    choices: type === 'single' || type === 'multi' ? choices.slice().sort() : [],
    answers: type === 'single' || type === 'multi' ? answerTexts : [],
    blanks,
    images: normalizeImageList(question && question.image).map(collapseForKey).sort(),
  });
}

export function normalizeQuestionBankForRuntime(rawQuestions) {
  const byKey = new Map();
  const alias = {};
  const questions = [];
  asArray(rawQuestions).forEach((question) => {
    if (!question) return;
    const key = makeRuntimeQuestionKey(question);
    let canonical = byKey.get(key);
    if (!canonical) {
      canonical = JSON.parse(JSON.stringify(question));
      canonical.id = `q_${fnv1a64(key)}`;
      canonical.banks = getBanks(question);
      canonical.source = mergeSource([], question.source);
      setImageField(canonical, normalizeImageList(question.image));
      byKey.set(key, canonical);
      questions.push(canonical);
    } else {
      canonical.banks = uniqueStrings([...asArray(canonical.banks), ...getBanks(question)]);
      canonical.source = mergeSource(canonical.source, question.source);
      setImageField(canonical, [...normalizeImageList(canonical.image), ...normalizeImageList(question.image)]);
      if (!canonical.question_html && question.question_html) canonical.question_html = question.question_html;
      if (!Array.isArray(canonical.blanks) && Array.isArray(question.blanks)) {
        canonical.blanks = JSON.parse(JSON.stringify(question.blanks));
      }
      if (!canonical.explanation && question.explanation) canonical.explanation = question.explanation;
    }
    if (question.id) alias[String(question.id)] = canonical.id;
    alias[canonical.id] = canonical.id;
  });
  questions.forEach((question) => {
    if (Array.isArray(question.source) && question.source.length <= 1) question.source = question.source[0] || '';
    if (Array.isArray(question.banks)) question.banks = question.banks.filter(Boolean);
  });
  return { questions, alias };
}

function mapAlias(id, alias) {
  const key = String(id || '');
  return String((alias && alias[key]) || key);
}

function isValidMappedId(id, validIds) {
  return !validIds || validIds.has(String(id || ''));
}

export function applyQuestionIdAliasToState({
  validIds,
  alias = {},
  ids = [],
  starred = new Set(),
  wrong = new Set(),
  attempts = {},
  answers = {},
} = {}) {
  const nextIds = [];
  sanitizeIdList(ids).forEach((id) => {
    const mapped = mapAlias(id, alias);
    if (!isValidMappedId(mapped, validIds) || nextIds.includes(mapped)) return;
    nextIds.push(mapped);
  });

  const mapSet = (setValue) => {
    const next = new Set();
    Array.from(setValue || []).forEach((id) => {
      const mapped = mapAlias(id, alias);
      if (isValidMappedId(mapped, validIds)) next.add(mapped);
    });
    return next;
  };

  const nextAttempts = {};
  Object.entries(sanitizeAttemptMap(attempts)).forEach(([id, count]) => {
    const mapped = mapAlias(id, alias);
    if (!isValidMappedId(mapped, validIds)) return;
    nextAttempts[mapped] = Math.max(Number(nextAttempts[mapped] || 0), Number(count || 0));
  });

  const nextAnswers = {};
  Object.entries(asRecord(answers) || {}).forEach(([id, answerState]) => {
    const mapped = mapAlias(id, alias);
    if (!isValidMappedId(mapped, validIds)) return;
    if (!nextAnswers[mapped]) nextAnswers[mapped] = answerState;
  });

  return {
    ids: nextIds,
    starred: mapSet(starred),
    wrong: mapSet(wrong),
    attempts: nextAttempts,
    answers: nextAnswers,
  };
}

function eqLoose(left, right) {
  const normalize = (value) => String(value ?? '').replace(/\u00a0/g, ' ').trim().toLowerCase().replace(/\s+/g, ' ');
  const collapse = (value) => normalize(value).replace(/\s+/g, '');
  return normalize(left) === normalize(right) || collapse(left) === collapse(right);
}

export function evaluateFillAnswer(question, fills) {
  const blanks = Array.isArray(question && question.blanks) ? question.blanks : [];
  const inputs = Array.isArray(fills) ? fills : [];
  if (!blanks.length) {
    return { isAnswered: false, isCorrect: false, accepted: [] };
  }
  if (inputs.length < blanks.length || blanks.some((_, index) => !String(inputs[index] ?? '').trim())) {
    return { isAnswered: false, isCorrect: false, accepted: blanks };
  }

  const answerSets = Array.isArray(question && question.answer_sets) ? question.answer_sets : [];
  if (answerSets.length) {
    const matchesSet = answerSets.some((set) => {
      if (!Array.isArray(set) || set.length !== blanks.length) return false;
      return set.every((expected, index) => {
        const accepted = Array.isArray(expected) ? expected : [expected];
        return accepted.some((value) => eqLoose(inputs[index], value));
      });
    });
    if (matchesSet) return { isAnswered: true, isCorrect: true, accepted: answerSets };
  }

  const matchesBlanks = blanks.every((accepted, index) => asArray(accepted).some((value) => eqLoose(inputs[index], value)));
  return {
    isAnswered: true,
    isCorrect: matchesBlanks,
    accepted: answerSets.length ? answerSets : blanks,
  };
}

export function weightedSampleQuestionIds(questions, limit, { attempts = {}, rng = Math.random } = {}) {
  return asArray(questions)
    .map((question, index) => {
      const id = String((question && question.id) || '');
      const answered = Math.max(0, Number((attempts && attempts[id]) || 0));
      const weight = Math.max(0.0001, 1 / (1 + answered));
      const randomValue = Math.max(Number(rng()) || 0, 1e-9);
      return {
        id,
        index,
        key: Math.log(randomValue) / weight,
      };
    })
    .filter((item) => item.id)
    .sort((left, right) => (right.key - left.key) || (left.index - right.index))
    .slice(0, Math.max(0, Number(limit) || 0))
    .map((item) => item.id);
}

export function computeScopedReviewCounts({
  allQuestions = [],
  scopeQuestions = [],
  starred = new Set(),
  wrong = new Set(),
} = {}) {
  const count = (questions, setValue) => asArray(questions).reduce((total, question) => (
    setValue.has(String((question && question.id) || '')) ? total + 1 : total
  ), 0);
  return {
    starredInScope: count(scopeQuestions, starred),
    starredTotal: count(allQuestions, starred),
    wrongInScope: count(scopeQuestions, wrong),
    wrongTotal: count(allQuestions, wrong),
  };
}

export function recordPracticeResult(wrongSet, id, isCorrect) {
  const next = new Set(wrongSet || []);
  const key = String(id || '');
  if (!key) return next;
  if (!isCorrect) next.add(key);
  return next;
}

export function getModeBaseQuestions(questions, mode, filters, {
  starred = new Set(),
  wrong = new Set(),
  isQuestionTouched = () => false,
} = {}) {
  let candidates = Array.isArray(questions) ? questions.slice() : [];
  if (mode === 'wrong') candidates = candidates.filter((question) => wrong.has(String((question && question.id) || '')));
  else if (mode === 'starred') candidates = candidates.filter((question) => starred.has(String((question && question.id) || '')));
  return candidates.filter((question) => questionMatchesFilters(question, filters, { isQuestionTouched }));
}

export function shuffleWithRng(list, rng = Math.random) {
  const arr = Array.isArray(list) ? list.slice() : [];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function createSessionForMode({
  mode,
  questions,
  filters,
  answers = {},
  wrong = new Set(),
  starred = new Set(),
  examCount = 20,
  attempts = {},
  random150Limit = 150,
  random150SourceIds = [],
  random150Ids = [],
  now = Date.now,
  rng = Math.random,
  isQuestionTouched = () => false,
} = {}) {
  const safeFilters = { ...makeEmptySession().filters, ...(filters || {}) };
  const baseQuestions = getModeBaseQuestions(questions, mode, safeFilters, { wrong, starred, isQuestionTouched });
  let ids = baseQuestions.map((question) => String((question && question.id) || ''));
  let exam = makeEmptySession().exam;
  let random150 = makeEmptySession().random150;

  if (mode === 'random') ids = shuffleWithRng(ids, rng);
  if (mode === 'random150') {
    const sourceIds = sanitizeIdList(random150SourceIds).length ? sanitizeIdList(random150SourceIds) : ids;
    const sourceSet = new Set(sourceIds);
    const sourceQuestions = asArray(questions).filter((question) => sourceSet.has(String((question && question.id) || '')));
    const limit = Math.max(1, Number(random150Limit) || 150);
    ids = sanitizeIdList(random150Ids).length
      ? sanitizeIdList(random150Ids).filter((id) => sourceSet.has(id)).slice(0, limit)
      : weightedSampleQuestionIds(sourceQuestions, Math.min(limit, sourceQuestions.length), { attempts, rng });
    random150 = { sourceIds, ids };
  }
  if (mode === 'exam') {
    ids = shuffleWithRng(ids, rng).slice(0, Math.min(Math.max(1, Number(examCount) || 20), ids.length));
    exam = {
      active: true,
      submitted: false,
      questionCount: Math.max(1, Number(examCount) || 20),
      startedAt: now(),
      finishedAt: 0,
    };
  }

  return {
    mode,
    ids,
    currentId: ids[0] || '',
    answers: answers && typeof answers === 'object' ? answers : {},
    filters: safeFilters,
    exam,
    random150,
  };
}

export function recomputeSessionIds({
  session,
  questions,
  wrong = new Set(),
  starred = new Set(),
  rng = Math.random,
  isQuestionTouched = () => false,
} = {}) {
  const safeSession = sanitizeSession(session);
  const currentMode = safeSession.mode || 'all';
  const currentId = safeSession.currentId;
  const baseQuestions = getModeBaseQuestions(questions, currentMode, safeSession.filters, { wrong, starred, isQuestionTouched });
  let ids = baseQuestions.map((question) => String((question && question.id) || ''));
  if (currentMode === 'random') ids = shuffleWithRng(ids, rng);
  if (currentMode === 'random150') {
    const validIds = new Set(asArray(questions).map((question) => String((question && question.id) || '')));
    const sourceIds = safeSession.random150.sourceIds.filter((id) => validIds.has(id));
    const sampledIds = safeSession.random150.ids.filter((id) => sourceIds.includes(id));
    ids = sampledIds;
    return {
      ...safeSession,
      ids,
      currentId: ids.includes(currentId) ? currentId : (ids[0] || ''),
      random150: { sourceIds, ids },
    };
  }
  if (currentMode === 'exam' && safeSession.exam.active) {
    ids = safeSession.ids.filter((id) => ids.includes(id));
  }
  return {
    ...safeSession,
    ids,
    currentId: ids.includes(currentId) ? currentId : (ids[0] || ''),
  };
}
