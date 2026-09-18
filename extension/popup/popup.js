/**
 * Veilex Popup — Controller v2
 * 
 * Handles UI state, message passing with service worker,
 * settings persistence, live pipeline status updates,
 * server health checks, session history, toast notifications,
 * and screenshot preview toggling.
 */

// ──────────────────────────────────────────────
// DOM References
// ──────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const DOM = {
  // Prompt
  promptInput: $('#prompt-input'),
  btnGo: $('#btn-go'),

  // Status
  statusBar: $('#status-bar'),
  statusSteps: $$('.status-step'),
  statusConnectors: $$('.status-connector'),

  // Server health
  serverDot: $('#server-dot'),
  serverLabel: $('#server-label'),

  // Panels
  privacyLog: $('#privacy-log'),
  privacyCount: $('#privacy-count'),
  metricsBody: $('#metrics-body'),
  totalLatency: $('#total-latency'),
  actionLog: $('#action-log'),

  // Preview
  previewPanel: $('#preview-panel'),
  previewToggle: $('#preview-toggle'),
  previewBody: $('#preview-body'),
  previewImg: $('#preview-img'),
  previewTabs: $('#preview-tabs'),

  // Settings
  btnSettings: $('#btn-settings'),
  settingsOverlay: $('#settings-overlay'),
  btnCloseSettings: $('#btn-close-settings'),
  btnSaveSettings: $('#btn-save-settings'),
  settingServerUrl: $('#setting-server-url'),
  settingSensitivity: $('#setting-sensitivity'),
  settingAutoExecute: $('#setting-auto-execute'),
  hwTierBadge: $('#hw-tier-badge'),
  hwTierDetail: $('#hw-tier-detail'),
  footerHwTier: $('#footer-hw-tier'),

  // History
  btnHistory: $('#btn-history'),
  historyOverlay: $('#history-overlay'),
  btnCloseHistory: $('#btn-close-history'),
  historyList: $('#history-list'),

  // Toast
  toast: $('#toast'),
  toastIcon: $('#toast-icon'),
  toastText: $('#toast-text'),
};

// ──────────────────────────────────────────────
// State
// ──────────────────────────────────────────────
let isRunning = false;
let currentScreenshots = { original: null, redacted: null };
let toastTimeout = null;
const STEPS = ['capture', 'detect', 'redact', 'send', 'execute'];
const MAX_HISTORY = 20;

// ──────────────────────────────────────────────
// Toast Notifications
// ──────────────────────────────────────────────
function showToast(text, type = 'info', duration = 3000) {
  if (toastTimeout) clearTimeout(toastTimeout);

  const icons = { success: '✓', error: '✗', info: 'ℹ', warning: '⚠' };
  DOM.toast.className = `toast ${type}`;
  DOM.toastIcon.textContent = icons[type] || icons.info;
  DOM.toastText.textContent = text;
  DOM.toast.hidden = false;

  toastTimeout = setTimeout(() => {
    DOM.toast.style.animation = 'toast-out 0.25s ease-in forwards';
    setTimeout(() => {
      DOM.toast.hidden = true;
      DOM.toast.style.animation = '';
    }, 250);
  }, duration);
}

// ──────────────────────────────────────────────
// Server Health Check
// ──────────────────────────────────────────────
let healthCheckInterval = null;

async function checkServerHealth() {
  DOM.serverDot.className = 'server-dot checking';
  DOM.serverLabel.textContent = 'Checking';

  try {
    const settings = await chrome.storage.local.get(['serverUrl']);
    const serverUrl = settings.serverUrl || 'http://localhost:8000';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(`${serverUrl}/api/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (response.ok) {
      DOM.serverDot.className = 'server-dot online';
      DOM.serverLabel.textContent = 'Online';
    } else {
      DOM.serverDot.className = 'server-dot offline';
      DOM.serverLabel.textContent = `${response.status}`;
    }
  } catch (e) {
    DOM.serverDot.className = 'server-dot offline';
    DOM.serverLabel.textContent = 'Offline';
  }
}

function startHealthChecks() {
  checkServerHealth();
  // Re-check every 30 seconds
  healthCheckInterval = setInterval(checkServerHealth, 30000);
}

// ──────────────────────────────────────────────
// Settings Management
// ──────────────────────────────────────────────
async function loadSettings() {
  const defaults = {
    serverUrl: 'http://localhost:8000',
    sensitivity: 'balanced',
    autoExecute: true,
    hwTier: null,
  };

  try {
    const stored = await chrome.storage.local.get([
      'serverUrl', 'sensitivity', 'autoExecute', 'hwTier', 'hwDetail',
    ]);
    DOM.settingServerUrl.value = stored.serverUrl || defaults.serverUrl;
    DOM.settingSensitivity.value = stored.sensitivity || defaults.sensitivity;
    DOM.settingAutoExecute.checked = stored.autoExecute !== false; // default true

    if (stored.hwTier) {
      setHardwareTierDisplay(stored.hwTier, stored.hwDetail || '');
    }
  } catch (e) {
    console.warn('Failed to load settings:', e);
  }
}

async function saveSettings() {
  const serverUrl = DOM.settingServerUrl.value.trim();
  const sensitivity = DOM.settingSensitivity.value;
  const autoExecute = DOM.settingAutoExecute.checked;

  try {
    await chrome.storage.local.set({ serverUrl, sensitivity, autoExecute });
    DOM.settingsOverlay.hidden = true;
    showToast('Settings saved', 'success');
    // Re-check server with new URL
    checkServerHealth();
  } catch (e) {
    console.error('Failed to save settings:', e);
    showToast('Failed to save settings', 'error');
  }
}

function setHardwareTierDisplay(tier, detail) {
  DOM.hwTierBadge.textContent = tier.charAt(0).toUpperCase() + tier.slice(1);
  DOM.hwTierBadge.className = 'hw-tier-badge ' + tier;
  DOM.hwTierDetail.textContent = detail;
  DOM.footerHwTier.textContent = `Tier: ${tier}`;
}

// ──────────────────────────────────────────────
// Status Pipeline UI
// ──────────────────────────────────────────────
function resetStatus() {
  DOM.statusBar.classList.remove('active');
  DOM.statusSteps.forEach((step) => {
    step.classList.remove('active', 'done');
  });
  DOM.statusConnectors.forEach((conn) => {
    conn.classList.remove('done');
  });
}

function setActiveStep(stepName) {
  const stepIndex = STEPS.indexOf(stepName);
  if (stepIndex === -1) return;

  DOM.statusBar.classList.add('active');

  DOM.statusSteps.forEach((stepEl) => {
    const step = stepEl.dataset.step;
    const si = STEPS.indexOf(step);
    stepEl.classList.remove('active', 'done');
    if (si < stepIndex) {
      stepEl.classList.add('done');
    } else if (si === stepIndex) {
      stepEl.classList.add('active');
    }
  });

  const connectors = Array.from(DOM.statusConnectors);
  connectors.forEach((conn, i) => {
    conn.classList.toggle('done', i < stepIndex);
  });
}

function setAllDone() {
  DOM.statusBar.classList.remove('active');
  DOM.statusSteps.forEach((step) => {
    step.classList.remove('active');
    step.classList.add('done');
  });
  DOM.statusConnectors.forEach((conn) => {
    conn.classList.add('done');
  });
}

// ──────────────────────────────────────────────
// Screenshot Preview
// ──────────────────────────────────────────────
function showPreview(redactedDataUrl, originalDataUrl) {
  currentScreenshots.redacted = redactedDataUrl;
  currentScreenshots.original = originalDataUrl;

  if (redactedDataUrl) {
    DOM.previewImg.src = redactedDataUrl;
    DOM.previewPanel.hidden = false;
    // Set "Redacted" tab as active
    setPreviewTab('redacted');
  }
}

function setPreviewTab(view) {
  DOM.previewTabs.querySelectorAll('.preview-tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.view === view);
  });

  if (view === 'original' && currentScreenshots.original) {
    DOM.previewImg.src = currentScreenshots.original;
  } else if (currentScreenshots.redacted) {
    DOM.previewImg.src = currentScreenshots.redacted;
  }
}

// ──────────────────────────────────────────────
// Privacy Log UI
// ──────────────────────────────────────────────
const PII_DISPLAY = {
  FACE:        { label: 'Face',     css: 'face',     icon: '👤' },
  EMAIL:       { label: 'Email',    css: 'email',    icon: '✉️' },
  PHONE:       { label: 'Phone',    css: 'phone',    icon: '📱' },
  PASSWORD:    { label: 'Password', css: 'password', icon: '🔒' },
  CREDIT_CARD: { label: 'Card',     css: 'card',     icon: '💳' },
  SSN:         { label: 'SSN',      css: 'default',  icon: '🆔' },
  AADHAAR:     { label: 'Aadhaar',  css: 'default',  icon: '🆔' },
  PAN:         { label: 'PAN',      css: 'default',  icon: '🆔' },
  DOCUMENT:    { label: 'Document', css: 'document', icon: '📄' },
  IP_ADDRESS:  { label: 'IP',       css: 'default',  icon: '🌐' },
  DOB:         { label: 'DOB',      css: 'default',  icon: '📅' },
  NAME:        { label: 'Name',     css: 'default',  icon: '👤' },
  ADDRESS:     { label: 'Address',  css: 'default',  icon: '📍' },
  GENERIC_PII: { label: 'PII',      css: 'default',  icon: '⚠️' },
};

function renderPrivacyLog(summary) {
  if (!summary || Object.keys(summary).length === 0) {
    DOM.privacyLog.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">✅</span>
        <span class="empty-text">No PII detected on this page.</span>
      </div>
    `;
    DOM.privacyCount.textContent = '0';
    DOM.privacyCount.classList.remove('highlight');
    return;
  }

  const totalCount = Object.values(summary).reduce((a, b) => a + b, 0);
  DOM.privacyCount.textContent = totalCount.toString();
  DOM.privacyCount.classList.add('highlight');

  const items = Object.entries(summary)
    .sort(([, a], [, b]) => b - a)
    .map(([type, count]) => {
      const display = PII_DISPLAY[type] || PII_DISPLAY.GENERIC_PII;
      return `
        <div class="pii-item">
          <span class="pii-type-badge ${display.css}">${display.icon} ${display.label}</span>
          <span class="pii-detail">Redacted from view</span>
          <span class="pii-count">${count}</span>
        </div>
      `;
    })
    .join('');

  DOM.privacyLog.innerHTML = items;
}

// ──────────────────────────────────────────────
// Metrics UI
// ──────────────────────────────────────────────
function renderMetrics(timings) {
  if (!timings) return;

  const maxTime = Math.max(...Object.values(timings), 1);
  const total = Object.values(timings).reduce((a, b) => a + b, 0);

  STEPS.forEach((step) => {
    const ms = timings[step] || 0;
    const bar = document.querySelector(`.metric-bar[data-metric="${step}"]`);
    const val = document.querySelector(`.metric-value[data-metric-val="${step}"]`);
    if (bar) bar.style.width = `${Math.max((ms / maxTime) * 100, 2)}%`;
    if (val) val.textContent = ms > 0 ? `${ms}ms` : '—';
  });

  DOM.totalLatency.textContent = `${total}ms`;
  DOM.totalLatency.classList.add('highlight');
}

// ──────────────────────────────────────────────
// Action Log UI
// ──────────────────────────────────────────────
function renderActions(actions, explanation) {
  if (!actions || actions.length === 0) {
    DOM.actionLog.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">⚡</span>
        <span class="empty-text">No actions returned.</span>
      </div>
    `;
    return;
  }

  const items = actions.map((action) => `
    <div class="action-item">
      <span class="action-type">${action.type}</span>
      <span class="action-detail">${escapeHtml(action.selector || '')}${action.value ? ' → "' + escapeHtml(action.value) + '"' : ''}</span>
      <span class="action-status pending">⏳</span>
    </div>
  `).join('');

  let html = items;
  if (explanation) {
    html += `<div class="action-explanation">${escapeHtml(explanation)}</div>`;
  }

  DOM.actionLog.innerHTML = html;
}

function updateActionStatus(index, status) {
  const items = DOM.actionLog.querySelectorAll('.action-item');
  if (items[index]) {
    const statusEl = items[index].querySelector('.action-status');
    if (statusEl) {
      statusEl.className = `action-status ${status}`;
      statusEl.textContent = status === 'success' ? '✓' : status === 'error' ? '✗' : '⏳';
    }
  }
}

// ──────────────────────────────────────────────
// Session History
// ──────────────────────────────────────────────
async function loadHistory() {
  try {
    const data = await chrome.storage.local.get(['sessionHistory']);
    return data.sessionHistory || [];
  } catch {
    return [];
  }
}

async function saveToHistory(entry) {
  try {
    const history = await loadHistory();
    history.unshift(entry);
    // Keep only last N entries
    if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
    await chrome.storage.local.set({ sessionHistory: history });
  } catch (e) {
    console.warn('Failed to save history:', e);
  }
}

async function renderHistory() {
  const history = await loadHistory();

  if (history.length === 0) {
    DOM.historyList.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">📋</span>
        <span class="empty-text">No sessions yet.</span>
      </div>
    `;
    return;
  }

  const items = history.map((entry) => {
    const time = new Date(entry.timestamp);
    const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const piiCount = entry.totalPii || 0;
    const latency = entry.totalLatency || 0;

    return `
      <div class="history-item">
        <span class="history-time">${timeStr}</span>
        <span class="history-prompt">${escapeHtml(entry.prompt)}</span>
        <div class="history-stats">
          <span class="history-stat pii">${piiCount} PII</span>
          <span class="history-stat time">${latency}ms</span>
        </div>
      </div>
    `;
  }).join('');

  DOM.historyList.innerHTML = items;
}

// ──────────────────────────────────────────────
// Pipeline Trigger
// ──────────────────────────────────────────────
async function runAgent() {
  const prompt = DOM.promptInput.value.trim();
  if (!prompt || isRunning) return;

  isRunning = true;
  DOM.btnGo.disabled = true;
  DOM.btnGo.classList.add('loading');
  DOM.previewPanel.hidden = true;
  resetStatus();

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'RUN_PIPELINE',
      payload: { userPrompt: prompt },
    });

    if (response && response.error) {
      showToast(response.error, 'error');
      onPipelineComplete();
    }
  } catch (e) {
    console.error('Failed to send message to service worker:', e);
    showToast('Failed to start pipeline', 'error');
    onPipelineComplete();
  }
}

function onPipelineComplete() {
  isRunning = false;
  DOM.btnGo.disabled = false;
  DOM.btnGo.classList.remove('loading');
  setAllDone();
}

// ──────────────────────────────────────────────
// Message Listener — Receives updates from service worker
// ──────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'PIPELINE_STATUS':
      setActiveStep(message.step);
      break;

    case 'PIPELINE_COMPLETE': {
      onPipelineComplete();

      if (message.privacySummary) renderPrivacyLog(message.privacySummary);
      if (message.timings) renderMetrics(message.timings);
      if (message.actions) renderActions(message.actions, message.explanation);

      // Show screenshot preview if available
      if (message.redactedScreenshot) {
        showPreview(message.redactedScreenshot, message.originalScreenshot);
      }

      // Calculate totals for toast and history
      const totalPii = message.privacySummary
        ? Object.values(message.privacySummary).reduce((a, b) => a + b, 0)
        : 0;
      const totalLatency = message.timings
        ? Object.values(message.timings).reduce((a, b) => a + b, 0)
        : 0;

      showToast(
        `Done! ${totalPii} PII redacted · ${totalLatency}ms`,
        totalPii > 0 ? 'success' : 'info'
      );

      // Save to session history
      saveToHistory({
        timestamp: new Date().toISOString(),
        prompt: DOM.promptInput.value.trim(),
        totalPii,
        totalLatency,
        actionsCount: (message.actions || []).length,
      });

      break;
    }

    case 'PIPELINE_ERROR':
      onPipelineComplete();
      showToast(message.error || 'An error occurred', 'error');
      DOM.actionLog.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">❌</span>
          <span class="empty-text">${escapeHtml(message.error || 'An unexpected error occurred.')}</span>
        </div>
      `;
      break;

    case 'ACTION_STATUS':
      updateActionStatus(message.index, message.status);
      break;

    case 'HW_TIER_DETECTED':
      setHardwareTierDisplay(message.tier, message.detail);
      chrome.storage.local.set({ hwTier: message.tier, hwDetail: message.detail });
      break;
  }
});

// ──────────────────────────────────────────────
// Utility
// ──────────────────────────────────────────────
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ──────────────────────────────────────────────
// Event Bindings
// ──────────────────────────────────────────────

// Prompt
DOM.btnGo.addEventListener('click', runAgent);
DOM.promptInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') runAgent();
});

// Settings overlay
DOM.btnSettings.addEventListener('click', () => {
  DOM.settingsOverlay.hidden = false;
});
DOM.btnCloseSettings.addEventListener('click', () => {
  DOM.settingsOverlay.hidden = true;
});
DOM.btnSaveSettings.addEventListener('click', saveSettings);
DOM.settingsOverlay.addEventListener('click', (e) => {
  if (e.target === DOM.settingsOverlay) DOM.settingsOverlay.hidden = true;
});

// History overlay
DOM.btnHistory.addEventListener('click', () => {
  renderHistory();
  DOM.historyOverlay.hidden = false;
});
$('#btn-close-history').addEventListener('click', () => {
  DOM.historyOverlay.hidden = true;
});
DOM.historyOverlay.addEventListener('click', (e) => {
  if (e.target === DOM.historyOverlay) DOM.historyOverlay.hidden = true;
});

// Preview tabs
DOM.previewTabs.addEventListener('click', (e) => {
  const tab = e.target.closest('.preview-tab');
  if (tab) setPreviewTab(tab.dataset.view);
});

// Preview panel toggle (collapse/expand)
DOM.previewToggle.addEventListener('click', (e) => {
  // Don't toggle when clicking tabs
  if (e.target.closest('.preview-tabs')) return;
  DOM.previewPanel.classList.toggle('collapsed');
});

// ──────────────────────────────────────────────
// Initialization
// ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  startHealthChecks();
  DOM.promptInput.focus();
});
