/**
 * Veilex — Content Script
 * 
 * Injected into all web pages. Dual purpose:
 * 
 * A. DOM Extraction (EXTRACT_DOM)
 *    - Walks the DOM tree and builds a structural snapshot
 *    - Extracts interactive elements (inputs, buttons, selects, textareas)
 *    - Computes bounding boxes via getBoundingClientRect()
 *    - Extracts visible text blocks with positions
 *    - NEVER reads actual password values
 * 
 * B. Action Execution (EXECUTE_ACTION)
 *    - Receives validated action commands from the service worker
 *    - Executes: click, type, scroll, select, navigate, wait, read, highlight
 *    - Shows visual overlay during execution
 *    - Reports success/failure
 */

// ──────────────────────────────────────────────
// A. DOM EXTRACTION
// ──────────────────────────────────────────────

function extractDOMSnapshot() {
  const snapshot = {
    url: window.location.origin, // Domain only — no path/query to avoid session token leakage
    title: document.title,
    elements: [],
    landmarks: [],
    visible_text_blocks: [],
  };

  // Extract interactive elements
  const interactiveSelectors = 'input, textarea, select, button, [role="button"], a[href]';
  const interactiveElements = document.querySelectorAll(interactiveSelectors);

  interactiveElements.forEach((el) => {
    const rect = el.getBoundingClientRect();
    
    // Skip invisible elements
    if (rect.width === 0 || rect.height === 0) return;
    if (window.getComputedStyle(el).visibility === 'hidden') return;
    if (window.getComputedStyle(el).display === 'none') return;

    const elementData = {
      tag: el.tagName.toLowerCase(),
      type: el.type || null,
      id: el.id || null,
      name: el.name || null,
      placeholder: el.placeholder || null,
      autocomplete: el.autocomplete || null,
      'aria-label': el.getAttribute('aria-label') || null,
      text: getElementText(el),
      bbox: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        w: Math.round(rect.width),
        h: Math.round(rect.height),
      },
      visible: isElementInViewport(rect),
    };

    // Find associated label
    if (el.id) {
      const label = document.querySelector(`label[for="${el.id}"]`);
      if (label) elementData.label = label.textContent.trim();
    }

    // For inputs, include value metadata (NOT the actual password value)
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      if (el.type === 'password') {
        elementData.value_length = el.value.length;
        // NEVER include actual password value
      } else {
        elementData.value = el.value || '';
      }
    }

    // For selects, include options
    if (el.tagName === 'SELECT') {
      elementData.options = Array.from(el.options).map((opt) => ({
        value: opt.value,
        text: opt.text,
        selected: opt.selected,
      }));
    }

    snapshot.elements.push(elementData);
  });

  // Extract landmarks
  const landmarkSelectors = 'nav, main, header, footer, aside, [role="navigation"], [role="main"], [role="banner"], [role="contentinfo"]';
  document.querySelectorAll(landmarkSelectors).forEach((el) => {
    snapshot.landmarks.push(el.tagName.toLowerCase());
  });

  // Extract visible text blocks (for PII scanning)
  extractVisibleTextBlocks(document.body, snapshot.visible_text_blocks);

  return snapshot;
}

function getElementText(el) {
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return '';
  const text = (el.textContent || el.innerText || '').trim();
  return text.length > 200 ? text.slice(0, 200) + '…' : text;
}

function isElementInViewport(rect) {
  return (
    rect.top < window.innerHeight &&
    rect.bottom > 0 &&
    rect.left < window.innerWidth &&
    rect.right > 0
  );
}

function extractVisibleTextBlocks(root, blocks, maxBlocks = 50) {
  if (blocks.length >= maxBlocks) return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const text = node.textContent.trim();
      if (!text || text.length < 3) return NodeFilter.FILTER_REJECT;

      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;

      const tag = parent.tagName;
      if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'META'].includes(tag)) {
        return NodeFilter.FILTER_REJECT;
      }

      const style = window.getComputedStyle(parent);
      if (style.display === 'none' || style.visibility === 'hidden') {
        return NodeFilter.FILTER_REJECT;
      }

      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let node;
  while ((node = walker.nextNode()) && blocks.length < maxBlocks) {
    const text = node.textContent.trim();
    if (text.length < 5) continue;

    const range = document.createRange();
    range.selectNodeContents(node);
    const rect = range.getBoundingClientRect();

    if (rect.width === 0 || rect.height === 0) continue;
    if (!isElementInViewport(rect)) continue;

    blocks.push({
      text: text.length > 300 ? text.slice(0, 300) + '…' : text,
      bbox: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        w: Math.round(rect.width),
        h: Math.round(rect.height),
      },
      parentTag: node.parentElement?.tagName?.toLowerCase() || null,
    });
  }
}

// ──────────────────────────────────────────────
// B. ACTION EXECUTION
// ──────────────────────────────────────────────

// Visual overlay for showing which element is being acted on
function showActionOverlay(element, actionType) {
  // Remove any existing overlay
  removeActionOverlay();

  const rect = element.getBoundingClientRect();
  const overlay = document.createElement('div');
  overlay.id = 'veilex-action-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: ${rect.top - 4}px;
    left: ${rect.left - 4}px;
    width: ${rect.width + 8}px;
    height: ${rect.height + 8}px;
    border: 2px solid #818cf8;
    border-radius: 6px;
    background: rgba(129, 140, 248, 0.08);
    box-shadow: 0 0 0 4px rgba(129, 140, 248, 0.15), 0 0 20px rgba(129, 140, 248, 0.2);
    pointer-events: none;
    z-index: 2147483647;
    transition: all 0.2s ease;
    animation: veilex-pulse 1s ease-in-out;
  `;

  // Action label
  const label = document.createElement('div');
  label.style.cssText = `
    position: absolute;
    top: -24px;
    left: 0;
    background: #818cf8;
    color: white;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 10px;
    font-family: Inter, sans-serif;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    white-space: nowrap;
  `;
  label.textContent = `Veilex: ${actionType}`;
  overlay.appendChild(label);

  // Inject animation keyframes if not already present
  if (!document.getElementById('veilex-styles')) {
    const style = document.createElement('style');
    style.id = 'veilex-styles';
    style.textContent = `
      @keyframes veilex-pulse {
        0% { box-shadow: 0 0 0 0px rgba(129, 140, 248, 0.4); }
        50% { box-shadow: 0 0 0 8px rgba(129, 140, 248, 0); }
        100% { box-shadow: 0 0 0 4px rgba(129, 140, 248, 0.15), 0 0 20px rgba(129, 140, 248, 0.2); }
      }
    `;
    document.head.appendChild(style);
  }

  document.body.appendChild(overlay);

  // Auto-remove after 2 seconds
  setTimeout(removeActionOverlay, 2000);
}

function removeActionOverlay() {
  const existing = document.getElementById('veilex-action-overlay');
  if (existing) existing.remove();
}

// Action executors
const ACTION_HANDLERS = {
  async click(action) {
    const el = document.querySelector(action.selector);
    if (!el) throw new Error(`Element not found: ${action.selector}`);
    showActionOverlay(el, 'click');
    await sleep(300); // Brief pause so user sees the highlight
    el.click();
    return { success: true };
  },

  async type(action) {
    const el = document.querySelector(action.selector);
    if (!el) throw new Error(`Element not found: ${action.selector}`);
    showActionOverlay(el, 'type');

    el.focus();
    el.value = '';
    
    // Type character by character for realistic event dispatch
    for (const char of action.value || '') {
      el.value += char;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(30 + Math.random() * 20); // Realistic typing speed
    }
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return { success: true };
  },

  async scroll(action) {
    const amount = action.amount || 400;
    const direction = action.direction === 'up' ? -1 : 1;
    window.scrollBy({
      top: amount * direction,
      behavior: 'smooth',
    });
    return { success: true };
  },

  async select(action) {
    const el = document.querySelector(action.selector);
    if (!el || el.tagName !== 'SELECT') throw new Error(`Select element not found: ${action.selector}`);
    showActionOverlay(el, 'select');
    el.value = action.value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return { success: true };
  },

  async navigate(action) {
    const url = action.value || action.url;
    if (!url) throw new Error('No URL provided for navigate action.');
    // Basic URL safety check
    try {
      const parsed = new URL(url, window.location.origin);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('Blocked navigation to non-HTTP URL.');
      }
    } catch (e) {
      throw new Error(`Invalid URL: ${url}`);
    }
    window.location.href = url;
    return { success: true };
  },

  async wait(action) {
    const ms = Math.min(action.amount || 1000, 10000); // Max 10 seconds
    await sleep(ms);
    return { success: true };
  },

  async read(action) {
    // Re-capture the current screen state (triggers a new pipeline cycle)
    // This is handled by the service worker — we just signal completion
    return { success: true, needsRecapture: true };
  },

  async highlight(action) {
    const el = document.querySelector(action.selector);
    if (!el) throw new Error(`Element not found: ${action.selector}`);
    showActionOverlay(el, 'highlight');
    // Scroll element into view
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return { success: true };
  },
};

async function executeAction(action) {
  const handler = ACTION_HANDLERS[action.type];
  if (!handler) {
    throw new Error(`Unknown action type: ${action.type}`);
  }
  return await handler(action);
}

// ──────────────────────────────────────────────
// Utility
// ──────────────────────────────────────────────
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ──────────────────────────────────────────────
// Message Listener
// ──────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'EXTRACT_DOM':
      try {
        const snapshot = extractDOMSnapshot();
        sendResponse(snapshot);
      } catch (e) {
        console.error('[Veilex Content] DOM extraction error:', e);
        sendResponse({ error: e.message });
      }
      return false;

    case 'EXECUTE_ACTION':
      executeAction(message.payload)
        .then((result) => sendResponse(result))
        .catch((e) => sendResponse({ success: false, error: e.message }));
      return true; // Async response

    case 'PING':
      sendResponse({ status: 'content-alive' });
      return false;

    default:
      return false;
  }
});

console.log('[Veilex] Content script loaded on:', window.location.origin);
