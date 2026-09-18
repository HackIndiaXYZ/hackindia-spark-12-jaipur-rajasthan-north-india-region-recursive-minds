/**
 * Veilex — Face Detector (Tier 2)
 * 
 * Uses ONNX Runtime Web + BlazeFace model to detect human faces in screenshots.
 * Designed to run exclusively in the offscreen document via Web Workers.
 */

import { PII_TYPES } from './pii-types.js';

let session = null;
let isInitializing = false;

/**
 * Initializes the ONNX Runtime session with the BlazeFace model.
 * Should be called once on offscreen document creation.
 */
export async function initFaceDetector() {
  if (session || isInitializing) return;
  isInitializing = true;
  
  try {
    console.log('[FaceDetector] Loading BlazeFace model... (stub)');
    // TODO: Phase 3 — Load BlazeFace ONNX model using ort.InferenceSession.create()
  } catch (error) {
    console.error('[FaceDetector] Failed to load model:', error);
  } finally {
    isInitializing = false;
  }
}

/**
 * Runs inference on the provided screenshot to detect faces.
 * 
 * @param {HTMLImageElement|ImageData} image - The screenshot
 * @returns {Array} List of detections { type: 'FACE', bbox, confidence, detector: 'blazeface' }
 */
export async function detectFaces(image) {
  const detections = [];
  
  if (!session) {
    console.warn('[FaceDetector] Model not loaded, skipping detection.');
    return detections;
  }
  
  // TODO: Phase 3 — Pre-process image, run inference, decode bounding boxes
  
  return detections;
}
