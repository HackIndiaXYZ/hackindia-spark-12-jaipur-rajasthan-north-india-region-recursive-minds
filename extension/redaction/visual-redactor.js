/**
 * Veilex — Visual Redactor Module
 * 
 * Applies visual redaction (blur, blackout, mosaic) to a screenshot
 * based on provided PII bounding boxes. Designed to run in the offscreen document.
 */

/**
 * Loads a base64 image into an HTMLImageElement.
 */
function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

/**
 * Redacts a screenshot based on detections and returns a new JPEG data URL.
 * 
 * @param {HTMLCanvasElement} canvas - The offscreen canvas element
 * @param {string} screenshotDataUrl - The original screenshot (base64)
 * @param {Array} detections - List of detected PII regions
 * @returns {Promise<string>} Base64 data URL (JPEG) of the redacted screenshot
 */
export async function redactScreenshot(canvas, screenshotDataUrl, detections) {
  const ctx = canvas.getContext('2d');
  
  try {
    const img = await loadImage(screenshotDataUrl);
    canvas.width = img.width;
    canvas.height = img.height;
    
    // Draw original
    ctx.drawImage(img, 0, 0);

    // TODO: Phase 2 — Implement visual redaction logic
    // Apply blur for faces, black boxes for text, etc.

    // Export as optimized JPEG
    return canvas.toDataURL('image/jpeg', 0.80);
  } catch (error) {
    console.error('[Visual Redactor] Redaction failed:', error);
    throw error;
  }
}
