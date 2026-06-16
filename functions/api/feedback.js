// Cloudflare Pages Function —— 访客反馈接收端点 /api/feedback
// 放在仓库根 functions/ 下，和 docs/ 平级；`wrangler pages deploy docs` 会自动随之上线
// （functions/ 相对 CWD 解析，不在 docs/ 里，build-pages 的 rmSync 碰不到它）。
//
// 反馈 → 转发到站主 Telegram。防滥用：蜜罐 + 字段长度上限 +（可选）Turnstile +（可选）KV 限流。
// 需要的 Secret（wrangler pages secret put ...）：
//   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
// 可选：TURNSTILE_SECRET_KEY（配了才校验验证码）、KV binding `RL`（绑了才限流）
//
// GitHub Pages 镜像没有 Functions：镜像站前端用绝对 URL 打到本端点，这里开了 CORS 放行该来源。

const ALLOW_ORIGINS = [
  'https://question-bank-78u.pages.dev',
  'https://shicheng0810.github.io',
];
const MAX = { type: 24, bankId: 80, qId: 80, page: 300, message: 2000, contact: 160, stem: 200, source: 160 };

function corsHeaders(origin) {
  const allow = ALLOW_ORIGINS.includes(origin) ? origin : ALLOW_ORIGINS[0];
  return {
    'access-control-allow-origin': allow,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
  };
}
function json(obj, status, origin) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...corsHeaders(origin) },
  });
}
const clip = (v, n) => (typeof v === 'string' ? v : '').slice(0, n).trim();
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('Origin') || '') });
}

export function onRequestGet({ request }) {
  // 健康检查：部署后浏览器访问 /api/feedback 应见此文本（而非 404/HTML）
  return new Response('feedback endpoint up', {
    headers: { 'content-type': 'text/plain; charset=utf-8', ...corsHeaders(request.headers.get('Origin') || '') },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const origin = request.headers.get('Origin') || '';
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';

  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    return json({ ok: false, error: 'not_configured' }, 503, origin);
  }

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'bad_json' }, 400, origin); }

  // 蜜罐：正常用户不会填这个隐藏字段，填了直接当成功丢弃（不告诉机器人被拦）
  if (clip(body.hp || body.website, 100)) return json({ ok: true, dropped: true }, 200, origin);

  // 可选 Turnstile（仅当配置了 secret 才强制）
  if (env.TURNSTILE_SECRET_KEY) {
    const token = clip(body['cf-turnstile-response'], 4096);
    if (!token) return json({ ok: false, error: 'captcha_missing' }, 400, origin);
    const v = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY, response: token, remoteip: ip }),
    }).then((r) => r.json()).catch(() => ({ success: false }));
    if (!v.success) return json({ ok: false, error: 'captcha_failed' }, 403, origin);
  }

  // 可选 KV 限流：每 IP 每分钟 ≤6 条（绑了 KV namespace `RL` 才生效）
  if (env.RL) {
    try {
      const key = `rl:${ip}:${Math.floor(Date.now() / 60000)}`;
      const n = parseInt((await env.RL.get(key)) || '0', 10);
      if (n >= 6) return json({ ok: false, error: 'rate_limited' }, 429, origin);
      await env.RL.put(key, String(n + 1), { expirationTtl: 120 });
    } catch (_e) { /* 限流失败不阻断正常反馈 */ }
  }

  const kind = clip(body.kind, MAX.type) || 'general_feedback';
  const message = clip(body.message, MAX.message);
  if (message.length < 2 && kind !== 'question_report' && kind !== 'question_edit') return json({ ok: false, error: 'empty' }, 400, origin);
  if (kind === 'question_edit' && !(Array.isArray(body.diff) && body.diff.length) && !clip(body.note, MAX.message)) return json({ ok: false, error: 'empty' }, 400, origin);

  const lines = [];
  if (kind === 'question_report') {
    lines.push('⚐ <b>题目报错</b>');
    lines.push(`类型: ${esc(clip(body.report_type, MAX.type))}`);
    lines.push(`题库: <code>${esc(clip(body.bank_id, MAX.bankId))}</code> · 第 ${esc(String(body.question_index || '?'))} 题`);
    if (body.question_source) lines.push(`来源: ${esc(clip(body.question_source, MAX.source))}`);
    if (body.question_stem) lines.push(`题干: ${esc(clip(body.question_stem, MAX.stem))}`);
    lines.push(`判错: ${body.was_wrong ? '是' : '否'} · 已提交: ${body.submitted ? '是' : '否'}`);
    if (body.selected_answer !== undefined) lines.push(`所选: ${esc(clip(JSON.stringify(body.selected_answer), 80))}`);
    if (message) lines.push(`说明: ${esc(message)}`);
  } else if (kind === 'question_edit') {
    const fmt = (v) => Array.isArray(v)
      ? v.map((x) => (x && typeof x === 'object') ? JSON.stringify(x) : String(x)).join(' | ')
      : ((v && typeof v === 'object') ? JSON.stringify(v) : String(v == null ? '' : v));
    lines.push('✏️ <b>题目修正建议</b>');
    lines.push(`题库: <code>${esc(clip(body.bank_id, MAX.bankId))}</code>${body.question_index ? ' · 第 ' + esc(String(body.question_index)) + ' 题' : ''}`);
    if (body.question_source) lines.push(`来源: ${esc(clip(body.question_source, MAX.source))}`);
    const diff = Array.isArray(body.diff) ? body.diff : [];
    for (const d of diff.slice(0, 6)) {
      lines.push(`— <b>${esc(clip(d && d.field, 24))}</b>`);
      lines.push(`旧: ${esc(clip(fmt(d && d.from), 300))}`);
      lines.push(`新: ${esc(clip(fmt(d && d.to), 300))}`);
    }
    const note = clip(body.note, MAX.message);
    if (note) lines.push(`备注: ${esc(note)}`);
  } else {
    lines.push('💬 <b>用户建议</b>');
    lines.push(`题库: <code>${esc(clip(body.bank_id, MAX.bankId))}</code>`);
    lines.push(`内容: ${esc(message)}`);
    const contact = clip(body.reply_email || body.contact, MAX.contact);
    if (contact) lines.push(`回联: ${esc(contact)}`);
  }
  lines.push(`<i>${esc(clip(body.ui_lang, 8))} · ${esc(clip(body.page_url, MAX.page))}</i>`);

  // 题目修正：把"修正内容"暂存进 KV，并在消息上挂 [✅ 批准并开 PR] 按钮（短 id 放 callback_data，
  // 站主一点 → /api/tg-webhook 凭 id 取回 → 开 PR）。需 KV(env.EDITS)+GitHub token；缺则只发消息不挂按钮。
  let reply_markup;
  if (kind === 'question_edit' && env.EDITS && env.GITHUB_TOKEN
      && body.corrected && typeof body.corrected === 'object' && body.corrected.question) {
    const id = ((typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID().replace(/-/g, '')
      : String(Date.now()) + Math.random().toString(16).slice(2)).slice(0, 16);
    const pending = {
      bank_id: clip(body.bank_id, MAX.bankId),
      question_source: clip(body.question_source, MAX.source),
      question_index: body.question_index || null,
      original: (body.original && typeof body.original === 'object') ? body.original : null,
      corrected: body.corrected,
      note: clip(body.note, MAX.message),
      ts: Date.now(),
    };
    try {
      await env.EDITS.put('edit:' + id, JSON.stringify(pending), { expirationTtl: 14 * 24 * 3600 });
      reply_markup = { inline_keyboard: [[{ text: '✅ 批准并开 PR', callback_data: 'ap:' + id }]] };
    } catch (_e) { /* KV 写失败：消息照发、无按钮 */ }
  }

  const tgBody = { chat_id: env.TELEGRAM_CHAT_ID, text: lines.join('\n'), parse_mode: 'HTML', disable_web_page_preview: true };
  if (reply_markup) tgBody.reply_markup = reply_markup;
  const tg = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(tgBody),
  }).catch(() => null);

  if (!tg || !tg.ok) return json({ ok: false, error: 'delivery_failed' }, 502, origin);
  return json({ ok: true }, 200, origin);
}
