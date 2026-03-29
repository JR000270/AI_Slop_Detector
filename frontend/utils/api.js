/**
 * utils/api.js
 * Shared API utilities — loaded via importScripts() in the service worker.
 * Must use no ES module syntax (importScripts requires classic scripts).
 */

const DEFAULT_ENDPOINT = 'http://localhost:8000';

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
// score = realness (0–100): higher means more likely real
function classifyScore(score) {
  if (score > 60) return { label: 'Likely Real', cls: 'green' };
  if (score > 30) return { label: 'Uncertain', cls: 'yellow' };
  return { label: 'Likely AI-Generated', cls: 'red' };
}

/**
 * Send one media URL to the Slop-Detector local backend, falling back to a
 * configurable direct endpoint if the backend is unreachable.
 *
 * @param {string} url        Public URL of the image / video
 * @param {'image'|'video'}  type
 * @param {string} apiKey     User's AI-or-Not API key
 * @param {string} endpoint   Slop-Detector backend endpoint (configurable)
 * @returns {Promise<{score:number, label:string, cls:string, source:'backend'|'direct'|'cached'}>}
 */
async function analyzeMedia(url, type, apiKey, endpoint = DEFAULT_ENDPOINT) {
  const cacheKey = 'cache_' + hashString(url);

  // 1. Check local cache first
  const cached = await storageGet(cacheKey);
  if (cached) {
    console.log('[analyzeMedia] cache hit for', url);
    return { ...cached, source: 'cached' };
  }

  // 2. Try backend
  console.log('[analyzeMedia] calling backend:', `${endpoint}/image/url`, '| url:', url);
  let result = null;
  try {
    const res = await fetchWithTimeout(`${endpoint}/image/url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    }, 8000);

    console.log('[analyzeMedia] backend response status:', res.status);
    if (!res.ok) throw new Error(`Backend ${res.status}`);
    const json = await res.json();
    console.log('[analyzeMedia] backend response JSON:', json);
    result = normalizeResult(json, 'backend');
    console.log('[analyzeMedia] normalized result:', result);
  } catch (backendErr) {
    console.warn('[analyzeMedia] backend failed:', backendErr.message, '— trying direct API');
    // 3. Fallback: direct AI-or-Not API call
    try {
      result = await callDirectApi(url, type, apiKey);
      result.source = 'direct';
      console.log('[analyzeMedia] direct API result:', result);
    } catch (directErr) {
      console.error('[analyzeMedia] direct API also failed:', directErr.message);
      throw new ApiError(directErr.message, backendErr.message);
    }
  }

  // 4. Cache the result (7 days)
  await storageSet(cacheKey, result, Date.now() + 7 * 86400_000);
  return result;
}

/** Normalize various response shapes into { score, label, cls }. */
function normalizeResult(json, source) {
  // AI-or-Not v2: { report: { ai_generated: { ai: { confidence: 0-1 } } } }
  const raw =
    json.report?.ai_generated?.ai?.confidence ??
    json.score ??
    json.ai_probability ??
    json.result?.score ??
    json.result?.ai_probability ??
    0;
  const aiScore = Math.round(Math.min(100, Math.max(0, raw * (raw <= 1 ? 100 : 1))));
  const score = 100 - aiScore; // invert: higher = more likely real
  console.log('[normalizeResult] raw:', raw, '→ aiScore:', aiScore, '→ realScore:', score, '| json:', JSON.stringify(json).slice(0, 200));
  const { label, cls } = classifyScore(score);
  return { score, label, cls, source };
}

/** Direct AI-or-Not v2 API call used as fallback when backend is unreachable. */
async function callDirectApi(url, type, apiKey) {
  if (!apiKey) throw new Error('No API key configured');
  const res = await fetchWithTimeout('https://api.aiornot.com/v2/image/sync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ url }),
  }, 15000);

  if (res.status === 429) throw new Error('Rate limit exceeded');
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const json = await res.json();
  return normalizeResult(json, 'direct');
}

/**
 * Fact-check a video URL via yt-dlp + Gemini.
 * Returns either a FactCheckResult or a VideoTooLongResponse shape.
 */
async function analyzeVideoContent(url, apiKey, endpoint = DEFAULT_ENDPOINT) {
  const res = await fetchWithTimeout(`${endpoint}/factcheck/video/url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  }, 90000);

  if (!res.ok) throw new Error(`Server error ${res.status}`);
  const json = await res.json();

  // Too-long response: { detail, duration, download_token }
  if (json.download_token) {
    return { toolong: true, detail: json.detail, duration: json.duration, downloadToken: json.download_token };
  }

  // Success: { claims, factuality_score, verdict, explanation, articles }
  return {
    toolong: false,
    claims: json.claims ?? [],
    factualityScore: json.factuality_score ?? null,
    verdict: json.verdict ?? null,
    explanation: json.explanation ?? null,
    articles: json.articles ?? [],
  };
}

/**
 * Check whether a video URL contains AI-generated content.
 * Calls POST /video/url and returns a normalised { score, label, cls } result.
 */
async function analyzeVideoDetection(url, endpoint = DEFAULT_ENDPOINT) {
  const res = await fetchWithTimeout(`${endpoint}/video/url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  }, 60000);

  if (!res.ok) throw new Error(`Server error ${res.status}`);
  const json = await res.json();
  return normalizeResult(json, 'backend');
}

/** Ping backend health endpoint. Returns true if reachable. */
async function checkBackendConnection(endpoint = DEFAULT_ENDPOINT) {
  try {
    const res = await fetchWithTimeout(`${endpoint}/health`, { method: 'GET' }, 3000);
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

/** Error that carries both backend and direct-API error messages. */
class ApiError extends Error {
  constructor(message, backendMessage) {
    super(message);
    this.name = 'ApiError';
    this.backendMessage = backendMessage;
  }
}
