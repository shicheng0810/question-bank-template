// Cloudflare Pages Function —— Telegram webhook：站主在 Telegram 点 [✅ 批准并开 PR] 的回调处理。
// 流程：校验密钥 + 校验是站主本人 → 从 KV 取回待审批的修正 → 在【部署仓库 question-bank】开 PR
//        改 banks/<id>.json + 追加 PENDING_SYNC.md → 合并 PR → 回执到 Telegram。
// 需要的 secret/binding：TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TELEGRAM_WEBHOOK_SECRET,
//   GITHUB_TOKEN（细粒度，仅 question-bank：Contents 读写 + PR 读写），KV binding EDITS。

const OWNER = 'shicheng0810';
const REPO = 'question-bank';
const BASE = 'main';

const norm = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

function decodeB64(b64) {
  const bin = atob(String(b64 || '').replace(/\n/g, ''));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
function encodeB64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

async function tg(env, method, body) {
  return fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }).then((r) => r.json()).catch(() => null);
}
function answerCb(env, id, text) {
  return tg(env, 'answerCallbackQuery', { callback_query_id: id, text: String(text).slice(0, 190), show_alert: true });
}

async function gh(env, method, path, body) {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      authorization: `Bearer ${env.GITHUB_TOKEN}`,
      accept: 'application/vnd.github+json',
      'user-agent': 'qb-edit-bot',
      'content-type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await res.text();
  let data;
  try { data = txt ? JSON.parse(txt) : {}; } catch { data = { raw: txt }; }
  if (!res.ok) { const e = new Error((data && data.message) || `GitHub ${res.status}`); e.status = res.status; throw e; }
  return data;
}

function applyCorrection(arr, pending) {
  const corrected = pending.corrected || {};
  if (!norm(corrected.question)) throw new Error('修正题干为空');
  const origStem = norm(pending.original && pending.original.question);
  const matches = [];
  for (let i = 0; i < arr.length; i++) if (norm(arr[i].question) === origStem) matches.push(i);
  if (!matches.length) throw new Error('题库里找不到原题（题干对不上）');
  let idx = matches[0];
  if (matches.length > 1) {
    const oc = JSON.stringify((pending.original && pending.original.choices) || []);
    const hit = matches.find((i) => JSON.stringify(arr[i].choices || []) === oc);
    if (hit !== undefined) idx = hit;
  }
  const orig = arr[idx];
  const nq = Object.assign({}, orig);
  nq.question = corrected.question;
  if (Array.isArray(corrected.choices)) {
    const ch = corrected.choices.map((c) => String(c));
    if (ch.length < 2) throw new Error('选项不足 2 个');
    nq.choices = ch;
    if (Array.isArray(corrected.answers)) {
      const a = corrected.answers.filter((x) => Number.isInteger(x) && x >= 0 && x < ch.length);
      if (!a.length) throw new Error('多选答案非法');
      nq.answers = a; delete nq.answer;
    } else if (Number.isInteger(corrected.answer) && corrected.answer >= 0 && corrected.answer < ch.length) {
      nq.answer = corrected.answer; delete nq.answers;
    } else throw new Error('正确答案越界');
  }
  arr[idx] = nq;
  return { idx, before: orig, after: nq };
}

function changedFields(r) {
  const out = [];
  if (norm(r.before.question) !== norm(r.after.question)) out.push('题干');
  if (JSON.stringify(r.before.choices || []) !== JSON.stringify(r.after.choices || [])) out.push('选项');
  if (JSON.stringify([r.before.answer, r.before.answers]) !== JSON.stringify([r.after.answer, r.after.answers])) out.push('答案');
  return out.join('、') || '(无)';
}

function prBody(bank, r, pending) {
  const fence = '```';
  const fmt = (q) => fence + 'json\n' + JSON.stringify({ question: q.question, choices: q.choices, answer: q.answer, answers: q.answers }, null, 2) + '\n' + fence;
  return [
    '访客通过站内「提议修正」提交，站主在 Telegram 批准后自动开此 PR。',
    `题库: \`${bank}\`　来源: ${pending.question_source || '-'}`,
    pending.note ? `备注: ${pending.note}` : '',
    `改动字段: ${changedFields(r)}`,
    `\n**改前**\n${fmt(r.before)}`,
    `\n**改后**\n${fmt(r.after)}`,
    '\n> 合并后 GitHub Pages 约 1 分钟更新；CF 站要等你下次 `deploy:cf`。本改动已记进 `PENDING_SYNC.md`，`deploy:cf` 会提醒你先把它同步回本地 `public/banks/`。',
  ].filter(Boolean).join('\n');
}

async function appendSyncNote(env, branch, bank, r, pending) {
  const path = 'PENDING_SYNC.md';
  let sha;
  let prev = '# 已批准、待同步回本地 public/banks/ 的修改\n\n> deploy:cf 部署前会读本文件提醒你先同步，避免本地部署覆盖掉这些已批准的改动。\n\n';
  try {
    const f = await gh(env, 'GET', `/repos/${OWNER}/${REPO}/contents/${path}?ref=${branch}`);
    sha = f.sha; prev = decodeB64(f.content);
  } catch (e) { if (e.status !== 404) throw e; }
  const date = new Date().toISOString().slice(0, 10);
  const line = `- [${date}] \`${bank}\` ${pending.question_index ? '#' + pending.question_index + ' ' : ''}「${norm(r.after.question).slice(0, 60)}」— 改了: ${changedFields(r)}\n`;
  await gh(env, 'PUT', `/repos/${OWNER}/${REPO}/contents/${path}`, Object.assign(
    { message: `chore(sync-note): ${bank} approved edit`, content: encodeB64(prev + line), branch },
    sha ? { sha } : {},
  ));
}

async function applyEditAsPR(env, pending) {
  const bank = String(pending.bank_id || '');
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(bank)) throw new Error('bank_id 非法');
  const filePath = `banks/${bank}.json`;
  const fileRes = await gh(env, 'GET', `/repos/${OWNER}/${REPO}/contents/${filePath}?ref=${BASE}`);
  const arr = JSON.parse(decodeB64(fileRes.content));
  if (!Array.isArray(arr)) throw new Error('题库文件不是数组');
  const r = applyCorrection(arr, pending);

  const ref = await gh(env, 'GET', `/repos/${OWNER}/${REPO}/git/ref/heads/${BASE}`);
  const branch = `edit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  await gh(env, 'POST', `/repos/${OWNER}/${REPO}/git/refs`, { ref: `refs/heads/${branch}`, sha: ref.object.sha });

  const stem = norm(r.after.question).slice(0, 60);
  await gh(env, 'PUT', `/repos/${OWNER}/${REPO}/contents/${filePath}`, {
    message: `fix(${bank}): visitor-approved correction — ${stem}`,
    content: encodeB64(JSON.stringify(arr, null, 2) + '\n'),
    sha: fileRes.sha, branch,
  });
  await appendSyncNote(env, branch, bank, r, pending);

  const pr = await gh(env, 'POST', `/repos/${OWNER}/${REPO}/pulls`, {
    title: `fix(${bank}): ${stem}`, head: branch, base: BASE, body: prBody(bank, r, pending),
  });
  let merged = false;
  try { const m = await gh(env, 'PUT', `/repos/${OWNER}/${REPO}/pulls/${pr.number}/merge`, { merge_method: 'squash' }); merged = !!m.merged; } catch (_e) { /* 合并失败就留着 PR */ }
  return { number: pr.number, html_url: pr.html_url, merged };
}

export async function onRequestPost(context) {
  const { request, env } = context;
  // ① 校验 webhook 密钥（只有 Telegram 带对密钥的请求才处理）
  if (request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== env.TELEGRAM_WEBHOOK_SECRET) {
    return new Response('forbidden', { status: 403 });
  }
  let update;
  try { update = await request.json(); } catch { return new Response('ok'); }
  const cq = update.callback_query;
  if (!cq) return new Response('ok'); // 只处理按钮回调

  // ② 只允许站主本人
  if (String(cq.from && cq.from.id) !== String(env.TELEGRAM_CHAT_ID)) {
    await answerCb(env, cq.id, '无权操作');
    return new Response('ok');
  }
  const data = String(cq.data || '');
  if (!data.startsWith('ap:')) { await answerCb(env, cq.id, '未知操作'); return new Response('ok'); }
  if (!env.EDITS || !env.GITHUB_TOKEN) { await answerCb(env, cq.id, '后端未配置 KV/Token'); return new Response('ok'); }

  const key = 'edit:' + data.slice(3);
  const raw = await env.EDITS.get(key);
  if (!raw) { await answerCb(env, cq.id, '已过期或已处理'); return new Response('ok'); }
  let pending;
  try { pending = JSON.parse(raw); } catch { await answerCb(env, cq.id, '数据损坏'); return new Response('ok'); }

  try {
    const pr = await applyEditAsPR(env, pending);
    await env.EDITS.delete(key); // 防重复
    await answerCb(env, cq.id, `✅ 已开 PR #${pr.number}${pr.merged ? ' 并合并' : ''}`);
    if (cq.message) {
      await tg(env, 'editMessageReplyMarkup', { chat_id: cq.message.chat.id, message_id: cq.message.message_id, reply_markup: { inline_keyboard: [] } });
      await tg(env, 'sendMessage', {
        chat_id: env.TELEGRAM_CHAT_ID,
        text: `✅ 已应用 → PR #${pr.number}${pr.merged ? '（已合并，GitHub Pages 约 1 分钟更新）' : '（待合并）'}\n${pr.html_url}`,
        disable_web_page_preview: true, reply_to_message_id: cq.message.message_id,
      });
    }
  } catch (e) {
    await answerCb(env, cq.id, '失败：' + String((e && e.message) || 'error').slice(0, 170));
  }
  return new Response('ok');
}

export function onRequestGet({ env }) {
  const keys = Object.keys(env || {});
  return new Response(JSON.stringify({
    up: true, kv: !!env.EDITS, gh: !!env.GITHUB_TOKEN,
    wh: !!env.TELEGRAM_WEBHOOK_SECRET, tg: !!env.TELEGRAM_BOT_TOKEN,
    kvish: keys.filter((k) => /edit|kv|store|namespace/i.test(k)), // 只暴露 KV 相关绑定名，排查命名
  }), { headers: { 'content-type': 'application/json' } });
}
