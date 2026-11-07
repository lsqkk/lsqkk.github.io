import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { allowOrigin, ALLOWED_ORIGINS } from './_cors.js';
import { getDatabase } from './_firebase-admin.js';

const origins = [...ALLOWED_ORIGINS, 'https://130923.xyz', 'https://www.130923.xyz', 'http://localhost:4321', 'http://127.0.0.1:4321'];
const gateway = 'https://ai-gateway.vercel.sh/v1/chat/completions';
const model = 'alibaba/qwen3.5-flash';
const dailySiteLimit = 120;
const dailyIpLimit = 15;
const maxRequestBytes = 48 * 1024;

function chatPayload(body) {
  const { messages, tools } = body || {};
  if (!Array.isArray(messages) || messages.length > 24 || !messages.some((message) => message?.role === 'user')) return;
  if (!messages.every((message) => message && ['system', 'user', 'assistant', 'tool'].includes(message.role)
    && (typeof message.content === 'string' || (message.role === 'assistant' && message.content === null)))) return;
  if (tools !== undefined && (!Array.isArray(tools) || tools.length > 8 || !tools.every((tool) =>
    tool?.type === 'function' && typeof tool.function?.name === 'string'))) return;

  return JSON.stringify({
    model,
    messages: messages.map(({ role, content, tool_calls, tool_call_id }) => ({
      role, content,
      ...(role === 'assistant' && tool_calls ? { tool_calls } : {}),
      ...(role === 'tool' ? { tool_call_id } : {})
    })),
    ...(tools?.length ? { tools } : {}),
    reasoning: { effort: 'none' },
    max_tokens: 1000,
    stream: true
  });
}

async function reserveQuota(ip) {
  // Keep only the current Beijing-time day. One transaction reserves both counters.
  const day = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  const secret = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const key = createHmac('sha256', secret).update(`${day}:${ip}`).digest('hex');
  const result = await getDatabase().ref('quarkbot_free_quota').transaction((current) => {
    if (current?.day > day) return;
    const quota = current?.day === day ? current : { day, total: 0, clients: {} };
    const count = quota.clients[key] || 0;
    if (quota.total >= dailySiteLimit || count >= dailyIpLimit) return;
    return { day, total: quota.total + 1, clients: { ...quota.clients, [key]: count + 1 } };
  }, undefined, false);
  return result.committed;
}

export default async function handler(req, res) {
  res.setHeader('Vary', 'Origin');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (!allowOrigin(req, res, origins)) return res.status(403).json({ error: '来源不受支持。' });
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: '仅支持 POST。' });

  const token = process.env.VERCEL === '1' ? req.headers['x-vercel-oidc-token'] : process.env.VERCEL_OIDC_TOKEN;
  const ip = req.headers['x-vercel-forwarded-for'];
  if (!token || typeof ip !== 'string' || !isIP(ip)) {
    return res.status(503).json({ error: '站点免费 AI 暂不可用，可以使用站内搜索或切换到自定义 API。' });
  }

  let payload;
  try {
    payload = chatPayload(typeof req.body === 'string' ? JSON.parse(req.body) : req.body);
  } catch { /* malformed request */ }
  if (!payload) return res.status(400).json({ error: '无效的对话请求。' });
  if (Buffer.byteLength(payload) > maxRequestBytes) {
    return res.status(413).json({ error: '免费模式的上下文过长，请清空对话或缩短输入后重试。' });
  }

  const controller = new AbortController();
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(40000)]);
  res.once('close', () => controller.abort());
  try {
    if (!await reserveQuota(ip)) {
      return res.status(429).json({ error: '今日免费额度已用完，北京时间 00:00 恢复。也可以切换到自定义 API 或使用站内搜索。' });
    }
    const response = await fetch(gateway, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: payload,
      redirect: 'error',
      signal
    });
    const contentType = response.headers.get('content-type');
    if (!response.ok || !contentType?.includes('text/event-stream') || !response.body) {
      await response.body?.cancel();
      if (response.status === 402) return res.status(402).json({ error: '站点的免费 AI 余额已用完，可以使用站内搜索或切换到自定义 API。' });
      if (response.status === 429) return res.status(429).json({ error: '免费模型暂时繁忙，请稍后再试。' });
      return res.status(503).json({ error: '免费模型暂不可用，可以使用站内搜索或切换到自定义 API。' });
    }
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    await pipeline(Readable.fromWeb(response.body), res, { signal });
  } catch {
    if (!res.headersSent && !res.destroyed) {
      res.status(503).json({ error: '站点免费 AI 暂不可用，可以使用站内搜索或切换到自定义 API。' });
    }
  }
}
