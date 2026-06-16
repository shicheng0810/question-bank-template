// Cloudflare Pages Function —— /api/history：登录用户的做题历史快照（每人最多最近 10 条）。
// 鉴权：请求头 Authorization: Bearer <会话 token>（/api/auth 发的）。KV 复用 EDITS，键 h:<sub>。
//   GET            → 列出最近 10 条（仅元数据，不含大体积 state）
//   GET ?id=<id>   → 取某条完整快照（含 state，用于"重新加载"）
//   POST {snapshot}→ 存/更新一条（按 snapshot.id），保留最近 10，超出删最旧
//   DELETE ?id=<id>→ 删一条
const ALLOW_ORIGINS = [
  'https://question-bank-78u.pages.dev',
  'https://shicheng0810.github.io',
  'http://localhost:8799',
];
const MAX_HISTORY = 10;
const MAX_SNAPSHOT_BYTES = 400 * 1024; // 单条快照上限 ~400KB，防滥用

function corsHeaders(origin) {
  const allow = ALLOW_ORIGINS.includes(origin) ? origin : ALLOW_ORIGINS[0];
  return {
    'access-control-allow-origin': allow,
    'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-max-age': '86400',
  };
}
function json(obj, status, origin) {
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...corsHeaders(origin) } });
}
const clip = (v, n) => (typeof v === 'string' ? v : '').slice(0, n);

async function subFromAuth(env, request) {
  const h = request.headers.get('Authorization') || '';
  const m = h.match(/^Bearer\s+(\S+)$/i);
  if (!m) return null;
  return (await env.EDITS.get('s:' + m[1])) || null;
}
async function loadHistory(env, sub) {
  try { const a = JSON.parse((await env.EDITS.get('h:' + sub)) || '[]'); return Array.isArray(a) ? a : []; } catch { return []; }
}
// 列表里去掉大体积 state，只留元数据
function meta(s) {
  return { id: s.id, bank_id: s.bank_id, title: s.title, ts: s.ts, viewMode: s.viewMode, score: s.score, count: s.count };
}

export function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('Origin') || '') });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const origin = request.headers.get('Origin') || '';
  if (!env.EDITS) return json({ ok: false, error: 'not_configured' }, 503, origin);
  const sub = await subFromAuth(env, request);
  if (!sub) return json({ ok: false, error: 'unauthorized' }, 401, origin);

  const id = new URL(request.url).searchParams.get('id');
  const list = await loadHistory(env, sub);
  if (id) {
    const found = list.find((s) => s.id === id);
    if (!found) return json({ ok: false, error: 'not_found' }, 404, origin);
    return json({ ok: true, snapshot: found }, 200, origin);
  }
  return json({ ok: true, items: list.map(meta) }, 200, origin);
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const origin = request.headers.get('Origin') || '';
  if (!env.EDITS) return json({ ok: false, error: 'not_configured' }, 503, origin);
  const sub = await subFromAuth(env, request);
  if (!sub) return json({ ok: false, error: 'unauthorized' }, 401, origin);

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'bad_json' }, 400, origin); }
  const snap = body && body.snapshot;
  if (!snap || typeof snap !== 'object' || !snap.id || !snap.bank_id) return json({ ok: false, error: 'bad_snapshot' }, 400, origin);

  // 规整 + 体积上限
  const clean = {
    id: clip(String(snap.id), 64),
    bank_id: clip(String(snap.bank_id), 80),
    title: clip(String(snap.title || snap.bank_id), 160),
    ts: Number(snap.ts) || Date.now(),
    viewMode: clip(String(snap.viewMode || 'all'), 24),
    score: (snap.score && typeof snap.score === 'object') ? snap.score : null,
    count: Number(snap.count) || 0,
    state: (snap.state && typeof snap.state === 'object') ? snap.state : {},
    scope: Array.isArray(snap.scope) ? snap.scope.slice(0, 5000).map((x) => clip(String(x), 80)) : null,
  };
  if (JSON.stringify(clean).length > MAX_SNAPSHOT_BYTES) return json({ ok: false, error: 'too_large' }, 413, origin);

  let list = await loadHistory(env, sub);
  list = list.filter((s) => s.id !== clean.id);   // 同 id 视为同一轮 → 替换
  list.unshift(clean);
  list.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  list = list.slice(0, MAX_HISTORY);               // 只留最近 10，超出删最旧
  await env.EDITS.put('h:' + sub, JSON.stringify(list));
  return json({ ok: true, items: list.map(meta) }, 200, origin);
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  const origin = request.headers.get('Origin') || '';
  if (!env.EDITS) return json({ ok: false, error: 'not_configured' }, 503, origin);
  const sub = await subFromAuth(env, request);
  if (!sub) return json({ ok: false, error: 'unauthorized' }, 401, origin);
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return json({ ok: false, error: 'no_id' }, 400, origin);
  let list = await loadHistory(env, sub);
  list = list.filter((s) => s.id !== id);
  await env.EDITS.put('h:' + sub, JSON.stringify(list));
  return json({ ok: true, items: list.map(meta) }, 200, origin);
}
