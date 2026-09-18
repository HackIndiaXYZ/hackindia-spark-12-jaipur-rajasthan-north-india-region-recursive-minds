/**
 * Veilex — Offscreen Worker
 * 
 * Runs in Chrome's offscreen document context.
 * Responsibilities:
 *   1. Load and run ML models (BlazeFace, MobileNet) via ONNX Runtime Web
 *   2. Perform canvas-based visual redaction (blur, black, mosaic)
 *   3. Return sanitized screenshot + detection results to service worker
 */
import { initFaceDetector, detectFaces } from '../privacy/face-detector.js';
import { initOCR, detectOCRText } from '../privacy/ocr-detector.js';
import { detectDOM } from '../privacy/dom-detector.js';
import { detectRegex } from '../privacy/regex-detector.js';
import { redactScreenshot as applyVisualRedaction } from '../redaction/visual-redactor.js';
import { redactDOM } from '../redaction/dom-redactor.js';
import { generateManifest } from '../redaction/manifest-generator.js';
import { detectHardwareTier, TIERS } from '../core/hardware-profiler.js';
import { initVisionModel, detectDocumentType } from '../privacy/vision-model.js';

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
// ML Model Loading
// ──────────────────────────────────────────────
let currentTier = TIERS.TIER_1;

async function loadModels() {
  console.log('[Offscreen] Detecting hardware tier...');
  currentTier = detectHardwareTier();
  
  console.log(`[Offscreen] Loading ML models for Tier ${currentTier}...`);
  const loadPromises = [];

  if (currentTier >= TIERS.TIER_2) {
    loadPromises.push(initFaceDetector());
    loadPromises.push(initOCR());
  }
  
  if (currentTier >= TIERS.TIER_3) {
    loadPromises.push(initVisionModel());
  }

  await Promise.all(loadPromises);
  console.log('[Offscreen] ML models loaded successfully.');
  return true;
}

// ──────────────────────────────────────────────
// PII Detection (Tier 1 & Tier 2/3)
// ──────────────────────────────────────────────
async function runMLDetection(screenshotDataUrl, domSnapshot) {
  console.log('[Offscreen] Running PII detection...');

  const detections = [];
  
  // 1. Tier 1: DOM Heuristics (Runs on all tiers)
  const domDetections = detectDOM(domSnapshot, 'balanced');
  detections.push(...domDetections);

  const regexDetections = detectRegex(domSnapshot.visible_text_blocks || [], 'balanced');
  detections.push(...regexDetections);

  // 2. Tier 2: BlazeFace and OCR
  if (currentTier >= TIERS.TIER_2) {
    const faceDetections = await detectFaces(screenshotDataUrl);
    detections.push(...faceDetections);

    const ocrDetections = await detectOCRText(screenshotDataUrl);
    detections.push(...ocrDetections);
  }

  // 3. Tier 3: MobileNet-v2 Document Classification
  if (currentTier >= TIERS.TIER_3) {
    const docDetections = await detectDocumentType(screenshotDataUrl);
    detections.push(...docDetections);
  }
  
  return {
    detections,
  };
}

// ──────────────────────────────────────────────
// Redaction Pipeline
// ──────────────────────────────────────────────
async function runRedaction(screenshotDataUrl, detections, domSnapshot) {
  console.log('[Offscreen] Running redaction pipeline...');

  // Visual redaction via dedicated module
  const t0 = performance.now();
  const sanitizedDataUrl = await applyVisualRedaction(canvas, screenshotDataUrl, detections);

  // DOM redaction
  const sanitizedDOM = redactDOM(domSnapshot, detections);
  const processingTimeMs = Math.round(performance.now() - t0);

  // Build manifest via dedicated module
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
