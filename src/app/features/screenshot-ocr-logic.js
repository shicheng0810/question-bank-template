const DEFAULT_MODEL = 'deepseek-v4-flash';

export function repairOcrQuestionText(raw) {
  let text = String(raw || '');
  if (!text.trim()) return text;
  text = text.replace(/^\s*(?:Question|Problem|Q\.?)\s*\d+\s*[:.\-)]\s*/i, '');
  text = text.replace(/^\s*\d+\s*[:.\-)]\s+/, '');
  text = text.replace(/ /g, ' ');
  text = text.replace(/[ \t]+\n/g, '\n');
  text = text.replace(/[ \t]{2,}/g, ' ');
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

export function repairOcrChoiceText(raw) {
  let text = String(raw || '');
  if (!text.trim()) return text;
  text = text.replace(/^\s*[(\[]?\s*[A-Ha-h]\s*[)\].:\-]\s+/, '');
  text = text.replace(/ /g, ' ');
  text = text.replace(/\s+/g, ' ');
  return text.trim();
}

export function buildDeepSeekOcrRepairPayload(parsed, options = {}) {
  const choices = Array.isArray(parsed && parsed.choices)
    ? parsed.choices.map((choice, index) => ({
      index,
      text: String(choice && choice.text || '').trim(),
    }))
    : [];
  const body = {
    question: String(parsed && parsed.qtext || '').trim(),
    choices,
    raw_text: String(parsed && parsed.ocrMeta && parsed.ocrMeta.rawText || '').trim(),
  };
  return {
    model: options.model || DEFAULT_MODEL,
    temperature: 0,
    response_format: { type: 'json_object' },
    thinking: { type: 'enabled' },
    reasoning_effort: options.reasoningEffort || 'high',
    messages: [
      {
        role: 'system',
        content: [
          'You repair OCR errors for English aviation maintenance quiz questions.',
          'CHARACTER repair: fix obvious misreads (O/0, l/1/I, m/rn), broken spacing, stray punctuation.',
          'BOUNDARY repair: OCR sometimes splits a question wrong, treating a short connector word (e.g. "with", "in", "a", "are", "is", "the") as a separate choice when it actually belongs at the end of the question stem.',
          'When the FIRST choice (index 0) is such a stray fragment:',
          ' (a) append that fragment to the end of the question text (with a space),',
          ' (b) set that choice slot to "" (empty string) to signal it should be dropped.',
          'Do the same for the LAST choice if it is similarly a stray fragment.',
          'Preserve original meaning. Do not paraphrase, translate, or reorder real choices.',
          'Return STRICT JSON only: {"question":"...","choices":["...","..."]}.',
          'choices length MUST equal the input choices length; use "" for slots you intentionally cleared.',
          'If the input is already clean, return it unchanged.',
        ].join(' '),
      },
      {
        role: 'user',
        content: JSON.stringify(body),
      },
    ],
  };
}

export function parseDeepSeekOcrRepairResponse(respJson, choiceCount) {
  const content = extractChatContent(respJson);
  let raw = null;
  try {
    raw = JSON.parse(content);
  } catch (_error) {
    const match = String(content || '').match(/\{[\s\S]*\}/);
    if (!match) throw new Error('DeepSeek OCR repair response is not valid JSON');
    raw = JSON.parse(match[0]);
  }

  const repairedQuestion = typeof (raw && raw.question) === 'string' ? raw.question.trim() : '';
  const repairedChoices = Array.isArray(raw && raw.choices)
    ? raw.choices.map((value) => String(value || '').trim())
    : [];

  const expected = Number(choiceCount);
  if (Number.isFinite(expected) && expected > 0 && repairedChoices.length !== expected) {
    throw new Error(
      `DeepSeek OCR repair returned ${repairedChoices.length} choices, expected ${expected}`,
    );
  }

  return { question: repairedQuestion, choices: repairedChoices };
}

export function applyDeepSeekOcrRepair(parsed, repair) {
  if (!parsed || !repair) return parsed;
  const next = { ...parsed };
  if (repair.question) {
    next.qtext = repair.question;
  }
  if (Array.isArray(repair.choices) && Array.isArray(parsed.choices)) {
    const remapped = [];
    let droppedCount = 0;
    parsed.choices.forEach((choice, index) => {
      const candidate = repair.choices[index];
      const isDropSignal = typeof candidate === 'string' && candidate.trim() === '';
      if (isDropSignal) {
        droppedCount += 1;
        return;
      }
      const text = typeof candidate === 'string' && candidate ? candidate : (choice && choice.text) || '';
      remapped.push({ ...choice, text });
    });
    if (remapped.length >= 2) {
      next.choices = remapped;
      if (droppedCount > 0) {
        next.ocrMeta = {
          ...(next.ocrMeta || {}),
          boundaryFragmentsRemoved: droppedCount,
        };
      }
    } else {
      next.choices = parsed.choices.map((choice, index) => {
        const candidate = repair.choices[index];
        const text = typeof candidate === 'string' && candidate ? candidate : (choice && choice.text) || '';
        return { ...choice, text };
      });
    }
  }
  return next;
}

function extractChatContent(respJson) {
  const content = respJson
    && Array.isArray(respJson.choices)
    && respJson.choices[0]
    && respJson.choices[0].message
    && respJson.choices[0].message.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((entry) => {
      if (typeof entry === 'string') return entry;
      return entry && (entry.text || entry.content || '');
    }).join('');
  }
  return JSON.stringify(respJson || {});
}
