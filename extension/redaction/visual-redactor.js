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

    for (const detection of detections) {
      const { bbox, type, token } = detection;
      if (!bbox) continue;

      // 12% safety margin around the detected area
      const padding = 0.12; 
      const px = bbox.x - (bbox.width * padding / 2);
      const py = bbox.y - (bbox.height * padding / 2);
      const pw = bbox.width * (1 + padding);
      const ph = bbox.height * (1 + padding);

      if (type === 'FACE') {
        // Blur effect for faces
        ctx.save();
        ctx.filter = 'blur(20px)';
        // Redraw that specific section with blur applied
        ctx.drawImage(canvas, px, py, pw, ph, px, py, pw, ph);
        ctx.restore();
      } else if (type === 'DOCUMENT') {
        // Mosaic/pixelation for documents
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        // Draw small
        const pixelScale = 0.05;
        const smallCanvas = document.createElement('canvas');
        smallCanvas.width = pw * pixelScale;
        smallCanvas.height = ph * pixelScale;
        smallCanvas.getContext('2d').drawImage(canvas, px, py, pw, ph, 0, 0, smallCanvas.width, smallCanvas.height);
        // Draw back scaled up
        ctx.drawImage(smallCanvas, 0, 0, smallCanvas.width, smallCanvas.height, px, py, pw, ph);
        ctx.restore();
      } else {
        // Black rectangle for structured text PII
        ctx.fillStyle = '#000000';
        ctx.fillRect(px, py, pw, ph);

        // Overlay text token
        const label = token || `[${type}]`;
        ctx.fillStyle = '#ffffff';
        // Auto-scale font size based on box height, max 14px
        const fontSize = Math.min(Math.max(ph * 0.5, 8), 14);
        ctx.font = `bold ${fontSize}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Only draw text if the box is wide enough
        if (pw > fontSize * 2) {
          ctx.fillText(label, px + (pw / 2), py + (ph / 2));
        }
      }
    }

    // Export as optimized JPEG (quality 0.80) to minimize payload size
    return canvas.toDataURL('image/jpeg', 0.80);
  } catch (error) {
    console.error('[Visual Redactor] Redaction failed:', error);
    throw error;
  }
}
