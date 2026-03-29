/**
 * popup/popup.js
 * Vanilla JS — no framework. All communication via chrome.runtime.sendMessage.
 */

// ── DOM refs ──────────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);

const tabs = document.querySelectorAll('.tab');
// Only include panels that actually exist in the DOM
const panels = Object.fromEntries(
  [['scan', 'tab-scan'], ['video', 'tab-video'], ['article', 'tab-article'], ['settings', 'tab-settings']]
    .map(([key, id]) => [key, $(id)])
    .filter(([, el]) => el !== null)
);

// Scan tab
const stateEmpty       = $('state-empty');
const stateLoading     = $('state-loading');
const scanLoadingMsg   = $('scan-loading-msg');
const statePreview     = $('state-preview');
const previewOnlyImg   = $('preview-only-img');
const previewOnlyVid   = $('preview-only-vid');
const previewOnlyUrl   = $('preview-only-url');
const stateResult      = $('state-result');
const stateResultGemini = $('state-result-gemini');
const imgGeminiPreview = $('img-gemini-preview');
const imgGeminiBadge      = $('img-gemini-badge');
const imgGeminiConfidence = $('img-gemini-confidence');
const imgGeminiReason     = $('img-gemini-reason');
const imgGeminiSummary = $('img-gemini-summary');
const imgRawWrap       = $('img-raw-wrap');
const imgRawText       = $('img-raw-text');
const imgGeminiSource  = $('img-gemini-source');
const btnCopyImgGemini = $('btn-copy-img-gemini');
const btnClearImgGemini = $('btn-clear-img-gemini');
const gaugeArc         = $('gauge-arc');
const gaugePct         = $('gauge-pct');
const gaugeLabel       = $('gauge-label');
const resultBadge      = $('result-badge');
const resultPreviewImg = $('result-preview-img');
const resultPreviewVid = $('result-preview-vid');
const resultUrl        = $('result-url');
const resultSource     = $('result-source');
const btnClearResult   = $('btn-clear-result');
const btnClearResultScan = $('btn-clear-result-scan');
const btnCopyScan      = $('btn-copy-scan');
const btnPick          = $('btn-pick');
const btnUpload        = $('btn-upload');
const fileInput        = $('file-input');
const btnAnalyzeUpload = $('btn-analyze-upload');
const btnBatch         = $('btn-batch');
const batchProgress    = $('batch-progress');
const progressBar      = $('progress-bar');
const progressLabel    = $('progress-label');
const toggleProactive  = $('toggle-proactive');
const sensitivitySel   = $('sensitivity-select');

// Video tab
const videoUrlInput     = $('video-url-input');
const btnUploadVideo    = $('btn-upload-video');
const videoFileInput    = $('video-file-input');
const btnAnalyzeVideo   = $('btn-analyze-video');
const videoStateEmpty   = $('video-state-empty');
const videoStateLoading = $('video-state-loading');
const videoLoadingMsg   = $('video-loading-msg');
const videoStateResult  = $('video-state-result');
const videoStateError   = $('video-state-error');
const videoStateTooLong = $('video-state-toolong');
const videoErrorText    = $('video-error-text');
const videoTooLongText  = $('video-toolong-text');
const btnDownloadClip   = $('btn-download-clip');
const btnClearTooLong   = $('btn-clear-toolong');
// Result card elements
const videoAiBadge      = $('video-ai-badge');
const videoAiReason     = $('video-ai-reason');
const videoFactBadge    = $('video-fact-badge');
const videoFactSummary  = $('video-fact-summary');
const videoClaimsList   = $('video-claims-list');
const videoRawWrap      = $('video-raw-wrap');
const videoRawText      = $('video-raw-text');
const videoResultSource = $('video-result-source');
const btnCopyResult     = $('btn-copy-result');
const btnClearVideo     = $('btn-clear-video');

// History tab
const historyList = $('history-list');
const historyEmpty = $('history-empty');

// Article tab
const articleTextarea       = $('article-textarea');
const articleCharHint       = $('article-char-hint');
const btnGrabPage           = $('btn-grab-page');
const btnDetectArticle      = $('btn-detect-article');
const btnFactcheckArticle   = $('btn-factcheck-article');
const articleStateEmpty     = $('article-state-empty');
const articleStateLoading   = $('article-state-loading');
const articleLoadingMsg     = $('article-loading-msg');
const articleStateResult    = $('article-state-result');
const articleStateError     = $('article-state-error');
const articleErrorText      = $('article-error-text');
const articleAiBadge        = $('article-ai-badge');
const articleAiBarWrap      = $('article-ai-bar-wrap');
const articleAiBar          = $('article-ai-bar');
const articleAiScore        = $('article-ai-score');
const articleAiSummary      = $('article-ai-summary');
const articleAiSignals      = $('article-ai-signals');
const articleFcBadge        = $('article-fc-badge');
const articleFcExplanation  = $('article-fc-explanation');
const articleFcClaims       = $('article-fc-claims');
const articleSources        = $('article-sources');
const articleSourcesList    = $('article-sources-list');
const articleResultMeta     = $('article-result-meta');
const btnCopyArticle        = $('btn-copy-article');
const btnClearArticle       = $('btn-clear-article');

// Settings tab
const apiKeyInput = $('api-key-input');
const endpointInput = $('endpoint-input');
const btnSaveKey = $('btn-save-key');
const btnSaveEndpoint = $('btn-save-endpoint');
const btnRecheck = $('btn-recheck');
const statusDot = $('status-dot');
const statusText = $('status-text');
const btnClearCache = $('btn-clear-cache');
const cacheFeedback = $('cache-feedback');
const connDot = $('connection-dot');

// Gauge constants: path "M20,100 A80,80 0 0,1 180,100" → half-circle r=80 → length ≈ 251.2
const GAUGE_LEN = 251.2;

// ── Init ──────────────────────────────────────────────────────────────────

(async () => {
  setupTabs();
  await Promise.all([loadSettings(), loadLastResult(), loadVideoResult()]);
  checkConnection();
})();

// Refresh the result area whenever tl_last_result changes in storage
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.tl_last_result) {
    const result = changes.tl_last_result.newValue;
    if (!result) return;
    if (result.score != null) {
      showResult(result);
    } else {
      showPreviewOnly(result);
    }
  }
  if (changes.tl_video_result) {
    const vr = changes.tl_video_result.newValue;
    if (!vr) return;
    if (vr.status === 'done') showVideoGeminiResult(vr);
    else if (vr.status === 'loading') setVideoState('loading');
  }
});

// ── Tab switching ─────────────────────────────────────────────────────────

function setupTabs() {
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => { t.classList.remove('tab--active'); t.setAttribute('aria-selected', 'false'); });
      tab.classList.add('tab--active');
      tab.setAttribute('aria-selected', 'true');

      Object.entries(panels).forEach(([key, panel]) => {
        panel.hidden = key !== tab.dataset.tab;
      });

      if (tab.dataset.tab === 'history') loadHistory();
    });
  });
}

// ── Load settings ─────────────────────────────────────────────────────────

async function loadSettings() {
  const { settings } = await msg({ action: 'getSettings' });
  if (!settings) return;

  if (apiKeyInput)    apiKeyInput.value    = settings.apiKey ? '••••••••' : '';
  if (endpointInput)  endpointInput.value  = settings.endpoint || 'http://localhost:8000';
  if (toggleProactive) toggleProactive.setAttribute('aria-checked', String(!!settings.proactive));
  if (sensitivitySel)  sensitivitySel.value = settings.sensitivity || 'medium';
}

// ── Load last result ──────────────────────────────────────────────────────

async function loadLastResult() {
  // Read directly from storage — bypasses the service worker so it works
  // even if the SW is sleeping (avoids "Receiving end does not exist" error).
  const result = await new Promise(resolve =>
    chrome.storage.local.get('tl_last_result', r => resolve(r.tl_last_result || null))
  );
  if (!result) return;
  if (result.score != null) {
    showResult(result);
  } else {
    // TODO: replace with showResult() once scanning is implemented
    showPreviewOnly(result);
  }
}

// ── Load / show video Gemini result ──────────────────────────────────────

async function loadVideoResult() {
  const vr = await new Promise(resolve =>
    chrome.storage.local.get('tl_video_result', r => resolve(r.tl_video_result || null))
  );
  if (!vr) return;
  if (vr.status === 'done') {
    // Switch to video tab and show result
    const videoTab = document.querySelector('[data-tab="video"]');
    if (videoTab) videoTab.click();
    showVideoGeminiResult(vr);
  } else if (vr.status === 'loading') {
    // Stale loading state from a closed popup — clear it instead of showing a spinner forever
    chrome.storage.local.remove('tl_video_result');
  }
}

// ── Gemini response parser ────────────────────────────────────────────────

function parseGeminiAnalysis(text) {
  if (!text || typeof text !== 'string') return null;

  // Require at least the AI DETECTION line to consider this structured
  const aiMatch = text.match(/AI\s+DETECTION\s*:\s*(Yes|No|Uncertain)\s*[—–-]+\s*(.+)/i);
  if (!aiMatch) return null;

  const aiVerdict = aiMatch[1].trim();
  const aiReason  = aiMatch[2].trim();

  // FACT CHECK section follows
  const fcBlock = text.split(/FACT\s+CHECK\s*:/i)[1] || '';

  const verdictMatch = fcBlock.match(/^Verdict\s*:\s*(.+)/im);
  const summaryMatch = fcBlock.match(/^Summary\s*:\s*([\s\S]+?)(?=\n\s*Claims\s*:|$)/im);

  const claimLines = fcBlock.split('\n').filter(l => /^\s*[•*\-]\s+/.test(l));
  const claims = claimLines.map(line => {
    const content = line.replace(/^\s*[•*\-]\s+/, '').trim();
    const parts   = content.split(/\s*[—–]\s*/);
    if (parts.length >= 2) {
      return {
        text:    parts.slice(0, parts.length - 1).join(' — ').trim(),
        verdict: parts[parts.length - 1].trim(),
      };
    }
    return { text: content, verdict: null };
  });

  return {
    aiVerdict,
    aiReason,
    fcVerdict: verdictMatch ? verdictMatch[1].trim() : null,
    fcSummary: summaryMatch ? summaryMatch[1].trim() : null,
    claims,
  };
}

function verdictCls(v) {
  if (!v) return 'unknown';
  const lv = v.toLowerCase();
  if (/\b(false|misleading|inaccurate|fabricated|fake)\b/.test(lv)) return 'red';
  if (/\b(true|authentic|accurate|real|genuine)\b/.test(lv))        return 'green';
  return 'yellow';
}

function aiVerdictCls(v) {
  if (!v) return 'unknown';
  const lv = v.toLowerCase();
  if (lv === 'yes') return 'red';
  if (lv === 'no')  return 'green';
  return 'yellow';
}

// ── Loading cycle ─────────────────────────────────────────────────────────

const VIDEO_LOADING_MSGS = [
  'Uploading video…',
  'Processing frames…',
  'Running AI detection…',
  'Fact-checking claims…',
  'Almost done…',
];
let _videoLoadingTimer = null;

function startVideoLoadingCycle() {
  let i = 0;
  videoLoadingMsg.textContent = VIDEO_LOADING_MSGS[0];
  _videoLoadingTimer = setInterval(() => {
    i = (i + 1) % VIDEO_LOADING_MSGS.length;
    videoLoadingMsg.textContent = VIDEO_LOADING_MSGS[i];
  }, 2800);
}

function stopVideoLoadingCycle() {
  if (_videoLoadingTimer) { clearInterval(_videoLoadingTimer); _videoLoadingTimer = null; }
}

const SCAN_LOADING_MSGS = [
  'Analyzing image…',
  'Running AI detection…',
  'Processing results…',
  'Almost done…',
];
let _scanLoadingTimer = null;

function startScanLoadingCycle() {
  let i = 0;
  scanLoadingMsg.textContent = SCAN_LOADING_MSGS[0];
  _scanLoadingTimer = setInterval(() => {
    i = (i + 1) % SCAN_LOADING_MSGS.length;
    scanLoadingMsg.textContent = SCAN_LOADING_MSGS[i];
  }, 2500);
}

function stopScanLoadingCycle() {
  if (_scanLoadingTimer) { clearInterval(_scanLoadingTimer); _scanLoadingTimer = null; }
}

// ── Article Check ─────────────────────────────────────────────────────────

const ARTICLE_DETECT_MSGS = [
  'Analyzing text…',
  'Detecting AI patterns…',
  'Almost done…',
];

const ARTICLE_FACTCHECK_MSGS = [
  'Analyzing text…',
  'Extracting claims…',
  'Searching the web…',
  'Fact-checking claims…',
  'Almost done…',
];

let _articleLoadingTimer = null;

function startArticleLoadingCycle(msgs) {
  let i = 0;
  articleLoadingMsg.textContent = msgs[0];
  _articleLoadingTimer = setInterval(() => {
    i = (i + 1) % msgs.length;
    articleLoadingMsg.textContent = msgs[i];
  }, 2500);
}

function stopArticleLoadingCycle() {
  if (_articleLoadingTimer) { clearInterval(_articleLoadingTimer); _articleLoadingTimer = null; }
}

function setArticleState(name) {
  articleStateEmpty.hidden   = name !== 'empty';
  articleStateLoading.hidden = name !== 'loading';
  articleStateResult.hidden  = name !== 'result';
  articleStateError.hidden   = name !== 'error';
}

function articleAiCls(verdict, score) {
  if (verdict === 'likely_ai' || score >= 70) return 'red';
  if (verdict === 'likely_real' || score < 30) return 'green';
  return 'yellow';
}

function articleFcVerdictCls(v) {
  if (!v) return 'unknown';
  const lv = v.toLowerCase();
  if (lv === 'true') return 'green';
  if (lv === 'mostly true') return 'yellow';
  if (lv === 'false') return 'red';
  return 'yellow';
}

function assessmentCls(a) {
  if (!a) return 'unknown';
  const la = a.toLowerCase();
  if (la === 'supported') return 'green';
  if (la === 'contradicted') return 'red';
  return 'unknown'; // unverifiable
}

function showArticleResult(aiResult, fcResult) {
  stopArticleLoadingCycle();

  // ── AI Detection card ──
  if (!aiResult) {
    articleAiBadge.hidden   = true;
    articleAiBarWrap.hidden = true;
    articleAiSummary.hidden = true;
    articleAiSignals.hidden = true;
  }

  if (aiResult) {
    const aiScore   = typeof aiResult.ai_score === 'number' ? aiResult.ai_score : 50;
    const aiVerdict = aiResult.verdict || '';
    const cls       = articleAiCls(aiVerdict, aiScore);
    const aiLabel   = cls === 'red' ? 'Likely AI' : cls === 'green' ? 'Human-Written' : 'Uncertain';

    articleAiBadge.textContent = aiLabel;
    articleAiBadge.className   = `verdict-badge verdict-badge--${cls}`;
    articleAiBadge.hidden      = false;

    articleAiBar.style.width   = aiScore + '%';
    articleAiBar.className     = `art-bar-fill art-bar-fill--${cls}`;
    articleAiScore.textContent = aiScore + '%';
    articleAiBarWrap.hidden    = false;

    if (aiResult.summary) {
      articleAiSummary.textContent = aiResult.summary;
      articleAiSummary.hidden = false;
    } else {
      articleAiSummary.hidden = true;
    }

    const signals = Array.isArray(aiResult.ai_signals) ? aiResult.ai_signals : [];
    if (signals.length) {
      articleAiSignals.innerHTML = '';
      signals.forEach(sig => {
        const li = document.createElement('li');
        li.className = 'art-signal';
        li.textContent = sig;
        articleAiSignals.appendChild(li);
      });
      articleAiSignals.hidden = false;
    } else {
      articleAiSignals.hidden = true;
    }
  }

  // ── Fact Check card ──
  if (fcResult) {
    const fcCls = articleFcVerdictCls(fcResult.verdict);
    articleFcBadge.textContent = fcResult.verdict || 'Unverified';
    articleFcBadge.className   = `verdict-badge verdict-badge--${fcCls}`;
    articleFcBadge.hidden      = false;

    if (fcResult.explanation) {
      articleFcExplanation.textContent = fcResult.explanation;
      articleFcExplanation.hidden = false;
    } else {
      articleFcExplanation.hidden = true;
    }

    // Claims
    const claims = Array.isArray(fcResult.claims) ? fcResult.claims : [];
    if (claims.length) {
      articleFcClaims.innerHTML = '';
      claims.forEach(claim => {
        // factcheck_service returns claims as plain strings (extracted claims)
        // text_service returns claims as objects with {text, assessment, explanation}
        const claimText = typeof claim === 'string' ? claim : (claim.text || '');
        const assessment = typeof claim === 'object' ? (claim.assessment || '') : '';
        const acls = assessmentCls(assessment);
        const li = document.createElement('li');
        li.className = 'vclaim';
        li.innerHTML =
          `<span class="vclaim__dot vclaim__dot--${acls}" aria-hidden="true"></span>` +
          `<span class="vclaim__text">${escAttr(claimText)}</span>` +
          (assessment ? `<span class="vclaim__verdict vclaim__verdict--${acls}">${escAttr(assessment)}</span>` : '');
        articleFcClaims.appendChild(li);
      });
      articleFcClaims.hidden = false;
    } else {
      articleFcClaims.hidden = true;
    }

    // Sources
    const articles = Array.isArray(fcResult.articles) ? fcResult.articles : [];
    if (articles.length) {
      articleSourcesList.innerHTML = '';
      articles.forEach(({ title, url }) => {
        const li = document.createElement('li');
        li.className = 'art-source';
        const a = document.createElement('a');
        a.href = url;
        a.textContent = title || url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        li.appendChild(a);
        articleSourcesList.appendChild(li);
      });
      articleSources.hidden = false;
    } else {
      articleSources.hidden = true;
    }
  } else {
    articleFcBadge.hidden      = true;
    articleFcExplanation.hidden = true;
    articleFcClaims.hidden     = true;
    articleSources.hidden      = true;
  }

  const charCount = articleTextarea.value.length;
  articleResultMeta.textContent = `${charCount.toLocaleString()} chars analyzed`;

  setArticleState('result');
}

// ── Textarea char counter ─────────────────────────────────────────────────

const ARTICLE_AI_MIN = 250;

function _setArticleBtns(disabled) {
  btnDetectArticle.disabled    = disabled;
  btnFactcheckArticle.disabled = disabled;
}

function _updateArticleBtns() {
  const len = articleTextarea.value.trim().length;
  btnDetectArticle.disabled    = len < ARTICLE_AI_MIN;
  btnFactcheckArticle.disabled = len === 0;
}

articleTextarea.addEventListener('input', () => {
  const len = articleTextarea.value.length;
  const belowMin = len > 0 && len < ARTICLE_AI_MIN;
  articleCharHint.textContent = belowMin
    ? `${len.toLocaleString()} / 15 000 chars  ·  ${ARTICLE_AI_MIN - len} more needed for AI detection`
    : `${len.toLocaleString()} / 15 000 chars`;
  articleCharHint.classList.toggle('art-char-hint--warn', len > 12000);
  articleCharHint.classList.toggle('art-char-hint--min', belowMin);
  _updateArticleBtns();
});

// ── Grab current page ─────────────────────────────────────────────────────

btnGrabPage.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  btnGrabPage.disabled = true;
  btnGrabPage.textContent = 'Grabbing…';

  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const selectors = [
          'article', '[role="main"]', 'main',
          '.article-body', '.article-content', '.post-content',
          '.entry-content', '.story-body', '.post-body', '#article-body',
          '.content-body', '.page-content',
        ];
        let el = null;
        for (const sel of selectors) {
          el = document.querySelector(sel);
          if (el && el.innerText && el.innerText.trim().length > 200) break;
          el = null;
        }
        if (!el) el = document.body;
        const raw = (el.innerText || '').trim();
        // Collapse excess whitespace / blank lines
        return raw.replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').slice(0, 15000);
      },
    });

    const text = result?.result || '';
    if (!text) {
      articleErrorText.textContent = 'Could not extract text from this page.';
      setArticleState('error');
      return;
    }

    articleTextarea.value = text;
    // Trigger input event to update counter and enable button
    articleTextarea.dispatchEvent(new Event('input'));
  } catch (err) {
    articleErrorText.textContent = err.message || 'Could not access this page.';
    setArticleState('error');
  } finally {
    btnGrabPage.disabled = false;
    btnGrabPage.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <rect x="1" y="2" width="12" height="10" rx="1.5" stroke="currentColor" stroke-width="1.4" />
      <line x1="4" y1="5" x2="10" y2="5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
      <line x1="4" y1="7.5" x2="10" y2="7.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
      <line x1="4" y1="10" x2="7" y2="10" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
    </svg> Grab Current Page`;
  }
});

// ── Detect AI (AI-or-Not) ─────────────────────────────────────────────────

btnDetectArticle.addEventListener('click', async () => {
  const text = articleTextarea.value.trim();
  if (!text) return;

  const settings = await msg({ action: 'getSettings' });
  const endpoint = settings.settings?.endpoint || 'http://localhost:8000';

  _setArticleBtns(true);
  setArticleState('loading');
  startArticleLoadingCycle(ARTICLE_DETECT_MSGS);

  try {
    const r = await fetch(`${endpoint}/text/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!r.ok) throw new Error(`AI detection error ${r.status}`);
    const aiResult = await r.json();
    showArticleResult(aiResult, null);
  } catch (err) {
    stopArticleLoadingCycle();
    articleErrorText.textContent = err.message || 'AI detection failed. Is the backend running?';
    setArticleState('error');
  } finally {
    _updateArticleBtns();
  }
});

// ── Fact Check (Gemini) ───────────────────────────────────────────────────

btnFactcheckArticle.addEventListener('click', async () => {
  const text = articleTextarea.value.trim();
  if (!text) return;

  const settings = await msg({ action: 'getSettings' });
  const endpoint = settings.settings?.endpoint || 'http://localhost:8000';

  _setArticleBtns(true);
  setArticleState('loading');
  startArticleLoadingCycle(ARTICLE_FACTCHECK_MSGS);

  try {
    const r = await fetch(`${endpoint}/factcheck/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!r.ok) throw new Error(`Fact-check error ${r.status}`);
    const fcResult = await r.json();
    showArticleResult(null, fcResult);
  } catch (err) {
    stopArticleLoadingCycle();
    articleErrorText.textContent = err.message || 'Fact-check failed. Is the backend running?';
    setArticleState('error');
  } finally {
    _updateArticleBtns();
  }
});

// ── Copy article results ──────────────────────────────────────────────────

btnCopyArticle.addEventListener('click', () => {
  const lines = [];

  if (!articleAiBadge.hidden)
    lines.push(`AI Detection: ${articleAiBadge.textContent} (${articleAiScore.textContent})`);

  if (!articleAiSignals.hidden) {
    const sigs = [...articleAiSignals.querySelectorAll('.art-signal')].map(el => el.textContent.trim());
    if (sigs.length) lines.push(`Signals: ${sigs.join(', ')}`);
  }

  lines.push('');

  if (!articleFcBadge.hidden)
    lines.push(`Fact Check: ${articleFcBadge.textContent}`);

  if (!articleFcExplanation.hidden)
    lines.push(articleFcExplanation.textContent);

  if (!articleFcClaims.hidden) {
    lines.push('');
    articleFcClaims.querySelectorAll('.vclaim').forEach(li => {
      const text    = li.querySelector('.vclaim__text')?.textContent    || '';
      const verdict = li.querySelector('.vclaim__verdict')?.textContent || '';
      lines.push(`• ${text}${verdict ? ' — ' + verdict : ''}`);
    });
  }

  if (!articleSources.hidden) {
    lines.push('');
    lines.push('Sources:');
    articleSourcesList.querySelectorAll('.art-source a').forEach(a => {
      lines.push(`  ${a.href}`);
    });
  }

  navigator.clipboard.writeText(lines.join('\n').trim()).then(() => {
    const orig = btnCopyArticle.innerHTML;
    btnCopyArticle.textContent = 'Copied!';
    setTimeout(() => { btnCopyArticle.innerHTML = orig; }, 1800);
  }).catch(() => {});
});

// ── Clear article ─────────────────────────────────────────────────────────

btnClearArticle.addEventListener('click', () => {
  stopArticleLoadingCycle();
  articleTextarea.value = '';
  articleCharHint.textContent = '0 / 15 000 chars';
  articleCharHint.classList.remove('art-char-hint--warn');
  _setArticleBtns(true);
  setArticleState('empty');
});

// ── Render result ─────────────────────────────────────────────────────────

// ── Image Gemini result ───────────────────────────────────────────────────

function parseImageGeminiAnalysis(text) {
  if (!text || typeof text !== 'string') return null;
  const aiMatch = text.match(/AI\s+DETECTION\s*:\s*(Yes|No|Uncertain)\s*[—–-]+\s*(.+)/i);
  if (!aiMatch) return null;
  const summaryMatch = text.match(/^Summary\s*:\s*([\s\S]+?)(?=\n\n|$)/im);
  return {
    aiVerdict: aiMatch[1].trim(),
    aiReason:  aiMatch[2].trim(),
    summary:   summaryMatch ? summaryMatch[1].trim() : null,
  };
}

function showImageGeminiResult({ analysis, aiPct, url, previewUrl }) {
  stopScanLoadingCycle();

  const parsed = parseImageGeminiAnalysis(analysis);

  if (parsed) {
    imgRawWrap.hidden = true;
    const aiCls = aiVerdictCls(parsed.aiVerdict);
    imgGeminiBadge.textContent = parsed.aiVerdict;
    imgGeminiBadge.className   = `verdict-badge verdict-badge--${aiCls}`;
    imgGeminiBadge.hidden      = false;
    if (imgGeminiConfidence) {
      if (aiPct !== null && aiPct !== undefined) {
        imgGeminiConfidence.textContent = `${aiPct}% chance of AI`;
        imgGeminiConfidence.className   = `gemini-confidence gemini-confidence--${aiCls}`;
        imgGeminiConfidence.hidden      = false;
      } else {
        imgGeminiConfidence.hidden = true;
      }
    }
    imgGeminiReason.textContent = parsed.aiReason || '';
    if (parsed.summary) {
      imgGeminiSummary.textContent = parsed.summary;
      imgGeminiSummary.hidden = false;
    } else {
      imgGeminiSummary.hidden = true;
    }
  } else {
    imgGeminiBadge.hidden = true;
    if (imgGeminiConfidence) imgGeminiConfidence.hidden = true;
    imgRawText.textContent = analysis || '(no response)';
    imgRawWrap.hidden = false;
  }

  if (previewUrl) {
    imgGeminiPreview.src = previewUrl;
    imgGeminiPreview.hidden = false;
  } else {
    imgGeminiPreview.hidden = true;
  }

  imgGeminiSource.textContent = url ? truncate(url, 48) : '';
  showState('result-gemini');
}

function showVideoGeminiResult({ analysis, url }) {
  chrome.storage.local.remove('tl_video_result');
  stopVideoLoadingCycle();

  const parsed = parseGeminiAnalysis(analysis);

  if (parsed) {
    videoRawWrap.hidden = true;

    // AI Detection card
    const aiCls = aiVerdictCls(parsed.aiVerdict);
    videoAiBadge.textContent = parsed.aiVerdict;
    videoAiBadge.className   = `verdict-badge verdict-badge--${aiCls}`;
    videoAiBadge.hidden      = false;
    videoAiReason.textContent = parsed.aiReason || '';

    // Fact Check card
    if (parsed.fcVerdict) {
      const fcCls = verdictCls(parsed.fcVerdict);
      videoFactBadge.textContent = parsed.fcVerdict;
      videoFactBadge.className   = `verdict-badge verdict-badge--${fcCls}`;
      videoFactBadge.hidden      = false;
    } else {
      videoFactBadge.hidden = true;
    }

    if (parsed.fcSummary) {
      videoFactSummary.textContent = parsed.fcSummary;
      videoFactSummary.hidden = false;
    } else {
      videoFactSummary.hidden = true;
    }

    if (parsed.claims.length) {
      videoClaimsList.innerHTML = '';
      parsed.claims.forEach(({ text, verdict }) => {
        const cls = verdictCls(verdict);
        const li  = document.createElement('li');
        li.className = 'vclaim';
        li.innerHTML =
          `<span class="vclaim__dot vclaim__dot--${cls}" aria-hidden="true"></span>` +
          `<span class="vclaim__text">${escAttr(text)}</span>` +
          (verdict ? `<span class="vclaim__verdict vclaim__verdict--${cls}">${escAttr(verdict)}</span>` : '');
        videoClaimsList.appendChild(li);
      });
      videoClaimsList.hidden = false;
    } else {
      videoClaimsList.hidden = true;
    }
  } else {
    // Parsing failed — show raw text
    videoAiBadge.hidden   = true;
    videoFactBadge.hidden = true;
    videoFactSummary.hidden = true;
    videoClaimsList.hidden  = true;
    videoRawText.textContent = analysis || '(no response)';
    videoRawWrap.hidden = false;
  }

  videoResultSource.textContent = url ? `Source: ${truncate(url, 48)}` : '';
  setVideoState('result');
}

function showPreviewOnly({ url, type }) {
  showState('preview');
  const isVideo = type === 'video';
  previewOnlyImg.hidden = isVideo;
  previewOnlyVid.hidden = !isVideo;
  if (isVideo) {
    previewOnlyVid.src = url || '';
  } else {
    previewOnlyImg.src = url || '';
  }
  previewOnlyUrl.textContent = url ? truncate(url, 48) : '';
  previewOnlyUrl.title = url || '';
  btnAnalyzeUpload.disabled = !url;
}

//calculating trustworthy of page 
/*function calcDomainTrust(scores) {
  if (!scores.length) return null;
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  if (avg < 30) return { rating: 'Trustworthy',   cls: 'green',  avg: Math.round(avg) };
  if (avg < 60) return { rating: 'Mixed Content',  cls: 'yellow', avg: Math.round(avg) };
  return        { rating: 'Untrustworthy',          cls: 'red',    avg: Math.round(avg) };
}*/

//display function
/*function showDomainTrust(trust) {
  const el = $('domain-trust');
  if (!el || !trust) return;
  el.hidden = false;
  el.innerHTML = `
    <span>Domain Trust:</span>
    <strong class="gauge-label--${trust.cls}">${trust.rating}</strong>
    <span style="color:#888; font-size:11px">(avg ${trust.avg}% AI across page)</span>
  `;
}*/

// ── Result rendering ──────────────────────────────────────────────────────

function showState(name) {
  stateEmpty.hidden = name !== 'empty';
  stateLoading.hidden = name !== 'loading';
  statePreview.hidden = name !== 'preview';
  stateResult.hidden = name !== 'result';
  stateResultGemini.hidden = name !== 'result-gemini';
}

function showResult({ score, label, cls, url, type, source, summary }) {
  showState('result');

  // Preview thumbnail
  const isVideo = type === 'video';
  resultPreviewImg.hidden = isVideo;
  resultPreviewVid.hidden = !isVideo;
  if (isVideo) {
    resultPreviewVid.src = url || '';
  } else {
    resultPreviewImg.src = url || '';
    resultPreviewImg.alt = label || 'Scanned image';
  }

  // Gauge arc — display AI probability (inverse of realness score)
  const aiPct = 100 - score;
  const offset = GAUGE_LEN * (1 - aiPct / 100);
  gaugeArc.style.strokeDashoffset = offset;

  const colors = { green: '#16A34A', yellow: '#D97706', red: '#DC2626' };
  gaugeArc.style.stroke = colors[cls] || '#8C5E4A';

  gaugePct.textContent = aiPct + '%';
  gaugeLabel.textContent = label;
  gaugeLabel.className = `gauge-label gauge-label--${cls}`;

  resultBadge.textContent = label;
  resultBadge.className = `verdict-badge verdict-badge--${cls}`;
  resultBadge.hidden = false;

  resultUrl.textContent = url ? truncate(url, 48) : '';
  resultUrl.title = url || '';
  resultSource.textContent = source ? `via ${source}` : '';

  const summaryEl = $('result-summary');
  if (summaryEl) {
    summaryEl.textContent = summary || '';
    summaryEl.hidden = !summary;
  }
}

// ── Clear result ──────────────────────────────────────────────────────────

btnClearResult.addEventListener('click', async () => {
  await chrome.storage.local.remove('tl_last_result');
  showState('empty');
});

btnClearResultScan.addEventListener('click', async () => {
  await chrome.storage.local.remove('tl_last_result');
  pendingPick = null;
  pendingUploadFile = null;
  btnAnalyzeUpload.disabled = false;
  showState('empty');
});

btnCopyScan.addEventListener('click', () => {
  const lines = [];
  if (gaugePct.textContent) lines.push(`AI Score: ${gaugePct.textContent} — ${gaugeLabel.textContent}`);
  if (resultUrl.title)       lines.push(`Source: ${resultUrl.title}`);

  navigator.clipboard.writeText(lines.join('\n').trim()).then(() => {
    const orig = btnCopyScan.innerHTML;
    btnCopyScan.textContent = 'Copied!';
    setTimeout(() => { btnCopyScan.innerHTML = orig; }, 1800);
  }).catch(() => { /* clipboard permission denied — silent */ });
});

btnClearImgGemini.addEventListener('click', () => {
  pendingUploadFile = null;
  showState('empty');
});

btnCopyImgGemini.addEventListener('click', () => {
  const lines = [];
  if (!imgRawWrap.hidden) {
    lines.push(imgRawText.textContent);
  } else {
    if (!imgGeminiBadge.hidden) lines.push(`AI Detection: ${imgGeminiBadge.textContent}`);
    if (imgGeminiConfidence && !imgGeminiConfidence.hidden) lines.push(imgGeminiConfidence.textContent);
    if (imgGeminiReason.textContent) lines.push(imgGeminiReason.textContent);
    if (!imgGeminiSummary.hidden)    lines.push('', imgGeminiSummary.textContent);
  }
  if (imgGeminiSource.textContent) lines.push('', imgGeminiSource.textContent);

  navigator.clipboard.writeText(lines.join('\n').trim()).then(() => {
    const orig = btnCopyImgGemini.innerHTML;
    btnCopyImgGemini.textContent = 'Copied!';
    setTimeout(() => { btnCopyImgGemini.innerHTML = orig; }, 1800);
  }).catch(() => { /* clipboard permission denied — silent */ });
});

// ── Upload from device ────────────────────────────────────────────────────

let pendingUploadFile = null; // File object held for the Analyze button
let pendingPick = null;       // { url, type } for page-grabbed images

btnUpload.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (!file) return;
  fileInput.value = ''; // reset so same file can be re-selected

  const type = file.type.startsWith('video/') ? 'video' : 'image';

  const reader = new FileReader();
  reader.onload = () => {
    pendingUploadFile = file;
    btnAnalyzeUpload.disabled = false;
    showPreviewOnly({ url: reader.result, type });
    previewOnlyUrl.textContent = file.name;
    previewOnlyUrl.title = file.name;
  };
  reader.readAsDataURL(file);
});

btnAnalyzeUpload.addEventListener('click', async () => {
  const hasFile = !!pendingUploadFile;
  const pendingUrl = previewOnlyUrl.title || '';
  if (!hasFile && !pendingUrl) return;

  const settings = await msg({ action: 'getSettings' });
  const endpoint = settings.settings?.endpoint || 'http://localhost:8000';

  showState('loading');
  startScanLoadingCycle();
  btnAnalyzeUpload.disabled = true;

  try {
    let geminiJson, aiornotJson;
    let previewUrl = pendingUrl;

    if (hasFile) {
      previewUrl = await new Promise(resolve => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.readAsDataURL(pendingUploadFile);
      });
      const formGemini = new FormData();
      formGemini.append('file', pendingUploadFile, pendingUploadFile.name);
      const formAiornot = new FormData();
      formAiornot.append('file', pendingUploadFile, pendingUploadFile.name);

      const [geminiRes, aiornotRes] = await Promise.all([
        fetch(`${endpoint}/image/gemini/upload`, { method: 'POST', body: formGemini }),
        fetch(`${endpoint}/image/`, { method: 'POST', body: formAiornot }),
      ]);
      if (!geminiRes.ok) throw new Error(`Server error ${geminiRes.status}`);
      geminiJson = await geminiRes.json();
      aiornotJson = aiornotRes.ok ? await aiornotRes.json() : null;
    } else {
      const [geminiRes, aiornotRes] = await Promise.all([
        fetch(`${endpoint}/image/gemini/url`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: pendingUrl }),
        }),
        fetch(`${endpoint}/image/url`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: pendingUrl }),
        }),
      ]);
      if (!geminiRes.ok) throw new Error(`Server error ${geminiRes.status}`);
      geminiJson = await geminiRes.json();
      aiornotJson = aiornotRes.ok ? await aiornotRes.json() : null;
    }

    // Extract AI percentage from AI-or-Not response (confidence is 0-1, higher = more AI)
    let aiPct = null;
    if (aiornotJson) {
      const raw = aiornotJson.report?.ai_generated?.ai?.confidence ?? aiornotJson.score ?? null;
      if (raw !== null) aiPct = Math.round(Math.min(100, Math.max(0, raw * (raw <= 1 ? 100 : 1))));
    }

    showImageGeminiResult({
      analysis: geminiJson.analysis,
      aiPct,
      url: hasFile ? pendingUploadFile.name : pendingUrl,
      previewUrl,
    });
    pendingUploadFile = null;
  } catch (err) {
    stopScanLoadingCycle();
    showState('preview');
    previewOnlyUrl.textContent = err.message;
    btnAnalyzeUpload.disabled = false;
  }
});

// ── Single pick ───────────────────────────────────────────────────────────

btnPick.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  // Ensure content script is present (e.g. on pages opened before install)
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['/content/content.js'] });
    await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['/content/content.css'] });
  } catch { /* already injected or restricted page */ }

  chrome.tabs.sendMessage(tab.id, { action: 'startSelection' });
  // No window.close() — panel/window stays open so the result appears here automatically
});

// ── Batch scan ────────────────────────────────────────────────────────────

btnBatch.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  btnBatch.disabled = true;
  batchProgress.hidden = false;
  progressBar.style.width = '0%';
  progressLabel.textContent = 'Starting scan…';

  //const scores = [];

  // Listen for progress updates from background
  const onProgress = (message) => {
    if (message.action !== 'batchProgress') return;
    //if(message.score != null) scores.push(message.score);
    const { done, total } = message;
    const pct = total ? Math.round((done / total) * 100) : 0;
    progressBar.style.width = pct + '%';
    progressLabel.textContent = `Scanning ${done}/${total} images…`;
    if (done >= total) finish();
  };

  chrome.runtime.onMessage.addListener(onProgress);

  const finish = () => {
    chrome.runtime.onMessage.removeListener(onProgress);
    btnBatch.disabled = false;
    progressLabel.textContent = 'Scan complete';
    //showDomainTrust(calcDomainTrust(scores))
    setTimeout(() => { batchProgress.hidden = true; }, 2500);
  };

  try {
    const sensitivity = sensitivitySel?.value || 'medium';
    const res = await msg({ action: 'analyzeBatch', tabId: tab.id, sensitivity });
    if (res.error) {
      finish();
      progressLabel.textContent = 'Error: ' + res.error;
      return;
    }
    if (res.total === 0) {
      finish();
      progressLabel.textContent = 'No images found on this page.';
    }
  } catch (err) {
    finish();
    progressLabel.textContent = 'Error: ' + (err.message || 'Scan failed');
  }
});

// ── Proactive toggle ──────────────────────────────────────────────────────

if (toggleProactive) {
  toggleProactive.addEventListener('click', async () => {
    const next = toggleProactive.getAttribute('aria-checked') !== 'true';
    toggleProactive.setAttribute('aria-checked', String(next));
    await msg({ action: 'saveSettings', settings: { proactive: next } });
  });
}

if (sensitivitySel) {
  sensitivitySel.addEventListener('change', () => {
    msg({ action: 'saveSettings', settings: { sensitivity: sensitivitySel.value } });
  });
}

// ── Video Check ───────────────────────────────────────────────────────────

let pendingVideoUrl = '';
let pendingVideoFile = null; // File object for direct upload to /video

function setVideoState(name) {
  videoStateEmpty.hidden = name !== 'empty';
  videoStateLoading.hidden = name !== 'loading';
  videoStateResult.hidden = name !== 'result';
  videoStateError.hidden = name !== 'error';
  videoStateTooLong.hidden = name !== 'toolong';
}

videoUrlInput.addEventListener('input', () => {
  pendingVideoUrl = videoUrlInput.value.trim();
  pendingVideoFile = null;
  btnAnalyzeVideo.disabled = !pendingVideoUrl;
});

btnUploadVideo.addEventListener('click', () => videoFileInput.click());

videoFileInput.addEventListener('change', () => {
  const file = videoFileInput.files[0];
  if (!file) return;

  if (file.size > 200 * 1024 * 1024) {
    setVideoState('error');
    videoErrorText.textContent = 'File too large (max 200 MB). Please use a URL instead.';
    return;
  }

  pendingVideoFile = file;
  pendingVideoUrl = '';
  videoUrlInput.value = '';
  videoUrlInput.placeholder = file.name;
  btnAnalyzeVideo.disabled = false;
  console.log('[video] file staged:', file.name);
});

btnAnalyzeVideo.addEventListener('click', async () => {
  console.log('[video] clicked, pendingVideoUrl:', pendingVideoUrl, '| pendingVideoFile:', pendingVideoFile);
  if (!pendingVideoUrl && !pendingVideoFile) { console.warn('[video] nothing pending, aborting'); return; }

  btnAnalyzeVideo.disabled = true;
  setVideoState('loading');
  startVideoLoadingCycle();

  const endpoint = await new Promise(resolve =>
    chrome.storage.local.get('tl_settings', r =>
      resolve(r.tl_settings?.endpoint || 'http://localhost:8000')
    )
  );

  try {
    let analysis;

    if (pendingVideoFile) {
      const form = new FormData();
      form.append('file', pendingVideoFile, pendingVideoFile.name);
      const res = await fetch(`${endpoint}/video/gemini/upload`, { method: 'POST', body: form });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const json = await res.json();
      analysis = json.analysis;
    } else {
      await chrome.storage.local.set({ tl_video_result: { status: 'loading', url: pendingVideoUrl } });
      const res = await fetch(`${endpoint}/video/gemini/url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: pendingVideoUrl }),
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const json = await res.json();
      analysis = json.analysis;
    }

    showVideoGeminiResult({ analysis, url: pendingVideoFile ? pendingVideoFile.name : pendingVideoUrl });
  } catch (err) {
    stopVideoLoadingCycle();
    setVideoState('error');
    videoErrorText.textContent = err.message || 'Analysis failed.';
  }

  btnAnalyzeVideo.disabled = false;
});

function resetVideoTab() {
  stopVideoLoadingCycle();
  if (pendingVideoUrl.startsWith('blob:')) URL.revokeObjectURL(pendingVideoUrl);
  pendingVideoUrl = '';
  pendingVideoFile = null;
  videoUrlInput.value = '';
  videoUrlInput.placeholder = 'Paste YouTube, TikTok, or direct video URL…';
  btnAnalyzeVideo.disabled = true;
  setVideoState('empty');
}

btnClearVideo.addEventListener('click', resetVideoTab);
btnClearTooLong.addEventListener('click', resetVideoTab);

// ── Copy results to clipboard ─────────────────────────────────────────────

btnCopyResult.addEventListener('click', () => {
  const lines = [];

  if (!videoRawWrap.hidden) {
    lines.push(videoRawText.textContent);
  } else {
    if (!videoAiBadge.hidden) {
      lines.push(`AI Detection: ${videoAiBadge.textContent}`);
      if (videoAiReason.textContent) lines.push(videoAiReason.textContent);
    }
    lines.push('');
    if (!videoFactBadge.hidden)
      lines.push(`Fact Check: ${videoFactBadge.textContent}`);
    if (!videoFactSummary.hidden)
      lines.push(videoFactSummary.textContent);
    if (!videoClaimsList.hidden) {
      lines.push('');
      videoClaimsList.querySelectorAll('.vclaim').forEach(li => {
        const text    = li.querySelector('.vclaim__text')?.textContent    || '';
        const verdict = li.querySelector('.vclaim__verdict')?.textContent || '';
        lines.push(`• ${text}${verdict ? ' — ' + verdict : ''}`);
      });
    }
  }

  if (videoResultSource.textContent) lines.push('', videoResultSource.textContent);

  navigator.clipboard.writeText(lines.join('\n').trim()).then(() => {
    const orig = btnCopyResult.innerHTML;
    btnCopyResult.textContent = 'Copied!';
    setTimeout(() => { btnCopyResult.innerHTML = orig; }, 1800);
  }).catch(() => { /* clipboard permission denied — silent */ });
});

// ── History ───────────────────────────────────────────────────────────────

async function loadHistory() {
  historyList.innerHTML = '';
  const { history } = await msg({ action: 'getHistory' });
  if (!history?.length) {
    historyEmpty.hidden = false;
    return;
  }
  historyEmpty.hidden = true;
  history.forEach(item => historyList.appendChild(buildHistoryItem(item)));
}

function buildHistoryItem({ url, type, score, label, cls, timestamp }) {
  const li = document.createElement('li');
  li.className = 'history-item';

  const age = timeAgo(timestamp);
  const isImg = type !== 'video';

  if (isImg) {
    const img = document.createElement('img');
    img.className = 'history-thumb';
    img.src = url;
    img.alt = '';
    img.loading = 'lazy';
    img.addEventListener('error', () => { img.style.visibility = 'hidden'; });
    li.appendChild(img);
  } else {
    const thumb = document.createElement('div');
    thumb.className = 'history-thumb';
    thumb.style.cssText = 'display:flex;align-items:center;justify-content:center;font-size:18px;';
    thumb.textContent = '▶';
    li.appendChild(thumb);
  }

  const info = document.createElement('div');
  info.className = 'history-info';
  const urlDiv = document.createElement('div');
  urlDiv.className = 'history-url';
  urlDiv.title = url;
  urlDiv.textContent = truncate(url, 36);
  const timeDiv = document.createElement('div');
  timeDiv.className = 'history-time';
  timeDiv.textContent = age;
  info.appendChild(urlDiv);
  info.appendChild(timeDiv);
  li.appendChild(info);

  const badge = document.createElement('span');
  badge.className = `history-badge history-badge--${cls}`;
  badge.textContent = `${score}%`;
  li.appendChild(badge);

  return li;
}

// ── Settings ──────────────────────────────────────────────────────────────

if (btnSaveKey) {
  btnSaveKey.addEventListener('click', async () => {
    const key = apiKeyInput.value.trim();
    if (!key || key === '••••••••') return;
    await msg({ action: 'saveSettings', settings: { apiKey: key } });
    apiKeyInput.value = '••••••••';
    showFeedback(cacheFeedback, 'API key saved', false);
  });
}

if (btnSaveEndpoint) {
  btnSaveEndpoint.addEventListener('click', async () => {
    const endpoint = endpointInput.value.trim();
    if (!endpoint) return;
    await msg({ action: 'saveSettings', settings: { endpoint } });
    showFeedback(cacheFeedback, 'Endpoint saved', false);
    checkConnection();
  });
}

if (btnRecheck) btnRecheck.addEventListener('click', checkConnection);

async function checkConnection() {
  if (statusDot) setDot(statusDot, 'unknown');
  if (connDot)   setDot(connDot,   'unknown');
  if (statusText) statusText.textContent = 'Checking…';

  const { connected } = await msg({ action: 'checkConnection' });
  const state = connected ? 'connected' : 'disconnected';
  if (statusDot) setDot(statusDot, state);
  if (connDot)   setDot(connDot,   state);
  if (statusText) statusText.textContent = connected ? 'Connected' : 'Offline';
}

if (btnClearCache) {
  btnClearCache.addEventListener('click', async () => {
    const { cleared, error } = await msg({ action: 'clearCache' });
    if (error) {
      showFeedback(cacheFeedback, error, true);
    } else {
      showFeedback(cacheFeedback, `Cleared ${cleared} cached result${cleared !== 1 ? 's' : ''}`, false);
    }
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────

function msg(payload, _attempt = 0) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage(payload, res => {
      const err = chrome.runtime.lastError;
      if (err) {
        // Service worker may be waking up — retry once after a short delay
        if (_attempt === 0 && err.message && err.message.includes('Receiving end does not exist')) {
          setTimeout(() => msg(payload, 1).then(resolve), 500);
        } else {
          resolve({ error: err.message });
        }
        return;
      }
      resolve(res || {});
    });
  });
}

function setDot(el, state) {
  el.className = `dot dot--${state}`;
  el.title = `Slop-Detector ${state}`;
}

function showFeedback(el, text, isError) {
  el.textContent = text;
  el.className = 'feedback' + (isError ? ' feedback--error' : '');
  el.hidden = false;
  setTimeout(() => { el.hidden = true; }, 3500);
}

function truncate(str, max) {
  if (!str) return '';
  return str.length <= max ? str : '…' + str.slice(-(max - 1));
}

function escAttr(str) {
  return String(str).replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function timeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}

