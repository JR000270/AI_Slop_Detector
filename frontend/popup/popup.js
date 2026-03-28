/**
 * popup/popup.js
 * Vanilla JS — no framework. All communication via chrome.runtime.sendMessage.
 */

// ── DOM refs ──────────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);

const tabs           = document.querySelectorAll('.tab');
const panels         = { scan: $('tab-scan'), history: $('tab-history'), settings: $('tab-settings') };

// Scan tab
const stateEmpty     = $('state-empty');
const stateLoading   = $('state-loading');
// TODO: remove statePreview when scanning is implemented
const statePreview   = $('state-preview');
const previewOnlyImg = $('preview-only-img');
const previewOnlyVid = $('preview-only-vid');
const previewOnlyUrl = $('preview-only-url');
const stateResult    = $('state-result');
const gaugeArc       = $('gauge-arc');
const gaugePct       = $('gauge-pct');
const gaugeLabel     = $('gauge-label');
const resultPreviewImg = $('result-preview-img');
const resultPreviewVid = $('result-preview-vid');
const resultUrl      = $('result-url');
const resultSource   = $('result-source');
const btnPick        = $('btn-pick');
const btnBatch       = $('btn-batch');
const batchProgress  = $('batch-progress');
const progressBar    = $('progress-bar');
const progressLabel  = $('progress-label');
const toggleProactive = $('toggle-proactive');
const sensitivitySel = $('sensitivity-select');

// History tab
const historyList    = $('history-list');
const historyEmpty   = $('history-empty');

// Settings tab
const apiKeyInput    = $('api-key-input');
const endpointInput  = $('endpoint-input');
const btnSaveKey     = $('btn-save-key');
const btnSaveEndpoint = $('btn-save-endpoint');
const btnRecheck     = $('btn-recheck');
const statusDot      = $('status-dot');
const statusText     = $('status-text');
const btnClearCache  = $('btn-clear-cache');
const cacheFeedback  = $('cache-feedback');
const connDot        = $('connection-dot');

// Gauge constants: path "M20,100 A80,80 0 0,1 180,100" → half-circle r=80 → length ≈ 251.2
const GAUGE_LEN = 251.2;

// ── Init ──────────────────────────────────────────────────────────────────

(async () => {
  setupTabs();
  await Promise.all([loadSettings(), loadLastResult()]);
  checkConnection();
})();

// Refresh the result area whenever tl_last_result changes in storage
// (e.g. user picks an image while the panel is already open)
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.tl_last_result) {
    const result = changes.tl_last_result.newValue;
    if (!result) return;
    if (result.score != null) {
      showResult(result);
    } else {
      showPreviewOnly(result);
    }
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

  apiKeyInput.value     = settings.apiKey  ? '••••••••' : '';
  endpointInput.value   = settings.endpoint || 'http://localhost:3000/api/truthlens';

  toggleProactive.setAttribute('aria-checked', String(!!settings.proactive));
  sensitivitySel.value  = settings.sensitivity || 'medium';
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

// TODO: remove this function when scanning is implemented
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
}

// ── Result rendering ──────────────────────────────────────────────────────

function showState(name) {
  stateEmpty.hidden   = name !== 'empty';
  stateLoading.hidden = name !== 'loading';
  statePreview.hidden = name !== 'preview'; // TODO: remove when scanning is implemented
  stateResult.hidden  = name !== 'result';
}

function showResult({ score, label, cls, url, type, source }) {
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

  // Gauge arc
  const offset = GAUGE_LEN * (1 - score / 100);
  gaugeArc.style.strokeDashoffset = offset;

  const colors = { green: '#16A34A', yellow: '#D97706', red: '#DC2626' };
  gaugeArc.style.stroke = colors[cls] || '#2563EB';

  gaugePct.textContent = score + '%';
  gaugeLabel.textContent = label;
  gaugeLabel.className = `gauge-label gauge-label--${cls}`;

  resultUrl.textContent  = url ? truncate(url, 48) : '';
  resultUrl.title        = url || '';
  resultSource.textContent = source ? `via ${source}` : '';
}

// ── Single pick ───────────────────────────────────────────────────────────

btnPick.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  // Ensure content script is present (e.g. on pages opened before install)
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/content.js'] });
    await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['content/content.css'] });
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

  // Listen for progress updates from background
  const onProgress = (message) => {
    if (message.action !== 'batchProgress') return;
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
    setTimeout(() => { batchProgress.hidden = true; }, 2500);
  };

  const res = await msg({ action: 'analyzeBatch', tabId: tab.id, sensitivity: sensitivitySel.value });
  if (res.error) {
    finish();
    progressLabel.textContent = 'Error: ' + res.error;
    return;
  }
  if (res.total === 0) {
    finish();
    progressLabel.textContent = 'No images found on this page.';
  }
});

// ── Proactive toggle ──────────────────────────────────────────────────────

toggleProactive.addEventListener('click', async () => {
  const next = toggleProactive.getAttribute('aria-checked') !== 'true';
  toggleProactive.setAttribute('aria-checked', String(next));
  await msg({ action: 'saveSettings', settings: { proactive: next } });
});

sensitivitySel.addEventListener('change', () => {
  msg({ action: 'saveSettings', settings: { sensitivity: sensitivitySel.value } });
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

  li.innerHTML = `
    ${isImg
      ? `<img class="history-thumb" src="${escAttr(url)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`
      : `<div class="history-thumb" style="display:flex;align-items:center;justify-content:center;font-size:18px;">▶</div>`
    }
    <div class="history-info">
      <div class="history-url" title="${escAttr(url)}">${truncate(url, 36)}</div>
      <div class="history-time">${age}</div>
    </div>
    <span class="history-badge history-badge--${cls}">${score}%</span>
  `;
  return li;
}

// ── Settings ──────────────────────────────────────────────────────────────

btnSaveKey.addEventListener('click', async () => {
  const key = apiKeyInput.value.trim();
  if (!key || key === '••••••••') return;
  await msg({ action: 'saveSettings', settings: { apiKey: key } });
  apiKeyInput.value = '••••••••';
  showFeedback(cacheFeedback, 'API key saved', false);
});

btnSaveEndpoint.addEventListener('click', async () => {
  const endpoint = endpointInput.value.trim();
  if (!endpoint) return;
  await msg({ action: 'saveSettings', settings: { endpoint } });
  showFeedback(cacheFeedback, 'Endpoint saved', false);
  checkConnection();
});

btnRecheck.addEventListener('click', checkConnection);

async function checkConnection() {
  setDot(statusDot, 'unknown');
  setDot(connDot, 'unknown');
  statusText.textContent = 'Checking…';

  const { connected } = await msg({ action: 'checkConnection' });
  const state = connected ? 'connected' : 'disconnected';
  setDot(statusDot, state);
  setDot(connDot, state);
  statusText.textContent = connected ? 'Connected' : 'Offline';
}

btnClearCache.addEventListener('click', async () => {
  const { cleared, error } = await msg({ action: 'clearCache' });
  if (error) {
    showFeedback(cacheFeedback, error, true);
  } else {
    showFeedback(cacheFeedback, `Cleared ${cleared} cached result${cleared !== 1 ? 's' : ''}`, false);
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────

function msg(payload) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage(payload, res => {
      if (chrome.runtime.lastError) return resolve({ error: chrome.runtime.lastError.message });
      resolve(res || {});
    });
  });
}

function setDot(el, state) {
  el.className = `dot dot--${state}`;
  el.title = `OpenClaw ${state}`;
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
  if (s < 60)   return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}
