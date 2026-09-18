/**
 * Veilex — Vision Model (Tier 3)
 * 
 * Uses MobileNet-v2 via ONNX Runtime Web to classify document types
 * in screenshots, specifically looking for sensitive documents like
 * ID cards, medical forms, or financial statements.
 */

import { PII_TYPES } from './pii-types.js';

let session = null;
let isInitializing = false;

// We map some ImageNet classes that might represent a sensitive document/card
const SENSITIVE_IMAGENET_CLASSES = new Set([
  'envelope', 'menu', 'web site, website, internet site, site', 
  'book jacket, dust cover, dust jacket, dust wrapper',
  'comic book', 'crossword puzzle, crossword', 'jigsaw puzzle',
  'passport', 'id card', 'driver license', // MobileNetv2 might not have exact ID card classes, but we can look for generic documents
  'binder, ring-binder',
  'notebook, notepad'
]);

/**
 * Initializes the ONNX Runtime session with MobileNet-v2.
 */
export async function initVisionModel() {
  if (session || isInitializing) return;
  isInitializing = true;
  
  try {
    console.log('[VisionModel] Loading MobileNet-v2 model...');
    ort.env.wasm.wasmPaths = '../lib/';
    session = await ort.InferenceSession.create('../models/mobilenetv2.onnx');
    console.log('[VisionModel] MobileNet-v2 loaded successfully.');
  } catch (error) {
    console.error('[VisionModel] Failed to load model:', error);
  } finally {
    isInitializing = false;
  }
}

/**
 * Preprocesses the image for MobileNet-v2 (224x224, normalized).
 */
function preprocessImage(img) {
  const canvas = document.createElement('canvas');
  canvas.width = 224;
  canvas.height = 224;
  const ctx = canvas.getContext('2d');
  
  // Draw and resize
  ctx.drawImage(img, 0, 0, 224, 224);
  const imageData = ctx.getImageData(0, 0, 224, 224).data;
  
  const float32Data = new Float32Array(3 * 224 * 224);
  
  // Normalize with ImageNet mean and std
  const mean = [0.485, 0.456, 0.406];
  const std = [0.229, 0.224, 0.225];
  
  for (let i = 0; i < 224 * 224; i++) {
    const r = imageData[i * 4 + 0] / 255.0;
    const g = imageData[i * 4 + 1] / 255.0;
    const b = imageData[i * 4 + 2] / 255.0;
    
    // NCHW format
    float32Data[i] = (r - mean[0]) / std[0];
    float32Data[224 * 224 + i] = (g - mean[1]) / std[1];
    float32Data[2 * 224 * 224 + i] = (b - mean[2]) / std[2];
  }
  
  return new ort.Tensor('float32', float32Data, [1, 3, 224, 224]);
}

/**
 * Runs MobileNet classification on the screenshot.
 * @param {string} screenshotDataUrl 
 * @returns {Array} List of detections if sensitive document is found
 */
export async function detectDocumentType(screenshotDataUrl) {
  const detections = [];
  if (!session) return detections;

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = async () => {
      try {
        const tensor = preprocessImage(img);
        
        // MobileNetv2 input name varies, but typically 'input' or 'data'
        const feeds = {};
        feeds[session.inputNames[0]] = tensor;
        
        const results = await session.run(feeds);
        const output = results[session.outputNames[0]].data;
        
        // Find top class
        let maxIndex = 0;
        let maxValue = -Infinity;
        for (let i = 0; i < output.length; i++) {
          if (output[i] > maxValue) {
            maxValue = output[i];
            maxIndex = i;
          }
        }
        
        // Softmax
        const expSum = output.reduce((a, b) => a + Math.exp(b), 0);
        const confidence = Math.exp(maxValue) / expSum;

        console.log(`[VisionModel] Top class ID: ${maxIndex}, Confidence: ${confidence}`);

        // We use a high confidence threshold for document type to avoid redacting random pages
        if (confidence > 0.8) {
          detections.push({
            type: PII_TYPES.DOCUMENT,
            confidence: confidence,
            detector: 'mobilenet',
            class_id: maxIndex,
            bbox: {
              x: 0,
              y: 0,
              width: img.width,
              height: img.height
            }
          });
        }
        
        resolve(detections);
      } catch (error) {
        console.error('[VisionModel] Inference error:', error);
        resolve(detections);
      }
    };
    img.src = screenshotDataUrl;
  });
}
