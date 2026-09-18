/**
 * Veilex — Offscreen Worker
 * 
 * Runs in Chrome's offscreen document context.
 * Responsibilities:
 *   1. Load and run ML models (BlazeFace, MobileNet) via ONNX Runtime Web
 *   2. Perform canvas-based visual redaction (blur, black, mosaic)
 *   3. Return sanitized screenshot + detection results to service worker
 * 
 * This is a Phase 1 scaffold — ML model loading and full redaction
 * will be implemented in Phases 2-3 by the Privacy and Redaction engineers.
 */

import { redactDOM } from '../redaction/dom-redactor.js';
import { generateManifest } from '../redaction/manifest-generator.js';

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
// Stub: PII Detection (Tier 2 & 3)
// Will be implemented by Privacy Engineer in Phase 2-3
// ──────────────────────────────────────────────
async function runMLDetection(screenshotDataUrl, domSnapshot) {
  console.log('[Offscreen] Running ML detection (stub)...');

  // TODO: Phase 2 — Load BlazeFace, run face detection
  // TODO: Phase 2 — Run OCR on image regions
  // TODO: Phase 3 — Run MobileNet document classification

  // For now, return empty detections.
  // Tier 1 (DOM + regex) detections are handled by the service worker / content script.
  return {
    detections: [],
  };
}

// ──────────────────────────────────────────────
// Stub: Redaction Pipeline
// Will be fully implemented by Redaction Engineer in Phase 2
// ──────────────────────────────────────────────
async function runRedactionPipeline(screenshotDataUrl, domSnapshot, detections) {
  console.log('[Offscreen] Running redaction pipeline...');

  const img = await loadImage(screenshotDataUrl);
  canvas.width = img.width;
  canvas.height = img.height;

  // Draw original screenshot
  ctx.drawImage(img, 0, 0);

  // TODO: Phase 2 — Apply redaction for each detection:
  // - Faces: ctx.filter = 'blur(20px)' + re-draw region
  // - Text PII: ctx.fillStyle = '#000'; ctx.fillRect(...)
  // - Documents: pixelation/mosaic

  // For now, apply stub redaction for any provided detections
  for (const detection of detections) {
    const { bbox, type } = detection;
    if (!bbox) continue;

    const padding = 0.12; // 12% safety margin
    const px = bbox.x - bbox.w * padding / 2;
    const py = bbox.y - bbox.h * padding / 2;
    const pw = bbox.w * (1 + padding);
    const ph = bbox.h * (1 + padding);

    if (type === 'FACE') {
      // Blur effect for faces
      ctx.save();
      ctx.filter = 'blur(20px)';
      ctx.drawImage(canvas, px, py, pw, ph, px, py, pw, ph);
      ctx.restore();
    } else {
      // Black rectangle for other PII
      ctx.fillStyle = '#000000';
      ctx.fillRect(px, py, pw, ph);

      // Overlay token label
      const token = detection.token || `[${type}]`;
      ctx.fillStyle = '#ffffff';
      ctx.font = '11px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(token, px + pw / 2, py + ph / 2);
    }
  }

  // Export as JPEG (quality 0.80)
  const sanitizedDataUrl = canvas.toDataURL('image/jpeg', 0.80);

  // Apply DOM redaction (Phase 3)
  const t0 = performance.now();
  const sanitizedDOM = redactDOM(domSnapshot, detections);
  const processingTimeMs = Math.round(performance.now() - t0);

  // Build manifest (Phase 3)
  const manifest = generateManifest(detections, processingTimeMs);

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
      runRedactionPipeline(message.payload.screenshot, message.payload.domSnapshot, message.payload.detections)
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
