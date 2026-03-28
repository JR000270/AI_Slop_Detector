/**
 * utils/api.js
 * Shared API utilities — loaded via importScripts() in the service worker.
 * Must use no ES module syntax (importScripts requires classic scripts).
 */

const DEFAULT_ENDPOINT = 'http://localhost:3000/api/truthlens';

/** Simple djb2 hash of a string → hex string (used as cache key). */
function hashString(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
    h = h >>> 0; // keep unsigned 32-bit
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * Classify a raw 0–1 score into a label and CSS class.
 * @param {number} score 0–100
 */
function classifyScore(score) {
  if (score < 40) return { label: 'Likely Real',         cls: 'green' };
  if (score < 70) return { label: 'Uncertain',           cls: 'yellow' };
  return             { label: 'Likely AI-Generated',     cls: 'red' };
}

/**
 * Send one media URL to the OpenClaw local agent, falling back to a
 * configurable direct endpoint if OpenClaw is unreachable.
 *
 * @param {string} url        Public URL of the image / video
 * @param {'image'|'video'}  type
 * @param {string} apiKey     User's AI-or-Not API key
 * @param {string} endpoint   OpenClaw endpoint (configurable)
 * @returns {Promise<{score:number, label:string, cls:string, source:'openclaw'|'direct'|'cached'}>}
 */
async function analyzeMedia(url, type, apiKey, endpoint = DEFAULT_ENDPOINT) {
  const cacheKey = 'cache_' + hashString(url);

  // 1. Check local cache first
  const cached = await storageGet(cacheKey);
  if (cached) return { ...cached, source: 'cached' };

  // 2. Try OpenClaw local agent
  let result = null;
  try {
    const res = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, type, apiKey }),
    }, 8000);

    if (!res.ok) throw new Error(`OpenClaw ${res.status}`);
    const json = await res.json();
    result = normalizeResult(json, 'openclaw');
  } catch (openClawErr) {
    // 3. Fallback: direct AI-or-Not API call
    try {
      result = await callDirectApi(url, type, apiKey);
      result.source = 'direct';
    } catch (directErr) {
      throw new ApiError(directErr.message, openClawErr.message);
    }
  }

  // 4. Cache the result (7 days)
  await storageSet(cacheKey, result, Date.now() + 7 * 86400_000);
  return result;
}

/** Normalize various response shapes into { score, label, cls }. */
function normalizeResult(json, source) {
  // Support OpenClaw shape: { score } or { result: { score } } or { ai_probability }
  const raw = json.score ?? json.ai_probability ?? json.result?.score ?? json.result?.ai_probability ?? 0;
  const score = Math.round(Math.min(100, Math.max(0, raw * (raw <= 1 ? 100 : 1))));
  const { label, cls } = classifyScore(score);
  return { score, label, cls, source };
}

/** Placeholder for a direct AI-or-Not API call (replace with real endpoint). */
async function callDirectApi(url, type, apiKey) {
  if (!apiKey) throw new Error('No API key configured');
  // TODO: replace with actual AI-or-Not API endpoint and request format
  const res = await fetchWithTimeout('https://api.aiornot.com/v1/reports/image', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ object: { url } }),
  }, 15000);

  if (res.status === 429) throw new Error('Rate limit exceeded');
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const json = await res.json();
  return normalizeResult(json.report ?? json, 'direct');
}

/** Ping OpenClaw health endpoint. Returns true if reachable. */
async function checkOpenClawConnection(endpoint = DEFAULT_ENDPOINT) {
  try {
    const healthUrl = endpoint.replace(/\/api\/truthlens$/, '/health');
    const res = await fetchWithTimeout(healthUrl, { method: 'GET' }, 3000);
    return res.ok;
  } catch {
    return false;
  }
}

/** fetch() with a timeout. */
function fetchWithTimeout(url, options, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...options, signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

/** chrome.storage.local.get wrapper returning a Promise. */
function storageGet(key) {
  return new Promise(resolve => {
    chrome.storage.local.get(key, result => {
      const entry = result[key];
      if (!entry) return resolve(null);
      // Honour TTL
      if (entry._ttl && Date.now() > entry._ttl) {
        chrome.storage.local.remove(key);
        return resolve(null);
      }
      resolve(entry.value ?? entry);
    });
  });
}

/** chrome.storage.local.set wrapper; optionally stores a TTL. */
function storageSet(key, value, ttl) {
  return new Promise(resolve => {
    const entry = ttl ? { value, _ttl: ttl } : value;
    chrome.storage.local.set({ [key]: entry }, resolve);
  });
}

/** Error that carries both OpenClaw and direct-API error messages. */
class ApiError extends Error {
  constructor(message, openClawMessage) {
    super(message);
    this.name = 'ApiError';
    this.openClawMessage = openClawMessage;
  }
}
