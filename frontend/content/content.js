/**
 * content/content.js
 * Handles badge rendering, page image collection, and inline detail overlays.
 */
(() => {
  if (window.__tlInjected) return;
  window.__tlInjected = true;

  // Map from image src → badge element (to update rather than duplicate)
  const badgeMap = new Map();

  // ── Selection mode ────────────────────────────────────────────────────────

  let selecting = false;

  function startSelection() {
    if (selecting) return;
    selecting = true;
    document.body.classList.add('tl-selecting');
    document.addEventListener('mouseover', onSelectionHover, true);
    document.addEventListener('mouseout',  onSelectionOut,   true);
    document.addEventListener('click',     onSelectionClick, true);
    document.addEventListener('keydown',   onSelectionEsc,   true);
    showToast('Click an image or video to scan it — Esc to cancel');
  }

  function stopSelection() {
    if (!selecting) return;
    selecting = false;
    document.body.classList.remove('tl-selecting');
    document.removeEventListener('mouseover', onSelectionHover, true);
    document.removeEventListener('mouseout',  onSelectionOut,   true);
    document.removeEventListener('click',     onSelectionClick, true);
    document.removeEventListener('keydown',   onSelectionEsc,   true);
    clearSelectionHighlight();
  }

  function onSelectionHover(e) {
    const el = pickableMedia(e.target);
    if (el) el.classList.add('tl-hover');
  }

  function onSelectionOut(e) {
    const el = pickableMedia(e.target);
    if (el) el.classList.remove('tl-hover');
  }

  function onSelectionClick(e) {
    const el = pickableMedia(e.target);
    if (!el) { stopSelection(); return; }

    e.preventDefault();
    e.stopImmediatePropagation();

    const url  = mediaUrl(el);
    const type = el.tagName.toLowerCase() === 'video' ? 'video' : 'image';
    if (!url) { stopSelection(); return; }
    stopSelection();

    chrome.storage.local.set({ tl_last_result: { url, type, score: null } });
  }

  function onSelectionEsc(e) {
    if (e.key === 'Escape') stopSelection();
  }

  function clearSelectionHighlight() {
    document.querySelectorAll('.tl-hover').forEach(el => el.classList.remove('tl-hover'));
  }

  /**
   * Walk up the DOM from el until we find an img or video (or hit body).
   * This handles clicks that land on overlays, anchors, figures, picture, etc.
   */
  function pickableMedia(el) {
    while (el && el !== document.body) {
      const tag = el.tagName?.toLowerCase();
      if (tag === 'img' || tag === 'video') return el;
      // A <picture> element wraps an <img> — step into it
      if (tag === 'picture') {
        const img = el.querySelector('img');
        if (img) return img;
      }
      el = el.parentElement;
    }
    return null;
  }

  /**
   * Return the best URL for a media element.
   * Prefer currentSrc (what the browser actually loaded, respects srcset/picture)
   * over the src attribute (which may be a low-res fallback).
   */
  function mediaUrl(el) {
    return el.currentSrc || el.src || el.getAttribute('src') || '';
  }

  // ── Toast ─────────────────────────────────────────────────────────────────

  function showToast(text) {
    document.getElementById('tl-toast')?.remove();
    const toast = document.createElement('div');
    toast.id = 'tl-toast';
    toast.textContent = text;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }

  // ── Size thresholds per sensitivity ───────────────────────────────────────

  const SIZE_THRESHOLD = { high: 0, medium: 150, low: 350 };

  // ── Message listener ──────────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    switch (msg.action) {
      case 'startSelection':
        startSelection();
        break;
      case 'getImages':
        sendResponse({ items: collectImages(msg.sensitivity || 'medium') });
        break;
      case 'showScanning':
        upsertBadge(msg.url, 'scanning', null);
        break;
      case 'addBadge':
      case 'updateBadge':
        upsertBadge(msg.url, 'result', { score: msg.score, label: msg.label, cls: msg.cls, summary: msg.summary });
        break;
      case 'badgeError':
        upsertBadge(msg.url, 'error', { message: msg.message });
        break;
    }
    return false;
  });

  // ── Image collection ──────────────────────────────────────────────────────

  function collectImages(sensitivity) {
    const minPx = SIZE_THRESHOLD[sensitivity] ?? SIZE_THRESHOLD.medium;
    const items = [];
    const seen = new Set();

    document.querySelectorAll('img, video').forEach(el => {
      const url = el.currentSrc || el.src || el.getAttribute('src');
      if (!url || seen.has(url)) return;
      seen.add(url);

      const rect = el.getBoundingClientRect();
      // Use naturalWidth/Height for <img>, videoWidth/Height for <video>
      const w = el.naturalWidth || el.videoWidth || rect.width;
      const h = el.naturalHeight || el.videoHeight || rect.height;
      if (Math.max(w, h) < minPx) return;

      items.push({
        url,
        type: el.tagName.toLowerCase() === 'video' ? 'video' : 'image',
      });
    });

    return items;
  }

  // ── Badge rendering ───────────────────────────────────────────────────────

  /**
   * Find the matching media element for a URL, then create or update its badge.
   */
  function upsertBadge(url, state, data) {
    const el = findMediaElement(url);
    if (!el) return;

    let badge = badgeMap.get(url);
    if (!badge) {
      badge = createBadgeShell(el, url);
      badgeMap.set(url, badge);
    }

    renderBadgeState(badge, state, data);
  }

  /** Locate an img/video element by its src/currentSrc. */
  function findMediaElement(url) {
    // Linear scan is the only reliable approach: CSS attribute selectors break on
    // URLs containing special characters, and src vs currentSrc diverge for
    // srcset/picture images.
    for (const el of document.querySelectorAll('img, video')) {
      if (mediaUrl(el) === url) return el;
    }
    // Also check <source> inside <video>
    for (const src of document.querySelectorAll('video source')) {
      if ((src.src || src.getAttribute('src')) === url) return src.closest('video');
    }
    return null;
  }

  /** Insert a badge shell absolutely positioned in the corner of the media element. */
  function createBadgeShell(mediaEl, url) {
    // Ensure the parent has relative positioning so we can anchor to it
    const parent = mediaEl.parentElement;
    const parentPos = getComputedStyle(parent).position;
    if (parentPos === 'static') parent.style.position = 'relative';

    const badge = document.createElement('div');
    badge.className = 'tl-badge';
    badge.dataset.url = url;

    // Position relative to the media element's top-right corner
    const parentRect = parent.getBoundingClientRect();
    const elRect = mediaEl.getBoundingClientRect();
    badge.style.top  = (elRect.top  - parentRect.top  + 4) + 'px';
    badge.style.left = (elRect.right - parentRect.left - 4) + 'px'; // anchored right via transform

    badge.addEventListener('click', e => {
      e.stopPropagation();
      toggleDetail(badge, url);
    });

    parent.appendChild(badge);
    return badge;
  }

  function renderBadgeState(badge, state, data) {
    badge.className = 'tl-badge';
    badge.innerHTML = '';

    if (state === 'scanning') {
      badge.classList.add('tl-badge--scanning');
      badge.innerHTML = '<span class="tl-spinner"></span>';
    } else if (state === 'result') {
      badge.classList.add(`tl-badge--${data.cls}`);
      badge.innerHTML = `<span class="tl-badge__pct">${data.score}%</span>`;
      badge.title = `TruthLens: ${data.label} (${data.score}% AI probability)`;
      badge.dataset.score   = data.score;
      badge.dataset.label   = data.label;
      badge.dataset.cls     = data.cls;
      badge.dataset.summary = data.summary || '';
    } else if (state === 'error') {
      badge.classList.add('tl-badge--error');
      badge.innerHTML = '!';
      badge.title = `TruthLens error: ${data.message}`;
    }
  }

  // ── Inline detail overlay ─────────────────────────────────────────────────

  let activeDetail = null;

  function toggleDetail(badge, url) {
    // Close any existing detail
    if (activeDetail) {
      activeDetail.remove();
      const prev = activeDetail._badge;
      activeDetail = null;
      if (prev === badge) return; // clicking same badge closes it
    }

    const score = parseInt(badge.dataset.score, 10);
    if (isNaN(score)) return; // no result yet

    const label   = badge.dataset.label;
    const cls     = badge.dataset.cls;
    const summary = badge.dataset.summary || '';

    const detail = document.createElement('div');
    detail.className = `tl-detail tl-detail--${cls}`;
    detail._badge = badge;

    detail.innerHTML = `
      <button class="tl-detail__close" title="Close">✕</button>
      <div class="tl-detail__logo">TruthLens</div>
      <div class="tl-detail__gauge">
        <svg viewBox="0 0 120 65" width="120" height="65" aria-hidden="true">
          <path d="M10,60 A50,50 0 0,1 110,60"
                fill="none" stroke="#E2E8F0" stroke-width="10" stroke-linecap="round"/>
          <path class="tl-gauge-arc" d="M10,60 A50,50 0 0,1 110,60"
                fill="none" stroke="currentColor" stroke-width="10" stroke-linecap="round"
                stroke-dasharray="157.08" stroke-dashoffset="${157.08 * (1 - score / 100)}"/>
        </svg>
        <div class="tl-detail__pct">${score}%</div>
      </div>
      <div class="tl-detail__label">${escHtml(label)}</div>
      ${summary ? `<div class="tl-detail__summary">${escHtml(summary)}</div>` : ''}
      <div class="tl-detail__url" title="${escAttr(url)}">${truncate(url, 40)}</div>
    `;

    detail.querySelector('.tl-detail__close').addEventListener('click', e => {
      e.stopPropagation();
      detail.remove();
      activeDetail = null;
    });

    // Position near the badge
    badge.parentElement.appendChild(detail);
    // Place below the badge
    const bRect = badge.getBoundingClientRect();
    const pRect = badge.parentElement.getBoundingClientRect();
    detail.style.top  = (bRect.bottom - pRect.top + 6) + 'px';
    detail.style.left = Math.max(0, (bRect.right - pRect.left - detail.offsetWidth)) + 'px';

    activeDetail = detail;

    // Close on outside click
    const onOutside = (e) => {
      if (!detail.contains(e.target) && e.target !== badge) {
        detail.remove();
        activeDetail = null;
        document.removeEventListener('click', onOutside, true);
      }
    };
    setTimeout(() => document.addEventListener('click', onOutside, true), 0);
  }

  // ── Proactive scan trigger (called from background on navigation) ──────────
  // The background checks the proactive setting and calls analyzeBatch itself.

  // ── Utilities ─────────────────────────────────────────────────────────────

  function escHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function escAttr(str) {
    return String(str).replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }
  function truncate(str, max) {
    return str.length <= max ? str : '…' + str.slice(-max + 1);
  }
})();
