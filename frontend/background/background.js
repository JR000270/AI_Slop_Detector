/**
 * background/background.js — MV3 Service Worker
 * Loaded via importScripts for Chrome; listed in "scripts" array for Firefox.
 */
importScripts('../utils/api.js');

const HISTORY_KEY = 'tl_history';
const SETTINGS_KEY = 'tl_settings';
const MAX_HISTORY = 50;

// ── Lifecycle ────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'tl-check-image',
    title: 'Check with Plato-AI',
    contexts: ['image'],
  });
  chrome.contextMenus.create({
    id: 'tl-check-video',
    title: 'Check with Plato-AI',
    contexts: ['video'],
  });
});

// ── Context menu ─────────────────────────────────────────────────────────────

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const mediaUrl = info.srcUrl;
  const mediaType = info.menuItemId === 'tl-check-video' ? 'video' : 'image';
  if (!mediaUrl || !tab?.id) return;

  // Store URL immediately so the popup can show a preview even if analysis fails.
  // TODO: remove score:null once scanning is implemented (storageSet below will overwrite it)
  await chrome.storage.local.set({ tl_last_result: { url: mediaUrl, type: mediaType } });

  sendToTab(tab.id, { action: 'showScanning', url: mediaUrl });

  try {
    const settings = await getSettings();
    const result = await analyzeMedia(mediaUrl, mediaType, settings.apiKey, settings.endpoint);
    await saveHistory({ url: mediaUrl, type: mediaType, ...result });
    sendToTab(tab.id, { action: 'addBadge', url: mediaUrl, ...result });
    await storageSet('tl_last_result', { url: mediaUrl, type: mediaType, ...result });
  } catch (err) {
    sendToTab(tab.id, { action: 'badgeError', url: mediaUrl, message: friendlyError(err) });
  }
});

// ── Message bus ──────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handle(msg, sender).then(sendResponse).catch(err => sendResponse({ error: friendlyError(err) }));
  return true; // keep channel open for async response
});

async function handle(msg, sender) {
  switch (msg.action) {

    case 'analyzeSingle': {
      const { url, type } = msg;
      const settings = await getSettings();
      console.log('[bg:analyzeSingle] url:', url, '| type:', type, '| endpoint:', settings.endpoint, '| hasApiKey:', !!settings.apiKey);
      sendToTab(sender.tab?.id, { action: 'showScanning', url });
      try {
        const result = await analyzeMedia(url, type, settings.apiKey, settings.endpoint);
        console.log('[bg:analyzeSingle] result:', result);
        await saveHistory({ url, type, ...result });
        await storageSet('tl_last_result', { url, type, ...result });
        sendToTab(sender.tab?.id, { action: 'addBadge', url, ...result });
        return { ok: true, result };
      } catch (err) {
        console.error('[bg:analyzeSingle] failed:', err.message);
        throw err;
      }
    }

    case 'analyzeBatch': {
      const { tabId, sensitivity } = msg;
      const items = await getTabImages(tabId, sensitivity);
      if (!items.length) return { ok: true, total: 0 };

      const settings = await getSettings();
      let done = 0;

      for (const item of items) {
        sendToTab(tabId, { action: 'showScanning', url: item.url });
        try {
          const result = await analyzeMedia(item.url, item.type, settings.apiKey, settings.endpoint);
          await saveHistory({ url: item.url, type: item.type, ...result });
          sendToTab(tabId, { action: 'addBadge', url: item.url, ...result });
          done++;
          // Notify popup of progress
          chrome.runtime.sendMessage({ action: 'batchProgress', done, total: items.length }).catch(() => { });
        } catch {
          sendToTab(tabId, { action: 'badgeError', url: item.url, message: 'Failed' });
          done++;
          chrome.runtime.sendMessage({ action: 'batchProgress', done, total: items.length }).catch(() => { });
        }
      }
      return { ok: true, total: items.length };
    }

    case 'proactiveScan': {
      const { tabId, sensitivity } = msg;
      const items = await getTabImages(tabId, sensitivity);
      const settings = await getSettings();
      // Fire and forget; badges update as results arrive
      (async () => {
        for (const item of items) {
          try {
            const result = await analyzeMedia(item.url, item.type, settings.apiKey, settings.endpoint);
            await saveHistory({ url: item.url, type: item.type, ...result });
            sendToTab(tabId, { action: 'addBadge', url: item.url, ...result });
          } catch { /* silent */ }
        }
      })();
      return { ok: true };
    }

    case 'analyzeVideoContent': {
      const { url } = msg;
      const settings = await getSettings();
      const text = await analyzeVideoContent(url, settings.apiKey, settings.endpoint);
      return { ok: true, text };
    }

    case 'getHistory':
      return { ok: true, history: await getHistory() };

    case 'clearCache': {
      const keys = await getStorageKeys();
      const cacheKeys = keys.filter(k => k.startsWith('cache_'));
      if (cacheKeys.length) await chrome.storage.local.remove(cacheKeys);
      return { ok: true, cleared: cacheKeys.length };
    }

    case 'clearHistory':
      await chrome.storage.local.remove(HISTORY_KEY);
      return { ok: true };

    case 'checkConnection': {
      const settings = await getSettings();
      const connected = await checkBackendConnection(settings.endpoint);
      return { ok: true, connected };
    }

    case 'saveSettings': {
      const current = await getSettings();
      await chrome.storage.local.set({ [SETTINGS_KEY]: { ...current, ...msg.settings } });
      return { ok: true };
    }

    case 'getSettings':
      return { ok: true, settings: await getSettings() };

    case 'getLastResult':
      return { ok: true, result: await storageGet('tl_last_result') };

    default:
      return { error: 'Unknown action' };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getSettings() {
  return new Promise(resolve => {
    chrome.storage.local.get(SETTINGS_KEY, res => {
      resolve({
        apiKey: '',
        endpoint: 'http://localhost:8000',
        proactive: false,
        sensitivity: 'medium',
        ...(res[SETTINGS_KEY] || {}),
      });
    });
  });
}

async function getHistory() {
  return new Promise(resolve => {
    chrome.storage.local.get(HISTORY_KEY, res => resolve(res[HISTORY_KEY] || []));
  });
}

async function saveHistory(entry) {
  const history = await getHistory();
  history.unshift({ ...entry, timestamp: Date.now() });
  if (history.length > MAX_HISTORY) history.splice(MAX_HISTORY);
  await chrome.storage.local.set({ [HISTORY_KEY]: history });
}

async function getStorageKeys() {
  return new Promise(resolve => {
    chrome.storage.local.get(null, res => resolve(Object.keys(res)));
  });
}

async function getTabImages(tabId, sensitivity) {
  return new Promise(resolve => {
    chrome.tabs.sendMessage(tabId, { action: 'getImages', sensitivity }, res => {
      if (chrome.runtime.lastError || !res) return resolve([]);
      resolve(res.items || []);
    });
  });
}

function sendToTab(tabId, msg) {
  if (!tabId) return;
  chrome.tabs.sendMessage(tabId, msg).catch(() => { });
}

function friendlyError(err) {
  if (!err) return 'Unknown error';
  const msg = err.message || String(err);
  if (msg.includes('Rate limit')) return 'API rate limit reached. Try again later.';
  if (msg.includes('No API key')) return 'No API key set. Configure one in Settings.';
  if (msg.includes('NetworkError') || msg.includes('Failed to fetch')) return 'Network error. Check your connection.';
  if (msg.includes('abort')) return 'Request timed out.';
  return msg;
}
