/**
 * Veilex — Face Detector (Tier 2)
 * 
 * Uses ONNX Runtime Web + BlazeFace model to detect human faces in screenshots.
 * Designed to run exclusively in the offscreen document via Web Workers.
 */

import { PII_TYPES } from './pii-types.js';

let session = null;
let isInitializing = false;
let anchors = [];

// Standard BlazeFace Anchor generation (128x128)
function generateAnchors() {
  const anchorsList = [];
  const strides = [8, 16];
  const numLayers = 2;
  const aspectRatios = [1.0];
  for (let i = 0; i < numLayers; i++) {
    const stride = strides[i];
    const featureMapSize = Math.ceil(128 / stride);
    for (let y = 0; y < featureMapSize; y++) {
      for (let x = 0; x < featureMapSize; x++) {
        const cx = (x + 0.5) / featureMapSize;
        const cy = (y + 0.5) / featureMapSize;
        // Depending on layer, we have 2 or 6 anchors
        const numAnchors = (i === 0) ? 2 : 6;
        for (let a = 0; a < numAnchors; a++) {
          anchorsList.push([cx, cy, 1.0, 1.0]);
        }
      }
    }
  }
  return anchorsList;
}

/**
 * Initializes the ONNX Runtime session with the BlazeFace model.
 * Should be called once on offscreen document creation.
 */
export async function initFaceDetector() {
  if (session || isInitializing) return;
  isInitializing = true;
  
  try {
    console.log('[FaceDetector] Loading BlazeFace model...');
    ort.env.wasm.wasmPaths = '../lib/';
    session = await ort.InferenceSession.create('../models/blazeface.onnx');
    anchors = generateAnchors();
    console.log('[FaceDetector] Model loaded. Anchors generated:', anchors.length);
  } catch (error) {
    console.error('[FaceDetector] Failed to load model:', error);
  } finally {
    isInitializing = false;
  }
}

/**
 * Runs inference on the provided screenshot to detect faces.
 * 
 * @param {string} dataUrl - The screenshot image dataUrl
 * @returns {Array} List of detections { type: 'FACE', bbox, confidence, detector: 'blazeface' }
 */
export async function detectFaces(dataUrl) {
  const detections = [];
  
  if (!session) {
    console.warn('[FaceDetector] Model not loaded, skipping detection.');
    return detections;
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = async () => {
      // 1. Pre-process
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, 128, 128);
      const imgData = ctx.getImageData(0, 0, 128, 128);
      
      const floatData = new Float32Array(128 * 128 * 3);
      for (let i = 0; i < 128 * 128; i++) {
        floatData[i * 3 + 0] = (imgData.data[i * 4 + 0] / 127.5) - 1.0;
        floatData[i * 3 + 1] = (imgData.data[i * 4 + 1] / 127.5) - 1.0;
        floatData[i * 3 + 2] = (imgData.data[i * 4 + 2] / 127.5) - 1.0;
      }
      
      const tensor = new ort.Tensor('float32', floatData, [1, 128, 128, 3]);

      try {
        // 2. Run Inference
        const results = await session.run({ input: tensor });
        
        // Use correct output names if known, else assume order: [regressors, classificators]
        const outputNames = session.outputNames;
        const regressors = results[outputNames[0]].data; 
        const classificators = results[outputNames[1]].data; 
        
        const boxes = [];
        const scaleX = img.width;
        const scaleY = img.height;

        // 3. Decode boxes
        for (let i = 0; i < anchors.length; i++) {
          let score = classificators[i];
          // Apply sigmoid if not already applied
          if (score < 0 || score > 1) {
             score = 1 / (1 + Math.exp(-score));
          }
          
          if (score > 0.65) { // Threshold tuned for max recall (Phase 5)
            const [cx, cy] = anchors[i];
            
            // Box offsets
            const dx = regressors[i * 16 + 0] / 128.0;
            const dy = regressors[i * 16 + 1] / 128.0;
            const dw = regressors[i * 16 + 2] / 128.0;
            const dh = regressors[i * 16 + 3] / 128.0;
            
            const center_x = cx + dx;
            const center_y = cy + dy;
            
            const x = center_x - dw / 2;
            const y = center_y - dh / 2;
            
            boxes.push({
              type: PII_TYPES.FACE,
              confidence: score,
              detector: 'blazeface',
              bbox: {
                x: Math.max(0, x * scaleX),
                y: Math.max(0, y * scaleY),
                width: dw * scaleX,
                height: dh * scaleY
              }
            });
          }
        }
        
        // Simple NMS (Non-Maximum Suppression)
        boxes.sort((a, b) => b.confidence - a.confidence);
        for (let i = 0; i < boxes.length; i++) {
          if (!boxes[i]) continue;
          detections.push(boxes[i]);
          for (let j = i + 1; j < boxes.length; j++) {
            if (!boxes[j]) continue;
            // check overlap
            const b1 = boxes[i].bbox;
            const b2 = boxes[j].bbox;
            const intersect = Math.max(0, Math.min(b1.x + b1.width, b2.x + b2.width) - Math.max(b1.x, b2.x)) *
                              Math.max(0, Math.min(b1.y + b1.height, b2.y + b2.height) - Math.max(b1.y, b2.y));
            const union = (b1.width * b1.height) + (b2.width * b2.height) - intersect;
            const iou = intersect / union;
            if (iou > 0.3) {
              boxes[j] = null; // suppress
            }
          }
        }
        
        resolve(detections);
      } catch (err) {
        console.error('[FaceDetector] Inference error:', err);
        resolve(detections);
      }
    };
    img.src = dataUrl;
  });
}
