/**
 * Veilex — Offscreen Worker
 * 
 * Runs in Chrome's offscreen document context.
 * Responsibilities:
 *   1. Load and run ML models (BlazeFace, MobileNet) via ONNX Runtime Web
 *   2. Perform canvas-based visual redaction (blur, black, mosaic)
 *   3. Return sanitized screenshot + detection results to service worker
 */
import { detectDOM } from '../privacy/dom-detector.js';
import { detectRegex } from '../privacy/regex-detector.js';
import { redactScreenshot as applyVisualRedaction } from '../redaction/visual-redactor.js';
import { redactDOM } from '../redaction/dom-redactor.js';

// ──────────────────────────────────────────────
// Canvas Setup
// ──────────────────────────────────────────────
const canvas = document.getElementById('redaction-canvas');
const ctx = canvas.getContext('2d');

// ──────────────────────────────────────────────
// Utility — Load image from data URL
// ──────────────────────────────────────────────
function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

// ──────────────────────────────────────────────
// Stub: ML Model Loading
// Will be fully implemented by Privacy Engineer in Phase 3
// ──────────────────────────────────────────────
async function loadModels() {
  console.log('[Offscreen] Loading ML models (stub)...');
  // TODO: Phase 3 — Initialize ONNX Runtime, load BlazeFace and OCR
  return true;
}

// ──────────────────────────────────────────────
// PII Detection (Tier 1 & Tier 2/3)
// ──────────────────────────────────────────────
async function runMLDetection(screenshotDataUrl, domSnapshot) {
  console.log('[Offscreen] Running PII detection...');

  const detections = [];
  
  // 1. Tier 1: DOM Heuristics
  const domDetections = detectDOM(domSnapshot, 'balanced');
  detections.push(...domDetections);

  // 2. Tier 1: Regex text scanning
  const regexDetections = detectRegex(domSnapshot.visible_text_blocks, 'balanced');
  detections.push(...regexDetections);

  // 3. Tier 2: BlazeFace (Mocked for E2E Phase 1)
  console.log('[Offscreen] BlazeFace detection mocked.');
  
  return {
    detections,
  };
}

// ──────────────────────────────────────────────
// Visual Redaction
// ──────────────────────────────────────────────
async function runRedaction(screenshotDataUrl, detections, domSnapshot) {
  console.log('[Offscreen] Running visual and DOM redaction...');

  const sanitizedDataUrl = await applyVisualRedaction(canvas, screenshotDataUrl, detections);
  const sanitizedDOM = redactDOM(domSnapshot, detections);

  // Build manifest
  const manifest = {
    redactions: detections.map((d, i) => ({
      id: `r_${String(i + 1).padStart(3, '0')}`,
      type: d.type,
      bbox: d.bbox,
      confidence: d.confidence || 0.95,
      method: d.type === 'FACE' ? 'blur' : 'black',
      detector: d.detector || 'regex',
    })),
    tiers_executed: [1],
    processing_time_ms: 0,
    total_pii_found: detections.length,
    summary: detections.reduce((acc, d) => {
      acc[d.type] = (acc[d.type] || 0) + 1;
      return acc;
    }, {}),
  };

  return {
    sanitizedScreenshot: sanitizedDataUrl,
    sanitizedDOM,
    manifest,
  };
}

// ──────────────────────────────────────────────
// Message Listener — Receives tasks from service worker
// ──────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Only handle messages meant for this offscreen document
  if (message.target !== 'offscreen') return false;

  switch (message.type) {
    case 'LOAD_MODELS':
      loadModels()
        .then(() => sendResponse({ success: true }))
        .catch((e) => sendResponse({ error: e.message }));
      return true; // Async

    case 'RUN_DETECTION':
      runMLDetection(message.payload.screenshot, message.payload.domSnapshot)
        .then((result) => sendResponse(result))
        .catch((e) => sendResponse({ detections: [], error: e.message }));
      return true; // Async

    case 'RUN_REDACTION':
      runRedaction(message.payload.screenshot, message.payload.detections, message.payload.domSnapshot)
        .then((result) => sendResponse(result))
        .catch((e) => sendResponse({ error: e.message }));
      return true; // Async

    case 'PING':
      sendResponse({ status: 'offscreen-alive' });
      return false;

    default:
      return false;
  }
});

console.log('[Veilex Offscreen] Worker loaded and ready.');
