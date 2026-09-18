/**
 * Veilex — Background Service Worker (Orchestrator)
 * 
 * Central coordinator for the entire privacy pipeline:
 * 1. Receives prompt from popup (or keyboard shortcut)
 * 2. Captures screenshot via chrome.tabs.captureVisibleTab()
 * 3. Sends DOM extraction request to content script
 * 4. Runs PII detection tiers (via offscreen document for ML)
 * 5. Runs redaction engine
 * 6. Packages sanitized context and sends to server
 * 7. Receives action commands from server
 * 8. Forwards actions to content script for execution
 * 9. Loops for multi-step flows
 */

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────
const PIPELINE_STEPS = ['capture', 'detect', 'redact', 'send', 'execute'];
const OFFSCREEN_URL = 'background/offscreen-worker.html';

// ──────────────────────────────────────────────
// State
// ──────────────────────────────────────────────
let pipelineRunning = false;
let offscreenDocumentCreated = false;

// ──────────────────────────────────────────────
// Utility — Send status update to popup
// ──────────────────────────────────────────────
function notifyPopup(message) {
  chrome.runtime.sendMessage(message).catch(() => {
    // Popup might be closed — that's OK
  });
}

function notifyStatus(step) {
  notifyPopup({ type: 'PIPELINE_STATUS', step });
  // Update badge to show current step
  const badges = { capture: '📷', detect: '🔍', redact: '🛡️', send: '📤', execute: '⚡' };
  const colors = { capture: '#60a5fa', detect: '#fbbf24', redact: '#f87171', send: '#34d399', execute: '#a78bfa' };
  chrome.action.setBadgeText({ text: badges[step] || '…' });
  chrome.action.setBadgeBackgroundColor({ color: colors[step] || '#818cf8' });
}

// ──────────────────────────────────────────────
// Utility — Get active tab
// ──────────────────────────────────────────────
async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) throw new Error('No active tab found.');
  if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
    throw new Error('Cannot run on browser internal pages.');
  }
  return tab;
}

// ──────────────────────────────────────────────
// Offscreen Document Management
// ──────────────────────────────────────────────
async function ensureOffscreenDocument() {
  if (offscreenDocumentCreated) return;

  try {
    // Check if already exists
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)],
    });

    if (existingContexts.length > 0) {
      offscreenDocumentCreated = true;
      return;
    }

    await chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: ['DOM_PARSER', 'WORKERS'],
      justification: 'Run ML inference for PII detection and canvas redaction',
    });
    offscreenDocumentCreated = true;
    console.log('[Veilex] Offscreen document created.');

    // Trigger model loading (async, non-blocking)
    chrome.runtime.sendMessage({ type: 'LOAD_MODELS', target: 'offscreen' }).catch(() => {});
  } catch (e) {
    console.error('[Veilex] Failed to create offscreen document:', e);
    throw e;
  }
}

// ──────────────────────────────────────────────
// Step 1: Capture Screenshot
// ──────────────────────────────────────────────
async function captureScreenshot() {
  const dataUrl = await chrome.tabs.captureVisibleTab(null, {
    format: 'png',
  });
  return dataUrl;
}

// ──────────────────────────────────────────────
// Step 2: Extract DOM from content script
// ──────────────────────────────────────────────
async function extractDOM(tabId) {
  const response = await chrome.tabs.sendMessage(tabId, {
    type: 'EXTRACT_DOM',
  });
  return response;
}

// ──────────────────────────────────────────────
// Step 3: Run PII Detection (Tier 1 in SW, Tier 2/3 via offscreen)
// ──────────────────────────────────────────────
async function runPIIDetection(screenshotDataUrl, domSnapshot) {
  // For Phase 1, this is a stub.
  // Tier 1 (DOM + regex) will run here directly.
  // Tier 2/3 (ML models) will be delegated to offscreen document.

  await ensureOffscreenDocument();

  const response = await chrome.runtime.sendMessage({
    type: 'RUN_DETECTION',
    target: 'offscreen',
    payload: {
      screenshot: screenshotDataUrl,
      domSnapshot,
    },
  });

  return response?.detections || [];
}

// ──────────────────────────────────────────────
// Step 4: Run Redaction (via offscreen document canvas)
// ──────────────────────────────────────────────
async function runRedaction(screenshotDataUrl, detections) {
  await ensureOffscreenDocument();

  const response = await chrome.runtime.sendMessage({
    type: 'RUN_REDACTION',
    target: 'offscreen',
    payload: {
      screenshot: screenshotDataUrl,
      detections,
    },
  });

  return {
    sanitizedScreenshot: response?.sanitizedScreenshot || null,
    sanitizedDOM: response?.sanitizedDOM || null,
    manifest: response?.manifest || null,
  };
}

// ──────────────────────────────────────────────
// Step 5: Send sanitized context to server
// ──────────────────────────────────────────────
async function sendToServer(sanitizedPayload) {
  const settings = await chrome.storage.local.get(['serverUrl']);
  const serverUrl = settings.serverUrl || 'http://localhost:8000';

  const response = await fetch(`${serverUrl}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sanitizedPayload),
  });

  if (!response.ok) {
    throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
  }

  return await response.json();
}

// ──────────────────────────────────────────────
// Step 6: Execute actions via content script
// ──────────────────────────────────────────────
async function executeActions(tabId, actions) {
  const results = [];

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    notifyPopup({ type: 'ACTION_STATUS', index: i, status: 'pending' });

    try {
      const result = await chrome.tabs.sendMessage(tabId, {
        type: 'EXECUTE_ACTION',
        payload: action,
      });

      const status = result?.success ? 'success' : 'error';
      notifyPopup({ type: 'ACTION_STATUS', index: i, status });
      results.push({ action, status, result });

      // Small delay between actions for reliability
      if (i < actions.length - 1) {
        await new Promise((r) => setTimeout(r, 500));
      }
    } catch (e) {
      notifyPopup({ type: 'ACTION_STATUS', index: i, status: 'error' });
      results.push({ action, status: 'error', error: e.message });
    }
  }

  return results;
}

// ──────────────────────────────────────────────
// Main Pipeline
// ──────────────────────────────────────────────
async function runPipeline(userPrompt) {
  if (pipelineRunning) {
    notifyPopup({ type: 'PIPELINE_ERROR', error: 'Pipeline is already running.' });
    return;
  }

  pipelineRunning = true;
  const timings = {};

  try {
    const tab = await getActiveTab();
    let t0;

    // ── Step 1: Capture ──
    notifyStatus('capture');
    t0 = performance.now();
    const screenshotDataUrl = await captureScreenshot();
    const domSnapshot = await extractDOM(tab.id);
    timings.capture = Math.round(performance.now() - t0);

    // ── Step 2: Detect PII ──
    notifyStatus('detect');
    t0 = performance.now();
    const detections = await runPIIDetection(screenshotDataUrl, domSnapshot);
    timings.detect = Math.round(performance.now() - t0);

    // ── Step 3: Redact ──
    notifyStatus('redact');
    t0 = performance.now();
    const { sanitizedScreenshot, sanitizedDOM, manifest } = await runRedaction(
      screenshotDataUrl,
      detections
    );
    timings.redact = Math.round(performance.now() - t0);

    // Build privacy summary from manifest
    const privacySummary = manifest?.summary || {};

    // ── Step 4: Send to Server ──
    notifyStatus('send');
    t0 = performance.now();
    const serverResponse = await sendToServer({
      screenshot_b64: sanitizedScreenshot,
      dom_snapshot: sanitizedDOM || domSnapshot,
      redaction_manifest: manifest,
      user_prompt: userPrompt,
      page_url: new URL(tab.url).origin, // Domain only — no path leakage
      page_title: tab.title,
      viewport: { width: tab.width, height: tab.height },
      timestamp: new Date().toISOString(),
    });
    timings.send = Math.round(performance.now() - t0);

    // ── Step 5: Execute Actions ──
    notifyStatus('execute');
    t0 = performance.now();
    const actions = serverResponse?.actions || [];
    const explanation = serverResponse?.explanation || '';
    
    // Notify popup with results before executing
    // Include screenshots for the preview panel
    notifyPopup({
      type: 'PIPELINE_COMPLETE',
      privacySummary,
      timings: { ...timings, execute: 0 },
      actions,
      explanation,
      redactedScreenshot: sanitizedScreenshot,
      originalScreenshot: screenshotDataUrl,
    });

    // Check if auto-execute is enabled
    const settings = await chrome.storage.local.get(['autoExecute']);
    const autoExecute = settings.autoExecute !== false; // default true

    if (actions.length > 0 && autoExecute) {
      await executeActions(tab.id, actions);
    }
    timings.execute = Math.round(performance.now() - t0);

    // Final timing update with execute time
    notifyPopup({
      type: 'PIPELINE_COMPLETE',
      privacySummary,
      timings,
      actions,
      explanation,
      redactedScreenshot: sanitizedScreenshot,
      originalScreenshot: screenshotDataUrl,
    });

    // Clear badge on completion
    chrome.action.setBadgeText({ text: '✓' });
    chrome.action.setBadgeBackgroundColor({ color: '#34d399' });
    setTimeout(() => chrome.action.setBadgeText({ text: '' }), 3000);

  } catch (error) {
    console.error('[Veilex] Pipeline error:', error);
    notifyPopup({
      type: 'PIPELINE_ERROR',
      error: error.message || 'An unexpected error occurred.',
    });
    // Show error badge
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#f87171' });
    setTimeout(() => chrome.action.setBadgeText({ text: '' }), 5000);
  } finally {
    pipelineRunning = false;
  }
}

// ──────────────────────────────────────────────
// Message Listener
// ──────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Only handle messages meant for the service worker
  if (message.target === 'offscreen') return false;

  switch (message.type) {
    case 'RUN_PIPELINE':
      runPipeline(message.payload?.userPrompt || 'Help me with this page')
        .then(() => sendResponse({ success: true }))
        .catch((e) => sendResponse({ error: e.message }));
      return true; // Async response

    case 'PING':
      sendResponse({ status: 'alive', pipelineRunning });
      return false;

    default:
      return false;
  }
});

// ──────────────────────────────────────────────
// Keyboard Shortcut Handler
// ──────────────────────────────────────────────
chrome.commands.onCommand.addListener((command) => {
  if (command === 'activate-veilex') {
    console.log('[Veilex] Activated via keyboard shortcut.');
    // For now, run with a default prompt.
    // In Phase 2, we'll show an inline prompt overlay on the page.
    runPipeline('Help me with this page');
  }
});

// ──────────────────────────────────────────────
// Extension Install / Update
// ──────────────────────────────────────────────
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[Veilex] Extension installed/updated:', details.reason);

  // Set default settings
  chrome.storage.local.set({
    serverUrl: 'http://localhost:8000',
    sensitivity: 'balanced',
  });
});

console.log('[Veilex] Service worker loaded.');
