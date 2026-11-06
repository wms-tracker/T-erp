// Link to AI Content Factory (the video editing system), through a workspace token made in its
// Settings → การเชื่อมต่อ. Server-side only: FACTORY_TOKEN never reaches the browser.
// What it gives: the workspace's videos and their analysis, its AI (under its limits and its
// "ask before spending" rule), and a place to send approved scripts to edit to.
import { AsyncLocalStorage } from 'node:async_hooks';

/** Per request: whether the person confirmed using AI that may cost money (x-ai-confirmed: 1) */
export const aiContext = new AsyncLocalStorage();

export const factoryConfigured = () => Boolean(process.env.FACTORY_URL && process.env.FACTORY_TOKEN);
const base = () => process.env.FACTORY_URL.replace(/\/+$/, '');

export class FactoryError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

async function call(method, path, body) {
  if (!factoryConfigured()) throw new FactoryError(400, 'NOT_LINKED', 'ยังไม่ได้เชื่อมต่อ Content Factory — ใส่ FACTORY_URL และ FACTORY_TOKEN ใน .env');
  let res;
  try {
    res = await fetch(`${base()}/api/v1${path}`, {
      method,
      headers: { authorization: `Bearer ${process.env.FACTORY_TOKEN}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
  } catch (e) {
    throw new FactoryError(502, 'UNREACHABLE', `ติดต่อ Content Factory ที่ ${base()} ไม่ได้ (${e.message})`);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = data?.error?.code || `HTTP_${res.status}`;
    const message = data?.error?.message || `Content Factory ตอบ ${res.status}`;
    const known = {
      AI_CONFIRMATION_REQUIRED: 'Content Factory ตั้งค่าให้ถามก่อนใช้ AI ที่อาจมีค่าใช้จ่าย — กดใหม่แล้วยืนยัน',
      NOT_CONFIGURED: 'Content Factory ยังไม่ได้ตั้งค่า AI — ใส่ Gemini API key ในการตั้งค่า AI ของ Factory (หรือใช้ Ollama)',
      AI_LIMIT_REACHED: 'AI ของ Content Factory ใช้ครบโควตาแล้ว — ปรับขีดจำกัดในการตั้งค่า AI ของ Factory',
    };
    throw new FactoryError(res.status === 401 ? 502 : res.status, code,
      res.status === 401 ? 'FACTORY_TOKEN ใช้ไม่ได้หรือถูกเพิกถอนแล้ว' : known[code] || message);
  }
  return data;
}

let statusCache = null;
/** The linked workspace and its AI; cached briefly (it is read on every page) */
export async function factoryStatus() {
  if (!factoryConfigured()) return null;
  if (statusCache && Date.now() - statusCache.at < 30_000) return statusCache.data;
  try {
    const data = await call('GET', '/integration/status');
    statusCache = { at: Date.now(), data };
    return data;
  } catch (e) {
    return { error: e.message };
  }
}

export const listFactoryVideos = () => call('GET', '/integration/videos');
export const getFactoryVideo = (id) => call('GET', `/integration/videos/${encodeURIComponent(id)}`);
export const sendScriptToFactory = (script) => call('POST', '/integration/scripts', script);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * One structured request to the linked workspace's language model: queued there, then
 * collected. `jsonSchema` is the answer's shape; the caller checks the answer again.
 */
export async function askFactory({ system, prompt, jsonSchema, purpose }) {
  const confirmed = Boolean(aiContext.getStore()?.confirmed);
  const job = await call('POST', '/integration/llm', { purpose, system, prompt, jsonSchema, aiConfirmed: confirmed });
  const started = Date.now();
  for (let wait = 1200; Date.now() - started < 6 * 60_000; wait = Math.min(4000, wait * 1.3)) {
    await sleep(wait);
    const now = await call('GET', `/integration/llm/${job.id}`);
    if (now.status === 'SUCCEEDED') return { data: now.data, usage: now.usage, model: `${now.provider} · ${now.model}` };
    if (now.status === 'FAILED' || now.status === 'CANCELLED') throw new FactoryError(502, now.errorCode || 'FAILED', `AI ของ Content Factory ทำงานไม่สำเร็จ (${now.errorCode || 'ไม่ทราบสาเหตุ'})`);
  }
  throw new FactoryError(504, 'TIMEOUT', 'AI ของ Content Factory ใช้เวลานานเกิน 6 นาที');
}
