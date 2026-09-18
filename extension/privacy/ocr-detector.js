/**
 * Veilex — OCR Detector (Phase 3)
 * 
 * Uses Tesseract.js (loaded locally) to extract text from images/screenshots.
 * The extracted text is then passed to the regex-detector to flag PII inside images.
 */

import { detectRegex } from './regex-detector.js';

let worker = null;
let isInitializing = false;

/**
 * Lazily initializes the Tesseract worker.
 * We load the scripts from the local `lib/tesseract` directory to comply with CSP.
 */
export async function initOCR() {
  if (worker || isInitializing) return;
  isInitializing = true;
  
  try {
    console.log('[OCR] Initializing Tesseract worker...');
    // Tesseract is exposed globally by offscreen-worker.html `<script>`
    worker = await Tesseract.createWorker('eng', 1, {
      workerPath: '../lib/tesseract/worker.min.js',
      corePath: '../lib/tesseract/tesseract-core.wasm.js',
      langPath: '../lib/tesseract',
      logger: m => console.log('[OCR Worker]', m.status, m.progress)
    });
    
    console.log('[OCR] Worker initialized successfully.');
  } catch (error) {
    console.error('[OCR] Failed to initialize Tesseract:', error);
    worker = null;
  } finally {
    isInitializing = false;
  }
}

/**
 * Runs OCR on the provided screenshot and scans for PII in the resulting text.
 * 
 * @param {string} screenshotDataUrl - Base64 PNG
 * @returns {Array} List of detections { type, bbox, confidence, detector: 'ocr' }
 */
export async function detectOCRText(screenshotDataUrl) {
  const detections = [];
  
  if (!worker) {
    console.warn('[OCR] Worker not initialized. Skipping OCR detection.');
    return detections;
  }

  try {
    console.log('[OCR] Running OCR on screenshot...');
    // Run OCR. We can get word-level bounding boxes.
    const { data } = await worker.recognize(screenshotDataUrl);
    
    // Extract text blocks for regex detection
    const textBlocks = data.words.map(w => ({
      text: w.text,
      bbox: {
        x: w.bbox.x0,
        y: w.bbox.y0,
        width: w.bbox.x1 - w.bbox.x0,
        height: w.bbox.y1 - w.bbox.y0
      }
    }));
    
    // Scan the extracted text blocks for PII using the regex detector
    const regexDetections = detectRegex(textBlocks, 'balanced');
    
    // Map the detections to show they came from OCR
    for (const det of regexDetections) {
      detections.push({
        ...det,
        detector: 'ocr'
      });
    }

    console.log(`[OCR] Found ${detections.length} PII items inside the image.`);
  } catch (error) {
    console.error('[OCR] Recognition error:', error);
  }

  return detections;
}
