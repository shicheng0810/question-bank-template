// Cloudflare Pages Function —— /api/auth：自定义访问码登录（无密码、无外部依赖，手机友好）。
// 用户输入一个自定义码 → 这个码就是身份。后端把码哈希成 user id（sub），原始码绝不落库；
// 同一个码 → 同一个 sub → 同一份历史。知道码的人就能看到那份历史（已与用户确认：不私密）。
// 跨域 token（不靠 cookie）→ CF 站与 GitHub 镜像两边都能登录。KV 复用 EDITS（键 u:/s:/h:/rl:）。

const ALLOW_ORIGINS = [
  'https://question-bank-78u.pages.dev',
  'https://shicheng0810.github.io',
  'http://localhost:8799',
];
const SESSION_TTL = 60 * 60 * 24 * 30; // 30 天
const CODE_MIN = 4;
const CODE_MAX = 64;
const RL_PER_MIN = 20; // 每 IP 每分钟最多 20 次登录尝试（防暴力猜码）

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
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...corsHeaders(origin) } });
}

async function sha256hex(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('Origin') || '') });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const origin = request.headers.get('Origin') || '';
  if (!env.EDITS) return json({ ok: false, error: 'not_configured' }, 503, origin);

  // 轻量限流（防暴力猜码）：每 IP 每分钟 ≤ RL_PER_MIN 次。
  try {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const rk = `rl:auth:${ip}:${Math.floor(Date.now() / 60000)}`;
    const n = parseInt((await env.EDITS.get(rk)) || '0', 10);
    if (n >= RL_PER_MIN) return json({ ok: false, error: 'rate_limited' }, 429, origin);
    await env.EDITS.put(rk, String(n + 1), { expirationTtl: 120 });
  } catch (_e) { /* 限流失败不阻断登录 */ }

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'bad_json' }, 400, origin); }
  const code = String(body.code == null ? '' : body.code).trim();
  if (code.length < CODE_MIN || code.length > CODE_MAX) return json({ ok: false, error: 'bad_code' }, 400, origin);

  // 码 → sub（加盐哈希）。原始码不存任何地方。
  const sub = await sha256hex('qbcode:v1:' + code);

  const ukey = 'u:' + sub;
  let prev = null;
  try { prev = JSON.parse((await env.EDITS.get(ukey)) || 'null'); } catch { /* ignore */ }
  await env.EDITS.put(ukey, JSON.stringify({ sub, createdAt: (prev && prev.createdAt) || Date.now(), lastLogin: Date.now() }));

  const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  await env.EDITS.put('s:' + token, sub, { expirationTtl: SESSION_TTL });

  // name 回显用户输入的码（前端做展示/记忆用）；后端不存原始码。
  return json({ ok: true, token, user: { name: code, isNew: !prev } }, 200, origin);
}

export function onRequestGet({ request }) {
  return new Response('auth endpoint up', { headers: { 'content-type': 'text/plain; charset=utf-8', ...corsHeaders(request.headers.get('Origin') || '') } });
}
