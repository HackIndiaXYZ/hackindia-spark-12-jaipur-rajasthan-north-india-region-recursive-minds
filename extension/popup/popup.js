/**
 * Veilex Popup — Controller
 * Handles UI state, message passing with service worker,
 * settings persistence, and live pipeline status updates.
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

  // Panels
  privacyLog: $('#privacy-log'),
  privacyCount: $('#privacy-count'),
  metricsBody: $('#metrics-body'),
  totalLatency: $('#total-latency'),
  actionLog: $('#action-log'),

  // Settings
  btnSettings: $('#btn-settings'),
  settingsOverlay: $('#settings-overlay'),
  btnCloseSettings: $('#btn-close-settings'),
  btnSaveSettings: $('#btn-save-settings'),
  settingServerUrl: $('#setting-server-url'),
  settingSensitivity: $('#setting-sensitivity'),
  hwTierBadge: $('#hw-tier-badge'),
  hwTierDetail: $('#hw-tier-detail'),
  footerHwTier: $('#footer-hw-tier'),
};

// ──────────────────────────────────────────────
// State
// ──────────────────────────────────────────────
let isRunning = false;
const STEPS = ['capture', 'detect', 'redact', 'send', 'execute'];

// ──────────────────────────────────────────────
// Settings Management
// ──────────────────────────────────────────────
async function loadSettings() {
  const defaults = {
    serverUrl: 'http://localhost:8000',
    sensitivity: 'balanced',
    hwTier: null,
  };

  try {
    const stored = await chrome.storage.local.get(['serverUrl', 'sensitivity', 'hwTier', 'hwDetail']);
    DOM.settingServerUrl.value = stored.serverUrl || defaults.serverUrl;
    DOM.settingSensitivity.value = stored.sensitivity || defaults.sensitivity;

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

  try {
    await chrome.storage.local.set({ serverUrl, sensitivity });
    DOM.settingsOverlay.hidden = true;
  } catch (e) {
    console.error('Failed to save settings:', e);
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

  DOM.statusSteps.forEach((stepEl, i) => {
    const step = stepEl.dataset.step;
    const si = STEPS.indexOf(step);
    stepEl.classList.remove('active', 'done');
    if (si < stepIndex) {
      stepEl.classList.add('done');
    } else if (si === stepIndex) {
      stepEl.classList.add('active');
    }
  });

  // Connectors: mark done up to the active step
  const connectors = Array.from(DOM.statusConnectors);
  connectors.forEach((conn, i) => {
    conn.classList.toggle('done', i < stepIndex);
  });
}

function setAllDone() {
  DOM.statusSteps.forEach((step) => {
    step.classList.remove('active');
    step.classList.add('done');
  });
  DOM.statusConnectors.forEach((conn) => {
    conn.classList.add('done');
  });
}

// ──────────────────────────────────────────────
// Privacy Log UI
// ──────────────────────────────────────────────
const PII_DISPLAY = {
  FACE: { label: 'Face', css: 'face', icon: '👤' },
  EMAIL: { label: 'Email', css: 'email', icon: '✉️' },
  PHONE: { label: 'Phone', css: 'phone', icon: '📱' },
  PASSWORD: { label: 'Password', css: 'password', icon: '🔒' },
  CREDIT_CARD: { label: 'Card', css: 'card', icon: '💳' },
  SSN: { label: 'SSN', css: 'default', icon: '🆔' },
  AADHAAR: { label: 'Aadhaar', css: 'default', icon: '🆔' },
  PAN: { label: 'PAN', css: 'default', icon: '🆔' },
  DOCUMENT: { label: 'Document', css: 'document', icon: '📄' },
  IP_ADDRESS: { label: 'IP', css: 'default', icon: '🌐' },
  DOB: { label: 'DOB', css: 'default', icon: '📅' },
  NAME: { label: 'Name', css: 'default', icon: '👤' },
  ADDRESS: { label: 'Address', css: 'default', icon: '📍' },
  GENERIC_PII: { label: 'PII', css: 'default', icon: '⚠️' },
};

function renderPrivacyLog(summary) {
  // summary: { FACE: 2, EMAIL: 3, PASSWORD: 1 }
  if (!summary || Object.keys(summary).length === 0) {
    DOM.privacyLog.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">✅</span>
        <span class="empty-text">No PII detected on this page.</span>
      </div>
    `;
    DOM.privacyCount.textContent = '0';
    return;
  }

  const totalCount = Object.values(summary).reduce((a, b) => a + b, 0);
  DOM.privacyCount.textContent = totalCount.toString();

  const items = Object.entries(summary)
    .sort(([, a], [, b]) => b - a)
    .map(([type, count]) => {
      const display = PII_DISPLAY[type] || PII_DISPLAY.GENERIC_PII;
      return `
        <div class="pii-item">
          <span class="pii-type-badge ${display.css}">${display.icon} ${display.label}</span>
          <span class="pii-detail">Redacted from page</span>
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
  // timings: { capture: 120, detect: 340, redact: 180, send: 1200, execute: 90 }
  if (!timings) return;

  const maxTime = Math.max(...Object.values(timings), 1);
  const total = Object.values(timings).reduce((a, b) => a + b, 0);

  STEPS.forEach((step) => {
    const ms = timings[step] || 0;
    const bar = document.querySelector(`.metric-bar[data-metric="${step}"]`);
    const val = document.querySelector(`.metric-value[data-metric-val="${step}"]`);
    if (bar) bar.style.width = `${(ms / maxTime) * 100}%`;
    if (val) val.textContent = ms > 0 ? `${ms}ms` : '—';
  });

  DOM.totalLatency.textContent = `${total}ms`;
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

  const items = actions.map((action, i) => `
    <div class="action-item">
      <span class="action-type">${action.type}</span>
      <span class="action-detail">${action.selector || ''}${action.value ? ' → "' + action.value + '"' : ''}</span>
      <span class="action-status pending">⏳</span>
    </div>
  `).join('');

  DOM.actionLog.innerHTML = items;

  if (explanation) {
    DOM.actionLog.insertAdjacentHTML('beforeend', `
      <div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--border-color); font-size: 10px; color: var(--text-muted); font-style: italic;">
        ${explanation}
      </div>
    `);
  }
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
// Pipeline Trigger
// ──────────────────────────────────────────────
async function runAgent() {
  const prompt = DOM.promptInput.value.trim();
  if (!prompt || isRunning) return;

  isRunning = true;
  DOM.btnGo.disabled = true;
  DOM.btnGo.classList.add('loading');
  resetStatus();

  try {
    // Send the prompt to the service worker to start the pipeline
    const response = await chrome.runtime.sendMessage({
      type: 'RUN_PIPELINE',
      payload: { userPrompt: prompt },
    });

    if (response && response.error) {
      console.error('Pipeline error:', response.error);
    }
  } catch (e) {
    console.error('Failed to send message to service worker:', e);
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
      // { step: 'detect' }
      setActiveStep(message.step);
      break;

    case 'PIPELINE_COMPLETE':
      // { privacySummary, timings, actions, explanation }
      onPipelineComplete();
      if (message.privacySummary) renderPrivacyLog(message.privacySummary);
      if (message.timings) renderMetrics(message.timings);
      if (message.actions) renderActions(message.actions, message.explanation);
      break;

    case 'PIPELINE_ERROR':
      // { error: 'Something went wrong' }
      onPipelineComplete();
      DOM.actionLog.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">❌</span>
          <span class="empty-text">${message.error || 'An unexpected error occurred.'}</span>
        </div>
      `;
      break;

    case 'ACTION_STATUS':
      // { index: 0, status: 'success' | 'error' }
      updateActionStatus(message.index, message.status);
      break;

    case 'HW_TIER_DETECTED':
      // { tier: 'mid', detail: '8 cores, 16GB, WebGPU' }
      setHardwareTierDisplay(message.tier, message.detail);
      chrome.storage.local.set({ hwTier: message.tier, hwDetail: message.detail });
      break;
  }
});

// ──────────────────────────────────────────────
// Event Bindings
// ──────────────────────────────────────────────
DOM.btnGo.addEventListener('click', runAgent);

DOM.promptInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') runAgent();
});

DOM.btnSettings.addEventListener('click', () => {
  DOM.settingsOverlay.hidden = false;
});

DOM.btnCloseSettings.addEventListener('click', () => {
  DOM.settingsOverlay.hidden = true;
});

DOM.btnSaveSettings.addEventListener('click', saveSettings);

// Close settings on backdrop click
DOM.settingsOverlay.addEventListener('click', (e) => {
  if (e.target === DOM.settingsOverlay) {
    DOM.settingsOverlay.hidden = true;
  }
});

// ──────────────────────────────────────────────
// Initialization
// ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  DOM.promptInput.focus();
});
